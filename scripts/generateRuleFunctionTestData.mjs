import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const basePackage = path.join(root, 'outputs', 'procurement_supply_chain_db_package_20260721')
const sourceRuleSql = fs.readFileSync(path.join(basePackage, '03_risk_case_data.sql'), 'utf8')
const outputDir = path.join(root, 'outputs', 'rule_function_test_data_20260722')

const database = 'penetrative_supervision_demo'
const batchId = 'RULE-TEST-20260722-V1'
const graphId = 'GRAPH-PROC-DEMO-20260720.1'
const ontologyId = 'ONT-PROC-DEMO'

const organizations = [
  { id: 'ORG-GROUP', name: '中国电子云集团', parentId: null, type: '集团', owner: '尹晨阳' },
  { id: 'ORG-PROC', name: '集团采购中心', parentId: 'ORG-GROUP', type: '职能中心', owner: '李华' },
  { id: 'ORG-INFRA', name: '数字基础设施事业部', parentId: 'ORG-GROUP', type: '事业部', owner: '赵明' },
  { id: 'ORG-DATA', name: '数据智能事业部', parentId: 'ORG-GROUP', type: '事业部', owner: '陈洁' },
  { id: 'ORG-SEC', name: '信息安全事业部', parentId: 'ORG-GROUP', type: '事业部', owner: '周航' },
  { id: 'ORG-OPS', name: '云运营事业部', parentId: 'ORG-GROUP', type: '事业部', owner: '刘敏' },
  { id: 'ORG-FIN', name: '集团财务共享中心', parentId: 'ORG-GROUP', type: '职能中心', owner: '王宁' },
]

const variants = [
  { code: 'HIT', label: '标准命中', outcome: '命中', warning: true },
  { code: 'BND', label: '边界命中', outcome: '命中', warning: true },
  { code: 'MISS', label: '正常不命中', outcome: '未命中', warning: false },
  { code: 'EXC', label: '例外抑制', outcome: '例外', warning: false },
  { code: 'ERR', label: '数据不完整', outcome: '异常', warning: false },
  { code: 'DUP', label: '重复预警抑制', outcome: '重复抑制', warning: false, sourceVariant: 'HIT' },
]

const rule = (number, config) => ({
  number,
  short: `R${String(number).padStart(2, '0')}`,
  ruleCode: `RULE-DEMO-${String(number).padStart(3, '0')}`,
  ruleVersionId: `RAV-RULE-DEMO-${String(number).padStart(3, '0')}-V10`,
  ...config,
})

