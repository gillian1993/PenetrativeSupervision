const mappingType = (row) => row.mapping_type || row.type
const targetCode = (row) => row.target_code || row.targetCode
const sourceField = (row) => row.source_field || row.sourceField
const transform = (row) => row.transform_rule || row.transform || ''
const keyField = (rule) => String(rule).match(/主键字段[：:]\s*([^；;]+)/)?.[1]?.trim() || ''
const compact = (value) => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
const codeTail = (code) => String(code || '').split('.').pop() || ''
const snake = (value) => String(value || '').replace(/([a-z\d])([A-Z])/g, '$1_$2').toLowerCase()
const fieldsFor = (table) => Array.isArray(table.fields) ? table.fields : []

function propertyField(property, entity, fields) {
  const tail = compact(codeTail(property.code))
  const owner = compact(codeTail(entity.code))
  const candidates = fields.map((field) => {
    const normalized = compact(field)
    let score = normalized === tail || normalized === compact(property.name) ? 100 : 0
    if (!score && normalized === owner + tail) score = 94
    if (!score && ['id', 'code', 'name'].includes(tail) && normalized === owner + tail) score = 92
    return { field, score }
  }).sort((a, b) => b.score - a.score)
  return candidates[0]?.score >= 90 && candidates[0].score > (candidates[1]?.score || 0) ? candidates[0].field : ''
}

function identityField(entity, properties, matched, fields) {
  const primary = properties.find((item) => /主标识/.test(item.constraint || ''))
  if (primary && matched.get(primary.code)) return matched.get(primary.code)
  const tail = compact(codeTail(entity.code))
  const preferred = [`${tail}id`, `${tail}code`, 'id', 'code'].map((name) => fields.filter((field) => compact(field) === name))
  return preferred.find((items) => items.length === 1)?.[0] || ''
}

function entityCandidate(entity, properties, sources, metadataBySource) {
  const entityName = compact(entity.name)
  const entityCode = compact(codeTail(entity.code))
  const candidates = []
  for (const source of sources) for (const table of metadataBySource.get(source.id) || []) {
    if (/关联|关系|relation|link/i.test(`${table.tableName} ${table.displayName}`)) continue
    const tableName = compact(table.tableName)
    const displayName = compact(table.displayName)
    const nameMatch = entityName.length >= 2 && (displayName.includes(entityName) || tableName.includes(entityName))
    const codeMatch = entityCode.length >= 3 && (tableName.includes(entityCode) || displayName.includes(entityCode))
    if (!nameMatch && !codeMatch) continue
    const fields = fieldsFor(table)
    const matched = new Map(properties.map((property) => [property.code, propertyField(property, entity, fields)]).filter(([, field]) => field))
    const required = properties.filter((property) => /必填|主标识/.test(property.constraint || ''))
    if (required.some((property) => !matched.has(property.code))) continue
    const key = identityField(entity, properties, matched, fields)
    if (!key) continue
    candidates.push({ sourceId: source.id, sourceName: source.name, targetCode: entity.code, tableName: table.tableName, keyField: key, properties: [...matched].map(([targetCode, sourceField]) => ({ targetCode, sourceField })), score: (nameMatch ? 100 : 0) + (codeMatch ? 100 : 0) + matched.size })
  }
  candidates.sort((a, b) => b.score - a.score)
  return candidates.length && candidates[0].score >= (candidates[1]?.score || 0) + 10 ? candidates[0] : null
}

