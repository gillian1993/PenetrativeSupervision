import { useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import type { RiskEvent, TodoItem, Warning, WorkMessage } from '../types'
import { useAppStore } from '../store'
import { Button, Drawer, Field, FilterGrid, Icon, KeyValue, Modal, PageHeader, Panel, RiskTag, StatCard, StatusTag, Tabs, type IconName } from '../ui'
import { SituationBigScreen } from './SituationBigScreen'
import { inferSituationDomain, SITUATION_DOMAINS } from '../situationDomains'
import { createReturnState, locationPath } from '../navigation'

const pageSize = 4
type SituationTone = 'blue' | 'red' | 'orange' | 'purple' | 'green'

const todoActionLabel = (item: TodoItem) => {
  if (item.objectType === '事件') return item.status === '待复核' ? '复核' : '整改'
  return '研判'
}

const messageIcon = (item: WorkMessage): IconName => {
  if (item.type === '逾期') return 'clock'
  if (item.type === '预警') return 'warning'
  if (item.type === '升级') return 'shield'
  if (item.type === '解除' || item.type === '复核') return 'check'
  if (item.type === '转派') return 'user'
  if (item.type === '整改' || item.type === '退回') return 'file'
  return 'bell'
}

export function WorkbenchPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const todos = useAppStore((state) => state.todos)
  const messages = useAppStore((state) => state.messages)
  const transferTodo = useAppStore((state) => state.transferTodo)
  const markMessageRead = useAppStore((state) => state.markMessageRead)
  const markAllMessagesRead = useAppStore((state) => state.markAllMessagesRead)
  const setToast = useAppStore((state) => state.setToast)
  const [cardFilter, setCardFilter] = useState('全部')
  const [draft, setDraft] = useState({ keyword: '', objectType: '全部', status: '全部', time: '全部' })
  const [filters, setFilters] = useState(draft)
  const [page, setPage] = useState(1)
  const [transferTarget, setTransferTarget] = useState<TodoItem | null>(null)
  const [transferOwner, setTransferOwner] = useState('李华')
  const [transferReason, setTransferReason] = useState('工作职责调整')
  const [allReadConfirm, setAllReadConfirm] = useState(false)
  const [messageTarget, setMessageTarget] = useState<WorkMessage | null>(null)
  const [loading, setLoading] = useState(false)

  const filteredTodos = useMemo(() => todos.filter((item) => {
    if (cardFilter === '待研判预警' && !(item.objectType === '预警' && item.status === '待研判')) return false
    if (cardFilter === '待整改事件' && !(item.objectType === '事件' && item.status === '待整改')) return false
    if (cardFilter === '待复核事件' && !(item.objectType === '事件' && item.status === '待复核')) return false
    if (cardFilter === '已逾期' && item.timeState !== '已逾期') return false
    if (filters.objectType !== '全部' && item.objectType !== filters.objectType) return false
    if (filters.status !== '全部' && item.status !== filters.status) return false
    if (filters.time !== '全部' && item.timeState !== filters.time) return false
    return !filters.keyword || `${item.id}${item.title}${item.objectType}${item.status}${item.owner}`.toLowerCase().includes(filters.keyword.toLowerCase())
  }), [todos, cardFilter, filters])
  const totalPages = Math.max(1, Math.ceil(filteredTodos.length / pageSize))
  const rows = filteredTodos.slice((page - 1) * pageSize, page * pageSize)
  const counts = {
    warning: todos.filter((item) => item.objectType === '预警' && item.status === '待研判').length,
    rectify: todos.filter((item) => item.objectType === '事件' && item.status === '待整改').length,
    review: todos.filter((item) => item.objectType === '事件' && item.status === '待复核').length,
    overdue: todos.filter((item) => item.timeState === '已逾期').length,
  }

  const runQuery = () => {
    setLoading(true)
    window.setTimeout(() => {
      setFilters(draft)
      setPage(1)
      setLoading(false)
      setToast('待办查询完成')
    }, 260)
  }
  const reset = () => {
    const defaults = { keyword: '', objectType: '全部', status: '全部', time: '全部' }
    setDraft(defaults)
    setFilters(defaults)
    setCardFilter('全部')
    setPage(1)
  }
  const confirmTransfer = () => {
    if (!transferTarget) return
    const result = transferTodo(transferTarget.id, transferOwner, transferReason)
    setToast(result.message)
    if (result.ok) setTransferTarget(null)
  }
  const openWorkbenchDetail = (route: string) => navigate(route, { state: createReturnState(locationPath(location), '返回监管工作台') })
  const openMessage = (item: WorkMessage) => {
    setMessageTarget(item)
    markMessageRead(item.id)
  }

  return <>
    <PageHeader eyebrow="监管工作台 / 我的工作" title="监管工作台" description="聚合待研判预警、待整改事件和待复核事件；转派会同步变更来源对象的当前处理人。" actions={<><span className="updated-time">同一工作流快照 · 12:08:32</span><Button icon="refresh" onClick={() => { setLoading(true); window.setTimeout(() => { setLoading(false); setToast('工作台各区域已独立刷新') }, 320) }}>刷新</Button></>}/>
    <section className="stats-grid four workbench-stats">
      <StatCard label="待研判预警" value={counts.warning} helper="需要完成查看、转派、解除或升级" tone="red" icon="warning" active={cardFilter === '待研判预警'} onClick={() => { setCardFilter(cardFilter === '待研判预警' ? '全部' : '待研判预警'); setPage(1) }}/>
      <StatCard label="待整改事件" value={counts.rectify} helper="等待责任人提交整改结果" tone="purple" icon="shield" active={cardFilter === '待整改事件'} onClick={() => { setCardFilter(cardFilter === '待整改事件' ? '全部' : '待整改事件'); setPage(1) }}/>
      <StatCard label="待复核事件" value={counts.review} helper="等待监管人员完成复核" tone="blue" icon="check" active={cardFilter === '待复核事件'} onClick={() => { setCardFilter(cardFilter === '待复核事件' ? '全部' : '待复核事件'); setPage(1) }}/>
      <StatCard label="已逾期" value={counts.overdue} helper="需要优先处置的当前任务" tone="red" icon="clock" active={cardFilter === '已逾期'} onClick={() => { setCardFilter(cardFilter === '已逾期' ? '全部' : '已逾期'); setPage(1) }}/>
    </section>
    <section className="workbench-layout">
      <Panel title="我的待办" subtitle={`查询结果 ${filteredTodos.length} 项，当前第 ${page}/${totalPages} 页`} actions={cardFilter !== '全部' && <button className="filter-chip" onClick={() => setCardFilter('全部')}>{cardFilter}<Icon name="close" size={13}/></button>} className="workbench-todo-panel">
        <div className="workbench-filter">
          <FilterGrid onReset={reset} onSearch={runQuery}>
            <Field label="关键词"><input value={draft.keyword} onChange={(event) => setDraft({ ...draft, keyword: event.target.value })} onKeyDown={(event) => event.key === 'Enter' && runQuery()} placeholder="编号、标题、对象或处理人"/></Field>
            <Field label="对象类型"><select value={draft.objectType} onChange={(event) => setDraft({ ...draft, objectType: event.target.value })}><option>全部</option><option>预警</option><option>事件</option></select></Field>
            <Field label="状态"><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option>全部</option><option>待研判</option><option>待整改</option><option>待复核</option></select></Field>
            <Field label="时限状态"><select value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })}><option>全部</option><option>正常</option><option>临期</option><option>已逾期</option></select></Field>
          </FilterGrid>
        </div>
        {loading ? <div className="table-loading"><i/><span>正在加载本人待办…</span></div> : rows.length === 0 ? <div className="empty-state"><span><Icon name="check"/></span><strong>当前条件下没有待办</strong><p>可调整查询条件或清除统计卡筛选。</p></div> : <div className="table-container compact-table"><table><thead><tr><th>待办编号 / 标题</th><th>对象类型</th><th>风险等级</th><th>状态</th><th>截止时间</th><th>当前处理人</th><th>操作</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td><button className="table-link title-cell" onClick={() => openWorkbenchDetail(item.route)}><strong>{item.title}</strong><span>{item.id}</span></button></td><td><span className={`tag todo-object-tag ${item.objectType === '事件' ? 'event' : 'warning'}`}>{item.objectType}</span></td><td><RiskTag level={item.level}/></td><td><StatusTag>{item.status}</StatusTag></td><td><span className={`deadline ${item.timeState === '已逾期' ? 'overdue' : item.timeState === '临期' ? 'soon' : ''}`}>{item.dueAt}<small>{item.timeState}</small></span></td><td>{item.owner || '待分配'}</td><td><div className="row-actions"><button onClick={() => openWorkbenchDetail(item.route)}>{todoActionLabel(item)}</button><button onClick={() => { setTransferTarget(item); setTransferOwner(item.owner === '李华' ? '王宁' : '李华'); setTransferReason('工作职责调整') }}>转派</button></div></td></tr>)}</tbody></table></div>}
        <div className="pagination"><span>共 {filteredTodos.length} 条</span><button disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>{Array.from({ length: totalPages }, (_, index) => <button key={index + 1} className={page === index + 1 ? 'active' : ''} onClick={() => setPage(index + 1)}>{index + 1}</button>)}<button disabled={page === totalPages} onClick={() => setPage(page + 1)}>›</button></div>
      </Panel>
      <Panel title="消息接收框" subtitle={`${messages.filter((item) => item.unread).length} 条未读`} actions={<button className="text-button" disabled={!messages.some((item) => item.unread)} onClick={() => setAllReadConfirm(true)}>全部已读</button>} className="message-panel">
        <div className="message-list">{messages.slice(0, 8).map((item) => <button key={item.id} className={`message-item ${item.unread ? 'unread' : ''}`} onClick={() => openMessage(item)}><span className="message-icon"><Icon name={messageIcon(item)}/></span><span className="message-main"><b><StatusTag>{item.type}</StatusTag>{item.unread && <i/>}</b><strong>{item.title}</strong><small>{item.source} · {item.time}</small></span><Icon name="chevron" size={15}/></button>)}</div>
      </Panel>
    </section>
    <Modal open={!!transferTarget} title="转派当前任务" description={transferTarget ? `${transferTarget.id} · ${transferTarget.title}` : ''} onClose={() => setTransferTarget(null)} onConfirm={confirmTransfer}><div className="form-stack"><Field label="当前处理人"><input value={transferTarget?.owner || '待分配'} disabled/></Field><Field label="新处理人（必填）"><select value={transferOwner} onChange={(event) => setTransferOwner(event.target.value)}><option>李华</option><option>王宁</option><option>周航</option><option>孙凯</option><option>尹晨阳</option></select></Field><Field label="转派原因"><textarea value={transferReason} onChange={(event) => setTransferReason(event.target.value)} placeholder="可选，说明任务转派原因"/></Field><div className="alert-box"><Icon name="warning"/><span>转派会同步更新来源预警或风险事件的当前处理人，但不会改变业务状态。</span></div></div></Modal>
    <Modal open={allReadConfirm} title="全部标记为已读" description={`将处理 ${messages.filter((item) => item.unread).length} 条未读消息。`} onClose={() => setAllReadConfirm(false)} onConfirm={() => { markAllMessagesRead(); setAllReadConfirm(false); setToast('全部消息已标记为已读') }}><p className="drawer-note">消息已读状态会保留，消息本身不会删除，也不会影响待办数量。</p></Modal>
    <Drawer open={!!messageTarget} title={messageTarget?.source || ''} eyebrow={`业务消息 / ${messageTarget?.type || ''}`} onClose={() => setMessageTarget(null)} footer={<Button variant="primary" onClick={() => { if (messageTarget) openWorkbenchDetail(messageTarget.route); setMessageTarget(null) }}>进入来源对象</Button>}><div className="message-detail"><StatusTag>{messageTarget?.type}</StatusTag><h3>{messageTarget?.title}</h3><p>消息与来源对象共用同一工作流状态。进入详情后可继续当前阶段允许的查看、转派、整改或复核操作。</p><KeyValue items={[{ label: '来源对象', value: messageTarget?.source }, { label: '发送时间', value: messageTarget?.time }, { label: '当前状态', value: messageTarget?.unread ? '未读' : '已读' }]}/></div></Drawer>
  </>
}

