import type {
  AuditItem,
  DataSourceItem,
  GraphVersion,
  OntologyItem,
  RoleItem,
  SceneItem,
  TodoItem,
  UserItem,
  Warning,
  WorkMessage,
  RiskEvent,
} from './types'

export const initialWarnings: Warning[] = [
  { id: 'WA-20260717-001', title: '供应商与评审人员存在异常关联', stage: '事前', status: '待研判', level: '重大', scene: '供应商异常关联', sceneVersion: 'v2.3', target: '华北数字科技有限公司', targetEvent: '中标确认', organization: '电子云采购中心', owner: '尹晨阳', expectedAt: '2026-07-18 15:00:00', leadTime: '31小时42分', evidenceStatus: '完整', path: '供应商 → 共同手机号 → 评审人员', generatedAt: '2026-07-17 07:18:00', updatedAt: '今天 10:26' },
  { id: 'WA-20260717-002', title: '合同签订前缺少法务会签记录', stage: '事前', status: '待研判', level: '高', scene: '合同签订风险', sceneVersion: 'v1.8', target: '云资源扩容采购合同', targetEvent: '合同签订', organization: '电子云采购中心', owner: '李华', expectedAt: '2026-07-18 10:00:00', leadTime: '22小时08分', evidenceStatus: '部分缺失', path: '采购项目 → 合同 → 审批记录', generatedAt: '2026-07-17 11:52:00', updatedAt: '今天 11:58' },
  { id: 'WA-20260716-008', title: '付款账户与合同约定账户不一致', stage: '事中', status: '待研判', level: '高', scene: '付款执行风险', sceneVersion: 'v3.1', target: '云平台服务费付款单', targetEvent: '付款执行', organization: '集团财务共享中心', owner: '王宁', expectedAt: '2026-07-17 14:00:00', leadTime: '已越过2小时', evidenceStatus: '完整', path: '合同相对方 → 约定账户 ≠ 付款账户', generatedAt: '2026-07-16 16:20:00', updatedAt: '今天 12:06' },
  { id: 'WA-20260715-019', title: '采购金额超过预算批复额度', stage: '事后', status: '待研判', level: '中', scene: '付款执行风险', sceneVersion: 'v3.1', target: '网络安全设备采购项目', targetEvent: '采购执行', organization: '信息安全事业部', owner: '陈洁', expectedAt: '2026-07-15 18:00:00', leadTime: '事后发现', evidenceStatus: '完整', path: '预算批复 → 采购项目 → 合同金额', generatedAt: '2026-07-15 18:22:00', updatedAt: '昨天 18:20' },
  { id: 'WA-20260714-012', title: '供应商资质证书已过有效期', stage: '事前', status: '已解除', level: '中', scene: '供应商资格风险', sceneVersion: 'v1.2', target: '中科联创服务有限公司', targetEvent: '供应商入围', organization: '采购管理部', owner: '尹晨阳', expectedAt: '2026-07-16 09:00:00', leadTime: '48小时', evidenceStatus: '完整', path: '供应商 → 资质证书 → 有效期', generatedAt: '2026-07-14 09:02:00', updatedAt: '2026-07-16' },
  { id: 'WA-20260713-006', title: '同一控制主体参与多家投标', stage: '事后', status: '已升级', level: '重大', scene: '供应商异常关联', sceneVersion: 'v2.2', target: '核心系统运维服务项目', targetEvent: '开标完成', organization: '集团采购中心', owner: '周航', expectedAt: '2026-07-13 10:00:00', leadTime: '事后发现', evidenceStatus: '权限受限', path: '投标主体 → 实际控制人 → 投标主体', generatedAt: '2026-07-13 11:35:00', updatedAt: '2026-07-14' },
  { id: 'WA-20260711-018', title: '合同付款比例偏离管理制度', stage: '事中', status: '已升级', level: '高', scene: '合同签订风险', sceneVersion: 'v1.8', target: '云安全服务框架合同', targetEvent: '付款审批', organization: '云安全事业部', owner: '刘敏', expectedAt: '2026-07-17 12:00:00', leadTime: '已越过1小时', evidenceStatus: '完整', path: '合同条款 → 付款比例 → 管理制度', generatedAt: '2026-07-11 09:20:00', updatedAt: '今天 10:12' },
  { id: 'WA-20260709-022', title: '验收材料与付款申请不一致', stage: '事中', status: '已升级', level: '高', scene: '付款执行风险', sceneVersion: 'v3.1', target: '数据治理服务付款单', targetEvent: '付款执行', organization: '数据智能事业部', owner: '孙凯', expectedAt: '2026-07-19 18:00:00', leadTime: '36小时', evidenceStatus: '完整', path: '验收材料 → 付款申请 → 合同交付物', generatedAt: '2026-07-09 14:20:00', updatedAt: '昨天 18:20' },
  { id: 'WA-20260705-015', title: '供应商准入资质缺失', stage: '事前', status: '已升级', level: '中', scene: '供应商资格风险', sceneVersion: 'v1.2', target: '华东信息技术有限公司', targetEvent: '供应商准入', organization: '采购管理部', owner: '尹晨阳', expectedAt: '2026-07-12 18:00:00', leadTime: '48小时', evidenceStatus: '部分缺失', path: '供应商 → 准入资质 → 有效证明', generatedAt: '2026-07-05 10:10:00', updatedAt: '2026-07-12' },
]

