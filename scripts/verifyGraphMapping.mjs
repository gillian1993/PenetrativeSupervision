import assert from 'node:assert/strict'
import fs from 'node:fs'
import mysql from 'mysql2/promise'

const base = 'http://127.0.0.1:4173/api'
const stamp = Date.now().toString(36)
const modelId = `ONT-MAPPING-${stamp.toUpperCase()}`
const prefix = `kg_mapping_${stamp}`
const tables = Object.fromEntries(['suppliers', 'details', 'projects', 'links', 'purchase'].map((name) => [name, `${prefix}_${name}`]))
const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)
  if (match) env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
}
const config = { databaseType: 'MySQL', host: env.MYSQL_HOST, port: env.MYSQL_PORT || '3306', username: env.MYSQL_USER, password: env.MYSQL_PASSWORD, databaseName: env.MYSQL_DATABASE, tables: Object.values(tables) }
const db = await mysql.createConnection({ host: config.host, port: Number(config.port), user: config.username, password: config.password, database: config.databaseName })
const results = [], graphs = []
let sourceId
const structure = [
  { type: 'class', code: 'VERIFY.Supplier', name: '供应商' },
  { type: 'class', code: 'VERIFY.Project', name: '项目' },
  { type: 'property', code: 'VERIFY.Supplier.name', name: '供应商名称', ownerCode: 'VERIFY.Supplier', constraint: '必填' },
  { type: 'property', code: 'VERIFY.Supplier.projectId', name: '关联项目标识', ownerCode: 'VERIFY.Supplier', constraint: '必填' },
  { type: 'property', code: 'VERIFY.Project.id', name: '项目标识', ownerCode: 'VERIFY.Project' },
  { type: 'relation', code: 'VERIFY.Supplies', name: '供货', ownerCode: 'VERIFY.Supplier', targetCode: 'VERIFY.Project' },
].map((item, index) => ({ id: `VERIFY-${index}`, dataType: item.type === 'class' ? '实体类型' : '文本', constraint: '', description: '', sourceType: 'model', ...item }))
async function request(path, body, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(`${base}/${path}`, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), signal: AbortSignal.timeout(60000) })
  const data = await response.json()
  return { status: response.status, data }
}
async function ok(path, body, method) { const result = await request(path, body, method); assert.ok(result.status < 300, `${path}: ${result.status} ${result.data.message}`); return result.data }
const pass = (name) => { results.push({ name, passed: true }); console.log(`通过：${name}`) }
let failure
try {
  await db.query(`CREATE TABLE \`${tables.suppliers}\` (row_no INT AUTO_INCREMENT PRIMARY KEY,id VARCHAR(20),name VARCHAR(80)) COMMENT='${prefix}'`)
  await db.query(`CREATE TABLE \`${tables.details}\` (supplier_id VARCHAR(20),project_id VARCHAR(20)) COMMENT='${prefix}'`)
  await db.query(`CREATE TABLE \`${tables.projects}\` (id VARCHAR(20)) COMMENT='${prefix}'`)
  await db.query(`CREATE TABLE \`${tables.links}\` (supplier_id VARCHAR(20),project_id VARCHAR(20)) COMMENT='${prefix}'`)
  await db.query(`CREATE TABLE \`${tables.purchase}\` (id VARCHAR(20),name VARCHAR(80),project_id VARCHAR(20)) COMMENT='${prefix}'`)
  await db.query(`INSERT INTO \`${tables.suppliers}\` (id,name) VALUES ('S1','供应商甲'),('S2','供应商乙')`)
  await db.query(`INSERT INTO \`${tables.details}\` VALUES ('S1','P1'),('S2','P2')`)
  await db.query(`INSERT INTO \`${tables.projects}\` VALUES ('P1'),('P2')`)
  await db.query(`INSERT INTO \`${tables.links}\` VALUES ('S1','P1'),('S1','P2'),('S1','P2')`)
  await db.query(`INSERT INTO \`${tables.purchase}\` VALUES ('S1','采购优先甲','P2'),('S3','采购新增丙','P1')`)
  await ok('ontologies', { id: modelId, name: '数据映射验收临时模型', domain: '通用', scope: '领域图谱模型' })
  for (const item of structure) await ok(`ontologies/${modelId}/elements`, { ...item, groupName: '未分组' })
  await ok(`ontologies/${modelId}/enable`, {})
  sourceId = (await ok('data-sources', { name: `数据映射验收-${stamp}`, mode: '数据库接入', range: '临时验收', owner: '自动验收', accessConfig: config })).id
  await ok(`data-sources/${sourceId}/toggle`, { enabled: true })
  await ok(`data-sources/${sourceId}/metadata/parse`, { ontologyId: modelId })
  const payload = { graphCode: `MAPPING-${stamp.toUpperCase()}`, graphName: '数据映射验收临时图谱', ontologyId: modelId, sourceIds: [sourceId], range: '临时验收', structureElements: structure }
  const graphId = (await ok('graphs/draft', payload)).id; graphs.push(graphId)
  const mappingPath = `data-sources/${sourceId}/mappings?ontologyId=${modelId}&graphId=${graphId}`
  const joins = [{ table: tables.details, mainField: 'id', joinField: 'supplier_id' }]
  const mappings = [
    { type: '实体类型', targetType: 'class', targetCode: 'VERIFY.Supplier', sourceField: tables.suppliers, transform: '主键字段：id', config: { joins } },
    { type: '实体类型', targetType: 'class', targetCode: 'VERIFY.Project', sourceField: tables.projects, transform: '主键字段：id' },
    { type: '属性', targetType: 'property', targetCode: 'VERIFY.Supplier.name', sourceField: 'name' },
    { type: '属性', targetType: 'property', targetCode: 'VERIFY.Supplier.projectId', sourceField: 'project_id', config: { sourceTable: tables.details } },
    { type: '属性', targetType: 'property', targetCode: 'VERIFY.Project.id', sourceField: 'id' },
    { type: '关系', targetType: 'relation', targetCode: 'VERIFY.Supplies', sourceField: 'VERIFY.Supplier.projectId = VERIFY.Project.id', transform: '关联方式：关联条件' },
  ]
  for (const mapping of mappings) await ok(mappingPath, { ontologyId: modelId, ...mapping })
  assert.deepEqual((await ok(mappingPath)).find((item) => item.targetCode === 'VERIFY.Supplier').config.joins, joins)
  assert.equal((await ok('graphs/dependencies/check', { ...payload, graphId })).ready, true)
  pass('关联表配置保存、重新加载、关联表属性参与关系配置检查')
  let graph = await ok(`graphs/${graphId}`, payload, 'PUT')
  assert.equal(graph.entities, 4); assert.equal(graph.relations, 2)
  assert.equal(graph.instanceDataset.nodes.find((node) => node.identifier === 'S1').properties.find((item) => item.label === '关联项目标识').value, 'P1')
  const snapshot = (await ok(`graphs/${graphId}/mapping-snapshots`))[0]
  assert.deepEqual(snapshot.rows.find((item) => item.targetCode === 'VERIFY.Supplier').config.joins, joins)
  graph = await ok(`graphs/${graphId}/sync`, {})
  assert.equal(graph.entities, 4); assert.equal(graph.relations, 2)
  pass('实际 MySQL 多表构图、版本快照与同步使用完整关联配置')

  const entityMapping = (await ok(mappingPath)).find((item) => item.targetCode === 'VERIFY.Supplier')
  await ok(`data-sources/${sourceId}/mappings/${entityMapping.id}?graphId=${graphId}`, { ontologyId: modelId, config: {} }, 'PUT')
  const invalid = await ok('graphs/dependencies/check', { ...payload, graphId })
  assert.equal(invalid.ready, false)
  assert.ok((await ok(mappingPath)).some((item) => item.type === '关系' && item.status === '待检查'))
  await ok(`data-sources/${sourceId}/mappings/${entityMapping.id}?graphId=${graphId}`, { ontologyId: modelId, config: { joins } }, 'PUT')
  await ok(mappingPath, { ontologyId: modelId, ...mappings.at(-1) })
  assert.equal((await ok('graphs/dependencies/check', { ...payload, graphId })).ready, true)
  pass('移除关联表使属性、关系失效，恢复并保存关系后重新就绪')

  await db.query(`INSERT INTO \`${tables.details}\` VALUES ('S1','P2')`)
  const duplicateJoin = await request(`graphs/${graphId}`, payload, 'PUT')
  assert.equal(duplicateJoin.status, 422); assert.match(duplicateJoin.data.message, /匹配多条/)
  await db.query(`DELETE FROM \`${tables.details}\` WHERE supplier_id='S1' AND project_id='P2'`)
  assert.equal((await ok(`graphs/${graphId}`)).entities, 4)
  await db.query(`INSERT INTO \`${tables.suppliers}\` (id,name) VALUES ('S1','重复供应商')`)
  const duplicateId = await request(`graphs/${graphId}`, payload, 'PUT')
  assert.equal(duplicateId.status, 422); assert.match(duplicateId.data.message, /唯一标识.*重复/)
  await db.query(`DELETE FROM \`${tables.suppliers}\` WHERE name='重复供应商'`)
  pass('关联表重复匹配与实体重复标识阻止生成，已生成数据保持完整')

  const relationTable = { ...mappings.at(-1), sourceField: tables.links, transform: '关联方式：关系表；起点字段：supplier_id；终点字段：project_id' }
  await ok(mappingPath, { ontologyId: modelId, ...relationTable })
  assert.equal((await ok('graphs/dependencies/check', { ...payload, graphId })).ready, true)
  graph = await ok(`graphs/${graphId}`, payload, 'PUT')
  assert.equal(graph.relations, 2)
  const supplier = graph.instanceDataset.nodes.find((node) => node.identifier === 'S1')
  assert.ok(graph.instanceDataset.relations.every((edge) => edge.sourceId === supplier.id))
  pass('关系映射切换为关系表，多条连线正确生成且重复边合并')

  // Also cover newly-created graphs that materialize shared mappings, without an edit draft.
  for (const mapping of mappings) await ok(`data-sources/${sourceId}/mappings`, { ontologyId: modelId, ...mapping })
  const shared = await ok('graphs', { ...payload, graphCode: `${payload.graphCode}-NEW` }); graphs.push(shared.id)
  assert.equal(shared.entities, 4); assert.equal(shared.relations, 2)
  assert.deepEqual((await ok(`graphs/${shared.id}/mapping-snapshots`))[0].rows.find((item) => item.targetCode === 'VERIFY.Supplier').config.joins, joins)
  pass('新建图谱的共享映射路径同样保存关联配置并生成正确数据')

  const extra = [
    { type: '实体类型', targetType: 'class', targetCode: 'VERIFY.Supplier', sourceField: tables.purchase, transform: '主键字段：id', groupId: 'EXTRA', config: { priority: 2 } },
    { type: '属性', targetType: 'property', targetCode: 'VERIFY.Supplier.name', sourceField: 'name', groupId: 'EXTRA' },
    { type: '属性', targetType: 'property', targetCode: 'VERIFY.Supplier.projectId', sourceField: 'project_id', groupId: 'EXTRA' },
  ]
  for (const mapping of extra) await ok(mappingPath, { ontologyId: modelId, ...mapping })
  let grouped = await ok(mappingPath)
  assert.equal(grouped.filter((item) => item.targetCode === 'VERIFY.Supplier').length, 2)
  assert.equal(grouped.filter((item) => item.targetCode === 'VERIFY.Supplier.name' && item.sourceField === 'name').length, 2)
  graph = await ok(`graphs/${graphId}`, payload, 'PUT')
  assert.equal(graph.entities, 5)
  assert.equal(graph.instanceDataset.nodes.find((node) => node.identifier === 'S1').name, '供应商甲')
  assert.ok(graph.instanceDataset.nodes.some((node) => node.identifier === 'S3'))
  pass('同一数据源的多张主表分别保存属性映射，相同字段名互不覆盖，按业务标识融合实例')

  grouped = await ok(mappingPath)
  for (const item of grouped.filter((row) => row.type === '实体类型' && row.targetCode === 'VERIFY.Supplier')) await ok(`data-sources/${sourceId}/mappings/${item.id}?graphId=${graphId}`, { ontologyId: modelId, config: { ...item.config, priority: item.groupId === 'EXTRA' ? 1 : 3 } }, 'PUT')
  const tableConfig = { origin: { kind: 'table', table: tables.links }, start: { field: 'supplier_id', match: '$identifier' }, end: { field: 'project_id', match: '$identifier' } }
  await ok(mappingPath, { ontologyId: modelId, ...mappings.at(-1), sourceField: tables.links, transform: '关联方式：统一字段映射', config: { relation: tableConfig } })
  assert.equal((await ok('graphs/dependencies/check', { ...payload, graphId })).ready, true)
  graph = await ok(`graphs/${graphId}`, payload, 'PUT')
  assert.equal(graph.entities, 5); assert.equal(graph.relations, 2)
  assert.equal(graph.instanceDataset.nodes.find((node) => node.identifier === 'S1').name, '采购优先甲')
  pass('来源优先级决定冲突属性取值，统一关系配置能够直接读取独立关系表')

  const entityConfig = { origin: { kind: 'entity', entityCode: 'VERIFY.Supplier' }, start: { field: '$identifier', match: '$identifier' }, end: { field: 'VERIFY.Supplier.projectId', match: '$identifier' } }
  await ok(mappingPath, { ontologyId: modelId, ...mappings.at(-1), sourceField: 'VERIFY.Supplier', transform: '关联方式：统一字段映射', config: { relation: entityConfig } })
  assert.equal((await ok('graphs/dependencies/check', { ...payload, graphId })).ready, true)
  graph = await ok(`graphs/${graphId}`, payload, 'PUT')
  assert.equal(graph.entities, 5); assert.equal(graph.relations, 3)
  const mergedSnapshots = (await ok(`graphs/${graphId}/mapping-snapshots`))[0].rows
  assert.deepEqual(mergedSnapshots.find((item) => item.type === '关系').config.relation, entityConfig)
  assert.equal(mergedSnapshots.filter((item) => item.targetCode === 'VERIFY.Supplier').length, 2)
  graph = await ok(`graphs/${graphId}/sync`, {})
  assert.equal(graph.entities, 5); assert.equal(graph.relations, 3)
  pass('统一关系配置读取多来源融合后的实体属性，多组配置、优先级与统一关联随快照同步保留')

  for (const mapping of extra) await ok(`data-sources/${sourceId}/mappings`, { ontologyId: modelId, ...mapping })
  const sharedGroups = await ok('graphs', { ...payload, graphCode: `${payload.graphCode}-GROUPS` }); graphs.push(sharedGroups.id)
  assert.equal(sharedGroups.entities, 5); assert.equal(sharedGroups.relations, 3)
  assert.equal((await ok(`graphs/${sharedGroups.id}/mapping-snapshots`))[0].rows.filter((item) => item.targetCode === 'VERIFY.Supplier').length, 2)
  pass('共享映射按组独立写入，直接创建图谱时多组来源及同名属性完整进入版本快照')

  grouped = await ok(mappingPath)
  for (const item of grouped.filter((row) => row.groupId === 'EXTRA')) await ok(`data-sources/${sourceId}/mappings/${item.id}?ontologyId=${modelId}&graphId=${graphId}`, undefined, 'DELETE')
  grouped = await ok(mappingPath)
  assert.equal(grouped.filter((item) => item.targetCode === 'VERIFY.Supplier').length, 1)
  assert.ok(grouped.some((item) => item.targetCode === 'VERIFY.Supplier.name' && !item.groupId))
  assert.equal((await ok('graphs/dependencies/check', { ...payload, graphId })).ready, false)
  pass('移除一组来源只移除该组映射，其他来源保留，受影响关系提示待确认')
} catch (error) { failure = error; console.error(error.message) }
finally {
  for (const id of graphs.reverse()) await ok(`graphs/${id}`, undefined, 'DELETE')
  if (sourceId) { await ok(`data-sources/${sourceId}/toggle`, { enabled: false }); await ok(`data-sources/${sourceId}`, undefined, 'DELETE') }
  // Only remove the exact model and tables created by this run.
  for (const table of ['ontology_elements', 'ontology_entity_groups', 'ontology_audits']) await db.query(`DELETE FROM \`${table}\` WHERE ontology_id=?`, [modelId])
  await db.query('DELETE FROM ontologies WHERE id=?', [modelId])
  for (const name of Object.values(tables)) {
    const [rows] = await db.query('SELECT TABLE_COMMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', [name])
    if (rows[0]?.TABLE_COMMENT === prefix) await db.query(`DROP TABLE \`${name}\``)
  }
  await db.end()
  fs.mkdirSync('outputs/knowledge-graph-demo-plan', { recursive: true })
  fs.writeFileSync('outputs/knowledge-graph-demo-plan/数据映射验收.json', JSON.stringify({ passed: !failure, results, error: failure?.message || '', temporaryAssetsRemoved: true }, null, 2))
}
if (failure) process.exitCode = 1