export function SituationPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const warnings = useAppStore((state) => state.warnings)
  const events = useAppStore((state) => state.riskEvents)
  const scenes = useAppStore((state) => state.scenes)
  const currentScope = useAppStore((state) => state.currentScope)
  const setToast = useAppStore((state) => state.setToast)
  const [tab, setTab] = useState('overview')
  const [draft, setDraft] = useState({ time: '最近30天', org: currentScope, domain: '全部授权领域', level: '全部等级', stage: '全部阶段' })
  const [filters, setFilters] = useState(draft)
  const [loading, setLoading] = useState(false)
  const [componentError, setComponentError] = useState(false)
  const sceneDomains = useMemo(() => Object.fromEntries(scenes.map((item) => [item.name, item.domain])), [scenes])
  const visibleWarnings = warnings.filter((item) => {
    if (filters.level !== '全部等级' && !filters.level.includes(item.level)) return false
    if (filters.stage !== '全部阶段' && filters.stage !== item.stage) return false
    if (filters.domain !== '全部授权领域' && inferSituationDomain(sceneDomains[item.scene], `${item.scene}${item.title}${item.target}${item.path}`) !== filters.domain) return false
    return true
  })
  const visibleEvents = events.filter((item) => {
    if (filters.level !== '全部等级' && !filters.level.includes(item.level)) return false
    if (filters.domain !== '全部授权领域' && inferSituationDomain(sceneDomains[item.scene], `${item.scene}${item.title}${item.target}`) !== filters.domain) return false
    return true
  })
  const inProgressEvents = visibleEvents.filter((item) => item.status !== '已关闭')
  const majorEvents = inProgressEvents.filter((item) => item.level === '重大')
  const overdue = inProgressEvents.filter((item) => item.overdue)
  const closedEvents = visibleEvents.filter((item) => item.status === '已关闭')
  const onTimeClosed = closedEvents.filter((item) => !item.overdue)
  const onTimeClosure = closedEvents.length ? Math.round(onTimeClosed.length / closedEvents.length * 1000) / 10 : 0
  const highWarnings = visibleWarnings.filter((item) => ['重大', '高'].includes(item.level))
  const openSituationDetail = (route: string) => navigate(route, { state: createReturnState(locationPath(location), '返回监管态势') })
  const query = () => { setLoading(true); window.setTimeout(() => { setFilters(draft); setLoading(false); setToast('全部态势组件已使用同一筛选快照更新') }, 320) }
  const drill = (path: string, source: string) => navigate(`${path}${path.includes('?') ? '&' : '?'}source=${source}&snapshot=202607171200`)
  const drillMetric = (code: string) => {
    const params = new URLSearchParams({
      source: code,
      snapshot: '202607171200',
      period: filters.time,
      scope: filters.org,
      domain: filters.domain === '全部授权领域' ? '全部' : filters.domain,
    })
    const targetOrg = filters.org === '中国电子云集团'
      ? '全部'
      : filters.org === '财务共享中心'
        ? '集团财务共享中心'
        : filters.org
    params.set('org', targetOrg)
    if (code === 'warning-period') {
      params.set('status', '全部')
      params.set('level', filters.level === '全部等级' ? '全部' : filters.level)
      params.set('stage', filters.stage === '全部阶段' ? '全部' : filters.stage)
      navigate(`/risk/warnings?${params.toString()}`)
      return
    }
    params.set('status', code === 'risk-on-time' ? '已关闭' : '未关闭')
    params.set('level', code === 'risk-major' ? '重大' : filters.level === '全部等级' ? '全部' : filters.level)
    params.set('overdue', code === 'risk-overdue' ? '是' : code === 'risk-on-time' ? '否' : '全部')
    if (code === 'risk-on-time') params.set('timeliness', '按期')
    navigate(`/risk/events?${params.toString()}`)
  }
  const bigScreenOpen = searchParams.get('view') === 'bi'
  const setBigScreenOpen = (open: boolean) => {
    const next = new URLSearchParams(searchParams)
    if (open) next.set('view', 'bi')
    else next.delete('view')
    setSearchParams(next, { replace: true })
  }
  const metrics: { label: string; value: string | number; helper: string; code: string; tone: SituationTone; icon: IconName; trend: string; trendTone: 'up' | 'down' | 'steady' }[] = [
    { label: '本期预警总量', value: visibleWarnings.length, helper: `${filters.time}内新产生预警`, code: 'warning-period', tone: 'blue', icon: 'situation', trend: '较上期 +8.6%', trendTone: 'up' },
    { label: '在办风险事件', value: inProgressEvents.length, helper: '当前尚未关闭的风险事件', code: 'risk-active', tone: 'purple', icon: 'shield', trend: '环比 +20%', trendTone: 'up' },
    { label: '重大风险事件', value: majorEvents.length, helper: '未关闭且风险等级为重大', code: 'risk-major', tone: 'red', icon: 'warning', trend: '需重点关注', trendTone: 'steady' },
    { label: '逾期风险事件', value: overdue.length, helper: '未关闭且超过处置期限', code: 'risk-overdue', tone: 'orange', icon: 'clock', trend: overdue.length ? '需要立即处置' : '当前无逾期', trendTone: overdue.length ? 'up' : 'down' },
    { label: '按期闭环率', value: `${onTimeClosure}%`, helper: '本期按期关闭 / 全部关闭', code: 'risk-on-time', tone: 'green', icon: 'check', trend: '目标 ≥90%', trendTone: onTimeClosure >= 90 ? 'down' : 'steady' },
  ]
  return <>
    <PageHeader eyebrow="监管态势 / 综合分析" title="监管态势" description="在同一统计快照下查看风险规模、趋势、分布和处置进展，并下钻到业务对象。" actions={<><div className="situation-view-switch" role="group" aria-label="监管态势视图切换"><button className="active">分析视图</button><button onClick={() => setBigScreenOpen(true)}><Icon name="situation" size={15}/>BI大屏</button></div><span className="snapshot-label"><i/>统计快照 2026-07-17 12:00</span><Button icon="refresh" onClick={query}>刷新</Button></>}/>
    <div className="page-query page-query-situation">
    <FilterGrid onReset={() => { const value = { time: '最近30天', org: currentScope, domain: '全部授权领域', level: '全部等级', stage: '全部阶段' }; setDraft(value); setFilters(value) }} onSearch={query}>
      <Field label="时间范围"><select value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })}><option>最近7天</option><option>最近30天</option><option>最近90天</option></select></Field>
      <Field label="组织范围"><select value={draft.org} onChange={(event) => setDraft({ ...draft, org: event.target.value })}><option>中国电子云集团</option><option>集团采购中心</option><option>财务共享中心</option></select></Field>
      <Field label="监管领域"><select value={draft.domain} onChange={(event) => setDraft({ ...draft, domain: event.target.value })}><option>全部授权领域</option>{SITUATION_DOMAINS.map((item) => <option key={item.key}>{item.key}</option>)}</select></Field>
      <Field label="风险等级"><select value={draft.level} onChange={(event) => setDraft({ ...draft, level: event.target.value })}><option>全部等级</option><option>重大、高</option><option>中、低</option></select></Field>
      <Field label="预警阶段"><select value={draft.stage} onChange={(event) => setDraft({ ...draft, stage: event.target.value })}><option>全部阶段</option><option>事前</option><option>事中</option><option>事后</option></select></Field>
    </FilterGrid>
    </div>
    <div className="situation-tabs"><Tabs value={tab} onChange={setTab} items={[{ key: 'overview', label: '综合态势' }, { key: 'warning', label: '预警态势' }, { key: 'risk', label: '风险处置态势' }]}/></div>
    {loading ? <div className="dashboard-loading"><i/><strong>正在计算统一统计快照</strong><span>指标、图表和重点事项将同时更新</span></div> : <>
      <section className="situation-metric-grid">{metrics.map((item) => <SituationMetricCard key={item.code} {...item} onClick={() => drillMetric(item.code)}/>)}</section>
      {componentError ? <Panel title="态势分析区加载失败" className="component-error"><div className="alert-box danger"><Icon name="warning"/><span>组织风险分布服务响应超时，其他指标仍可正常使用。</span></div><Button onClick={() => setComponentError(false)}>单独重试该组件</Button></Panel> : <section className="situation-dashboard-grid">
        {(tab === 'overview' || tab === 'warning') && <><Panel className="situation-chart-card situation-trend-card" title={tab === 'warning' ? '预警阶段趋势' : '预警趋势'} subtitle={`${filters.time} · 预警数量及变化方向`} actions={<button className="text-button" onClick={() => drill('/risk/warnings', 'trend')}>查看明细</button>}><SituationTrendChart range={filters.time} onClick={() => drill('/risk/warnings', 'trend-chart')}/></Panel><Panel className="situation-chart-card" title="风险等级结构" subtitle="按当前筛选范围实时计算"><RiskLevelChart warnings={visibleWarnings} onClick={(level) => drill(`/risk/warnings?level=${encodeURIComponent(level)}`, 'level-donut')}/></Panel></>}
        {(tab === 'overview' || tab === 'risk') && <><Panel className="situation-chart-card" title="组织风险排行" subtitle="按预警数量排序，点击组织下钻"><OrganizationRiskChart warnings={visibleWarnings} onClick={(label) => drill(`/risk/warnings?org=${encodeURIComponent(label)}`, 'org-bar')}/></Panel><Panel className="situation-chart-card" title="风险处置进展" subtitle="展示事件当前处置阶段"><RiskDispositionChart events={visibleEvents} onClick={(status) => drill(`/risk/events?status=${encodeURIComponent(status)}`, 'status-bar')}/></Panel></>}
      </section>}
      <Panel title="重点事项" subtitle="重大高风险、逾期事项和重点组织" className="section-panel situation-priority-panel" actions={<button className="text-button situation-diagnostic" onClick={() => setComponentError(true)}>组件诊断</button>}><div className="table-container"><table><thead><tr><th>对象编号 / 标题</th><th>类型</th><th>风险等级</th><th>组织 / 领域</th><th>当前状态</th><th>责任人</th><th>截止时间</th></tr></thead><tbody>{highWarnings.slice(0, 3).map((item) => <tr key={item.id} onClick={() => openSituationDetail(`/risk/warnings/${item.id}`)}><td><button className="table-link title-cell"><strong>{item.title}</strong><span>{item.id}</span></button></td><td>预警</td><td><RiskTag level={item.level}/></td><td>{item.organization}</td><td><StatusTag>{item.status}</StatusTag></td><td>{item.owner}</td><td>{item.expectedAt}</td></tr>)}{overdue.slice(0, 2).map((item) => <tr key={item.id} onClick={() => openSituationDetail(`/risk/events/${item.id}`)}><td><button className="table-link title-cell"><strong>{item.title}</strong><span>{item.id}</span></button></td><td>风险事件</td><td><RiskTag level={item.level}/></td><td>{item.organization}</td><td><StatusTag>{item.status}</StatusTag></td><td>{item.owner}</td><td><span className="deadline overdue">{item.dueAt}<small>已逾期</small></span></td></tr>)}</tbody></table></div></Panel>
    </>}
    {bigScreenOpen && <SituationBigScreen
      warnings={visibleWarnings}
      events={visibleEvents}
      sceneDomains={sceneDomains}
      currentScope={filters.org}
      initialDomain={filters.domain !== '全部授权领域' ? filters.domain : undefined}
      onExit={() => setBigScreenOpen(false)}
      onNavigate={(path) => { setBigScreenOpen(false); navigate(path, { state: createReturnState(locationPath(location), '返回监管态势大屏') }) }}
    />}
  </>
}

