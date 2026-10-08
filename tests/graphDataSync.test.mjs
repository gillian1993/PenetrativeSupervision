import assert from 'node:assert/strict'
import test from 'node:test'
import ExcelJS from 'exceljs'
import { buildGraphDataset } from '../graphDataSync.js'

const structure = [
  { type: 'class', code: 'Supplier', name: '供应商' },
  { type: 'class', code: 'Project', name: '采购项目' },
  { type: 'property', code: 'Supplier.id', name: '供应商编号', ownerCode: 'Supplier' },
  { type: 'property', code: 'Supplier.name', name: '供应商名称', ownerCode: 'Supplier' },
  { type: 'property', code: 'Project.supplierId', name: '供应商编号', ownerCode: 'Project' },
  { type: 'relation', code: 'Supplies', name: '供货', ownerCode: 'Supplier', targetCode: 'Project' },
]
const mappings = [
  { mapping_type: '实体类型', source_field: 'file_1_sheet_1', transform_rule: '主键字段：id', target_code: 'Supplier' },
  { mapping_type: '实体类型', source_field: 'file_1_sheet_2', transform_rule: '主键字段：project_id', target_code: 'Project' },
  { mapping_type: '属性', source_field: 'id', target_code: 'Supplier.id' },
  { mapping_type: '属性', source_field: 'name', target_code: 'Supplier.name' },
  { mapping_type: '属性', source_field: 'supplier_id', target_code: 'Project.supplierId' },
  { mapping_type: '关系', source_field: 'Supplier.id = Project.supplierId', target_code: 'Supplies' },
]

async function filePool(supplierId = 'S-1') {
  const workbook = new ExcelJS.Workbook()
  const suppliers = workbook.addWorksheet('供应商')
  suppliers.addRow(['id', 'name'])
  suppliers.addRow([supplierId, '华星科技'])
  const projects = workbook.addWorksheet('采购项目')
  projects.addRow(['project_id', 'supplier_id'])
  projects.addRow(['P-1', 'S-1'])
  const content = Buffer.from(await workbook.xlsx.writeBuffer())
  return {
    async query(_sql, parameters) {
      const tables = new Set(parameters.slice(1))
      return [[1, 2].map((sheet) => ({ table_name: `file_1_sheet_${sheet}`, file_id: 1, file_name: '采购数据.xlsx', content })).filter((item) => tables.has(item.table_name))]
    },
  }
}

async function sourcePool(definitions) {
  const files = new Map()
  for (const [sourceId, { table, headers, values }] of Object.entries(definitions)) {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('数据')
    sheet.addRow(headers)
    sheet.addRow(values)
    files.set(sourceId, { table_name: table, file_id: sourceId, file_name: `${sourceId}.xlsx`, content: Buffer.from(await workbook.xlsx.writeBuffer()) })
  }
  return {
    async query(_sql, parameters) {
      const file = files.get(parameters[0])
      return [file && parameters.slice(1).includes(file.table_name) ? [file] : []]
    },
  }
}

test('file source builds mapped entities and joins relation properties', async () => {
  const dataset = await buildGraphDataset(await filePool(), [{ id: 'SRC-1', name: '采购数据', mode: '文件导入', status: '启用' }], new Map([['SRC-1', mappings]]), structure)
  assert.equal(dataset.nodes.length, 2)
  assert.equal(dataset.relations.length, 1)
  assert.equal(dataset.sourceStats[0].rows, 2)
  assert.equal(dataset.relations[0].sourceId, dataset.nodes.find((item) => item.typeCode === 'Supplier').id)
  assert.equal(dataset.nodes.find((item) => item.typeCode === 'Supplier').name, '华星科技')
})

test('missing entity identifier fails without producing a partial dataset', async () => {
  await assert.rejects(
    buildGraphDataset(await filePool(''), [{ id: 'SRC-1', name: '采购数据', mode: '文件导入', status: '启用' }], new Map([['SRC-1', mappings]]), structure),
    /缺少唯一标识/,
  )
})

