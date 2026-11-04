import assert from 'node:assert/strict'
import test from 'node:test'
import { listGraphSyncRecords, recoverInterruptedGraphSyncs, runTrackedGraphSync, withGraphSyncMetadata } from '../graphSyncHistory.js'

function fixture(status = '待发布') {
  const state = { graphs: new Map([['GRAPH-A', { id: 'GRAPH-A', status, data: 'original' }]]), records: [], locks: new Set(), released: 0, sequence: 0 }
  const query = async (sql, args = []) => {
    if (sql.startsWith('SELECT id FROM graph_sync_records')) return [state.records.filter((row) => row.status === '同步中' && !state.locks.has(row.lock_name)).map(({ id }) => ({ id }))]
    if (sql.startsWith('SELECT GET_LOCK')) {
      if (state.locks.has(args[0])) return [[{ acquired: 0 }]]
      state.locks.add(args[0]); return [[{ acquired: 1 }]]
    }
    if (sql.startsWith('SELECT RELEASE_LOCK')) { state.locks.delete(args[0]); return [[{}]] }
    if (sql.startsWith('SELECT status FROM graph_versions')) return [state.graphs.has(args[0]) ? [state.graphs.get(args[0])] : []]
    if (sql.startsWith('SELECT id FROM graph_versions')) return [state.graphs.has(args[0]) ? [{ id: args[0] }] : []]
    if (sql.startsWith('INSERT INTO graph_sync_records')) {
      const id = ++state.sequence
      state.records.push({ id, graph_id: args[0], lock_name: args[1], status: '同步中', started_at: '2026-10-15 10:00:00' })
      return [{ insertId: id }]
    }
    if (sql.startsWith("UPDATE graph_sync_records SET status='成功'")) {
      Object.assign(state.records.find((row) => row.id === args[4]), { status: '成功', result_graph_id: args[0], duration_ms: args[1], entity_count: args[2], relation_count: args[3], finished_at: '2026-10-15 10:00:01' })
      return [{}]
    }
    if (sql.startsWith("UPDATE graph_sync_records SET status='失败'")) {
      const recovery = sql.includes('IS_USED_LOCK')
      const row = state.records.find((item) => item.id === (recovery ? args[0] : args[2]))
      if (row?.status === '同步中' && (!recovery || !state.locks.has(row.lock_name))) Object.assign(row, { status: '失败', error_message: recovery ? '同步已中断，请重试' : args[1], duration_ms: recovery ? 1000 : args[0] })
      return [{}]
    }
    if (sql.startsWith('SELECT * FROM graph_sync_records')) return [state.records.filter((row) => row.graph_id === args[0] || row.result_graph_id === args[1]).sort((a, b) => b.id - a.id).slice(0, 100)]
    if (sql.startsWith('SELECT g.id AS owner_id')) return [args.map((id) => ({ owner_id: id, data_synced_at: '2026-10-15 10:00:01', ...state.records.filter((row) => row.graph_id === id || row.result_graph_id === id).sort((a, b) => b.id - a.id)[0] }))]
    throw new Error(`Unexpected query: ${sql}`)
  }
  const pool = { query, async getConnection() {
    let snapshot
    return {
      query,
      async beginTransaction() { snapshot = structuredClone({ graphs: state.graphs, records: state.records }) },
      async commit() { snapshot = null },
      async rollback() { state.graphs = snapshot.graphs; state.records = snapshot.records },
      release() { state.released++ },
    }
  } }
  return { state, pool }
}

test('a successful sync records its result and is visible on the graph', async () => {
  const { pool, state } = fixture()
  await runTrackedGraphSync(pool, 'GRAPH-A', async () => {
    assert.equal(state.records[0].status, '同步中')
    state.graphs.get('GRAPH-A').data = 'new'
    return { id: 'GRAPH-A', entities: 12, relations: 8 }
  })
  assert.equal(state.graphs.get('GRAPH-A').data, 'new')
  const [record] = await listGraphSyncRecords(pool, 'GRAPH-A')
  assert.equal(record.status, '成功')
  assert.equal(record.entities, 12)
  assert.equal(record.relations, 8)
  const [graph] = await withGraphSyncMetadata(pool, [{ id: 'GRAPH-A' }])
  assert.equal(graph.latestSync.id, record.id)
  assert.ok(graph.syncedAt)
  assert.equal(state.locks.size, 0)
})

