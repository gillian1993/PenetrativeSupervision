import assert from 'node:assert/strict'
import test from 'node:test'
import mysql from 'mysql2/promise'
import { buildGraphDataset } from '../graphDataSync.js'
import { assessGraphMappingCoverage } from '../graphMappingCoverage.js'
import { invalidateDependentRelations, normalizeMappingConfig, relationConfiguration, relationConfigurationIssue } from '../graphMappingConfig.js'

const source = { id: 'DB', name: '测试库', mode: '数据库接入', status: '启用', access_config: { databaseType: 'MySQL' } }
const elements = [
  { type: 'class', code: 'Supplier', name: '供应商' }, { type: 'class', code: 'Person', name: '人员' },
  { type: 'property', code: 'Supplier.name', name: '供应商名称', ownerCode: 'Supplier', constraint: '必填' },
  { type: 'property', code: 'Supplier.phone', name: '电话', ownerCode: 'Supplier' },
  { type: 'property', code: 'Supplier.credit', name: '信用代码', ownerCode: 'Supplier' },
  { type: 'property', code: 'Person.phone', name: '电话', ownerCode: 'Person' },
  { type: 'relation', code: 'Contact', name: '联系', ownerCode: 'Supplier', targetCode: 'Person' },
]
const groupRows = [
  { mapping_type: '实体类型', target_code: 'Supplier', source_field: 'erp', transform_rule: '主键字段：credit', mapping_group: 'ERP', mapping_config: { priority: 1 } },
  { mapping_type: '属性', target_code: 'Supplier.name', source_field: 'name', mapping_group: 'ERP' },
  { mapping_type: '属性', target_code: 'Supplier.credit', source_field: 'credit', mapping_group: 'ERP' },
  { mapping_type: '实体类型', target_code: 'Supplier', source_field: 'purchase', transform_rule: '主键字段：code', mapping_group: 'PURCHASE', mapping_config: { priority: 2 } },
  { mapping_type: '属性', target_code: 'Supplier.name', source_field: 'name', mapping_group: 'PURCHASE' },
  { mapping_type: '属性', target_code: 'Supplier.phone', source_field: 'phone', mapping_group: 'PURCHASE' },
  { mapping_type: '实体类型', target_code: 'Person', source_field: 'people', transform_rule: '主键字段：id' },
  { mapping_type: '属性', target_code: 'Person.phone', source_field: 'phone' },
]
const fixture = () => ({ erp: [{ credit: 'C1', name: 'ERP甲' }, { credit: 'C2', name: 'ERP乙' }], purchase: [{ code: 'C1', name: '采购甲', phone: '100' }, { code: 'C3', name: '采购丙', phone: '200' }], people: [{ id: 'P1', phone: '100' }, { id: 'P2', phone: '100' }, { id: 'P3', phone: '200' }], links: [{ supplier: 'C1', person: 'P1' }, { supplier: 'C1', person: 'P2' }, { supplier: 'C1', person: 'P2' }] })
async function dataset(t, mappings = groupRows, data = fixture(), sources = [source], bySource = new Map([['DB', mappings]])) {
  t.mock.method(mysql, 'createConnection', async () => ({ query: async ({ sql }) => [data[sql.match(/FROM `([^`]+)`/)[1]]], end: async () => {} }))
  return buildGraphDataset(null, sources, bySource, elements)
}
const unified = (config) => ({ mapping_type: '关系', target_code: 'Contact', source_field: config.origin.kind === 'entity' ? config.origin.entityCode : config.origin.table, transform_rule: '关联方式：统一字段映射', mapping_config: { relation: config } })

test('multiple primary tables in one connection isolate properties and fuse common business identities', async (t) => {
  const result = await dataset(t)
  assert.equal(result.nodes.filter((node) => node.typeCode === 'Supplier').length, 3)
  const first = result.nodes.find((node) => node.identifier === 'C1')
  assert.equal(first.name, 'ERP甲')
  assert.equal(first.properties.find((property) => property.label === '电话').value, '100')
  assert.ok(!result.nodes.find((node) => node.identifier === 'C2').properties.some((property) => property.label === '电话'))
})
test('source priority controls conflicting values while nonempty lower priority values supplement', async (t) => {
  const rows = groupRows.map((row) => row.mapping_group === 'PURCHASE' && row.mapping_type === '实体类型' ? { ...row, mapping_config: { priority: 0 } } : row)
  const result = await dataset(t, rows)
  const first = result.nodes.find((node) => node.identifier === 'C1')
  assert.equal(first.name, '采购甲')
  assert.equal(first.properties.find((property) => property.label === '信用代码').value, 'C1')
})
test('priority applies across connections rather than depending on source ID order', async (t) => {
  const bySource = new Map([
    ['A', groupRows.filter((row) => row.mapping_group === 'ERP')],
    ['Z', groupRows.filter((row) => row.mapping_group === 'PURCHASE').map((row) => row.mapping_type === '实体类型' ? { ...row, mapping_config: { priority: 0 } } : row)],
  ])
  const result = await dataset(t, [], fixture(), [{ ...source, id: 'Z' }, { ...source, id: 'A' }], bySource)
  assert.equal(result.nodes.find((node) => node.identifier === 'C1').name, '采购甲')
})
test('a property in an orphan group cannot satisfy required coverage in another group', () => {
  const result = assessGraphMappingCoverage(elements, new Map([['DB', [groupRows[0], { ...groupRows[1], mapping_group: 'ORPHAN' }]]]))
  assert.deepEqual(result.missingRequiredCodes, ['Supplier.name'])
})
test('unified relation table uses explicit two endpoint fields and deduplicates repeated edges', async (t) => {
  const relation = unified({ origin: { kind: 'table', table: 'links' }, start: { field: 'supplier', match: '$identifier' }, end: { field: 'person', match: '$identifier' } })
  const result = await dataset(t, [...groupRows, relation])
  assert.equal(result.relations.length, 2)
  assert.ok(result.relations.every((edge) => edge.sourceId === result.nodes.find((node) => node.identifier === 'C1').id))
})
test('unified entity source uses fused attributes and supports nonunique phone matching', async (t) => {
  const relation = unified({ origin: { kind: 'entity', entityCode: 'Supplier' }, start: { field: '$identifier', match: '$identifier' }, end: { field: 'Supplier.phone', match: 'Person.phone' } })
  const result = await dataset(t, [...groupRows, relation])
  assert.equal(result.relations.length, 3)
  assert.equal(result.relations.filter((edge) => edge.sourceId === result.nodes.find((node) => node.identifier === 'C1').id).length, 2)
})
test('table source can match business properties instead of entity identifiers', async (t) => {
  const relation = unified({ origin: { kind: 'table', table: 'business_links' }, start: { field: 'credit', match: 'Supplier.credit' }, end: { field: 'phone', match: 'Person.phone' } })
  const data = { ...fixture(), business_links: [{ credit: 'C1', phone: '100' }] }
  const result = await dataset(t, [...groupRows, relation], data)
  assert.equal(result.relations.length, 2)
})
test('legacy property association and converted unified configuration generate identical edges', async (t) => {
  const legacy = { mapping_type: '关系', target_code: 'Contact', source_field: 'Supplier.phone = Person.phone', transform_rule: '关联方式：关联条件' }
  const before = await dataset(t, [...groupRows, legacy])
  const after = await dataset(t, [...groupRows, unified(relationConfiguration(legacy, elements.at(-1)))])
  assert.deepEqual(after.relations, before.relations)
})
test('legacy relation table conversion preserves both endpoint fields', () => {
  const config = relationConfiguration({ source_field: 'links', transform_rule: '关联方式：关系表；起点字段：supplier；终点字段：person' }, elements.at(-1))
  assert.deepEqual(config, { origin: { kind: 'table', table: 'links' }, start: { field: 'supplier', match: '$identifier' }, end: { field: 'person', match: '$identifier' } })
})
test('unified configuration rejects mismatched property ownership and stale origin fields', () => {
  const config = { origin: { kind: 'table', table: 'links' }, start: { field: 'supplier', match: 'Person.phone' }, end: { field: 'person', match: '$identifier' } }
  assert.match(relationConfigurationIssue(config, elements.at(-1), elements, ['Supplier', 'Person'], ['Person.phone'], [{ tableName: 'links', fields: ['supplier', 'person'] }]), /匹配属性/)
  assert.match(relationConfigurationIssue({ ...config, start: { field: 'missing', match: '$identifier' } }, elements.at(-1), elements, ['Supplier', 'Person'], [], [{ tableName: 'links', fields: ['supplier', 'person'] }]), /来源字段/)
})
test('unified relation dependencies include changed fields without requiring resave after priority reorder', () => {
  const relation = unified({ origin: { kind: 'entity', entityCode: 'Supplier' }, start: { field: '$identifier', match: '$identifier' }, end: { field: 'Supplier.phone', match: 'Person.phone' } })
  assert.equal(invalidateDependentRelations([relation], elements, groupRows[5], null)[0].status, '待检查')
  assert.equal(invalidateDependentRelations([relation], elements, groupRows[0], { ...groupRows[0], mapping_config: { priority: 5 } })[0], relation)
})
test('malformed unified configuration and negative source priorities are rejected', () => {
  assert.throws(() => normalizeMappingConfig('关系', { relation: { origin: { kind: 'table', table: 'links' } } }), /完整配置/)
  assert.throws(() => normalizeMappingConfig('实体类型', { priority: -1 }), /优先级/)
})
test('incomplete relation input prompts selection rather than reporting stale metadata', () => {
  const config = { origin: { kind: 'table', table: 'links' }, start: { field: 'supplier', match: '$identifier' }, end: { field: '', match: '$identifier' } }
  assert.match(relationConfigurationIssue(config, elements.at(-1), elements, ['Supplier', 'Person'], [], []), /请选择两端/)
})
