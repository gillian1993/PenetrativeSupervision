import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAppStore } from '../store'
import type { RiskEvent, Warning, WarningStatus } from '../types'
import { Button, Drawer, EmptyState, EvidenceGraph, Field, FilterGrid, Icon, KeyValue, Modal, PageHeader, Panel, RiskTag, StatusTag, Tabs } from '../ui'

type WarningAction = 'assign' | 'release' | 'escalate' | 'feedback' | 'review' | 'compensate' | null
type EventAction = 'assign' | 'transfer' | 'submit' | 'review' | null
const listPageSize = 4

const actionMeta: Record<Exclude<WarningAction, null>, { title: string; description: string; confirm: string; danger?: boolean }> = {
  assign: { title: '派发核查任务', description: '指定责任人、完成时限和明确核查要求，成功后生成待办与消息。', confirm: '确认派发' },
  release: { title: '解除预警', description: '必须填写解除原因并引用证据，提交后生成规则效果样本。', confirm: '确认解除', danger: true },
  escalate: { title: '升级风险事件', description: '选择风险事件责任人和完成时限，创建事件后直接进入核查整改。', confirm: '确认升级', danger: true },
  feedback: { title: '提交核查反馈', description: '业务责任人提交核查结论、事实说明和补充材料。', confirm: '提交反馈' },
  review: { title: '监管复核', description: '根据核查反馈选择退回、观察、解除或升级风险事件。', confirm: '确认复核', danger: true },
  compensate: { title: '重新生成证据快照', description: '补偿任务只补齐缺失快照，不允许使用当前图谱覆盖历史事实。', confirm: '创建补偿任务' },
}

