import assert from 'node:assert/strict'
import test from 'node:test'
import mysql from 'mysql2/promise'
import { buildGraphDataset } from '../graphDataSync.js'
import { relationConfiguration, relationConfigurationIssue } from '../graphMappingConfig.js'
import { directRelationConfiguration, intermediateRelationConfiguration, relationFieldSelection } from '../relationMappingForm.js'

const relation = { type: 'relation', code: 'Contact', name: '联系', ownerCode: 'Supplier', targetCode: 'Person' }
const elements = [
  { type: 'class', code: 'Supplier', name: '供应商' }, { type: 'class', code: 'Person', name: '人员' },
  { type: 'property', code: 'Supplier.phone', ownerCode: 'Supplier', name: '电话' },
  { type: 'property', code: 'Person.phone', ownerCode: 'Person', name: '电话' },
  { type: 'property', code: 'Person.supplierId', ownerCode: 'Person', name: '供应商编号' }, relation,
]
const mappings = [
  { mapping_type: '实体类型', target_code: 'Supplier', source_field: 'suppliers', transform_rule: '主键字段：id' },
  { mapping_type: '实体类型', target_code: 'Person', source_field: 'people', transform_rule: '主键字段：id' },
  { mapping_type: '属性', target_code: 'Supplier.phone', source_field: 'phone' },
  { mapping_type: '属性', target_code: 'Person.phone', source_field: 'phone' },
  { mapping_type: '属性', target_code: 'Person.supplierId', source_field: 'supplier_id' },
]
const data = { suppliers: [{ id: 'S1', phone: '100' }, { id: 'S2', phone: '200' }], people: [{ id: 'P1', phone: '100', supplier_id: 'S1' }, { id: 'P2', phone: '100', supplier_id: 'S1' }, { id: 'P3', phone: '200', supplier_id: 'S2' }], links: [{ supplier: 'S1', person: 'P1' }, { supplier: 'S1', person: 'P2' }], phone_links: [{ supplier_phone: '100', person_phone: '100' }] }
async function generate(t, config, legacy) {
  t.mock.method(mysql, 'createConnection', async () => ({ query: async ({ sql }) => [data[sql.match(/FROM `([^`]+)`/)[1]]], end: async () => {} }))
  const row = legacy || { mapping_type: '关系', target_code: relation.code, source_field: config.origin.kind === 'table' ? config.origin.table : config.origin.entityCode, transform_rule: '关联方式：统一字段映射', mapping_config: { relation: config } }
  return buildGraphDataset(null, [{ id: 'DB', name: '测试库', mode: '数据库接入', status: '启用', access_config: { databaseType: 'MySQL' } }], new Map([['DB', [...mappings, row]]]), elements)
}

test('two entity association fields generate nonunique phone relations without an intermediate table', async (t) => {
  const config = directRelationConfiguration(relation, 'Supplier.phone', 'Person.phone')
  assert.equal((await generate(t, config)).relations.length, 3)
  assert.deepEqual(relationFieldSelection(config, relation), { kind: 'direct', sourceField: 'Supplier.phone', targetField: 'Person.phone' })
})
test('direct association also supports a unique identifier matched to a foreign key property', async (t) => {
  const config = directRelationConfiguration(relation, '$identifier', 'Person.supplierId')
  assert.equal((await generate(t, config)).relations.length, 3)
})
test('legacy property associations retain identical edges when edited using the compact form', async (t) => {
  const legacy = { mapping_type: '关系', target_code: relation.code, source_field: 'Supplier.phone = Person.phone', transform_rule: '关联方式：关联条件' }
  const decoded = relationConfiguration(legacy, relation)
  const form = relationFieldSelection(decoded, relation)
  const before = await generate(t, null, legacy)
  const after = await generate(t, directRelationConfiguration(relation, form.sourceField, form.targetField))
  assert.deepEqual(after.relations, before.relations)
})
test('the compact intermediate table fields map to the two entity identifiers by default', async (t) => {
  const config = intermediateRelationConfiguration('links')
  config.start.field = 'supplier'; config.end.field = 'person'
  assert.equal((await generate(t, config)).relations.length, 2)
  assert.deepEqual(relationFieldSelection(config, relation), { kind: 'table', sourceField: 'supplier', targetField: 'person' })
})
test('changing the intermediate table clears both columns and previous custom matches', () => {
  const reset = intermediateRelationConfiguration('new_links')
  assert.equal(reset.start.field, ''); assert.equal(reset.end.field, '')
  assert.equal(reset.start.match, '$identifier'); assert.equal(reset.end.match, '$identifier')
  assert.match(relationConfigurationIssue(reset, relation, elements, ['Supplier', 'Person'], ['Supplier.phone', 'Person.phone'], []), /请选择两端/)
})
test('clearing the optional table requires explicitly choosing both entity association fields', () => {
  const cleared = directRelationConfiguration(relation)
  assert.deepEqual(relationFieldSelection(cleared, relation), { kind: 'direct', sourceField: '', targetField: '' })
  assert.match(relationConfigurationIssue(cleared, relation, elements, ['Supplier', 'Person'], ['Supplier.phone', 'Person.phone'], []), /请选择两端/)
})
test('custom table matching survives compact projection and generates the same relationships', async (t) => {
  const config = { origin: { kind: 'table', table: 'phone_links' }, start: { field: 'supplier_phone', match: 'Supplier.phone' }, end: { field: 'person_phone', match: 'Person.phone' } }
  const original = JSON.stringify(config)
  const form = relationFieldSelection(config, relation)
  assert.equal(form.sourceField, 'supplier_phone'); assert.equal(form.targetField, 'person_phone')
  assert.equal(JSON.stringify(config), original)
  assert.equal((await generate(t, config)).relations.length, 2)
})
test('nonstandard entity-origin configurations remain intact in advanced settings', async (t) => {
  const config = { origin: { kind: 'entity', entityCode: 'Person' }, start: { field: 'Person.supplierId', match: '$identifier' }, end: { field: '$identifier', match: '$identifier' } }
  const original = JSON.stringify(config)
  assert.equal(relationFieldSelection(config, relation).kind, 'custom')
  assert.equal(JSON.stringify(config), original)
  assert.equal((await generate(t, config)).relations.length, 3)
})
test('legacy intermediate table rules retain the original columns and identifier matching', async (t) => {
  const legacy = { mapping_type: '关系', target_code: relation.code, source_field: 'links', transform_rule: '关联方式：关系表；起点字段：supplier；终点字段：person' }
  const config = relationConfiguration(legacy, relation)
  assert.equal(relationFieldSelection(config, relation).kind, 'table')
  assert.deepEqual((await generate(t, config)).relations, (await generate(t, null, legacy)).relations)
})
