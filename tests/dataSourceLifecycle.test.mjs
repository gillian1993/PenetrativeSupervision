import assert from 'node:assert/strict'
import { test } from 'node:test'
import { handleDataGraphApi } from '../dataGraphApi.js'

function sourcePool({ mode = '接口接入', status = '草稿', connectionStatus = '未测试', fileCount = 0, parsedCount = 0, config = { apiUrl: 'https://example.test/data', method: 'GET', authType: '无认证', token: '' } } = {}) {
  const row = { id: 'SRC-TEST', name: '测试数据源', mode, data_range: '', owner: '测试', status, connection_status: connectionStatus, connection_message: '上次测试结果', last_tested_at: '2026-10-21 10:00:00', access_config: JSON.stringify(config), file_count: fileCount }
  let snapshot
  const pool = {
    row, released: 0,
    async query(sql, args = []) {
      if (sql.startsWith('SELECT id FROM data_sources')) return [[{ id: row.id }]]
      if (sql.startsWith('SELECT ds.*')) return [[{ ...row }]]
      if (sql.includes('FROM data_source_files WHERE source_id')) return [[{ total: fileCount }]]
      if (sql.includes('FROM data_source_metadata WHERE source_id')) return [[{ total: parsedCount }]]
      if (sql.startsWith("UPDATE data_sources SET status='启用'")) { row.status = '启用'; row.connection_status = '正常'; return [{}] }
      if (sql.startsWith("UPDATE data_sources SET status='停用'")) { row.status = '停用'; return [{}] }
      if (sql.startsWith("UPDATE data_sources SET connection_status='正常'")) { row.connection_status = '正常'; row.connection_message = args[0]; row.last_tested_at = '本次测试'; return [{}] }
      if (sql.startsWith("UPDATE data_sources SET connection_status='异常'")) { row.connection_status = '异常'; row.connection_message = args[0]; return [{}] }
      if (sql.startsWith('UPDATE data_sources SET name=')) {
        const [name, mode, range, owner, , config, connectionStatus, lastTestedAt, message] = args
        Object.assign(row, { name, mode, data_range: range, owner, access_config: config, connection_status: connectionStatus, last_tested_at: lastTestedAt, connection_message: message })
        return [{}]
      }
      throw new Error(`Unexpected query: ${sql}`)
    },
    async getConnection() {
      return { query: pool.query,
        async beginTransaction() { snapshot = structuredClone(row) },
        async commit() { snapshot = null },
        async rollback() { Object.assign(row, snapshot) },
        release() { pool.released++ },
      }
    },
  }
  return pool
}

async function request(pool, path, payload = {}, method = 'POST') {
  let response
  await handleDataGraphApi({ method }, {}, new URL(`http://localhost/api/data-sources/${path}`), { pool, readBody: async () => payload, sendJson: (_res, status, body) => { response = { status, body } } })
  return response
}
const enable = (pool) => request(pool, 'SRC-TEST/toggle', { enabled: true })
const successResponse = () => ({ ok: true, status: 200, body: { cancel: async () => {} } })
const editPayload = (pool, patch = {}) => ({ name: pool.row.name, mode: pool.row.mode, owner: pool.row.owner, range: pool.row.data_range, accessConfig: JSON.parse(pool.row.access_config), ...patch })

test('a draft without a previous test is tested and enabled in one operation', async (t) => {
  let tests = 0
  t.mock.method(globalThis, 'fetch', async () => { tests++; return successResponse() })
  const pool = sourcePool()
  const response = await enable(pool)
  assert.equal(tests, 1)
  assert.equal(response.body.status, '启用')
  assert.equal(response.body.connectionStatus, '正常')
  assert.equal(pool.released, 1)
})

test('enabling rechecks even a previously normal connection', async (t) => {
  let tests = 0
  t.mock.method(globalThis, 'fetch', async () => { tests++; return successResponse() })
  await enable(sourcePool({ connectionStatus: '正常' }))
  assert.equal(tests, 1)
})

for (const status of ['草稿', '停用', '启用']) test(`a failed enable preserves ${status} usage and records abnormal access; retry can enable`, async (t) => {
  let fails = true
  t.mock.method(globalThis, 'fetch', async () => { if (fails) throw new Error('network'); return successResponse() })
  const pool = sourcePool({ status })
  await assert.rejects(enable(pool), /使用状态保持不变/)
  assert.equal(pool.row.status, status)
  assert.equal(pool.row.connection_status, '异常')
  fails = false
  assert.equal((await enable(pool)).body.status, '启用')
})

