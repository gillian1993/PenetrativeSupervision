import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { RiskEvent, TodoItem, Warning, WorkMessage } from '../types'
import { useAppStore } from '../store'
import { Button, Drawer, Field, FilterGrid, Icon, KeyValue, Modal, PageHeader, Panel, RiskTag, StatCard, StatusTag, Tabs, type IconName } from '../ui'

const pageSize = 4
type SituationTone = 'blue' | 'red' | 'orange' | 'purple' | 'green'


export function WorkbenchPage() {
  const navigate = useNavigate()
  const todos = useAppStore((state) => state.todos)
  const messages = useAppStore((state) => state.messages)
  const transferTodo = useAppStore((state) => state.transferTodo)
  const markMessageRead = useAppStore((state) => state.markMessageRead)
  const markMessageUnread = useAppStore((state) => state.markMessageUnread)
  const markAllMessagesRead = useAppStore((state) => state.markAllMessagesRead)
  const setToast = useAppStore((state) => state.setToast)
  const [cardFilter, setCardFilter] = useState('全部')
  const [draft, setDraft] = useState({ keyword: '', type: '全部', stage: '全部', time: '全部' })
  const [filters, setFilters] = useState(draft)
  const [page, setPage] = useState(1)
  const [transferTarget, setTransferTarget] = useState<TodoItem | null>(null)
  const [transferOwner, setTransferOwner] = useState('李华')
  const [transferReason, setTransferReason] = useState('工作职责调整')
  const [allReadConfirm, setAllReadConfirm] = useState(false)
  const [messageTarget, setMessageTarget] = useState<WorkMessage | null>(null)
  const [loading, setLoading] = useState(false)

  const filteredTodos = useMemo(() => todos.filter((item) => {
    if (cardFilter === '待处理预警' && !(item.type === '预警' && item.stage === '待处理')) return false
    if (cardFilter === '待处理核查' && !(item.type === '核查任务' && item.stage === '核查中')) return false
    if (cardFilter === '核查整改中' && !['风险事件'].includes(item.type)) return false
    if (cardFilter === '待复核' && item.stage !== '待复核') return false
    if (cardFilter === '已逾期' && item.timeState !== '已逾期') return false
    if (filters.type !== '全部' && item.type !== filters.type) return false
    if (filters.stage !== '全部' && item.stage !== filters.stage) return false
    if (filters.time !== '全部' && item.timeState !== filters.time) return false
    return !filters.keyword || `${item.id}${item.title}${item.owner}`.toLowerCase().includes(filters.keyword.toLowerCase())
  }), [todos, cardFilter, filters])
  const totalPages = Math.max(1, Math.ceil(filteredTodos.length / pageSize))
  const rows = filteredTodos.slice((page - 1) * pageSize, page * pageSize)
  const counts = {
    warning: todos.filter((item) => item.type === '预警' && item.stage === '待处理').length,
    verify: todos.filter((item) => item.type === '核查任务').length,
    risk: todos.filter((item) => item.type === '风险事件').length,
    review: todos.filter((item) => item.stage === '待复核').length,
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
    const defaults = { keyword: '', type: '全部', stage: '全部', time: '全部' }
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
  const openMessage = (item: WorkMessage) => {
    setMessageTarget(item)
    markMessageRead(item.id)
  }

  return <>
    <PageHeader eyebrow="监管工作台 / 我的工作" title="监管工作台" description="聚合本人待办、处理统计与业务消息，集中回答“我现在需要处理什么”。" actions={<><span className="updated-time">同一统计快照 · 12:08:32</span><Button icon="refresh" onClick={() => { setLoading(true); window.setTimeout(() => { setLoading(false); setToast('工作台各区域已独立刷新') }, 320) }}>刷新</Button></>}/>
    <section className="stats-grid five workbench-stats">
      <StatCard label="待处理预警" value={counts.warning} helper="点击筛选预警待办" tone="red" icon="warning" active={cardFilter === '待处理预警'} onClick={() => { setCardFilter(cardFilter === '待处理预警' ? '全部' : '待处理预警'); setPage(1) }}/>
      <StatCard label="待处理核查" value={counts.verify} helper="责任人待反馈" tone="orange" icon="clock" active={cardFilter === '待处理核查'} onClick={() => { setCardFilter(cardFilter === '待处理核查' ? '全部' : '待处理核查'); setPage(1) }}/>
      <StatCard label="核查整改中" value={counts.risk} helper="风险事件整改任务" tone="purple" icon="shield" active={cardFilter === '核查整改中'} onClick={() => { setCardFilter(cardFilter === '核查整改中' ? '全部' : '核查整改中'); setPage(1) }}/>
      <StatCard label="待复核" value={counts.review} helper="等待监管复核" tone="blue" icon="check" active={cardFilter === '待复核'} onClick={() => { setCardFilter(cardFilter === '待复核' ? '全部' : '待复核'); setPage(1) }}/>
      <StatCard label="已逾期" value={counts.overdue} helper="需要优先处置" tone="red" icon="clock" active={cardFilter === '已逾期'} onClick={() => { setCardFilter(cardFilter === '已逾期' ? '全部' : '已逾期'); setPage(1) }}/>
    </section>
    <section className="workbench-layout">
      <Panel title="我的待办" subtitle={`查询结果 ${filteredTodos.length} 项，当前第 ${page}/${totalPages} 页`} actions={cardFilter !== '全部' && <button className="filter-chip" onClick={() => setCardFilter('全部')}>{cardFilter}<Icon name="close" size={13}/></button>} className="workbench-todo-panel">
        <div className="workbench-filter">
          <FilterGrid onReset={reset} onSearch={runQuery}>
          <Field label="关键词"><input value={draft.keyword} onChange={(event) => setDraft({ ...draft, keyword: event.target.value })} onKeyDown={(event) => event.key === 'Enter' && runQuery()} placeholder="编号、标题、对象或处理人"/></Field>
          <Field label="对象类型"><select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}><option>全部</option><option>预警</option><option>核查任务</option><option>风险事件</option><option>整改复核</option></select></Field>
          <Field label="当前环节"><select value={draft.stage} onChange={(event) => setDraft({ ...draft, stage: event.target.value })}><option>全部</option><option>待处理</option><option>核查中</option><option>核查整改中</option><option>待复核</option></select></Field>
          <Field label="时限状态"><select value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })}><option>全部</option><option>正常</option><option>临期</option><option>已逾期</option></select></Field>
          </FilterGrid>
        </div>
        {loading ? <div className="table-loading"><i/><span>正在加载本人待办…</span></div> : rows.length === 0 ? <div className="empty-state"><span><Icon name="check"/></span><strong>当前条件下没有待办</strong><p>可调整查询条件或清除统计卡筛选。</p></div> : <div className="table-container compact-table"><table><thead><tr><th>待办编号 / 标题</th><th>类型</th><th>风险等级</th><th>当前环节</th><th>截止时间</th><th>处理人</th><th>操作</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td><button className="table-link title-cell" onClick={() => navigate(item.route)}><strong>{item.title}</strong><span>{item.id}</span></button></td><td><StatusTag>{item.type}</StatusTag></td><td><RiskTag level={item.level}/></td><td><StatusTag>{item.stage}</StatusTag></td><td><span className={`deadline ${item.timeState === '已逾期' ? 'overdue' : item.timeState === '临期' ? 'soon' : ''}`}>{item.dueAt}<small>{item.timeState}</small></span></td><td>{item.owner || '待分配'}</td><td><div className="row-actions"><button onClick={() => navigate(item.route)}>处理</button><button onClick={() => { setTransferTarget(item); setTransferOwner(item.owner === '李华' ? '王宁' : '李华') }}>转派</button></div></td></tr>)}</tbody></table></div>}
        <div className="pagination"><span>共 {filteredTodos.length} 条</span><button disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>{Array.from({ length: totalPages }, (_, index) => <button key={index + 1} className={page === index + 1 ? 'active' : ''} onClick={() => setPage(index + 1)}>{index + 1}</button>)}<button disabled={page === totalPages} onClick={() => setPage(page + 1)}>›</button></div>
      </Panel>
      <Panel title="消息接收框" subtitle={`${messages.filter((item) => item.unread).length} 条未读`} actions={<button className="text-button" disabled={!messages.some((item) => item.unread)} onClick={() => setAllReadConfirm(true)}>全部已读</button>} className="message-panel">
        <div className="message-list">{messages.slice(0, 8).map((item) => <button key={item.id} className={`message-item ${item.unread ? 'unread' : ''}`} onClick={() => openMessage(item)}><span className="message-icon"><Icon name={item.type === '逾期' ? 'clock' : item.type === '预警' ? 'warning' : 'bell'}/></span><span className="message-main"><b><StatusTag>{item.type}</StatusTag>{item.unread && <i/>}</b><strong>{item.title}</strong><small>{item.source} · {item.time}</small></span><Icon name="chevron" size={15}/></button>)}</div>
      </Panel>
    </section>
    <Modal open={!!transferTarget} title="转派待办" description={transferTarget ? `${transferTarget.id} · ${transferTarget.title}` : ''} onClose={() => setTransferTarget(null)} onConfirm={confirmTransfer}><div className="form-stack"><Field label="当前处理人"><input value={transferTarget?.owner || '待分配'} disabled/></Field><Field label="新处理人（必填）"><select value={transferOwner} onChange={(event) => setTransferOwner(event.target.value)}><option>李华</option><option>王宁</option><option>周航</option><option>孙凯</option></select></Field><Field label="转派原因（必填）"><textarea value={transferReason} onChange={(event) => setTransferReason(event.target.value)}/></Field><div className="alert-box"><Icon name="warning"/><span>提交前会重新校验待办状态和候选人有效性，并记录前后处理人。</span></div></div></Modal>
    <Modal open={allReadConfirm} title="全部标记为已读" description={`将处理 ${messages.filter((item) => item.unread).length} 条未读消息。`} onClose={() => setAllReadConfirm(false)} onConfirm={() => { markAllMessagesRead(); setAllReadConfirm(false); setToast('全部消息已标记为已读') }}><p className="drawer-note">消息已读状态会保留，消息本身不会删除，也不会影响待办数量。</p></Modal>
    <Drawer open={!!messageTarget} title={messageTarget?.source || ''} eyebrow={`业务消息 / ${messageTarget?.type || ''}`} onClose={() => setMessageTarget(null)} footer={<><Button onClick={() => { if (messageTarget) markMessageUnread(messageTarget.id); setMessageTarget(null) }}>标记未读</Button><Button variant="primary" onClick={() => { if (messageTarget) navigate(messageTarget.route); setMessageTarget(null) }}>进入来源对象</Button></>}><div className="message-detail"><StatusTag>{messageTarget?.type}</StatusTag><h3>{messageTarget?.title}</h3><p>系统将在进入来源对象前重新校验页面、字段和证据权限。若对象已失效，将保留本条消息元数据并给出明确提示。</p><KeyValue items={[{ label: '来源对象', value: messageTarget?.source }, { label: '发送时间', value: messageTarget?.time }, { label: '当前状态', value: messageTarget?.unread ? '未读' : '已读' }]}/></div></Drawer>
  </>
}

