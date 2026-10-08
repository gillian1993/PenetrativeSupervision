import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AuditPage, DataSourceCreatePage, DataSourceDetailPage, GraphManagementPage, GraphResultDetailPage, ModelManagementPage, RolesPage, UsersPage } from './pages/ManagementStatePages'
import { ProcurementHomePage, ProcurementModulePage, ProcurementOverviewPage } from './pages/ProcurementApplicationPages'
import { SuperAgentPage } from './pages/SuperAgentPage'
import { GraphCreatePage } from './pages/GraphCreateWizard'
import { RuleAssetCreatePage, RuleAssetEditorPage, RuleAssetManagementPage } from './pages/RuleAssetPages'
import { OntologyCreatePage, OntologyEditorPage } from './pages/OntologyLocalPages'
import { SituationPage, WorkbenchPage } from './pages/OverviewPages'
import { RiskEventDetailPage, RiskEventListPage, WarningDetailPage, WarningListPage } from './pages/RiskPages'
import { demoDataApi } from './demoDataApi'
import { useAppStore } from './store'
import { useOntologyStore } from './ontologyMysqlStore'
import { Button, EmptyState, Icon, Modal, type IconName } from './ui'
import cloudLogo from './assets/logo-cloud.svg'
import { resolveRolePermissionCodes, type PermissionCode } from './permissions'
import { createReturnState, locationPath } from './navigation'

interface NavChild { label: string; path: string; permission: PermissionCode }
interface NavItem { id: string; label: string; icon: IconName; permission?: PermissionCode; path?: string; children?: NavChild[] }
interface NavSection { id: string; title: string; items: NavItem[] }
interface RailNavItem { id: string; label: string; icon: IconName; path?: string; permission?: PermissionCode; sectionId?: string }

const platformTabs = ['情报舆情分析应用', '全模态数据智能平台', '应用开发平台', '模型开发平台', '多模态视觉平台', '本体构建与运营平台', '基础管控平台', '战场情报快判AI系统', '国军标智能编审应用', '采购管理应用', '业务系统公共模块'] as const
const currentPlatformTab = '采购管理应用'

const navSections: NavSection[] = [
  {
    id: 'unified',
    title: '统一入口',
    items: [
      { id: 'home', label: '首页', icon: 'home', path: '/home', permission: 'menu.unified.home' },
      { id: 'superAgent', label: '超级智能体', icon: 'agent', path: '/super-agent', permission: 'menu.unified.super_agent' },
    ],
  },
  {
    id: 'procurement',
    title: '采购',
    items: [
      { id: 'procurementOverview', label: '采购总览', icon: 'home', path: '/procurement', permission: 'menu.procurement.overview' },
      { id: 'purchasePlan', label: '采购方案撰写', icon: 'edit', path: '/procurement/purchase/plan', permission: 'menu.procurement.purchase' },
      { id: 'purchaseBudget', label: '智能预算', icon: 'workbench', path: '/procurement/purchase/budget', permission: 'menu.procurement.purchase' },
      { id: 'purchaseOrder', label: '采购单撰写', icon: 'file', path: '/procurement/purchase/order', permission: 'menu.procurement.purchase' },
    ],
  },
  {
    id: 'tender',
    title: '招投标',
    items: [
      { id: 'bidWriting', label: '招投标书撰写', icon: 'edit', path: '/procurement/tender/bid-writing', permission: 'menu.procurement.tender' },
      { id: 'qualification', label: '供应商资格审查', icon: 'user', path: '/procurement/tender/qualification', permission: 'menu.procurement.tender' },
      { id: 'collusion', label: '围串标识别', icon: 'graph', path: '/procurement/tender/collusion', permission: 'menu.procurement.tender' },
      { id: 'evaluation', label: '智能评标', icon: 'check', path: '/procurement/tender/evaluation', permission: 'menu.procurement.tender' },
    ],
  },
  {
    id: 'contract',
    title: '合同',
    items: [
      { id: 'contractWriting', label: '合同撰写', icon: 'edit', path: '/procurement/contract/writing', permission: 'menu.procurement.contract' },
      { id: 'contractExtraction', label: '合同抽取', icon: 'file', path: '/procurement/contract/extraction', permission: 'menu.procurement.contract' },
      { id: 'contractArchive', label: '合同归档', icon: 'audit', path: '/procurement/contract/archive', permission: 'menu.procurement.contract' },
      { id: 'contractCompare', label: '合同对比', icon: 'copy', path: '/procurement/contract/compare', permission: 'menu.procurement.contract' },
      { id: 'contractReview', label: '智能审查', icon: 'check', path: '/procurement/contract/review', permission: 'menu.procurement.contract' },
    ],
  },
  {
    id: 'review',
    title: '审查',
    items: [
      { id: 'documentReview', label: '文档审查', icon: 'file', path: '/procurement/review/document', permission: 'menu.procurement.review' },
      { id: 'receiptReview', label: '单据审查', icon: 'audit', path: '/procurement/review/receipt', permission: 'menu.procurement.review' },
    ],
  },
  {
    id: 'supervision',
    title: '穿透式监管',
    items: [
      { id: 'workbench', label: '监管工作台', icon: 'workbench', path: '/workbench', permission: 'menu.supervision.workbench' },
      { id: 'situation', label: '监管态势', icon: 'situation', path: '/situation', permission: 'menu.supervision.situation' },
      { id: 'risk', label: '风险监管', icon: 'shield', children: [
        { label: '统一预警', path: '/risk/warnings', permission: 'menu.supervision.risk.warnings' },
        { label: '风险事件', path: '/risk/events', permission: 'menu.supervision.risk.events' },
      ] },
    ],
  },
  {
    id: 'knowledgeGraph',
    title: '知识图谱',
    items: [
      { id: 'graphModels', label: '图谱模型', icon: 'graph', path: '/graphs/structures', permission: 'menu.supervision.ontology.structures' },
      { id: 'graphSources', label: '数据源', icon: 'link', path: '/graphs/sources', permission: 'menu.supervision.ontology.sources' },
      { id: 'graphResults', label: '知识图谱', icon: 'graph', path: '/graphs/results', permission: 'menu.supervision.ontology.graphs' },
    ],
  },
  {
    id: 'system',
    title: '系统管理',
    items: [
      { id: 'systemUsers', label: '用户与组织', icon: 'user', path: '/system/users', permission: 'menu.system.users' },
      { id: 'systemRoles', label: '角色与权限', icon: 'lock', path: '/system/roles', permission: 'menu.system.roles' },
      { id: 'systemAudit', label: '审计日志', icon: 'audit', path: '/system/audit', permission: 'menu.system.audit' },
    ],
  },
]

