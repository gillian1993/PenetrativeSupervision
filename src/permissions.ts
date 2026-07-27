export type PermissionCode = string

export interface PermissionCatalogItem {
  code: PermissionCode
  label: string
  group: '统一入口' | '采购应用' | '穿透式监管' | '系统管理' | '高危操作'
}

export const MENU_PERMISSION_CATALOG: PermissionCatalogItem[] = [
  { code: 'menu.unified.home', label: '统一入口 / 首页', group: '统一入口' },
  { code: 'menu.unified.super_agent', label: '统一入口 / 超级智能体', group: '统一入口' },
  { code: 'menu.procurement.overview', label: '采购应用 / 采购应用总览', group: '采购应用' },
  { code: 'menu.procurement.tender', label: '采购应用 / 招投标', group: '采购应用' },
  { code: 'menu.procurement.contract', label: '采购应用 / 合同', group: '采购应用' },
  { code: 'menu.procurement.review', label: '采购应用 / 审查', group: '采购应用' },
  { code: 'menu.procurement.purchase', label: '采购应用 / 采购', group: '采购应用' },
  { code: 'menu.supervision.workbench', label: '穿透式监管 / 监管工作台', group: '穿透式监管' },
  { code: 'menu.supervision.situation', label: '穿透式监管 / 监管态势', group: '穿透式监管' },
  { code: 'menu.supervision.risk.warnings', label: '穿透式监管 / 风险监管 / 统一预警', group: '穿透式监管' },
  { code: 'menu.supervision.risk.events', label: '穿透式监管 / 风险监管 / 风险事件', group: '穿透式监管' },
  { code: 'menu.supervision.scene.scenes', label: '穿透式监管 / 场景与规则 / 风险场景', group: '穿透式监管' },
  { code: 'menu.supervision.scene.rules', label: '穿透式监管 / 场景与规则 / 规则管理', group: '穿透式监管' },
  { code: 'menu.supervision.scene.skills', label: '穿透式监管 / 场景与规则 / Skill管理', group: '穿透式监管' },
  { code: 'menu.supervision.ontology.structures', label: '穿透式监管 / 知识图谱 / 图谱结构', group: '穿透式监管' },
  { code: 'menu.supervision.ontology.sources', label: '穿透式监管 / 知识图谱 / 数据源', group: '穿透式监管' },
  { code: 'menu.system.users', label: '系统管理 / 用户与组织', group: '系统管理' },
  { code: 'menu.system.roles', label: '系统管理 / 角色与权限', group: '系统管理' },
  { code: 'menu.system.audit', label: '系统管理 / 审计日志', group: '系统管理' },
]

export const ACTION_PERMISSION_CATALOG: PermissionCatalogItem[] = [
  { code: 'action.task.transfer', label: '转派任务', group: '高危操作' },
  { code: 'action.supervision.review', label: '监管复核', group: '高危操作' },
  { code: 'action.warning.release_major', label: '解除重大预警', group: '高危操作' },
  { code: 'action.warning.escalate', label: '升级风险事件', group: '高危操作' },
  { code: 'action.event.close', label: '复核关闭风险事件', group: '高危操作' },
  { code: 'action.scene.publish', label: '发布场景规则', group: '高危操作' },
  { code: 'action.graph.structure.publish', label: '发布图谱结构', group: '高危操作' },
  { code: 'action.graph.publish', label: '发布知识图谱', group: '高危操作' },
  { code: 'action.graph.entity_govern', label: '实例合并与拆分', group: '高危操作' },
  { code: 'action.role.adjust', label: '调整角色权限', group: '高危操作' },
]

export const ALL_PERMISSION_CATALOG = [...MENU_PERMISSION_CATALOG, ...ACTION_PERMISSION_CATALOG]
export const ALL_MENU_PERMISSION_CODES = MENU_PERMISSION_CATALOG.map((item) => item.code)
export const ALL_ACTION_PERMISSION_CODES = ACTION_PERMISSION_CATALOG.map((item) => item.code)
export const ALL_PERMISSION_CODES = ALL_PERMISSION_CATALOG.map((item) => item.code)
export const PERMISSION_LABEL_BY_CODE = Object.fromEntries(ALL_PERMISSION_CATALOG.map((item) => [item.code, item.label]))

