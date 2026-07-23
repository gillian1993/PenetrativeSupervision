import { useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AuditPage, DataAccessPage, DataSourceDetailPage, GraphManagementPage, RolesPage, UsersPage } from './pages/ManagementStatePages'
import { GraphCreatePage } from './pages/GraphCreateWizard'
import { SceneEditorPage, SceneListPage } from './pages/SceneRulePages'
import { RuleAssetEditorPage, RuleAssetManagementPage } from './pages/RuleAssetPages'
import { SkillAssetEditorPage, SkillAssetManagementPage } from './pages/SkillAssetPages'
import { OntologyEditorPage, OntologyListPage } from './pages/OntologyLocalPages'
import { SituationPage, WorkbenchPage } from './pages/OverviewPages'
import { RiskEventDetailPage, RiskEventListPage, WarningDetailPage, WarningListPage } from './pages/RiskPages'
import { demoDataApi } from './demoDataApi'
import { useAppStore } from './store'
import { useOntologyStore } from './ontologyMysqlStore'
import { Button, Icon, Modal, type IconName } from './ui'
import cloudLogo from './assets/logo-cloud.svg'

interface NavItem { label: string; path: string; permission?: string }
interface NavGroup { id: string; label: string; icon: IconName; path?: string; children?: NavItem[] }

const navGroups: NavGroup[] = [
  { id: 'workbench', label: '监管工作台', icon: 'workbench', path: '/workbench' },
  { id: 'situation', label: '监管态势', icon: 'situation', path: '/situation' },
  { id: 'risk', label: '风险监管', icon: 'shield', children: [{ label: '统一预警', path: '/risk/warnings', permission: '查看统一预警' }, { label: '风险事件', path: '/risk/events', permission: '查看风险事件' }] },
  { id: 'scene', label: '场景与规则', icon: 'rules', children: [{ label: '风险场景', path: '/scenes' }, { label: '规则管理', path: '/rules' }, { label: 'Skill管理', path: '/skills' }] },
  { id: 'ontology', label: '本体与图谱', icon: 'graph', children: [{ label: '本体管理', path: '/ontology' }, { label: '数据接入', path: '/data-access' }, { label: '图谱管理', path: '/graphs' }] },
  { id: 'system', label: '系统管理', icon: 'system', children: [{ label: '用户与组织', path: '/system/users' }, { label: '角色与权限', path: '/system/roles' }, { label: '审计日志', path: '/system/audit', permission: '查看审计日志' }] },
]

const scopeOptions = ['中国电子云集团', '集团监管部', '集团采购中心', '财务共享中心', '试点事业部']
const agentSuggestions = ['当前页面是做什么的？', '我下一步应该怎么操作？', '帮我解释当前数据']

type AgentMessage = { role: 'assistant' | 'user'; text: string }
type AgentPageContext = { page: string; guide: string; next: string; data: string }

