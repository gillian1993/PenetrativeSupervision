import assert from 'node:assert/strict'
import test from 'node:test'
import mysql from 'mysql2/promise'
import { buildGraphDataset } from '../graphDataSync.js'
import { entityConfigurationIssue, invalidateDependentRelations, normalizeMappingConfig, propertyMappingAvailable } from '../graphMappingConfig.js'

const elements = [
  { type: 'class', code: 'Supplier', name: '供应商' },
  { type: 'class', code: 'Project', name: '项目' },
  { type: 'property', code: 'Supplier.name', name: '名称', ownerCode: 'Supplier', constraint: '必填' },
  { type: 'property', code: 'Supplier.detailId', name: '扩展记录标识', ownerCode: 'Supplier' },
  { type: 'property', code: 'Supplier.projectId', name: '项目标识', ownerCode: 'Supplier' },
  { type: 'property', code: 'Project.id', name: '项目标识', ownerCode: 'Project' },
  { type: 'relation', code: 'Supplies', name: '供货', ownerCode: 'Supplier', targetCode: 'Project' },
]
const entity = { mapping_type: '实体类型', source_field: 'suppliers', target_code: 'Supplier', transform_rule: '主键字段：id', mapping_config: { joins: [{ table: 'details', mainField: 'id', joinField: 'supplier_id' }] } }
const detailProperty = { mapping_type: '属性', target_code: 'Supplier.projectId', source_field: 'project_id', mapping_config: { sourceTable: 'details' } }
const relation = { mapping_type: '关系', target_code: 'Supplies', source_field: 'Supplier.projectId = Project.id', transform_rule: '关联方式：关联条件' }
const rows = [entity,
  { mapping_type: '属性', target_code: 'Supplier.name', source_field: 'name' },
  { mapping_type: '属性', target_code: 'Supplier.detailId', source_field: 'id', mapping_config: { sourceTable: 'details' } },
  detailProperty,
  { mapping_type: '实体类型', source_field: 'projects', target_code: 'Project', transform_rule: '主键字段：id' },
  { mapping_type: '属性', target_code: 'Project.id', source_field: 'id' }, relation,
]
const fixture = () => ({ suppliers: [{ id: 'S1', name: '供应商甲' }, { id: 'S2', name: '供应商乙' }], details: [{ id: 'D1', supplier_id: 'S1', project_id: 'P1' }, { id: 'D2', supplier_id: 'S2', project_id: 'P2' }], projects: [{ id: 'P1' }, { id: 'P2' }], links: [{ supplier_id: 'S1', project_id: 'P1' }, { supplier_id: 'S1', project_id: 'P2' }, { supplier_id: 'S1', project_id: 'P2' }] })
const source = { id: 'DB', name: '测试数据源', mode: '数据库接入', status: '启用', access_config: { databaseType: 'MySQL' } }
async function dataset(t, data = fixture(), mappings = rows, structure = elements) {
  t.mock.method(mysql, 'createConnection', async () => ({
    query: async ({ sql }) => { const table = sql.match(/FROM `([^`]+)`/)[1]; assert.ok(Object.hasOwn(data, table), `unexpected table ${table}`); return [data[table]] },
    end: async () => {},
  }))
  return buildGraphDataset(null, [source], new Map([['DB', JSON.parse(JSON.stringify(mappings))]]), structure)
}

test('joined attributes retain primary identities and participate in property relations', async (t) => {
  const result = await dataset(t)
  assert.equal(result.nodes.length, 4)
  assert.equal(result.relations.length, 2)
  const supplier = result.nodes.find((node) => node.identifier === 'S1')
  assert.equal(supplier.name, '供应商甲')
  assert.equal(supplier.properties.find((item) => item.label === '扩展记录标识').value, 'D1')
  assert.equal(result.relations.find((item) => item.sourceId === supplier.id).targetId, result.nodes.find((item) => item.identifier === 'P1').id)
})
test('left joins preserve unmatched primary entities without borrowing same-name primary fields', async (t) => {
  const data = fixture(); data.details.pop()
  const result = await dataset(t, data)
  assert.equal(result.nodes.length, 4)
  assert.equal(result.relations.length, 1)
  assert.ok(!result.nodes.find((node) => node.identifier === 'S2').properties.some((item) => item.label === '扩展记录标识'))
})
test('multiple matches report the source row instead of expanding the entity population', async (t) => {
  const data = fixture(); data.details.push({ ...data.details[0], id: 'D3' })
  await assert.rejects(dataset(t, data), /suppliers 第 2 行.*details 匹配多条记录/)
})
test('a missing joined required property fails generation', async (t) => {
  const data = fixture(); data.details.pop()
  await assert.rejects(dataset(t, data, rows, elements.map((item) => item.code === 'Supplier.projectId' ? { ...item, constraint: '必填' } : item)), /S2 缺少必填属性 项目标识/)
})
test('duplicate primary identifiers fail while independent sources can still fuse', async (t) => {
  const data = fixture(); data.suppliers.push({ ...data.suppliers[0] })
  await assert.rejects(dataset(t, data), /唯一标识 id=S1 重复/)
})
test('removing a join leaves its property explicitly invalid instead of reading the primary table', async (t) => {
  await assert.rejects(dataset(t, fixture(), rows.map((row) => row === entity ? { ...row, mapping_config: {} } : row)), /来源表 details 已移除/)
})
test('relation table mode builds multiple edges and deduplicates identical endpoints', async (t) => {
  const mappings = rows.map((row) => row === relation ? { ...row, source_field: 'links', transform_rule: '关联方式：关系表；起点字段：supplier_id；终点字段：project_id' } : row)
  const result = await dataset(t, fixture(), mappings)
  assert.equal(result.relations.length, 2)
  assert.ok(result.relations.every((edge) => edge.sourceId === result.nodes.find((node) => node.identifier === 'S1').id))
})
test('relation tables reject unresolved endpoint identifiers', async (t) => {
  const data = fixture(); data.links[0].project_id = 'missing'
  const mappings = rows.map((row) => row === relation ? { ...row, source_field: 'links', transform_rule: '关联方式：关系表；起点字段：supplier_id；终点字段：project_id' } : row)
  await assert.rejects(dataset(t, data, mappings), /links 第 2 行关联实体不存在/)
})

const metadata = [{ tableName: 'suppliers', fields: ['id', 'name'] }, { tableName: 'details', fields: ['id', 'supplier_id', 'project_id'] }]
test('joined properties are available to relation selectors only with valid join metadata', () => {
  assert.equal(propertyMappingAvailable(entity, detailProperty, metadata), true)
  assert.equal(propertyMappingAvailable({ ...entity, mapping_config: {} }, detailProperty, metadata), false)
  assert.match(entityConfigurationIssue(entity, metadata.slice(0, 1)), /details/)
})
test('mapping configuration rejects incomplete, duplicate, and malformed options', () => {
  assert.throws(() => normalizeMappingConfig('实体类型', { joins: [{ table: 'details' }] }), /完整配置/)
  assert.throws(() => normalizeMappingConfig('实体类型', { joins: [...entity.mapping_config.joins, ...entity.mapping_config.joins] }), /重复添加/)
  assert.throws(() => normalizeMappingConfig('实体类型', 'bad json'), /格式无效/)
})
test('identity and joined field changes mark dependent relations for review', () => {
  assert.equal(invalidateDependentRelations([relation], elements, entity, { ...entity, transform_rule: '主键字段：code' })[0].status, '待检查')
  assert.equal(invalidateDependentRelations([relation], elements, entity, { ...entity, mapping_config: {} })[0].status, '待检查')
  assert.equal(invalidateDependentRelations([relation], elements, detailProperty, null)[0].status, '待检查')
})
test('adding a new supplemental table preserves existing relation configuration', () => {
  const next = { ...entity, mapping_config: { joins: [...entity.mapping_config.joins, { table: 'risk', mainField: 'id', joinField: 'supplier_id' }] } }
  assert.equal(invalidateDependentRelations([relation], elements, entity, next)[0], relation)
})