const legacyPermissionMap: Record<string, PermissionCode[]> = {
  监管态势: ['menu.supervision.situation'],
  监管态势只读: ['menu.supervision.situation'],
  查看工作台: ['menu.supervision.workbench'],
  查看统一预警: ['menu.supervision.risk.warnings'],
  查看风险事件: ['menu.supervision.risk.events'],
  查看本人任务: ['menu.supervision.workbench', 'menu.supervision.risk.warnings', 'menu.supervision.risk.events'],
  查看审计日志: ['menu.system.audit'],
  场景编辑: ['menu.supervision.scene.scenes', 'menu.supervision.scene.rules'],
  规则试跑: ['menu.supervision.scene.scenes', 'menu.supervision.scene.rules'],
  规则发布: ['menu.supervision.scene.scenes', 'menu.supervision.scene.rules', 'action.scene.publish'],
  图谱结构: ['menu.supervision.ontology.structures'],
  数据管理员: ['menu.supervision.ontology.sources'],
  管理用户: ['menu.system.users'],
  调整角色权限: ['menu.system.roles', 'action.role.adjust'],
  转派任务: ['action.task.transfer'],
  监管复核: ['action.supervision.review'],
  重大解除: ['action.warning.release_major'],
  风险升级: ['action.warning.escalate'],
  风险事件复核: ['action.event.close'],
  风险关闭: ['action.event.close'],
  整改提交: ['menu.supervision.risk.events'],
  证据摘要: ['menu.supervision.risk.warnings', 'menu.supervision.risk.events'],
  发布场景规则: ['action.scene.publish'],
  发布图谱结构: ['action.graph.structure.publish'],
  发布知识图谱: ['action.graph.publish'],
  实例合并与拆分: ['action.graph.entity_govern'],
  解除重大预警: ['action.warning.release_major'],
  升级风险事件: ['action.warning.escalate'],
  复核关闭风险事件: ['action.event.close'],
  编辑场景规则: ['menu.supervision.scene.scenes', 'menu.supervision.scene.rules'],
}

export function normalizePermissionCodes(permissions: string[] = []) {
  const resolved = new Set<PermissionCode>()
  permissions.forEach((permission) => {
    if (ALL_PERMISSION_CODES.includes(permission)) resolved.add(permission)
    legacyPermissionMap[permission]?.forEach((code) => resolved.add(code))
  })
  return [...resolved]
}

const unifiedMenus = ['menu.unified.home', 'menu.unified.super_agent']
const procurementMenus = [
  'menu.procurement.overview',
  'menu.procurement.tender',
  'menu.procurement.contract',
  'menu.procurement.review',
  'menu.procurement.purchase',
]
const supervisionMenus = ALL_MENU_PERMISSION_CODES.filter((code) => code.startsWith('menu.supervision.'))
const systemMenus = ALL_MENU_PERMISSION_CODES.filter((code) => code.startsWith('menu.system.'))

export const ROLE_PERMISSION_PRESETS: Record<string, PermissionCode[]> = {
  监管负责人: [...ALL_MENU_PERMISSION_CODES, ...ALL_ACTION_PERMISSION_CODES],
  领域监管专员: [
    ...supervisionMenus,
    'action.task.transfer',
    'action.supervision.review',
    'action.warning.escalate',
    'action.event.close',
  ],
  业务责任人: [
    'menu.supervision.workbench',
    'menu.supervision.risk.warnings',
    'menu.supervision.risk.events',
    'action.task.transfer',
  ],
  规则管理员: [
    'menu.supervision.workbench',
    'menu.supervision.scene.scenes',
    'menu.supervision.scene.rules',
    'menu.supervision.scene.skills',
    'action.scene.publish',
  ],
  试点观察员: ['menu.supervision.situation'],
  图谱结构员: [
    'menu.supervision.workbench',
    'menu.supervision.ontology.structures',
    'menu.system.audit',
    'action.graph.structure.publish',
  ],
  数据管理员: [
    'menu.supervision.workbench',
    'menu.supervision.ontology.sources',
    'menu.system.audit',
    'action.graph.publish',
    'action.graph.entity_govern',
  ],
  采购应用管理员: [...unifiedMenus, ...procurementMenus, 'menu.system.audit'],
}

export function resolveRolePermissionCodes(_roleName: string, storedPermissions: string[] = []) {
  return new Set(normalizePermissionCodes(storedPermissions))
}