test('failed data changes roll back while the error record survives and retry succeeds', async () => {
  const { pool, state } = fixture()
  await assert.rejects(runTrackedGraphSync(pool, 'GRAPH-A', async () => {
    state.graphs.get('GRAPH-A').data = 'partial'
    throw Object.assign(new Error('来源字段已失效'), { status: 409 })
  }), /来源字段已失效/)
  assert.equal(state.graphs.get('GRAPH-A').data, 'original')
  assert.equal((await listGraphSyncRecords(pool, 'GRAPH-A'))[0].errorMessage, '来源字段已失效')
  await runTrackedGraphSync(pool, 'GRAPH-A', async () => ({ id: 'GRAPH-A', entities: 3, relations: 2 }))
  assert.deepEqual((await listGraphSyncRecords(pool, 'GRAPH-A')).map((row) => row.status), ['成功', '失败'])
})

test('a concurrent submission is rejected without another run or failure record', async () => {
  const { pool, state } = fixture()
  let resume
  let entered
  const waiting = new Promise((resolve) => { resume = resolve })
  const active = new Promise((resolve) => { entered = resolve })
  const first = runTrackedGraphSync(pool, 'GRAPH-A', async () => {
    entered(); await waiting
    return { id: 'GRAPH-A', entities: 1, relations: 0 }
  })
  await active
  await assert.rejects(runTrackedGraphSync(pool, 'GRAPH-A', async () => assert.fail('must not run twice')), /请勿重复提交/)
  assert.equal(state.records.length, 1)
  assert.equal(state.records[0].status, '同步中')
  resume(); await first
  assert.equal(state.records[0].status, '成功')
})

test('published graph history links to the generated version without changing the original', async () => {
  const { pool, state } = fixture('已发布')
  await runTrackedGraphSync(pool, 'GRAPH-A', async () => {
    state.graphs.set('GRAPH-B', { id: 'GRAPH-B', status: '待发布', data: 'new' })
    return { id: 'GRAPH-B', entities: 4, relations: 3 }
  })
  assert.equal(state.graphs.get('GRAPH-A').data, 'original')
  assert.equal(state.graphs.get('GRAPH-A').status, '已发布')
  assert.equal((await listGraphSyncRecords(pool, 'GRAPH-A'))[0].resultGraphId, 'GRAPH-B')
  assert.equal((await listGraphSyncRecords(pool, 'GRAPH-B'))[0].graphId, 'GRAPH-A')
})

test('drafts cannot synchronize and do not create records', async () => {
  const { pool, state } = fixture('草稿')
  await assert.rejects(runTrackedGraphSync(pool, 'GRAPH-A', async () => assert.fail('draft')), /先完成图谱配置/)
  assert.equal(state.records.length, 0)
  assert.equal(state.locks.size, 0)
})

test('interrupted runs are failed, but an active run keeps its state', async () => {
  const { pool, state } = fixture()
  state.records.push({ id: 1, graph_id: 'GRAPH-A', status: '同步中', lock_name: 'lost' }, { id: 2, graph_id: 'GRAPH-A', status: '同步中', lock_name: 'active' })
  state.locks.add('active')
  await recoverInterruptedGraphSyncs(pool)
  assert.equal(state.records[0].status, '失败')
  assert.equal(state.records[0].error_message, '同步已中断，请重试')
  assert.equal(state.records[1].status, '同步中')
})

test('unexpected infrastructure errors are not stored as raw database details', async () => {
  const { pool } = fixture()
  await assert.rejects(runTrackedGraphSync(pool, 'GRAPH-A', async () => { throw new Error('Internal database details') }))
  assert.equal((await listGraphSyncRecords(pool, 'GRAPH-A'))[0].errorMessage, '同步失败，请稍后重试')
})
