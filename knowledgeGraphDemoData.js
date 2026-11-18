// Reproducible, fictional data shared by the demo database, HTTP sources and files.
export const demoBatch = 'KG-DEMO-20261116-V1'
export const demoPrefix = 'KG-DEMO-'
const seq = (n, fn) => Array.from({ length: n }, (_, i) => fn(i + 1))
const key = (kind, n) => `${kind}-${String(n).padStart(3, '0')}`
const date = (n, day = 1) => `2026-11-${String(day + n % 12).padStart(2, '0')} 10:00:00`
const credit = (n) => `DEMO${String(n).padStart(14, '0')}`

export function createDemoData(version = 1, qualityError = false) {
  const definitions = [
    ['Organization', '组织', 8, 'erp', ['level', 'manager', 'status']],
    ['Supplier', '供应商', 60, 'erp', ['credit_code', 'phone', 'status']],
    ['Person', '人员', 24, 'oa', ['organization_id', 'role', 'phone']],
    ['Contact', '联系方式', 80, 'external', ['value', 'kind', 'status']],
    ['Project', '采购项目', 12, 'erp', ['budget', 'method', 'status']],
    ['Bid', '投标记录', 36, 'erp', ['amount', 'occurred_at', 'status']],
    ['Order', '采购订单', 30, 'erp', ['amount', 'occurred_at', 'status']],
    ['Contract', '合同', 24, 'erp', ['amount', 'original_amount', 'change_rate']],
    ['Approval', '审批记录', 36, 'oa', ['result', 'occurred_at', 'actor_id']],
    ['Receipt', '验收入库记录', 24, 'file', ['quantity', 'occurred_at', 'status']],
    ['Invoice', '发票', 30, 'treasury', ['amount', 'occurred_at', 'status']],
    ['Payment', '付款记录', 30, 'treasury', ['amount', 'occurred_at', 'status']],
  ]
  const labels = { id: '唯一编号', name: '名称', level: '组织层级', manager: '负责人', status: '业务状态', credit_code: '统一社会信用代码', phone: '联系电话', organization_id: '组织编号', role: '人员角色', value: '联系值', kind: '联系类型', budget: '预算金额', method: '采购方式', amount: '金额', occurred_at: '业务时间', original_amount: '原合同金额', change_rate: '金额变更比例', result: '审批结果', actor_id: '审批人编号', quantity: '验收数量' }
  const tables = []
  const elements = []
  for (const [kind, name, count, source, extra] of definitions) {
    const code = `DEMO.${kind}`
    const fields = ['id', 'name', ...extra]
    elements.push({ type: 'class', code, name, groupName: ['Organization', 'Supplier', 'Person', 'Contact'].includes(kind) ? '主数据' : ['Project', 'Bid', 'Order'].includes(kind) ? '采购执行' : '履约结算', dataType: '实体类型', constraint: '唯一编号为主标识', description: `${name}虚构演示数据` })
    for (const field of fields) elements.push({ type: 'property', code: `${code}.${field}`, name: labels[field], ownerCode: code, dataType: /amount|budget/.test(field) ? '金额' : field === 'occurred_at' ? '日期时间' : /rate|quantity/.test(field) ? '数字' : '文本', constraint: field === 'id' ? '主标识、必填' : field === 'credit_code' ? '格式：18位' : '', description: field === 'change_rate' ? '百分比，40表示40%' : /amount|budget/.test(field) ? '单位：元' : '' })
    const rows = seq(count, (n) => {
      const row = { id: key(kind, n), name: `${name}${String(n).padStart(2, '0')}` }
      for (const field of extra) row[field] = ({ level: String(1 + n % 3), manager: `负责人${n}`, status: n % 5 ? '正常' : '处理中', credit_code: credit(n === 60 ? 59 : n), phone: `1380000${String(kind === 'Person' ? (n === 1 ? 1 : n + 56) : (n <= 2 ? 1 : n - 1)).padStart(4, '0')}`, organization_id: key('Organization', 1 + (n - 1) % 8), role: n % 2 ? '评审人员' : '审批人员', value: `1380000${String(n).padStart(4, '0')}`, kind: '联系电话', budget: 1000000 + n * 10000, method: n % 2 ? '公开招标' : '竞争性谈判', amount: 100000 + n * 1000, occurred_at: date(n, kind === 'Payment' ? 1 : 2), original_amount: 100000 + n * 1000, change_rate: n === 3 ? 40 : 0, result: n % 4 ? '通过' : '退回', actor_id: key('Person', 1 + (n - 1) % 24), quantity: n * 10 })[field]
      if (kind === 'Contact') row.name = row.value
      if (kind === 'Contract' && n === 3) row.amount = row.original_amount * 1.4
      if (kind === 'Project' && n === 1) row.name = '云平台基础设施采购项目'
      if (kind === 'Supplier' && n <= 2) row.name = ['华星科技（演示）有限公司', '远航设备（演示）有限公司'][n - 1]
      if (kind === 'Supplier' && n === 1 && qualityError) row.credit_code = '待补录'
      return row
    })
    if (version >= 2 && kind === 'Supplier') rows.push({ id: key(kind, 61), name: '新增供应商（演示）有限公司', credit_code: credit(61), phone: '13900000061', status: '正常' })
    if (version >= 2 && kind === 'Contract') rows[0].amount += 5000
    tables.push({ name: `kg_demo_${kind.toLowerCase()}`, label: name, source, kind, code, fields, rows })
  }
  const relationDefs = [
    ['bid_project', '参与项目', 'Bid', 'Project', 36, 'erp', n => [n, 1 + (n - 1) % 12]],
    ['bid_supplier', '投标供应商', 'Bid', 'Supplier', 36, 'erp', n => [n, n]],
    ['person_project', '参与评审', 'Person', 'Project', 36, 'oa', n => [1 + (n - 1) % 24, 1 + ((n - 1) % 12 + Math.floor((n - 1) / 24)) % 12]],
    ['organization_project', '负责项目', 'Organization', 'Project', 12, 'erp', n => [1 + (n - 1) % 8, n]],
    ['order_project', '所属项目', 'Order', 'Project', 30, 'erp', n => [n, 1 + (n - 1) % 12]],
    ['project_contract', '形成合同', 'Project', 'Contract', 24, 'erp', n => [1 + (n - 1) % 12, n]],
    ['supplier_contract', '签订合同', 'Supplier', 'Contract', 24, 'erp', n => [n, n]],
    ['approval_contract', '审批合同', 'Approval', 'Contract', 36, 'oa', n => [n, 1 + (n - 1) % 24]],
    ['receipt_order', '验收订单', 'Receipt', 'Order', 24, 'file', n => [n, n]],
    ['invoice_contract', '对应合同', 'Invoice', 'Contract', 30, 'treasury', n => [n, 1 + (n - 1) % 24]],
    ['payment_invoice', '支付发票', 'Payment', 'Invoice', 30, 'treasury', n => [n, n]],
    ['supplier_contact', '登记联系方式', 'Supplier', 'Contact', 60, 'external', n => [n, n <= 2 ? 1 : n - 1]],
    ['person_contact', '使用联系方式', 'Person', 'Contact', 24, 'external', n => [n, n === 1 ? 1 : n + 56]],
    ['person_organization', '所属组织', 'Person', 'Organization', 24, 'oa', n => [n, 1 + (n - 1) % 8]],
  ]
  for (const [kind, name, from, to, count, source, pair] of relationDefs) {
    const code = `DEMO.${kind}`
    elements.push({ type: 'relation', code, name, ownerCode: `DEMO.${from}`, targetCode: `DEMO.${to}`, dataType: `${definitions.find(x => x[0] === from)[1]} → ${definitions.find(x => x[0] === to)[1]}`, constraint: '多对多', description: '依据来源关联编号生成' })
    tables.push({ name: `kg_demo_rel_${kind}`, label: name, source, code, fields: ['start_id', 'end_id'], rows: seq(count, n => { const [a, b] = pair(n); return { start_id: key(from, a), end_id: key(to, b) } }) })
  }
  return { elements: elements.map((item, i) => ({ id: `DE-${i + 1}`, ownerCode: '', targetCode: '', description: '', ...item, sourceType: 'model' })), tables }
}

export function demoMappings(tables, elements, sourceId, ontologyId, tableNames = {}) {
  return tables.flatMap(table => {
    const base = { source_id: sourceId, ontology_id: ontologyId, status: '有效', confidence: 100 }
    const tableName = tableNames[table.name] || table.name
    if (!table.kind) return [{ ...base, mapping_type: '关系', source_field: tableName, target_code: table.code, transform_rule: '关联方式：关系表；起点字段：start_id；终点字段：end_id' }]
    return [{ ...base, mapping_type: '实体类型', source_field: tableName, target_code: table.code, transform_rule: '主键字段：id' }, ...elements.filter(e => e.type === 'property' && e.ownerCode === table.code).map(e => ({ ...base, mapping_type: '属性', source_field: e.code.split('.').pop(), target_code: e.code, transform_rule: '直接映射' }))]
  }).filter(row => elements.some(e => e.code === row.target_code))
}