const railNavItems: RailNavItem[] = [
  { id: 'home', label: '首页', icon: 'home', path: '/home', permission: 'menu.unified.home' },
  { id: 'superAgent', label: '智能体', icon: 'agent', path: '/super-agent', permission: 'menu.unified.super_agent' },
  { id: 'procurement', label: '采购', icon: 'workbench', sectionId: 'procurement' },
  { id: 'tender', label: '招投标', icon: 'rules', sectionId: 'tender' },
  { id: 'contract', label: '合同', icon: 'file', sectionId: 'contract' },
  { id: 'review', label: '审查', icon: 'check', sectionId: 'review' },
  { id: 'supervision', label: '监管', icon: 'situation', sectionId: 'supervision' },
  { id: 'modelManagement', label: '模型管理', icon: 'agent', path: '/system/models', permission: 'menu.system.models' },
  { id: 'ruleManagement', label: '规则管理', icon: 'rules', path: '/rules', permission: 'menu.supervision.scene.rules' },
  { id: 'knowledgeGraph', label: '知识图谱', icon: 'graph', sectionId: 'knowledgeGraph' },
  { id: 'system', label: '系统', icon: 'system', sectionId: 'system' },
]

const filterNavSections = (permissions: Set<string>): NavSection[] => navSections.map((section) => {
  const items: NavItem[] = []
  section.items.forEach((item) => {
    const children = item.children?.filter((child) => permissions.has(child.permission))
    const itemAllowed = item.permission ? permissions.has(item.permission) : false
    if (children?.length) items.push({ ...item, children })
    else if (itemAllowed) items.push({ ...item, children: undefined })
  })
  return { ...section, items }
}).filter((section) => section.items.length > 0)

const firstPathForItem = (item: NavItem) => item.path || item.children?.[0]?.path || '/no-access'
const firstPathForSection = (section: NavSection) => section.items[0] ? firstPathForItem(section.items[0]) : '/no-access'
const getFirstAccessiblePath = (permissions: Set<string>) => {
  const sections = filterNavSections(permissions)
  for (const item of railNavItems) {
    if (item.permission && item.path && permissions.has(item.permission)) return item.path
    const section = sections.find((candidate) => candidate.id === item.sectionId)
    if (section) return firstPathForSection(section)
  }
  return '/no-access'
}

const permissionsForPath = (path: string): PermissionCode[] => {
  if (path === '/' || path === '/no-access') return []
  if (path === '/home') return ['menu.unified.home']
  if (path.startsWith('/super-agent')) return ['menu.unified.super_agent']
  if (path === '/procurement') return ['menu.procurement.overview']
  if (path.startsWith('/procurement/tender')) return ['menu.procurement.tender']
  if (path.startsWith('/procurement/contract')) return ['menu.procurement.contract']
  if (path.startsWith('/procurement/review')) return ['menu.procurement.review']
  if (path.startsWith('/procurement/purchase')) return ['menu.procurement.purchase']
  if (path === '/workbench') return ['menu.supervision.workbench']
  if (path === '/situation') return ['menu.supervision.situation']
  if (path.startsWith('/risk/warnings')) return ['menu.supervision.risk.warnings']
  if (path.startsWith('/risk/events')) return ['menu.supervision.risk.events']
  if (path.startsWith('/scenes')) return ['menu.supervision.scene.rules']
  if (path.startsWith('/rules')) return ['menu.supervision.scene.rules']

  if (path.startsWith('/graphs/results') || path === '/graphs/new' || /^\/graphs\/[^/]+\/edit$/.test(path)) return ['menu.supervision.ontology.graphs']
  if (path.startsWith('/graphs/sources') || path.startsWith('/data-access')) return ['menu.supervision.ontology.sources']
  if (path === '/graphs') return ['menu.supervision.ontology.structures', 'menu.supervision.ontology.sources', 'menu.supervision.ontology.graphs']
  if (path.startsWith('/graphs') || path.startsWith('/ontology')) return ['menu.supervision.ontology.structures']
  if (path.startsWith('/system/users')) return ['menu.system.users']
  if (path.startsWith('/system/roles')) return ['menu.system.roles']
  if (path.startsWith('/system/models') || path.startsWith('/system/vertical-models')) return ['menu.system.models']
  if (path.startsWith('/system/audit')) return ['menu.system.audit']
  return []
}