export function WarningListPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const warnings = useAppStore((state) => state.warnings)
  const riskEvents = useAppStore((state) => state.riskEvents)
  const currentRole = useAppStore((state) => state.currentRole)
  const assignWarning = useAppStore((state) => state.assignWarning)
  const releaseWarning = useAppStore((state) => state.releaseWarning)
  const escalateWarning = useAppStore((state) => state.escalateWarning)
  const setToast = useAppStore((state) => state.setToast)
  const [draft, setDraft] = useState({ keyword: '', status: searchParams.get('status') === 'open' ? '待处理' : '处置中', stage: '全部', level: searchParams.get('level') === 'high' ? '重大、高' : '全部', scene: '全部', org: searchParams.get('org') || '全部', evidence: '全部' })
  const [filters, setFilters] = useState(draft)
  const [sort, setSort] = useState<'level' | 'time'>('level')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [action, setAction] = useState<WarningAction>(null)
  const [target, setTarget] = useState<Warning | null>(null)
  const [form, setForm] = useState({ owner: '', dueAt: '2026-07-24 18:00', requirement: '核查风险事实、明确影响范围并提交整改证明材料。', reason: '', evidence: '' })
  const [columnOpen, setColumnOpen] = useState(false)
  const [columns, setColumns] = useState(['阶段', '场景', '对象', '等级', '路径', '状态', '证据', '时间'])
  const eventByWarning = useMemo(() => new Map(riskEvents.map((item) => [item.warningId, item.id])), [riskEvents])

  const rows = useMemo(() => {
    const order = { 重大: 4, 高: 3, 中: 2, 低: 1 }
    return warnings.filter((item) => {
      if (filters.keyword && !`${item.id}${item.title}${item.target}`.toLowerCase().includes(filters.keyword.toLowerCase())) return false
      if (filters.status === '处置中' && ['已解除', '已升级'].includes(item.status)) return false
      if (!['全部', '处置中'].includes(filters.status) && item.status !== filters.status) return false
      if (filters.stage !== '全部' && item.stage !== filters.stage) return false
      if (filters.level !== '全部' && !filters.level.includes(item.level)) return false
      if (filters.scene !== '全部' && item.scene !== filters.scene) return false
      if (filters.org !== '全部' && item.organization !== filters.org) return false
      if (filters.evidence !== '全部' && item.evidenceStatus !== filters.evidence) return false
      return true
    }).sort((a, b) => sort === 'level' ? order[b.level] - order[a.level] : b.generatedAt.localeCompare(a.generatedAt))
  }, [warnings, filters, sort])
  const totalPages = Math.max(1, Math.ceil(rows.length / listPageSize))
  const pageRows = rows.slice((page - 1) * listPageSize, page * listPageSize)
  const openAction = (item: Warning, next: WarningAction) => {
    setTarget(item)
    setAction(next)
    setForm({ owner: next === 'escalate' ? '' : next === 'assign' ? '李华' : (item.owner || '李华'), dueAt: '2026-07-24 18:00', requirement: next === 'escalate' ? '核查风险事实、明确影响范围并提交整改证明材料。' : '核查主体关联事实、业务审批过程和相关证明材料。', reason: '', evidence: '' })
  }
  const executeAction = () => {
    if (!target || !action) return
    if (action === 'assign') {
      const result = assignWarning(target.id, form.owner, form.dueAt, form.requirement); setToast(result.message); if (result.ok) setAction(null)
    } else if (action === 'release') {
      const result = releaseWarning(target.id, form.reason, form.evidence); setToast(result.message); if (result.ok) setAction(null)
    } else if (action === 'escalate') {
      const result = escalateWarning(target.id, form.owner, form.dueAt, form.requirement, form.reason)
      setToast(result.message)
      if (result.ok) { setAction(null); setPage(1) }
    } else if (action === 'compensate') {
      setToast('证据补偿任务已创建，可在消息接收框查看结果'); setAction(null)
    }
  }
  const query = () => { setLoading(true); window.setTimeout(() => { setFilters(draft); setPage(1); setLoading(false); setToast(`查询完成，共${rows.length}条预警`) }, 260) }

  return <>
    <PageHeader eyebrow="风险监管 / 统一预警" title="统一预警" description="统一查询事前、事中和事后预警，开展证据研判、核查、解除和风险升级。" actions={<><span className="updated-time">来源：{searchParams.get('source') || '菜单查询'} · 当前角色：{currentRole}</span><Button icon="refresh" onClick={query}>刷新</Button></>}/>
    <div className="page-query page-query-warning">
    <FilterGrid onReset={() => { const value = { keyword: '', status: '处置中', stage: '全部', level: '全部', scene: '全部', org: '全部', evidence: '全部' }; setDraft(value); setFilters(value); setPage(1) }} onSearch={query}>
      <Field label="关键词"><input value={draft.keyword} onChange={(event) => setDraft({ ...draft, keyword: event.target.value })} onKeyDown={(event) => event.key === 'Enter' && query()} placeholder="预警编号、标题或目标对象"/></Field>
      <Field label="预警阶段"><select value={draft.stage} onChange={(event) => setDraft({ ...draft, stage: event.target.value })}><option>全部</option><option>事前</option><option>事中</option><option>事后</option></select></Field>
      <Field label="处理状态"><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="处置中">处置中（默认）</option><option value="全部">全部预警</option><option>待处理</option><option>核查中</option><option>待复核</option><option>持续观察</option><option>已解除</option><option>已升级</option></select></Field>
      <Field label="风险等级"><select value={draft.level} onChange={(event) => setDraft({ ...draft, level: event.target.value })}><option>全部</option><option>重大、高</option><option>重大</option><option>高</option><option>中</option><option>低</option></select></Field>
      <Field label="风险场景"><select value={draft.scene} onChange={(event) => setDraft({ ...draft, scene: event.target.value })}><option>全部</option><option>供应商异常关联</option><option>合同签订风险</option><option>付款执行风险</option><option>供应商资格风险</option></select></Field>
      <Field label="组织范围"><select value={draft.org} onChange={(event) => setDraft({ ...draft, org: event.target.value })}><option>全部</option><option>电子云采购中心</option><option>集团财务共享中心</option><option>集团采购中心</option></select></Field>
      <Field label="证据状态"><select value={draft.evidence} onChange={(event) => setDraft({ ...draft, evidence: event.target.value })}><option>全部</option><option>完整</option><option>部分缺失</option><option>权限受限</option><option>快照异常</option></select></Field>
    </FilterGrid>
    </div>
    <Panel title="预警列表" subtitle={`共 ${rows.length} 条，当前第 ${page}/${totalPages} 页`} actions={<><div className="segmented"><button className={sort === 'level' ? 'active' : ''} onClick={() => setSort('level')}>等级排序</button><button className={sort === 'time' ? 'active' : ''} onClick={() => setSort('time')}>时间排序</button></div><button className="column-setting" onClick={() => setColumnOpen(true)}><Icon name="system" size={15}/>列设置</button></>}>
      <div className="active-filters"><span>已生效筛选</span>{Object.entries(filters).filter(([, value]) => value && value !== '全部').map(([key, value]) => <b key={key}>{value}</b>)}</div>
      {loading ? <div className="table-loading"><i/><span>正在查询预警数据…</span></div> : pageRows.length === 0 ? <div className="empty-state"><span><Icon name="search"/></span><strong>没有符合条件的预警</strong><p>请调整筛选条件后重新查询。</p></div> : <div className="table-container"><table className="warning-table"><thead><tr><th>预警编号 / 标题</th>{columns.includes('阶段') && <th>阶段</th>}{columns.includes('场景') && <th>风险场景</th>}{columns.includes('对象') && <th>目标对象 / 事件</th>}{columns.includes('等级') && <th>等级</th>}{columns.includes('路径') && <th>核心路径</th>}{columns.includes('状态') && <th>状态</th>}{columns.includes('证据') && <th>证据</th>}{columns.includes('时间') && <th>生成时间</th>}<th>操作</th></tr></thead><tbody>{pageRows.map((item) => <tr key={item.id}><td><button className="table-link title-cell" onClick={() => navigate(`/risk/warnings/${item.id}`)}><strong>{item.title}</strong><span>{item.id}</span></button></td>{columns.includes('阶段') && <td><StatusTag>{item.stage}</StatusTag></td>}{columns.includes('场景') && <td>{item.scene}<small className="cell-sub">{item.sceneVersion}</small></td>}{columns.includes('对象') && <td><strong>{item.evidenceStatus === '权限受限' ? '受限对象' : item.target}</strong><small className="cell-sub">{item.targetEvent}</small></td>}{columns.includes('等级') && <td><RiskTag level={item.level}/></td>}{columns.includes('路径') && <td><span className="path-summary">{item.evidenceStatus === '权限受限' ? '受限关系路径' : item.path}</span></td>}{columns.includes('状态') && <td><StatusTag>{item.status}</StatusTag></td>}{columns.includes('证据') && <td><button className="table-link" onClick={() => item.evidenceStatus === '快照异常' ? openAction(item, 'compensate') : navigate(`/risk/warnings/${item.id}`)}><StatusTag>{item.evidenceStatus}</StatusTag></button></td>}{columns.includes('时间') && <td>{item.generatedAt.slice(5)}<small className="cell-sub">{item.leadTime}</small></td>}<td><div className="row-actions vertical"><button onClick={() => navigate(`/risk/warnings/${item.id}`)}>查看</button>{item.status === '已升级' && eventByWarning.get(item.id) && <button onClick={() => navigate(`/risk/events/${eventByWarning.get(item.id)}`)}>查看风险事件</button>}{['待处理','持续观察'].includes(item.status) && <button onClick={() => openAction(item, 'assign')}>派发</button>}{!['已解除','已升级'].includes(item.status) && <button onClick={() => openAction(item, 'release')}>解除</button>}{['待处理','持续观察'].includes(item.status) && <button onClick={() => openAction(item, 'escalate')}>升级</button>}</div></td></tr>)}</tbody></table></div>}
      <div className="pagination"><span>共 {rows.length} 条</span><button disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>{Array.from({ length: totalPages }, (_, index) => <button key={index + 1} className={page === index + 1 ? 'active' : ''} onClick={() => setPage(index + 1)}>{index + 1}</button>)}<button disabled={page === totalPages} onClick={() => setPage(page + 1)}>›</button></div>
    </Panel>
    <Modal open={!!action && action !== 'feedback' && action !== 'review'} title={action ? actionMeta[action].title : ''} description={action ? actionMeta[action].description : ''} confirmText={action ? actionMeta[action].confirm : ''} danger={action ? actionMeta[action].danger : false} onClose={() => setAction(null)} onConfirm={executeAction}>{action && target && <WarningActionForm action={action} warning={target} form={form} onChange={setForm}/>}</Modal>
    <Drawer open={columnOpen} title="预警列表列设置" eyebrow="显示与排序" onClose={() => setColumnOpen(false)} footer={<><Button onClick={() => setColumns(['阶段','场景','对象','等级','路径','状态','证据','时间'])}>恢复默认</Button><Button variant="primary" onClick={() => { setColumnOpen(false); setToast('列设置已保存') }}>应用设置</Button></>}><div className="check-grid vertical">{['阶段','场景','对象','等级','路径','状态','证据','时间'].map((column) => <label key={column}><input type="checkbox" checked={columns.includes(column)} onChange={() => setColumns((value) => value.includes(column) ? value.filter((item) => item !== column) : [...value, column])}/><span>{column}</span></label>)}</div></Drawer>
  </>
}

