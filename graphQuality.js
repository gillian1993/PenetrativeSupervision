import { createHash } from 'node:crypto'
const parse = (value, fallback) => { if (value && typeof value === 'object') return value; try { return JSON.parse(value) || fallback } catch { return fallback } }
const issueId = (graphId, key) => `CHECK-${createHash('sha1').update(`${graphId}|${key}`).digest('hex')}`
const property = (node, label) => node.properties.find(p => p.label === label)?.value || ''

export function inspectGraphDataset(dataset, structure) {
  const issues = []
  const groups = new Map()
  const ids = new Set()
  const add = (key, title, description, sourceRef = '', level = '阻断') => issues.push({ key, title, description, sourceRef, level })
  for (const node of dataset.nodes) {
    if (!node.identifier || ids.has(node.id)) add(node.id, '实体标识异常', `${node.name} 缺少唯一标识或存在重复节点`, node.sourceName)
    ids.add(node.id)
    for (const field of structure.filter(e => e.type === 'property' && e.ownerCode === node.typeCode)) {
      const value = property(node, field.name)
      if (/必填|主标识/.test(field.constraint || '') && !value) add(`${node.id}|${field.code}`, '必填属性缺失', `${node.name} 的 ${field.name} 未填写`, node.sourceName)
      if (/18位/.test(field.constraint || '') && !/^[A-Z0-9]{18}$/.test(value)) add(`${node.id}|${field.code}`, '信用代码格式异常', `${node.name} 的 ${field.name} 应为18位字母或数字，请修复来源数据后重新同步`, node.sourceName)
    }
    const code = property(node, '统一社会信用代码')
    if (code && code.length === 18) {
      const k = `${node.typeCode}|${code}`
      groups.set(k, [...(groups.get(k) || []), node])
    }
  }
  for (const edge of dataset.relations) if (!ids.has(edge.sourceId) || !ids.has(edge.targetId)) add(edge.id, '关系端点不存在', `${edge.name} 的起点或终点实体不存在`, edge.sourceName)
  const candidates = [...groups].filter(([, nodes]) => nodes.length > 1).map(([key, nodes]) => ({ key, nodes }))
  for (const candidate of candidates) add(candidate.key, '发现疑似重复实体', candidate.nodes.map(node => node.name).join('、'), '统一社会信用代码相同', '警告')
  return { issues, candidates }
}

