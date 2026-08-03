import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { RiskLevel } from './types'
import { graphEdges, graphNodes } from './data'

export type IconName = 'workbench' | 'situation' | 'shield' | 'rules' | 'graph' | 'system' | 'bell' | 'agent' | 'search' | 'refresh' | 'chevron' | 'eye' | 'edit' | 'user' | 'audit' | 'clock' | 'check' | 'warning' | 'close' | 'plus' | 'link' | 'file' | 'lock' | 'menu' | 'home' | 'copy' | 'trash' | 'play' | 'pause'

const iconPaths: Record<IconName, ReactNode> = {
  workbench: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  situation: <><path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19V3"/></>,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>,
  rules: <><path d="M4 6h16"/><path d="M4 12h10"/><path d="M4 18h7"/><circle cx="18" cy="12" r="2"/><circle cx="15" cy="18" r="2"/></>,
  graph: <><circle cx="5" cy="12" r="2.5"/><circle cx="18" cy="5" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="m7.2 10.8 8.6-4.6M7.4 13l9.2 4"/></>,
  system: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7"/><path d="M10 20h4"/></>,
  agent: <><rect x="4" y="6" width="16" height="13" rx="4"/><path d="M9 2h6M12 2v4M8 19v3l4-3"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><path d="M9 16h6"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  refresh: <><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6.5L4 11M5.5 15A7 7 0 0 0 18 17.5l2-4.5"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
  edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  audit: <><path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h5"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  warning: <><path d="M12 3 2.5 20h19Z"/><path d="M12 9v4M12 17h.01"/></>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"/></>,
  file: <><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 13h6M9 17h6"/></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10M9 21v-7h6v7"/></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/></>,
  trash: <><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 14h10l1-14"/><path d="M9 7V4h6v3"/></>,
  play: <path d="M8 5v14l11-7Z"/>,
  pause: <><path d="M8 5v14"/><path d="M16 5v14"/></>,
}

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">{iconPaths[name]}</svg>
}

export function Button({ variant = 'default', icon, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'danger' | 'ghost'; icon?: IconName }) {
  const resolvedVariant = variant === 'default' && icon === 'plus' ? 'primary' : variant
  return <button className={`button ${resolvedVariant} ${className}`} {...props}>{icon && <Icon name={icon} size={16}/>}<span>{children}</span></button>
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-description">{description}</p></div>{actions && <div className="page-actions">{actions}</div>}</header>
}

export function RiskTag({ level }: { level: RiskLevel }) {
  return <span className={`tag risk-level level-${level}`}>{level === '重大' ? '重大风险' : `${level}风险`}</span>
}

export function StatusTag({ children }: { children: ReactNode }) {
  const text = String(children)
  const tone = text.includes('已发布') || text.includes('已关闭') || text.includes('已解除') || text.includes('启用') || text.includes('完整') || text.includes('成功') ? 'success' : text.includes('异常') || text.includes('失败') || text.includes('逾期') || text.includes('重大') ? 'danger' : text.includes('待') || text.includes('核查') || text.includes('整改') || text.includes('观察') || text.includes('校验') ? 'warning' : 'info'
  return <span className={`tag ${tone}`}>{children}</span>
}

export function StatCard({ label, value, helper, tone = 'blue', icon, active, onClick }: { label: string; value: string | number; helper: string; tone?: 'blue' | 'purple' | 'red' | 'orange' | 'green'; icon?: IconName; active?: boolean; onClick?: () => void }) {
  const content = <><div className={`stat-icon ${tone}`}><Icon name={icon || 'situation'}/></div><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small>{helper}</small></div></>
  return onClick ? <button className={`stat-card clickable ${active ? 'active' : ''}`} onClick={onClick}>{content}</button> : <article className="stat-card">{content}</article>
}

export function Panel({ title, subtitle, actions, children, className = '' }: { title?: string; subtitle?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{(title || actions) && <div className="panel-header"><div>{title && <h2>{title}</h2>}{subtitle && <p>{subtitle}</p>}</div>{actions && <div className="panel-actions">{actions}</div>}</div>}{children}</section>
}

export function FilterGrid({ children, onReset, onSearch, advanced, actions }: { children: ReactNode; onReset?: () => void; onSearch?: () => void; advanced?: ReactNode; actions?: ReactNode }) {
  return <section className={`filter-panel ${actions ? 'with-actions' : ''}`}><div className="filter-grid">{children}</div>{advanced}<div className="filter-buttons"><Button onClick={onReset}>重置</Button><Button variant="primary" icon="search" onClick={onSearch}>查询</Button></div>{actions && <div className="filter-primary-action">{actions}</div>}</section>
}

export function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={`field ${wide ? 'wide' : ''}`}><span>{label}</span>{children}</label>
}