const rules = [
  rule(1, {
    name: '达到公开招标阈值但采用非公开方式', sceneId: 'SCENE-PROC-001', sceneVersionId: 'SV-SCENE-PROC-001-V10', level: '重大', stage: '事前',
    coreClass: 'PROC.PurchaseProject', coreLabel: '采购项目', relatedClass: 'PROC.ProcurementPlan', relatedLabel: '采购方案', relation: 'PROC.planCreatesProject', relationDirection: 'related-core', event: 'PROC.ProcurementMethodChosen', eventTarget: 'related',
    examples: {
      HIT: [{ estimatedAmount: 5280000, procurementMethod: '竞争性谈判', threshold: 4000000 }, '项目金额528万元≥400万元，采购方式为竞争性谈判'],
      BND: [{ estimatedAmount: 4000000, procurementMethod: '询价采购', threshold: 4000000 }, '项目金额恰好400万元，采购方式为询价采购，达到规则边界'],
      MISS: [{ estimatedAmount: 4000000, procurementMethod: '公开招标', threshold: 4000000 }, '项目达到金额阈值，但采购方式为公开招标'],
      EXC: [{ estimatedAmount: 4600000, procurementMethod: '单一来源', exceptionApprovalNo: 'EX-FT-001', exceptionApproved: true }, '非公开方式已关联有效例外审批EX-FT-001，预警被例外抑制'],
      ERR: [{ estimatedAmount: null, procurementMethod: '竞争性谈判', dataIssue: '项目估算金额缺失' }, '项目估算金额缺失，按失败策略进入异常队列'],
    },
  }),
  rule(2, {
    name: '非公开采购缺少有效例外审批', sceneId: 'SCENE-PROC-001', sceneVersionId: 'SV-SCENE-PROC-001-V10', level: '高', stage: '事前',
    coreClass: 'PROC.ProcurementPlan', coreLabel: '采购方案', relatedClass: 'PROC.ProcurementDemand', relatedLabel: '采购需求', relation: 'PROC.demandFormsPlan', relationDirection: 'related-core', event: 'PROC.ProcurementMethodChosen', eventTarget: 'core',
    examples: {
      HIT: [{ procurementMethod: '竞争性谈判', exceptionApprovalNo: '' }, '采购方式为竞争性谈判，例外审批单号为空'],
      BND: [{ procurementMethod: '单一来源', exceptionApprovalNo: '   ', normalizedApprovalNo: '' }, '例外审批单号仅含空格，标准化后为空'],
      MISS: [{ procurementMethod: '竞争性谈判', exceptionApprovalNo: 'OA-FT-002', approvalStatus: '通过' }, '非公开采购已关联有效审批OA-FT-002'],
      EXC: [{ procurementMethod: '单一来源', exceptionApprovalNo: 'EMG-FT-002', emergencyApproved: true }, '紧急采购已审批，按场景例外转人工复核'],
      ERR: [{ procurementMethod: null, exceptionApprovalNo: '', dataIssue: '采购方式缺失' }, '采购方式字段缺失，无法完成规则判断'],
    },
  }),
  rule(3, {
    name: '同需求同品类短期拆分采购', sceneId: 'SCENE-PROC-002', sceneVersionId: 'SV-SCENE-PROC-002-V10', level: '高', stage: '事前',
    coreClass: 'PROC.ProcurementDemand', coreLabel: '采购需求', relatedClass: 'PROC.PurchaseProject', relatedLabel: '拆分项目', relation: 'PROC.splitFromDemand', relationDirection: 'related-core', event: 'PROC.OrderIssued', eventTarget: 'core',
    examples: {
      HIT: [{ windowDays: 30, category: '办公终端', supplierId: 'SUP-FT-003', orderAmounts: [720000, 710000, 730000], total: 2160000 }, '30天内同需求、同品类、同供应商3笔订单累计216万元≥200万元'],
      BND: [{ windowDays: 30, category: '网络设备', supplierId: 'SUP-FT-003B', orderAmounts: [1000000, 1000000], total: 2000000 }, '30天内2笔订单累计恰好200万元，达到聚合阈值'],
      MISS: [{ windowDays: 30, category: '网络设备', supplierId: 'SUP-FT-003C', orderAmounts: [990000, 1000000], total: 1990000 }, '30天累计199万元，低于200万元阈值'],
      EXC: [{ windowDays: 30, category: '应急备件', supplierId: 'SUP-FT-003D', total: 2100000, emergencyApproved: true }, '累计金额超过阈值，但存在已批准的紧急采购例外'],
      ERR: [{ windowDays: 30, category: '办公终端', supplierId: null, total: 2300000, dataIssue: '供应商编码缺失' }, '聚合维度供应商编码缺失，进入异常队列'],
    },
  }),
  rule(4, {
    name: '三家及以上投标共用IP或设备', sceneId: 'SCENE-PROC-003', sceneVersionId: 'SV-SCENE-PROC-003-V10', level: '重大', stage: '事中',
    coreClass: 'PROC.PurchaseProject', coreLabel: '采购项目', relatedClass: 'PROC.Bid', relatedLabel: '投标记录', relation: 'PROC.bidForProject', relationDirection: 'related-core', event: 'PROC.BidSubmitted', eventTarget: 'related',
    examples: {
      HIT: [{ bidderCount: 3, sharedIp: '10.24.*.18', sharedDevice: 'DEV-FT-004', submitSpanMinutes: 6 }, '3家投标共用IP和设备，提交时间间隔6分钟'],
      BND: [{ bidderCount: 3, sharedIp: '172.20.*.36', sharedDevice: null, submitSpanSeconds: 599 }, '恰好3家投标共用IP，提交跨度9分59秒'],
      MISS: [{ bidderCount: 2, sharedIp: '10.30.*.8', sharedDevice: 'DEV-FT-004C', submitSpanMinutes: 5 }, '仅2家投标主体同源，未达到3家阈值'],
      EXC: [{ bidderCount: 4, sharedIp: '10.40.*.10', sharedService: '集团统一投标代理终端', exceptionApproved: true }, '共用网络来自已备案的统一投标代理服务，按例外抑制'],
      ERR: [{ bidderCount: 3, sharedIp: null, sharedDevice: null, dataIssue: '上传日志和设备指纹缺失' }, '三家投标日志缺失，无法判断IP或设备同源'],
    },
  }),
  rule(5, {
    name: '投标文件高度相似且存在壳企业', sceneId: 'SCENE-PROC-003', sceneVersionId: 'SV-SCENE-PROC-003-V10', level: '重大', stage: '事中',
    coreClass: 'PROC.PurchaseProject', coreLabel: '采购项目', relatedClass: 'PROC.Bid', relatedLabel: '投标记录', relation: 'PROC.bidForProject', relationDirection: 'related-core', event: 'PROC.BidSubmitted', eventTarget: 'related',
    examples: {
      HIT: [{ similarities: [0.94, 0.92], employeeCounts: [2, 1], supplierCount: 2 }, '两家投标文件相似度94%和92%，员工数分别为2人和1人'],
      BND: [{ similarities: [0.85, 0.85], employeeCounts: [3, 3], supplierCount: 2 }, '两家文件相似度恰好85%，员工数恰好3人'],
      MISS: [{ similarities: [0.84, 0.83], employeeCounts: [2, 3], supplierCount: 2 }, '文件相似度低于85%，不满足规则'],
      EXC: [{ similarities: [0.91, 0.9], employeeCounts: [2, 2], approvedTemplate: '集团统一技术模板V3' }, '高相似内容来自已批准的统一模板，按例外转人工复核'],
      ERR: [{ similarities: [0.93, 0.91], employeeCounts: [null, 2], dataIssue: '一家供应商员工数缺失' }, '壳企业判断所需员工数缺失'],
    },
  }),
  rule(6, {
    name: '多家投标人受同一实际控制人控制', sceneId: 'SCENE-PROC-004', sceneVersionId: 'SV-SCENE-PROC-004-V10', level: '重大', stage: '事中',
    coreClass: 'PROC.PurchaseProject', coreLabel: '采购项目', relatedClass: 'PROC.Bid', relatedLabel: '投标记录', relation: 'PROC.bidForProject', relationDirection: 'related-core', event: 'PROC.BidOpened', eventTarget: 'core',
    examples: {
      HIT: [{ controllerId: 'PER-FT-006', controlledBidders: 3, pathDepth: 2 }, '同一实际控制人控制3家投标主体'],
      BND: [{ controllerId: 'PER-FT-006B', controlledBidders: 2, pathDepth: 3 }, '同一实际控制人恰好关联2家投标主体'],
      MISS: [{ controllerId: 'PER-FT-006C', controlledBidders: 1 }, '控制人仅关联1家投标主体'],
      EXC: [{ controllerId: 'PER-FT-006D', controlledBidders: 2, consortiumApproved: true }, '两家主体属于已披露并批准的联合体投标'],
      ERR: [{ controllerId: null, controlledBidders: null, dataIssue: '工商控制关系来源不可用' }, '实际控制关系数据源不可用'],
    },
  }),
  rule(7, {
    name: '投标保证金同源且报价呈等差排列', sceneId: 'SCENE-PROC-004', sceneVersionId: 'SV-SCENE-PROC-004-V10', level: '重大', stage: '事中',
    coreClass: 'PROC.PurchaseProject', coreLabel: '采购项目', relatedClass: 'PROC.Bid', relatedLabel: '投标记录', relation: 'PROC.bidForProject', relationDirection: 'related-core', event: 'PROC.BidOpened', eventTarget: 'core',
    examples: {
      HIT: [{ guaranteeAccount: '6222 **** 7007', bidAmounts: [12180000, 12210000, 12240000], deviationRatio: 0.0049 }, '保证金账户相同，报价呈等差排列，最大偏差率0.49%'],
      BND: [{ guaranteeAccount: '6222 **** 7008', bidAmounts: [10000000, 10025000, 10050000], deviationRatio: 0.005 }, '保证金账户相同，报价偏差率恰好0.5%'],
      MISS: [{ guaranteeAccount: '不同账户', bidAmounts: [10000000, 10100000, 10200000], deviationRatio: 0.01 }, '保证金账户不同且报价偏差率1%'],
      EXC: [{ guaranteeAccount: '集团保证金代收专户', bidAmounts: [10000000, 10030000, 10060000], centralizedAccountApproved: true }, '同源账户为已备案的平台保证金代收专户'],
      ERR: [{ guaranteeAccount: null, bidAmounts: [10000000, 10020000, 10040000], dataIssue: '保证金流水来源账户缺失' }, '保证金来源账户字段缺失'],
    },
  }),
  rule(8, {
    name: '招标公告早于预算批复', sceneId: 'SCENE-PROC-005', sceneVersionId: 'SV-SCENE-PROC-005-V10', level: '高', stage: '事中',
    coreClass: 'PROC.PurchaseProject', coreLabel: '采购项目', relatedClass: 'PROC.TenderAnnouncement', relatedLabel: '招标公告', relation: 'PROC.projectHasAnnouncement', relationDirection: 'core-related', event: 'PROC.TenderPublished', eventTarget: 'related',
    examples: {
      HIT: [{ tenderPublishedAt: '2026-07-02 09:00:00', budgetApprovedAt: '2026-07-08 10:00:00' }, '公告发布于7月2日，预算7月8日才批复'],
      BND: [{ tenderPublishedAt: '2026-07-10 09:59:59', budgetApprovedAt: '2026-07-10 10:00:00' }, '公告比预算批复早1秒，满足时序异常'],
      MISS: [{ tenderPublishedAt: '2026-07-10 10:00:01', budgetApprovedAt: '2026-07-10 10:00:00' }, '预算批复先于公告发布1秒'],
      EXC: [{ tenderPublishedAt: '2026-07-02 09:00:00', budgetApprovedAt: '2026-07-08 10:00:00', emergencyApproved: true }, '紧急采购已审批，时序异常按例外处理'],
      ERR: [{ tenderPublishedAt: '2026-07-02 09:00:00', budgetApprovedAt: null, dataIssue: '预算批复事件缺失' }, '预算批复事件缺失，无法完成时序比对'],
    },
  }),
  rule(9, {
    name: '公开招标投标期不足20天', sceneId: 'SCENE-PROC-005', sceneVersionId: 'SV-SCENE-PROC-005-V10', level: '高', stage: '事中',
    coreClass: 'PROC.TenderAnnouncement', coreLabel: '招标公告', relatedClass: 'PROC.PurchaseProject', relatedLabel: '采购项目', relation: 'PROC.projectHasAnnouncement', relationDirection: 'related-core', event: 'PROC.TenderPublished', eventTarget: 'core',
    examples: {
      HIT: [{ publishAt: '2026-07-01 09:00:00', bidDeadline: '2026-07-08 09:00:00', effectiveDays: 7 }, '公告至投标截止仅7天＜20天'],
      BND: [{ publishAt: '2026-07-01 09:00:00', bidDeadline: '2026-07-21 08:59:59', effectiveDays: 19.99999 }, '投标期比20天少1秒，仍应命中'],
      MISS: [{ publishAt: '2026-07-01 09:00:00', bidDeadline: '2026-07-21 09:00:00', effectiveDays: 20 }, '投标期恰好20天，不满足小于20天条件'],
      EXC: [{ publishAt: '2026-07-01 09:00:00', bidDeadline: '2026-07-11 09:00:00', emergencyApproved: true }, '已批准紧急采购缩短投标期'],
      ERR: [{ publishAt: '2026-07-01 09:00:00', bidDeadline: null, dataIssue: '投标截止时间缺失' }, '投标截止时间缺失'],
    },
  }),
  rule(10, {
    name: '评审专家指定且无抽取记录', sceneId: 'SCENE-PROC-005', sceneVersionId: 'SV-SCENE-PROC-005-V10', level: '高', stage: '事中',
    coreClass: 'PROC.ReviewPanel', coreLabel: '评审委员会', relatedClass: 'PROC.PurchaseProject', relatedLabel: '采购项目', relation: 'PROC.panelReviewsProject', relationDirection: 'core-related', event: 'PROC.PanelSelected', eventTarget: 'core',
    examples: {
      HIT: [{ selectionMethod: '指定', drawRecordNo: '' }, '专家产生方式为指定，抽取记录为空'],
      BND: [{ selectionMethod: '指定', drawRecordNo: '   ', normalizedDrawRecordNo: '' }, '抽取记录仅含空格，标准化后为空'],
      MISS: [{ selectionMethod: '随机抽取', drawRecordNo: 'DRAW-FT-010' }, '专家随机抽取且存在完整抽取记录'],
      EXC: [{ selectionMethod: '指定', drawRecordNo: '', specialPanelApproved: true }, '涉密项目指定专家已履行专项审批'],
      ERR: [{ selectionMethod: null, drawRecordNo: '', dataIssue: '专家产生方式缺失' }, '专家产生方式字段缺失'],
    },
  }),
  rule(11, {
    name: '票款齐全但物流入库验收异常', sceneId: 'SCENE-SC-006', sceneVersionId: 'SV-SCENE-SC-006-V10', level: '重大', stage: '事后',
    coreClass: 'PROC.Contract', coreLabel: '采购合同', relatedClass: 'PROC.Supplier', relatedLabel: '供应商', relation: 'PROC.contractWithSupplier', relationDirection: 'core-related', event: 'PROC.PaymentExecuted', eventTarget: 'extra', extraClass: 'PROC.Payment', extraLabel: '付款记录',
    examples: {
      HIT: [{ paymentCompleted: true, gpsDistanceKm: 2.4, expectedDistanceKm: 1200, receiptStatus: '异常', inspectionAccepted: false }, '付款完成但GPS轨迹仅2.4公里、收货异常且未验收'],
      BND: [{ paymentCompleted: true, gpsDistanceKm: 0, expectedDistanceKm: 1, receiptStatus: '未收货', inspectionAccepted: false }, '付款完成但没有有效运输轨迹且未收货'],
      MISS: [{ paymentCompleted: true, gpsDistanceKm: 1186, expectedDistanceKm: 1200, receiptStatus: '已收货', inspectionAccepted: true }, '物流、收货、入库和验收链路完整'],
      EXC: [{ paymentCompleted: true, contractType: '纯软件服务', physicalDeliveryNotRequired: true, exceptionApproved: true }, '纯软件服务合同经审批无需实物物流和入库'],
      ERR: [{ paymentCompleted: true, gpsDistanceKm: null, receiptStatus: null, dataIssue: '物流和收货数据源不可用' }, '物流与收货数据缺失，进入异常队列'],
    },
  }),
  rule(12, {
    name: '付款后资金回流采购方关联主体', sceneId: 'SCENE-SC-006', sceneVersionId: 'SV-SCENE-SC-006-V10', level: '重大', stage: '事后',
    coreClass: 'PROC.Contract', coreLabel: '采购合同', relatedClass: 'PROC.Supplier', relatedLabel: '供应商', relation: 'PROC.contractWithSupplier', relationDirection: 'core-related', event: 'PROC.PaymentExecuted', eventTarget: 'extra', extraClass: 'PROC.Payment', extraLabel: '付款记录',
    examples: {
      HIT: [{ paymentAmount: 4860000, relatedTransferAmount: 4620000, transferRatio: 0.9506, transferAfterDays: 1 }, '486万元付款次日有462万元流向采购方关联主体，比例95.06%'],
      BND: [{ paymentAmount: 5000000, relatedTransferAmount: 4000000, transferRatio: 0.8, transferAfterDays: 3 }, '付款后第3天恰好80%资金流向关联主体'],
      MISS: [{ paymentAmount: 5000000, relatedTransferAmount: 3995000, transferRatio: 0.799, transferAfterDays: 2 }, '关联流出比例79.9%，低于80%阈值'],
      EXC: [{ paymentAmount: 5000000, relatedTransferAmount: 4500000, transferRatio: 0.9, escrowTransferApproved: true }, '资金转入经批准的集团托管结算账户'],
      ERR: [{ paymentAmount: 5000000, relatedTransferAmount: null, relatedPartyId: null, dataIssue: '后续流水关联主体识别失败' }, '后续资金流水或关联主体关系缺失'],
    },
  }),
  rule(13, {
    name: '中标后90天内合同增幅超过20%', sceneId: 'SCENE-CON-007', sceneVersionId: 'SV-SCENE-CON-007-V10', level: '高', stage: '事后',
    coreClass: 'PROC.Contract', coreLabel: '采购合同', relatedClass: 'PROC.ContractChange', relatedLabel: '合同变更', relation: 'PROC.contractHasChange', relationDirection: 'core-related', event: 'PROC.ContractChanged', eventTarget: 'related',
    examples: {
      HIT: [{ originalAmount: 6800000, changeAmount: 2570400, changeRatio: 0.378, daysAfterAward: 18 }, '中标后18天累计增加257.04万元，合同增幅37.8%'],
      BND: [{ originalAmount: 10000000, changeAmount: 2001000, changeRatio: 0.2001, daysAfterAward: 90 }, '第90天合同增幅20.01%，刚刚超过20%阈值'],
      MISS: [{ originalAmount: 10000000, changeAmount: 2000000, changeRatio: 0.2, daysAfterAward: 90 }, '第90天合同增幅恰好20%，不满足大于20%'],
      EXC: [{ originalAmount: 10000000, changeAmount: 3000000, changeRatio: 0.3, scopeExpansionApproved: true }, '合同范围扩展已履行重新审批和预算批复'],
      ERR: [{ originalAmount: null, changeAmount: 2500000, dataIssue: '原合同金额缺失' }, '缺少原合同金额，无法计算变更比例'],
    },
  }),
  rule(14, {
    name: '验收前累计付款超过合同80%', sceneId: 'SCENE-CON-007', sceneVersionId: 'SV-SCENE-CON-007-V10', level: '高', stage: '事后',
    coreClass: 'PROC.Contract', coreLabel: '采购合同', relatedClass: 'PROC.Supplier', relatedLabel: '供应商', relation: 'PROC.contractWithSupplier', relationDirection: 'core-related', event: 'PROC.PaymentExecuted', eventTarget: 'extra', extraClass: 'PROC.Payment', extraLabel: '付款记录',
    examples: {
      HIT: [{ contractAmount: 9300000, paidAmount: 8370000, paymentRatio: 0.9, inspectionAccepted: false }, '尚未验收时累计付款837万元，占合同金额90%'],
      BND: [{ contractAmount: 10000000, paidAmount: 8001000, paymentRatio: 0.8001, paidBeforeInspectionSeconds: 1 }, '验收前1秒累计付款比例80.01%，刚刚超过阈值'],
      MISS: [{ contractAmount: 10000000, paidAmount: 8000000, paymentRatio: 0.8, inspectionAccepted: false }, '验收前累计付款恰好80%，不满足大于80%'],
      EXC: [{ contractAmount: 10000000, paidAmount: 9000000, paymentRatio: 0.9, milestoneApproved: true }, '高比例里程碑付款已履行专项审批'],
      ERR: [{ contractAmount: null, paidAmount: 8500000, dataIssue: '合同金额缺失' }, '合同金额缺失，无法计算累计付款比例'],
    },
  }),
]

