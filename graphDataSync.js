import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import ExcelJS from 'exceljs'
import mysql from 'mysql2/promise'
import { readApiPayload } from './sourceMetadata.js'
import { entityJoins, joinEntityRows, propertyTable, sameMappingGroup, sortEntitySources, relationConfiguration } from './graphMappingConfig.js'

const rowLimit = 2000
const relationLimit = 5000
const parseJson = (value, fallback) => {
  if (value == null || value === '') return fallback
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch { return fallback }
}
const valueText = (value) => value == null ? '' : value instanceof Date ? value.toISOString() : typeof value === 'object' ? JSON.stringify(value) : String(value).trim()
const sourceValue = (row, field) => {
  const key = String(field || '').trim()
  return valueText(row[key] ?? row[key.split('.').pop()])
}
const hashId = (prefix, value) => `${prefix}-${createHash('sha1').update(value).digest('hex').slice(0, 20)}`
const keyField = (rule) => String(rule || '').match(/主键字段[：:]\s*([^；;]+)/)?.[1]?.trim() || ''
const tooManyRows = (sourceName, table) => Object.assign(new Error(`${sourceName} 的 ${table} 超过 ${rowLimit} 行，当前同步上限为单表 ${rowLimit} 行`), { status: 409 })

async function fileRows(pool, source, tables) {
  const placeholders = tables.map(() => '?').join(',')
  const [metadata] = await pool.query(`SELECT dsm.table_name,dsf.id AS file_id,dsf.file_name,dsf.content FROM data_source_metadata dsm JOIN data_source_files dsf ON dsf.id=dsm.file_id WHERE dsm.source_id=? AND dsm.table_name IN (${placeholders})`, [source.id, ...tables])
  const workbooks = new Map()
  const result = new Map()
  for (const item of metadata) {
    let workbook = workbooks.get(item.file_id)
    if (!workbook) {
      workbook = new ExcelJS.Workbook()
      if (/\.csv$/i.test(item.file_name)) await workbook.csv.read(Readable.from([item.content]))
      else await workbook.xlsx.load(item.content)
      workbooks.set(item.file_id, workbook)
    }
    const index = Number(String(item.table_name).match(/_sheet_(\d+)$/)?.[1] || 1) - 1
    const sheet = workbook.worksheets[index]
    if (!sheet) throw Object.assign(new Error(`${source.name} 的文件工作表已变化，请重新上传文件`), { status: 409 })
    if (sheet.actualRowCount - 1 > rowLimit) throw tooManyRows(source.name, item.table_name)
    const used = new Map()
    const fields = []
    for (let column = 1; column <= sheet.getRow(1).cellCount; column++) {
      const label = sheet.getRow(1).getCell(column).text.trim()
      if (!label) continue
      const count = (used.get(label) || 0) + 1
      used.set(label, count)
      fields.push([column, count === 1 ? label : `${label}_${count}`])
    }
    const rows = []
    for (let number = 2; number <= sheet.actualRowCount; number++) {
      const row = Object.fromEntries(fields.map(([column, field]) => [field, sheet.getRow(number).getCell(column).text.trim()]))
      if (Object.values(row).some(Boolean)) rows.push(row)
    }
    result.set(item.table_name, rows)
  }
  for (const table of tables) if (!result.has(table)) throw Object.assign(new Error(`${source.name} 缺少来源表 ${table}，请检查数据映射`), { status: 409 })
  return result
}

async function apiRows(source, tables) {
  const config = parseJson(source.access_config, {})
  let payload
  try { payload = await readApiPayload(config) } catch (error) { throw Object.assign(new Error(`${source.name}：${error.message}`), { status: error.status || 502 }) }
  const result = new Map()
  for (const table of tables) {
    const rows = Array.isArray(payload?.[table]) ? payload[table] : tables.length === 1 ? Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.items) ? payload.items : null : null
    if (!rows) throw Object.assign(new Error(`${source.name} 的接口结果无法对应来源对象 ${table}`), { status: 422 })
    if (rows.length > rowLimit) throw tooManyRows(source.name, table)
    result.set(table, rows.filter((row) => row && typeof row === 'object' && !Array.isArray(row)))
  }
  return result
}

async function databaseRows(source, tables) {
  const config = parseJson(source.access_config, {})
  if (config.databaseType !== 'MySQL') throw Object.assign(new Error(`${source.name} 当前仅支持同步 MySQL 数据库`), { status: 400 })
  let connection
  try {
    connection = await mysql.createConnection({ host: config.host, port: Number(config.port), user: config.username, password: config.password, database: config.databaseName, connectTimeout: 8000 })
    const result = new Map()
    for (const table of tables) {
      const parts = table.split('.')
      if (parts.length > 2 || parts.some((part) => !/^[\p{L}\p{N}_]+$/u.test(part))) throw Object.assign(new Error(`${source.name} 的来源表名称无效：${table}`), { status: 400 })
      const identifier = parts.map((part) => `\`${part}\``).join('.')
      const [rows] = await connection.query({ sql: `SELECT * FROM ${identifier} LIMIT ${rowLimit + 1}`, timeout: 10000 })
      if (rows.length > rowLimit) throw tooManyRows(source.name, table)
      result.set(table, rows)
    }
    return result
  } catch (error) {
    if (error?.status) throw error
    throw Object.assign(new Error(`${source.name} 数据读取失败：${error?.code || error?.message || '连接错误'}`), { status: 502 })
  } finally { if (connection) await connection.end().catch(() => undefined) }
}