function WarningActionForm({ action, warning, form, onChange }: { action: Exclude<WarningAction, null>; warning: Warning; form: { owner: string; dueAt: string; requirement: string; reason: string; evidence: string }; onChange: (value: typeof form) => void }) {
  return <div className="form-stack"><div className="operation-target"><RiskTag level={warning.level}/><div><strong>{warning.title}</strong><span>{warning.id} · {warning.target}</span></div></div>{action === 'assign' && <><Field label="责任人 *"><select value={form.owner} onChange={(event) => onChange({ ...form, owner: event.target.value })}><option>李华</option><option>王宁</option><option>周航</option><option>孙凯</option></select></Field><Field label="完成时限 *"><input value={form.dueAt} onChange={(event) => onChange({ ...form, dueAt: event.target.value })}/></Field><Field label="核查要求 *"><textarea value={form.requirement} onChange={(event) => onChange({ ...form, requirement: event.target.value })}/></Field></>}{action === 'release' && <><Field label="解除原因 *"><select value={form.reason} onChange={(event) => onChange({ ...form, reason: event.target.value })}><option value="">请选择</option><option>规则误报</option><option>条件已经消失</option><option>已取得有效授权</option></select></Field><Field label="引用证据 *"><input value={form.evidence} onChange={(event) => onChange({ ...form, evidence: event.target.value })} placeholder="输入证据编号或说明"/></Field></>}{action === 'escalate' && <><div className="alert-box danger"><Icon name="warning"/><span>升级成功后，原预警将退出默认处置列表并保留“已升级”历史记录。</span></div><Field label="风险事件责任人 *"><select value={form.owner} onChange={(event) => onChange({ ...form, owner: event.target.value })}><option value="">请选择责任人</option><option>李华</option><option>王宁</option><option>周航</option><option>孙凯</option></select></Field><Field label="完成时限 *"><input value={form.dueAt} onChange={(event) => onChange({ ...form, dueAt: event.target.value })}/></Field><Field label="处置要求 *"><textarea value={form.requirement} onChange={(event) => onChange({ ...form, requirement: event.target.value })}/></Field><Field label="风险确认说明 *"><textarea value={form.reason} onChange={(event) => onChange({ ...form, reason: event.target.value })} placeholder="至少8个字，说明风险判断依据"/></Field></>}{action === 'compensate' && <div className="alert-box"><Icon name="refresh"/><span>补偿任务将使用预警生成时记录的本体、图谱和规则版本重新固化缺失证据。</span></div>}</div>
}