for (const item of rules) {
  if (!sourceRuleSql.includes(`'${item.ruleVersionId}'`)) throw new Error(`基础规则不存在：${item.ruleVersionId}`)
}

const crossScenarios = [
  { id: 'FT-CROSS-01', rules: [1, 2], organizationId: 'ORG-INFRA', title: '大额非公开采购且缺少例外审批', summary: '项目金额达到公开招标阈值，同时采用非公开方式且无有效例外审批' },
  { id: 'FT-CROSS-02', rules: [8, 9, 10], organizationId: 'ORG-OPS', title: '采购流程多环节同时异常', summary: '公告早于预算批复、投标期不足20天且专家指定无抽取记录' },
  { id: 'FT-CROSS-03', rules: [11, 12], organizationId: 'ORG-FIN', title: '虚假贸易与资金回流复合风险', summary: '付款缺少物流验收闭环，且资金在3天内回流采购方关联主体' },
  { id: 'FT-CROSS-04', rules: [13, 14], organizationId: 'ORG-SEC', title: '合同异常变更并超前付款', summary: '合同90天内增幅超过20%，同时验收前付款比例超过80%' },
]

const orgById = new Map(organizations.map((item) => [item.id, item]))
const ruleByNumber = new Map(rules.map((item) => [item.number, item]))
const sqlString = (value) => `'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "''")}'`
const sqlValue = (value) => value === null || value === undefined ? 'NULL' : typeof value === 'number' ? String(value) : sqlString(value)
const jsonSql = (value) => sqlString(JSON.stringify(value))
const insert = (table, columns, rows, updateColumns = []) => {
  const values = rows.map((row) => `(${row.map(sqlValue).join(',')})`).join(',\n')
  const update = updateColumns.length ? `\nON DUPLICATE KEY UPDATE ${updateColumns.map((column) => `\`${column}\`=VALUES(\`${column}\`)`).join(',')}` : ''
  return `INSERT INTO \`${table}\` (${columns.map((column) => `\`${column}\``).join(',')}) VALUES\n${values}${update};\n`
}
const safe = (value) => value.replaceAll(/[^A-Z0-9-]/g, '-')
const testCaseIdFor = (item, variantCode) => `FT-${item.short}-${variantCode}`
const warningCodeFor = (item, variantCode) => `WA-FT-${item.short}-${variantCode}`
const coreIdFor = (sourceCaseId, item) => safe(`${sourceCaseId}-${item.short}-OBJ`)
const relatedIdFor = (sourceCaseId, item) => safe(`${sourceCaseId}-${item.short}-REL`)
const extraIdFor = (sourceCaseId, item) => safe(`${sourceCaseId}-${item.short}-EVT`)

const testCaseRows = []
const runRows = []
const warningRows = []
const evidenceRows = []
const organizationLinkRows = []
const entityRows = []
const relationRows = []
const eventRows = []
const sourceCaseKeys = new Set()
const warningMeta = []

function addSourceGraph({ sourceCaseId, item, organizationId, inputObjectName, payload }) {
  const graphKey = `${sourceCaseId}|${item.ruleVersionId}`
  if (sourceCaseKeys.has(graphKey)) return
  sourceCaseKeys.add(graphKey)
  const coreId = coreIdFor(sourceCaseId, item)
  const relatedId = relatedIdFor(sourceCaseId, item)
  const extraId = item.eventTarget === 'extra' ? extraIdFor(sourceCaseId, item) : null
  entityRows.push([
    graphId, coreId, ontologyId, item.coreClass, inputObjectName, sourceCaseId, organizationId, 'RuleFixture', coreId,
    '2026-07-01 00:00:00', null, '有效', jsonSql({ testSource: batchId, role: 'core', organizationId, ruleCode: item.ruleCode, inputs: payload }), batchId,
  ])
  entityRows.push([
    graphId, relatedId, ontologyId, item.relatedClass, `${inputObjectName}-${item.relatedLabel}`, sourceCaseId, organizationId, 'RuleFixture', relatedId,
    '2026-07-01 00:00:00', null, '有效', jsonSql({ testSource: batchId, role: 'related', ruleCode: item.ruleCode }), batchId,
  ])
  if (extraId) {
    entityRows.push([
      graphId, extraId, ontologyId, item.extraClass, `${inputObjectName}-${item.extraLabel}`, sourceCaseId, organizationId, 'RuleFixture', extraId,
      '2026-07-01 00:00:00', null, '有效', jsonSql({ testSource: batchId, role: 'event-object', ruleCode: item.ruleCode }), batchId,
    ])
  }
  const fromId = item.relationDirection === 'related-core' ? relatedId : coreId
  const toId = item.relationDirection === 'related-core' ? coreId : relatedId
  relationRows.push([
    graphId, safe(`REL-${sourceCaseId}-${item.short}`), item.relation, fromId, toId, sourceCaseId, 'RuleFixture', `REL-${sourceCaseId}-${item.short}`,
    null, 1, '2026-07-01 00:00:00', null, jsonSql({ testSource: batchId, ruleCode: item.ruleCode, expectedPath: true }), batchId,
  ])
  const eventObjectId = item.eventTarget === 'related' ? relatedId : item.eventTarget === 'extra' ? extraId : coreId
  eventRows.push([
    graphId, safe(`EVT-${sourceCaseId}-${item.short}`), item.event, `${item.name}-${sourceCaseId}`, sourceCaseId, eventObjectId,
    null, null, '2026-07-20 10:00:00', null, '已完成', 'RuleFixture', `EVT-${sourceCaseId}-${item.short}`,
    jsonSql({ testSource: batchId, ruleCode: item.ruleCode, inputs: payload }), batchId,
  ])
}

function addWarning({ code, sourceCaseId, item, organizationId, objectId, objectName, title, summary, variantCode, hitRuleCount, runTime, status, riskScore }) {
  const org = orgById.get(organizationId)
  const dueAt = status === '已解除' ? '2026-07-21 18:00:00' : status === '已升级' ? '2026-07-22 12:00:00' : '2026-07-24 18:00:00'
  warningRows.push([
    code, sourceCaseId, item.sceneId, item.sceneVersionId, title, objectId, objectName, item.stage, item.level, status,
    hitRuleCount, 3, riskScore, variantCode === 'BND' ? '部分缺失' : '完整', org.owner, org.name, runTime, dueAt, graphId, `trace-${code.toLowerCase()}`, batchId,
  ])
  organizationLinkRows.push([code, organizationId, '主业务对象责任组织', org.name, batchId])
  warningMeta.push({ code, sourceCaseId, organizationId, summary, hitRuleCount })
}

for (const item of rules) {
  const organization = organizations[(item.number - 1) % (organizations.length - 1) + 1]
  const hitSourceCaseId = testCaseIdFor(item, 'HIT')
  for (const variant of variants) {
    const testCaseId = testCaseIdFor(item, variant.code)
    const sourceCaseId = variant.sourceVariant ? testCaseIdFor(item, variant.sourceVariant) : testCaseId
    const [payload, summary] = variant.sourceVariant ? item.examples.HIT : item.examples[variant.code]
    const inputObjectName = `功能测试-${item.coreLabel}-${item.short}-${variant.sourceVariant || variant.code}`
    const inputObjectId = coreIdFor(sourceCaseId, item)
    const warningCode = variant.warning ? warningCodeFor(item, variant.code) : ''
    const dedupeKey = `${item.ruleCode}|${inputObjectId}|${sourceCaseId}`
    if (!variant.sourceVariant) addSourceGraph({ sourceCaseId, item, organizationId: organization.id, inputObjectName, payload })
    testCaseRows.push([
      testCaseId, item.ruleVersionId, item.ruleCode, variant.code, variant.label, sourceCaseId, inputObjectId, organization.id,
      variant.outcome, variant.warning ? 1 : 0, warningCode, summary, dedupeKey, jsonSql({ ...payload, testCaseId, sourceCaseId }), batchId,
    ])
    const runTime = `2026-07-${String(7 + item.number).padStart(2, '0')} ${variant.code === 'BND' ? '10:05:00' : '10:00:00'}`
    runRows.push([
      `RUN-${testCaseId}`, item.sceneVersionId, item.ruleVersionId, null, inputObjectId, inputObjectName, variant.outcome,
      jsonSql({ testCaseId, sourceCaseId, variant: variant.code, caseId: sourceCaseId, riskLevel: item.level, actualValueSummary: summary, evidenceStatus: variant.code === 'ERR' ? '缺失' : '完整', organizationId: organization.id, expectedWarning: variant.warning, dedupeKey, importBatch: batchId }),
      warningCode, runTime,
    ])
    if (variant.warning) {
      const status = (item.number + (variant.code === 'BND' ? 1 : 0)) % 5 === 0 ? '已解除' : (item.number + (variant.code === 'BND' ? 2 : 0)) % 4 === 0 ? '已升级' : '待研判'
      addWarning({
        code: warningCode, sourceCaseId, item, organizationId: organization.id, objectId: inputObjectId, objectName: inputObjectName,
        title: `功能测试｜${item.name}（${variant.label}）`, summary, variantCode: variant.code, hitRuleCount: 1, runTime, status,
        riskScore: item.level === '重大' ? (variant.code === 'HIT' ? 91 : 86) : (variant.code === 'HIT' ? 81 : 76),
      })
    }
  }
  if (!sourceCaseKeys.has(`${hitSourceCaseId}|${item.ruleVersionId}`)) throw new Error(`命中源案例未生成：${item.ruleCode}`)
}

for (const [crossIndex, cross] of crossScenarios.entries()) {
  const org = orgById.get(cross.organizationId)
  const warningCode = `WA-${cross.id}`
  const memberRules = cross.rules.map((number) => ruleByNumber.get(number))
  for (const item of memberRules) {
    const payload = { crossScenario: cross.id, memberRules: cross.rules.map((number) => `RULE-DEMO-${String(number).padStart(3, '0')}`), expectedCompositeRisk: cross.title }
    const objectName = `${cross.title}-${item.coreLabel}`
    addSourceGraph({ sourceCaseId: cross.id, item, organizationId: cross.organizationId, inputObjectName: objectName, payload })
    const inputObjectId = coreIdFor(cross.id, item)
    const summary = `${item.name}：${cross.summary}`
    testCaseRows.push([
      cross.id, item.ruleVersionId, item.ruleCode, 'CROSS', '多规则共同命中', cross.id, inputObjectId, cross.organizationId,
      '命中', 1, warningCode, summary, `${item.ruleCode}|${cross.id}`, jsonSql(payload), batchId,
    ])
    runRows.push([
      `RUN-${cross.id}-${item.short}`, item.sceneVersionId, item.ruleVersionId, null, inputObjectId, objectName, '命中',
      jsonSql({ testCaseId: cross.id, sourceCaseId: cross.id, variant: 'CROSS', caseId: cross.id, riskLevel: item.level, actualValueSummary: summary, evidenceStatus: '完整', organizationId: cross.organizationId, expectedWarning: true, importBatch: batchId }),
      warningCode, `2026-07-22 0${8 + crossIndex}:00:0${item.number % 10}`,
    ])
  }
  const primaryRule = memberRules[0]
  addWarning({
    code: warningCode, sourceCaseId: cross.id, item: primaryRule, organizationId: cross.organizationId,
    objectId: coreIdFor(cross.id, primaryRule), objectName: `${cross.title}-${primaryRule.coreLabel}`, title: `功能测试｜${cross.title}`,
    summary: cross.summary, variantCode: 'CROSS', hitRuleCount: memberRules.length, runTime: `2026-07-22 ${String(8 + crossIndex).padStart(2, '0')}:00:00`,
    status: crossIndex % 2 === 0 ? '已升级' : '待研判', riskScore: primaryRule.level === '重大' ? 95 : 88,
  })
}

for (const warning of warningMeta) {
  const common = [warning.code, warning.sourceCaseId]
  evidenceRows.push([
    `EVI-${warning.code}-01`, ...common, '规则输入快照', 'RuleFixture', warning.sourceCaseId, '规则实际输入', warning.summary,
    '2026-07-22 12:00:00', '有效', `sha256:${crypto.createHash('sha256').update(`${warning.code}|input`).digest('hex')}`, '与规则阈值对应的确定性测试输入', batchId,
  ])
  const org = orgById.get(warning.organizationId)
  evidenceRows.push([
    `EVI-${warning.code}-02`, ...common, '组织归属', '组织主数据', warning.organizationId, '主业务对象责任组织', `${warning.organizationId} / ${org.name}`,
    '2026-07-22 12:00:01', '有效', `sha256:${crypto.createHash('sha256').update(`${warning.code}|org`).digest('hex')}`, '预警组织由主业务对象责任组织自动继承', batchId,
  ])
  evidenceRows.push([
    `EVI-${warning.code}-03`, ...common, '规则运行明细', '规则运行服务', warning.code, '命中规则数量', `${warning.hitRuleCount}条规则命中`,
    '2026-07-22 12:00:02', '有效', `sha256:${crypto.createHash('sha256').update(`${warning.code}|run`).digest('hex')}`, '用于验证规则命中、去重和多规则合并', batchId,
  ])
}

const schemaSql = `-- 规则驱动功能测试扩展表\nSET NAMES utf8mb4;\nUSE \`${database}\`;\nSTART TRANSACTION;\n\nCREATE TABLE IF NOT EXISTS supervision_organizations (\n  id VARCHAR(100) PRIMARY KEY, code VARCHAR(100) NOT NULL UNIQUE, name VARCHAR(160) NOT NULL, parent_id VARCHAR(100) NULL, organization_type VARCHAR(40) NOT NULL,\n  responsible_person VARCHAR(80) NOT NULL, status VARCHAR(24) NOT NULL, source_system VARCHAR(80) NOT NULL, batch_id VARCHAR(80) NOT NULL,\n  KEY idx_supervision_org_parent (parent_id), KEY idx_supervision_org_batch (batch_id)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n\nCREATE TABLE IF NOT EXISTS rule_test_cases (\n  test_case_id VARCHAR(100) NOT NULL, rule_version_id VARCHAR(80) NOT NULL, rule_code VARCHAR(64) NOT NULL, variant_code VARCHAR(24) NOT NULL, variant_name VARCHAR(80) NOT NULL,\n  source_case_id VARCHAR(100) NOT NULL, input_object_id VARCHAR(100) NOT NULL, organization_id VARCHAR(100) NOT NULL, expected_outcome VARCHAR(24) NOT NULL, expected_warning TINYINT(1) NOT NULL,\n  expected_warning_code VARCHAR(80) NOT NULL DEFAULT '', expected_summary VARCHAR(500) NOT NULL, dedupe_key VARCHAR(240) NOT NULL, input_payload_json JSON NOT NULL, batch_id VARCHAR(80) NOT NULL,\n  PRIMARY KEY (test_case_id, rule_version_id), KEY idx_rule_test_rule (rule_version_id, variant_code), KEY idx_rule_test_org (organization_id, expected_outcome), KEY idx_rule_test_batch (batch_id)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n\nCREATE TABLE IF NOT EXISTS risk_warning_org_links (\n  warning_code VARCHAR(80) PRIMARY KEY, organization_id VARCHAR(100) NOT NULL, attribution_source VARCHAR(80) NOT NULL, organization_name_snapshot VARCHAR(160) NOT NULL, batch_id VARCHAR(80) NOT NULL,\n  KEY idx_warning_org_rank (organization_id, batch_id), CONSTRAINT fk_test_warning_org_warning FOREIGN KEY (warning_code) REFERENCES risk_warnings(warning_code) ON DELETE CASCADE\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n\nCOMMIT;\n`