const pathAllowedByPermissions = (path: string, permissions: Set<string>) => {
  if (path.startsWith('/super-agent')) return true
  const required = permissionsForPath(path)
  return required.length === 0 || required.some((permission) => permissions.has(permission))
}
const scopeOptions = ['中国电子云集团', '集团监管部', '集团采购中心', '财务共享中心', '试点事业部']
const agentSuggestions = ['当前页面是做什么的？', '我下一步应该怎么操作？', '帮我解释当前数据']

type AgentMessage = { role: 'assistant' | 'user'; text: string }
type AgentPageContext = { page: string; guide: string; next: string; data: string }
type AgentFloatingPosition = { left: number; top: number }
type AgentDragTarget = 'fab' | 'dialog'
type AgentDragState = { target: AgentDragTarget; pointerId: number; offsetX: number; offsetY: number; width: number; height: number; startX: number; startY: number }

function AppEnhanced() {
  const navigate = useNavigate()
  const location = useLocation()
  const graphWorkspace = location.pathname === '/graphs/new' || /^\/graphs\/[^/]+\/edit$/.test(location.pathname)
  const superAgentPage = location.pathname.startsWith('/super-agent')
  const messages = useAppStore((state) => state.messages)
  const todos = useAppStore((state) => state.todos)
  const warnings = useAppStore((state) => state.warnings)
  const riskEvents = useAppStore((state) => state.riskEvents)
  const users = useAppStore((state) => state.users)
  const roles = useAppStore((state) => state.roles)
  const currentScope = useAppStore((state) => state.currentScope)
  const currentRole = useAppStore((state) => state.currentRole)
  const toast = useAppStore((state) => state.toast)
  const setToast = useAppStore((state) => state.setToast)
  const loadWarningsFromDatabase = useAppStore((state) => state.loadWarningsFromDatabase)
  const setScope = useAppStore((state) => state.setScope)
  const setCurrentRole = useAppStore((state) => state.setCurrentRole)
  const resetWorkflow = useAppStore((state) => state.resetWorkflow)
  const loadOntologies = useOntologyStore((state) => state.loadOntologies)
  const [collapsed, setCollapsed] = useState(false)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [scopeOpen, setScopeOpen] = useState(false)
  const [roleOpen, setRoleOpen] = useState(false)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ risk: true })
  const [agentOpen, setAgentOpen] = useState(false)
  const [agentInput, setAgentInput] = useState('')
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([])
  const [agentFabPosition, setAgentFabPosition] = useState<AgentFloatingPosition | null>(null)
  const [agentDialogPosition, setAgentDialogPosition] = useState<AgentFloatingPosition | null>(null)
  const [resetWorkflowOpen, setResetWorkflowOpen] = useState(false)
  const [resettingWorkflow, setResettingWorkflow] = useState(false)
  const agentDragRef = useRef<AgentDragState | null>(null)
  const agentClickSuppressedRef = useRef(false)

  useEffect(() => {
    void loadOntologies().then((result) => { if (!result.ok) setToast(`MySQL图谱结构数据加载失败：${result.message}`) })
  }, [loadOntologies, setToast])
  useEffect(() => {
    void loadWarningsFromDatabase().then((result) => { if (!result.ok) setToast(`MySQL演示预警加载失败，已保留本地数据：${result.message}`) })
  }, [loadWarningsFromDatabase, setToast])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2400)
    return () => window.clearTimeout(timer)
  }, [toast, setToast])

  useEffect(() => {
    setSearchOpen(false)
    setScopeOpen(false)
    setRoleOpen(false)
    setAgentOpen(false)
    setAgentInput('')
    setAgentMessages([])
  }, [location.pathname])

  const currentRoleItem = roles.find((item) => item.name === currentRole)
  const rolePermissions = currentRoleItem?.permissions
  const effectivePermissions = useMemo(() => resolveRolePermissionCodes(currentRole, rolePermissions), [currentRole, rolePermissions])
  const visibleNavSections = useMemo(() => filterNavSections(effectivePermissions), [effectivePermissions])
  const firstAccessiblePath = useMemo(() => getFirstAccessiblePath(effectivePermissions), [effectivePermissions])
  const activeRailId = useMemo(() => {
    const path = location.pathname
    if (path === '/home') return 'home'
    if (path.startsWith('/super-agent')) return 'superAgent'
    if (path.startsWith('/procurement/tender')) return 'tender'
    if (path.startsWith('/procurement/contract')) return 'contract'
    if (path.startsWith('/procurement/review')) return 'review'
    if (path === '/procurement' || path.startsWith('/procurement/purchase')) return 'procurement'
    if (path.startsWith('/workbench') || path.startsWith('/situation') || path.startsWith('/risk/')) return 'supervision'
    if (path.startsWith('/system/models') || path.startsWith('/system/vertical-models')) return 'modelManagement'
    if (path.startsWith('/rules')) return 'ruleManagement'
    if (path.startsWith('/graphs') || path.startsWith('/ontology')) return 'knowledgeGraph'
    if (path.startsWith('/system/')) return 'system'
    return 'home'
  }, [location.pathname])
  const visibleRailItems = useMemo(() => railNavItems.filter((item) => {
    if (item.permission) return effectivePermissions.has(item.permission)
    return visibleNavSections.some((section) => section.id === item.sectionId)
  }), [effectivePermissions, visibleNavSections])
  const activeRailSection = useMemo(() => visibleNavSections.find((section) => section.id === activeRailId), [activeRailId, visibleNavSections])

  useEffect(() => {
    if (location.pathname === '/' || location.pathname === '/no-access') return
    if (!pathAllowedByPermissions(location.pathname, effectivePermissions)) navigate(firstAccessiblePath, { replace: true })
  }, [location.pathname, effectivePermissions, firstAccessiblePath, navigate])

  const isNavItemActive = (path: string) => {
    if (path === '/procurement') return location.pathname === '/procurement'
    if (path === '/graphs/structures') return location.pathname.startsWith('/graphs/structures') || location.pathname.startsWith('/ontology') || (location.pathname === '/graphs' && (!location.search || location.search.includes('tab=structures')))
    if (path === '/graphs/sources') return location.pathname.startsWith('/graphs/sources') || location.pathname.startsWith('/data-access') || (location.pathname === '/graphs' && location.search.includes('tab=sources'))
    if (path === '/graphs/results') return location.pathname.startsWith('/graphs/results') || location.pathname === '/graphs/new' || /^\/graphs\/[^/]+\/edit$/.test(location.pathname) || (location.pathname === '/graphs' && location.search.includes('tab=results'))
    return location.pathname === path || location.pathname.startsWith(`${path}/`)
  }
  const unread = messages.filter((item) => item.unread).length
  const searchResults = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return []
    return [
      ...warnings.filter((item) => `${item.id}${item.title}${item.target}`.toLowerCase().includes(keyword)).map((item) => ({ id: item.id, type: '预警', title: item.title, meta: `${item.level} · ${item.status} · ${item.target}`, path: `/risk/warnings/${item.id}` })),
      ...riskEvents.filter((item) => `${item.id}${item.title}${item.target}`.toLowerCase().includes(keyword)).map((item) => ({ id: item.id, type: '风险事件', title: item.title, meta: `${item.level} · ${item.status} · ${item.owner}`, path: `/risk/events/${item.id}` })),
      ...users.filter((item) => `${item.id}${item.name}${item.account}`.toLowerCase().includes(keyword)).map((item) => ({ id: item.id, type: '用户', title: item.name, meta: `${item.organization} · ${item.status}`, path: '/system/users' })),
    ].filter((item) => pathAllowedByPermissions(item.path, effectivePermissions)).slice(0, 8)
  }, [search, warnings, riskEvents, users, effectivePermissions])

  const agentContext = useMemo<AgentPageContext>(() => {
    const path = location.pathname
    const objectId = path.split('/').filter(Boolean).at(-1) || ''
    if (path === '/home') return { page: '采购管理应用首页', guide: '这里是采购管理应用的统一入口，聚合超级智能体、采购应用和穿透式监管主线。', next: '可以进入超级智能体发起任务，也可以直接进入采购应用总览或监管工作台。', data: '当前菜单会根据角色权限动态隐藏未授权应用域。' }
    if (path.startsWith('/super-agent')) return { page: '超级智能体', guide: '这里用于用自然语言发起采购材料生成、审查、招投标和监管查询任务。', next: '输入任务目标后，系统会识别业务域并跳转到对应采购应用工作台。', data: '超级智能体作为统一入口能力，可被菜单权限单独控制。' }
    if (path === '/procurement') return { page: '采购应用总览', guide: '这里聚合招投标、合同、审查和采购四类采购应用。', next: '选择一个采购应用进入对应工作台，或从超级智能体发起跨应用任务。', data: '采购应用域可整体或按模块授权，未授权模块不会出现在菜单和搜索结果中。' }
    if (path.startsWith('/procurement/')) return { page: '采购应用工作台', guide: '这里承载采购应用的任务列表、资料上传、智能生成、风险审查和结果确认。', next: '建议先选择左侧任务或上传资料，再根据 AI 建议完成确认、导出或提交。', data: '当前页面属于采购应用域，访问由采购应用菜单权限控制。' }
    if (path === '/workbench') return { page: '监管工作台', guide: '这里汇总本人待办、处置统计和业务消息，帮助你快速确定当前需要处理的事项。', next: '建议先查看已逾期和重大风险待办，再按状态进入对应的预警或风险事件处理。', data: `当前共有${todos.length}项待办，其中${todos.filter((item) => item.timeState === '已逾期').length}项已逾期。` }
    if (path === '/situation') return { page: '监管态势', guide: '这里集中展示预警规模、风险等级、组织分布和风险处置进展。', next: '建议先关注重大高风险和逾期事项，再通过图表或重点事项下钻到业务对象。', data: `当前加载${warnings.length}条预警和${riskEvents.length}个风险事件，可结合等级、组织和处置状态分析。` }
    if (path.startsWith('/risk/warnings/')) { const item = warnings.find((warning) => warning.id === objectId); return { page: `预警详情 · ${objectId}`, guide: '这里用于查看预警风险说明、证据子图、制度依据和完整处置记录。', next: '建议先核对证据和命中规则，再根据状态执行研判、核查、复核、解除或升级。', data: item ? `该预警风险等级为${item.level}，当前状态为${item.status}，证据状态为${item.evidenceStatus}。` : '当前预警详情正在加载，请稍后查看证据和状态。' } }
    if (path === '/risk/warnings') return { page: '统一预警', guide: '这里统一查询事前、事中和事后预警，并进入证据研判与处置流程。', next: '可先使用状态和风险等级筛选，再进入预警详情查看证据或开展处置。', data: `当前加载${warnings.length}条预警，其中${warnings.filter((item) => ['重大', '高'].includes(item.level)).length}条为重大或高风险。` }
    if (path.startsWith('/risk/events/')) { const item = riskEvents.find((event) => event.id === objectId); return { page: `风险事件详情 · ${objectId}`, guide: '这里用于跟踪风险事件的责任人、整改过程、证据材料和监管复核。', next: '建议确认当前状态和完成时限，再执行派发、整改提交或监管复核。', data: item ? `该事件风险等级为${item.level}，当前状态为${item.status}，责任人为${item.owner || '待分配'}。` : '当前风险事件详情正在加载，请稍后查看处置状态。' } }
    if (path === '/risk/events') return { page: '风险事件', guide: '这里管理由预警升级形成的风险事件，并跟踪整改、复核和关闭过程。', next: '建议优先处理逾期和待复核事件，再检查核查整改中的事项。', data: `当前共有${riskEvents.length}个风险事件，其中${riskEvents.filter((item) => item.overdue && item.status !== '已关闭').length}个已逾期。` }
    if (path.startsWith('/rules')) return { page: '规则管理', guide: '这里先按规则库维护规则目录，进入目录后再查看或配置风险规则。', next: '建议先选择规则库，再进入具体规则目录维护规则；规则表达式为必填，制度依据和证据要求按需填写。', data: '规则库承载分类，规则目录承载场景上下文，风险规则从目录继承领域等信息。' }

    if (path.startsWith('/ontology')) return { page: '图谱模型', guide: '这里维护实体类型、属性字段和关系类型。', next: '先完成模型结构定义；发布后可在知识图谱生成流程中引用。', data: '图谱模型只定义知识图谱的结构，不直接绑定数据源。' }
    if (path.startsWith('/graphs/results') || path === '/graphs/new' || /^\/graphs\/[^/]+\/edit$/.test(path)) return { page: '知识图谱', guide: '这里把图谱模型和数据源组合起来，完成映射、生成和展示。', next: '先选择模型和数据源，再在图谱映射中配置实例、属性和关系，最后生成图谱。', data: '知识图谱发布后可被后续规则和监管分析引用。' }
    if (path.startsWith('/graphs/sources') || path.startsWith('/data-access')) return { page: '数据源', guide: '这里只维护数据接入方式、连接信息和启停状态。', next: '完成连接测试并启用数据源后，在知识图谱生成流程中选择它。', data: '数据源只负责提供可接入的数据，不承载图谱模型或映射配置。' }
    if (path.startsWith('/graphs')) return { page: '知识图谱', guide: '这里维护图谱模型、数据源和知识图谱三个闭环入口。', next: '通常先维护图谱模型，再接入数据源，最后在知识图谱中配置映射并生成。', data: '知识图谱用于证据关联和风险穿透分析，发布后会被后续规则运行引用。' }
    if (path.startsWith('/system/users')) return { page: '用户与组织', guide: '这里维护用户账号、所属组织、角色和未完成待办。', next: '修改账号状态前应先检查角色、权限和未完成待办是否需要转派。', data: `当前共有${users.length}名用户，操作时将按照当前角色“${currentRole}”校验权限。` }
    if (path.startsWith('/system/roles')) return { page: '角色与权限', guide: '这里维护角色、数据范围、菜单权限和高危操作权限。', next: '建议先确认角色使用人数，再调整权限并检查敏感操作影响。', data: `当前共有${roles.length}个角色，权限调整会影响菜单、数据范围和可执行操作。` }
    if (path.startsWith('/system/models') || path.startsWith('/system/vertical-models')) return { page: '模型管理', guide: '这里统一管理平台预置模型和客户自有模型接入，维护启停、能力标签、适用范围和权限边界。', next: '可以接入自有模型、绑定规则场景、测试模型效果，或停用暂不适用的模型。', data: '模型可作为通用能力，也可以绑定规则场景形成专用研判助手。' }
    if (path.startsWith('/system/audit')) return { page: '审计日志', guide: '这里查询用户操作、对象变化、执行结果和审计追踪编号。', next: '可按操作人、对象类型、风险级别或追踪编号定位具体操作记录。', data: '审计记录用于追踪关键配置和业务处置操作，历史记录不会被普通业务操作覆盖。' }
    return { page: '穿透式监管', guide: '当前页面属于穿透式监管业务平台。', next: '可以先查看页面标题和筛选条件，再选择需要处理的业务对象。', data: '当前页面数据会按照监管范围和角色权限展示。' }
  }, [location.pathname, todos, warnings, riskEvents, users, roles, currentRole])

  const answerAgentQuestion = (question: string) => {
    if (/当前页面|做什么|功能/.test(question)) return agentContext.guide
    if (/下一步|怎么操作|如何操作/.test(question)) return agentContext.next
    if (/数据|解释|指标|状态/.test(question)) return agentContext.data
    return `当前位于“${agentContext.page}”。${agentContext.guide}${agentContext.next}`
  }
  const sendAgentQuestion = (value = agentInput) => {
    const question = value.trim()
    if (!question) return
    setAgentMessages((items) => [...items, { role: 'user', text: question }, { role: 'assistant', text: answerAgentQuestion(question) }])
    setAgentInput('')
  }
  const openSearchResult = (path: string) => {
    const isRiskDetail = /^\/risk\/(?:warnings|events)\/[^/]+$/.test(path)
    const returnState = createReturnState(locationPath(location), `返回${agentContext.page}`)
    navigate(path, isRiskDetail ? { state: returnState } : undefined)
    setSearch('')
  }
  const openAgent = () => {
    if (agentMessages.length === 0) setAgentMessages([{ role: 'assistant', text: `你好，我是智能助理。当前位于“${agentContext.page}”，你可以询问页面功能、下一步操作或当前数据。` }])
    setAgentOpen(true)
  }
  const clampAgentPosition = (left: number, top: number, width: number, height: number) => {
    const margin = 12
    const maxLeft = Math.max(margin, window.innerWidth - width - margin)
    const maxTop = Math.max(margin, window.innerHeight - height - margin)
    return { left: Math.min(Math.max(margin, left), maxLeft), top: Math.min(Math.max(margin, top), maxTop) }
  }
  const beginAgentDrag = (event: PointerEvent<HTMLElement>, target: AgentDragTarget) => {
    if (event.button !== 0) return
    const element = target === 'dialog' ? event.currentTarget.closest('.agent-popover') as HTMLElement | null : event.currentTarget
    if (!element) return
    const rect = element.getBoundingClientRect()
    agentDragRef.current = { target, pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, width: rect.width, height: rect.height, startX: event.clientX, startY: event.clientY }
    agentClickSuppressedRef.current = false
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const moveAgentDrag = (event: PointerEvent<HTMLElement>) => {
    const drag = agentDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (Math.abs(event.clientX - drag.startX) > 4 || Math.abs(event.clientY - drag.startY) > 4) agentClickSuppressedRef.current = true
    const next = clampAgentPosition(event.clientX - drag.offsetX, event.clientY - drag.offsetY, drag.width, drag.height)
    if (drag.target === 'fab') setAgentFabPosition(next)
    else setAgentDialogPosition(next)
    event.preventDefault()
  }
  const endAgentDrag = (event: PointerEvent<HTMLElement>) => {
    const drag = agentDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    agentDragRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }
  const toggleAgentFromFab = () => {
    if (agentClickSuppressedRef.current) {
      agentClickSuppressedRef.current = false
      return
    }
    agentOpen ? setAgentOpen(false) : openAgent()
  }

  const chooseScope = (scope: string) => { setScope(scope); setScopeOpen(false); setToast(`监管范围已切换为：${scope}`) }
  const chooseRole = (role: string) => { const nextRoleItem = roles.find((item) => item.name === role); const nextPermissions = resolveRolePermissionCodes(role, nextRoleItem?.permissions); setCurrentRole(role); setRoleOpen(false); setToast(`当前角色已切换为：${role}`); navigate(getFirstAccessiblePath(nextPermissions)) }
  const confirmWorkflowReset = async () => {
    if (resettingWorkflow) return
    setResettingWorkflow(true)
    try {
      const result = await demoDataApi.resetWorkflow()
      resetWorkflow()
      const reloadResult = await loadWarningsFromDatabase()
      if (!reloadResult.ok) throw new Error(reloadResult.message)
      setResetWorkflowOpen(false)
      navigate(firstAccessiblePath)
      setToast(result.message)
    } catch (error) {
      setToast(`重置失败：${error instanceof Error ? error.message : '服务处理失败'}`)
    } finally {
      setResettingWorkflow(false)
    }
  }

  return <div className={`app-shell ${collapsed ? 'collapsed' : ''} ${!activeRailSection ? 'rail-only' : ''} ${graphWorkspace ? 'graph-workspace-shell' : ''} ${superAgentPage ? 'super-agent-embedded-shell' : ''}`} onClick={(event) => { if (scopeOpen) setScopeOpen(false); if (roleOpen) setRoleOpen(false); const target = event.target as Element; if (agentOpen && !target.closest('.agent-popover') && !target.closest('.agent-fab')) setAgentOpen(false) }}>
    <header className="topbar">
      <button className="brand" onClick={() => navigate(firstAccessiblePath)} aria-label="返回采购管理应用"><img className="brand-logo" src={cloudLogo} alt="中国电子云"/><em/><span>AI平台</span></button>
      <nav className="platform-nav" aria-label="平台切换">{platformTabs.map((tab) => <button key={tab} className={tab === currentPlatformTab ? 'active' : ''} onClick={() => tab === currentPlatformTab ? navigate(firstAccessiblePath) : setToast(`${tab}暂未进入，当前选择采购管理应用`)}>{tab}</button>)}</nav>
      <div className="top-tools">
        <div className="global-search-wrap"><label className="global-search"><Icon name="search" size={17}/><input value={search} onFocus={() => setSearchOpen(true)} onChange={(event) => { setSearch(event.target.value); setSearchOpen(true) }} onKeyDown={(event) => { if (event.key === 'Enter' && searchResults[0]) openSearchResult(searchResults[0].path); if (event.key === 'Escape') setSearchOpen(false) }} placeholder="搜索采购任务、预警、风险事件、规则、用户"/></label>{searchOpen && search && <div className="global-search-results">{searchResults.length ? <>{searchResults.map((item) => <button key={`${item.type}-${item.id}`} onClick={() => openSearchResult(item.path)}><span><b>{item.type}</b><strong>{item.title}</strong></span><small>{item.id} · {item.meta}</small></button>)}<div className="search-result-footer">共显示 {searchResults.length} 条最相关结果</div></> : <div className="search-empty"><Icon name="search"/><span>未找到“{search}”相关内容</span></div>}</div>}</div>
        <button className="top-icon" onClick={() => navigate(pathAllowedByPermissions('/workbench', effectivePermissions) ? '/workbench' : firstAccessiblePath)} aria-label="查看消息"><Icon name="bell"/>{unread > 0 && <b>{unread}</b>}</button>
        <div className="role-switcher" onClick={(event) => event.stopPropagation()}><button className="user-entry" onClick={() => setRoleOpen((value) => !value)}><span>尹</span><div><strong>尹晨阳</strong><small>{currentRole}</small></div><Icon name="chevron" size={14}/></button>{roleOpen && <div className="context-menu role-menu"><header><strong>切换当前角色</strong><span>菜单和高危按钮将按权限刷新</span></header>{roles.filter((item) => item.status === '启用').map((item) => <button key={item.id} className={currentRole === item.name ? 'active' : ''} onClick={() => chooseRole(item.name)}><div><strong>{item.name}</strong><small>{item.scope}</small></div>{currentRole === item.name && <Icon name="check" size={15}/>}</button>)}</div>}</div>
      </div>
    </header>
    <aside className="sidebar">
      <div className="scope-switcher" onClick={(event) => event.stopPropagation()}><div className="sidebar-context"><span className="context-icon"><Icon name="shield"/></span><div><small>当前业务范围</small><strong>{currentScope}</strong></div><button aria-label="切换业务范围" onClick={() => setScopeOpen((value) => !value)}>⌄</button></div>{scopeOpen && <div className="context-menu scope-menu"><header><strong>切换监管范围</strong><span>列表、指标和检索结果同步变化</span></header>{scopeOptions.map((item) => <button key={item} className={currentScope === item ? 'active' : ''} onClick={() => chooseScope(item)}><span>{item}</span>{currentScope === item && <Icon name="check" size={15}/>}</button>)}</div>}</div>
      <div className="sidebar-main">
        <nav className="side-rail" aria-label="一级导航">
          <div className="side-rail-items">{visibleRailItems.map((item) => {
            const section = item.sectionId ? visibleNavSections.find((candidate) => candidate.id === item.sectionId) : undefined
            const targetPath = item.path || (section?.items[0] ? firstPathForItem(section.items[0]) : '/no-access')
            return <button key={item.id} type="button" className={`side-rail-item ${activeRailId === item.id ? 'active' : ''}`} title={item.label} onClick={() => navigate(targetPath)}><Icon name={item.icon} size={20}/><span>{item.label}</span></button>
          })}</div>
          <div className="side-rail-footer">
            <button type="button" className="side-rail-utility" title="重置演示工作流" aria-label="重置演示工作流" onClick={() => setResetWorkflowOpen(true)}><Icon name="refresh" size={18}/></button>
            <button type="button" className="side-rail-utility" title={collapsed ? '展开导航' : '收起导航'} aria-label={collapsed ? '展开导航' : '收起导航'} disabled={!activeRailSection} onClick={() => setCollapsed((value) => !value)}><Icon name="menu" size={18}/></button>
          </div>
        </nav>
        {activeRailSection && <section className="side-secondary" aria-label={`${activeRailSection.title}菜单`}>
          <header className="side-secondary-header"><strong>{activeRailSection.title}</strong><span>{activeRailSection.items.length} 个模块</span></header>
          <nav className="side-secondary-nav">{activeRailSection.items.map((item) => {
            const itemActive = item.path ? isNavItemActive(item.path) : item.children?.some((child) => isNavItemActive(child.path))
            if (item.path && !item.children) return <button key={item.id} type="button" className={`side-secondary-leaf ${itemActive ? 'active' : ''}`} onClick={() => navigate(item.path!)}><Icon name={item.icon} size={18}/><span>{item.label}</span></button>
            const isOpen = openGroups[item.id] ?? true
            return <div key={item.id} className={`side-secondary-group ${itemActive ? 'active' : ''} ${isOpen ? 'open' : ''}`}><button type="button" className="side-secondary-group-trigger" onClick={() => setOpenGroups((value) => ({ ...value, [item.id]: !value[item.id] }))}><Icon name={item.icon} size={18}/><span>{item.label}</span><i><Icon name="chevron" size={14}/></i></button>{isOpen && <div className="side-secondary-children">{item.children!.map((child) => <button type="button" key={child.path} className={isNavItemActive(child.path) ? 'active' : ''} onClick={() => navigate(child.path)}>{child.label}</button>)}</div>}</div>
          })}</nav>
        </section>}
      </div>
    </aside>
    <main className="main-content"><div className="content-inner"><Routes>
      <Route path="/" element={<Navigate to={firstAccessiblePath} replace/>}/>
      <Route path="/home" element={<ProcurementHomePage/>}/>
      <Route path="/super-agent" element={<SuperAgentPage/>}/>
      <Route path="/procurement" element={<ProcurementOverviewPage/>}/>
      <Route path="/procurement/:module" element={<ProcurementModulePage/>}/>
      <Route path="/procurement/:module/:submodule" element={<ProcurementModulePage/>}/>
      <Route path="/workbench" element={<WorkbenchPage/>}/>
      <Route path="/situation" element={<SituationPage/>}/>
      <Route path="/risk/warnings" element={<WarningListPage/>}/>
      <Route path="/risk/warnings/:id" element={<WarningDetailPage/>}/>
      <Route path="/risk/events" element={<RiskEventListPage/>}/>
      <Route path="/risk/events/:id" element={<RiskEventDetailPage/>}/>
      <Route path="/scenes" element={<Navigate to="/rules" replace/>}/>
      <Route path="/scenes/new" element={<Navigate to="/rules/new" replace/>}/>
      <Route path="/scenes/:id" element={<Navigate to="/rules" replace/>}/>
      <Route path="/rules" element={<RuleAssetManagementPage/>}/>
      <Route path="/rules/new" element={<RuleAssetCreatePage/>}/>
      <Route path="/rules/:id" element={<RuleAssetEditorPage/>}/>
      <Route path="/skills" element={<Navigate to="/rules" replace/>}/>
      <Route path="/skills/:id" element={<Navigate to="/rules" replace/>}/>
      <Route path="/ontology" element={<Navigate to="/graphs/structures" replace/>}/>
      <Route path="/ontology/new" element={<OntologyCreatePage/>}/>
      <Route path="/ontology/:id" element={<OntologyEditorPage/>}/>
      <Route path="/data-access" element={<Navigate to="/graphs/sources" replace/>}/>
      <Route path="/data-access/new" element={<DataSourceCreatePage/>}/>
      <Route path="/data-access/:id" element={<DataSourceDetailPage/>}/>
      <Route path="/graphs" element={<GraphManagementPage/>}/>
      <Route path="/graphs/structures" element={<GraphManagementPage/>}/>
      <Route path="/graphs/structures/new" element={<OntologyCreatePage/>}/>
      <Route path="/graphs/sources" element={<GraphManagementPage/>}/>
      <Route path="/graphs/sources/new" element={<DataSourceCreatePage/>}/>
      <Route path="/graphs/sources/:id/edit" element={<DataSourceCreatePage/>}/>
      <Route path="/graphs/results" element={<GraphManagementPage/>}/>
      <Route path="/graphs/results/:id" element={<GraphResultDetailPage/>}/>
      <Route path="/graphs/new" element={<GraphCreatePage/>}/>
      <Route path="/graphs/:id/edit" element={<GraphCreatePage/>}/>
      <Route path="/graphs/sources/:id" element={<DataSourceDetailPage/>}/>
      <Route path="/system/users" element={<UsersPage/>}/>
      <Route path="/system/roles" element={<RolesPage/>}/>
      <Route path="/system/models" element={<ModelManagementPage/>}/>
      <Route path="/system/vertical-models" element={<Navigate to="/system/models" replace/>}/>
      <Route path="/system/audit" element={<AuditPage/>}/>
      <Route path="/no-access" element={<EmptyState title="暂无可访问菜单" description="当前角色没有任何菜单权限，请联系系统管理员分配统一入口、采购应用、穿透式监管或系统管理权限。"/>}/>
      <Route path="*" element={<Navigate to={firstAccessiblePath} replace/>}/>
    </Routes></div></main>
    <button className={`help-fab agent-fab ${agentOpen ? 'open' : ''}`} style={agentFabPosition ? { left: agentFabPosition.left, top: agentFabPosition.top, right: 'auto', bottom: 'auto' } : undefined} onPointerDown={(event) => beginAgentDrag(event, 'fab')} onPointerMove={moveAgentDrag} onPointerUp={endAgentDrag} onPointerCancel={endAgentDrag} onClick={toggleAgentFromFab} aria-label={agentOpen ? '收起智能助理' : '打开智能助理'} title="可拖动调整位置"><Icon name={agentOpen ? 'close' : 'agent'}/><span>{agentOpen ? '收起智能助理' : '智能助理'}</span></button>
    {agentOpen && <section className="modal agent-dialog agent-popover" style={agentDialogPosition ? { left: agentDialogPosition.left, top: agentDialogPosition.top, right: 'auto', bottom: 'auto' } : undefined} role="dialog" aria-modal="true" aria-labelledby="agent-dialog-title"><header className="agent-drag-handle" onPointerDown={(event) => { if ((event.target as Element).closest('button')) return; beginAgentDrag(event, 'dialog') }} onPointerMove={moveAgentDrag} onPointerUp={endAgentDrag} onPointerCancel={endAgentDrag} title="拖动移动智能助理"><div><p className="eyebrow">智能问答 · {agentContext.page}</p><h2 id="agent-dialog-title"><Icon name="agent"/>智能助理</h2><p>提供当前页面说明和操作建议，暂不直接执行业务操作。</p></div><button className="icon-button" onClick={() => setAgentOpen(false)} aria-label="关闭智能助理"><Icon name="close"/></button></header><div className="modal-body agent-dialog-body"><div className="agent-messages" aria-live="polite">{agentMessages.map((message, index) => <div className={`agent-message ${message.role}`} key={`${message.role}-${index}`}><span>{message.role === 'assistant' ? <Icon name="agent" size={15}/> : '我'}</span><p>{message.text}</p></div>)}</div><div className="agent-suggestions"><span>你可以这样问</span><div>{agentSuggestions.map((question) => <button key={question} onClick={() => sendAgentQuestion(question)}>{question}</button>)}</div></div></div><footer className="agent-composer"><div><textarea rows={2} value={agentInput} onChange={(event) => setAgentInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendAgentQuestion() } }} placeholder="请输入你的问题" aria-label="向智能助理提问"/><small>Enter 发送，Shift + Enter 换行</small></div><Button variant="primary" icon="agent" disabled={!agentInput.trim()} onClick={() => sendAgentQuestion()}>发送</Button></footer></section>}
    <Modal open={resetWorkflowOpen} title="重置演示工作流" description="恢复预警和风险事件的演示处置状态，不影响规则、证据、图谱、组织及业务配置。" confirmText={resettingWorkflow ? '正在重置…' : '确认重置'} danger onClose={() => { if (!resettingWorkflow) setResetWorkflowOpen(false) }} onConfirm={() => void confirmWorkflowReset()}><div className="alert-box danger"><Icon name="warning"/><span>将覆盖当前演示中的转派、解除、升级、整改和复核结果，并重新生成待办及业务消息。</span></div><ul className="plain-list"><li>保留规则测试数据、证据快照和证据子图</li><li>恢复为6个待整改事件、4个待复核事件</li><li>仅保留2个事件逾期，用于验证催办功能</li></ul></Modal>
    <div className={`toast ${toast ? 'show' : ''}`}><Icon name="check"/><span>{toast || '操作成功'}</span></div>
  </div>
}

export default AppEnhanced
