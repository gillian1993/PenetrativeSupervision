import { useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AuditPage, DataAccessPage, GraphManagementPage, RolesPage, UsersPage } from './pages/ManagementStatePages'
import { SceneListPage } from './pages/SceneRulePages'
import { SceneEditorWithRuleSelection } from './pages/RuleClosurePages'
import { RuleAssetEditorPage, RuleAssetManagementPage } from './pages/RuleAssetPages'
import { OntologyEditorPage, OntologyListPage } from './pages/OntologyLocalPages'
import { SituationPage, WorkbenchPage } from './pages/OverviewPages'
import { RiskEventDetailPage, RiskEventListPage, WarningDetailPage, WarningListPage } from './pages/RiskPages'
import { useAppStore } from './store'
import { useOntologyStore } from './ontologyMysqlStore'
import { Button, Icon, type IconName } from './ui'
import cloudLogo from './assets/logo-cloud.svg'

interface NavItem { label: string; path: string; permission?: string }
interface NavGroup { id: string; label: string; icon: IconName; path?: string; children?: NavItem[] }

const navGroups: NavGroup[] = [
  { id: 'workbench', label: '监管工作台', icon: 'workbench', path: '/workbench' },
  { id: 'situation', label: '监管态势', icon: 'situation', path: '/situation' },
  { id: 'risk', label: '风险监管', icon: 'shield', children: [{ label: '统一预警', path: '/risk/warnings', permission: '查看统一预警' }, { label: '风险事件', path: '/risk/events', permission: '查看风险事件' }] },
  { id: 'scene', label: '场景与规则', icon: 'rules', children: [{ label: '风险场景', path: '/scenes' }, { label: '规则管理', path: '/rules' }] },
  { id: 'ontology', label: '本体与图谱', icon: 'graph', children: [{ label: '本体管理', path: '/ontology' }, { label: '数据接入', path: '/data-access' }, { label: '图谱管理', path: '/graphs' }] },
  { id: 'system', label: '系统管理', icon: 'system', children: [{ label: '用户与组织', path: '/system/users' }, { label: '角色与权限', path: '/system/roles' }, { label: '审计日志', path: '/system/audit', permission: '查看审计日志' }] },
]

const scopeOptions = ['中国电子云集团', '集团监管部', '集团采购中心', '财务共享中心', '试点事业部']