export function WarningDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const warning = useAppStore((state) => state.warnings.find((item) => item.id === id))
  const linkedRiskEvent = useAppStore((state) => state.riskEvents.find((item) => item.warningId === id))
  const currentRole = useAppStore((state) => state.currentRole)
  const assignWarning = useAppStore((state) => state.assignWarning)
  const releaseWarning = useAppStore((state) => state.releaseWarning)
  const escalateWarning = useAppStore((state) => state.escalateWarning)
  const submitVerification = useAppStore((state) => state.submitVerification)
  const reviewWarning = useAppStore((state) => state.reviewWarning)
  const setToast = useAppStore((state) => state.setToast)
  const [tab, setTab] = useState('graph')
  const [path, setPath] = useState('path1')
  const [selectedNode, setSelectedNode] = useState('')
  const [action, setAction] = useState<WarningAction>(null)
  const [graphScale, setGraphScale] = useState(1)
  const [fullScreen, setFullScreen] = useState(false)
  const [relationFilter, setRelationFilter] = useState('全部关系')
  const [evidenceFilter, setEvidenceFilter] = useState('全部')
  const [form, setForm] = useState({ owner: '', dueAt: '2026-07-24 18:00', requirement: '核查风险事实、明确影响范围并提交整改证明材料。', reason: '', evidence: '', conclusion: '风险存在', facts: '', materials: [] as string[], reviewResult: '退回补充' as '退回补充' | '持续观察' | '解除预警' | '升级风险事件' })
  if (!warning) return <EmptyState title="预警不存在或无权访问" description="请返回预警列表重新选择可访问对象。"/>
  const openAction = (next: WarningAction) => { setAction(next); setForm({ ...form, owner: next === 'escalate' ? '' : next === 'assign' ? '李华' : (warning.owner || '李华'), reason: '', evidence: '', facts: '', materials: [], reviewResult: '退回补充' }) }
  const execute = () => {
    if (!action) return
    if (action === 'assign') { const result = assignWarning(warning.id, form.owner, form.dueAt, form.requirement); setToast(result.message); if (result.ok) setAction(null) }
    if (action === 'release') { const result = releaseWarning(warning.id, form.reason, form.evidence); setToast(result.message); if (result.ok) setAction(null) }
    if (action === 'escalate') { const result = escalateWarning(warning.id, form.owner, form.dueAt, form.requirement, form.reason); setToast(result.message); if (result.ok && result.objectId) { setAction(null); navigate(`/risk/events/${result.objectId}`) } }
    if (action === 'feedback') { const result = submitVerification(warning.id, form.conclusion, form.facts, form.materials); setToast(result.message); if (result.ok) setAction(null) }
    if (action === 'review') { const result = reviewWarning(warning.id, form.reviewResult, form.reason, form.owner, form.dueAt, form.requirement); setToast(result.message); if (result.ok) { setAction(null); if (result.objectId) navigate(`/risk/events/${result.objectId}`) } }
  }
  const nodeTitle = selectedNode === 'supplier' ? '华北数字科技有限公司' : selectedNode === 'phone' ? '手机号 138****8201' : selectedNode === 'reviewer' ? '评审人员 王**' : selectedNode === 'project' ? '云资源扩容采购项目' : selectedNode === 'bid' ? '中标确认事件' : '工商查询记录'
  const canRelease = !['已解除','已升级'].includes(warning.status) && (!['重大','高'].includes(warning.level) || currentRole === '监管负责人')
  return <div className={`warning-detail-page ${fullScreen ? 'evidence-fullscreen' : ''}`}>
    <div className="detail-topbar"><div><button className="back-button" onClick={() => navigate('/risk/warnings')}>‹ 返回预警列表</button><p>{warning.id}</p><h1>{warning.title}</h1></div><div className="detail-top-actions"><Button icon="refresh" onClick={() => setToast('已刷新预警状态、任务和权限，历史快照保持不变')}>刷新</Button><Button icon="link" onClick={() => navigator.clipboard?.writeText(warning.id).then(() => setToast('预警编号已复制'))}>复制编号</Button></div></div>
    <section className="summary-strip"><div><span>预警阶段</span><StatusTag>{warning.stage}</StatusTag></div><div><span>处理状态</span><StatusTag>{warning.status}</StatusTag></div><div><span>风险等级</span><RiskTag level={warning.level}/></div><div><span>目标事件</span><strong>{warning.targetEvent}</strong><small>{warning.expectedAt}</small></div><div><span>提前量</span><strong>{warning.leadTime}</strong></div><div><span>证据状态</span><StatusTag>{warning.evidenceStatus}</StatusTag></div><div><span>版本</span><strong>本体 v2.2 · 图谱 0717.2 · 规则 {warning.sceneVersion}</strong></div></section>
    {warning.status === '已升级' && linkedRiskEvent && <div className="alert-box evidence-alert"><Icon name="shield"/><span>该预警已转入风险事件 {linkedRiskEvent.id}，后续处置请在风险事件中完成。</span><Button variant="primary" onClick={() => navigate(`/risk/events/${linkedRiskEvent.id}`)}>查看风险事件</Button></div>}
    {warning.evidenceStatus === '快照异常' && <div className="alert-box danger evidence-alert"><Icon name="warning"/><span>初始证据快照生成失败，禁止使用当前图谱替代。</span><Button onClick={() => openAction('compensate')}>创建补偿任务</Button></div>}
    <section className="evidence-workspace"><aside className="risk-explain"><div className="explain-block"><p className="section-kicker">风险说明</p><h2>发现目标供应商与本次项目评审人员共享联系方式</h2><p>该关系可能影响评审独立性，需要在中标确认前完成主体关联和人员关系核查。</p></div><div className="explain-block"><p className="section-kicker">命中规则</p><div className="rule-hit"><span>R-PROC-ASSOC-06</span><strong>供应商与评审人员共同信息</strong><p>共同手机号数量 ≥ 1，实际命中值：1</p></div></div><div className="explain-block"><p className="section-kicker">核心路径</p><button className={path === 'path1' ? 'path-card active' : 'path-card'} onClick={() => { setPath('path1'); setEvidenceFilter('路径1') }}><b>路径 1 · 直接命中</b><span>供应商 → 手机号 → 评审人员</span><small>2跳 · 完整度100%</small></button><button className={path === 'path2' ? 'path-card active' : 'path-card'} onClick={() => { setPath('path2'); setEvidenceFilter('路径2') }}><b>路径 2 · 辅助证据</b><span>供应商 → 工商记录 → 关联人员</span><small>2跳 · 完整度86%</small></button></div><div className="explain-block"><p className="section-kicker">制度依据</p><p className="policy-line">《采购评审管理办法》v3.2<br/><b>第十二条：评审人员应主动回避利益关联主体。</b></p></div><div className="explain-block"><p className="section-kicker">处理记录</p><ul className="plain-list"><li>生成预警：{warning.generatedAt}</li><li>当前责任人：{warning.owner || '待分配'}</li><li>最近变化：{warning.updatedAt}</li></ul></div></aside>
      <main className="evidence-main"><div className="evidence-toolbar"><Tabs value={tab} onChange={setTab} items={[{ key: 'graph', label: '证据子图', count: path === 'path1' ? 6 : 5 }, { key: 'timeline', label: '事件时间轴', count: 5 }, { key: 'policies', label: '制度依据', count: 2 }, { key: 'evidence', label: '实际证据', count: 8 }]}/><div className="graph-tools"><select value={relationFilter} onChange={(event) => setRelationFilter(event.target.value)}><option>全部关系</option><option>仅命中关系</option><option>隐藏辅助关系</option></select><button onClick={() => setGraphScale(Math.min(1.5, graphScale + .1))}>＋</button><button onClick={() => setGraphScale(Math.max(.7, graphScale - .1))}>－</button><button onClick={() => setGraphScale(1)}><Icon name="refresh" size={14}/>重置</button><button onClick={() => setFullScreen(!fullScreen)}><Icon name="eye" size={14}/>{fullScreen ? '退出全屏' : '全屏'}</button></div></div>
        {tab === 'graph' && <div style={{ transform: `scale(${graphScale})`, transformOrigin: 'center top', transition: '.18s' }}><EvidenceGraph selected={selectedNode} onSelect={setSelectedNode}/></div>}{tab === 'timeline' && <Timeline path={path} onSelect={(key) => { setSelectedNode(key); setTab('graph') }}/>} {tab === 'policies' && <PolicySnapshot/>} {tab === 'evidence' && <EvidenceTable filter={evidenceFilter} onFilter={setEvidenceFilter} onSelect={setSelectedNode}/>} </main></section>
    <footer className="fixed-action-bar"><div><span>当前责任人</span><strong>{warning.owner || '待分配'}</strong><small>当前角色：{currentRole}</small></div><div className="action-group"><Button onClick={() => navigate('/risk/warnings')}>返回</Button>{['待处理','持续观察'].includes(warning.status) && <Button icon="user" onClick={() => openAction('assign')}>派发核查</Button>}{warning.status === '核查中' && <Button variant="primary" onClick={() => openAction('feedback')}>提交核查反馈</Button>}{warning.status === '待复核' && <Button variant="primary" onClick={() => openAction('review')}>监管复核</Button>}{canRelease && <Button variant="danger" onClick={() => openAction('release')}>解除预警</Button>}{['待处理','持续观察'].includes(warning.status) && <Button variant="primary" icon="shield" onClick={() => openAction('escalate')}>升级风险事件</Button>}</div></footer>
    <Drawer open={!!selectedNode} title={nodeTitle} eyebrow={selectedNode === 'bid' ? '事件详情' : selectedNode === 'file' ? '证据详情与预览' : selectedNode === 'phone' ? '关系证据详情' : '节点详情'} onClose={() => setSelectedNode('')} footer={<><Button onClick={() => setSelectedNode('')}>关闭</Button>{selectedNode === 'file' && <Button onClick={() => setToast('附件下载已记录审计')}>单项下载</Button>}<Button variant="primary" onClick={() => setToast('来源权限校验通过，已打开来源摘要')}>来源追溯</Button></>}><NodeDetail selectedNode={selectedNode} path={path}/></Drawer>
    <Modal open={!!action && action !== 'compensate'} title={action ? actionMeta[action].title : ''} description={action ? actionMeta[action].description : ''} confirmText={action ? actionMeta[action].confirm : ''} danger={action ? actionMeta[action].danger : false} onClose={() => setAction(null)} onConfirm={execute}>{action && <DetailActionForm action={action} warning={warning} form={form} onChange={setForm}/>}</Modal>
    <Modal open={action === 'compensate'} title="创建证据补偿任务" description="补偿任务不会覆盖初始证据快照。" onClose={() => setAction(null)} onConfirm={() => { setAction(null); setToast('补偿任务已创建，完成后将发送工作台消息') }}><div className="alert-box"><Icon name="refresh"/><span>使用版本：本体v2.2、图谱0717.2、规则{warning.sceneVersion}。</span></div></Modal>
  </div>
}