export const initialRiskEvents: RiskEvent[] = [
  { id: 'RE-20260713-001', warningId: 'WA-20260713-006', title: '核心系统运维项目疑似围串标风险', level: '重大', scene: '供应商异常关联', target: '核心系统运维服务项目', organization: '集团采购中心', owner: '周航', status: '待整改', dueAt: '2026-07-20 18:00', overdue: false, updatedAt: '今天 09:40' },
  { id: 'RE-20260711-004', warningId: 'WA-20260711-018', title: '合同付款比例偏离管理制度', level: '高', scene: '合同签订风险', target: '云安全服务框架合同', organization: '云安全事业部', owner: '尹晨阳', rectificationOwner: '刘敏', status: '待复核', dueAt: '2026-07-17 12:00', overdue: true, updatedAt: '今天 10:12' },
  { id: 'RE-20260709-007', warningId: 'WA-20260709-022', title: '验收材料与付款申请不一致', level: '高', scene: '付款执行风险', target: '数据治理服务付款单', organization: '数据智能事业部', owner: '孙凯', status: '待整改', dueAt: '2026-07-19 18:00', overdue: false, updatedAt: '昨天 18:20' },
  { id: 'RE-20260705-003', warningId: 'WA-20260705-015', title: '供应商准入资质缺失', level: '中', scene: '供应商资格风险', target: '华东信息技术有限公司', organization: '采购管理部', owner: '尹晨阳', status: '已关闭', dueAt: '2026-07-12 18:00', overdue: false, updatedAt: '2026-07-12' },
]

export const todos: TodoItem[] = [
  { id: 'TODO-WA-001', title: '研判：供应商与评审人员存在异常关联', objectType: '预警', level: '重大', status: '待研判', dueAt: '今天 16:00', owner: '尹晨阳', timeState: '临期', route: '/risk/warnings/WA-20260717-001' },
  { id: 'TODO-WA-002', title: '研判：合同签订前缺少法务会签记录', objectType: '预警', level: '高', status: '待研判', dueAt: '今天 18:00', owner: '李华', timeState: '正常', route: '/risk/warnings/WA-20260717-002' },
  { id: 'TODO-WA-003', title: '研判：付款账户与合同约定账户不一致', objectType: '预警', level: '高', status: '待研判', dueAt: '今天 12:00', owner: '王宁', timeState: '已逾期', route: '/risk/warnings/WA-20260716-008' },
  { id: 'TODO-WA-004', title: '研判：采购金额超过预算批复额度', objectType: '预警', level: '中', status: '待研判', dueAt: '明天 18:00', owner: '陈洁', timeState: '正常', route: '/risk/warnings/WA-20260715-019' },
  { id: 'TODO-RE-001', title: '整改：核心系统运维项目疑似围串标风险', objectType: '事件', level: '重大', status: '待整改', dueAt: '07-20 18:00', owner: '周航', timeState: '正常', route: '/risk/events/RE-20260713-001' },
  { id: 'TODO-RE-002', title: '复核：合同付款比例偏离管理制度', objectType: '事件', level: '高', status: '待复核', dueAt: '今天 12:00', owner: '尹晨阳', timeState: '已逾期', route: '/risk/events/RE-20260711-004' },
]