function SituationMetricCard({ label, value, helper, tone, icon, trend, trendTone, onClick }: { label: string; value: string | number; helper: string; tone: SituationTone; icon: IconName; trend: string; trendTone: 'up' | 'down' | 'steady'; onClick: () => void }) {
  return <button className={`situation-metric-card ${tone}`} onClick={onClick}><span className="situation-metric-icon"><Icon name={icon} size={19}/></span><span className="situation-metric-label">{label}</span><strong>{value}</strong><span className="situation-metric-helper">{helper}</span><span className={`situation-metric-trend ${trendTone}`}>{trend}</span><i/></button>
}

function SituationTrendChart({ range, onClick }: { range: string; onClick: () => void }) {
  const series = range === '最近7天' ? [2,3,2,4,3,5,4] : range === '最近90天' ? [3,4,3,5,4,6,5,7,6,8,7,9] : [2,3,2,5,4,6,5,7,6,8,7,9]
  const labels = range === '最近7天' ? ['07-11','07-12','07-13','07-14','07-15','07-16','07-17'] : ['06-18','','06-24','','06-30','','07-06','','07-12','','','07-17']
  const width = 720
  const height = 236
  const left = 42
  const right = 18
  const top = 18
  const bottom = 34
  const max = Math.max(10, ...series)
  const chartWidth = width - left - right
  const chartHeight = height - top - bottom
  const points = series.map((value, index) => {
    const x = left + chartWidth * index / Math.max(1, series.length - 1)
    const y = top + chartHeight * (1 - value / max)
    return { x, y, value, label: labels[index] || '' }
  })
  const pointText = points.map((point) => `${point.x},${point.y}`).join(' ')
  const areaText = `${left},${top + chartHeight} ${pointText} ${left + chartWidth},${top + chartHeight}`
  const last = series[series.length - 1]
  const previous = series[series.length - 2]
  const change = previous ? Math.round((last - previous) / previous * 100) : 0
  return <button className="situation-trend-chart" onClick={onClick} aria-label="查看预警趋势明细"><div className="situation-chart-summary"><div><span>最近周期新增</span><strong>{last}</strong></div><span className={change >= 0 ? 'rise' : 'fall'}>{change >= 0 ? '↑' : '↓'} {Math.abs(change)}%</span><small>峰值 {Math.max(...series)} · 日均 {(series.reduce((sum, value) => sum + value, 0) / series.length).toFixed(1)}</small></div><svg viewBox={`0 0 ${width} ${height}`} className="situation-line-chart">{[0,.25,.5,.75,1].map((ratio) => { const y = top + chartHeight * ratio; return <g key={ratio}><line x1={left} x2={left + chartWidth} y1={y} y2={y} className="situation-grid-line"/><text x={left - 12} y={y + 4} textAnchor="end">{Math.round(max * (1 - ratio))}</text></g> })}<defs><linearGradient id="situationTrendArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3979f6" stopOpacity=".28"/><stop offset="100%" stopColor="#3979f6" stopOpacity=".02"/></linearGradient><linearGradient id="situationTrendStroke" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#4b8df8"/><stop offset="100%" stopColor="#655cf6"/></linearGradient></defs><polygon points={areaText} fill="url(#situationTrendArea)"/><polyline points={pointText} className="situation-trend-line"/>{points.map((point, index) => <g key={index}><circle cx={point.x} cy={point.y} r="4.5" className="situation-trend-dot"><title>{point.label || `第${index + 1}期`}：{point.value}</title></circle>{point.label && <text x={point.x} y={height - 9} textAnchor="middle" className="situation-axis-label">{point.label}</text>}</g>)}</svg></button>
}

