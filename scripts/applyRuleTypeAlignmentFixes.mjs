import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const seedPath = path.join(rootDir, 'data', 'ruleCatalogSeed.json')
const reportPath = path.join(rootDir, 'docs', 'rule-type-alignment-fixes.md')

function assertInsideRoot(target, label) {
  const resolved = path.resolve(target)
  const rootWithSep = rootDir.endsWith(path.sep) ? rootDir : `${rootDir}${path.sep}`
  if (resolved !== rootDir && !resolved.startsWith(rootWithSep)) throw new Error(`${label} must stay inside workspace: ${resolved}`)
  return resolved
}
assertInsideRoot(seedPath, 'seedPath')
assertInsideRoot(reportPath, 'reportPath')

const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'))
const ruleByCode = new Map(seed.rules.map((rule) => [rule.code, rule]))

const typeHelp = {
  属性: '字段与固定值、枚举、名单命中标识或状态值比较',
  字段比对: '同一业务对象或关联对象的两个字段相互比较',
  关系路径: '以图谱边、主体关系、人员/账户/股权路径作为主判断',
  时序: '以事件是否发生、先后顺序和时间窗口作为主判断',
  聚合: '以计数、求和、去重、比例、相似度等统计指标作为主判断',
  高级表达式: '跨字段、时序、路径、聚合、模型输出或专用函数的组合判断',
}

