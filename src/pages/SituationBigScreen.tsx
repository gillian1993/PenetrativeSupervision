import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { RiskEvent, RiskLevel, Warning } from '../types'
import { Icon } from '../ui'
import { inferSituationDomain, SITUATION_DOMAINS, type SituationDomainKey } from '../situationDomains'
import '../situationBigScreen.css'

type DomainStat = (typeof SITUATION_DOMAINS)[number] & {
  warnings: Warning[]
  events: RiskEvent[]
  total: number
  major: number
  high: number
  overdue: number
  open: number
  closure: number
  score: number
}

type FocusRisk = {
  id: string
  title: string
  type: '预警' | '风险事件'
  level: RiskLevel
  status: string
  domain: SituationDomainKey
  target: string
  owner: string
  time: string
  route: string
}

interface SituationBigScreenProps {
  warnings: Warning[]
  events: RiskEvent[]
  sceneDomains: Record<string, string>
  currentScope: string
  initialDomain?: string
  onExit: () => void
  onNavigate: (path: string) => void
}

const riskWeight: Record<RiskLevel, number> = { 重大: 12, 高: 7, 中: 3, 低: 1 }
const riskOrder: Record<RiskLevel, number> = { 重大: 0, 高: 1, 中: 2, 低: 3 }

const riskTone = (item: DomainStat) => item.major > 0 ? 'critical' : item.high > 0 ? 'high' : item.total > 0 ? 'medium' : 'quiet'

const formatNumber = (value: number) => value.toLocaleString('zh-CN')

