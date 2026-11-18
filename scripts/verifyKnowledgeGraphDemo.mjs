import assert from 'node:assert/strict'
import fs from 'node:fs'

const base = 'http://127.0.0.1:4173'
const results = []
async function request(path, body, method) {
  const response = await fetch(`${base}/api/${path}`, body !== undefined || method ? { method: method || 'POST', headers: { 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(240000) } : undefined)
  const data = await response.json()
  return { status: response.status, data }
}
const ok = async (path, body, method) => { const result = await request(path, body, method); assert.ok(result.status < 300, `${path}: ${result.status} ${result.data.message}`); return result.data }
const done = (name, detail) => { results.push({ name, passed: true, detail }); console.log(`通过：${name}${detail ? ` · ${detail}` : ''}`) }

let failure
try {
  // Start from a fresh registered batch so concurrency and recovery are tested from a clean state.
  const status = await ok('knowledge-graph-demo/prepare', {})
  assert.ok(status.ready)
  assert.equal(status.assets.model.length, 8); assert.equal(status.assets.source.length, 10); assert.equal(status.assets.graph.length, 8)
  const all = await ok('graphs')
  const graphs = await Promise.all(all.filter(graph => status.assets.graph.includes(graph.id)).map(graph => ok(`graphs/${graph.id}`)))
  assert.equal(graphs.length, 8)
  const main = graphs.find(graph => graph.graphName === '采购全流程监管图谱')
  const contact = graphs.find(graph => graph.graphName === '供应商联系分析图谱')
  const quality = graphs.find(graph => graph.graphName === '质量检查待完善图谱')
  const failed = graphs.find(graph => graph.graphName === '生成失败恢复样例')
  assert.equal(main.entities, 394); assert.equal(main.relations, 426)
  assert.ok(main.ontologyVersion.endsWith('V1'))
  assert.equal(new Set(main.instanceDataset.nodes.map(node => node.id)).size, 394)
  const ids = new Set(main.instanceDataset.nodes.map(node => node.id))
  assert.ok(main.instanceDataset.relations.every(edge => ids.has(edge.sourceId) && ids.has(edge.targetId)))
  assert.ok(graphs.filter(graph => graph.status !== '草稿').every(graph => graph.instanceDataset?.nodes.length))
  done('初始资产与实际实例一致', '8 模型 / 10 来源 / 8 图谱；主图谱394实体426关系')

  const sources = await ok('data-sources')
  const ownedSources = sources.filter(source => status.assets.source.includes(source.id))
  assert.equal(new Set(ownedSources.map(source => source.mode)).size, 3)
  assert.equal(ownedSources.filter(source => source.status === '启用' && source.connectionStatus === '正常').length, 5)
  for (const name of ['ERP','OA','TREASURY','EXTERNAL']) {
    const result = await ok(`data-sources/KG-DEMO-S-${name}/test`, {})
    assert.ok(result.ok)
  }
  done('三类来源真实可用', 'MySQL/API实测成功，文件已实际构建主图谱')

  const draft=graphs.find(graph=>graph.graphName==='采购图谱配置草稿')
  const mappings=await Promise.all(draft.sourceIds.map(sourceId=>ok(`data-sources/${sourceId}/mappings?ontologyId=${draft.ontologyId}&graphId=${draft.id}`)))
  assert.equal(mappings.flat().filter(row=>row.type==='实体类型').length,12)
  assert.equal(mappings.flat().filter(row=>row.type==='关系').length,14)
  done('多来源并发续编映射', '5个来源同时初始化同一草稿，12类实体和14类关系完整读取')

  const extension=await ok('ontologies/KG-DEMO-M-EXTEND/enable',{})
  const automaticPayload={ontologyId:extension.id,sourceIds:main.sourceIds,structureElements:extension.elements}
  const preview=await ok('graphs/mappings/auto/preview',automaticPayload)
  assert.equal(preview.entities.length,12);assert.equal(preview.relations.length,14)
  await ok('graphs/mappings/auto/apply',automaticPayload)
  const automatic=await ok('graphs',{...automaticPayload,graphCode:'KG-DEMO-AUTO-VERIFY',graphName:'自动映射验收练习',tag:'采购监管',range:'独立演示批次自动验收',demoBatch:status.batchId})
  assert.equal(automatic.entities,394);assert.equal(automatic.relations,426)
  done('自动映射与多模型复用','同一组来源复用至扩展模型，自动配置12实体类型14关系并实际生成图谱')

  const check = await ok(`graphs/${quality.id}/check`, {})
  assert.equal(check.blockers, 1); assert.equal(check.ready, false)
  const blocked = await request(`graphs/${quality.id}/publish`, {})
  assert.equal(blocked.status, 409)
  done('发布阻断', '错误信用代码和异常来源不能发布')

  const qualityBefore = JSON.stringify(quality.instanceDataset)
  assert.equal((await request(`graphs/${quality.id}/sync`, {})).status, 409)
  assert.equal(JSON.stringify((await ok(`graphs/${quality.id}`)).instanceDataset), qualityBefore)
  assert.equal((await ok(`graphs/${quality.id}/sync-records`))[0].status, '失败')
  done('同步失败留痕与回滚', '异常来源失败后实例不被覆盖')

  await ok('knowledge-graph-demo/control', { failure: false, qualityError: false })
  const fixed = await ok(`graphs/${quality.id}/sync`, {})
  assert.equal(fixed.blockers, 0); assert.equal((await ok(`graphs/${quality.id}/check`, {})).ready, true)
  await ok(`graphs/${quality.id}/publish`, {})
  await ok(`graphs/${quality.id}/unpublish`, {})
  done('异常修复与发布流转', '来源恢复→重建→复检→发布→取消发布')

  const tasks = await ok(`graphs/${contact.id}/governance`)
  const task = tasks.find(task => task.status !== '已处理')
  assert.ok(task)
  await ok(`graphs/${contact.id}/governance/${task.id}`, { result: '合并', reason: '自动验收：核验演示信用代码一致，合并候选并检查关系端点' })
  const merged = await ok(`graphs/${contact.id}`)
  assert.equal(merged.entities, contact.entities - 1)
  const mergedIds = new Set(merged.instanceDataset.nodes.map(node => node.id))
  assert.ok(merged.instanceDataset.relations.every(edge => mergedIds.has(edge.sourceId) && mergedIds.has(edge.targetId)))
  assert.equal((await ok(`graphs/${contact.id}/governance`)).find(row => row.id === task.id).status, '已处理')
  done('实例治理实际生效', `实体 ${contact.entities}→${merged.entities}，关联端点完整，处理记录保留`)

  const original = JSON.stringify(main.instanceDataset)
  await ok('knowledge-graph-demo/control', { version: 2, delayMs: 800 })
  const version = await ok(`graphs/${main.id}/sync`, {})
  assert.notEqual(version.id, main.id); assert.equal(version.status, '待发布'); assert.equal(version.entities, 395)
  assert.equal(JSON.stringify((await ok(`graphs/${main.id}`)).instanceDataset), original)
  const history = await ok(`graphs/${main.id}/sync-records`)
  assert.equal(history[0].resultGraphId, version.id)
  assert.equal(history[0].status, '成功')
  done('已发布图谱同步产生新版本', 'V1保留394实体，V2待发布395实体，任务可跳转生成版本')

  const erp = sources.find(source => source.id === 'KG-DEMO-S-ERP')
  const configFailure = await request(`data-sources/${erp.id}`, { name: erp.name, mode: erp.mode, range: erp.range, owner: erp.owner, accessConfig: { ...erp.accessConfig, host: '127.0.0.1', port: '1', password: '' } }, 'PUT')
  assert.equal(configFailure.status, 502)
  const unchanged = (await ok('data-sources')).find(source => source.id === erp.id)
  assert.equal(unchanged.accessConfig.host, erp.accessConfig.host)
  assert.equal(unchanged.status, '启用'); assert.equal(unchanged.connectionStatus, '正常')
  done('启用来源编辑失败回退', '新连接失败，原配置和正常启用状态保留')

  const resumed = await ok(`graphs/${failed.id}`, { graphCode: failed.graphCode, graphName: failed.graphName, tag: failed.tag, ontologyId: main.ontologyId, sourceIds: main.sourceIds, structureElements: main.structureElements, range: '自动验收：失败草稿修复并真实重新生成' }, 'PUT')
  assert.equal(resumed.status, '待发布'); assert.equal(resumed.entities, 395)
  done('失败草稿修复重试', '原失败样例可继续编辑并生成真实待发布结果')

  const external = await ok('graphs/draft', { graphCode: 'KG-DEMO-REFERENCE-CHECK', graphName: '演示外部引用保护自动验收', ontologyId: main.ontologyId, sourceIds: [], structureElements: [] })
  try {
    const prevented = await request('knowledge-graph-demo/prepare', {})
    assert.equal(prevented.status, 409)
    assert.match(prevented.data.message, /非演示图谱引用/)
    assert.equal((await ok(`graphs/${main.id}`)).status, '已发布')
    done('复原外部引用保护', '出现非本批次引用时阻止恢复，原演示资产保留')
  } finally { await ok(`graphs/${external.id}`, undefined, 'DELETE') }
} catch (error) { failure = error; console.error(error.message) }
finally {
  console.log('正在恢复本批次的初始演示状态…')
  try {
    const restored = await ok('knowledge-graph-demo/prepare', {})
    assert.equal(restored.assets.model.length, 8); assert.equal(restored.assets.source.length, 10); assert.equal(restored.assets.graph.length, 8)
    assert.equal(restored.version, 1)
    done('完整演示后复原', '已恢复初始8/10/8样例和V1数据包')
  } catch (error) { failure ||= error; console.error(`复原失败：${error.message}`) }
  fs.mkdirSync('outputs/knowledge-graph-demo-plan', { recursive: true })
  fs.writeFileSync('outputs/knowledge-graph-demo-plan/联调验收.json', `${JSON.stringify({ verifiedAt: new Date().toISOString(), passed: !failure, results, error: failure?.message || null }, null, 2)}\n`)
}
if (failure) throw failure