function DetailActionForm({ action, warning, form, onChange }: { action: Exclude<WarningAction, null>; warning: Warning; form: { owner: string; dueAt: string; requirement: string; reason: string; evidence: string; conclusion: string; facts: string; materials: string[]; reviewResult: '退回补充' | '持续观察' | '解除预警' | '升级风险事件' }; onChange: (value: typeof form) => void }) {
  if (['assign','release','escalate','compensate'].includes(action)) return <WarningActionForm action={action} warning={warning} form={form} onChange={(value) => onChange({ ...form, ...value })}/>
  if (action === 'feedback') return <div className="form-stack"><Field label="核查结论 *"><select value={form.conclusion} onChange={(event) => onChange({ ...form, conclusion: event.target.value })}><option>风险存在</option><option>风险不存在</option><option>暂无法判断</option></select></Field><Field label="事实说明 *"><textarea value={form.facts} onChange={(event) => onChange({ ...form, facts: event.target.value })} placeholder="至少10个字，说明业务事实和判断依据"/></Field><Field label="补充材料"><div className="upload-zone"><Icon name="file"/><span>{form.materials.length ? form.materials.join('、') : '尚未添加材料'}</span><Button onClick={() => onChange({ ...form, materials: [...form.materials, `核查材料-${form.materials.length + 1}.pdf`] })}>模拟上传</Button></div></Field>{['风险不存在','暂无法判断'].includes(form.conclusion) && <div className="alert-box danger"><Icon name="warning"/><span>当前结论至少需要一项补充材料，否则无法提交。</span></div>}</div>
  return <div className="form-stack"><Field label="复核动作 *"><select value={form.reviewResult} onChange={(event) => { const reviewResult = event.target.value as typeof form.reviewResult; onChange({ ...form, reviewResult, owner: reviewResult === '升级风险事件' ? '' : form.owner }) }}><option>退回补充</option><option>持续观察</option><option>解除预警</option><option>升级风险事件</option></select></Field><Field label="复核说明 *"><textarea value={form.reason} onChange={(event) => onChange({ ...form, reason: event.target.value })} placeholder="说明判断依据、缺失项或风险确认事实"/></Field>{form.reviewResult === '解除预警' && <Field label="引用证据"><input value={form.evidence} onChange={(event) => onChange({ ...form, evidence: event.target.value })} placeholder="核查反馈与补充材料"/></Field>}{form.reviewResult === '升级风险事件' && <><Field label="风险事件责任人 *"><select value={form.owner} onChange={(event) => onChange({ ...form, owner: event.target.value })}><option value="">请选择责任人</option><option>李华</option><option>王宁</option><option>周航</option><option>孙凯</option></select></Field><Field label="完成时限 *"><input value={form.dueAt} onChange={(event) => onChange({ ...form, dueAt: event.target.value })}/></Field><Field label="处置要求 *"><textarea value={form.requirement} onChange={(event) => onChange({ ...form, requirement: event.target.value })}/></Field></>}</div>
}

function Timeline({ path, onSelect }: { path: string; onSelect: (key: string) => void }) {
  const items = [{ time: '2026-06-18 09:20', title: '采购项目创建', desc: '云资源扩容采购项目进入需求确认阶段', key: 'project', tone: '' }, { time: '2026-07-08 14:10', title: '供应商报名', desc: path === 'path1' ? '报名记录包含共同手机号' : '工商记录发现关联人员', key: 'supplier', tone: '' }, { time: '2026-07-16 18:35', title: '评审专家抽取', desc: '王**进入本项目评审专家组', key: 'reviewer', tone: 'warning' }, { time: '2026-07-17 07:18', title: '规则命中并生成预警', desc: `当前选择${path === 'path1' ? '直接命中路径' : '辅助证据路径'}`, key: 'phone', tone: 'danger' }, { time: '预计 2026-07-18 15:00', title: '中标确认', desc: '目标事件尚未发生', key: 'bid', tone: 'future' }]
  return <div className="timeline">{items.map((item) => <button key={item.time} className={item.tone} onClick={() => onSelect(item.key)}><i/><time>{item.time}</time><div><strong>{item.title}</strong><span>{item.desc}</span><small>查看详情 · 定位到图中</small></div></button>)}</div>
}

function PolicySnapshot() {
  const rows = [['采购评审管理办法','v3.2','第十二条','评审人员应主动回避利益关联主体。'],['采购项目评审专家管理细则','v1.6','第八条','专家与投标主体存在利益关系时，应申报并回避。']]
  return <div className="record-list policy-snapshot-list">{rows.map((row)=><article key={`${row[0]}-${row[2]}`}><header><div><strong>{row[0]}</strong><span>{row[1]} · {row[2]}</span></div><StatusTag>已固化</StatusTag></header><p>{row[3]}</p><div className="attachment"><Icon name="file"/><span>制度条款快照 · 发布时版本</span><button>预览</button></div></article>)}</div>
}

function EvidenceTable({ filter, onFilter, onSelect }: { filter: string; onFilter: (value: string) => void; onSelect: (key: string) => void }) {
  const allRows = [['EVI-001','工商主体查询记录','外部数据','华北数字科技','工商司法外部数据','可用','内部','file','路径2'],['EVI-002','供应商报名信息','业务来源记录','华北数字科技','集团ERP采购视图','可用','内部','supplier','路径1'],['EVI-003','评审专家抽取记录','审批记录','王**','OA审批事件接口','可用','敏感','reviewer','路径1'],['EVI-004','共同手机号匹配明细','规则运行','手机号 138****8201','规则运行服务','可用','强敏感','phone','路径1']]
  const rows = allRows.filter((row) => filter === '全部' || row[8] === filter || row[2] === filter)
  return <div className="evidence-list-view"><div className="evidence-filter"><select value={filter} onChange={(event) => onFilter(event.target.value)}><option>全部</option><option>路径1</option><option>路径2</option><option>外部数据</option><option>审批记录</option></select><span>共{rows.length}项证据</span></div><div className="table-container evidence-table"><table><thead><tr><th>证据编号 / 名称</th><th>类型</th><th>关联对象</th><th>来源</th><th>状态</th><th>密级</th><th>操作</th></tr></thead><tbody>{rows.map((row) => <tr key={row[0]}><td><strong>{row[1]}</strong><small className="cell-sub">{row[0]} · {row[8]}</small></td><td>{row[2]}</td><td>{row[3]}</td><td>{row[4]}</td><td><StatusTag>{row[5]}</StatusTag></td><td><StatusTag>{row[6]}</StatusTag></td><td><div className="row-actions"><button onClick={() => onSelect(row[7])}>预览</button><button onClick={() => onSelect(row[7])}>定位</button></div></td></tr>)}</tbody></table></div></div>
}

function NodeDetail({ selectedNode, path }: { selectedNode: string; path: string }) {
  return <><KeyValue items={[{ label: '详情类型', value: selectedNode === 'file' ? '附件预览' : selectedNode === 'bid' ? '事件详情' : selectedNode === 'phone' ? '关系与来源' : '节点属性' }, { label: '实体/证据ID', value: `ENTITY-${selectedNode.toUpperCase()}` }, { label: '归属组织', value: '电子云采购中心' }, { label: '业务有效时间', value: '2026-01-01 至今' }, { label: '来源系统', value: selectedNode === 'file' ? '工商司法外部数据' : '集团ERP采购视图' }, { label: '图谱版本', value: 'GRAPH-20260717.2' }, { label: '敏感等级', value: <StatusTag>{selectedNode === 'phone' ? '强敏感' : '内部'}</StatusTag> }]}/>{selectedNode === 'file' && <div className="file-preview"><Icon name="file" size={38}/><strong>工商主体查询记录.pdf</strong><span>历史版本 v20260717 · 内容哈希 8AC2…91F0</span><p>预览摘要：主体登记信息、股东及联系方式查询结果。</p></div>}<Panel title="命中作用" className="drawer-section"><p className="drawer-note">属于{path === 'path1' ? '直接命中路径' : '辅助证据路径'}，参与规则 R-PROC-ASSOC-06。</p></Panel></>
}

