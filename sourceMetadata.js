import mysql from 'mysql2/promise'

const configOf = source => typeof source.access_config === 'object' ? source.access_config || {} : JSON.parse(source.access_config || '{}')
export async function readApiPayload(config) {
  const headers = { Accept: 'application/json' }
  if (config.authType === 'Token') headers.Authorization = `Bearer ${config.token}`
  if (config.authType === 'API Key') headers['X-API-Key'] = config.token
  if (config.authType === 'Basic Auth') headers.Authorization = `Basic ${Buffer.from(config.token || '').toString('base64')}`
  const response = await fetch(config.apiUrl, { method: config.method || 'GET', headers, signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw Object.assign(new Error(`接口返回 HTTP ${response.status}`), { status: 502 })
  let payload
  try { payload = await response.json() } catch { throw Object.assign(new Error('接口未返回有效 JSON 数据'), { status: 422 }) }
  if (!payload || typeof payload !== 'object') throw Object.assign(new Error('接口没有可读取的数据对象'), { status: 422 })
  return payload
}

export async function discoverSourceMetadata(source) {
  const config = configOf(source)
  if (source.mode === '数据库接入') {
    if (config.databaseType !== 'MySQL') throw Object.assign(new Error('当前支持 MySQL 数据库结构发现'), { status: 400 })
    let db
    try {
      db = await mysql.createConnection({ host: config.host, port: Number(config.port), database: config.databaseName, user: config.username, password: config.password, connectTimeout: 8000 })
      const names = Array.isArray(config.tables) ? config.tables : []
      const [rows] = await db.query(`SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=?${names.length ? ` AND TABLE_NAME IN (${names.map(() => '?').join(',')})` : ''} ORDER BY TABLE_NAME,ORDINAL_POSITION`, [config.databaseName, ...names])
      const tables = new Map()
      for (const row of rows) tables.set(row.TABLE_NAME, [...(tables.get(row.TABLE_NAME) || []), row.COLUMN_NAME])
      if (names.some(name => !tables.has(name))) throw Object.assign(new Error('配置的数据表不存在或当前账号没有读取权限'), { status: 409 })
      if (!tables.size) throw Object.assign(new Error('没有可读取的数据表或视图'), { status: 409 })
      return [...tables].map(([tableName, fields]) => ({ tableName, fields, displayName: tableName, summary: `${fields.length} 个实际字段 · MySQL 结构发现` }))
    } finally { if (db) await db.end() }
  }
  const payload = await readApiPayload(config)
  const objects = Array.isArray(payload) ? { source_object: payload } : Array.isArray(payload.data) ? { source_object: payload.data } : Array.isArray(payload.items) ? { source_object: payload.items } : payload
  const schema = payload._schema || {}
  const result = Object.entries(objects).filter(([name, value]) => name !== '_schema' && Array.isArray(value)).map(([tableName, rows]) => ({
    tableName, displayName: tableName,
    fields: [...new Set([...(schema[tableName] || []), ...rows.slice(0, 100).flatMap(row => row && typeof row === 'object' ? Object.keys(row) : [])])],
    summary: `${rows.length} 行样本 · 接口响应结构`,
  }))
  if (!result.length || result.some(row => !row.fields.length)) throw Object.assign(new Error('无法发现数据列表字段，请返回对象数组或提供 _schema 字段定义'), { status: 422 })
  return result
}