export function Tabs({ items, value, onChange }: { items: { key: string; label: string; count?: number }[]; value: string; onChange: (value: string) => void }) {
  return <nav className="tabs">{items.map((item) => <button key={item.key} className={item.key === value ? 'active' : ''} onClick={() => onChange(item.key)}>{item.label}{item.count !== undefined && <b>{item.count}</b>}</button>)}</nav>
}

export function Modal({ open, title, description, children, confirmText = '确认提交', danger, onClose, onConfirm }: { open: boolean; title: string; description?: string; children?: ReactNode; confirmText?: string; danger?: boolean; onClose: () => void; onConfirm: () => void }) {
  if (!open) return null
  return <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="modal" role="dialog" aria-modal="true"><header><div><p className="eyebrow">操作确认</p><h2>{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" onClick={onClose}><Icon name="close"/></button></header><div className="modal-body">{children}</div><footer><Button onClick={onClose}>取消</Button><Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmText}</Button></footer></section></div>
}

export function Drawer({ open, title, eyebrow = '详情', children, onClose, footer, modal = true, className = '' }: { open: boolean; title: string; eyebrow?: string; children: ReactNode; onClose: () => void; footer?: ReactNode; modal?: boolean; className?: string }) {
  return <>{modal && <div className={`drawer-mask ${open ? 'show' : ''}`} onClick={onClose}/>}<aside className={`drawer ${className} ${open ? 'show' : ''}`}><header><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div><button className="icon-button" onClick={onClose}><Icon name="close"/></button></header><div className="drawer-content">{children}</div>{footer && <footer>{footer}</footer>}</aside></>
}

export function KeyValue({ items }: { items: { label: string; value: ReactNode }[] }) {
  return <div className="key-value">{items.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div>
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><span><Icon name="file" size={28}/></span><strong>{title}</strong><p>{description}</p>{action && <div className="empty-state-action">{action}</div>}</div>
}

export function MiniLineChart() {
  const points = '20,126 82,96 144,108 206,62 268,72 330,38 392,54 454,26 516,46 578,18'
  return <div className="chart-wrap"><svg viewBox="0 0 600 170" className="line-chart" preserveAspectRatio="none"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#176dff" stopOpacity=".28"/><stop offset="100%" stopColor="#176dff" stopOpacity="0"/></linearGradient></defs>{[30,70,110,150].map((y) => <line key={y} x1="16" x2="586" y1={y} y2={y} className="grid-line"/>)}<polygon points={`${points} 578,155 20,155`} fill="url(#area)"/><polyline points={points} className="trend-line"/>{points.split(' ').map((item) => { const [x,y] = item.split(','); return <circle key={item} cx={x} cy={y} r="4" className="trend-dot"/> })}</svg><div className="chart-axis"><span>07-11</span><span>07-12</span><span>07-13</span><span>07-14</span><span>07-15</span><span>07-16</span><span>07-17</span></div></div>
}

export function DonutChart() {
  return <div className="donut-layout"><div className="donut"><div><strong>126</strong><span>预警总量</span></div></div><ul className="legend"><li><i className="major"/><span>重大</span><b>12</b></li><li><i className="high"/><span>高风险</span><b>28</b></li><li><i className="medium"/><span>中风险</span><b>51</b></li><li><i className="low"/><span>低风险</span><b>35</b></li></ul></div>
}

export function HorizontalBars({ data }: { data: { label: string; value: number; text: string }[] }) {
  return <div className="horizontal-bars">{data.map((item) => <div key={item.label}><div><span>{item.label}</span><b>{item.text}</b></div><i><em style={{ width: `${item.value}%` }}/></i></div>)}</div>
}

export function EvidenceGraph({ selected, onSelect }: { selected?: string; onSelect: (id: string) => void }) {
  const byId = Object.fromEntries(graphNodes.map((node) => [node.id, node]))
  const kindLabels: Record<string, string> = { target: '核心对象', hit: '命中对象', event: '业务事件', evidence: '来源证据' }
  return <div className="evidence-graph"><svg viewBox="0 0 920 440" role="img" aria-label="预警证据子图"><defs>
    <radialGradient id="evidenceNodeBlue" cx="30%" cy="22%" r="78%"><stop offset="0" stopColor="#fff"/><stop offset=".28" stopColor="#fff"/><stop offset=".5" stopColor="#eaf3ff"/><stop offset=".78" stopColor="#91bcff"/><stop offset="1" stopColor="#3a80e5"/></radialGradient>
    <radialGradient id="evidenceNodeCore" cx="30%" cy="22%" r="78%"><stop offset="0" stopColor="#fff"/><stop offset=".3" stopColor="#fff"/><stop offset=".48" stopColor="#dbeaff"/><stop offset=".76" stopColor="#67a2ff"/><stop offset="1" stopColor="#1f64cf"/></radialGradient>
    <radialGradient id="evidenceNodeHit" cx="30%" cy="22%" r="78%"><stop offset="0" stopColor="#fff"/><stop offset=".3" stopColor="#fff"/><stop offset=".52" stopColor="#fff0ef"/><stop offset=".79" stopColor="#f7aaa6"/><stop offset="1" stopColor="#e56b65"/></radialGradient>
    <radialGradient id="evidenceNodeEvent" cx="30%" cy="22%" r="78%"><stop offset="0" stopColor="#fff"/><stop offset=".3" stopColor="#fff"/><stop offset=".52" stopColor="#f5f2ff"/><stop offset=".79" stopColor="#d0c4ee"/><stop offset="1" stopColor="#8e78c3"/></radialGradient>
    <radialGradient id="evidenceNodeEvidence" cx="30%" cy="22%" r="78%"><stop offset="0" stopColor="#fff"/><stop offset=".3" stopColor="#fff"/><stop offset=".52" stopColor="#edf9f3"/><stop offset=".79" stopColor="#a7dbbf"/><stop offset="1" stopColor="#4f9d76"/></radialGradient>
    <filter id="evidenceNodeShadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="9" stdDeviation="8" floodColor="#365f91" floodOpacity=".18"/></filter>
    <filter id="evidenceNodeHover" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="12" stdDeviation="10" floodColor="#176dff" floodOpacity=".25"/></filter>
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#8da2bd"/></marker><marker id="arrowHit" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#d0443e"/></marker>
  </defs>{graphEdges.map((edge) => { const a = byId[edge.from]; const b = byId[edge.to]; const dx = b.x - a.x; const dy = b.y - a.y; const length = Math.max(1, Math.hypot(dx, dy)); const startRadius = a.type === 'target' ? 48 : 41; const endRadius = b.type === 'target' ? 48 : 41; const x1 = a.x + dx / length * startRadius; const y1 = a.y + dy / length * startRadius; const x2 = b.x - dx / length * endRadius; const y2 = b.y - dy / length * endRadius; const mx = (x1 + x2) / 2; const my = (y1 + y2) / 2 - 8; const labelWidth = edge.label.length * 12 + 22; return <g className="evidence-edge" key={`${edge.from}-${edge.to}`}><line x1={x1} y1={y1} x2={x2} y2={y2} className={edge.hit ? 'edge hit' : 'edge'} markerEnd={edge.hit ? 'url(#arrowHit)' : 'url(#arrow)'}/><rect x={mx - labelWidth / 2} y={my - 13} width={labelWidth} height="22" rx="11" className={edge.hit ? 'edge-label-bg hit' : 'edge-label-bg'}/><text x={mx} y={my + 2} textAnchor="middle" className={edge.hit ? 'edge-label hit' : 'edge-label'}>{edge.label}</text></g> })}{graphNodes.map((node) => { const radius = node.type === 'target' ? 46 : 39; const label = node.label.length > 10 ? `${node.label.slice(0, 9)}…` : node.label; return <g key={node.id} role="button" tabIndex={0} aria-label={`${kindLabels[node.type]}：${node.label}`} className={`graph-node ${node.type} ${selected === node.id ? 'selected' : ''}`} transform={`translate(${node.x},${node.y})`} onClick={() => onSelect(node.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelect(node.id) }}><circle className="node-selection" r={radius + 5}/><circle className="node-sphere" r={radius}/><text className="node-kind" textAnchor="middle" y="-6">{kindLabels[node.type]}</text><text className="node-label" textAnchor="middle" y="12">{label}</text></g> })}</svg><div className="graph-legend"><span><i className="target"/>目标对象</span><span><i className="hit"/>直接命中</span><span><i className="event"/>事件</span><span><i className="evidence"/>证据</span></div></div>
}