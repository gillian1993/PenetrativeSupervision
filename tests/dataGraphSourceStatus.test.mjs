import assert from 'node:assert/strict'
import { test } from 'node:test'
import { handleDataGraphApi } from '../dataGraphApi.js'

function sourcePool({ mode, connectionStatus, fileCount = 0, parsedCount = 0 }) {
  const row = {
    id: 'SRC-TEST', name: '测试数据源', mode, data_range: '', owner: '测试',
    status: '草稿', connection_status: connectionStatus, connection_message: '',
    access_config: '{}', file_count: fileCount,
  }
  return {
    row,
    async getConnection() { return { query: this.query.bind(this), beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} } },
    async query(sql) {
      if (sql.startsWith('SELECT id FROM data_sources')) return [[{ id: row.id }]]
      if (sql.startsWith('SELECT ds.*')) return [[{ ...row }]]
      if (sql.includes('FROM data_source_files WHERE source_id')) return [[{ total: fileCount }]]
      if (sql.includes('FROM data_source_metadata WHERE source_id')) return [[{ total: parsedCount }]]
      if (sql.startsWith('UPDATE data_sources SET status=\'启用\',connection_status=\'正常\'')) {
        row.status = '启用'
        row.connection_status = '正常'
        return [{}]
      }
      if (sql.startsWith('UPDATE data_sources SET connection_status=\'异常\'')) {
        row.connection_status = '异常'
        return [{}]
      }
      throw new Error(`Unexpected query: ${sql}`)
    },
  }
}

async function enable(pool) {
  let response
  await handleDataGraphApi(
    { method: 'POST' }, {}, new URL('http://localhost/api/data-sources/SRC-TEST/toggle'),
    { pool, readBody: async () => ({ enabled: true }), sendJson: (_res, status, body) => { response = { status, body } } },
  )
  return response
}

test('enabling an imported file source marks access normal', async () => {
  const pool = sourcePool({ mode: '文件导入', connectionStatus: '无需测试', fileCount: 1, parsedCount: 1 })
  const response = await enable(pool)
  assert.equal(response.status, 200)
  assert.equal(response.body.status, '启用')
  assert.equal(response.body.connectionStatus, '正常')
})

test('a file source without a parsed file stays a draft', async () => {
  const pool = sourcePool({ mode: '文件导入', connectionStatus: '无需测试' })
  await assert.rejects(enable(pool), /请先上传并解析至少一份数据文件/)
  assert.equal(pool.row.status, '草稿')
  assert.equal(pool.row.connection_status, '异常')
})

test('a previous normal result cannot bypass testing invalid saved configuration', async () => {
  const pool = sourcePool({ mode: '数据库接入', connectionStatus: '正常' })
  await assert.rejects(enable(pool), /请完整填写数据库接入配置/)
  assert.equal(pool.row.status, '草稿')
  assert.equal(pool.row.connection_status, '异常')
})