export const initialMessages: WorkMessage[] = [
  { id: 'MSG-001', type: '预警', title: '发现1条重大预警，请及时研判', source: 'WA-20260717-001', time: '8分钟前', unread: true, route: '/risk/warnings/WA-20260717-001' },
  { id: 'MSG-002', type: '转派', title: '合同签订风险预警已转派给李华', source: 'WA-20260717-002', time: '32分钟前', unread: true, route: '/risk/warnings/WA-20260717-002' },
  { id: 'MSG-003', type: '逾期', title: '付款账户风险研判任务已逾期', source: 'WA-20260716-008', time: '1小时前', unread: true, route: '/risk/warnings/WA-20260716-008' },
  { id: 'MSG-004', type: '整改', title: '核心系统运维项目等待提交整改材料', source: 'RE-20260713-001', time: '昨天 18:20', unread: false, route: '/risk/events/RE-20260713-001' },
]

export const scenes: SceneItem[] = [
  { id: 'SCENE-001', name: '供应商异常关联', domain: '采购', object: '供应商', event: '入围/中标确认', level: '重大', rules: 6, version: 'v2.3', status: '已发布', updatedBy: '陈洁', updatedAt: '今天 09:30' },
  { id: 'SCENE-002', name: '合同签订风险', domain: '合同', object: '合同', event: '合同签订', level: '高', rules: 8, version: 'v1.8', status: '已发布', updatedBy: '李华', updatedAt: '昨天 16:20' },
  { id: 'SCENE-003', name: '付款执行风险', domain: '财务', object: '付款单', event: '付款执行', level: '高', rules: 10, version: 'v3.1', status: '已发布', updatedBy: '王宁', updatedAt: '07-16 14:06' },
  { id: 'SCENE-004', name: '过度负债与担保链风险', domain: '财务', object: '融资主体', event: '融资生效', level: '重大', rules: 4, version: 'v0.9', status: '待试跑', updatedBy: '周航', updatedAt: '07-15 17:40' },
  { id: 'SCENE-005', name: '投资决策合规风险', domain: '投资', object: '投资项目', event: '决策审批', level: '高', rules: 3, version: 'v0.4', status: '草稿', updatedBy: '孙凯', updatedAt: '07-14 11:22' },
]

export const ontologies: OntologyItem[] = [
  { id: 'ONT-BASE', name: '平台基础图谱结构', scope: '基础图谱结构', domain: '通用', version: 'v1.6', classes: 14, properties: 126, relations: 28, events: 32, status: '已发布', updatedAt: '今天 08:30' },
  { id: 'ONT-PROC', name: '采购监管扩展图谱结构', scope: '领域图谱结构', domain: '采购', version: 'v2.2', classes: 12, properties: 94, relations: 21, events: 18, status: '已发布', updatedAt: '昨天 16:10' },
  { id: 'ONT-CONTRACT', name: '合同监管扩展图谱结构', scope: '领域图谱结构', domain: '合同', version: 'v1.4', classes: 8, properties: 67, relations: 16, events: 14, status: '已发布', updatedAt: '07-16 10:20' },
  { id: 'ONT-FIN', name: '财务资金扩展图谱结构', scope: '领域图谱结构', domain: '财务', version: 'v1.1', classes: 10, properties: 88, relations: 19, events: 21, status: '待校验', updatedAt: '07-15 18:05' },
]