const alignmentRules = {
  'RULE-107-01': {
    type: '高级表达式',
    sourceType: '高级表达式/名单匹配',
    reason: '规则同时包含供应商经营范围字段比较和集团主业名单判断，单纯“字段比对”无法完整展示。',
    expression: 'SIMILARITY(PROC.Supplier.business_scope, PROC.PurchaseProject.purchase_category) < 0.6 OR IN_LIST(PROC.PurchaseProject.purchase_category, GROUP_MAIN_BUSINESS_WHITELIST) == false',
  },
  'RULE-304-01': {
    type: '属性',
    sourceType: '属性/外部状态',
    reason: '核心判断是经营异常名录状态等于“未移出”，不是字段与字段比较。',
  },
  'RULE-305-01': {
    type: '属性',
    sourceType: '属性/名单匹配',
    reason: '核心判断是严重违法失信名单命中且名单有效，不需要第二个对比字段。',
  },
  'RULE-306-01': {
    type: '高级表达式',
    sourceType: '高级表达式/关系路径',
    reason: '规则需要同时表达供应商—法定代表人—司法失信记录的路径和失信记录状态。',
    expression: 'EXISTS_PATH(PROC.Supplier, PROC.Person, EXT.CourtDishonestRecord) == true AND EXT.CourtDishonestRecord.status == "有效"',
  },
  'RULE-307-01': {
    type: '属性',
    sourceType: '属性/文本标签',
    reason: '核心判断是名称敏感关键词命中和关键词类型枚举，不是字段与字段比较。',
  },
  'RULE-310-01': {
    type: '属性',
    sourceType: '属性/名单匹配',
    reason: '核心判断是集团内部黑名单命中标识，名单匹配过程作为数据来源说明。',
    cleanValues: { 'cond-blacklist': '是' },
  },
  'RULE-311-01': {
    type: '属性',
    sourceType: '属性/舆情状态',
    reason: '核心判断是外部舆情核验状态和等级，不是两个字段互比。',
  },
  'RULE-503-01': {
    type: '高级表达式',
    sourceType: '高级表达式/三流一致性',
    reason: '规则混合合同、发票、资金主体字段比对和第三方授权状态，适合用组合表达式完整呈现。',
    expression: '(FIN.Invoice.seller_credit_code != PROC.Contract.supplier_credit_code OR FIN.Invoice.buyer_credit_code != PROC.Contract.buyer_credit_code OR PROC.Payment.payee_credit_code != PROC.Contract.supplier_credit_code OR PROC.Payment.payer_credit_code != PROC.Contract.buyer_credit_code) AND PROC.Payment.third_party_authorization_valid_flag == "否"',
  },
  'RULE-603-01': {
    type: '高级表达式',
    sourceType: '高级表达式/时序差值',
    reason: '核心判断是实际收付款日期相对合同约定日期提前超过90天，属于日期差计算。',
    expression: 'DATE_DIFF(PROC.Contract.scheduled_payment_date, PROC.Payment.executed_at) > 90',
  },
  'RULE-605-01': {
    type: '高级表达式',
    sourceType: '高级表达式/账户同源',
    reason: '规则混合贸易链、上下游账户路径和账户号字段相等判断，单一字段比对会丢失路径语义。',
    expression: 'PROC.TradeChain.chain_id != "" AND FIN.BankAccount.upstream_receipt_account_no == FIN.BankAccount.downstream_return_account_no',
  },
  'RULE-607-01': {
    type: '高级表达式',
    sourceType: '高级表达式/账户关系',
    reason: '规则同时判断回款方向、个人账户属性和个人与主体的关联路径。',
    expression: 'PROC.Payment.direction == "收款" AND FIN.BankAccount.payee_account_type == "个人" AND EXISTS_PATH(PROC.Payment, FIN.BankAccount, PROC.Person) == true',
  },
  'RULE-701-01': {
    type: '高级表达式',
    sourceType: '高级表达式/交付完整性',
    reason: '规则是收付款完整条件叠加多项交付证据缺失 OR 判断，属性编辑器无法展示嵌套 OR。',
    expression: 'PROC.Settlement.payment_complete_flag == "是" AND (PROC.Delivery.delivery_document_status == "缺失" OR PROC.Delivery.logistics_trace_status == "缺失" OR PROC.Delivery.signoff_status == "缺失" OR PROC.Delivery.warehouse_in_status == "缺失" OR PROC.Delivery.acceptance_status == "缺失")',
  },
  'RULE-702-01': {
    type: '聚合',
    sourceType: '聚合/数量比对',
    reason: '规则按合同聚合交付/入库数量并计算差异率，主判断方式应为聚合。',
  },
  'RULE-703-01': {
    type: '属性',
    sourceType: '属性/名单匹配',
    reason: '核心判断是合规仓库名单命中标识等于“否”，名单函数不应写进固定值。',
    cleanValues: { 'cond-list-hit': '否' },
  },
  'RULE-B01-02': {
    type: '高级表达式',
    sourceType: '高级表达式/文本相似度',
    reason: '规则依赖投标文件文本相似度函数，属性编辑器中的固定值无法表达 SIMILARITY 计算。',
    expression: 'SIMILARITY(PROC.BidDocument.text_fingerprint, PROC.BidDocument.peer_text_fingerprint) >= 0.85',
  },
  'RULE-B01-03': {
    type: '聚合',
    sourceType: '聚合/文件元数据',
    reason: '规则按元数据比对组聚合相同元数据项和涉及投标人数，主判断方式应为聚合。',
  },
  'RULE-B02-04': {
    type: '高级表达式',
    sourceType: '高级表达式/联系方式同源',
    reason: '规则包含联系方式重合 OR 判断和投标人共享联系点路径，需要组合表达式展示。',
    expression: 'PROC.ContactPoint.related_bidder_count >= 2 AND (PROC.BidderContact.same_contact_person_count >= 1 OR PROC.BidderContact.same_mobile_count >= 1 OR PROC.BidderContact.same_email_count >= 1 OR PROC.BidderContact.same_address_count >= 1)',
  },
  'RULE-M101-01': {
    type: '高级表达式',
    sourceType: '模型输出/高级表达式',
    reason: '“智能服务”不是规则编辑器标准判断类型，应落成模型输出字段和图谱特征组合表达式。',
    expression: 'TEXT_CLASSIFY(PROC.BidDocument.full_text, BIDDER_COMPREHENSIVE_SCORE_MODEL) == "已完成" AND AI.BidderEvaluation.risk_score >= 80 AND EXISTS_PATH(PROC.Bidder, PROC.BidDocument, PROC.RelationRiskFeature) == true',
  },
  'RULE-M102-01': {
    type: '高级表达式',
    sourceType: '模型输出/高级表达式',
    reason: '“智能服务”不是规则编辑器标准判断类型，应落成合同审查模型输出字段判断。',
    expression: 'TEXT_CLASSIFY(PROC.Contract.full_text, CONTRACT_LEGAL_RISK_MODEL) == "已完成" AND AI.ContractReview.risk_clause_count >= 1',
  },
  'RULE-CG01-01': {
    type: '属性',
    sourceType: '属性/采购方式',
    reason: '规则判断采购估算金额、采购方式和例外审批状态，属于字段与固定阈值/枚举比较。',
  },
  'RULE-CG01-02': {
    type: '高级表达式',
    sourceType: '高级表达式/例外审批',
    reason: '规则包含非公开采购条件叠加例外审批为空、未通过、失效的 OR 判断。',
    expression: 'PROC.Procurement.method_type != "公开招标" AND (PROC.ExceptionApproval.approval_id == "" OR PROC.ExceptionApproval.approval_status != "已通过" OR PROC.ExceptionApproval.valid_flag == "否")',
  },
  'RULE-CG01-03': {
    type: '高级表达式',
    sourceType: '高级表达式/单一来源证明',
    reason: '规则包含单一来源方式和多个证明材料完整性 OR 判断。',
    expression: 'PROC.Procurement.method_type == "单一来源" AND (PROC.SingleSource.reason_allowed_flag == "否" OR PROC.SingleSource.uniqueness_proof_status != "完整" OR PROC.SingleSource.continuity_proof_status != "完整")',
  },
  'RULE-CG01-05': {
    type: '高级表达式',
    sourceType: '高级表达式/流程时序',
    reason: '规则同时判断采购方式字段变化、审批状态和审批完成时间先后。',
    expression: 'PROC.Procurement.approved_method_type != PROC.Procurement.actual_method_type AND (PROC.MethodChangeApproval.approval_status != "已通过" OR PROC.MethodChangeApproval.completed_at > PROC.Procurement.actual_method_chosen_at)',
  },
  'RULE-CG01-06': {
    type: '属性',
    sourceType: '属性/目录匹配',
    reason: '核心判断是目录命中标识和采购渠道合规标识，名单函数作为来源说明即可。',
    cleanValues: { 'cond-catalog': '是' },
  },
  'RULE-ZB01-01': {
    type: '高级表达式',
    sourceType: '高级表达式/前置参与',
    reason: '规则需要将最终中标供应商身份与招标前前置参与事件做组合判断。',
    expression: 'PROC.AwardResult.winner_credit_code == PROC.SupplierPreEngagement.supplier_credit_code AND PROC.SupplierPreEngagement.before_tender_flag == "是"',
  },
  'RULE-ZB01-02': {
    type: '高级表达式',
    sourceType: '高级表达式/参数文本',
    reason: '规则混合唯一供应商参数匹配比例和排他性文本分类。',
    expression: 'RATIO(PROC.TenderParameter.matched_unique_supplier_param_count, PROC.TenderParameter.total_key_param_count) >= 0.8 OR TEXT_CLASSIFY(PROC.TenderDocument.full_text, EXCLUSIVE_TENDER_PARAMETER) == "是"',
  },
  'RULE-LC01-01': {
    type: '高级表达式',
    sourceType: '高级表达式/流程时序',
    reason: '规则核心是公告发布时间早于预算批复完成时间，需展示字段时间比较。',
    expression: 'PROC.TenderNotice.published_at < PROC.BudgetApproval.completed_at',
  },
  'RULE-LC01-02': {
    type: '高级表达式',
    sourceType: '高级表达式/流程时序',
    reason: '规则包含关键事件缺失和制度顺序异常两个判断分支。',
    expression: 'PROC.ProcurementTimeline.required_event_missing_flag == "是" OR PROC.ProcurementTimeline.sequence_violation_flag == "是"',
  },
  'RULE-LC01-03': {
    type: '高级表达式',
    sourceType: '高级表达式/审批时序',
    reason: '规则同时判断发布时间与审批完成时间，以及业务、法务、财务审批状态。',
    expression: 'PROC.TenderDocument.published_at < PROC.TenderDocument.required_approval_completed_at OR PROC.TenderDocument.business_approval_status != "已通过" OR PROC.TenderDocument.legal_approval_status != "已通过" OR PROC.TenderDocument.finance_approval_status != "已通过"',
  },
  'RULE-LC01-04': {
    type: '高级表达式',
    sourceType: '高级表达式/签约时序',
    reason: '规则核心是合同签订时间早于公示或异议结束时间，需展示字段时间比较。',
    expression: 'PROC.Contract.signed_at < PROC.AwardPublicity.objection_end_at',
  },
  'RULE-LC02-01': {
    type: '高级表达式',
    sourceType: '高级表达式/投标期计算',
    reason: '规则核心是公告发布到投标截止的有效天数小于20天，属于日期差计算。',
    expression: 'DATE_DIFF(PROC.TenderNotice.bid_deadline_at, PROC.TenderNotice.published_at) < 20',
  },
  'RULE-LC02-02': {
    type: '属性',
    sourceType: '属性/专家抽取',
    reason: '核心判断是专家产生方式等于指定且随机抽取记录为空，不是事件先后顺序。',
  },
  'RULE-LC02-03': {
    type: '高级表达式',
    sourceType: '高级表达式/变更顺延',
    reason: '规则包含重大变更标识和实际顺延天数小于制度要求天数的字段比较。',
    expression: 'PROC.TenderClarification.major_change_flag == "是" AND PROC.TenderClarification.actual_extension_days < PROC.TenderClarification.required_extension_days',
  },
  'RULE-608-01': {
    type: '高级表达式',
    sourceType: '高级表达式/资金流向路径',
    reason: '规则组合付款后3天窗口、关联路径和关联流出比例，单纯时序无法完整表达。',
    expression: 'RATIO(FIN.FundFlow.related_outflow_amount_3d, PROC.Payment.amount) >= 0.8 AND EXISTS_PATH(PROC.Payment, FIN.BankAccount, PROC.RelatedSubject) == true',
  },
}