export function SituationPage() {
  const navigate = useNavigate()
  const warnings = useAppStore((state) => state.warnings)
  const events = useAppStore((state) => state.riskEvents)
  const currentScope = useAppStore((state) => state.currentScope)
  const setToast = useAppStore((state) => state.setToast)
  const [tab, setTab] = useState('overview')
  const [draft, setDraft] = useState({ time: '最近30天', org: currentScope, domain: '全部授权领域', level: '全部等级', stage: '全部阶段' })
  const [filters, setFilters] = useState(draft)
  const [loading, setLoading] = useState(false)
  const [metric, setMetric] = useState<string | null>(null)
  const [componentError, setComponentError] = useState(false)
  const visibleWarnings = warnings.filter((item) => (filters.level !== '全部等级' ? filters.level.includes(item.level) : true) && (filters.stage !== '全部阶段' ? filters.stage === item.stage : true))
  const openWarnings = visibleWarnings.filter((item) => !['已解除', '已升级'].includes(item.status))
  const highWarnings = visibleWarnings.filter((item) => ['重大', '高'].includes(item.level))
  const overdue = events.filter((item) => item.overdue && item.status !== '已关闭')
  const closed = visibleWarnings.filter((item) => item.status === '已解除').length + events.filter((item) => item.status === '已关闭').length
  const closure = Math.round(closed / Math.max(1, visibleWarnings.length + events.length) * 1000) / 10
  const query = () => { setLoading(true); window.setTimeout(() => { setFilters(draft); setLoading(false); setToast('全部态势组件已使用同一筛选快照更新') }, 320) }
  const drill = (path: string, source: string) => navigate(`${path}${path.includes('?') ? '&' : '?'}source=${source}&snapshot=202607171200`)
  const metrics: { label: string; value: string | number; helper: string; code: string; tone: SituationTone; icon: IconName; trend: string; trendTone: 'up' | 'down' | 'steady' }[] = [
    { label: '预警总量', value: visibleWarnings.length, helper: '当前筛选范围内去重预警', code: 'warning-total', tone: 'blue', icon: 'situation', trend: '较上期 +8.6%', trendTone: 'up' },
    { label: '重大高风险', value: highWarnings.length, helper: '重大和高风险预警', code: 'warning-high', tone: 'red', icon: 'warning', trend: '需重点关注', trendTone: 'steady' },
    { label: '待处置预警', value: openWarnings.length, helper: '尚未解除或升级', code: 'warning-open', tone: 'orange', icon: 'clock', trend: '较上期 -2', trendTone: 'down' },
    { label: '风险事件', value: events.length, helper: '已升级形成的风险事件', code: 'risk-total', tone: 'purple', icon: 'shield', trend: '本期新增 1', trendTone: 'up' },
    { label: '逾期事项', value: overdue.length, helper: '超过处置截止时间', code: 'risk-overdue', tone: 'red', icon: 'clock', trend: overdue.length ? '需要立即处理' : '暂无逾期', trendTone: overdue.length ? 'up' : 'down' },
    { label: '闭环率', value: `${closure}%`, helper: '已解除预警和已关闭事件', code: 'closure', tone: 'green', icon: 'check', trend: '较上期 +4.2%', trendTone: 'down' },
  ]
  return <>
    <PageHeader eyebrow="监管态势 / 综合分析" title="监管态势" description="在同一统计快照下查看风险规模、趋势、分布和处置进展，并下钻到业务对象。" actions={<><span className="snapshot-label"><i/>统计快照 2026-07-17 12:00</span><Button icon="refresh" onClick={query}>刷新</Button></>}/>
    <div className="page-query page-query-situation">
    <FilterGrid onReset={() => { const value = { time: '最近30天', org: currentScope, domain: '全部授权领域', level: '全部等级', stage: '全部阶段' }; setDraft(value); setFilters(value) }} onSearch={query}>
      <Field label="时间范围"><select value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })}><option>最近7天</option><option>最近30天</option><option>最近90天</option></select></Field>
      <Field label="组织范围"><select value={draft.org} onChange={(event) => setDraft({ ...draft, org: event.target.value })}><option>中国电子云集团</option><option>集团采购中心</option><option>财务共享中心</option></select></Field>
      <Field label="监管领域"><select value={draft.domain} onChange={(event) => setDraft({ ...draft, domain: event.target.value })}><option>全部授权领域</option><option>采购</option><option>合同</option><option>财务</option></select></Field>
      <Field label="风险等级"><select value={draft.level} onChange={(event) => setDraft({ ...draft, level: event.target.value })}><option>全部等级</option><option>重大、高</option><option>中、低</option></select></Field>
      <Field label="预警阶段"><select value={draft.stage} onChange={(event) => setDraft({ ...draft, stage: event.target.value })}><option>全部阶段</option><option>事前</option><option>事中</option><option>事后</option></select></Field>
    </FilterGrid>
    </div>
    <div className="situation-tabs"><Tabs value={tab} onChange={setTab} items={[{ key: 'overview', label: '综合态势' }, { key: 'warning', label: '预警态势' }, { key: 'risk', label: '风险处置态势' }]}/></div>
    {loading ? <div className="dashboard-loading"><i/><strong>正在计算统一统计快照</strong><span>指标、图表和重点事项将同时更新</span></div> : <>
      <section className="situation-metric-grid">{metrics.map((item) => <SituationMetricCard key={item.code} {...item} onClick={() => setMetric(item.code)}/>)}</section>
      {componentError ? <Panel title="态势分析区加载失败" className="component-error"><div className="alert-box danger"><Icon name="warning"/><span>组织风险分布服务响应超时，其他指标仍可正常使用。</span></div><Button onClick={() => setComponentError(false)}>单独重试该组件</Button></Panel> : <section className="situation-dashboard-grid">
        {(tab === 'overview' || tab === 'warning') && <><Panel className="situation-chart-card situation-trend-card" title={tab === 'warning' ? '预警阶段趋势' : '预警趋势'} subtitle={`${filters.time} · 预警数量及变化方向`} actions={<button className="text-button" onClick={() => drill('/risk/warnings', 'trend')}>查看明细</button>}><SituationTrendChart range={filters.time} onClick={() => drill('/risk/warnings', 'trend-chart')}/></Panel><Panel className="situation-chart-card" title="风险等级结构" subtitle="按当前筛选范围实时计算"><RiskLevelChart warnings={visibleWarnings} onClick={(level) => drill(`/risk/warnings?level=${encodeURIComponent(level)}`, 'level-donut')}/></Panel></>}
        {(tab === 'overview' || tab === 'risk') && <><Panel className="situation-chart-card" title="组织风险排行" subtitle="按预警数量排序，点击组织下钻"><OrganizationRiskChart warnings={visibleWarnings} onClick={(label) => drill(`/risk/warnings?org=${encodeURIComponent(label)}`, 'org-bar')}/></Panel><Panel className="situation-chart-card" title="风险处置进展" subtitle="展示事件当前处置阶段"><RiskDispositionChart events={events} onClick={(status) => drill(`/risk/events?status=${encodeURIComponent(status)}`, 'status-bar')}/></Panel></>}
      </section>}
      <Panel title="重点事项" subtitle="重大高风险、逾期事项和重点组织" className="section-panel situation-priority-panel" actions={<button className="text-button situation-diagnostic" onClick={() => setComponentError(true)}>组件诊断</button>}><div className="table-container"><table><thead><tr><th>对象编号 / 标题</th><th>类型</th><th>风险等级</th><th>组织 / 领域</th><th>当前状态</th><th>责任人</th><th>截止时间</th></tr></thead><tbody>{highWarnings.slice(0, 3).map((item) => <tr key={item.id} onClick={() => navigate(`/risk/warnings/${item.id}`)}><td><button className="table-link title-cell"><strong>{item.title}</strong><span>{item.id}</span></button></td><td>预警</td><td><RiskTag level={item.level}/></td><td>{item.organization}</td><td><StatusTag>{item.status}</StatusTag></td><td>{item.owner}</td><td>{item.expectedAt}</td></tr>)}{overdue.slice(0, 2).map((item) => <tr key={item.id} onClick={() => navigate(`/risk/events/${item.id}`)}><td><button className="table-link title-cell"><strong>{item.title}</strong><span>{item.id}</span></button></td><td>风险事件</td><td><RiskTag level={item.level}/></td><td>{item.organization}</td><td><StatusTag>{item.status}</StatusTag></td><td>{item.owner}</td><td><span className="deadline overdue">{item.dueAt}<small>已逾期</small></span></td></tr>)}</tbody></table></div></Panel>
    </>}
    <Drawer open={!!metric} title="指标口径与下钻" eyebrow="监管态势指标" onClose={() => setMetric(null)} footer={<><Button onClick={() => setMetric(null)}>关闭</Button><Button variant="primary" onClick={() => { if (!metric) return; const target = metric.startsWith('risk') || metric === 'closure' ? '/risk/events' : '/risk/warnings'; drill(target, metric); setMetric(null) }}>进入明细</Button></>}><KeyValue items={[{ label: '来源组件', value: metric }, { label: '统计范围', value: `${filters.org} / ${filters.domain}` }, { label: '统计时间', value: '2026-07-17 12:00' }, { label: '计算原则', value: '按授权对象去重，全部组件使用同一快照' }]}/></Drawer>
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
  const statuses = ['核查整改中','待复核','待派发','已关闭']
  const colors = ['#655cf6','#4b82f1','#f59e42','#2fa36b']
  const total = Math.max(1, events.length)
  const data = statuses.map((status, index) => {
    const count = events.filter((event) => event.status === status).length
    return { status, count, color: colors[index], percent: Math.round(count / total * 100) }
  })
  return <div className="situation-disposition"><div className="disposition-overview"><div><span>闭环进展</span><strong>{data.find((item) => item.status === '已关闭')?.percent || 0}%</strong><small>已关闭风险事件占比</small></div><div className="disposition-stack">{data.filter((item) => item.count > 0).map((item) => <button key={item.status} style={{ width: `${item.percent}%`, background: item.color }} onClick={() => onClick(item.status)} aria-label={`${item.status} ${item.count}项`}/>)}</div></div><div className="disposition-list">{data.map((item) => <button key={item.status} onClick={() => onClick(item.status)}><i style={{ background: item.color }}/><span>{item.status}</span><b>{item.count}</b><small>{item.percent}%</small></button>)}</div></div>
}