const batchCounts = {
  organizations: organizations.length,
  ruleTestRows: testCaseRows.length,
  uniqueTestScenarios: new Set(testCaseRows.map((row) => row[0])).size,
  ruleRuns: runRows.length,
  warnings: warningRows.length,
  evidence: evidenceRows.length,
  graphEntities: entityRows.length,
  graphRelations: relationRows.length,
  graphEvents: eventRows.length,
}

const sourceSql = `-- 规则测试组织、输入案例与图谱源数据\nSET NAMES utf8mb4;\nUSE \`${database}\`;\nSTART TRANSACTION;\n\n${insert('supervision_organizations', ['id','code','name','parent_id','organization_type','responsible_person','status','source_system','batch_id'], organizations.map((item) => [item.id, item.id, item.name, item.parentId, item.type, item.owner, '启用', '功能测试组织主数据', batchId]), ['name','parent_id','organization_type','responsible_person','status','source_system','batch_id'])}\n${insert('rule_test_cases', ['test_case_id','rule_version_id','rule_code','variant_code','variant_name','source_case_id','input_object_id','organization_id','expected_outcome','expected_warning','expected_warning_code','expected_summary','dedupe_key','input_payload_json','batch_id'], testCaseRows, ['rule_code','variant_code','variant_name','source_case_id','input_object_id','organization_id','expected_outcome','expected_warning','expected_warning_code','expected_summary','dedupe_key','input_payload_json','batch_id'])}\n${insert('graph_entities', ['graph_id','id','ontology_id','class_code','name','case_id','organization_id','source_system','source_record','valid_from','valid_to','status','properties_json','batch_id'], entityRows, ['ontology_id','class_code','name','case_id','organization_id','source_system','source_record','valid_from','valid_to','status','properties_json','batch_id'])}\n${insert('graph_relations', ['graph_id','id','relation_code','from_entity_id','to_entity_id','case_id','source_system','source_record','evidence_id','confidence','valid_from','valid_to','properties_json','batch_id'], relationRows, ['relation_code','from_entity_id','to_entity_id','case_id','source_system','source_record','evidence_id','confidence','valid_from','valid_to','properties_json','batch_id'])}\n${insert('graph_events', ['graph_id','id','event_code','name','case_id','object_entity_id','actor_entity_id','organization_entity_id','event_time','amount','status','source_system','source_record','properties_json','batch_id'], eventRows, ['event_code','name','case_id','object_entity_id','actor_entity_id','organization_entity_id','event_time','amount','status','source_system','source_record','properties_json','batch_id'])}\n${insert('demo_import_batches', ['batch_id','package_version','source_file','source_sha256','status','row_counts_json','started_at','finished_at','notes'], [[batchId, 'v1', 'scripts/generateRuleFunctionTestData.mjs', crypto.createHash('sha256').update(sourceRuleSql).digest('hex'), '已生成', jsonSql(batchCounts), '2026-07-22 12:00:00', '2026-07-22 12:00:00', '基于14条已发布规则生成的确定性功能测试数据']], ['package_version','source_file','source_sha256','status','row_counts_json','finished_at','notes'])}\nCOMMIT;\n`