function RiskLevelChart({ warnings, onClick }: { warnings: Warning[]; onClick: (level: string) => void }) {
  const definitions = [
    { level: '重大', color: '#e5484d' },
    { level: '高', color: '#f08c46' },
    { level: '中', color: '#f2bd42' },
    { level: '低', color: '#4b82f1' },
  ]
  const total = Math.max(1, warnings.length)
  let cursor = 0
  const data = definitions.map((item) => {
    const count = warnings.filter((warning) => warning.level === item.level).length
    const start = cursor
    cursor += count / total * 100
    return { ...item, count, start, end: cursor, percent: Math.round(count / total * 100) }
  })
  const gradient = warnings.length ? `conic-gradient(${data.map((item) => `${item.color} ${item.start}% ${item.end}%`).join(',')})` : '#edf1f7'
  return <div className="situation-donut-layout"><button className="situation-donut" style={{ background: gradient }} onClick={() => onClick('全部等级')} aria-label="查看全部风险等级"><span><strong>{warnings.length}</strong><small>预警总量</small></span></button><div className="situation-legend">{data.map((item) => <button key={item.level} onClick={() => onClick(item.level)}><i style={{ background: item.color }}/><span><strong>{item.level === '高' ? '高风险' : `${item.level}风险`}</strong><small>占比 {item.percent}%</small></span><b>{item.count}</b></button>)}</div></div>
}