function AppEnhanced() {
  const navigate = useNavigate()
  const location = useLocation()
  const graphWorkspace = location.pathname === '/graphs/new' || /^\/graphs\/[^/]+\/edit$/.test(location.pathname)
  const messages = useAppStore((state) => state.messages)
  const todos = useAppStore((state) => state.todos)
  const warnings = useAppStore((state) => state.warnings)
  const riskEvents = useAppStore((state) => state.riskEvents)
  const scenes = useAppStore((state) => state.scenes)
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
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ risk: true, scene: true, ontology: true, system: true })
  const [agentOpen, setAgentOpen] = useState(false)
  const [agentInput, setAgentInput] = useState('')
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([])
  const [resetWorkflowOpen, setResetWorkflowOpen] = useState(false)
  const [resettingWorkflow, setResettingWorkflow] = useState(false)

  useEffect(() => {
    void loadOntologies().then((result) => { if (!result.ok) setToast(`MySQL本体数据加载失败：${result.message}`) })
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
  const rolePermissions = currentRoleItem?.permissions || []
  const permittedGroups = useMemo(() => {
    if (currentRole === '监管负责人') return new Set(navGroups.map((item) => item.id))
    if (currentRole === '领域监管专员') return new Set(['workbench','situation','risk','scene'])
    if (currentRole === '业务责任人') return new Set(['workbench','risk'])
    if (currentRole.includes('规则')) return new Set(['workbench','scene'])
    if (currentRole.includes('本体') || currentRole.includes('数据')) return new Set(['workbench','ontology','system'])
    const allowed = new Set(['workbench'])
    if (rolePermissions.some((item) => item.includes('预警') || item.includes('风险'))) allowed.add('risk')
    if (rolePermissions.some((item) => item.includes('场景') || item.includes('规则'))) allowed.add('scene')
    if (rolePermissions.some((item) => item.includes('本体') || item.includes('图谱'))) allowed.add('ontology')
    if (rolePermissions.some((item) => item.includes('用户') || item.includes('角色') || item.includes('审计'))) allowed.add('system')
    return allowed
  }, [currentRole, rolePermissions])

  const visibleNavGroups = navGroups.filter((group) => permittedGroups.has(group.id)).map((group) => {
    if (group.id === 'ontology' && group.children) return { ...group, children: group.children.filter((item) => item.path !== '/data-access') }
    if (!group.children || currentRole === '监管负责人') return group
    if (group.id === 'system' && (currentRole.includes('本体') || currentRole.includes('数据'))) return { ...group, children: group.children.filter((item) => item.path === '/system/audit') }
    return group
  }).filter((group) => group.path || (group.children && group.children.length > 0))

  const activeGroup = useMemo(() => visibleNavGroups.find((group) => group.path ? location.pathname.startsWith(group.path) : group.children?.some((child) => location.pathname.startsWith(child.path.split('/:')[0])))?.id, [location.pathname, visibleNavGroups])
  const unread = messages.filter((item) => item.unread).length
  const searchResults = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return []
    return [
      ...warnings.filter((item) => `${item.id}${item.title}${item.target}`.toLowerCase().includes(keyword)).map((item) => ({ id: item.id, type: '预警', title: item.title, meta: `${item.level} · ${item.status} · ${item.target}`, path: `/risk/warnings/${item.id}` })),
      ...riskEvents.filter((item) => `${item.id}${item.title}${item.target}`.toLowerCase().includes(keyword)).map((item) => ({ id: item.id, type: '风险事件', title: item.title, meta: `${item.level} · ${item.status} · ${item.owner}`, path: `/risk/events/${item.id}` })),
      ...scenes.filter((item) => `${item.id}${item.name}${item.object}`.toLowerCase().includes(keyword)).map((item) => ({ id: item.id, type: '风险场景', title: item.name, meta: `${item.domain} · ${item.status} · ${item.version}`, path: `/scenes/${item.id}` })),
      ...users.filter((item) => `${item.id}${item.name}${item.account}`.toLowerCase().includes(keyword)).map((item) => ({ id: item.id, type: '用户', title: item.name, meta: `${item.organization} · ${item.status}`, path: '/system/users' })),
    ].slice(0, 8)
  }, [search, warnings, riskEvents, scenes, users])

  const agentContext = useMemo<AgentPageContext>(() => {
    const path = location.pathname
    const objectId = path.split('/').filter(Boolean).at(-1) || ''
    if (path === '/workbench') return { page: '监管工作台', guide: '这里汇总本人待办、处置统计和业务消息，帮助你快速确定当前需要处理的事项。', next: '建议先查看已逾期和重大风险待办，再按状态进入对应的预警或风险事件处理。', data: `当前共有${todos.length}项待办，其中${todos.filter((item) => item.timeState === '已逾期').length}项已逾期。` }
    if (path === '/situation') return { page: '监管态势', guide: '这里集中展示预警规模、风险等级、组织分布和风险处置进展。', next: '建议先关注重大高风险和逾期事项，再通过图表或重点事项下钻到业务对象。', data: `当前加载${warnings.length}条预警和${riskEvents.length}个风险事件，可结合等级、组织和处置状态分析。` }
    if (path.startsWith('/risk/warnings/')) { const item = warnings.find((warning) => warning.id === objectId); return { page: `预警详情 · ${objectId}`, guide: '这里用于查看预警风险说明、证据子图、制度依据和完整处置记录。', next: '建议先核对证据和命中规则，再根据状态执行研判、核查、复核、解除或升级。', data: item ? `该预警风险等级为${item.level}，当前状态为${item.status}，证据状态为${item.evidenceStatus}。` : '当前预警详情正在加载，请稍后查看证据和状态。' } }
    if (path === '/risk/warnings') return { page: '统一预警', guide: '这里统一查询事前、事中和事后预警，并进入证据研判与处置流程。', next: '可先使用状态和风险等级筛选，再进入预警详情查看证据或开展处置。', data: `当前加载${warnings.length}条预警，其中${warnings.filter((item) => ['重大', '高'].includes(item.level)).length}条为重大或高风险。` }
    if (path.startsWith('/risk/events/')) { const item = riskEvents.find((event) => event.id === objectId); return { page: `风险事件详情 · ${objectId}`, guide: '这里用于跟踪风险事件的责任人、整改过程、证据材料和监管复核。', next: '建议确认当前状态和完成时限，再执行派发、整改提交或监管复核。', data: item ? `该事件风险等级为${item.level}，当前状态为${item.status}，责任人为${item.owner || '待分配'}。` : '当前风险事件详情正在加载，请稍后查看处置状态。' } }
    if (path === '/risk/events') return { page: '风险事件', guide: '这里管理由预警升级形成的风险事件，并跟踪整改、复核和关闭过程。', next: '建议优先处理逾期和待复核事件，再检查核查整改中的事项。', data: `当前共有${riskEvents.length}个风险事件，其中${riskEvents.filter((item) => item.overdue && item.status !== '已关闭').length}个已逾期。` }
    if (path.startsWith('/scenes')) return { page: '风险场景', guide: '这里维护风险场景，并组织标准规则和智能Skill。', next: '建议先确认场景状态和版本，再进入编辑页面维护规则或发布新版本。', data: `当前共有${scenes.length}个风险场景，其中${scenes.filter((item) => item.status === '已发布').length}个已发布。` }
    if (path.startsWith('/rules')) return { page: '规则管理', guide: '这里配置规则判断逻辑、风险等级、证据要求和运行策略。', next: '建议先选择所属场景，再检查判断条件、输出证据和失败策略。', data: '规则数据按所属场景和版本管理，发布前需要完成配置与校验。' }
    if (path.startsWith('/skills')) return { page: 'Skill管理', guide: '这里维护文档分析、语义判断和复杂研判等智能检测能力。', next: '填写基本信息和审查需求，生成并确认审查内容、审查要求与输出结果后，即可在风险场景中选择使用。', data: 'Skill独立版本化，可被多个风险场景引用。' }
    if (path.startsWith('/ontology')) return { page: '本体管理', guide: '这里维护本体类、属性和关系的统一语义定义。', next: '需要表达带时间的业务记录时，为普通本体类配置标识、发生时间属性及关联对象关系。', data: '本体版本会影响规则配置、数据映射和图谱构建，请在发布前确认影响范围。' }
    if (path.startsWith('/graphs')) return { page: '图谱管理', guide: '这里管理图谱版本、数据来源、语义映射和图谱质量。', next: '建议先确认数据源和本体版本，再检查映射、质量问题和发布条件。', data: '图谱数据用于证据关联和风险穿透分析，版本发布后会被后续规则运行引用。' }
    if (path.startsWith('/system/users')) return { page: '用户与组织', guide: '这里维护用户账号、所属组织、角色和未完成待办。', next: '修改账号状态前应先检查角色、权限和未完成待办是否需要转派。', data: `当前共有${users.length}名用户，操作时将按照当前角色“${currentRole}”校验权限。` }
    if (path.startsWith('/system/roles')) return { page: '角色与权限', guide: '这里维护角色、数据范围、菜单权限和高危操作权限。', next: '建议先确认角色使用人数，再调整权限并检查敏感操作影响。', data: `当前共有${roles.length}个角色，权限调整会影响菜单、数据范围和可执行操作。` }
    if (path.startsWith('/system/audit')) return { page: '审计日志', guide: '这里查询用户操作、对象变化、执行结果和审计追踪编号。', next: '可按操作人、对象类型、风险级别或追踪编号定位具体操作记录。', data: '审计记录用于追踪关键配置和业务处置操作，历史记录不会被普通业务操作覆盖。' }
    return { page: '穿透式监管', guide: '当前页面属于穿透式监管业务平台。', next: '可以先查看页面标题和筛选条件，再选择需要处理的业务对象。', data: '当前页面数据会按照监管范围和角色权限展示。' }
  }, [location.pathname, todos, warnings, riskEvents, scenes, users, roles, currentRole])

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
  const openAgent = () => {
    if (agentMessages.length === 0) setAgentMessages([{ role: 'assistant', text: `你好，我是监管智能体。当前位于“${agentContext.page}”，你可以询问页面功能、下一步操作或当前数据。` }])
    setAgentOpen(true)
  }

  const chooseScope = (scope: string) => { setScope(scope); setScopeOpen(false); setToast(`监管范围已切换为：${scope}`) }
  const chooseRole = (role: string) => { setCurrentRole(role); setRoleOpen(false); setToast(`当前角色已切换为：${role}`); navigate('/workbench') }
  const confirmWorkflowReset = async () => {
    if (resettingWorkflow) return
    setResettingWorkflow(true)
    try {
      const result = await demoDataApi.resetWorkflow()
      resetWorkflow()
      const reloadResult = await loadWarningsFromDatabase()
      if (!reloadResult.ok) throw new Error(reloadResult.message)
      setResetWorkflowOpen(false)
      navigate('/workbench')
      setToast(result.message)
    } catch (error) {
      setToast(`重置失败：${error instanceof Error ? error.message : '服务处理失败'}`)
    } finally {
      setResettingWorkflow(false)
    }
  }

  return <div className={`app-shell ${collapsed ? 'collapsed' : ''} ${graphWorkspace ? 'graph-workspace-shell' : ''}`} onClick={(event) => { if (scopeOpen) setScopeOpen(false); if (roleOpen) setRoleOpen(false); const target = event.target as Element; if (agentOpen && !target.closest('.agent-popover') && !target.closest('.agent-fab')) setAgentOpen(false) }}>
    <header className="topbar">
      <button className="brand" onClick={() => navigate('/workbench')} aria-label="返回监管工作台"><img className="brand-logo" src={cloudLogo} alt="中国电子云"/><em/><span>穿透式监管智能应用平台</span></button>
      <nav className="platform-nav"><button>应用开发平台</button><button>模型开发平台</button><button className="active">穿透式监管</button></nav>
      <div className="top-tools">
        <div className="global-search-wrap"><label className="global-search"><Icon name="search" size={17}/><input value={search} onFocus={() => setSearchOpen(true)} onChange={(event) => { setSearch(event.target.value); setSearchOpen(true) }} onKeyDown={(event) => { if (event.key === 'Enter' && searchResults[0]) navigate(searchResults[0].path); if (event.key === 'Escape') setSearchOpen(false) }} placeholder="搜索预警、风险事件、场景、用户"/></label>{searchOpen && search && <div className="global-search-results">{searchResults.length ? <>{searchResults.map((item) => <button key={`${item.type}-${item.id}`} onClick={() => { navigate(item.path); setSearch('') }}><span><b>{item.type}</b><strong>{item.title}</strong></span><small>{item.id} · {item.meta}</small></button>)}<div className="search-result-footer">共显示 {searchResults.length} 条最相关结果</div></> : <div className="search-empty"><Icon name="search"/><span>未找到“{search}”相关内容</span></div>}</div>}</div>
        <button className="top-icon" onClick={() => navigate('/workbench')} aria-label="查看消息"><Icon name="bell"/>{unread > 0 && <b>{unread}</b>}</button>
        <div className="role-switcher" onClick={(event) => event.stopPropagation()}><button className="user-entry" onClick={() => setRoleOpen((value) => !value)}><span>尹</span><div><strong>尹晨阳</strong><small>{currentRole}</small></div><Icon name="chevron" size={14}/></button>{roleOpen && <div className="context-menu role-menu"><header><strong>切换当前角色</strong><span>菜单和高危按钮将按权限刷新</span></header>{roles.filter((item) => item.status === '启用').map((item) => <button key={item.id} className={currentRole === item.name ? 'active' : ''} onClick={() => chooseRole(item.name)}><div><strong>{item.name}</strong><small>{item.scope}</small></div>{currentRole === item.name && <Icon name="check" size={15}/>}</button>)}</div>}</div>
      </div>
    </header>
    <aside className="sidebar">
      <div className="scope-switcher" onClick={(event) => event.stopPropagation()}><div className="sidebar-context"><span className="context-icon"><Icon name="shield"/></span><div><small>当前监管范围</small><strong>{currentScope}</strong></div><button onClick={() => setScopeOpen((value) => !value)}>⌄</button></div>{scopeOpen && <div className="context-menu scope-menu"><header><strong>切换监管范围</strong><span>列表、指标和检索结果同步变化</span></header>{scopeOptions.map((item) => <button key={item} className={currentScope === item ? 'active' : ''} onClick={() => chooseScope(item)}><span>{item}</span>{currentScope === item && <Icon name="check" size={15}/>}</button>)}</div>}</div>
      <nav className="side-nav">{visibleNavGroups.map((group) => {
        const isActive = activeGroup === group.id
        if (group.path) return <button key={group.id} className={`nav-main ${isActive ? 'active' : ''}`} title={group.label} onClick={() => navigate(group.path!)}><Icon name={group.icon}/><span>{group.label}</span></button>
        const isOpen = openGroups[group.id]
        return <div key={group.id} className={`nav-group ${isActive ? 'active' : ''} ${isOpen ? 'open' : ''}`}><button className="nav-main" title={group.label} onClick={() => setOpenGroups((value) => ({ ...value, [group.id]: !value[group.id] }))}><Icon name={group.icon}/><span>{group.label}</span><i><Icon name="chevron" size={14}/></i></button><div className="nav-children">{group.children!.map((child) => <button key={child.path} className={location.pathname.startsWith(child.path) ? 'active' : ''} onClick={() => navigate(child.path)}><span>{child.label}</span></button>)}</div></div>
      })}</nav>
      <div className="sidebar-footer"><button onClick={() => setCollapsed((value) => !value)}><Icon name="menu"/><span>{collapsed ? '展开导航' : '收起导航'}</span></button><button onClick={() => setResetWorkflowOpen(true)}><Icon name="refresh"/><span>重置演示工作流</span></button></div>
    </aside>
    <main className="main-content"><div className="content-inner"><Routes>
      <Route path="/" element={<Navigate to="/workbench" replace/>}/>
      <Route path="/workbench" element={<WorkbenchPage/>}/>
      <Route path="/situation" element={<SituationPage/>}/>
      <Route path="/risk/warnings" element={<WarningListPage/>}/>
      <Route path="/risk/warnings/:id" element={<WarningDetailPage/>}/>
      <Route path="/risk/events" element={<RiskEventListPage/>}/>
      <Route path="/risk/events/:id" element={<RiskEventDetailPage/>}/>
      <Route path="/scenes" element={<SceneListPage/>}/>
      <Route path="/scenes/:id" element={<SceneEditorPage key={location.key}/>}/>
      <Route path="/rules" element={<RuleAssetManagementPage/>}/>
      <Route path="/rules/:id" element={<RuleAssetEditorPage/>}/>
      <Route path="/skills" element={<SkillAssetManagementPage/>}/>
      <Route path="/skills/:id" element={<SkillAssetEditorPage/>}/>
      <Route path="/ontology" element={<OntologyListPage/>}/>
      <Route path="/ontology/:id" element={<OntologyEditorPage/>}/>
      <Route path="/data-access" element={<Navigate to="/graphs?tab=sources" replace/>}/>
      <Route path="/data-access/:id" element={<DataSourceDetailPage/>}/>
      <Route path="/graphs" element={<GraphManagementPage/>}/>
      <Route path="/graphs/new" element={<GraphCreatePage/>}/>
      <Route path="/graphs/:id/edit" element={<GraphCreatePage/>}/>
      <Route path="/graphs/sources/:id" element={<DataSourceDetailPage/>}/>
      <Route path="/system/users" element={<UsersPage/>}/>
      <Route path="/system/roles" element={<RolesPage/>}/>
      <Route path="/system/audit" element={<AuditPage/>}/>
      <Route path="*" element={<Navigate to="/workbench" replace/>}/>
    </Routes></div></main>
    <button className={`help-fab agent-fab ${agentOpen ? 'open' : ''}`} onClick={() => agentOpen ? setAgentOpen(false) : openAgent()} aria-label={agentOpen ? '收起监管智能体' : '打开监管智能体'}><Icon name={agentOpen ? 'close' : 'agent'}/><span>{agentOpen ? '收起智能体' : '监管智能体'}</span></button>
    {agentOpen && <section className="modal agent-dialog agent-popover" role="dialog" aria-modal="true" aria-labelledby="agent-dialog-title"><header><div><p className="eyebrow">智能问答 · {agentContext.page}</p><h2 id="agent-dialog-title"><Icon name="agent"/>监管智能体</h2><p>提供当前页面说明和操作建议，暂不直接执行业务操作。</p></div><button className="icon-button" onClick={() => setAgentOpen(false)} aria-label="关闭监管智能体"><Icon name="close"/></button></header><div className="modal-body agent-dialog-body"><div className="agent-messages" aria-live="polite">{agentMessages.map((message, index) => <div className={`agent-message ${message.role}`} key={`${message.role}-${index}`}><span>{message.role === 'assistant' ? <Icon name="agent" size={15}/> : '我'}</span><p>{message.text}</p></div>)}</div><div className="agent-suggestions"><span>你可以这样问</span><div>{agentSuggestions.map((question) => <button key={question} onClick={() => sendAgentQuestion(question)}>{question}</button>)}</div></div></div><footer className="agent-composer"><div><textarea rows={2} value={agentInput} onChange={(event) => setAgentInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendAgentQuestion() } }} placeholder="请输入你的问题" aria-label="向监管智能体提问"/><small>Enter 发送，Shift + Enter 换行</small></div><Button variant="primary" icon="agent" disabled={!agentInput.trim()} onClick={() => sendAgentQuestion()}>发送</Button></footer></section>}
    <Modal open={resetWorkflowOpen} title="重置演示工作流" description="恢复预警和风险事件的演示处置状态，不影响规则、证据、图谱、组织及业务配置。" confirmText={resettingWorkflow ? '正在重置…' : '确认重置'} danger onClose={() => { if (!resettingWorkflow) setResetWorkflowOpen(false) }} onConfirm={() => void confirmWorkflowReset()}><div className="alert-box danger"><Icon name="warning"/><span>将覆盖当前演示中的转派、解除、升级、整改和复核结果，并重新生成待办及业务消息。</span></div><ul className="plain-list"><li>保留规则测试数据、证据快照和证据子图</li><li>恢复为6个待整改事件、4个待复核事件</li><li>仅保留2个事件逾期，用于验证催办功能</li></ul></Modal>
    <div className={`toast ${toast ? 'show' : ''}`}><Icon name="check"/><span>{toast || '操作成功'}</span></div>
  </div>
}

export default AppEnhanced