test('different sources can populate different entity types and share a graph relation', async () => {
  const pool = await sourcePool({
    'SRC-SUPPLIER': { table: 'supplier_sheet_1', headers: ['id', 'name'], values: ['S-1', '华星科技'] },
    'SRC-PROJECT': { table: 'project_sheet_1', headers: ['project_id', 'supplier_id'], values: ['P-1', 'S-1'] },
  })
  const rows = new Map([
    ['SRC-SUPPLIER', [
      { mapping_type: '实体类型', source_field: 'supplier_sheet_1', transform_rule: '主键字段：id', target_code: 'Supplier' },
      { mapping_type: '属性', source_field: 'id', target_code: 'Supplier.id' },
      { mapping_type: '属性', source_field: 'name', target_code: 'Supplier.name' },
      { mapping_type: '关系', source_field: 'Supplier.id = Project.supplierId', target_code: 'Supplies' },
    ]],
    ['SRC-PROJECT', [
      { mapping_type: '实体类型', source_field: 'project_sheet_1', transform_rule: '主键字段：project_id', target_code: 'Project' },
      { mapping_type: '属性', source_field: 'supplier_id', target_code: 'Project.supplierId' },
    ]],
  ])
  const dataset = await buildGraphDataset(pool, [
    { id: 'SRC-PROJECT', name: '采购系统', mode: '文件导入', status: '启用' },
    { id: 'SRC-SUPPLIER', name: '工商系统', mode: '文件导入', status: '启用' },
  ], rows, structure)
  assert.equal(dataset.nodes.length, 2)
  assert.equal(dataset.relations.length, 1)
})

test('same entity merges by identifier and keeps the first nonempty value by source ID', async () => {
  const enrichedStructure = [...structure, { type: 'property', code: 'Supplier.credit', name: '信用代码', ownerCode: 'Supplier', constraint: '必填' }]
  const pool = await sourcePool({
    'SRC-A': { table: 'first_sheet_1', headers: ['id', 'name'], values: ['S-1', '华星科技'] },
    'SRC-B': { table: 'second_sheet_1', headers: ['id', 'name', 'credit'], values: ['S-1', '其他名称', '91310000X'] },
  })
  const rows = new Map([
    ['SRC-A', [
      { mapping_type: '实体类型', source_field: 'first_sheet_1', transform_rule: '主键字段：id', target_code: 'Supplier' },
      { mapping_type: '属性', source_field: 'id', target_code: 'Supplier.id' },
      { mapping_type: '属性', source_field: 'name', target_code: 'Supplier.name' },
    ]],
    ['SRC-B', [
      { mapping_type: '实体类型', source_field: 'second_sheet_1', transform_rule: '主键字段：id', target_code: 'Supplier' },
      { mapping_type: '属性', source_field: 'id', target_code: 'Supplier.id' },
      { mapping_type: '属性', source_field: 'name', target_code: 'Supplier.name' },
      { mapping_type: '属性', source_field: 'credit', target_code: 'Supplier.credit' },
    ]],
  ])
  const sources = [
    { id: 'SRC-B', name: '补充来源', mode: '文件导入', status: '启用' },
    { id: 'SRC-A', name: '主来源', mode: '文件导入', status: '启用' },
  ]
  const dataset = await buildGraphDataset(pool, sources, rows, enrichedStructure)
  assert.equal(dataset.nodes.length, 1)
  assert.equal(dataset.nodes[0].name, '华星科技')
  assert.equal(dataset.nodes[0].properties.find((item) => item.label === '信用代码')?.value, '91310000X')
})