function relationCandidate(relation, elements, mappedEntities, mappedProperties, sources, metadataBySource) {
  if (!mappedEntities.has(relation.ownerCode) || !mappedEntities.has(relation.targetCode)) return null
  const owner = elements.find((item) => item.type === 'class' && item.code === relation.ownerCode)
  const target = elements.find((item) => item.type === 'class' && item.code === relation.targetCode)
  const ownerToken = compact(codeTail(owner?.code))
  const targetToken = compact(codeTail(target?.code))
  const owners = mappedProperties.filter((item) => item.ownerCode === relation.ownerCode)
  const targets = mappedProperties.filter((item) => item.ownerCode === relation.targetCode)
  const candidates = []
  for (const left of owners) for (const right of targets) {
    const leftKey = mappedEntities.get(relation.ownerCode).some((item) => item.sourceId === left.sourceId && item.keyField === left.sourceField)
    const rightKey = mappedEntities.get(relation.targetCode).some((item) => item.sourceId === right.sourceId && item.keyField === right.sourceField)
    const leftField = compact(left.sourceField)
    const rightField = compact(right.sourceField)
    if (leftKey && ownerToken.length >= 3 && rightField.includes(ownerToken) && /(?:id|code|no)$/.test(rightField)) candidates.push({ sourceId: right.sourceId, targetCode: relation.code, sourceField: `${left.targetCode} = ${right.targetCode}`, transform: '关联方式：关联条件；生成规则：按起点实例、关系类型和终点实例去重', score: 100 })
    if (rightKey && targetToken.length >= 3 && leftField.includes(targetToken) && /(?:id|code|no)$/.test(leftField)) candidates.push({ sourceId: left.sourceId, targetCode: relation.code, sourceField: `${left.targetCode} = ${right.targetCode}`, transform: '关联方式：关联条件；生成规则：按起点实例、关系类型和终点实例去重', score: 100 })
  }
  if (candidates.length === 1) return candidates[0]
  if (candidates.length > 1) return null
  const relationName = compact(relation.name)
  const relationCode = compact(codeTail(relation.code))
  const tableCandidates = []
  for (const source of sources) for (const table of metadataBySource.get(source.id) || []) {
    const title = compact(`${table.tableName} ${table.displayName}`)
    if (!(title.includes(ownerToken) && title.includes(targetToken)) && !(relationName.length >= 3 && title.includes(relationName)) && !(relationCode.length >= 4 && title.includes(relationCode))) continue
    const fields = fieldsFor(table)
    const start = fields.filter((field) => compact(field).includes(ownerToken) && /(?:id|code|no)$/.test(compact(field)))
    const end = fields.filter((field) => compact(field).includes(targetToken) && /(?:id|code|no)$/.test(compact(field)))
    if (start.length === 1 && end.length === 1 && start[0] !== end[0]) tableCandidates.push({ sourceId: source.id, targetCode: relation.code, sourceField: table.tableName, transform: `关联方式：关系表；起点字段：${start[0]}；终点字段：${end[0]}`, score: 100 })
  }
  return tableCandidates.length === 1 ? tableCandidates[0] : null
}

export function suggestGraphMappings(structureElements, sources, metadataBySource, mappingsBySource) {
  const elements = Array.isArray(structureElements) ? structureElements : []
  const existing = sources.flatMap((source) => (mappingsBySource.get(source.id) || []).map((row) => ({ ...row, sourceId: source.id })))
  const existingEntities = existing.filter((row) => mappingType(row) === '实体类型')
  const existingRelations = new Set(existing.filter((row) => mappingType(row) === '关系').map(targetCode))
  const entityPlans = []
  for (const entity of elements.filter((item) => item.type === 'class')) {
    if (existingEntities.some((row) => targetCode(row) === entity.code)) continue
    const properties = elements.filter((item) => item.type === 'property' && item.ownerCode === entity.code)
    const proposal = entityCandidate(entity, properties, sources, metadataBySource)
    if (proposal) entityPlans.push(proposal)
  }
  const mappedEntities = new Map()
  for (const row of existingEntities) {
    const rows = mappedEntities.get(targetCode(row)) || []
    rows.push({ sourceId: row.sourceId, keyField: keyField(transform(row)) })
    mappedEntities.set(targetCode(row), rows)
  }
  for (const plan of entityPlans) mappedEntities.set(plan.targetCode, [{ sourceId: plan.sourceId, keyField: plan.keyField }])
  const mappedProperties = existing.filter((row) => mappingType(row) === '属性' || mappingType(row) === '节点实例').map((row) => ({ sourceId: row.sourceId, targetCode: targetCode(row), sourceField: sourceField(row), ownerCode: elements.find((item) => item.code === targetCode(row))?.ownerCode })).filter((item) => mappedEntities.get(item.ownerCode)?.some((entity) => entity.sourceId === item.sourceId))
  for (const plan of entityPlans) for (const property of plan.properties) mappedProperties.push({ sourceId: plan.sourceId, targetCode: property.targetCode, sourceField: property.sourceField, ownerCode: elements.find((item) => item.code === property.targetCode)?.ownerCode })
  const relationPlans = []
  for (const relation of elements.filter((item) => item.type === 'relation')) {
    if (existingRelations.has(relation.code)) continue
    const proposal = relationCandidate(relation, elements, mappedEntities, mappedProperties, sources, metadataBySource)
    if (proposal) relationPlans.push(proposal)
  }
  return { entities: entityPlans, relations: relationPlans, skippedEntities: Math.max(0, elements.filter((item) => item.type === 'class').length - new Set(existingEntities.map(targetCode)).size - entityPlans.length), skippedRelations: Math.max(0, elements.filter((item) => item.type === 'relation').length - existingRelations.size - relationPlans.length) }
}
