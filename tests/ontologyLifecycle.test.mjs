import assert from 'node:assert/strict'
import test from 'node:test'
import { ontologyReferenceSummary, softDeleteOntology } from '../ontologyLifecycle.js'
import { demoStatus } from '../knowledgeGraphDemo.js'

function fixture(status = '停用', referenceTable = '') {
  const state = { model: { id: 'MODEL-TEST', name: '测试模型', status }, elements: [{ code: 'Entity' }], groups: ['业务对象'], audits: ['创建记录'], commits: 0, released: 0, auditFailure: false }
  let before
  const db = {
    async beginTransaction() { before = structuredClone({ model: state.model, elements: state.elements, groups: state.groups, audits: state.audits }) },
    async commit() { state.commits++ },
    async rollback() { Object.assign(state, before) },
    release() { state.released++ },
    async query(sql, args) {
      if (sql.startsWith('SELECT id,name,status FROM ontologies')) return [state.model ? [{ ...state.model }] : []]
      if (sql.includes(' AS total FROM ')) return [[{ total: referenceTable && sql.includes(`FROM ${referenceTable}`) ? 12 : 0 }]]
      if (sql.startsWith('SELECT ')) return [Array.from({ length: 8 }, (_, i) => ({ id: `REF-${i}`, name: `引用对象${i}` }))]
      if (sql.startsWith("UPDATE ontologies SET status='已删除'")) { state.model.status = '已删除'; return [{ affectedRows: 1 }] }
      if (sql.startsWith('INSERT INTO ontology_audits')) {
        if (state.auditFailure) throw new Error('模拟审计写入失败')
        state.audits.push(args); return [{}]
      }
      assert.fail(`不应物理删除结构或记录：${sql}`)
    },
  }
  return { state, db, remove: () => softDeleteOntology({ getConnection: async () => db }, 'MODEL-TEST') }
}

for (const status of ['草稿', '停用']) test(`${status} model without references is hidden while structure and audits survive`, async () => {
  const { state, remove } = fixture(status)
  const result = await remove()
  assert.ok(result.ok)
  assert.equal(state.model.status, '已删除')
  assert.deepEqual(state.elements, [{ code: 'Entity' }])
  assert.deepEqual(state.groups, ['业务对象'])
  assert.equal(state.audits.length, 2)
  assert.match(state.audits[1][2], new RegExp(`删除前状态：${status}`))
  assert.equal(state.commits, 1)
  await assert.rejects(remove(), error => error.status === 404)
  assert.equal(state.audits.length, 2)
})

test('enabled models cannot be deleted', async () => {
  const { state, remove } = fixture('启用')
  await assert.rejects(remove(), error => error.status === 409 && /先停用/.test(error.message))
  assert.equal(state.model.status, '启用'); assert.equal(state.audits.length, 1)
})

test('missing models return 404 without side effects', async () => {
  const { state, remove } = fixture(); state.model = null
  await assert.rejects(remove(), error => error.status === 404)
  assert.equal(state.commits, 0); assert.equal(state.released, 1)
})

for (const table of ['data_source_structures', 'semantic_mappings', 'graph_versions', 'graph_edit_drafts', 'graph_version_mapping_snapshots', 'scene_versions', 'rule_asset_versions', 'ontologies']) test(`references from ${table} prevent deletion and identify referencing objects`, async () => {
  const { state, remove } = fixture('停用', table)
  await assert.rejects(remove(), error => {
    assert.equal(error.status, 409)
    assert.equal(error.references.total, 12)
    assert.equal(error.references.items[0].objects.length, 8)
    assert.equal(error.references.items[0].truncated, true)
    assert.match(error.message, /仍被.+引用/)
    return true
  })
  assert.equal(state.model.status, '停用'); assert.equal(state.audits.length, 1)
})

test('audit write failure rolls back the deletion', async () => {
  const { state, remove } = fixture(); state.auditFailure = true
  await assert.rejects(remove(), /审计写入失败/)
  assert.equal(state.model.status, '停用'); assert.equal(state.audits.length, 1); assert.equal(state.commits, 0)
})

test('reference preview uses the same reference check as deletion', async () => {
  const { db } = fixture('草稿', 'graph_edit_drafts')
  const result = await ontologyReferenceSummary(db, 'MODEL-TEST')
  assert.equal(result.items[0].type, 'graphDraft')
  assert.match(result.summary, /图谱编辑草稿12个/)
})

test('demo counters hide deleted models while reset can still find their registered records', async () => {
  const pool = { async query(sql) {
    if (sql.includes('SELECT asset_type')) return [[{ asset_type: 'model', asset_id: 'MODEL-TEST' }]]
    if (sql.startsWith('SELECT id FROM ??')) return [sql.includes("status<>'已删除'") ? [] : [{ id: 'MODEL-TEST' }]]
    if (sql.includes('SELECT value_json')) return [[{ value_json: { ready: true } }]]
    assert.fail(sql)
  } }
  assert.deepEqual((await demoStatus(pool)).assets.model, [])
  assert.deepEqual((await demoStatus(pool, { includeDeleted: true })).assets.model, ['MODEL-TEST'])
})