test('complementary mappings still reject rows whose identifiers do not join', async () => {
  const enrichedStructure = [...structure, { type: 'property', code: 'Supplier.credit', name: '信用代码', ownerCode: 'Supplier', constraint: '必填' }]
  const pool = await sourcePool({
    'SRC-A': { table: 'first_sheet_1', headers: ['id', 'name'], values: ['S-1', '华星科技'] },
    'SRC-B': { table: 'second_sheet_1', headers: ['id', 'credit'], values: ['S-2', '91310000X'] },
  })
  const rows = new Map([
    ['SRC-A', [
      { mapping_type: '实体类型', source_field: 'first_sheet_1', transform_rule: '主键字段：id', target_code: 'Supplier' },
      { mapping_type: '属性', source_field: 'name', target_code: 'Supplier.name' },
    ]],
    ['SRC-B', [
      { mapping_type: '实体类型', source_field: 'second_sheet_1', transform_rule: '主键字段：id', target_code: 'Supplier' },
      { mapping_type: '属性', source_field: 'credit', target_code: 'Supplier.credit' },
    ]],
  ])
  const sources = [
    { id: 'SRC-A', name: '主来源', mode: '文件导入', status: '启用' },
    { id: 'SRC-B', name: '补充来源', mode: '文件导入', status: '启用' },
  ]
  await assert.rejects(buildGraphDataset(pool, sources, rows, enrichedStructure), /缺少必填属性 信用代码/)
})

test('later source can supply a display name when the first source only has an identifier', async () => {
  const pool = await sourcePool({
    'SRC-A': { table: 'first_sheet_1', headers: ['id'], values: ['S-1'] },
    'SRC-B': { table: 'second_sheet_1', headers: ['id', 'name'], values: ['S-1', '华星科技'] },
  })
  const rows = new Map([
    ['SRC-A', [{ mapping_type: '实体类型', source_field: 'first_sheet_1', transform_rule: '主键字段：id', target_code: 'Supplier' }]],
    ['SRC-B', [
      { mapping_type: '实体类型', source_field: 'second_sheet_1', transform_rule: '主键字段：id', target_code: 'Supplier' },
      { mapping_type: '属性', source_field: 'name', target_code: 'Supplier.name' },
    ]],
  ])
  const dataset = await buildGraphDataset(pool, [
    { id: 'SRC-A', name: '主来源', mode: '文件导入', status: '启用' },
    { id: 'SRC-B', name: '名称来源', mode: '文件导入', status: '启用' },
  ], rows, structure)
  assert.equal(dataset.nodes.length, 1)
  assert.equal(dataset.nodes[0].name, '华星科技')
})

test('a relation-only source can build edges from a dedicated relation table', async () => {
  const pool = await sourcePool({
    'SRC-SUPPLIER': { table: 'supplier_sheet_1', headers: ['id', 'name'], values: ['S-1', '华星科技'] },
    'SRC-PROJECT': { table: 'project_sheet_1', headers: ['project_id'], values: ['P-1'] },
    'SRC-LINK': { table: 'supplier_project_sheet_1', headers: ['supplier_id', 'project_id'], values: ['S-1', 'P-1'] },
  })
  const rows = new Map([
    ['SRC-SUPPLIER', [{ mapping_type: '实体类型', source_field: 'supplier_sheet_1', transform_rule: '主键字段：id', target_code: 'Supplier' }]],
    ['SRC-PROJECT', [{ mapping_type: '实体类型', source_field: 'project_sheet_1', transform_rule: '主键字段：project_id', target_code: 'Project' }]],
    ['SRC-LINK', [{ mapping_type: '关系', source_field: 'supplier_project_sheet_1', transform_rule: '关联方式：关系表；起点字段：supplier_id；终点字段：project_id', target_code: 'Supplies' }]],
  ])
  const sources = [
    { id: 'SRC-SUPPLIER', name: '供应商', mode: '文件导入', status: '启用' },
    { id: 'SRC-PROJECT', name: '项目', mode: '文件导入', status: '启用' },
    { id: 'SRC-LINK', name: '关联表', mode: '文件导入', status: '启用' },
  ]
  const dataset = await buildGraphDataset(pool, sources, rows, structure)
  assert.equal(dataset.nodes.length, 2)
  assert.equal(dataset.relations.length, 1)
  assert.equal(dataset.relations[0].sourceName, '关联表')
})