export const dataSources: DataSourceItem[] = [
  { id: 'SRC-ERP', name: '集团ERP采购视图', mode: '数据库视图', range: '采购项目、订单、供应商', owner: '张海', syncMode: '增量', lastSuccess: '今天 11:52', status: '启用' },
  { id: 'SRC-OA', name: 'OA审批事件接口', mode: 'API', range: '审批实例、节点、意见', owner: '刘敏', syncMode: '事件', lastSuccess: '今天 12:06', status: '启用' },
  { id: 'SRC-TREASURY', name: '司库付款消息', mode: '消息', range: '付款申请、账户、流水', owner: '王宁', syncMode: '事件', lastSuccess: '今天 12:08', status: '启用' },
  { id: 'SRC-EXTERNAL', name: '工商司法外部数据', mode: 'API', range: '主体、股东、司法风险', owner: '陈洁', syncMode: '增量', lastSuccess: '昨天 23:00', status: '异常' },
]

export const graphVersions: GraphVersion[] = [
  { id: 'GRAPH-20260717.2', graphCode: 'PROCUREMENT-RISK', graphName: '采购监管图谱', ontologyId: 'ONT-PROC', ontologyVersion: 'BASE v1.6 / PROC v2.2', mappingVersion: 'MAP v3.4', range: '2026-01-01 至 2026-07-17', sourceIds: ['SRC-ERP', 'SRC-OA'], sourceNames: ['集团ERP采购视图', 'OA审批事件接口'], entities: 128542, relations: 309861, events: 48210, blockers: 0, warnings: 8, status: '已发布', publishedAt: '今天 08:45' },
  { id: 'GRAPH-20260717.3', graphCode: 'PROCUREMENT-RISK', graphName: '采购监管图谱', ontologyId: 'ONT-PROC', ontologyVersion: 'BASE v1.6 / PROC v2.2', mappingVersion: 'MAP v3.5', range: '2026-01-01 至 2026-07-17', sourceIds: ['SRC-ERP', 'SRC-OA'], sourceNames: ['集团ERP采购视图', 'OA审批事件接口'], entities: 129104, relations: 311202, events: 48637, blockers: 0, warnings: 3, status: '待发布', publishedAt: '—' },
  { id: 'GRAPH-20260716.4', graphCode: 'FINANCE-RISK', graphName: '财务监管图谱', ontologyId: 'ONT-FIN', ontologyVersion: 'BASE v1.6 / FIN v1.0', mappingVersion: 'MAP v2.8', range: '2025-01-01 至 2026-07-16', sourceIds: ['SRC-TREASURY'], sourceNames: ['司库付款消息'], entities: 98412, relations: 206871, events: 39605, blockers: 2, warnings: 12, status: '失败', publishedAt: '—' },
]

export const users: UserItem[] = [
  { id: 'U001', name: '尹晨阳', account: 'yinchenyang', organization: '集团监管部', position: '监管负责人', roles: ['监管负责人'], status: '启用', todos: 5, lastLogin: '今天 08:52' },
  { id: 'U002', name: '李华', account: 'lihua', organization: '采购管理部', position: '采购专员', roles: ['领域监管专员', '业务责任人'], status: '启用', todos: 3, lastLogin: '今天 09:10' },
  { id: 'U003', name: '王宁', account: 'wangning', organization: '财务共享中心', position: '资金主管', roles: ['业务责任人'], status: '启用', todos: 2, lastLogin: '今天 08:36' },
  { id: 'U004', name: '陈洁', account: 'chenjie', organization: '数据管理部', position: '数据治理专家', roles: ['图谱结构员', '数据管理员'], status: '启用', todos: 1, lastLogin: '昨天 17:20' },
  { id: 'U005', name: '周航', account: 'zhouhang', organization: '审计纪检部', position: '审计经理', roles: ['审计纪检人员'], status: '锁定', todos: 4, lastLogin: '07-16 14:22' },
]