async function readSource(pool, source, tables) {
  if (source.status !== '启用') throw Object.assign(new Error(`${source.name} 尚未启用，不能同步`), { status: 409 })
  if (source.mode === '文件导入') return fileRows(pool, source, tables)
  if (source.mode === '接口接入') return apiRows(source, tables)
  if (source.mode === '数据库接入') return databaseRows(source, tables)
  throw Object.assign(new Error(`${source.name} 的接入方式暂不支持同步`), { status: 400 })
}

export async function buildGraphDataset(pool, sources, mappingsBySource, structureElements) {
  const elements = new Map(structureElements.map((element) => [element.code, element]))
  const nodes = new Map()
  const relationMappings = []
  const sourceStats = []
  const entityInputs = []
  for (const source of [...sources].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const mappings = mappingsBySource.get(source.id) || []
    const entities = mappings.filter((item) => item.mapping_type === '实体类型')
    const relationTables = mappings.filter((item) => item.mapping_type === '关系').map((item) => relationConfiguration(item, elements.get(item.target_code))).filter((config) => config?.origin.kind === 'table').map((config) => config.origin.table)
    if (!entities.length && !mappings.some((item) => item.mapping_type === '关系')) throw Object.assign(new Error(`${source.name} 尚未配置实体或关系映射`), { status: 409 })
    if (source.mode !== '数据库接入' && entities.some((item) => entityJoins(item).length)) throw Object.assign(new Error(`${source.name} 的关联表仅支持同一数据库连接`), { status: 409 })
    const tables = [...new Set(entities.map((item) => item.source_field).concat(relationTables, entities.flatMap((item) => entityJoins(item).map((join) => join.table))).filter(Boolean))]
    const data = tables.length ? await readSource(pool, source, tables) : new Map()
    const stats = { sourceId: source.id, sourceName: source.name, rows: [...data.values()].reduce((total, rows) => total + rows.length, 0), entities: 0 }
    for (const mapping of entities) {
      const properties = mappings.filter((item) => item.mapping_type === '属性' && elements.get(item.target_code)?.ownerCode === mapping.target_code && sameMappingGroup(item, mapping))
      entityInputs.push({ ...mapping, source_id: source.id, source, data, properties, stats })
    }
    relationMappings.push(...mappings.filter((item) => item.mapping_type === '关系').map((item) => ({ ...item, sourceName: source.name, data })))
    sourceStats.push(stats)
  }
  for (const mapping of sortEntitySources(entityInputs)) {
    const { source, data, properties, stats } = mapping
    const type = elements.get(mapping.target_code)
    if (!type || type.type !== 'class') throw Object.assign(new Error(`${source.name} 的实体类型映射目标已失效`), { status: 409 })
    const uniqueField = keyField(mapping.transform_rule)
    if (!uniqueField) throw Object.assign(new Error(`${type.name} 未配置实体唯一标识`), { status: 409 })
    const identifiers = new Set()
    for (const [index, { row, tables: joinedTables }] of joinEntityRows(mapping, data, source.name).entries()) {
      const identifier = sourceValue(row, uniqueField)
      if (!identifier) throw Object.assign(new Error(`${source.name} 的 ${mapping.source_field} 第 ${index + 2} 行缺少唯一标识 ${uniqueField}`), { status: 422 })
      if (identifiers.has(identifier)) throw Object.assign(new Error(`${source.name} 的 ${mapping.source_field} 第 ${index + 2} 行唯一标识 ${uniqueField}=${identifier} 重复`), { status: 422 })
      identifiers.add(identifier)
      const values = Object.fromEntries(properties.map((item) => {
        const table = propertyTable(mapping, item)
        if (!joinedTables.has(table)) throw Object.assign(new Error(`${type.name} 的属性 ${item.target_code} 引用的来源表 ${table} 已移除，请重新配置映射`), { status: 422 })
        return [item.target_code, sourceValue(joinedTables.get(table), item.source_field)]
      }))
      const display = properties.find((item) => /名称|姓名|标题|name/i.test(elements.get(item.target_code)?.name || ''))
      const name = display ? values[display.target_code] || identifier : sourceValue(row, 'name') || identifier
      const id = hashId('node', `${type.code}|${identifier}`)
      const existing = nodes.get(id)
      if (existing) {
        for (const [code, value] of Object.entries(values)) if (value && !existing.values[code]) existing.values[code] = value
        if (existing.name === existing.identifier && name !== identifier) existing.name = name
        if (!existing.sourceName.includes(source.name)) existing.sourceName += `、${source.name}`
        continue
      }
      nodes.set(id, { id, name, typeCode: type.code, typeName: type.name, identifier, sourceName: source.name, values })
      stats.entities++
    }
  }
  if (!nodes.size) throw Object.assign(new Error('所选数据源没有可生成的实体记录，请检查来源数据和映射'), { status: 422 })
  const nodeRows = [...nodes.values()]
  const requiredProperties = structureElements.filter((element) => element.type === 'property' && /必填|主标识/.test(element.constraint || ''))
  for (const node of nodeRows) {
    const missing = requiredProperties.find((property) => property.ownerCode === node.typeCode && !node.values[property.code])
    if (missing) throw Object.assign(new Error(`${node.typeName} ${node.identifier} 缺少必填属性 ${missing.name}，请检查来源数据或跨源唯一标识`), { status: 422 })
  }
  const relations = new Map()
  for (const mapping of relationMappings) {
    const relation = elements.get(mapping.target_code)
    if (!relation || relation.type !== 'relation') throw Object.assign(new Error(`关系映射目标 ${mapping.target_code} 已失效`), { status: 409 })
    const config = relationConfiguration(mapping, relation)
    const ownedProperty = (code, type) => code === '$identifier' || elements.get(code)?.type === 'property' && elements.get(code)?.ownerCode === type
    if (!config || !ownedProperty(config.start.match, relation.ownerCode) || !ownedProperty(config.end.match, relation.targetCode)) throw Object.assign(new Error(`${relation.name} 的实体匹配字段无效`), { status: 409 })
    const nodeValue = (node, field) => field === '$identifier' ? node.identifier : node.values[field] || ''
    const indexFor = (type, field) => {
      const index = new Map()
      for (const node of nodeRows.filter((item) => item.typeCode === type)) {
        const value = nodeValue(node, field)
        if (value) index.set(value, [...(index.get(value) || []), node])
      }
      return index
    }
    const owners = indexFor(relation.ownerCode, config.start.match)
    const targets = indexFor(relation.targetCode, config.end.match)
    const entityOrigin = config.origin.kind === 'entity'
    if (entityOrigin && ![config.start.field, config.end.field].every((field) => ownedProperty(field, config.origin.entityCode))) throw Object.assign(new Error(`${relation.name} 的来源实体字段无效`), { status: 409 })
    const records = entityOrigin ? nodeRows.filter((node) => node.typeCode === config.origin.entityCode).map((node) => ({ start: nodeValue(node, config.start.field), end: nodeValue(node, config.end.field) }))
      : (mapping.data.get(config.origin.table) || []).map((row) => ({ start: sourceValue(row, config.start.field), end: sourceValue(row, config.end.field) }))
    for (const [index, record] of records.entries()) {
      if (!record.start || !record.end) {
        if (entityOrigin) continue
        throw Object.assign(new Error(`${mapping.sourceName} 的 ${config.origin.table} 第 ${index + 2} 行缺少关系端点标识`), { status: 422 })
      }
      const starts = owners.get(record.start) || [], ends = targets.get(record.end) || []
      if (!starts.length || !ends.length) {
        if (entityOrigin) continue
        throw Object.assign(new Error(`${mapping.sourceName} 的 ${config.origin.table} 第 ${index + 2} 行关联实体不存在，请检查两端标识或实体映射`), { status: 422 })
      }
      for (const owner of starts) for (const target of ends) {
        const id = hashId('rel', `${relation.code}|${owner.id}|${target.id}`)
        relations.set(id, { id, name: relation.name, typeCode: relation.code, sourceId: owner.id, targetId: target.id, sourceName: mapping.sourceName, properties: [] })
        if (relations.size > relationLimit) throw Object.assign(new Error(`关系实例超过 ${relationLimit} 条，请缩小来源范围`), { status: 409 })
      }
    }
  }
  const count = nodeRows.length
  const displayNodes = nodeRows.map((node, index) => {
    const ring = Math.floor(index / 24)
    const ringCount = Math.min(24, count - ring * 24)
    const angle = (index % 24) / ringCount * Math.PI * 2
    return { id: node.id, name: node.name, typeCode: node.typeCode, typeName: node.typeName, identifier: node.identifier, sourceName: node.sourceName, x: 450 + Math.cos(angle) * (160 + ring * 105), y: 350 + Math.sin(angle) * (160 + ring * 105), properties: Object.entries(node.values).filter(([, value]) => value).map(([code, value]) => ({ label: elements.get(code)?.name || code, value })) }
  })
  return { nodes: displayNodes, relations: [...relations.values()], sourceStats, syncedAt: new Date().toISOString() }
}
