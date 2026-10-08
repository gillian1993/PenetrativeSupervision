import assert from 'node:assert/strict'
import test from 'node:test'
import { suggestGraphMappings } from '../graphAutoMapping.js'

const structure = [
  { type: 'class', code: 'Supplier', name: '供应商' },
  { type: 'class', code: 'Project', name: '采购项目' },
  { type: 'property', code: 'Supplier.id', name: '供应商编号', ownerCode: 'Supplier', constraint: '主标识、必填' },
  { type: 'property', code: 'Supplier.name', name: '供应商名称', ownerCode: 'Supplier' },
  { type: 'property', code: 'Project.supplierId', name: '供应商编号', ownerCode: 'Project' },
  { type: 'relation', code: 'Supplies', name: '供货', ownerCode: 'Supplier', targetCode: 'Project' },
]
const sources = [{ id: 'SRC-A', name: '供应商系统' }, { id: 'SRC-B', name: '项目系统' }]
const metadata = new Map([
  ['SRC-A', [{ tableName: 'supplier_master', displayName: '供应商主数据', fields: ['id', 'name'] }]],
  ['SRC-B', [{ tableName: 'purchase_project', displayName: '采购项目', fields: ['project_id', 'supplier_id'] }]],
])

test('batch suggestions select clear entity tables and dependent relation', () => {
  const preview = suggestGraphMappings(structure, sources, metadata, new Map())
  assert.equal(preview.entities.length, 2)
  assert.equal(preview.relations.length, 1)
  assert.equal(preview.relations[0].sourceField, 'Supplier.id = Project.supplierId')
})

test('existing manual entity mappings are preserved and ambiguity is skipped', () => {
  const ambiguous = new Map(metadata)
  ambiguous.set('SRC-A', [
    ...metadata.get('SRC-A'),
    { tableName: 'supplier_backup', displayName: '供应商备份', fields: ['id', 'name'] },
  ])
  const mappings = new Map([['SRC-B', [{ mapping_type: '实体类型', source_field: 'purchase_project', transform_rule: '主键字段：project_id', target_code: 'Project' }]]])
  const preview = suggestGraphMappings(structure, sources, ambiguous, mappings)
  assert.equal(preview.entities.length, 0)
  assert.equal(preview.relations.length, 0)
})

test('a clear dedicated relation table is suggested when property association is unavailable', () => {
  const withLink = [...sources, { id: 'SRC-LINK', name: '关联数据' }]
  const withMetadata = new Map(metadata)
  withMetadata.set('SRC-LINK', [{ tableName: 'supplier_project', displayName: '供应商项目关联', fields: ['supplier_id', 'project_id'] }])
  const withoutForeignProperty = structure.filter((item) => item.code !== 'Project.supplierId')
  const preview = suggestGraphMappings(withoutForeignProperty, withLink, withMetadata, new Map())
  assert.equal(preview.relations.length, 1)
  assert.equal(preview.relations[0].sourceId, 'SRC-LINK')
  assert.match(preview.relations[0].transform, /关系表/)
})
