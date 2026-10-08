import assert from 'node:assert/strict'
import test from 'node:test'
import { assessGraphMappingCoverage } from '../graphMappingCoverage.js'

const structure = [
  { type: 'class', code: 'Supplier', name: '供应商' },
  { type: 'class', code: 'Order', name: '订单' },
  { type: 'class', code: 'Invoice', name: '发票' },
  { type: 'property', code: 'Supplier.id', ownerCode: 'Supplier', constraint: '必填' },
  { type: 'property', code: 'Order.id', ownerCode: 'Order', constraint: '必填' },
  { type: 'property', code: 'Invoice.id', ownerCode: 'Invoice', constraint: '必填' },
]

test('complementary sources cover different mapped entities without each covering the whole model', () => {
  const mappings = new Map([
    ['SRC-SUPPLIER', [
      { mapping_type: '实体类型', target_code: 'Supplier', source_field: 'suppliers', transform_rule: '主键字段：id' },
      { mapping_type: '属性', target_code: 'Supplier.id', source_field: 'id' },
    ]],
    ['SRC-ORDER', [
      { mapping_type: '实体类型', target_code: 'Order', source_field: 'orders', transform_rule: '主键字段：order_id' },
      { mapping_type: '属性', target_code: 'Order.id', source_field: 'order_id' },
    ]],
  ])
  const result = assessGraphMappingCoverage(structure, mappings)
  assert.deepEqual(result.missingRequiredCodes, [])
  assert.deepEqual(result.sourcesWithoutEntityMapping, [])
  assert.deepEqual(result.mappedEntityCodes, ['Supplier', 'Order'])
})

test('a required field counts only when its source also maps the owning entity', () => {
  const mappings = new Map([
    ['SRC-SUPPLIER', [
      { mapping_type: '实体类型', target_code: 'Supplier', source_field: 'suppliers', transform_rule: '主键字段：id' },
    ]],
    ['SRC-OTHER', [
      { mapping_type: '属性', target_code: 'Supplier.id', source_field: 'id' },
    ]],
  ])
  const result = assessGraphMappingCoverage(structure, mappings)
  assert.deepEqual(result.missingRequiredCodes, ['Supplier.id'])
  assert.deepEqual(result.sourcesWithoutEntityMapping, ['SRC-OTHER'])
})