const runtimeSql = `-- 规则预期运行结果、预警、证据与组织归属\nSET NAMES utf8mb4;\nUSE \`${database}\`;\nSTART TRANSACTION;\n\n${insert('risk_warnings', ['warning_code','case_id','scene_code','scene_version_id','title','object_id','object_name','stage','risk_level','status','hit_rule_count','evidence_count','risk_score','evidence_status','owner_name','organization_name','generated_at','due_at','graph_version','trace_id','batch_id'], warningRows, ['case_id','scene_code','scene_version_id','title','object_id','object_name','stage','risk_level','status','hit_rule_count','evidence_count','risk_score','evidence_status','owner_name','organization_name','generated_at','due_at','graph_version','trace_id','batch_id'])}\n${insert('rule_run_records', ['id','scene_version_id','rule_version_id','trial_sample_id','object_code','object_name','outcome','evidence_json','warning_code','executed_at'], runRows, ['scene_version_id','rule_version_id','object_code','object_name','outcome','evidence_json','warning_code','executed_at'])}\n${insert('risk_evidence', ['evidence_id','warning_code','case_id','evidence_type','source_system','source_record','field_or_relation','evidence_value','collected_at','validity','evidence_hash','description','batch_id'], evidenceRows, ['warning_code','case_id','evidence_type','source_system','source_record','field_or_relation','evidence_value','collected_at','validity','evidence_hash','description','batch_id'])}\n${insert('risk_warning_org_links', ['warning_code','organization_id','attribution_source','organization_name_snapshot','batch_id'], organizationLinkRows, ['organization_id','attribution_source','organization_name_snapshot','batch_id'])}\nCOMMIT;\n`