export function RiskEventListPage() {
  const navigate = useNavigate()
  const events = useAppStore((state) => state.riskEvents)
  const assignRiskEvent = useAppStore((state) => state.assignRiskEvent)
  const reviewRiskEvent = useAppStore((state) => state.reviewRiskEvent)
  const setToast = useAppStore((state) => state.setToast)
  const [draft, setDraft] = useState({ keyword: '', status: '未关闭', level: '全部', org: '全部', overdue: '全部' })
  const [filters, setFilters] = useState(draft)
  const [page, setPage] = useState(1)
  const [action, setAction] = useState<EventAction>(null)
  const [target, setTarget] = useState<RiskEvent | null>(null)
  const [form, setForm] = useState({ owner: '孙凯', dueAt: '2026-07-20 18:00', requirement: '核查风险事实，明确形成原因并提交整改措施及证明材料。', result: '通过' as '通过' | '退回整改' | '不成立关闭', reason: '', evidence: '' })
  const rows = events.filter((item) => (!filters.keyword || `${item.id}${item.title}${item.target}`.includes(filters.keyword)) && (filters.status === '全部' || filters.status === '未关闭' && item.status !== '已关闭' || item.status === filters.status) && (filters.level === '全部' || item.level === filters.level) && (filters.org === '全部' || item.organization === filters.org) && (filters.overdue === '全部' || (filters.overdue === '是') === item.overdue))
  const totalPages = Math.max(1, Math.ceil(rows.length / listPageSize))
  const pageRows = rows.slice((page - 1) * listPageSize, page * listPageSize)
  const query = () => { setFilters(draft); setPage(1) }
  const execute = () => {
    if (!target || !action) return
    if (action === 'assign') { const result = assignRiskEvent(target.id, form.owner, form.dueAt, form.requirement); setToast(result.message); if (result.ok) setAction(null) }
    if (action === 'review') { const result = reviewRiskEvent(target.id, form.result, form.reason, form.evidence); setToast(result.message); if (result.ok) setAction(null) }
  }
  return <>
    <PageHeader eyebrow="风险监管 / 风险事件" title="风险事件" description="承接已确认风险的责任派发、核查整改、监管复核和关闭留痕。" actions={<Button icon="refresh" onClick={() => setToast('风险事件列表已刷新')}>刷新</Button>}/>
    <div className="page-query page-query-events"><FilterGrid onReset={() => { const value = { keyword: '', status: '未关闭', level: '全部', org: '全部', overdue: '全部' }; setDraft(value); setFilters(value); setPage(1) }} onSearch={query}><Field label="关键词"><input value={draft.keyword} onChange={(event) => setDraft({ ...draft, keyword: event.target.value })} onKeyDown={(event) => event.key === 'Enter' && query()} placeholder="事件编号、标题或主对象"/></Field><Field label="风险等级"><select value={draft.level} onChange={(event) => setDraft({ ...draft, level: event.target.value })}><option>全部</option><option>重大</option><option>高</option><option>中</option></select></Field><Field label="责任组织"><select value={draft.org} onChange={(event) => setDraft({ ...draft, org: event.target.value })}><option>全部</option><option>集团采购中心</option><option>集团财务共享中心</option><option>数据智能事业部</option></select></Field><Field label="状态"><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option>未关闭</option><option>全部</option><option>待派发</option><option>核查整改中</option><option>待复核</option><option>已关闭</option></select></Field><Field label="是否逾期"><select value={draft.overdue} onChange={(event) => setDraft({ ...draft, overdue: event.target.value })}><option>全部</option><option>是</option><option>否</option></select></Field></FilterGrid></div>
    <Panel title="风险事件列表" subtitle={`共 ${rows.length} 项，当前第 ${page}/${totalPages} 页`}><div className="table-container"><table><thead><tr><th>风险事件编号 / 标题</th><th>来源预警</th><th>等级 / 场景</th><th>主对象</th><th>责任组织 / 人</th><th>状态</th><th>截止时间</th><th>最近更新</th><th>操作</th></tr></thead><tbody>{pageRows.map((item) => <tr key={item.id}><td><button className="table-link title-cell" onClick={() => navigate(`/risk/events/${item.id}`)}><strong>{item.title}</strong><span>{item.id}</span></button></td><td><button className="table-link" onClick={() => navigate(`/risk/warnings/${item.warningId}`)}>{item.warningId}</button></td><td><RiskTag level={item.level}/><small className="cell-sub">{item.scene}</small></td><td>{item.target}</td><td>{item.organization}<small className="cell-sub">{item.owner || '待分配'}</small></td><td><StatusTag>{item.status}</StatusTag></td><td><span className={`deadline ${item.overdue ? 'overdue' : ''}`}>{item.dueAt}<small>{item.overdue ? '已逾期' : '正常'}</small></span></td><td>{item.updatedAt}</td><td><div className="row-actions vertical"><button onClick={() => navigate(`/risk/events/${item.id}`)}>查看</button>{item.status === '待派发' && <button onClick={() => { setTarget(item); setAction('assign') }}>派发</button>}{item.status === '待复核' && <button onClick={() => { setTarget(item); setAction('review') }}>复核</button>}</div></td></tr>)}</tbody></table></div><div className="pagination"><span>共 {rows.length} 条</span><button disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>{Array.from({ length: totalPages }, (_, index) => <button key={index + 1} className={page === index + 1 ? 'active' : ''} onClick={() => setPage(index + 1)}>{index + 1}</button>)}<button disabled={page === totalPages} onClick={() => setPage(page + 1)}>›</button></div></Panel>
    <Modal open={!!action} title={action === 'assign' ? '派发风险事件' : '监管复核风险事件'} description={target ? `${target.id} · ${target.title}` : ''} danger={action === 'review'} onClose={() => setAction(null)} onConfirm={execute}><div className="form-stack">{action === 'assign' ? <><Field label="责任人 *"><select value={form.owner} onChange={(event) => setForm({ ...form, owner: event.target.value })}><option>孙凯</option><option>李华</option><option>周航</option></select></Field><Field label="完成时限 *"><input value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })}/></Field><Field label="整改要求 *"><textarea value={form.requirement} onChange={(event) => setForm({ ...form, requirement: event.target.value })}/></Field></> : <><Field label="复核结论 *"><select value={form.result} onChange={(event) => setForm({ ...form, result: event.target.value as typeof form.result })}><option>通过</option><option>退回整改</option><option>不成立关闭</option></select></Field><Field label="复核说明 *"><textarea value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })}/></Field>{form.result !== '退回整改' && <Field label="引用证据 *"><input value={form.evidence} onChange={(event) => setForm({ ...form, evidence: event.target.value })}/></Field>}</>}</div></Modal>
  </>
}

