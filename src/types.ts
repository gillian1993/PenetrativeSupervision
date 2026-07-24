export type RiskLevel = '重大' | '高' | '中' | '低'
export type WarningStage = '事前' | '事中' | '事后'
export type WarningStatus = '待研判' | '已解除' | '已升级'
export type EvidenceStatus = '完整' | '部分缺失' | '权限受限' | '快照异常'

export interface Warning {
  id: string
  title: string
  stage: WarningStage
  status: WarningStatus
  level: RiskLevel
  scene: string
  sceneVersion: string
  target: string
  targetEvent: string
  organization: string
  owner: string
  expectedAt: string
  leadTime: string
  evidenceStatus: EvidenceStatus
  path: string
  generatedAt: string
  updatedAt: string
  riskEventStatus?: '待整改' | '待复核' | '已关闭'
  riskEventDueAt?: string
  riskEventOwner?: string
  riskEventRectificationOwner?: string
}

export type RiskEventStatus = '待整改' | '待复核' | '已关闭'

export interface RiskEvent {
  id: string
  warningId: string
  title: string
  level: RiskLevel
  scene: string
  target: string
  organization: string
  owner: string
  rectificationOwner?: string
  status: RiskEventStatus
  dueAt: string
  overdue: boolean
  updatedAt: string
}

export type TodoObjectType = '预警' | '事件'
export type TodoStatus = Exclude<WarningStatus, '已解除' | '已升级'> | Exclude<RiskEventStatus, '已关闭'>

export interface TodoItem {
  id: string
  title: string
  objectType: TodoObjectType
  level: RiskLevel
  status: TodoStatus
  dueAt: string
  owner: string
  timeState: '正常' | '临期' | '已逾期'
  route: string
}

export interface WorkMessage {
  id: string
  type: string
  title: string
  source: string
  time: string
  unread: boolean
  route: string
}

export interface SceneItem {
  id: string
  name: string
  domain: string
  object: string
  event: string
  level: RiskLevel
  rules: number
  version: string
  status: '草稿' | '待试跑' | '待发布' | '已发布' | '已停用'
  updatedBy: string
  updatedAt: string
}

export interface OntologyItem {
  id: string
  name: string
  scope: string
  domain: string
  version: string
  classes: number
  properties: number
  relations: number
  events: number
  status: '草稿' | '待校验' | '已发布' | '已废止'
  updatedAt: string
}

export interface DataSourceItem {
  id: string
  name: string
  mode: string
  range: string
  owner: string
  ontologyIds: string[]
  ontologyNames?: string[]
  lastSuccess: string
  status: '草稿' | '启用' | '停用' | '异常'
}

export interface GraphVersion {
  id: string
  graphCode: string
  graphName: string
  ontologyId: string
  ontologyVersion: string
  mappingVersion: string
  range: string
  sourceIds: string[]
  sourceNames: string[]
  entities: number
  relations: number
  events: number
  blockers: number
  warnings: number
  status: '校验中' | '待发布' | '已发布' | '失败' | '已归档'
  publishedAt: string
}

export interface UserItem {
  id: string
  name: string
  account: string
  organization: string
  position: string
  roles: string[]
  status: '启用' | '锁定' | '停用'
  todos: number
  lastLogin: string
}

export interface RoleItem {
  id: string
  name: string
  type: '预置' | '自定义'
  users: number
  scope: string
  status: '草稿' | '启用' | '停用'
  permissions: string[]
  updatedAt: string
}

export interface AuditItem {
  id: string
  time: string
  operator: string
  organization: string
  action: string
  objectType: string
  objectId: string
  summary: string
  result: '成功' | '失败' | '部分成功'
  risk: '普通' | '高危' | '敏感访问'
  traceId: string
}