function AppEnhanced() {
  const navigate = useNavigate()
  const location = useLocation()
  const messages = useAppStore((state) => state.messages)
  const warnings = useAppStore((state) => state.warnings)
  const riskEvents = useAppStore((state) => state.riskEvents)
  const scenes = useAppStore((state) => state.scenes)
  const users = useAppStore((state) => state.users)
  const roles = useAppStore((state) => state.roles)
  const currentScope = useAppStore((state) => state.currentScope)
  const currentRole = useAppStore((state) => state.currentRole)
  const toast = useAppStore((state) => state.toast)
  const setToast = useAppStore((state) => state.setToast)
  const setScope = useAppStore((state) => state.setScope)
  const setCurrentRole = useAppStore((state) => state.setCurrentRole)
  const resetDemo = useAppStore((state) => state.resetDemo)
  const resetOntologies = useOntologyStore((state) => state.resetOntologies)
  const loadOntologies = useOntologyStore((state) => state.loadOntologies)
  const [collapsed, setCollapsed] = useState(false)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [scopeOpen, setScopeOpen] = useState(false)
  const [roleOpen, setRoleOpen] = useState(false)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ risk: true, scene: true, ontology: true, system: true })

  useEffect(() => {
    void loadOntologies().then((result) => { if (!result.ok) setToast(`MySQL本体数据加载失败：${result.message}`) })
  }, [loadOntologies, setToast])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2400)
    return () => window.clearTimeout(timer)
  }, [toast, setToast])

  useEffect(() => {
    setSearchOpen(false)
    setScopeOpen(false)
    setRoleOpen(false)
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

  const chooseScope = (scope: string) => { setScope(scope); setScopeOpen(false); setToast(`监管范围已切换为：${scope}`) }
  const chooseRole = (role: string) => { setCurrentRole(role); setRoleOpen(false); setToast(`当前角色已切换为：${role}`); navigate('/workbench') }

  return <div className={`app-shell ${collapsed ? 'collapsed' : ''}`} onClick={() => { if (scopeOpen) setScopeOpen(false); if (roleOpen) setRoleOpen(false) }}>
    <header className="topbar">
      <button className="brand" onClick={() => navigate('/workbench')} aria-label="返回监管工作台"><img className="brand-logo" src={cloudLogo} alt="中国电子云"/><em/><span>穿透式监管智能应用平台</span></button>
      <nav className="platform-nav"><button>应用开发平台</button><button>模型开发平台</button><button className="active">穿透式监管</button></nav>
      <div className="top-tools">
        <div className="global-search-wrap"><label className="global-search"><Icon name="search" size={17}/><input value={search} onFocus={() => setSearchOpen(true)} onChange={(event) => { setSearch(event.target.value); setSearchOpen(true) }} onKeyDown={(event) => { if (event.key === 'Enter' && searchResults[0]) navigate(searchResults[0].path); if (event.key === 'Escape') setSearchOpen(false) }} placeholder="搜索预警、风险事件、场景、用户"/></label>{searchOpen && search && <div className="global-search-results">{searchResults.length ? <>{searchResults.map((item) => <button key={`${item.type}-${item.id}`} onClick={() => { navigate(item.path); setSearch('') }}><span><b>{item.type}</b><strong>{item.title}</strong></span><small>{item.id} · {item.meta}</small></button>)}<div className="search-result-footer">共显示 {searchResults.length} 条最相关结果</div></> : <div className="search-empty"><Icon name="search"/><span>未找到“{search}”相关内容</span></div>}</div>}</div>
        <button className="top-icon" onClick={() => navigate('/workbench')} aria-label="查看消息"><Icon name="bell"/>{unread > 0 && <b>{unread}</b>}</button>
        <div className="role-switcher" onClick={(event) => event.stopPropagation()}><button className="user-entry" onClick={() => setRoleOpen((value) => !value)}><span>赵</span><div><strong>赵明</strong><small>{currentRole}</small></div><Icon name="chevron" size={14}/></button>{roleOpen && <div className="context-menu role-menu"><header><strong>切换当前角色</strong><span>菜单和高危按钮将按权限刷新</span></header>{roles.filter((item) => item.status === '启用').map((item) => <button key={item.id} className={currentRole === item.name ? 'active' : ''} onClick={() => chooseRole(item.name)}><div><strong>{item.name}</strong><small>{item.scope}</small></div>{currentRole === item.name && <Icon name="check" size={15}/>}</button>)}</div>}</div>
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
      <div className="sidebar-footer"><button onClick={() => setCollapsed((value) => !value)}><Icon name="menu"/><span>{collapsed ? '展开导航' : '收起导航'}</span></button><button onClick={() => { resetDemo(); resetOntologies(); setToast('演示数据已恢复为初始状态') }}><Icon name="refresh"/><span>重置演示数据</span></button></div>
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
      <Route path="/scenes/:id" element={<SceneEditorWithRuleSelection key={location.key}/>}/>
      <Route path="/rules" element={<RuleAssetManagementPage/>}/>
      <Route path="/rules/:id" element={<RuleAssetEditorPage/>}/>
      <Route path="/ontology" element={<OntologyListPage/>}/>
      <Route path="/ontology/:id" element={<OntologyEditorPage/>}/>
      <Route path="/data-access" element={<DataAccessPage/>}/>
      <Route path="/graphs" element={<GraphManagementPage/>}/>
      <Route path="/system/users" element={<UsersPage/>}/>
      <Route path="/system/roles" element={<RolesPage/>}/>
      <Route path="/system/audit" element={<AuditPage/>}/>
      <Route path="*" element={<Navigate to="/workbench" replace/>}/>
    </Routes></div></main>
    <button className="help-fab" onClick={() => setToast('操作提示：从工作台待办进入预警，完成核查、升级和整改闭环')}><Icon name="warning"/><span>操作指引</span></button>
    <div className={`toast ${toast ? 'show' : ''}`}><Icon name="check"/><span>{toast || '操作成功'}</span></div>
  </div>
}

export default AppEnhanced
