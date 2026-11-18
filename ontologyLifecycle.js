const fail = (message, status, extra = {}) => { throw Object.assign(new Error(message), { status, ...extra }) }

// Include editor drafts and mapping snapshots: they can still need a model that is stopped.
const references = [
  { type: 'source', label: '数据源', unit: '个', from: 'data_source_structures dss JOIN data_sources ds ON ds.id=dss.source_id', where: 'dss.ontology_id=?', count: 'COUNT(DISTINCT ds.id)', objects: 'DISTINCT ds.id,ds.name' },
  { type: 'mapping', label: '数据映射', unit: '条', from: 'semantic_mappings', where: 'ontology_id=?', objects: "CAST(id AS CHAR) AS id,CONCAT(source_id,' · ',target_code) AS name" },
  { type: 'graph', label: '知识图谱', unit: '个', from: 'graph_versions', where: 'ontology_id=?', objects: "id,COALESCE(NULLIF(graph_name,''),id) AS name" },
  { type: 'graphDraft', label: '图谱编辑草稿', unit: '个', from: 'graph_edit_drafts', where: 'ontology_id=?', objects: 'graph_id AS id,graph_name AS name' },
  { type: 'mappingSnapshot', label: '图谱映射快照', unit: '份', from: 'graph_version_mapping_snapshots', where: 'ontology_id=?', objects: "CONCAT(graph_id,' / ',source_id) AS id,CONCAT(graph_id,' · ',source_id) AS name" },
  { type: 'scene', label: '风险场景', unit: '个', from: 'scene_versions', where: 'ontology_id=?', objects: 'id,name' },
  { type: 'rule', label: '规则版本', unit: '个', from: 'rule_asset_versions', where: 'ontology_id=?', objects: 'id,name' },
  { type: 'modelVersion', label: '派生模型版本', unit: '个', from: 'ontologies', where: "source_version_id=? AND status<>'已删除'", objects: 'id,name' },
]

export async function ontologyReferenceSummary(connection, id) {
  const items = []
  for (const check of references) {
    const [rows] = await connection.query(`SELECT ${check.count || 'COUNT(*)'} AS total FROM ${check.from} WHERE ${check.where}`, [id])
    const count = Number(rows[0]?.total || 0)
    if (!count) continue
    const [objects] = await connection.query(`SELECT ${check.objects} FROM ${check.from} WHERE ${check.where} ORDER BY id LIMIT 8`, [id])
    items.push({ type: check.type, label: check.label, unit: check.unit, count, objects, truncated: count > objects.length })
  }
  return { total: items.reduce((sum, item) => sum + item.count, 0), summary: items.map(item => `${item.label}${item.count}${item.unit}`).join('、') || '无引用', items }
}

export async function softDeleteOntology(pool, id) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.query('SELECT id,name,status FROM ontologies WHERE id=? FOR UPDATE', [id])
    const model = rows[0]
    if (!model || model.status === '已删除') fail('图谱模型不存在或已删除', 404)
    if (!['草稿', '停用'].includes(model.status)) fail(model.status === '启用' ? '请先停用图谱模型，再执行删除' : '只有草稿或停用的图谱模型可以删除', 409)
    const references = await ontologyReferenceSummary(connection, id)
    if (references.total) fail(`该图谱模型仍被${references.summary}引用，不能删除。请先解除引用。`, 409, { references })
    await connection.query("UPDATE ontologies SET status='已删除',updated_at=NOW() WHERE id=?", [id])
    await connection.query('INSERT INTO ontology_audits (ontology_id,action,summary) VALUES (?,?,?)', [id, '删除图谱模型', `${model.name}；删除前状态：${model.status}；模型结构和历史审计已保留`])
    await connection.commit()
    return { ok: true, message: '图谱模型已删除，模型结构和历史审计已保留' }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}