export function SituationBigScreen({ warnings, events, sceneDomains, currentScope, initialDomain, onExit, onNavigate }: SituationBigScreenProps) {
  const initial = SITUATION_DOMAINS.some((item) => item.key === initialDomain) ? initialDomain as SituationDomainKey : null
  const [selectedDomain, setSelectedDomain] = useState<SituationDomainKey | null>(initial)
  const [patrol, setPatrol] = useState(false)
  const [fullScreen, setFullScreen] = useState(Boolean(document.fullscreenElement))
  const [now, setNow] = useState(new Date())
  const [focusRisk, setFocusRisk] = useState<FocusRisk | null>(null)

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    const onFullscreenChange = () => setFullScreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => {
      document.body.style.overflow = previous
      window.clearInterval(timer)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
    }
  }, [])

  useEffect(() => {
    if (!patrol) return
    const timer = window.setInterval(() => {
      setSelectedDomain((current) => {
        if (!current) return SITUATION_DOMAINS[0].key
        const index = SITUATION_DOMAINS.findIndex((item) => item.key === current)
        return SITUATION_DOMAINS[(index + 1) % SITUATION_DOMAINS.length].key
      })
    }, 8000)
    return () => window.clearInterval(timer)
  }, [patrol])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.fullscreenElement || focusRisk) return
      onExit()
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [focusRisk, onExit])

  const domainForWarning = (item: Warning) => inferSituationDomain(sceneDomains[item.scene], `${item.scene}${item.title}${item.target}${item.path}`)
  const domainForEvent = (item: RiskEvent) => inferSituationDomain(sceneDomains[item.scene], `${item.scene}${item.title}${item.target}`)

  const domainStats = useMemo<DomainStat[]>(() => SITUATION_DOMAINS.map((domain) => {
    const domainWarnings = warnings.filter((item) => inferSituationDomain(sceneDomains[item.scene], `${item.scene}${item.title}${item.target}${item.path}`) === domain.key)
    const domainEvents = events.filter((item) => inferSituationDomain(sceneDomains[item.scene], `${item.scene}${item.title}${item.target}`) === domain.key)
    const major = domainWarnings.filter((item) => item.level === '重大').length + domainEvents.filter((item) => item.level === '重大').length
    const high = domainWarnings.filter((item) => item.level === '高').length + domainEvents.filter((item) => item.level === '高').length
    const overdue = domainEvents.filter((item) => item.overdue && item.status !== '已关闭').length
    const open = domainWarnings.filter((item) => !['已解除', '已升级'].includes(item.status)).length + domainEvents.filter((item) => item.status !== '已关闭').length
    const closed = domainWarnings.filter((item) => item.status === '已解除').length + domainEvents.filter((item) => item.status === '已关闭').length
    const total = domainWarnings.length + domainEvents.length
    const score = domainWarnings.reduce((sum, item) => sum + riskWeight[item.level], 0) + domainEvents.reduce((sum, item) => sum + riskWeight[item.level] + (item.overdue ? 6 : 0), 0)
    return { ...domain, warnings: domainWarnings, events: domainEvents, total, major, high, overdue, open, closure: Math.round(closed / Math.max(1, total) * 100), score }
  }), [events, sceneDomains, warnings])

  const activeWarnings = selectedDomain ? warnings.filter((item) => domainForWarning(item) === selectedDomain) : warnings
  const activeEvents = selectedDomain ? events.filter((item) => domainForEvent(item) === selectedDomain) : events
  const activeOpenEvents = activeEvents.filter((item) => item.status !== '已关闭')
  const majorEvents = activeOpenEvents.filter((item) => item.level === '重大')
  const overdue = activeOpenEvents.filter((item) => item.overdue).length
  const closedEvents = activeEvents.filter((item) => item.status === '已关闭')
  const onTimeClosed = closedEvents.filter((item) => !item.overdue)
  const onTimeClosure = closedEvents.length ? Math.round(onTimeClosed.length / closedEvents.length * 1000) / 10 : 0
  const activeDefinition = selectedDomain ? SITUATION_DOMAINS.find((item) => item.key === selectedDomain) : null
  const monitoringCoverage = selectedDomain ? activeDefinition?.coverage || 0 : SITUATION_DOMAINS.reduce((sum, item) => sum + item.coverage, 0)
  const quietDomains = domainStats.filter((item) => item.total === 0).length

  const metrics = [
    { label: '本期预警总量', value: activeWarnings.length, unit: '条', tone: 'blue', helper: '当前统计周期新增预警' },
    { label: '在办风险事件', value: activeOpenEvents.length, unit: '项', tone: 'purple', helper: `本期新增 ${activeEvents.length}项 · 环比 +20%` },
    { label: '重大风险事件', value: majorEvents.length, unit: '项', tone: 'red', helper: '未关闭且风险等级为重大' },
    { label: '逾期风险事件', value: overdue, unit: '项', tone: 'orange', helper: overdue ? '需要立即处置' : '当前无逾期' },
    { label: '按期闭环率', value: onTimeClosure, unit: '%', tone: 'green', helper: '本期按期关闭 / 全部关闭' },
  ]

  const focusRisks = useMemo<FocusRisk[]>(() => [
    ...activeWarnings.map((item) => ({ id: item.id, title: item.title, type: '预警' as const, level: item.level, status: item.status, domain: domainForWarning(item), target: item.target, owner: item.owner, time: item.expectedAt, route: `/risk/warnings/${item.id}` })),
    ...activeEvents.map((item) => ({ id: item.id, title: item.title, type: '风险事件' as const, level: item.level, status: item.status, domain: domainForEvent(item), target: item.target, owner: item.owner, time: item.dueAt, route: `/risk/events/${item.id}` })),
  ].sort((a, b) => riskOrder[a.level] - riskOrder[b.level]).slice(0, 5), [activeEvents, activeWarnings, sceneDomains])

  const rankedDomains = [...domainStats].sort((a, b) => b.score - a.score || b.total - a.total)

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  }

  const exit = async () => {
    if (document.fullscreenElement) await document.exitFullscreen()
    onExit()
  }
  const enterDetail = async (path: string) => {
    if (document.fullscreenElement) await document.exitFullscreen()
    onNavigate(path)
  }


  const snapshotDate = now.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
  const snapshotTime = now.toLocaleTimeString('zh-CN', { hour12: false })

  return createPortal(<div className="bi-screen" role="dialog" aria-modal="true" aria-label="监管态势BI大屏">
    <div className="bi-grid-background"/>
    <header className="bi-header">
      <div className="bi-header-side bi-header-context"><span className="bi-live-dot"/><div><small>当前监管范围</small><strong>{currentScope}</strong></div></div>
      <div className="bi-title"><span/><div><small>PENETRATIVE SUPERVISION</small><h1>穿透式监管态势总览</h1><p>{activeDefinition ? `${activeDefinition.label}专题态势` : '十大领域综合态势'}</p></div><span/></div>
      <div className="bi-header-side bi-header-actions">
        <button className={patrol ? 'active' : ''} onClick={() => setPatrol((value) => !value)}><Icon name={patrol ? 'close' : 'refresh'} size={15}/>{patrol ? '停止巡航' : '演示巡航'}</button>
        <button onClick={() => void toggleFullscreen()}><Icon name={fullScreen ? 'close' : 'eye'} size={15}/>{fullScreen ? '退出全屏' : '全屏展示'}</button>
        <button className="exit" onClick={() => void exit()}><Icon name="close" size={15}/>返回分析</button>
      </div>
    </header>

    <section className="bi-metric-row">
      {metrics.map((item) => <article className={`bi-metric ${item.tone}`} key={item.label}><span>{item.label}</span><div><strong>{item.value}</strong><b>{item.unit}</b></div><small>{item.helper}</small><i/></article>)}
    </section>

    <main className="bi-main-grid">
      <div className="bi-side-column">
        <BiPanel title="预警发展趋势" subtitle={selectedDomain ? `${selectedDomain}领域 · 最近30天` : '十大领域 · 最近30天'}><BigTrendChart count={activeWarnings.length} trend={activeDefinition?.trend || 8.6}/></BiPanel>
        <BiPanel title="风险等级结构" subtitle="当前统计范围"><RiskLevelStructure warnings={activeWarnings} events={activeEvents}/></BiPanel>
      </div>

      <BiPanel title="十大领域风险星环" subtitle="点击领域联动全屏数据" className="bi-star-panel" actions={selectedDomain && <button className="bi-panel-action" onClick={() => setSelectedDomain(null)}>返回十大领域</button>}>
        <DomainStarRing stats={domainStats} selected={selectedDomain} onSelect={(domain) => { setPatrol(false); setSelectedDomain(domain === selectedDomain ? null : domain) }}/>
      </BiPanel>

      <div className="bi-side-column">
        <BiPanel title="重大风险动态" subtitle={`${focusRisks.length}项重点关注`}><div className="bi-risk-list">{focusRisks.length ? focusRisks.map((item) => <button key={`${item.type}-${item.id}`} onClick={() => setFocusRisk(item)}><span className={`bi-risk-level level-${item.level}`}>{item.level}</span><span><strong>{item.title}</strong><small>{item.domain} · {item.type} · {item.status}</small></span><b>›</b></button>) : <div className="bi-stable-state"><Icon name="check" size={28}/><strong>当前领域态势平稳</strong><span>暂无需要重点关注的风险事项</span></div>}</div></BiPanel>
        <BiPanel title="风险处置进展" subtitle="风险事件闭环阶段"><DispositionProgress events={activeEvents}/></BiPanel>
      </div>
    </main>

    <section className="bi-bottom-grid">
      <BiPanel title="十大领域风险排行" subtitle="综合风险指数"><DomainRanking stats={rankedDomains}/></BiPanel>
      <BiPanel title="领域风险热力矩阵" subtitle="风险规模、严重度、趋势与处置压力"><DomainHeatMatrix stats={domainStats}/></BiPanel>
      <BiPanel title="监管运行成效" subtitle="当前快照覆盖情况"><div className="bi-outcome-grid"><div><span>监测对象</span><strong>{formatNumber(monitoringCoverage)}</strong><small>当前统计范围</small></div><div><span>平稳领域</span><strong>{quietDomains}</strong><small>暂无风险触发</small></div><div><span>重点领域</span><strong>{domainStats.filter((item) => item.major > 0 || item.high > 0).length}</strong><small>存在重大高风险</small></div><div><span>按期闭环率</span><strong>{onTimeClosure}%</strong><small>目标 ≥90%</small></div></div></BiPanel>
    </section>

    <footer className="bi-footer">
      <div><span className="bi-live-dot"/><b>实时播报</b></div>
      <div className="bi-ticker"><span>{focusRisks.length ? focusRisks.map((item) => `${item.domain}领域：${item.title}（${item.level}）`).join('　　◆　　') : '十大监管领域运行平稳，当前未发现重大高风险事项。'}</span></div>
      <time>{snapshotDate} {snapshotTime}<small>统计快照实时更新</small></time>
    </footer>

    {focusRisk && <div className="bi-risk-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setFocusRisk(null) }}><section className="bi-risk-detail"><header><div><span className={`bi-risk-level level-${focusRisk.level}`}>{focusRisk.level}</span><small>{focusRisk.domain}领域 · {focusRisk.type}</small></div><button onClick={() => setFocusRisk(null)} aria-label="关闭"><Icon name="close"/></button></header><h2>{focusRisk.title}</h2><div className="bi-risk-detail-grid"><div><span>对象编号</span><strong>{focusRisk.id}</strong></div><div><span>当前状态</span><strong>{focusRisk.status}</strong></div><div><span>风险对象</span><strong>{focusRisk.target}</strong></div><div><span>当前责任人</span><strong>{focusRisk.owner || '待分配'}</strong></div><div><span>处置时限</span><strong>{focusRisk.time}</strong></div><div><span>统计快照</span><strong>{snapshotDate} {snapshotTime}</strong></div></div><footer><button onClick={() => setFocusRisk(null)}>留在大屏</button><button className="primary" onClick={() => void enterDetail(focusRisk.route)}>进入业务详情</button></footer></section></div>}
  </div>, document.body)
}