function walkConditions(group, visitor) {
  if (!group?.items) return
  for (const item of group.items) {
    if (Array.isArray(item.items)) walkConditions(item, visitor)
    else visitor(item)
  }
}

const rows = []
for (const [code, config] of Object.entries(alignmentRules)) {
  const rule = ruleByCode.get(code)
  if (!rule) throw new Error(`Rule not found: ${code}`)
  const beforeType = rule.ruleType
  const beforeSourceType = rule.sourceType || ''
  rule.ruleType = config.type
  rule.sourceType = config.sourceType
  if (config.expression) {
    rule.conditionJson = {
      ...(rule.conditionJson || { id: 'group-root', logic: 'AND', items: [] }),
      expression: config.expression,
      expressionLanguage: 'DSL',
    }
  }
  if (config.cleanValues) {
    walkConditions(rule.conditionJson, (item) => {
      if (Object.prototype.hasOwnProperty.call(config.cleanValues, item.id)) item.value = config.cleanValues[item.id]
    })
  }
  rule.buildStatus = '规则判断方式与条件结构已对齐，待样本试跑'
  rows.push([code, rule.name, beforeType, config.type, beforeSourceType, config.sourceType, config.reason, config.expression || '-'])
}

fs.writeFileSync(seedPath, `${JSON.stringify(seed, null, 2)}\n`, 'utf8')
fs.mkdirSync(path.dirname(reportPath), { recursive: true })
const markdownCell = (value) => String(value ?? '').replaceAll('|', '／').replaceAll('\n', '<br>')
const table = (headers, values) => [
  `| ${headers.map(markdownCell).join(' | ')} |`,
  `| ${headers.map(() => '---').join(' | ')} |`,
  ...values.map((row) => `| ${row.map(markdownCell).join(' | ')} |`),
].join('\n')
const generatedAt = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date())
const report = `# 规则判断方式与条件结构对齐记录

生成时间：${generatedAt}

本次不是新增检测能力，而是修正规则资产本身的“判断方式”归类。对齐原则如下：

${table(['判断方式', '适用口径'], Object.entries(typeHelp))}

${table(['规则编码', '规则名称', '原判断方式', '新判断方式', '原来源类型', '新来源类型', '调整原因', '高级表达式'], rows)}
`
fs.writeFileSync(reportPath, report, 'utf8')

console.log(`规则判断方式与条件结构已对齐：${rows.length} 条`)
console.log(`- ${path.relative(rootDir, reportPath).replaceAll('\\', '/')}`)