const validationSql = `-- 功能测试数据验收\nSET NAMES utf8mb4;\nUSE \`${database}\`;\n\nSELECT 'batch_counts' AS check_name,\n+  (SELECT COUNT(*) FROM rule_test_cases WHERE batch_id='${batchId}') AS test_case_rows,\n+  (SELECT COUNT(DISTINCT test_case_id) FROM rule_test_cases WHERE batch_id='${batchId}') AS test_scenarios,\n+  (SELECT COUNT(*) FROM rule_run_records WHERE JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.importBatch'))='${batchId}') AS rule_runs,\n+  (SELECT COUNT(*) FROM risk_warnings WHERE batch_id='${batchId}') AS warnings,\n+  (SELECT COUNT(*) FROM risk_evidence WHERE batch_id='${batchId}') AS evidence;\n\nSELECT 'rule_coverage' AS check_name, rule_code, COUNT(*) AS evaluation_count, COUNT(DISTINCT variant_code) AS variant_count,\n+  SUM(expected_warning) AS expected_warning_count\n+FROM rule_test_cases WHERE batch_id='${batchId}' GROUP BY rule_code ORDER BY rule_code;\n\nSELECT 'outcome_mismatch_should_be_zero' AS check_name, COUNT(*) AS violation_count\n+FROM rule_test_cases tc LEFT JOIN rule_run_records rr\n+  ON rr.rule_version_id=tc.rule_version_id AND JSON_UNQUOTE(JSON_EXTRACT(rr.evidence_json,'$.testCaseId'))=tc.test_case_id\n+WHERE tc.batch_id='${batchId}' AND (rr.id IS NULL OR rr.outcome<>tc.expected_outcome);\n\nSELECT 'warning_expectation_mismatch_should_be_zero' AS check_name, COUNT(*) AS violation_count\n+FROM rule_test_cases tc LEFT JOIN risk_warnings w ON w.warning_code=tc.expected_warning_code\n+WHERE tc.batch_id='${batchId}' AND ((tc.expected_warning=1 AND w.warning_code IS NULL) OR (tc.expected_warning=0 AND tc.expected_warning_code<>''));\n\nSELECT 'evidence_count_mismatch_should_be_zero' AS check_name, COUNT(*) AS violation_count\n+FROM risk_warnings w LEFT JOIN (SELECT warning_code,COUNT(*) AS actual_count FROM risk_evidence WHERE batch_id='${batchId}' GROUP BY warning_code) e ON e.warning_code=w.warning_code\n+WHERE w.batch_id='${batchId}' AND w.evidence_count<>COALESCE(e.actual_count,0);\n\nSELECT 'organization_link_mismatch_should_be_zero' AS check_name, COUNT(*) AS violation_count\n+FROM risk_warnings w LEFT JOIN risk_warning_org_links l ON l.warning_code=w.warning_code LEFT JOIN supervision_organizations o ON o.id=l.organization_id\n+WHERE w.batch_id='${batchId}' AND (l.warning_code IS NULL OR o.id IS NULL OR w.organization_name<>l.organization_name_snapshot);\n\nSELECT 'graph_endpoint_mismatch_should_be_zero' AS check_name, COUNT(*) AS violation_count\n+FROM graph_relations r LEFT JOIN graph_entities f ON f.graph_id=r.graph_id AND f.id=r.from_entity_id LEFT JOIN graph_entities t ON t.graph_id=r.graph_id AND t.id=r.to_entity_id\n+WHERE r.batch_id='${batchId}' AND (f.id IS NULL OR t.id IS NULL);\n\nSELECT 'organization_risk_rank' AS check_name, l.organization_id, l.organization_name_snapshot, COUNT(*) AS warning_count, ROUND(SUM(w.risk_score),2) AS total_risk_score\n+FROM risk_warnings w JOIN risk_warning_org_links l ON l.warning_code=w.warning_code\n+WHERE w.batch_id='${batchId}' GROUP BY l.organization_id,l.organization_name_snapshot ORDER BY total_risk_score DESC,warning_count DESC;\n`