function BiPanel({ title, subtitle, actions, className = '', children }: { title: string; subtitle: string; actions?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return <section className={`bi-panel ${className}`}><header><div><h2>{title}</h2><p>{subtitle}</p></div>{actions}</header><div className="bi-panel-body">{children}</div><i className="corner top-left"/><i className="corner top-right"/><i className="corner bottom-left"/><i className="corner bottom-right"/></section>
}

function BigTrendChart({ count, trend }: { count: number; trend: number }) {
  const base = [0.42, 0.55, 0.48, 0.67, 0.59, 0.76, 0.71, 0.88, 0.79, 0.94, 0.86, 1]
  const maxValue = Math.max(4, count + 3)
  const series = base.map((ratio, index) => Math.max(0, Math.round(ratio * maxValue + (index % 3 === 0 ? 1 : 0))))
  const width = 420
  const height = 142
  const left = 24
  const top = 12
  const bottom = 22
  const points = series.map((value, index) => ({ x: left + index * (width - left * 2) / (series.length - 1), y: top + (height - top - bottom) * (1 - value / Math.max(...series, 1)) }))
  const pointText = points.map((item) => `${item.x},${item.y}`).join(' ')
  const areaText = `${left},${height - bottom} ${pointText} ${width - left},${height - bottom}`
  return <div className="bi-trend"><div className="bi-chart-summary"><div><span>本期新增</span><strong>{count}</strong></div><b className={trend >= 0 ? 'rise' : 'fall'}>{trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%</b><small>峰值 {Math.max(...series)} · 日均 {(series.reduce((sum, value) => sum + value, 0) / series.length).toFixed(1)}</small></div><svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"><defs><linearGradient id="biTrendArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2edcff" stopOpacity=".38"/><stop offset="1" stopColor="#2edcff" stopOpacity="0"/></linearGradient><linearGradient id="biTrendLine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#22d6ff"/><stop offset="1" stopColor="#7b73ff"/></linearGradient></defs>{[.2,.5,.8].map((ratio) => <line key={ratio} x1={left} x2={width - left} y1={top + (height - top - bottom) * ratio} y2={top + (height - top - bottom) * ratio}/>) }<polygon points={areaText} fill="url(#biTrendArea)"/><polyline points={pointText} fill="none" stroke="url(#biTrendLine)"/>{points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={index === points.length - 1 ? 4 : 2}/>)}</svg><div className="bi-chart-axis"><span>06-18</span><span>06-28</span><span>07-08</span><span>07-17</span></div></div>
}

function RiskLevelStructure({ warnings, events }: { warnings: Warning[]; events: RiskEvent[] }) {
  const levels: { key: RiskLevel; color: string }[] = [{ key: '重大', color: '#ff536b' }, { key: '高', color: '#ff9855' }, { key: '中', color: '#ffd166' }, { key: '低', color: '#38c8ff' }]
  const total = warnings.length + events.length
  let cursor = 0
  const data = levels.map((level) => {
    const count = warnings.filter((item) => item.level === level.key).length + events.filter((item) => item.level === level.key).length
    const start = cursor
    cursor += count / Math.max(1, total) * 100
    return { ...level, count, start, end: cursor, percent: Math.round(count / Math.max(1, total) * 100) }
  })
  const gradient = total ? `conic-gradient(${data.map((item) => `${item.color} ${item.start}% ${item.end}%`).join(',')})` : 'conic-gradient(#17324c 0 100%)'
  return <div className="bi-risk-structure"><div className="bi-risk-donut" style={{ background: gradient }}><span><strong>{total}</strong><small>风险总量</small></span></div><div>{data.map((item) => <article key={item.key}><i style={{ background: item.color }}/><span><b>{item.key}风险</b><small>{item.percent}%</small></span><strong>{item.count}</strong></article>)}</div></div>
}

function DomainStarRing({ stats, selected, onSelect }: { stats: DomainStat[]; selected: SituationDomainKey | null; onSelect: (domain: SituationDomainKey) => void }) {
  const positions = stats.map((_, index) => {
    const angle = (-90 + index * 36) * Math.PI / 180
    return { x: 50 + Math.cos(angle) * 39, y: 50 + Math.sin(angle) * 39 }
  })
  return <div className="bi-star-ring"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><radialGradient id="biCoreGlow"><stop offset="0" stopColor="#2ce1ff" stopOpacity=".26"/><stop offset="1" stopColor="#2ce1ff" stopOpacity="0"/></radialGradient></defs><circle cx="50" cy="50" r="42" className="outer-ring"/><circle cx="50" cy="50" r="31" className="inner-ring"/><circle cx="50" cy="50" r="24" fill="url(#biCoreGlow)"/>{positions.map((point, index) => <line key={stats[index].key} x1="50" y1="50" x2={point.x} y2={point.y} className={stats[index].total ? 'active' : ''}/>)}</svg><div className="bi-core-orbit orbit-one"/><div className="bi-core-orbit orbit-two"/><button className="bi-star-core" onClick={() => selected && onSelect(selected)}><small>{selected ? '当前领域' : '监管核心'}</small><strong>{selected ? stats.find((item) => item.key === selected)?.label : '十大领域'}</strong><span>{selected ? `${stats.find((item) => item.key === selected)?.total || 0} 项风险` : `${stats.reduce((sum, item) => sum + item.total, 0)} 项风险`}</span><i/></button>{stats.map((item, index) => <button key={item.key} className={`bi-domain-node ${riskTone(item)} ${selected === item.key ? 'selected' : ''} ${selected && selected !== item.key ? 'muted' : ''}`} style={{ '--domain-x': `${positions[index].x}%`, '--domain-y': `${positions[index].y}%`, '--domain-color': item.color } as CSSProperties} onClick={() => onSelect(item.key)}><i/><span>{item.label}</span><strong>{item.total}</strong><small>{item.total ? `${item.major + item.high}项重大高风险` : '态势平稳'}</small></button>)}</div>
}

function DispositionProgress({ events }: { events: RiskEvent[] }) {
  const definitions = [{ status: '待整改', color: '#9c79ff' }, { status: '待复核', color: '#31c8ff' }, { status: '已关闭', color: '#46e0a0' }]
  const total = Math.max(1, events.length)
  return <div className="bi-disposition"><div className="bi-disposition-summary"><div><span>风险事件</span><strong>{events.length}</strong></div><div><span>已关闭</span><strong>{events.filter((item) => item.status === '已关闭').length}</strong></div></div>{definitions.map((item) => { const count = events.filter((event) => event.status === item.status).length; const percent = Math.round(count / total * 100); return <article key={item.status}><div><span><i style={{ background: item.color }}/>{item.status}</span><b>{count}项 · {percent}%</b></div><em><i style={{ width: `${percent}%`, background: item.color }}/></em></article> })}</div>
}

function DomainRanking({ stats }: { stats: DomainStat[] }) {
  const max = Math.max(1, ...stats.map((item) => item.score))
  return <div className="bi-domain-ranking">{stats.slice(0, 5).map((item, index) => <article key={item.key}><b>{index + 1}</b><span><strong>{item.label}</strong><small>{item.total}项风险</small></span><em><i style={{ width: `${Math.max(item.score ? 8 : 2, item.score / max * 100)}%`, background: item.color }}/></em><strong>{item.score}</strong></article>)}</div>
}

function DomainHeatMatrix({ stats }: { stats: DomainStat[] }) {
  const rows = [
    { label: '风险规模', value: (item: DomainStat) => Math.min(4, item.total) },
    { label: '严重程度', value: (item: DomainStat) => Math.min(4, item.major * 2 + item.high) },
    { label: '增长趋势', value: (item: DomainStat) => item.trend > 5 ? 4 : item.trend > 2 ? 3 : item.trend > 0 ? 2 : 1 },
    { label: '处置压力', value: (item: DomainStat) => Math.min(4, item.open + item.overdue * 2) },
  ]
  return <div className="bi-heat-matrix"><div className="bi-heat-head"><span>指标</span>{stats.map((item) => <b key={item.key}>{item.shortLabel}</b>)}</div>{rows.map((row) => <div className="bi-heat-row" key={row.label}><span>{row.label}</span>{stats.map((item) => { const level = row.value(item); return <i key={item.key} className={`heat-${level}`} title={`${item.label} · ${row.label}`}>{level || '—'}</i> })}</div>)}</div>
}
