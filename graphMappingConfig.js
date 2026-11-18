// Structured mapping options travel with the existing draft and version snapshots.
export function mappingConfig(mapping) {
  const raw = mapping?.mapping_config ?? mapping?.config
  if (raw == null || raw === '') return {}
  let config = raw
  if (typeof raw === 'string') {
    try { config = JSON.parse(raw) } catch { throw Object.assign(new Error('映射配置格式无效'), { status: 400 }) }
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw Object.assign(new Error('映射配置格式无效'), { status: 400 })
  return config
}

export function normalizeMappingConfig(type, config) {
  const value = mappingConfig({ config })
  if (type === '实体类型') {
    if (value.joins != null && !Array.isArray(value.joins)) throw Object.assign(new Error('关联表配置必须为列表'), { status: 400 })
    const joins = (value.joins || []).map((item) => {
      const join = { table: String(item?.table || '').trim(), mainField: String(item?.mainField || '').trim(), joinField: String(item?.joinField || '').trim() }
      if (!join.table || !join.mainField || !join.joinField) throw Object.assign(new Error('请完整配置关联表、主表关联字段和关联表匹配字段'), { status: 400 })
      return join
    })
    if (new Set(joins.map((item) => item.table)).size !== joins.length) throw Object.assign(new Error('同一关联表不能重复添加'), { status: 400 })
    const result = joins.length ? { joins } : {}
    if (value.priority != null) {
      if (!Number.isInteger(value.priority) || value.priority < 0) throw Object.assign(new Error('来源优先级必须为非负整数'), { status: 400 })
      result.priority = value.priority
    }
    return result
  }
  if (type === '关系' && value.relation) {
    const { origin, start, end } = value.relation
    if (!['entity', 'table'].includes(origin?.kind) || !String(origin.kind === 'entity' ? origin.entityCode || '' : origin.table || '').trim()) throw Object.assign(new Error('请选择关系数据来源'), { status: 400 })
    if (![start?.field, start?.match, end?.field, end?.match].every((item) => typeof item === 'string' && item.trim())) throw Object.assign(new Error('请完整配置来源字段和两端实体匹配字段'), { status: 400 })
    return { relation: { origin: origin.kind === 'entity' ? { kind: 'entity', entityCode: origin.entityCode.trim() } : { kind: 'table', table: origin.table.trim() }, start: { field: start.field.trim(), match: start.match.trim() }, end: { field: end.field.trim(), match: end.match.trim() } } }
  }
  return type === '属性' && value.sourceTable ? { sourceTable: String(value.sourceTable).trim() } : {}
}

export const entityJoins = (mapping) => normalizeMappingConfig('实体类型', mappingConfig(mapping)).joins || []
export const entityTable = (mapping) => mapping?.source_field || mapping?.sourceField || ''
export const mappingGroup = (mapping) => String(mapping?.mapping_group ?? mapping?.groupId ?? '')
export const sameMappingGroup = (left, right) => mappingGroup(left) === mappingGroup(right)
export const mappingPriority = (mapping) => Number(mappingConfig(mapping).priority || 0)
export const sortEntitySources = (rows) => [...rows].sort((left, right) => mappingPriority(left) - mappingPriority(right) || String(left.source_id || left.sourceId || '').localeCompare(String(right.source_id || right.sourceId || '')) || mappingGroup(left).localeCompare(mappingGroup(right)))
export const propertyTable = (entity, property) => mappingConfig(property).sourceTable || entityTable(entity)
const fieldsFor = (metadata, table) => metadata.find((item) => (item.tableName || item.table_name) === table)?.fields || []

export function entityConfigurationIssue(entity, metadata) {
  try {
    const main = entityTable(entity)
    const fields = fieldsFor(metadata, main)
    const key = String(entity.transform_rule || entity.transform || '').match(/主键字段[：:]\s*([^；;]+)/)?.[1]?.trim()
    if (!fields.includes(key)) return '主表或唯一标识字段已失效'
    for (const join of entityJoins(entity)) {
      if (join.table === main) return '关联表不能与主表相同'
      if (!fields.includes(join.mainField) || !fieldsFor(metadata, join.table).includes(join.joinField)) return `关联表 ${join.table} 或关联字段已失效`
    }
    return ''
  } catch (error) { return error.message }
}

export function propertyMappingAvailable(entity, property, metadata) {
  if (!entity || !property || !sameMappingGroup(entity, property) || entityConfigurationIssue(entity, metadata)) return false
  const table = propertyTable(entity, property)
  return [entityTable(entity), ...entityJoins(entity).map((item) => item.table)].includes(table)
    && fieldsFor(metadata, table).includes(property.source_field || property.sourceField)
}

export function relationConfiguration(mapping, relation) {
  if (!mapping) return null
  const config = mappingConfig(mapping)
  if (config.relation) return normalizeMappingConfig('关系', config).relation
  const rule = String(mapping.transform_rule || mapping.transform || '')
  const field = entityTable(mapping)
  if (/关联方式[：:]\s*关系表/.test(rule)) return { origin: { kind: 'table', table: field }, start: { field: rule.match(/起点字段[：:]\s*([^；;]+)/)?.[1]?.trim() || '', match: '$identifier' }, end: { field: rule.match(/终点字段[：:]\s*([^；;]+)/)?.[1]?.trim() || '', match: '$identifier' } }
  const [start, end] = field.split(/\s*=\s*|\s*\+\s*/).map((item) => item.trim())
  return { origin: { kind: 'entity', entityCode: relation?.ownerCode || '' }, start: { field: start || '', match: start || '' }, end: { field: start || '', match: end || '' } }
}

export function relationConfigurationIssue(config, relation, elements, entityCodes, propertyCodes, metadata) {
  if (!config || !relation) return '关系配置不完整'
  if (!config.origin || !String(config.origin.kind === 'entity' ? config.origin.entityCode || '' : config.origin.table || '').trim()) return '请选择关系数据来源'
  if (![config.start?.field, config.start?.match, config.end?.field, config.end?.match].every((value) => typeof value === 'string' && value.trim())) return '请选择两端的来源字段和实体匹配字段'
  const entities = new Set(entityCodes), properties = new Set(propertyCodes)
  if (!entities.has(relation.ownerCode) || !entities.has(relation.targetCode)) return '起点或终点实体尚未映射'
  const propertyValid = (code, owner) => properties.has(code) && elements.some((item) => item.type === 'property' && item.code === code && item.ownerCode === owner)
  for (const [endpoint, owner] of [[config.start, relation.ownerCode], [config.end, relation.targetCode]]) if (endpoint.match !== '$identifier' && !propertyValid(endpoint.match, owner)) return '实体匹配属性尚未完成映射'
  if (config.origin.kind === 'entity') {
    if (!entities.has(config.origin.entityCode)) return '来源实体尚未完成映射'
    if ([config.start.field, config.end.field].some((field) => field !== '$identifier' && !propertyValid(field, config.origin.entityCode))) return '来源实体字段尚未完成映射'
  } else if (![config.start.field, config.end.field].every((field) => fieldsFor(metadata, config.origin.table).includes(field))) return '来源表或来源字段已失效'
  return ''
}

// A left join supplies attributes without changing the primary entity population.
export function joinEntityRows(entity, data, sourceName) {
  const main = entityTable(entity)
  const joins = entityJoins(entity)
  const value = (row, field) => row?.[field] == null ? '' : String(row[field]).trim()
  const indexes = joins.map((join) => {
    if (join.table === main) throw Object.assign(new Error('关联表不能与主表相同'), { status: 422 })
    if (!data.has(join.table)) throw Object.assign(new Error(`${sourceName} 缺少关联表 ${join.table}`), { status: 422 })
    const index = new Map()
    for (const row of data.get(join.table)) {
      const key = value(row, join.joinField)
      if (key) index.set(key, [...(index.get(key) || []), row])
    }
    return index
  })
  return (data.get(main) || []).map((row, rowIndex) => {
    const tables = new Map([[main, row]])
    joins.forEach((join, index) => {
      const key = value(row, join.mainField)
      const matches = key ? indexes[index].get(key) || [] : []
      if (matches.length > 1) throw Object.assign(new Error(`${sourceName} 的 ${main} 第 ${rowIndex + 2} 行在关联表 ${join.table} 匹配多条记录（${join.mainField}=${key}），请整理为一对一数据或使用关系映射`), { status: 422 })
      tables.set(join.table, matches[0] || {})
    })
    return { row, tables }
  })
}

export function invalidateDependentRelations(rows, elements, previous, next) {
  if (!previous) return rows
  const type = previous.mapping_type || previous.type
  const code = previous.target_code || previous.targetCode
  let changed = !next
  if (next) {
    changed = entityTable(previous) !== entityTable(next)
    if (type === '实体类型') {
      const key = (row) => String(row.transform_rule || row.transform || '').match(/主键字段[：:]\s*([^；;]+)/)?.[1]?.trim()
      changed ||= key(previous) !== key(next) || entityJoins(previous).some((join) => !entityJoins(next).some((item) => JSON.stringify(item) === JSON.stringify(join)))
    } else if (type === '属性') changed ||= mappingConfig(previous).sourceTable !== mappingConfig(next).sourceTable
  }
  if (!changed || !['实体类型', '属性'].includes(type)) return rows
  return rows.map((row) => {
    if ((row.mapping_type || row.type) !== '关系') return row
    const relation = elements.find((item) => item.type === 'relation' && item.code === (row.target_code || row.targetCode))
    const config = relationConfiguration(row, relation)
    const dependent = type === '实体类型' ? relation && [relation.ownerCode, relation.targetCode, config?.origin.entityCode].includes(code)
      : [config?.start.field, config?.end.field, config?.start.match, config?.end.match].includes(code)
    return dependent ? { ...row, status: '待检查' } : row
  })
}
