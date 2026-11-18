import { mappingGroup } from './graphMappingConfig.js'
const mappingType = (row) => row.mapping_type || row.type
const targetCode = (row) => row.target_code || row.targetCode
const sourceField = (row) => row.source_field || row.sourceField
const transformRule = (row) => row.transform_rule || row.transform
const keyField = (rule) => String(rule || '').match(/主键字段[：:]\s*([^；;]+)/)?.[1]?.trim() || ''

export function assessGraphMappingCoverage(structureElements, mappingsBySource) {
  const elements = Array.isArray(structureElements) ? structureElements : []
  const mappedEntityCodes = new Set()
  const mappedPropertyCodes = new Set()
  const sourcesWithoutEntityMapping = []
  const invalidIdentitySources = []

  for (const [sourceId, rows] of mappingsBySource) {
    const entities = rows.filter((row) => mappingType(row) === '实体类型' && sourceField(row))
    if (!entities.length) sourcesWithoutEntityMapping.push(sourceId)
    const validEntities = new Set()
    for (const row of entities) {
      const code = targetCode(row)
      mappedEntityCodes.add(code)
      if (keyField(transformRule(row))) validEntities.add(`${code}|${mappingGroup(row)}`)
      else invalidIdentitySources.push(sourceId)
    }
    for (const row of rows) {
      if (!['属性', '节点实例'].includes(mappingType(row)) || !sourceField(row)) continue
      const property = elements.find((item) => item.type === 'property' && item.code === targetCode(row))
      if (property && validEntities.has(`${property.ownerCode}|${mappingGroup(row)}`)) mappedPropertyCodes.add(property.code)
    }
  }

  const missingRequiredCodes = elements
    .filter((item) => item.type === 'property' && /必填|主标识/.test(item.constraint || '') && mappedEntityCodes.has(item.ownerCode) && !mappedPropertyCodes.has(item.code))
    .map((item) => item.code)

  return { mappedEntityCodes: [...mappedEntityCodes], mappedPropertyCodes: [...mappedPropertyCodes], missingRequiredCodes, sourcesWithoutEntityMapping, invalidIdentitySources: [...new Set(invalidIdentitySources)] }
}
