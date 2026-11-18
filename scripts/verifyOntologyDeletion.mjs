import fs from 'node:fs'
import mysql from 'mysql2/promise'
import assert from 'node:assert/strict'

const base = 'http://127.0.0.1:4173/api'
const prefix = `ONT-DELETE-${Date.now().toString(36).toUpperCase()}`
const created = [], checks = []
async function request(path, body, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(`${base}/${path}`, { method, ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) })
  return { status: response.status, data: await response.json() }
}
async function ok(path, body, method) { const result = await request(path, body, method); assert.ok(result.status < 300, `${path}：${result.status} ${result.data.message}`); return result.data }
async function model(suffix) {
  const result = await ok('ontologies', { id: `${prefix}-${suffix}`, name: `模型删除验收-${suffix}`, domain: '通用', scope: '领域图谱模型', description: '仅本次自动验收使用的临时模型' })
  created.push(result.id)
  await ok(`ontologies/${result.id}/elements`, { type: 'class', code: 'VERIFY.Entity', name: '验收对象', groupName: '未分组', dataType: '实体类型' })
  return result.id
}
const remove = id => request(`ontologies/${id}`, undefined, 'DELETE')
const pass = name => { checks.push({ name, passed: true }); console.log(`通过：${name}`) }
let testGraph, error
try {
  const unused = await model('UNUSED')
  await ok(`ontologies/${unused}/enable`, {})
  assert.equal((await remove(unused)).status, 409)
  await ok(`ontologies/${unused}/disable`, {})
  assert.equal((await ok(`ontologies/${unused}/references`)).total, 0)
  assert.equal((await remove(unused)).status, 200)
  assert.equal((await request(`ontologies/${unused}`)).status, 404)
  assert.ok(!(await ok('ontologies')).some(row => row.id === unused))
  assert.equal((await request(`ontologies/${unused}/enable`, {})).status, 404)
  assert.equal((await request(`ontologies/${unused}/copy`, {})).status, 404)
  pass('启用时拒绝删除，停用且无引用时删除；删除后列表、详情、启用和复制均不可用')

  const referenced = await model('REFERENCED')
  await ok(`ontologies/${referenced}/enable`, {})
  testGraph = await ok('graphs/draft', { graphCode: 'MODEL-DELETE-REFERENCE', graphName: '模型删除引用验收临时草稿', ontologyId: referenced, sourceIds: [], structureElements: [] })
  await ok(`ontologies/${referenced}/disable`, {})
  const references = await ok(`ontologies/${referenced}/references`)
  assert.ok(references.items.some(item => item.type === 'graph' && item.objects.some(object => object.id === testGraph.id)))
  const blocked = await remove(referenced)
  assert.equal(blocked.status, 409)
  assert.ok(blocked.data.references.total > 0)
  assert.equal((await ok(`ontologies/${referenced}`)).status, '停用')
  await ok(`graphs/${testGraph.id}`, undefined, 'DELETE'); testGraph = null
  assert.equal((await remove(referenced)).status, 200)
  pass('停用模型被图谱草稿引用时拒绝删除，并返回引用清单；解除后可删除')

  const parent = await model('PARENT')
  const child = await ok(`ontologies/${parent}/copy`, {})
  created.push(child.id)
  const versionRefs = await ok(`ontologies/${parent}/references`)
  assert.ok(versionRefs.items.some(item => item.type === 'modelVersion' && item.objects.some(object => object.id === child.id)))
  assert.equal((await remove(parent)).status, 409)
  assert.equal((await remove(child.id)).status, 200)
  assert.equal((await remove(parent)).status, 200)
  pass('派生模型版本引用受到保护；子模型删除后父模型可删除')

  const concurrent = await model('CONCURRENT')
  const [deletion, enable] = await Promise.all([remove(concurrent), request(`ontologies/${concurrent}/enable`, {})])
  if (deletion.status === 200) {
    assert.ok([404, 409].includes(enable.status)); assert.equal((await request(`ontologies/${concurrent}`)).status, 404)
  } else {
    assert.equal(enable.status, 200); assert.equal(deletion.status, 409)
    await ok(`ontologies/${concurrent}/disable`, {}); assert.equal((await remove(concurrent)).status, 200)
  }
  pass('启用与删除并发操作不会复活已删除模型')
} catch (e) { error = e }
finally {
  if (testGraph) await request(`graphs/${testGraph.id}`, undefined, 'DELETE')
  for (const id of [...created].reverse()) {
    const result = await request(`ontologies/${id}`)
    if (result.status === 404) continue
    if (result.data.status === '启用') await request(`ontologies/${id}/disable`, {})
    const cleanup = await remove(id)
    if (cleanup.status !== 200 && cleanup.status !== 404) error ||= new Error(`临时模型清理失败：${id}`)
  }
}

if (!error) {
  const env = { ...process.env }
  for (const raw of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const line = raw.trim(), index = line.indexOf('=')
    if (!line || line.startsWith('#') || index < 1) continue
    const key = line.slice(0,index).trim()
    if (env[key] === undefined) env[key] = line.slice(index+1).trim().replace(/^['"]|['"]$/g,'')
  }
  const db = await mysql.createConnection({ host: env.MYSQL_HOST, port: Number(env.MYSQL_PORT||3306), user: env.MYSQL_USER, password: env.MYSQL_PASSWORD, database: env.MYSQL_DATABASE })
  try {
    await db.query('SET TRANSACTION READ ONLY'); await db.beginTransaction()
    for (const id of created) {
      const [models] = await db.query('SELECT status FROM ontologies WHERE id=?',[id])
      const [elements] = await db.query('SELECT COUNT(*) total FROM ontology_elements WHERE ontology_id=?',[id])
      const [audits] = await db.query('SELECT action FROM ontology_audits WHERE ontology_id=?',[id])
      assert.equal(models[0].status, '已删除'); assert.equal(Number(elements[0].total), 1)
      assert.ok(audits.some(row=>row.action==='删除图谱模型'))
      assert.ok(audits.length >= 2)
    }
    await db.rollback(); pass('数据库只读回查确认：模型记录、结构和历史审计均保留，新增删除审计')
  } catch (e) { error = e } finally { await db.end() }
}
fs.mkdirSync('outputs/knowledge-graph-demo-plan',{recursive:true})
fs.writeFileSync('outputs/knowledge-graph-demo-plan/模型删除验收.json',JSON.stringify({verifiedAt:new Date().toISOString(),passed:!error,checks,error:error?.message||null},null,2)+'\n')
if(error)throw error