export async function initializeGraphQuality(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS graph_governance_history (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,graph_id VARCHAR(64) NOT NULL,task_id VARCHAR(80) NOT NULL,reason VARCHAR(500) NOT NULL,before_json JSON NOT NULL,after_json JSON NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,CONSTRAINT fk_governance_history_graph FOREIGN KEY(graph_id) REFERENCES graph_versions(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
}

export async function refreshGraphQuality(pool, graphId) {
  const [graphs] = await pool.query('SELECT status,structure_snapshot FROM graph_versions WHERE id=?', [graphId])
  if (!graphs.length) throw Object.assign(new Error('知识图谱不存在'), { status: 404 })
  const [datasets] = await pool.query('SELECT dataset_json FROM graph_instance_datasets WHERE graph_id=?', [graphId])
  const dataset = parse(datasets[0]?.dataset_json, { nodes: [], relations: [] })
  const result = inspectGraphDataset(dataset, parse(graphs[0].structure_snapshot, []))
  if (!datasets.length) result.issues.push({ key: 'missing-dataset', title: '尚无实际实例数据', level: '阻断', description: '请完成映射并生成图谱，当前没有可发布的实例数据集', sourceRef: graphId })
  // Recheck current data instead of trusting the denormalized counters or a manual resolved flag.
  await pool.query('DELETE FROM graph_quality_issues WHERE graph_id=? AND id LIKE ?', [graphId, 'CHECK-%'])
  for (const issue of result.issues) await pool.query("INSERT INTO graph_quality_issues (id,graph_id,title,level,description,source_ref,status) VALUES (?,?,?,?,?,?,'待处理')", [issueId(graphId, issue.key), graphId, issue.title, issue.level, issue.description.slice(0, 500), issue.sourceRef.slice(0, 200)])
  for (const candidate of result.candidates) {
    const id = `GOV-${createHash('sha1').update(`${graphId}|${candidate.key}`).digest('hex')}`
    await pool.query("INSERT INTO graph_governance_tasks (id,graph_id,object_type,candidate_json,evidence,suggestion,level,status) VALUES (?,?,?,?,?,'合并','中','待处理') ON DUPLICATE KEY UPDATE candidate_json=VALUES(candidate_json),status=IF(result='保持独立','已处理','待处理'),result=IF(result='保持独立',result,'')", [id, graphId, candidate.nodes[0].typeName, JSON.stringify(candidate.nodes.map(node => ({ id: node.id, name: node.name }))), `统一社会信用代码相同：${property(candidate.nodes[0], '统一社会信用代码')}`])
  }
  const [counts] = await pool.query("SELECT SUM(level='阻断') blockers,SUM(level='警告') warnings FROM graph_quality_issues WHERE graph_id=? AND status<>'已处理'", [graphId])
  const blockers = Number(counts[0].blockers || 0), warnings = Number(counts[0].warnings || 0)
  await pool.query('UPDATE graph_versions SET blockers=?,warnings=? WHERE id=?', [blockers, warnings, graphId])
  return { blockers, warnings, entities: dataset.nodes.length, relations: dataset.relations.length }
}

export function mergeGraphCandidates(dataset, candidateIds) {
  const candidates = dataset.nodes.filter(node => candidateIds.includes(node.id))
  if (candidates.length !== candidateIds.length || candidates.length < 2 || new Set(candidates.map(node => node.typeCode)).size !== 1) throw Object.assign(new Error('治理候选已变化，请重新检查'), { status: 409 })
  const identity = property(candidates[0], '统一社会信用代码')
  if (!identity || candidates.some(node => property(node, '统一社会信用代码') !== identity)) throw Object.assign(new Error('候选实体缺少相同的已核验信用代码，不能直接合并'), { status: 409 })
  const canonical = { ...candidates[0], properties: [...candidates[0].properties], sourceName: [...new Set(candidates.map(node => node.sourceName))].join('、') }
  for (const candidate of candidates.slice(1)) for (const p of candidate.properties) if (p.value && !canonical.properties.some(existing => existing.label === p.label && existing.value)) canonical.properties.push(p)
  const removed = new Set(candidates.slice(1).map(node => node.id))
  const relations = new Map()
  for (const edge of dataset.relations) {
    const sourceId = removed.has(edge.sourceId) ? canonical.id : edge.sourceId
    const targetId = removed.has(edge.targetId) ? canonical.id : edge.targetId
    const key = `${edge.typeCode}|${sourceId}|${targetId}`
    relations.set(key, { ...edge, sourceId, targetId })
  }
  return { ...dataset, nodes: dataset.nodes.filter(node => !removed.has(node.id)).map(node => node.id === canonical.id ? canonical : node), relations: [...relations.values()] }
}

export async function governGraph(pool, graphId, taskId, payload) {
  const reason = String(payload.reason || '').trim()
  if (!reason || reason.length > 500) throw Object.assign(new Error('请填写500字以内的处理原因'), { status: 400 })
  if (!['合并', '确认合并', '保持独立'].includes(payload.result)) throw Object.assign(new Error('不支持的治理操作'), { status: 400 })
  const db = await pool.getConnection()
  try {
    await db.beginTransaction()
    const [graphs] = await db.query('SELECT status FROM graph_versions WHERE id=? FOR UPDATE', [graphId])
    if (!graphs.length || !['草稿', '待发布'].includes(graphs[0].status)) throw Object.assign(new Error('仅未发布图谱可以执行治理，请先复制或取消发布'), { status: 409 })
    const [tasks] = await db.query('SELECT * FROM graph_governance_tasks WHERE graph_id=? AND id=? FOR UPDATE', [graphId, taskId])
    if (!tasks.length || tasks[0].status === '已处理') throw Object.assign(new Error('任务不存在或已经处理'), { status: 409 })
    const [rows] = await db.query('SELECT dataset_json FROM graph_instance_datasets WHERE graph_id=? FOR UPDATE', [graphId])
    if (!rows.length) throw Object.assign(new Error('当前图谱没有实际实例数据'), { status: 409 })
    const before = parse(rows[0].dataset_json, { nodes: [], relations: [] })
    const after = payload.result === '保持独立' ? before : mergeGraphCandidates(before, parse(tasks[0].candidate_json, []).map(value => typeof value === 'string' ? value : value.id))
    await db.query('UPDATE graph_instance_datasets SET dataset_json=? WHERE graph_id=?', [JSON.stringify(after), graphId])
    await db.query('UPDATE graph_versions SET entity_count=?,relation_count=?,event_count=0 WHERE id=?', [after.nodes.length, after.relations.length, graphId])
    await db.query("UPDATE graph_governance_tasks SET status='已处理',result=?,reason=? WHERE id=?", [payload.result, reason, taskId])
    await db.query('INSERT INTO graph_governance_history (graph_id,task_id,reason,before_json,after_json) VALUES (?,?,?,?,?)', [graphId, taskId, reason, JSON.stringify(before), JSON.stringify(after)])
    await refreshGraphQuality(db, graphId)
    await db.commit()
    return { ok: true, message: payload.result === '保持独立' ? '已记录保持独立的处理意见' : `合并完成：实体 ${before.nodes.length} → ${after.nodes.length}，关系 ${before.relations.length} → ${after.relations.length}` }
  } catch (error) { await db.rollback(); throw error } finally { db.release() }
}