export function RiskEventDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const event = useAppStore((state) => state.riskEvents.find((item) => item.id === id))
  const assignRiskEvent = useAppStore((state) => state.assignRiskEvent)
  const transferRiskEvent = useAppStore((state) => state.transferRiskEvent)
  const submitRectification = useAppStore((state) => state.submitRectification)
  const reviewRiskEvent = useAppStore((state) => state.reviewRiskEvent)
  const setToast = useAppStore((state) => state.setToast)
  const [tab, setTab] = useState('facts')
  const [action, setAction] = useState<EventAction>(null)
  const [selectedNode, setSelectedNode] = useState('')
  const [graphScale, setGraphScale] = useState(1)
  const [graphFullScreen, setGraphFullScreen] = useState(false)
  const [relationFilter, setRelationFilter] = useState('全部关系')
  const [form, setForm] = useState({ owner: '孙凯', dueAt: '2026-07-20 18:00', requirement: '核查风险事实，明确责任边界并提交整改材料。', reason: '', rectificationResult: '已完成', measures: '', materials: [] as string[], reviewResult: '通过' as '通过' | '退回整改' | '不成立关闭', evidence: '' })
  if (!event) return <EmptyState title="风险事件不存在或无权访问" description="请从风险事件列表重新进入。"/>
  const nodeTitle = selectedNode === 'supplier' ? '华北数字科技有限公司' : selectedNode === 'phone' ? '手机号 138****8201' : selectedNode === 'reviewer' ? '评审人员 王**' : selectedNode === 'project' ? '云资源扩容采购项目' : selectedNode === 'bid' ? '中标确认事件' : '工商查询记录'
  const execute = () => {
    if (!action) return
    let result
    if (action === 'assign') result = assignRiskEvent(event.id, form.owner, form.dueAt, form.requirement)
    if (action === 'transfer') result = transferRiskEvent(event.id, form.owner, form.reason)
    if (action === 'submit') result = submitRectification(event.id, form.rectificationResult, form.measures, form.materials)
    if (action === 'review') result = reviewRiskEvent(event.id, form.reviewResult, form.reason, form.evidence)
    if (result) { setToast(result.message); if (result.ok) setAction(null) }
  }
  return <div className={`risk-event-detail-page ${graphFullScreen ? 'graph-fullscreen' : ''}`}>
    <div className="detail-topbar"><div><button className="back-button" onClick={() => navigate('/risk/events')}>‹ 返回风险事件列表</button><p>{event.id}</p><h1>{event.title}</h1></div><div className="detail-top-actions"><Button icon="refresh" onClick={() => setToast('风险事件状态、待办和权限已刷新')}>刷新</Button></div></div>
    <section className="summary-strip risk-summary"><div><span>风险等级</span><RiskTag level={event.level}/></div><div><span>当前状态</span><StatusTag>{event.status}</StatusTag></div><div><span>来源预警</span><button className="table-link" onClick={() => navigate(`/risk/warnings/${event.warningId}`)}>{event.warningId}</button></div><div><span>主对象</span><strong>{event.target}</strong></div><div><span>责任组织 / 人</span><strong>{event.organization}</strong><small>{event.owner || '待分配'}</small></div><div><span>截止时间</span><strong className={event.overdue ? 'danger-text' : ''}>{event.dueAt}</strong><small>{event.overdue ? '已逾期' : '正常'}</small></div></section>
    {event.overdue && event.status !== '已关闭' && <div className="alert-box danger evidence-alert"><Icon name="clock"/><span>当前风险事件已逾期，请优先完成转派、整改或复核。</span></div>}
    <Panel className="risk-event-detail"><Tabs value={tab} onChange={(value) => { setTab(value); if (value !== 'graph') setGraphFullScreen(false) }} items={[{ key: 'facts', label: '风险事实' }, { key: 'graph', label: '证据子图', count: 6 }, { key: 'evidence', label: '实际证据', count: 8 }, { key: 'timeline', label: '处理时间线', count: 5 }, { key: 'rectification', label: '整改反馈', count: event.status === '待复核' || event.status === '已关闭' ? 2 : 0 }, { key: 'review', label: '复核记录', count: event.status === '已关闭' ? 2 : 1 }]}/>{tab === 'facts' && <RiskFacts event={event}/>} {tab === 'graph' && <div className="risk-event-evidence-view"><div className="risk-event-evidence-banner"><span><Icon name="lock" size={17}/></span><div><strong>来源预警固化证据快照</strong><small>{event.warningId} · GRAPH-20260717.2 · 初始证据只读不可覆盖</small></div><StatusTag>只读</StatusTag><Button icon="link" onClick={() => navigate(`/risk/warnings/${event.warningId}`)}>查看来源预警</Button></div><div className="risk-event-evidence-toolbar"><div><strong>证据关系画布</strong><span>初始证据 6 个 · 补充证据将在整改材料中单独登记</span></div><div className="graph-tools"><select value={relationFilter} onChange={(event) => setRelationFilter(event.target.value)}><option>全部关系</option><option>仅命中关系</option><option>隐藏辅助关系</option></select><button onClick={() => setGraphScale(Math.min(1.5, graphScale + .1))}>＋</button><button onClick={() => setGraphScale(Math.max(.7, graphScale - .1))}>－</button><button onClick={() => setGraphScale(1)}><Icon name="refresh" size={14}/>重置</button><button onClick={() => setGraphFullScreen(!graphFullScreen)}><Icon name="eye" size={14}/>{graphFullScreen ? '退出全屏' : '全屏'}</button></div></div><div className="risk-event-graph-stage"><div style={{ transform: `scale(${graphScale})`, transformOrigin: 'center top', transition: '.18s' }}><EvidenceGraph selected={selectedNode} onSelect={setSelectedNode}/></div></div><div className="risk-event-evidence-footnote"><Icon name="lock" size={14}/><span>该画布复用来源预警升级时的证据快照；后续整改证明作为补充证据新增保存，不改变初始风险事实。</span></div></div>} {tab === 'evidence' && <EvidenceTable filter="全部" onFilter={() => undefined} onSelect={() => setToast('证据预览已打开')}/>} {tab === 'timeline' && <RiskTimeline event={event}/>} {tab === 'rectification' && <RectificationView event={event}/>} {tab === 'review' && <ReviewView event={event}/>}</Panel>
    <footer className="fixed-action-bar"><div><span>处置要求</span><strong>核查风险事实并完成整改</strong><small>最近更新：{event.updatedAt}</small></div><div className="action-group"><Button onClick={() => navigate('/risk/events')}>返回</Button>{event.status === '待派发' && <Button variant="primary" icon="user" onClick={() => setAction('assign')}>派发责任人</Button>}{event.status === '核查整改中' && <Button onClick={() => { setForm({ ...form, owner: event.owner === '孙凯' ? '李华' : '孙凯' }); setAction('transfer') }}>转派</Button>}{event.status === '核查整改中' && <Button variant="primary" onClick={() => setAction('submit')}>提交整改</Button>}{event.status === '待复核' && <Button variant="primary" icon="check" onClick={() => setAction('review')}>监管复核</Button>}</div></footer>
    <Modal open={!!action} title={action === 'assign' ? '派发责任人' : action === 'transfer' ? '转派风险事件' : action === 'submit' ? '提交核查整改结果' : '监管复核'} description="操作成功后将同步更新状态、待办、消息、时间线和审计日志。" confirmText={action === 'review' ? '确认复核' : '确认提交'} danger={action === 'review'} onClose={() => setAction(null)} onConfirm={execute}><EventActionForm action={action} form={form} onChange={setForm}/></Modal>
    <Drawer open={!!selectedNode} title={nodeTitle} eyebrow={selectedNode === 'bid' ? '事件详情' : selectedNode === 'file' ? '证据详情与预览' : selectedNode === 'phone' ? '关系证据详情' : '节点详情'} onClose={() => setSelectedNode('')} footer={<><Button onClick={() => setSelectedNode('')}>关闭</Button><Button variant="primary" onClick={() => setToast('已按来源预警快照完成证据溯源')}>来源追溯</Button></>}><div className="alert-box"><Icon name="lock"/><span>当前查看的是风险事件升级时固化的初始证据快照。</span></div><NodeDetail selectedNode={selectedNode} path="path1"/></Drawer>
  </div>
}