function OrganizationRiskChart({ warnings, onClick }: { warnings: Warning[]; onClick: (label: string) => void }) {
  const counts = warnings.reduce<Record<string, number>>((result, item) => ({ ...result, [item.organization]: (result[item.organization] || 0) + 1 }), {})
  const data = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const max = Math.max(1, ...data.map((item) => item[1]))
  const total = Math.max(1, warnings.length)
  return <div className="situation-rank-list">{data.map(([label, count], index) => <button key={label} onClick={() => onClick(label)}><span className={`rank rank-${index + 1}`}>{index + 1}</span><span className="rank-copy"><strong>{label}</strong><i><em style={{ width: `${count / max * 100}%` }}/></i></span><span className="rank-value"><b>{count}</b><small>{Math.round(count / total * 100)}%</small></span></button>)}</div>
}

function RiskDispositionChart({ events, onClick }: { events: RiskEvent[]; onClick: (status: string) => void }) {
  const statuses = ['待整改','待复核','已关闭']
  const colors = ['#655cf6','#4b82f1','#2fa36b']
  const total = Math.max(1, events.length)
  const data = statuses.map((status, index) => {
    const count = events.filter((event) => event.status === status).length
    return { status, count, color: colors[index], percent: Math.round(count / total * 100) }
  })
  return <div className="situation-disposition"><div className="disposition-overview"><div><span>闭环进展</span><strong>{data.find((item) => item.status === '已关闭')?.percent || 0}%</strong><small>已关闭风险事件占比</small></div><div className="disposition-stack">{data.filter((item) => item.count > 0).map((item) => <button key={item.status} style={{ width: `${item.percent}%`, background: item.color }} onClick={() => onClick(item.status)} aria-label={`${item.status} ${item.count}项`}/>)}</div></div><div className="disposition-list">{data.map((item) => <button key={item.status} onClick={() => onClick(item.status)}><i style={{ background: item.color }}/><span>{item.status}</span><b>{item.count}</b><small>{item.percent}%</small></button>)}</div></div>
}