const rollbackSql = `-- 仅回滚规则功能测试批次\nSET NAMES utf8mb4;\nUSE \`${database}\`;\nSTART TRANSACTION;\nDELETE FROM risk_warning_org_links WHERE batch_id='${batchId}';\nDELETE FROM risk_evidence WHERE batch_id='${batchId}';\nDELETE FROM risk_warnings WHERE batch_id='${batchId}';\nDELETE FROM rule_run_records WHERE JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.importBatch'))='${batchId}';\nDELETE FROM graph_events WHERE batch_id='${batchId}';\nDELETE FROM graph_relations WHERE batch_id='${batchId}';\nDELETE FROM graph_entities WHERE batch_id='${batchId}';\nDELETE FROM rule_test_cases WHERE batch_id='${batchId}';\nDELETE FROM supervision_organizations WHERE batch_id='${batchId}';\nDELETE FROM demo_import_batches WHERE batch_id='${batchId}';\nCOMMIT;\n`

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
const csvRows = [['测试场景ID','规则编码','规则名称','用例类型','来源案例ID','组织编码','组织名称','输入对象','预期结果','预期生成预警','预期预警编号','预期说明']]
for (const row of testCaseRows) {
  const item = rules.find((candidate) => candidate.ruleVersionId === row[1])
  csvRows.push([row[0], row[2], item.name, row[4], row[5], row[7], orgById.get(row[7]).name, row[6], row[8], row[9] ? '是' : '否', row[10], row[11]])
}
const matrixCsv = `\uFEFF${csvRows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`