test('a standalone failed test does not disable an active source', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('network') })
  const pool = sourcePool({ status: '启用', connectionStatus: '正常' })
  await assert.rejects(request(pool, 'SRC-TEST/test'), /接口调用失败/)
  assert.equal(pool.row.status, '启用')
  assert.equal(pool.row.connection_status, '异常')
})

test('file activation validates parsed content, and missing files preserve usage with abnormal access', async () => {
  const ready = sourcePool({ mode: '文件导入', fileCount: 1, parsedCount: 1 })
  assert.equal((await enable(ready)).body.connectionStatus, '正常')
  const missing = sourcePool({ mode: '文件导入', status: '停用' })
  await assert.rejects(enable(missing), /请先上传并解析/)
  assert.equal(missing.row.status, '停用')
  assert.equal(missing.row.connection_status, '异常')
})

test('metadata edits preserve enabled status, credentials and the previous test result', async (t) => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('metadata does not need another connection test'))
  const config = { apiUrl: 'https://example.test/data', method: 'GET', authType: 'Token', token: 'stored-secret' }
  const pool = sourcePool({ status: '启用', connectionStatus: '正常', config })
  const response = await request(pool, 'SRC-TEST', editPayload(pool, { name: '新名称', accessConfig: { ...config, token: '', tokenConfigured: true } }), 'PUT')
  assert.equal(response.body.name, '新名称')
  assert.equal(response.body.status, '启用')
  assert.equal(pool.row.last_tested_at, '2026-10-21 10:00:00')
  assert.equal(JSON.parse(pool.row.access_config).token, 'stored-secret')
  assert.ok(!JSON.stringify(response.body).includes('stored-secret'))
})

test('an invalid replacement connection leaves all saved configuration intact', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 401, body: { cancel: async () => {} } }))
  const pool = sourcePool({ status: '启用', connectionStatus: '正常' })
  const before = structuredClone(pool.row)
  const payload = editPayload(pool, { name: '不生效的新名称', accessConfig: { ...JSON.parse(pool.row.access_config), apiUrl: 'https://example.test/invalid' } })
  await assert.rejects(request(pool, 'SRC-TEST', payload, 'PUT'), /原有配置继续使用/)
  assert.deepEqual(pool.row, before)
})

test('a valid replacement connection takes effect while staying enabled', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => successResponse())
  const pool = sourcePool({ status: '启用', connectionStatus: '异常' })
  const payload = editPayload(pool, { accessConfig: { ...JSON.parse(pool.row.access_config), apiUrl: 'https://example.test/new' } })
  const result = await request(pool, 'SRC-TEST', payload, 'PUT')
  assert.equal(result.body.status, '启用')
  assert.equal(result.body.connectionStatus, '正常')
  assert.equal(result.body.accessConfig.apiUrl, 'https://example.test/new')
})

test('editing a stopped connection invalidates the old result and keeps it stopped', async () => {
  const pool = sourcePool({ status: '停用', connectionStatus: '正常' })
  const payload = editPayload(pool, { accessConfig: { ...JSON.parse(pool.row.access_config), apiUrl: 'https://example.test/new' } })
  const result = await request(pool, 'SRC-TEST', payload, 'PUT')
  assert.equal(result.body.status, '停用')
  assert.equal(result.body.connectionStatus, '未测试')
  assert.equal(pool.row.last_tested_at, null)
})

test('testing an edited form can reuse saved credentials without exposing them', async (t) => {
  let authorization
  t.mock.method(globalThis, 'fetch', async (_url, init) => { authorization = init.headers.Authorization; return successResponse() })
  const config = { apiUrl: 'https://example.test/data', method: 'GET', authType: 'Token', token: 'stored-secret' }
  const pool = sourcePool({ config })
  const response = await request(pool, 'test-config', { sourceId: 'SRC-TEST', mode: '接口接入', accessConfig: { ...config, token: '' } })
  assert.equal(authorization, 'Bearer stored-secret')
  assert.equal(response.body.ok, true)
  assert.ok(!JSON.stringify(response.body).includes('stored-secret'))
})

test('stopping a source keeps the latest access result', async () => {
  const pool = sourcePool({ status: '启用', connectionStatus: '正常' })
  const result = await request(pool, 'SRC-TEST/toggle', { enabled: false })
  assert.equal(result.body.status, '停用')
  assert.equal(result.body.connectionStatus, '正常')
})