export const roles: RoleItem[] = [
  { id: 'ROLE-01', name: '监管负责人', type: '预置', users: 8, scope: '授权组织及下级', status: '启用', permissions: ['监管态势', '风险事件复核', '重大解除', '风险关闭'], updatedAt: '今天 08:20' },
  { id: 'ROLE-02', name: '领域监管专员', type: '预置', users: 21, scope: '授权组织、领域和场景', status: '启用', permissions: ['查看预警', '转派任务', '风险升级'], updatedAt: '昨天 17:20' },
  { id: 'ROLE-03', name: '业务责任人', type: '预置', users: 86, scope: '本人任务必要数据', status: '启用', permissions: ['查看本人任务', '整改提交', '证据摘要'], updatedAt: '昨天 15:40' },
  { id: 'ROLE-04', name: '规则管理员', type: '自定义', users: 5, scope: '授权规则资产', status: '启用', permissions: ['场景编辑', '规则试跑', '规则发布'], updatedAt: '07-16 10:10' },
  { id: 'ROLE-05', name: '试点观察员', type: '自定义', users: 3, scope: '试点组织只读', status: '草稿', permissions: ['监管态势只读'], updatedAt: '07-15 09:30' },
]

export const audits: AuditItem[] = [
  { id: 'AUD-001', time: '2026-07-17 12:06:32', operator: '尹晨阳', organization: '集团监管部', action: '升级风险事件', objectType: '预警', objectId: 'WA-20260713-006', summary: '确认存在同一控制主体参与多家投标风险', result: '成功', risk: '高危', traceId: 'trace-7f21a9c1' },
  { id: 'AUD-002', time: '2026-07-17 11:58:10', operator: '刘敏', organization: '云安全事业部', action: '提交整改', objectType: '风险事件', objectId: 'RE-20260711-004', summary: '补充法务会签说明与整改证明材料', result: '成功', risk: '普通', traceId: 'trace-a52c11d8' },
  { id: 'AUD-003', time: '2026-07-17 10:42:08', operator: '陈洁', organization: '数据管理部', action: '发布知识图谱', objectType: '知识图谱', objectId: 'GRAPH-20260717.2', summary: '发布采购监管生产知识图谱', result: '成功', risk: '高危', traceId: 'trace-c81f06ea' },
  { id: 'AUD-004', time: '2026-07-17 09:20:41', operator: '安全管理员', organization: '信息化部', action: '调整字段权限', objectType: '角色', objectId: 'ROLE-02', summary: '账户号权限由明文调整为脱敏', result: '成功', risk: '高危', traceId: 'trace-b610a14d' },
  { id: 'AUD-005', time: '2026-07-17 08:52:16', operator: '周航', organization: '审计纪检部', action: '查看敏感证据', objectType: '证据', objectId: 'EVI-00918', summary: '查看供应商共同联系方式来源记录', result: '成功', risk: '敏感访问', traceId: 'trace-2c19eb06' },
]

export const graphNodes = [
  { id: 'supplier', label: '华北数字科技', type: 'target', x: 360, y: 186 },
  { id: 'project', label: '云资源扩容项目', type: 'event', x: 110, y: 88 },
  { id: 'phone', label: '手机号 138****8201', type: 'hit', x: 610, y: 92 },
  { id: 'reviewer', label: '评审人员 王**', type: 'hit', x: 805, y: 208 },
  { id: 'bid', label: '中标确认事件', type: 'event', x: 345, y: 340 },
  { id: 'file', label: '工商查询记录', type: 'evidence', x: 670, y: 352 },
]

export const graphEdges = [
  { from: 'project', to: 'supplier', label: '参与投标', hit: false },
  { from: 'supplier', to: 'phone', label: '登记手机号', hit: true },
  { from: 'phone', to: 'reviewer', label: '共同使用', hit: true },
  { from: 'project', to: 'bid', label: '产生事件', hit: false },
  { from: 'supplier', to: 'file', label: '来源于', hit: false },
]