function EventActionForm({ action, form, onChange }: { action: EventAction; form: { owner: string; dueAt: string; requirement: string; reason: string; rectificationResult: string; measures: string; materials: string[]; reviewResult: '通过' | '退回整改' | '不成立关闭'; evidence: string }; onChange: (value: typeof form) => void }) {
  if (action === 'assign') return <div className="form-stack"><Field label="责任人 *"><select value={form.owner} onChange={(event) => onChange({ ...form, owner: event.target.value })}><option>孙凯</option><option>李华</option><option>周航</option></select></Field><Field label="完成时限 *"><input value={form.dueAt} onChange={(event) => onChange({ ...form, dueAt: event.target.value })}/></Field><Field label="核查整改要求 *"><textarea value={form.requirement} onChange={(event) => onChange({ ...form, requirement: event.target.value })}/></Field></div>
  if (action === 'transfer') return <div className="form-stack"><Field label="新责任人 *"><select value={form.owner} onChange={(event) => onChange({ ...form, owner: event.target.value })}><option>孙凯</option><option>李华</option><option>周航</option></select></Field><Field label="转派原因 *"><textarea value={form.reason} onChange={(event) => onChange({ ...form, reason: event.target.value })}/></Field></div>
  if (action === 'submit') return <div className="form-stack"><Field label="整改结果 *"><select value={form.rectificationResult} onChange={(event) => onChange({ ...form, rectificationResult: event.target.value })}><option>已完成</option><option>部分完成</option><option>无法完成</option><option>无需整改</option></select></Field><Field label="整改措施 *"><textarea value={form.measures} onChange={(event) => onChange({ ...form, measures: event.target.value })} placeholder="至少10个字"/></Field><Field label="证明材料"><div className="upload-zone"><span>{form.materials.length ? form.materials.join('、') : '尚未添加证明材料'}</span><Button onClick={() => onChange({ ...form, materials: [...form.materials, `整改证明-${form.materials.length + 1}.pdf`] })}>模拟上传</Button></div></Field>{['已完成','部分完成'].includes(form.rectificationResult) && form.materials.length === 0 && <div className="alert-box danger"><Icon name="warning"/><span>当前整改结果至少需要一项证明材料。</span></div>}</div>
  return <div className="form-stack"><Field label="复核结论 *"><select value={form.reviewResult} onChange={(event) => onChange({ ...form, reviewResult: event.target.value as typeof form.reviewResult })}><option>通过</option><option>退回整改</option><option>不成立关闭</option></select></Field><Field label="复核说明 *"><textarea value={form.reason} onChange={(event) => onChange({ ...form, reason: event.target.value })}/></Field>{form.reviewResult !== '退回整改' && <Field label="引用证据 *"><input value={form.evidence} onChange={(event) => onChange({ ...form, evidence: event.target.value })} placeholder="例如 EVI-001、整改证明-1.pdf"/></Field>}<div className="alert-box danger"><Icon name="warning"/><span>{form.reviewResult === '退回整改' ? '退回后将重新生成原责任人待办。' : '关闭后事件只读，关联待办关闭并生成效果样本。'}</span></div></div>
}

function RiskFacts({ event }: { event: RiskEvent }) { return <div className="detail-grid"><Panel title="风险事实摘要"><div className="fact-callout"><Icon name="warning" size={24}/><div><strong>{event.title}</strong><p>来源预警的初始证据快照、规则版本和本体图谱版本已经固化，后续材料以新增记录保存。</p></div></div><KeyValue items={[{ label: '风险场景', value: event.scene }, { label: '主对象', value: event.target }, { label: '来源预警', value: event.warningId }, { label: '本体版本', value: 'BASE v1.6 / PROC v2.2' }, { label: '图谱版本', value: 'GRAPH-20260717.2' }, { label: '规则版本', value: 'SCENE v2.3 / RULE v6.1' }]}/></Panel><Panel title="处置要求"><ul className="check-list"><li><Icon name="check"/>确认主体关联事实与责任边界</li><li><Icon name="check"/>提交核查过程和证明材料</li><li><Icon name="clock"/>在截止时间前完成整改反馈</li><li><Icon name="lock"/>初始证据快照只读不可覆盖</li></ul></Panel></div> }
function RiskTimeline({ event }: { event: RiskEvent }) { const rows = [['预警生成','规则命中并固化证据快照'],['升级风险事件','监管人员确认风险'],[event.status === '待派发' ? '等待派发' : '已派发责任人', event.owner || '待分配'],[event.status === '待复核' || event.status === '已关闭' ? '已提交整改' : '等待整改反馈','证明材料以新增记录保存'],[event.status === '已关闭' ? '复核关闭' : '等待监管复核',event.status]]; return <div className="timeline risk-timeline">{rows.map((item,index) => <button key={item[0]} className={index === rows.length - 1 ? 'future' : ''}><i/><time>{index < 2 ? '历史记录' : '当前阶段'}</time><div><strong>{item[0]}</strong><span>{item[1]}</span></div></button>)}</div> }
function RectificationView({ event }: { event: RiskEvent }) { return event.status === '核查整改中' || event.status === '待派发' ? <div className="empty-state"><span><Icon name="file"/></span><strong>尚未提交整改反馈</strong><p>责任人提交后将在此展示事实确认、原因分析、措施和证明材料。</p></div> : <div className="record-list"><article><header><div><strong>核查整改反馈</strong><span>{event.owner} · 最近提交</span></div><StatusTag>已提交</StatusTag></header><p>已完成主体关系核查并补充评审回避声明，相关材料以新增记录保存。</p><div className="attachment"><Icon name="file"/><span>整改证明-1.pdf</span><button>预览</button></div></article></div> }
function ReviewView({ event }: { event: RiskEvent }) { return <div className="review-card"><StatusTag>{event.status === '已关闭' ? '复核通过' : '待复核'}</StatusTag><h3>监管复核记录</h3><p>{event.status === '已关闭' ? '风险事实和整改材料完整，整改措施已执行，事件已经关闭。' : '等待监管负责人选择通过、退回整改或不成立关闭。'}</p></div> }
