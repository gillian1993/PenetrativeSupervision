const fields = ['type', 'code', 'name', 'groupName', 'ownerCode', 'targetCode', 'dataType', 'constraint', 'description']
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }) }
const elementValue = (element) => Object.fromEntries(fields.map((key) => [key, String(element[key] || '')]))

function snapshot(record) {
  return JSON.stringify({
    name: record.name, scope: record.scope, domain: record.domain, description: record.description,
    groups: record.groups || [],
    elements: record.elements.map((element) => ({ id: String(element.id), ...elementValue(element) })).sort((a, b) => a.id.localeCompare(b.id)),
  })
}

function normalizeDraft(payload, current) {
  if (!Array.isArray(payload.elements) || !Array.isArray(payload.groups)) fail('模型结构格式无效')
  const name = String(payload.name || '').trim()
  const domain = String(payload.domain || '').trim()
  if (!name) fail('结构名称不能为空')
  if (!domain) fail('监管领域不能为空')
  if (name.length > 160 || domain.length > 80) fail('结构名称或监管领域过长')
  const groups = payload.groups.map((group) => String(group).trim())
  if (groups.some((group) => !group || group.length > 120)) fail('分组名称不能为空且不能超过120个字符')
  if (new Set(groups).size !== groups.length) fail('实体分组名称不能重复')
  if (!groups.includes('未分组')) groups.push('未分组')
  const ids = new Set()
  const codes = new Set()
  const previous = new Map(current.elements.map((element) => [String(element.id), element]))
  const elements = payload.elements.map((raw) => {
    if (!raw || typeof raw !== 'object') fail('结构定义项格式无效')
    const element = { id: String(raw.id || ''), ...Object.fromEntries(fields.map((key) => [key, String(raw[key] || '').trim()])) }
    if (!['class', 'property', 'relation'].includes(element.type)) fail('结构定义类型无效')
    if (!element.id || ids.has(element.id)) fail('结构定义项标识无效或重复')
    ids.add(element.id)
    if (!previous.has(element.id) && !element.id.startsWith('draft-')) fail('结构定义项不存在，请刷新后重试', 409)
    if (previous.has(element.id) && previous.get(element.id).type !== element.type) fail('定义类型不可修改')
    if (!element.code || !element.name) fail('结构定义项编码和名称不能为空')
    if (element.code.length > 120 || element.name.length > 160) fail('结构定义项编码或名称过长')
    const key = `${element.type}:${element.code}`
    if (codes.has(key)) fail('同类型结构定义项编码已存在', 409)
    codes.add(key)
    if (element.type === 'class') {
      element.groupName ||= '未分组'
      if (!groups.includes(element.groupName)) fail('请选择当前图谱模型中的实体分组')
      element.ownerCode = ''; element.targetCode = ''; element.dataType = '实体类型'
    } else {
      element.groupName = ''
      if (element.type === 'property') element.targetCode = ''
    }
    return element
  })
  const classes = new Set(elements.filter((element) => element.type === 'class').map((element) => element.code))
  for (const element of elements) {
    // Existing incomplete drafts remain editable; new and edited references must resolve.
    const old = previous.get(element.id)
    const unchanged = old && JSON.stringify(elementValue(old)) === JSON.stringify(elementValue(element))
    if (element.type !== 'class' && (!element.ownerCode || !classes.has(element.ownerCode))) {
      if (!unchanged || current.elements.some((row) => row.type === 'class' && row.code === element.ownerCode)) fail(`${element.name} 的所属或起点实体类型不存在`)
    }
    if (element.type === 'relation' && (!element.targetCode || !classes.has(element.targetCode))) {
      if (!unchanged || current.elements.some((row) => row.type === 'class' && row.code === element.targetCode)) fail(`${element.name} 的终点实体类型不存在`)
    }
  }
  return { name, scope: String(payload.scope || current.scope), domain, description: String(payload.description || ''), elements, groups }
}

export async function saveOntologyDraft(pool, id, payload, getOntology) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.query('SELECT status FROM ontologies WHERE id=? FOR UPDATE', [id])
    if (!rows.length || rows[0].status === '已删除') fail('图谱模型不存在', 404)
    if (rows[0].status !== '草稿') fail('只有草稿图谱模型可以编辑，请复制为草稿后修改', 409)
    const current = await getOntology(id, connection)
    if (!payload.expected || !Array.isArray(payload.expected.elements) || snapshot(payload.expected) !== snapshot(current)) fail('模型已被其他操作更新，请保留当前修改并刷新后重试', 409)
    const draft = normalizeDraft(payload, current)
    // Replace the structure inside one transaction, retaining persisted element IDs.
    await connection.query('DELETE FROM ontology_elements WHERE ontology_id=?', [id])
    await connection.query('DELETE FROM ontology_entity_groups WHERE ontology_id=?', [id])
    for (const [index, group] of draft.groups.entries()) await connection.query('INSERT INTO ontology_entity_groups (ontology_id,name,sort_order) VALUES (?,?,?)', [id, group, index])
    const existingIds = new Set(current.elements.map((element) => String(element.id)))
    for (const element of draft.elements) {
      await connection.query('INSERT INTO ontology_elements (element_id,ontology_id,element_type,code,name,group_name,owner_code,target_code,data_type,constraint_desc,description) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [existingIds.has(element.id) ? element.id : null, id, ...fields.map((key) => element[key])])
    }
    const count = (type) => draft.elements.filter((element) => element.type === type).length
    await connection.query('UPDATE ontologies SET name=?,scope=?,domain=?,description=?,class_count=?,property_count=?,relation_count=?,event_count=0,validation_json=NULL,updated_at=NOW() WHERE id=?', [draft.name, draft.scope, draft.domain, draft.description, count('class'), count('property'), count('relation'), id])
    await connection.query('INSERT INTO ontology_audits (ontology_id,action,summary) VALUES (?,?,?)', [id, '保存图谱模型', `统一保存基本信息和模型结构：${count('class')}个实体类型、${count('property')}个属性、${count('relation')}个关系`])
    const saved = await getOntology(id, connection)
    await connection.commit()
    return saved
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}