const expected = {
  batchId,
  graphId,
  basePackage: path.relative(root, basePackage).replaceAll('\\', '/'),
  generatedAt: '2026-07-22T12:00:00+08:00',
  counts: batchCounts,
  coverage: {
    publishedRules: rules.length,
    baseVariantsPerRule: variants.length,
    multiRuleScenarios: crossScenarios.length,
    expectedWarnings: warningRows.length,
    expectedOutcomeDistribution: Object.fromEntries([...new Set(testCaseRows.map((row) => row[8]))].map((outcome) => [outcome, testCaseRows.filter((row) => row[8] === outcome).length])),
  },
}

const readme = `# 规则驱动功能测试数据包\n\n生成日期：2026-07-22  
测试批次：\`${batchId}\`  
依赖基础包：\`outputs/procurement_supply_chain_db_package_20260721\`\n\n## 目标\n\n本包基于当前数据库中的14条已发布规则生成确定性测试数据。每条输入都有预期结果，不是随机Mock，可用于规则列表、统一预警、证据子图、组织排行、状态筛选、重复抑制和多规则合并测试。\n\n当前项目尚未实现可直接从来源业务表执行全部14条规则的通用规则引擎，因此本包同时保存：规则输入快照、预期结果、预计算运行记录、预警、证据和图谱链路。\n\n## 覆盖范围\n\n- 14条已发布规则。\n- 每条规则6类基础用例：标准命中、边界命中、正常不命中、例外抑制、数据不完整、重复预警抑制。\n- 4组多规则共同命中场景。\n- ${batchCounts.uniqueTestScenarios}个测试场景，${batchCounts.ruleTestRows}条规则评估，${batchCounts.warnings}条预期预警。\n- 组织归属通过\`organization_id\`和\`risk_warning_org_links\`明确记录，来源为“主业务对象责任组织”。\n\n## 执行顺序\n\n1. 先完成基础包的00至03脚本。\n2. 执行\`00_test_schema.sql\`。\n3. 执行\`01_test_source_cases.sql\`。\n4. 执行\`02_expected_runtime.sql\`。\n5. 执行\`03_validation.sql\`并确认所有\`should_be_zero\`结果为0。\n6. 如需清理，仅执行\`04_rollback.sql\`，不会删除原演示批次。\n\n## 关键文件\n\n- \`test_case_matrix.csv\`：规则、输入、组织和预期结果对照表。\n- \`01_test_source_cases.sql\`：组织、规则输入快照和图谱源数据。\n- \`02_expected_runtime.sql\`：运行结果、预警、证据和组织归属。\n- \`03_validation.sql\`：覆盖率、结果一致性和组织排行校验。\n- \`offline_validation.json\`：生成阶段的离线完整性检查。\n\n## 应用读取\n\n应用接口支持通过环境变量\`DEMO_BATCH_IDS\`读取多个批次。导入本包后可配置：\n\n\`DEMO_BATCH_IDS=DEMO-20260720-PKG-V1,RULE-TEST-20260722-V1\`\n\n未配置时，代码默认同时识别原演示批次和本测试批次。\n`

const files = {
  '00_test_schema.sql': schemaSql,
  '01_test_source_cases.sql': sourceSql,
  '02_expected_runtime.sql': runtimeSql,
  '03_validation.sql': validationSql,
  '04_rollback.sql': rollbackSql,
  'test_case_matrix.csv': matrixCsv,
  'README.md': readme,
}

const entityIds = new Set(entityRows.map((row) => `${row[0]}|${row[1]}`))
const offlineChecks = {
  allRuleVersionsExist: rules.every((item) => sourceRuleSql.includes(`'${item.ruleVersionId}'`)),
  uniqueRunIds: new Set(runRows.map((row) => row[0])).size === runRows.length,
  uniqueWarningCodes: new Set(warningRows.map((row) => row[0])).size === warningRows.length,
  uniqueEvidenceIds: new Set(evidenceRows.map((row) => row[0])).size === evidenceRows.length,
  relationEndpointsExist: relationRows.every((row) => entityIds.has(`${row[0]}|${row[3]}`) && entityIds.has(`${row[0]}|${row[4]}`)),
  eventObjectsExist: eventRows.every((row) => entityIds.has(`${row[0]}|${row[5]}`)),
  warningEvidenceCountsMatch: warningRows.every((row) => evidenceRows.filter((evidence) => evidence[1] === row[0]).length === row[11]),
  everyBaseRuleHasSixVariants: rules.every((item) => new Set(testCaseRows.filter((row) => row[2] === item.ruleCode && row[3] !== 'CROSS').map((row) => row[3])).size === 6),
  everyWarningHasOrganizationLink: warningRows.every((row) => organizationLinkRows.some((link) => link[0] === row[0])),
}
if (Object.values(offlineChecks).some((value) => !value)) throw new Error(`离线完整性检查失败：${JSON.stringify(offlineChecks)}`)

fs.mkdirSync(outputDir, { recursive: true })
for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(outputDir, name), content, 'utf8')
const sqlValidation = Object.fromEntries(Object.entries(files).filter(([name]) => name.endsWith('.sql')).map(([name, content]) => [name, {
  bytes: Buffer.byteLength(content),
  containsUndefined: content.includes('undefined'),
  containsNaN: content.includes('NaN'),
  statementTerminators: (content.match(/;/g) || []).length,
}]))
const manifest = { ...expected, offlineChecks, sqlValidation, files: Object.keys(files) }
fs.writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
fs.writeFileSync(path.join(outputDir, 'offline_validation.json'), `${JSON.stringify({ batchId, passed: true, checks: offlineChecks, counts: batchCounts }, null, 2)}\n`, 'utf8')

console.log(JSON.stringify({ outputDir, ...expected, offlineChecks }, null, 2))
