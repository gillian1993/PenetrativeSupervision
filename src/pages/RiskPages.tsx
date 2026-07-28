import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAppStore } from '../store'
import { demoDataApi, type DemoEvidence, type DemoWarningDetail } from '../demoDataApi'
import { inferSituationDomain, SITUATION_DOMAINS } from '../situationDomains'
import type { RiskEvent, Warning } from '../types'
import { Button, Drawer, EmptyState, EvidenceGraph, Field, FilterGrid, Icon, KeyValue, Modal, PageHeader, Panel, RiskTag, StatusTag, Tabs } from '../ui'

type WarningAction = 'transfer' | 'release' | 'escalate' | null
type EventAction = 'transfer' | 'submit' | 'review' | null
const listPageSize = 4

const actionMeta: Record<Exclude<WarningAction, null>, { title: string; description: string; confirm: string; danger?: boolean }> = {
  transfer: { title: '转派预警', description: '仅变更当前处理人，不改变预警状态；工作台待办会同步转给新处理人。', confirm: '确认转派' },
  release: { title: '解除预警', description: '必须填写解除原因并引用证据，提交后关闭对应工作台待办。', confirm: '确认解除', danger: true },
  escalate: { title: '升级风险事件', description: '确认风险后创建一条风险事件，并指定首位整改责任人和完成时限。', confirm: '确认升级', danger: true },
}

export function WarningListPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const warnings = useAppStore((state) => state.warnings)
  const scenes = useAppStore((state) => state.scenes)
  const warningSource = useAppStore((state) => state.warningSource)
  const loadWarningsFromDatabase = useAppStore((state) => state.loadWarningsFromDatabase)
  const riskEvents = useAppStore((state) => state.riskEvents)
  const currentRole = useAppStore((state) => state.currentRole)
  const transferWarning = useAppStore((state) => state.transferWarning)
  const releaseWarning = useAppStore((state) => state.releaseWarning)
  const escalateWarning = useAppStore((state) => state.escalateWarning)
  const setToast = useAppStore((state) => state.setToast)
  const initialStatus = searchParams.get('status') === 'open' ? '待研判' : searchParams.get('status') || '待研判'
  const [draft, setDraft] = useState({ keyword: '', status: initialStatus, stage: searchParams.get('stage') || '全部', level: searchParams.get('level') === 'high' ? '重大、高' : searchParams.get('level') || '全部', scene: '全部', org: searchParams.get('org') || '全部', domain: searchParams.get('domain') || '全部', evidence: '全部' })
  const [filters, setFilters] = useState(draft)
  const [sort, setSort] = useState<'level' | 'time'>('level')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [action, setAction] = useState<WarningAction>(null)
  const [target, setTarget] = useState<Warning | null>(null)
  const [form, setForm] = useState({ owner: '', dueAt: '2026-07-24 18:00', requirement: '确认风险事实、明确影响范围并提交整改证明材料。', reason: '', evidence: '' })
  const [columnOpen, setColumnOpen] = useState(false)
  const [columns, setColumns] = useState(['阶段', '场景', '对象', '等级', '路径', '状态', '证据', '时间'])
  const eventByWarning = useMemo(() => new Map(riskEvents.map((item) => [item.warningId, item.id])), [riskEvents])
  const sceneDomains = useMemo(() => Object.fromEntries(scenes.map((item) => [item.name, item.domain])), [scenes])

  const rows = useMemo(() => {
    const order = { 重大: 4, 高: 3, 中: 2, 低: 1 }
    return warnings.filter((item) => {
      if (filters.keyword && !`${item.id}${item.title}${item.target}`.toLowerCase().includes(filters.keyword.toLowerCase())) return false
      if (filters.status !== '全部' && item.status !== filters.status) return false
      if (filters.stage !== '全部' && item.stage !== filters.stage) return false
      if (filters.level !== '全部' && !filters.level.includes(item.level)) return false
      if (filters.scene !== '全部' && item.scene !== filters.scene) return false
      if (filters.org !== '全部' && item.organization !== filters.org) return false
      if (filters.domain !== '全部' && inferSituationDomain(sceneDomains[item.scene], `${item.scene}${item.title}${item.target}${item.path}`) !== filters.domain) return false
      if (filters.evidence !== '全部' && item.evidenceStatus !== filters.evidence) return false
      return true
    }).sort((a, b) => sort === 'level' ? order[b.level] - order[a.level] : b.generatedAt.localeCompare(a.generatedAt))
  }, [warnings, filters, sort, sceneDomains])
  const totalPages = Math.max(1, Math.ceil(rows.length / listPageSize))
  const pageRows = rows.slice((page - 1) * listPageSize, page * listPageSize)

  const openAction = (item: Warning, next: Exclude<WarningAction, null>) => {
    setTarget(item)
    setAction(next)
    setForm({
      owner: next === 'escalate' ? '' : item.owner === '李华' ? '王宁' : '李华',
      dueAt: '2026-07-24 18:00',
      requirement: '确认风险事实、明确影响范围并提交整改证明材料。',
      reason: '',
      evidence: '',
    })
  }
  const executeAction = () => {
    if (!target || !action) return
    const result = action === 'transfer'
      ? transferWarning(target.id, form.owner, form.reason)
      : action === 'release'
        ? releaseWarning(target.id, form.reason, form.evidence)
        : escalateWarning(target.id, form.owner, form.dueAt, form.requirement, form.reason)
    setToast(result.message)
    if (result.ok) {
      setAction(null)
      setPage(1)
    }
  }
  const query = async () => {
    setLoading(true)
    const result = await loadWarningsFromDatabase()
    setFilters(draft)
    setPage(1)
    setLoading(false)
    setToast(result.ok ? result.message : `刷新失败，继续展示本地数据：${result.message}`)
  }

  return <>
    <PageHeader eyebrow="风险监管 / 统一预警" title="统一预警" description="统一查询事前、事中和事后预警，完成查看、转派、解除和风险升级。" actions={<><span className="updated-time">数据：{warningSource === 'database' ? 'MySQL证据 · 工作流可操作' : '本地演示数据'} · 当前角色：{currentRole}</span><Button icon="refresh" onClick={() => void query()}>刷新</Button></>}/>
    <div className="page-query page-query-warning">
      <FilterGrid onReset={() => { const value = { keyword: '', status: '待研判', stage: '全部', level: '全部', scene: '全部', org: '全部', domain: '全部', evidence: '全部' }; setDraft(value); setFilters(value); setPage(1) }} onSearch={query}>
        <Field label="关键词"><input value={draft.keyword} onChange={(event) => setDraft({ ...draft, keyword: event.target.value })} onKeyDown={(event) => event.key === 'Enter' && void query()} placeholder="预警编号、标题或目标对象"/></Field>
        <Field label="预警阶段"><select value={draft.stage} onChange={(event) => setDraft({ ...draft, stage: event.target.value })}><option>全部</option><option>事前</option><option>事中</option><option>事后</option></select></Field>
        <Field label="处理状态"><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option>待研判</option><option value="全部">全部预警</option><option>已解除</option><option>已升级</option></select></Field>
        <Field label="风险等级"><select value={draft.level} onChange={(event) => setDraft({ ...draft, level: event.target.value })}><option>全部</option><option>重大、高</option><option>重大</option><option>高</option><option>中</option><option>低</option></select></Field>
        <Field label="风险场景"><select value={draft.scene} onChange={(event) => setDraft({ ...draft, scene: event.target.value })}><option>全部</option><option>供应商异常关联</option><option>合同签订风险</option><option>付款执行风险</option><option>供应商资格风险</option></select></Field>
        <Field label="组织范围"><select value={draft.org} onChange={(event) => setDraft({ ...draft, org: event.target.value })}><option>全部</option><option>电子云采购中心</option><option>集团财务共享中心</option><option>集团采购中心</option></select></Field>
        <Field label="监管领域"><select value={draft.domain} onChange={(event) => setDraft({ ...draft, domain: event.target.value })}><option>全部</option>{SITUATION_DOMAINS.map((item) => <option key={item.key}>{item.key}</option>)}</select></Field>
        <Field label="证据状态"><select value={draft.evidence} onChange={(event) => setDraft({ ...draft, evidence: event.target.value })}><option>全部</option><option>完整</option><option>部分缺失</option><option>权限受限</option><option>快照异常</option></select></Field>
      </FilterGrid>
    </div>
    <Panel title="预警列表" subtitle={`共 ${rows.length} 条，当前第 ${page}/${totalPages} 页`} actions={<><div className="segmented"><button className={sort === 'level' ? 'active' : ''} onClick={() => setSort('level')}>等级排序</button><button className={sort === 'time' ? 'active' : ''} onClick={() => setSort('time')}>时间排序</button></div><button className="column-setting" onClick={() => setColumnOpen(true)}><Icon name="system" size={15}/>列设置</button></>}>
      <div className="active-filters"><span>已生效筛选</span>{Object.entries(filters).filter(([, value]) => value && value !== '全部').map(([key, value]) => <b key={key}>{value}</b>)}</div>
      {loading ? <div className="table-loading"><i/><span>正在查询预警数据…</span></div> : pageRows.length === 0 ? <div className="empty-state"><span><Icon name="search"/></span><strong>没有符合条件的预警</strong><p>请调整筛选条件后重新查询。</p></div> : <div className="table-container"><table className="warning-table"><thead><tr><th>预警编号 / 标题</th>{columns.includes('阶段') && <th>阶段</th>}{columns.includes('场景') && <th>风险场景</th>}{columns.includes('对象') && <th>目标对象 / 事件</th>}{columns.includes('等级') && <th>等级</th>}{columns.includes('路径') && <th>核心路径</th>}{columns.includes('状态') && <th>状态</th>}{columns.includes('证据') && <th>证据</th>}{columns.includes('时间') && <th>生成时间</th>}<th>操作</th></tr></thead><tbody>{pageRows.map((item) => <tr key={item.id}><td><button className="table-link title-cell" onClick={() => navigate(`/risk/warnings/${item.id}`)}><strong>{item.title}</strong><span>{item.id}</span></button></td>{columns.includes('阶段') && <td><StatusTag>{item.stage}</StatusTag></td>}{columns.includes('场景') && <td>{item.scene}<small className="cell-sub">{item.sceneVersion}</small></td>}{columns.includes('对象') && <td><strong>{item.evidenceStatus === '权限受限' ? '受限对象' : item.target}</strong><small className="cell-sub">{item.targetEvent}</small></td>}{columns.includes('等级') && <td><RiskTag level={item.level}/></td>}{columns.includes('路径') && <td><span className="path-summary">{item.evidenceStatus === '权限受限' ? '受限关系路径' : item.path}</span></td>}{columns.includes('状态') && <td><StatusTag>{item.status}</StatusTag></td>}{columns.includes('证据') && <td><button className="table-link" onClick={() => navigate(`/risk/warnings/${item.id}`)}><StatusTag>{item.evidenceStatus}</StatusTag></button></td>}{columns.includes('时间') && <td>{item.generatedAt.slice(5)}<small className="cell-sub">{item.leadTime}</small></td>}<td><div className="row-actions vertical"><button onClick={() => navigate(`/risk/warnings/${item.id}`)}>查看</button>{item.status === '已升级' && eventByWarning.get(item.id) && <button onClick={() => navigate(`/risk/events/${eventByWarning.get(item.id)}`)}>查看风险事件</button>}{item.status === '待研判' && <button onClick={() => openAction(item, 'transfer')}>转派</button>}{item.status === '待研判' && <button onClick={() => openAction(item, 'release')}>解除</button>}{item.status === '待研判' && <button onClick={() => openAction(item, 'escalate')}>升级</button>}</div></td></tr>)}</tbody></table></div>}
      <div className="pagination"><span>共 {rows.length} 条</span><button disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>{Array.from({ length: totalPages }, (_, index) => <button key={index + 1} className={page === index + 1 ? 'active' : ''} onClick={() => setPage(index + 1)}>{index + 1}</button>)}<button disabled={page === totalPages} onClick={() => setPage(page + 1)}>›</button></div>
    </Panel>
    <Modal open={!!action} title={action ? actionMeta[action].title : ''} description={action ? actionMeta[action].description : ''} confirmText={action ? actionMeta[action].confirm : ''} danger={action ? actionMeta[action].danger : false} onClose={() => setAction(null)} onConfirm={executeAction}>{action && target && <WarningActionForm action={action} warning={target} form={form} onChange={setForm}/>}</Modal>
    <Drawer open={columnOpen} title="预警列表列设置" eyebrow="显示与排序" onClose={() => setColumnOpen(false)} footer={<><Button onClick={() => setColumns(['阶段','场景','对象','等级','路径','状态','证据','时间'])}>恢复默认</Button><Button variant="primary" onClick={() => { setColumnOpen(false); setToast('列设置已保存') }}>应用设置</Button></>}><div className="check-grid vertical">{['阶段','场景','对象','等级','路径','状态','证据','时间'].map((column) => <label key={column}><input type="checkbox" checked={columns.includes(column)} onChange={() => setColumns((value) => value.includes(column) ? value.filter((item) => item !== column) : [...value, column])}/><span>{column}</span></label>)}</div></Drawer>
  </>
}

function WarningActionForm({ action, warning, form, onChange }: { action: Exclude<WarningAction, null>; warning: Warning; form: { owner: string; dueAt: string; requirement: string; reason: string; evidence: string }; onChange: (value: typeof form) => void }) {
  return <div className="form-stack"><div className="operation-target"><RiskTag level={warning.level}/><div><strong>{warning.title}</strong><span>{warning.id} · 当前处理人：{warning.owner || '待分配'}</span></div></div>{action === 'transfer' && <><Field label="新处理人 *"><select value={form.owner} onChange={(event) => onChange({ ...form, owner: event.target.value })}><option>李华</option><option>王宁</option><option>周航</option><option>孙凯</option><option>尹晨阳</option></select></Field><Field label="转派原因"><textarea value={form.reason} onChange={(event) => onChange({ ...form, reason: event.target.value })} placeholder="可选，说明职责调整或转派原因"/></Field><div className="alert-box"><Icon name="user"/><span>转派只变更处理人，预警仍保持“待研判”。</span></div></>}{action === 'release' && <><Field label="解除原因 *"><select value={form.reason} onChange={(event) => onChange({ ...form, reason: event.target.value })}><option value="">请选择</option><option>规则误报</option><option>条件已经消失</option><option>已取得有效授权</option></select></Field><Field label="引用证据 *"><input value={form.evidence} onChange={(event) => onChange({ ...form, evidence: event.target.value })} placeholder="输入证据编号或说明"/></Field></>}{action === 'escalate' && <><div className="alert-box danger"><Icon name="warning"/><span>升级后预警状态变为“已升级”，并创建一条“待整改”风险事件。</span></div><Field label="整改责任人 *"><select value={form.owner} onChange={(event) => onChange({ ...form, owner: event.target.value })}><option value="">请选择责任人</option><option>李华</option><option>王宁</option><option>周航</option><option>孙凯</option></select></Field><Field label="完成时限 *"><input value={form.dueAt} onChange={(event) => onChange({ ...form, dueAt: event.target.value })}/></Field><Field label="整改要求 *"><textarea value={form.requirement} onChange={(event) => onChange({ ...form, requirement: event.target.value })}/></Field><Field label="风险确认说明"><textarea value={form.reason} onChange={(event) => onChange({ ...form, reason: event.target.value })} placeholder="可选，补充说明风险判断依据"/></Field></>}</div>
}

export function WarningDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const storedWarning = useAppStore((state) => state.warnings.find((item) => item.id === id))
  const linkedRiskEvent = useAppStore((state) => state.riskEvents.find((item) => item.warningId === id))
  const currentRole = useAppStore((state) => state.currentRole)
  const transferWarning = useAppStore((state) => state.transferWarning)
  const releaseWarning = useAppStore((state) => state.releaseWarning)
  const escalateWarning = useAppStore((state) => state.escalateWarning)
  const setToast = useAppStore((state) => state.setToast)
  const [tab, setTab] = useState('graph')
  const [path, setPath] = useState('path1')
  const [selectedNode, setSelectedNode] = useState('')
  const [action, setAction] = useState<WarningAction>(null)
  const [graphScale, setGraphScale] = useState(1)
  const [fullScreen, setFullScreen] = useState(false)
  const [relationFilter, setRelationFilter] = useState<DatabaseGraphRelationFilter>('核心证据链')
  const [graphViewMode, setGraphViewMode] = useState<DatabaseGraphViewMode>('风险链视图')
  const [showGraphEvents, setShowGraphEvents] = useState(false)
  const [evidenceFilter, setEvidenceFilter] = useState('全部')
  const [form, setForm] = useState({ owner: '', dueAt: '2026-07-24 18:00', requirement: '确认风险事实、明确影响范围并提交整改证明材料。', reason: '', evidence: '' })
  const [databaseDetail, setDatabaseDetail] = useState<DemoWarningDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(true)
  useEffect(() => {
    let active = true
    setDatabaseDetail(null)
    setDetailLoading(true)
    void demoDataApi.warningDetail(id).then((detail) => { if (active) setDatabaseDetail(detail) }).catch(() => { if (active) setDatabaseDetail(null) }).finally(() => { if (active) setDetailLoading(false) })
    return () => { active = false }
  }, [id])
  const warning: Warning | undefined = databaseDetail?.warning
    ? { ...databaseDetail.warning, status: storedWarning?.status || databaseDetail.warning.status, owner: storedWarning?.owner || databaseDetail.warning.owner, updatedAt: storedWarning?.updatedAt || databaseDetail.warning.updatedAt }
    : storedWarning
  const databaseBackedWarning = Boolean(storedWarning && 'databaseBacked' in storedWarning)
  const databaseSourced = databaseBackedWarning || Boolean(databaseDetail)
  if (!warning && detailLoading) return <div className="loading-state"><i/><span>正在从MySQL加载预警详情…</span></div>
  if (!warning) return <EmptyState title="预警不存在或无权访问" description="请返回预警列表重新选择可访问对象。"/>
  const openAction = (next: Exclude<WarningAction, null>) => {
    setAction(next)
    setForm({ ...form, owner: next === 'escalate' ? '' : warning.owner === '李华' ? '王宁' : '李华', reason: '', evidence: '' })
  }
  const execute = () => {
    if (!action) return
    const result = action === 'transfer'
      ? transferWarning(warning.id, form.owner, form.reason)
      : action === 'release'
        ? releaseWarning(warning.id, form.reason, form.evidence)
        : escalateWarning(warning.id, form.owner, form.dueAt, form.requirement, form.reason)
    setToast(result.message)
    if (result.ok) {
      setAction(null)
      if (action === 'escalate' && result.objectId) navigate(`/risk/events/${result.objectId}`)
    }
  }
  const selectedDatabaseNode = databaseDetail?.graph.nodes.find((item) => item.id === selectedNode)
  const selectedDatabaseRelation = databaseDetail?.graph.relations.find((item) => item.id === selectedNode)
  const selectedDatabaseEvent = databaseDetail?.graph.events.find((item) => item.id === selectedNode)
  const nodeTitle = selectedDatabaseNode?.name || (selectedDatabaseRelation ? ontologyElementName(databaseDetail!, 'relation', selectedDatabaseRelation.relationCode) : selectedDatabaseEvent?.name) || (selectedNode === 'supplier' ? '华北数字科技有限公司' : selectedNode === 'phone' ? '手机号 138****8201' : selectedNode === 'reviewer' ? '评审人员 王**' : selectedNode === 'project' ? '云资源扩容采购项目' : selectedNode === 'bid' ? '中标确认事件' : '工商查询记录')
  const canRelease = warning.status === '待研判' && (!['重大','高'].includes(warning.level) || currentRole === '监管负责人')
  const primaryRun = databaseDetail?.runs[0]
  const relationSummary = databaseDetail?.graph.relations.slice(0, 3).map((item) => item.relationCode).join(' → ') || warning.path
  const databaseGraphVersion = databaseDetail?.graph.id || ('graphVersion' in warning ? String(warning.graphVersion) : '')
  const databaseGraphProjection = databaseDetail ? createDatabaseGraphProjection(databaseDetail, relationFilter) : null
  const detailTabs = [{ key: 'graph', label: '证据子图', count: databaseGraphProjection?.nodes.length ?? (databaseBackedWarning ? 0 : path === 'path1' ? 6 : 5) }, { key: 'timeline', label: '业务事件时间轴', count: databaseDetail?.graph.events.length ?? (databaseBackedWarning ? 0 : 5) }, { key: 'policies', label: '制度依据', count: 2 }, { key: 'evidence', label: '实际证据', count: databaseDetail?.evidence.length ?? (databaseBackedWarning ? 0 : 8) }]
  if (databaseDetail?.tradeCycle.length) detailTabs.push({ key: 'trade', label: '循环贸易', count: databaseDetail.tradeCycle.length })
  return <div className={`warning-detail-page ${fullScreen ? 'evidence-fullscreen' : ''}`}>
    <div className="detail-topbar"><div><button className="back-button" onClick={() => navigate('/risk/warnings')}>‹ 返回预警列表</button><p>{warning.id}</p><h1>{warning.title}</h1></div><div className="detail-top-actions"><Button icon="refresh" onClick={() => setToast('已刷新预警状态、任务和权限，历史快照保持不变')}>刷新</Button><Button icon="link" onClick={() => navigator.clipboard?.writeText(warning.id).then(() => setToast('预警编号已复制'))}>复制编号</Button></div></div>
    <section className="summary-strip"><div><span>预警阶段</span><StatusTag>{warning.stage}</StatusTag></div><div><span>处理状态</span><StatusTag>{warning.status}</StatusTag></div><div><span>风险等级</span><RiskTag level={warning.level}/></div><div><span>目标节点 / 组织</span><strong>{warning.targetEvent}</strong><small>{warning.expectedAt}</small><small>{warning.organization}</small></div><div><span>提前量</span><strong>{warning.leadTime}</strong></div><div><span>证据状态</span><StatusTag>{warning.evidenceStatus}</StatusTag></div><div><span>版本</span><strong>{databaseSourced ? `图谱结构 ONT-PROC-DEMO · 图谱 ${databaseGraphVersion || '加载中'} · 场景 ${warning.sceneVersion}` : `图谱结构 v2.2 · 图谱 0717.2 · 规则 ${warning.sceneVersion}`}</strong></div></section>
    {databaseSourced && <div className="alert-box evidence-alert"><Icon name="graph"/><span>节点、关系、事件和贸易明细来自MySQL；预警状态、处理人和工作台待办由演示工作流统一维护，可正常操作。</span><StatusTag>工作流可操作</StatusTag></div>}
    {warning.status === '已升级' && linkedRiskEvent && <div className="alert-box evidence-alert"><Icon name="shield"/><span>该预警已转入风险事件 {linkedRiskEvent.id}，后续处置请在风险事件中完成。</span><Button variant="primary" onClick={() => navigate(`/risk/events/${linkedRiskEvent.id}`)}>查看风险事件</Button></div>}
    {warning.evidenceStatus === '快照异常' && <div className="alert-box danger evidence-alert"><Icon name="warning"/><span>初始证据快照生成失败，当前仅允许查看预警信息；证据补偿不作为预警处置动作展示。</span></div>}
<section className="evidence-workspace"><aside className="risk-explain"><div className="explain-block"><p className="section-kicker">风险说明</p><h2>{warning.title}</h2><p>{primaryRun?.actualValueSummary || warning.path}</p></div><div className="explain-block"><p className="section-kicker">命中规则{databaseDetail?.runs.length ? ` · ${databaseDetail.runs.length}条` : ''}</p>{databaseDetail?.runs.length ? <div className="rule-hit-list">{databaseDetail.runs.map((run) => <div className="rule-hit" key={run.id}><span>{run.ruleCode}</span><strong>{run.ruleName}</strong><p>{run.actualValueSummary || `命中${warning.scene}，已固化实际证据。`}</p></div>)}</div> : <div className="rule-hit"><span>{primaryRun?.ruleCode || '演示规则'}</span><strong>{primaryRun?.ruleName || warning.scene}</strong><p>{primaryRun?.actualValueSummary || `命中${warning.scene}，已固化实际证据。`}</p></div>}</div><div className="explain-block"><p className="section-kicker">核心路径</p><button className="path-card active" onClick={() => setEvidenceFilter('全部')}><b>数据库关系路径</b><span>{relationSummary}</span><small>{databaseDetail && databaseGraphProjection ? `显示${databaseGraphProjection.relations.length}/${databaseDetail.graph.relations.length}条关系 · ${databaseGraphProjection.nodes.length}/${databaseDetail.graph.nodes.length}个节点` : '2跳 · 完整度100%'}</small></button>{!databaseDetail && <button className={path === 'path2' ? 'path-card active' : 'path-card'} onClick={() => { setPath('path2'); setEvidenceFilter('路径2') }}><b>路径 2 · 辅助证据</b><span>供应商 → 工商记录 → 关联人员</span><small>2跳 · 完整度86%</small></button>}</div><div className="explain-block"><p className="section-kicker">制度依据</p><p className="policy-line">《采购管理制度（演示）》v1.0<br/><b>正式演示前确认对应制度条款。</b></p></div><div className="explain-block"><p className="section-kicker">处理记录</p><ul className="plain-list"><li>生成预警：{warning.generatedAt}</li><li>当前处理人：{warning.owner || '待分配'}</li><li>数据来源：{databaseDetail ? '线上MySQL' : '本地演示数据'}</li></ul></div></aside>
<main className="evidence-main"><div className="evidence-toolbar"><Tabs value={tab} onChange={setTab} items={detailTabs}/><div className="graph-tools"><div className="graph-view-switch" aria-label="证据图展示方式"><button className={graphViewMode === '风险链视图' ? 'active' : ''} onClick={() => { setGraphViewMode('风险链视图'); setRelationFilter('核心证据链'); setShowGraphEvents(false) }}>风险链</button><button className={graphViewMode === '完整图谱视图' ? 'active' : ''} onClick={() => { setGraphViewMode('完整图谱视图'); setRelationFilter('全部关系') }}>完整图谱结构</button></div>{graphViewMode === '完整图谱视图' && <select value={relationFilter} onChange={(event) => setRelationFilter(event.target.value as DatabaseGraphRelationFilter)}><option>核心证据链</option><option>仅命中关系</option><option>隐藏辅助关系</option><option>全部关系</option></select>}{databaseDetail && <button className={showGraphEvents ? 'active' : ''} onClick={() => { if (showGraphEvents && selectedDatabaseEvent) setSelectedNode(''); setShowGraphEvents(!showGraphEvents) }}><Icon name="clock" size={14}/>{showGraphEvents ? '隐藏事件实例' : '显示事件实例'}</button>}<button onClick={() => setGraphScale(Math.min(1.5, graphScale + .1))}>＋</button><button onClick={() => setGraphScale(Math.max(.7, graphScale - .1))}>－</button><button onClick={() => setGraphScale(1)}><Icon name="refresh" size={14}/>重置</button><button onClick={() => setFullScreen(!fullScreen)}><Icon name="eye" size={14}/>{fullScreen ? '退出全屏' : '全屏'}</button></div></div>
{tab === 'graph' && (databaseBackedWarning && detailLoading && !databaseDetail ? <DatabaseGraphLoading/> : <div style={{ transform: `scale(${graphScale})`, transformOrigin: 'center top', transition: '.18s' }}>{databaseDetail ? <DatabaseGraphView detail={databaseDetail} filter={relationFilter} viewMode={graphViewMode} showEvents={showGraphEvents} selected={selectedNode} onSelect={setSelectedNode}/> : <EvidenceGraph selected={selectedNode} onSelect={setSelectedNode}/>}</div>)}{tab === 'timeline' && (databaseDetail ? <DatabaseTimeline detail={databaseDetail} onSelect={(key) => { setSelectedNode(key); setShowGraphEvents(true); setTab('graph') }}/> : <Timeline path={path} onSelect={(key) => { setSelectedNode(key); setTab('graph') }}/>) } {tab === 'policies' && <PolicySnapshot/>} {tab === 'evidence' && <EvidenceTable filter={evidenceFilter} onFilter={setEvidenceFilter} onSelect={setSelectedNode} rows={databaseDetail?.evidence}/>} {tab === 'trade' && databaseDetail && <TradeCyclePanel rows={databaseDetail.tradeCycle}/>} </main></section>
<footer className="fixed-action-bar"><div><span>当前处理人</span><strong>{warning.owner || '待分配'}</strong><small>{databaseSourced ? 'MySQL证据 · 工作流可操作' : `当前角色：${currentRole}`}</small></div><div className="action-group"><Button onClick={() => navigate('/risk/warnings')}>返回</Button>{warning.status === '待研判' && <Button icon="user" onClick={() => openAction('transfer')}>转派</Button>}{canRelease && <Button variant="danger" onClick={() => openAction('release')}>解除预警</Button>}{warning.status === '待研判' && <Button variant="primary" icon="shield" onClick={() => openAction('escalate')}>升级风险事件</Button>}{warning.status === '已升级' && linkedRiskEvent && <Button variant="primary" onClick={() => navigate(`/risk/events/${linkedRiskEvent.id}`)}>查看风险事件</Button>}</div></footer>
<Drawer modal={false} className="evidence-inspector" open={!!selectedNode} title={nodeTitle} eyebrow={selectedDatabaseNode ? '节点实例' : selectedDatabaseRelation ? '关系实例' : selectedDatabaseEvent ? '事件实例' : selectedNode === 'bid' ? '事件详情' : selectedNode === 'file' ? '证据详情与预览' : selectedNode === 'phone' ? '关系证据详情' : '节点详情'} onClose={() => setSelectedNode('')} footer={<><Button onClick={() => setSelectedNode('')}>关闭</Button><Button variant="primary" onClick={() => setToast('已打开数据库来源记录摘要')}>来源追溯</Button></>}>{selectedDatabaseNode ? <DatabaseNodeDetail node={selectedDatabaseNode} detail={databaseDetail!}/> : selectedDatabaseRelation ? <DatabaseRelationDetail relation={selectedDatabaseRelation} detail={databaseDetail!}/> : selectedDatabaseEvent ? <DatabaseEventDetail event={selectedDatabaseEvent} detail={databaseDetail!}/> : <NodeDetail selectedNode={selectedNode} path={path}/>}</Drawer>
    <Modal open={!!action} title={action ? actionMeta[action].title : ''} description={action ? actionMeta[action].description : ''} confirmText={action ? actionMeta[action].confirm : ''} danger={action ? actionMeta[action].danger : false} onClose={() => setAction(null)} onConfirm={execute}>{action && <WarningActionForm action={action} warning={warning} form={form} onChange={setForm}/>}</Modal>
  </div>
}

function Timeline({ path, onSelect }: { path: string; onSelect: (key: string) => void }) {
  const items = [{ time: '2026-06-18 09:20', title: '采购项目创建', desc: '云资源扩容采购项目进入需求确认阶段', key: 'project', tone: '' }, { time: '2026-07-08 14:10', title: '供应商报名', desc: path === 'path1' ? '报名记录包含共同手机号' : '工商记录发现关联人员', key: 'supplier', tone: '' }, { time: '2026-07-16 18:35', title: '评审专家抽取', desc: '王**进入本项目评审专家组', key: 'reviewer', tone: 'warning' }, { time: '2026-07-17 07:18', title: '规则命中并生成预警', desc: `当前选择${path === 'path1' ? '直接命中路径' : '辅助证据路径'}`, key: 'phone', tone: 'danger' }, { time: '预计 2026-07-18 15:00', title: '中标确认', desc: '目标节点尚未发生', key: 'bid', tone: 'future' }]
  return <div className="timeline">{items.map((item) => <button key={item.time} className={item.tone} onClick={() => onSelect(item.key)}><time>{item.time}</time><i/><div><strong>{item.title}</strong><span>{item.desc}</span><small>查看详情 · 定位到图中</small></div></button>)}</div>
}

function PolicySnapshot() {
  const rows = [['采购评审管理办法','v3.2','第十二条','评审人员应主动回避利益关联主体。'],['采购项目评审专家管理细则','v1.6','第八条','专家与投标主体存在利益关系时，应申报并回避。']]
  return <div className="record-list policy-snapshot-list">{rows.map((row)=><article key={`${row[0]}-${row[2]}`}><header><div><strong>{row[0]}</strong><span>{row[1]} · {row[2]}</span></div><StatusTag>已固化</StatusTag></header><p>{row[3]}</p><div className="attachment"><Icon name="file"/><span>制度条款快照 · 发布时版本</span><button>预览</button></div></article>)}</div>
}

function evidenceDisplayValue(evidence: DemoEvidence) {
  const parts = evidence.value.split(/\s*\/\s*/)
  if (parts.length === 2 && parts[1].includes('%')) return `${evidence.type.includes('资金') ? '金额' : '数值'} ${parts[0]} · 比例 ${parts[1]}`
  return evidence.value
}

function EvidenceTable({ filter, onFilter, onSelect, rows }: { filter: string; onFilter: (value: string) => void; onSelect: (key: string) => void; rows?: DemoEvidence[] }) {
  if (rows) {
    const sourceTypes = [...new Set(rows.map((row) => row.type))]
    const visible = rows.filter((row) => filter === '全部' || row.type === filter || row.validity === filter)
    return <div className="evidence-list-view"><div className="evidence-filter"><select value={filter} onChange={(event) => onFilter(event.target.value)}><option>全部</option>{sourceTypes.map((item) => <option key={item}>{item}</option>)}<option>有效</option></select><span>数据库证据 {visible.length} 项</span></div><div className="table-container evidence-table"><table><thead><tr><th>证据编号 / 结论</th><th>类型</th><th>字段 / 关系</th><th>证据值</th><th>来源</th><th>有效性</th><th>采集时间</th></tr></thead><tbody>{visible.map((row) => <tr key={row.id}><td><button className="table-link title-cell" onClick={() => onSelect(row.sourceRecord)}><strong>{row.description || row.type}</strong><span>{row.id}</span></button></td><td>{row.type}</td><td>{row.fieldOrRelation}</td><td>{evidenceDisplayValue(row)}</td><td>{row.sourceSystem}<small className="cell-sub">{row.sourceRecord}</small></td><td><StatusTag>{row.validity}</StatusTag></td><td>{row.collectedAt}</td></tr>)}</tbody></table></div></div>
  }
  const allRows = [['EVI-001','工商主体查询记录','外部数据','华北数字科技','工商司法外部数据','可用','内部','file','路径2'],['EVI-002','供应商报名信息','业务来源记录','华北数字科技','集团ERP采购视图','可用','内部','supplier','路径1'],['EVI-003','评审专家抽取记录','审批记录','王**','OA审批事件接口','可用','敏感','reviewer','路径1'],['EVI-004','共同手机号匹配明细','规则运行','手机号 138****8201','规则运行服务','可用','强敏感','phone','路径1']]
  const visible = allRows.filter((row) => filter === '全部' || row[8] === filter || row[2] === filter)
  return <div className="evidence-list-view"><div className="evidence-filter"><select value={filter} onChange={(event) => onFilter(event.target.value)}><option>全部</option><option>路径1</option><option>路径2</option><option>外部数据</option><option>审批记录</option></select><span>共{visible.length}项证据</span></div><div className="table-container evidence-table"><table><thead><tr><th>证据编号 / 名称</th><th>类型</th><th>关联对象</th><th>来源</th><th>状态</th><th>密级</th><th>操作</th></tr></thead><tbody>{visible.map((row) => <tr key={row[0]}><td><strong>{row[1]}</strong><small className="cell-sub">{row[0]} · {row[8]}</small></td><td>{row[2]}</td><td>{row[3]}</td><td>{row[4]}</td><td><StatusTag>{row[5]}</StatusTag></td><td><StatusTag>{row[6]}</StatusTag></td><td><div className="row-actions"><button onClick={() => onSelect(row[7])}>预览</button><button onClick={() => onSelect(row[7])}>定位</button></div></td></tr>)}</tbody></table></div></div>
}

type DatabaseGraphNode = DemoWarningDetail['graph']['nodes'][number]
type DatabaseGraphRelation = DemoWarningDetail['graph']['relations'][number]
type DatabaseGraphEvent = DemoWarningDetail['graph']['events'][number]
type DatabaseGraphKind = 'person' | 'account' | 'organization' | 'business' | 'entity'
type DatabaseGraphPoint = { node: DatabaseGraphNode; x: number; y: number; vx: number; vy: number; target: boolean; kind: DatabaseGraphKind }
type DatabaseGraphEventPoint = { event: DatabaseGraphEvent; x: number; y: number; ownerId: string }
type DatabaseGraphRelationFilter = '核心证据链' | '仅命中关系' | '隐藏辅助关系' | '全部关系'
type DatabaseGraphViewMode = '风险链视图' | '完整图谱视图'
type DatabaseGraphLayout = { width: number; height: number; points: DatabaseGraphPoint[]; relations: DatabaseGraphRelation[]; targetId: string; columns?: Array<{ x: number; label: string }> }
type DatabaseGraphProjection = {
  nodes: DatabaseGraphNode[]
  relations: DatabaseGraphRelation[]
  targetId: string
  hitRelationIds: Set<string>
  connectorRelationIds: Set<string>
}
type DatabaseGraphEdgeGroup = {
  id: string
  fromId: string
  toId: string
  relations: DatabaseGraphRelation[]
}

function databaseGraphKind(classCode: string): DatabaseGraphKind {
  if (classCode.includes('Person')) return 'person'
  if (classCode.includes('Account')) return 'account'
  if (/(Organization|Company|Supplier|Vendor)/i.test(classCode)) return 'organization'
  if (/(Project|Contract|Bid|Order|Payment|Document)/i.test(classCode)) return 'business'
  return 'entity'
}

function resolveDatabaseGraphTarget(nodes: DatabaseGraphNode[], relations: DatabaseGraphRelation[], requestedTargetId: string) {
  if (nodes.some((node) => node.id === requestedTargetId)) return requestedTargetId
  const degree = new Map(nodes.map((node) => [node.id, 0]))
  relations.forEach((relation) => {
    if (degree.has(relation.fromId)) degree.set(relation.fromId, (degree.get(relation.fromId) || 0) + 1)
    if (degree.has(relation.toId)) degree.set(relation.toId, (degree.get(relation.toId) || 0) + 1)
  })
  return [...nodes].sort((left, right) => (degree.get(right.id) || 0) - (degree.get(left.id) || 0) || left.id.localeCompare(right.id))[0]?.id || ''
}

function connectorRelationIds(relations: DatabaseGraphRelation[], targetId: string, requiredNodeIds: Set<string>, hitRelationIds: Set<string>) {
  const adjacency = new Map<string, Array<{ nodeId: string; relation: DatabaseGraphRelation }>>()
  relations.forEach((relation) => {
    adjacency.set(relation.fromId, [...(adjacency.get(relation.fromId) || []), { nodeId: relation.toId, relation }])
    adjacency.set(relation.toId, [...(adjacency.get(relation.toId) || []), { nodeId: relation.fromId, relation }])
  })
  adjacency.forEach((items) => items.sort((left, right) => Number(hitRelationIds.has(right.relation.id)) - Number(hitRelationIds.has(left.relation.id)) || Number(Boolean(right.relation.evidenceId)) - Number(Boolean(left.relation.evidenceId)) || left.relation.id.localeCompare(right.relation.id)))
  const parent = new Map<string, { nodeId: string; relationId: string }>()
  const visited = new Set(targetId ? [targetId] : [])
  const queue = targetId ? [targetId] : []
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]
    for (const item of adjacency.get(current) || []) {
      if (visited.has(item.nodeId)) continue
      visited.add(item.nodeId)
      parent.set(item.nodeId, { nodeId: current, relationId: item.relation.id })
      queue.push(item.nodeId)
    }
  }
  const result = new Set<string>()
  requiredNodeIds.forEach((nodeId) => {
    let current = nodeId
    const pathVisited = new Set<string>()
    while (current && current !== targetId && !pathVisited.has(current)) {
      pathVisited.add(current)
      const step = parent.get(current)
      if (!step) break
      result.add(step.relationId)
      current = step.nodeId
    }
  })
  return result
}

function createDatabaseGraphProjection(detail: DemoWarningDetail, filter: DatabaseGraphRelationFilter): DatabaseGraphProjection {
  const { nodes, relations } = detail.graph
  const targetId = resolveDatabaseGraphTarget(nodes, relations, detail.warning.targetId)
  const warningEvidenceIds = new Set(detail.evidence.map((item) => item.id))
  const hitRelations = relations.filter((relation) => Boolean(relation.evidenceId && warningEvidenceIds.has(relation.evidenceId)))
  const hitRelationIds = new Set(hitRelations.map((relation) => relation.id))
  const evidenceRelations = relations.filter((relation) => Boolean(relation.evidenceId))
  let projectedRelations = relations
  const connectorIds = new Set<string>()
  if (filter === '仅命中关系') projectedRelations = hitRelations
  if (filter === '隐藏辅助关系') projectedRelations = evidenceRelations.length ? evidenceRelations : relations
  if (filter === '核心证据链') {
    const baseRelations = hitRelations.length ? hitRelations : evidenceRelations
    const requiredNodeIds = new Set(baseRelations.flatMap((relation) => [relation.fromId, relation.toId]))
    connectorRelationIds(relations, targetId, requiredNodeIds, hitRelationIds).forEach((relationId) => connectorIds.add(relationId))
    const coreIds = new Set([...baseRelations.map((relation) => relation.id), ...connectorIds])
    projectedRelations = coreIds.size ? relations.filter((relation) => coreIds.has(relation.id)) : relations.filter((relation) => relation.fromId === targetId || relation.toId === targetId)
  }
  const visibleNodeIds = new Set(projectedRelations.flatMap((relation) => [relation.fromId, relation.toId]))
  if (targetId) visibleNodeIds.add(targetId)
  const projectedNodes = filter === '全部关系' ? nodes : nodes.filter((node) => visibleNodeIds.has(node.id))
  return { nodes: projectedNodes, relations: projectedRelations, targetId, hitRelationIds, connectorRelationIds: connectorIds }
}

function groupDatabaseGraphRelations(relations: DatabaseGraphRelation[]) {
  const groups = new Map<string, DatabaseGraphEdgeGroup>()
  relations.forEach((relation) => {
    const key = `${relation.fromId}\u0000${relation.toId}`
    const current = groups.get(key)
    if (current) {
      current.relations.push(relation)
    } else {
      groups.set(key, { id: relation.id, fromId: relation.fromId, toId: relation.toId, relations: [relation] })
    }
  })
  return [...groups.values()]
}

function ontologyElement(detail: DemoWarningDetail, type: 'class' | 'property' | 'relation' | 'event', code: string) {
  return detail.ontology?.elements.find((item) => (type === 'event' ? item.type === 'class' : item.type === type) && item.code === code)
}

function ontologyElementName(detail: DemoWarningDetail, type: 'class' | 'property' | 'relation' | 'event', code: string) {
  return ontologyElement(detail, type, code)?.name || code.split('.').at(-1) || code
}

function ontologyPropertyDefinition(detail: DemoWarningDetail, node: DatabaseGraphNode, propertyKey: string) {
  const fullCode = `${node.classCode}.${propertyKey}`
  return ontologyElement(detail, 'property', fullCode) || detail.ontology?.elements.find((item) => item.type === 'property' && item.ownerCode === node.classCode && item.code.endsWith(`.${propertyKey}`))
}

function databasePropertyValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function databaseRelationLabel(group: DatabaseGraphEdgeGroup, detail: DemoWarningDetail) {
  const names = [...new Set(group.relations.map((relation) => ontologyElementName(detail, 'relation', relation.relationCode)))]
  const primary = names[0].length > 9 ? `${names[0].slice(0, 8)}…` : names[0]
  return names.length > 1 ? `${primary} 等${names.length}种` : primary
}

function databaseRelationVerification(detail: DemoWarningDetail, relation: DatabaseGraphRelation) {
  const evidence = detail.evidence.find((item) => item.id === relation.evidenceId)
  if (!evidence) return '待核查'
  if (evidence.validity === '有效' || evidence.validity === '已核验') return '已核验'
  if (evidence.validity === '无效' || evidence.validity === '数据冲突') return '数据冲突'
  return '待核验'
}

function createDatabaseGraphLayout(nodes: DatabaseGraphNode[], relations: DatabaseGraphRelation[], requestedTargetId: string): DatabaseGraphLayout {
  const width = 900
  const height = 650
  const centerX = width / 2
  const centerY = height / 2 + 18
  if (!nodes.length) return { width, height, points: [] as DatabaseGraphPoint[], relations: [] as DatabaseGraphRelation[], targetId: '' }
  const degree = new Map(nodes.map((node) => [node.id, 0]))
  relations.forEach((relation) => {
    if (degree.has(relation.fromId)) degree.set(relation.fromId, (degree.get(relation.fromId) || 0) + 1)
    if (degree.has(relation.toId)) degree.set(relation.toId, (degree.get(relation.toId) || 0) + 1)
  })
  const targetId = resolveDatabaseGraphTarget(nodes, relations, requestedTargetId)
  const ordered = [...nodes].sort((a, b) => Number(b.id === targetId) - Number(a.id === targetId) || (degree.get(b.id) || 0) - (degree.get(a.id) || 0) || a.id.localeCompare(b.id))
  const points: DatabaseGraphPoint[] = []
  let orbitIndex = 0
  ordered.forEach((node) => {
    const target = node.id === targetId
    if (target) {
      points.push({ node, x: centerX, y: centerY, vx: 0, vy: 0, target, kind: databaseGraphKind(node.classCode) })
      return
    }
    const angle = orbitIndex * Math.PI * (3 - Math.sqrt(5))
    const radius = 230 + orbitIndex % 4 * 65
    points.push({ node, x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius * .82, vx: 0, vy: 0, target, kind: databaseGraphKind(node.classCode) })
    orbitIndex += 1
  })
  const pointIndex = new Map(points.map((point, index) => [point.node.id, index]))
  const visibleRelations = relations.filter((relation) => pointIndex.has(relation.fromId) && pointIndex.has(relation.toId))
  const indexedRelations = visibleRelations.map((relation) => ({ relation, from: pointIndex.get(relation.fromId)!, to: pointIndex.get(relation.toId)! }))
  for (let iteration = 0; iteration < 170; iteration += 1) {
    const forces = points.map(() => ({ x: 0, y: 0 }))
    for (let left = 0; left < points.length; left += 1) {
      for (let right = left + 1; right < points.length; right += 1) {
        let dx = points[right].x - points[left].x
        let dy = points[right].y - points[left].y
        if (Math.abs(dx) + Math.abs(dy) < .01) { dx = (right + 1) * .01; dy = (left + 1) * .01 }
        const distanceSquared = Math.max(625, dx * dx + dy * dy)
        const distance = Math.sqrt(distanceSquared)
        const force = 18000 / distanceSquared
        const forceX = dx / distance * force
        const forceY = dy / distance * force
        forces[left].x -= forceX; forces[left].y -= forceY
        forces[right].x += forceX; forces[right].y += forceY
      }
    }
    indexedRelations.forEach(({ from, to }) => {
      const dx = points[to].x - points[from].x
      const dy = points[to].y - points[from].y
      const distance = Math.max(1, Math.hypot(dx, dy))
      const pull = (distance - 175) * .01
      const forceX = dx / distance * pull
      const forceY = dy / distance * pull
      forces[from].x += forceX; forces[from].y += forceY
      forces[to].x -= forceX; forces[to].y -= forceY
    })
    points.forEach((point, index) => {
      if (point.target) { point.x = centerX; point.y = centerY; point.vx = 0; point.vy = 0; return }
      forces[index].x += (centerX - point.x) * .0015
      forces[index].y += (centerY - point.y) * .0015
      point.vx = (point.vx + forces[index].x) * .76
      point.vy = (point.vy + forces[index].y) * .76
      point.x = Math.min(width - 55, Math.max(55, point.x + point.vx))
      point.y = Math.min(height - 48, Math.max(85, point.y + point.vy))
    })
  }
  return { width, height, points, relations: visibleRelations, targetId }
}

function createDatabaseRiskChainLayout(nodes: DatabaseGraphNode[], relations: DatabaseGraphRelation[], requestedTargetId: string): DatabaseGraphLayout {
  const targetId = resolveDatabaseGraphTarget(nodes, relations, requestedTargetId)
  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]))
  const degree = new Map(nodes.map((node) => [node.id, 0]))
  relations.forEach((relation) => {
    if (adjacency.has(relation.fromId) && adjacency.has(relation.toId)) {
      adjacency.get(relation.fromId)!.push(relation.toId)
      adjacency.get(relation.toId)!.push(relation.fromId)
      degree.set(relation.fromId, (degree.get(relation.fromId) || 0) + 1)
      degree.set(relation.toId, (degree.get(relation.toId) || 0) + 1)
    }
  })
  const distance = new Map<string, number>()
  const queue = targetId ? [targetId] : []
  if (targetId) distance.set(targetId, 0)
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]
    for (const next of adjacency.get(current) || []) {
      if (distance.has(next)) continue
      distance.set(next, (distance.get(current) || 0) + 1)
      queue.push(next)
    }
  }
  const connectedMax = Math.max(0, ...distance.values())
  nodes.forEach((node) => {
    if (!distance.has(node.id)) distance.set(node.id, connectedMax + 1)
  })
  const maxLevel = Math.max(0, ...distance.values())
  const groups = new Map<number, DatabaseGraphNode[]>()
  nodes.forEach((node) => {
    const level = distance.get(node.id) || 0
    groups.set(level, [...(groups.get(level) || []), node])
  })
  const laneRank = (classCode: string) => {
    if (/(Project|Contract)/i.test(classCode)) return 0
    if (/(Supplier|Vendor|Organization|Company)/i.test(classCode)) return 1
    if (/(Order|Item|Document)/i.test(classCode)) return 2
    if (/(Logistics|Receipt|Invoice)/i.test(classCode)) return 3
    if (/(Account|Payment)/i.test(classCode)) return 4
    return 5
  }
  groups.forEach((items) => items.sort((left, right) => laneRank(left.classCode) - laneRank(right.classCode) || (degree.get(right.id) || 0) - (degree.get(left.id) || 0) || left.id.localeCompare(right.id)))
  const width = Math.max(1040, 220 * (maxLevel + 1) + 160)
  const largestColumn = Math.max(1, ...[...groups.values()].map((items) => items.length))
  const height = Math.max(650, largestColumn * 100 + 220)
  const left = 112
  const right = width - 112
  const top = 220
  const bottom = height - 100
  const points: DatabaseGraphPoint[] = []
  groups.forEach((items, level) => {
    const x = maxLevel === 0 ? width / 2 : left + (right - left) * level / maxLevel
    items.forEach((node, index) => {
      const y = items.length === 1 ? (top + bottom) / 2 : top + (bottom - top) * index / (items.length - 1)
      points.push({ node, x, y, vx: 0, vy: 0, target: node.id === targetId, kind: databaseGraphKind(node.classCode) })
    })
  })
  const visibleNodeIds = new Set(points.map((point) => point.node.id))
  const visibleRelations = relations.filter((relation) => visibleNodeIds.has(relation.fromId) && visibleNodeIds.has(relation.toId))
  const columns = Array.from({ length: maxLevel + 1 }, (_, level) => ({
    x: maxLevel === 0 ? width / 2 : left + (right - left) * level / maxLevel,
    label: level === 0 ? '风险主对象' : level === 1 ? '直接证据' : level === maxLevel ? '关联结果' : '证据链延伸',
  }))
  return { width, height, points, relations: visibleRelations, targetId, columns }
}

function DatabaseGraphLoading() {
  return <div className="database-graph-loading" role="status"><i/><strong>正在加载证据关系图</strong><span>从MySQL读取节点、关系和历史知识图谱快照，请稍候…</span></div>
}

function createDatabaseEventLayout(events: DatabaseGraphEvent[], visibleNodeIds: Set<string>, width: number, startY: number) {
  const relatedEvents = events.filter((event) => visibleNodeIds.has(event.objectId) || Boolean(event.actorId && visibleNodeIds.has(event.actorId)) || Boolean(event.organizationId && visibleNodeIds.has(event.organizationId))).sort((left, right) => Number(right.status === '异常') - Number(left.status === '异常') || left.eventTime.localeCompare(right.eventTime))
  const columns = Math.min(5, Math.max(1, relatedEvents.length))
  const rows = Math.max(1, Math.ceil(relatedEvents.length / columns))
  const side = 82
  const usableWidth = width - side * 2
  const points: DatabaseGraphEventPoint[] = relatedEvents.map((event, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    const ownerId = [event.objectId, event.actorId, event.organizationId].find((id): id is string => Boolean(id && visibleNodeIds.has(id))) || ''
    return { event, ownerId, x: columns === 1 ? width / 2 : side + column * usableWidth / (columns - 1), y: startY + row * 96 }
  })
  return { points, height: startY + (rows - 1) * 96 + 72 }
}

function databaseGraphCurve(x1: number, y1: number, x2: number, y2: number, index: number, curvature = 18) {
  const dx = x2 - x1
  const dy = y2 - y1
  const length = Math.max(1, Math.hypot(dx, dy))
  const direction = index % 2 === 0 ? 1 : -1
  const offset = direction * (curvature + Math.floor(index / 2) % 3 * 7)
  const cx = (x1 + x2) / 2 - dy / length * offset
  const cy = (y1 + y2) / 2 + dx / length * offset
  return { path: `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`, labelX: .25 * x1 + .5 * cx + .25 * x2, labelY: .25 * y1 + .5 * cy + .25 * y2 }
}

function DatabaseGraphView({ detail, filter, viewMode, showEvents, selected, onSelect }: { detail: DemoWarningDetail; filter: DatabaseGraphRelationFilter; viewMode: DatabaseGraphViewMode; showEvents: boolean; selected: string; onSelect: (id: string) => void }) {
  const projection = useMemo(() => createDatabaseGraphProjection(detail, filter), [detail, filter])
  const riskChain = viewMode === '风险链视图'
  const layout = useMemo(() => riskChain ? createDatabaseRiskChainLayout(projection.nodes, projection.relations, projection.targetId) : createDatabaseGraphLayout(projection.nodes, projection.relations, projection.targetId), [projection, riskChain])
  const edgeGroups = useMemo(() => groupDatabaseGraphRelations(layout.relations), [layout.relations])
  const pointById = new Map(layout.points.map((point) => [point.node.id, point]))
  const edgePriority = (left: DatabaseGraphEdgeGroup, right: DatabaseGraphEdgeGroup) => Number(right.fromId === layout.targetId || right.toId === layout.targetId) - Number(left.fromId === layout.targetId || left.toId === layout.targetId) || left.id.localeCompare(right.id)
  const hitEdges = edgeGroups.filter((group) => group.relations.some((relation) => projection.hitRelationIds.has(relation.id))).sort(edgePriority)
  const targetEdges = edgeGroups.filter((group) => group.fromId === layout.targetId || group.toId === layout.targetId).sort(edgePriority)
  const labelledEdges = new Set((riskChain ? edgeGroups : filter === '全部关系' ? [...edgeGroups].sort(edgePriority).slice(0, 14) : edgeGroups).map((group) => group.id))
  const spacious = layout.points.length <= 12
  const dense = layout.points.length > 24
  const nodeRadius = spacious ? 42 : dense ? 29 : 35
  const targetRadius = nodeRadius + 7
  const nodeLabelLimit = spacious ? 10 : 8
  const visibleNodeIds = new Set(layout.points.map((point) => point.node.id))
  const eventLayout = createDatabaseEventLayout(detail.graph.events, visibleNodeIds, layout.width, layout.height + 54)
  const canvasHeight = showEvents && eventLayout.points.length ? eventLayout.height + 82 : layout.height
  const selectedRelation = layout.relations.find((relation) => relation.id === selected)
  const selectedEvent = detail.graph.events.find((event) => event.id === selected)
  const selectedEventOwnerId = selectedEvent ? [selectedEvent.objectId, selectedEvent.actorId, selectedEvent.organizationId].find((id) => Boolean(id && visibleNodeIds.has(id))) || '' : ''
  const graphId = detail.graph.id.replace(/[^a-zA-Z0-9]/g, '')
  const arrowId = `databaseGraphArrow-${graphId}`
  const classGradientId = `databaseGraphClass-${graphId}`
  const coreGradientId = `databaseGraphCore-${graphId}`
  const eventGradientId = `databaseGraphEvent-${graphId}`
  let mappedPropertyCount = 0
  let extensionPropertyCount = 0
  layout.points.forEach((point) => Object.keys(point.node.properties).forEach((propertyKey) => {
    if (ontologyPropertyDefinition(detail, point.node, propertyKey)) mappedPropertyCount += 1
    else extensionPropertyCount += 1
  }))
  if (!layout.points.length) return <EmptyState title="暂无图谱节点" description="该预警尚未形成可展示的节点与关系。"/>
  return <div className={`database-graph-view ontology-instance-view ${riskChain ? 'risk-chain-view' : 'full-ontology-view'} ${selected ? 'has-selection' : ''} ${spacious ? 'spacious' : dense ? 'dense' : ''}`}>
    <div className="database-graph-header"><div><strong>图谱实例证据图 · {detail.graph.id}</strong><span>{detail.ontology?.name || detail.ontology?.id || '监管图谱结构'} {detail.ontology?.version || ''} · {detail.warning.caseId} · {layout.points.length}/{detail.graph.nodes.length} 个节点实例、{layout.relations.length}/{detail.graph.relations.length} 个关系实例、{showEvents ? eventLayout.points.length : 0}/{detail.graph.events.length} 个事件实例</span></div><StatusTag>{viewMode}</StatusTag></div>
    {riskChain && <div className="database-graph-guide"><b/><span>沿红色箭头从左向右阅读，即为本次风险的核心证据链；浅灰虚线仅用于补充上下文。</span></div>}
    <svg viewBox={`0 0 ${layout.width} ${canvasHeight}`} role="img" aria-label={`基于图谱结构实例化的MySQL预警证据子图，当前模式${filter}`}>
      <defs>
        <marker id={arrowId} markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z"/></marker>
        <radialGradient id={classGradientId} cx="32%" cy="24%"><stop offset="0%" stopColor="#fff"/><stop offset="38%" stopColor="#fff"/><stop offset="68%" stopColor="#d5e5ff"/><stop offset="100%" stopColor="#4d89e3"/></radialGradient>
        <radialGradient id={coreGradientId} cx="30%" cy="22%"><stop offset="0%" stopColor="#fff"/><stop offset="36%" stopColor="#fff"/><stop offset="66%" stopColor="#c2d9ff"/><stop offset="100%" stopColor="#2b70d2"/></radialGradient>
        <radialGradient id={eventGradientId} cx="31%" cy="23%"><stop offset="0%" stopColor="#fff"/><stop offset="36%" stopColor="#fff"/><stop offset="68%" stopColor="#e3d8ff"/><stop offset="100%" stopColor="#8256da"/></radialGradient>
        <filter id="databaseGraphShadow" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="7" stdDeviation="6" floodColor="#365f91" floodOpacity=".22"/></filter>
      </defs>
      {riskChain && layout.columns?.map((column, index) => <g className="database-graph-stage-column" key={`${column.label}-${index}`}><line x1={column.x} x2={column.x} y1="164" y2={layout.height - 42}/><rect x={column.x - 46} y="132" width="92" height="24" rx="12"/><text x={column.x} y="148" textAnchor="middle">{column.label}</text></g>)}
      {edgeGroups.map((group, index) => {
        const from = pointById.get(group.fromId); const to = pointById.get(group.toId)
        if (!from || !to) return null
        const dx = to.x - from.x; const dy = to.y - from.y; const length = Math.max(1, Math.hypot(dx, dy))
        const fromRadius = from.target ? targetRadius + 3 : nodeRadius + 3; const toRadius = to.target ? targetRadius + 3 : nodeRadius + 3
        const x1 = from.x + dx / length * fromRadius; const y1 = from.y + dy / length * fromRadius
        const x2 = to.x - dx / length * toRadius; const y2 = to.y - dy / length * toRadius
        const geometry = databaseGraphCurve(x1, y1, x2, y2, index)
        const active = selected === group.id || selected === group.fromId || selected === group.toId
        const selectedOwnerRelated = Boolean(selectedEventOwnerId && (group.fromId === selectedEventOwnerId || group.toId === selectedEventOwnerId))
        const muted = Boolean(selected && !active && !selectedOwnerRelated)
        const hit = group.relations.some((relation) => projection.hitRelationIds.has(relation.id))
        const connector = !hit && group.relations.some((relation) => projection.connectorRelationIds.has(relation.id))
        const label = databaseRelationLabel(group, detail); const labelWidth = Math.max(54, label.length * 12 + 20)
        const relationTitle = group.relations.map((relation) => `${ontologyElementName(detail, 'relation', relation.relationCode)}（${relation.relationCode}，${databaseRelationVerification(detail, relation)}）`).join('；')
        return <g key={group.id} role="button" tabIndex={0} aria-label={`关系实例：${relationTitle}`} className={`database-graph-edge ${active ? 'active' : ''} ${muted ? 'muted' : ''} ${hit ? 'hit' : connector ? 'connector' : ''}`} onClick={() => onSelect(group.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelect(group.id) }}>
          <title>{pointById.get(group.fromId)?.node.name} —{relationTitle}→ {pointById.get(group.toId)?.node.name}</title>
          <path className="edge-hit-area" d={geometry.path}/>
          <path className="relation-path" d={geometry.path} markerEnd={`url(#${arrowId})`}/>
          {labelledEdges.has(group.id) && <g className={`relation-label ${!riskChain || hit || active ? 'always' : ''}`}><rect x={geometry.labelX - labelWidth / 2} y={geometry.labelY - 12} width={labelWidth} height="24" rx="12"/><text x={geometry.labelX} y={geometry.labelY + 4} textAnchor="middle">{label}</text></g>}
        </g>
      })}
      {showEvents && eventLayout.points.map((point, index) => {
        const owner = pointById.get(point.ownerId)
        if (!owner) return null
        const eventRadius = dense ? 27 : 32
        const dx = point.x - owner.x; const dy = point.y - owner.y; const length = Math.max(1, Math.hypot(dx, dy))
        const ownerRadius = owner.target ? targetRadius + 3 : nodeRadius + 3
        const x1 = owner.x + dx / length * ownerRadius; const y1 = owner.y + dy / length * ownerRadius
        const x2 = point.x - dx / length * (eventRadius + 3); const y2 = point.y - dy / length * (eventRadius + 3)
        const geometry = databaseGraphCurve(x1, y1, x2, y2, index, 12)
        const eventLinkMuted = Boolean(selected && selected !== point.event.id && selected !== point.ownerId)
        return <g className={`database-event-link ${selected === point.event.id ? 'active' : ''} ${eventLinkMuted ? 'muted' : ''}`} key={`event-link-${point.event.id}`}><path d={geometry.path} markerEnd={`url(#${arrowId})`}/><text x={geometry.labelX} y={geometry.labelY - 3} textAnchor="middle">发生</text></g>
      })}
      {layout.points.map((point) => {
        const nodeLabel = point.node.name.length > nodeLabelLimit ? `${point.node.name.slice(0, nodeLabelLimit - 1)}…` : point.node.name
        const className = ontologyElementName(detail, 'class', point.node.classCode)
        const classLabel = className.length > 7 ? `${className.slice(0, 6)}…` : className
        const propertyCount = Object.keys(point.node.properties).filter((key) => ontologyPropertyDefinition(detail, point.node, key)).length
        const selectedNodeRelated = Boolean(selected && layout.relations.some((relation) => (relation.fromId === selected && relation.toId === point.node.id) || (relation.toId === selected && relation.fromId === point.node.id)))
        const related = Boolean(selectedRelation && (selectedRelation.fromId === point.node.id || selectedRelation.toId === point.node.id)) || selectedEventOwnerId === point.node.id || selectedNodeRelated
        const muted = Boolean(selected && selected !== point.node.id && !related)
        return <g key={point.node.id} role="button" tabIndex={0} aria-label={`${className}节点实例：${point.node.name}`} className={`database-graph-node ontology-class-instance ${point.target ? 'target' : ''} ${selected === point.node.id ? 'selected' : ''} ${related ? 'related' : ''} ${muted ? 'muted' : ''}`} transform={`translate(${point.x},${point.y})`} onClick={() => onSelect(point.node.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelect(point.node.id) }}>
          <title>{point.node.name} · 类：{className}（{point.node.classCode}）· {point.node.id}</title>
          <circle className="selection" r={point.target ? targetRadius + 7 : nodeRadius + 7}/>
          <circle className="sphere" r={point.target ? targetRadius : nodeRadius} style={{ fill: `url(#${point.target ? coreGradientId : classGradientId})` }}/>
          <text className="kind" textAnchor="middle" y="-10">{point.target ? `核心类 · ${classLabel}` : `类 · ${classLabel}`}</text>
          <text className="label" textAnchor="middle" y="10">{nodeLabel}</text>
          <circle className="property-badge" cx={(point.target ? targetRadius : nodeRadius) - 3} cy={-(point.target ? targetRadius : nodeRadius) + 3} r="12"/>
          <text className="property-count" x={(point.target ? targetRadius : nodeRadius) - 3} y={-(point.target ? targetRadius : nodeRadius) + 7} textAnchor="middle">{propertyCount}</text>
        </g>
      })}
      {showEvents && eventLayout.points.map((point) => {
        const eventName = ontologyElementName(detail, 'event', point.event.eventCode)
        const instanceLabel = point.event.name.length > 10 ? `${point.event.name.slice(0, 9)}…` : point.event.name
        const eventRadius = dense ? 27 : 32
        const muted = Boolean(selected && selected !== point.event.id && selected !== point.ownerId)
        return <g key={point.event.id} role="button" tabIndex={0} aria-label={`事件实例：${eventName} · ${point.event.name}`} className={`database-graph-event ${point.event.status === '异常' ? 'danger' : ''} ${selected === point.event.id ? 'selected' : ''} ${muted ? 'muted' : ''}`} transform={`translate(${point.x},${point.y})`} onClick={() => onSelect(point.event.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelect(point.event.id) }}>
          <title>{point.event.name} · 业务记录：{eventName}（{point.event.eventCode}）· 发生时间：{point.event.eventTime} · {point.event.id}</title>
          <circle className="selection" r={eventRadius + 7}/>
          <circle className="sphere" r={eventRadius} style={{ fill: `url(#${eventGradientId})` }}/>
          <text className="kind" textAnchor="middle" y="-10">事件 · {eventName.length > 6 ? `${eventName.slice(0, 5)}…` : eventName}</text>
          <text className="label" textAnchor="middle" y="6">{instanceLabel}</text>
          <text className="instance-id" textAnchor="middle" y="20">{point.event.eventTime.replace(/^\d{4}-/, '').replace(/:\d{2}$/, '')}</text>
        </g>
      })}
    </svg>
    <div className="database-graph-legend ontology"><span title="蓝色球形节点为类对应的业务节点"><i className="ontology-class"/>节点实例 <b>{layout.points.length}</b></span><span title="节点右上角数字表示属性数量，点击节点查看属性详情"><i className="ontology-property">3</i>节点属性 <b>{mappedPropertyCount}</b></span><span title="带方向箭头的连线表示关系，点击连线查看详情"><i className="ontology-relation"/>关系连线 <b>{edgeGroups.length}</b></span><span title="紫色节点表示业务事件实例，包含发生时间"><i className="ontology-event"/>事件实例 <b>{showEvents ? eventLayout.points.length : `${eventLayout.points.length}（隐藏）`}</b></span>{extensionPropertyCount > 0 && <span className="ontology-extension" title="来源系统存在、但当前图谱结构尚未定义的字段">扩展字段 {extensionPropertyCount}</span>}</div>
    <div className="database-graph-tip"><b className="hit-line"/>命中关系 <b className="connector-line"/>辅助连接 · 数字角标为节点属性数 · 紫色节点为事件实例</div>
  </div>
}

function DatabaseTimeline({ detail, onSelect }: { detail: DemoWarningDetail; onSelect: (id: string) => void }) {
  return <div className="timeline">{detail.graph.events.map((event) => <button key={event.id} className={event.status === '异常' ? 'danger' : ''} onClick={() => onSelect(event.id)}><time>{event.eventTime}</time><i/><div><strong>{event.name}</strong><span>{ontologyElementName(detail, 'event', event.eventCode)} · {event.eventCode}</span><small>{event.amount === null ? event.status : `${event.amount.toLocaleString()}元 · ${event.status}`}</small></div></button>)}</div>
}

function DatabaseNodeDetail({ node, detail }: { node: DemoWarningDetail['graph']['nodes'][number]; detail: DemoWarningDetail }) {
  const classDefinition = ontologyElement(detail, 'class', node.classCode)
  const propertyRows = Object.entries(node.properties).map(([propertyKey, value]) => ({ propertyKey, value, definition: ontologyPropertyDefinition(detail, node, propertyKey) }))
  const mappedRows = propertyRows.filter((row) => row.definition)
  const extensionRows = propertyRows.filter((row) => !row.definition)
  const renderRows = (rows: typeof propertyRows) => <div className="database-property-list">{rows.map((row) => <div key={row.propertyKey}><div><strong>{row.definition?.name || row.propertyKey}</strong><small>{row.definition?.code || `${node.classCode}.${row.propertyKey}`}{row.definition?.dataType ? ` · ${row.definition.dataType}` : ''}</small></div><span>{databasePropertyValue(row.value)}</span></div>)}</div>
  return <><KeyValue items={[{ label: '实例ID', value: node.id }, { label: '实例名称', value: node.name }, { label: '所属图谱结构', value: `${detail.ontology?.name || detail.ontology?.id || '监管图谱结构'} ${detail.ontology?.version || ''}` }, { label: '类', value: `${classDefinition?.name || node.classCode}（${node.classCode}）` }, { label: '案例ID', value: node.caseId }, { label: '来源系统', value: node.sourceSystem }, { label: '来源记录', value: node.sourceRecord }, { label: '知识图谱', value: detail.graph.id }, { label: '状态', value: <StatusTag>{node.status}</StatusTag> }]}/><Panel title="类定义" className="drawer-section"><KeyValue items={[{ label: '类编码', value: node.classCode }, { label: '约束', value: classDefinition?.constraint || '—' }, { label: '业务说明', value: classDefinition?.description || '—' }]}/></Panel><Panel title={`图谱属性值 · ${mappedRows.length}项`} className="drawer-section">{mappedRows.length ? renderRows(mappedRows) : <p className="drawer-note">当前实例没有已映射的图谱属性值。</p>}</Panel>{extensionRows.length > 0 && <Panel title={`来源扩展字段 · ${extensionRows.length}项`} className="drawer-section"><div className="alert-box"><Icon name="warning"/><span>以下字段来自业务源系统，当前尚未纳入图谱属性定义。</span></div>{renderRows(extensionRows)}</Panel>}</>
}

function DatabaseRawProperties({ title, properties }: { title: string; properties: Record<string, unknown> }) {
  const rows = Object.entries(properties)
  if (!rows.length) return null
  return <Panel title={`${title} · ${rows.length}项`} className="drawer-section"><div className="database-property-list">{rows.map(([key, value]) => <div key={key}><div><strong>{key}</strong><small>来源实例扩展属性</small></div><span>{databasePropertyValue(value)}</span></div>)}</div></Panel>
}

function DatabaseRelationDetail({ relation, detail }: { relation: DatabaseGraphRelation; detail: DemoWarningDetail }) {
  const definition = ontologyElement(detail, 'relation', relation.relationCode)
  const fromNode = detail.graph.nodes.find((item) => item.id === relation.fromId)
  const toNode = detail.graph.nodes.find((item) => item.id === relation.toId)
  const evidence = detail.evidence.find((item) => item.id === relation.evidenceId)
  const parallelRelations = detail.graph.relations.filter((item) => item.fromId === relation.fromId && item.toId === relation.toId)
  const fromClass = fromNode ? ontologyElementName(detail, 'class', fromNode.classCode) : '未知类'
  const toClass = toNode ? ontologyElementName(detail, 'class', toNode.classCode) : '未知类'
  const verificationStatus = databaseRelationVerification(detail, relation)
  return <><KeyValue items={[{ label: '关系实例ID', value: relation.id }, { label: '图谱关系', value: `${definition?.name || relation.relationCode}（${relation.relationCode}）` }, { label: '起点实例', value: `${fromClass} / ${fromNode?.name || relation.fromId}` }, { label: '终点实例', value: `${toClass} / ${toNode?.name || relation.toId}` }, { label: '核验状态', value: <StatusTag>{verificationStatus}</StatusTag> }, { label: '证据ID', value: relation.evidenceId || '未绑定独立证据' }, { label: '来源系统', value: relation.sourceSystem }, { label: '知识图谱', value: detail.graph.id }]}/><Panel title="图谱关系定义" className="drawer-section"><KeyValue items={[{ label: '定义方向', value: `${definition?.ownerCode || fromNode?.classCode || '—'} → ${definition?.targetCode || toNode?.classCode || '—'}` }, { label: '约束', value: definition?.constraint || '—' }, { label: '业务说明', value: definition?.description || '—' }]}/></Panel>{evidence && <Panel title="关联证据" className="drawer-section"><KeyValue items={[{ label: '证据名称', value: evidence.description || evidence.fieldOrRelation }, { label: '证据类型', value: evidence.type }, { label: '证据值', value: evidenceDisplayValue(evidence) }, { label: '有效性', value: evidence.validity }, { label: '采集时间', value: evidence.collectedAt }, { label: '来源记录', value: evidence.sourceRecord }]}/></Panel>}{parallelRelations.length > 1 && <Panel title={`同方向关系实例 · ${parallelRelations.length}条`} className="drawer-section"><div className="database-relation-instance-list">{parallelRelations.map((item) => <div className={item.id === relation.id ? 'active' : ''} key={item.id}><strong>{ontologyElementName(detail, 'relation', item.relationCode)}</strong><span>{item.id} · {databaseRelationVerification(detail, item)}</span></div>)}</div></Panel>}<DatabaseRawProperties title="关系扩展属性" properties={relation.properties}/></>
}

function DatabaseEventDetail({ event, detail }: { event: DatabaseGraphEvent; detail: DemoWarningDetail }) {
  const definition = ontologyElement(detail, 'event', event.eventCode)
  const objectNode = detail.graph.nodes.find((item) => item.id === event.objectId)
  const actorNode = detail.graph.nodes.find((item) => item.id === event.actorId)
  const organizationNode = detail.graph.nodes.find((item) => item.id === event.organizationId)
  return <><KeyValue items={[{ label: '节点实例ID', value: event.id }, { label: '所属类', value: `${definition?.name || event.eventCode}（${event.eventCode}）` }, { label: '节点名称', value: event.name }, { label: '发生时间', value: event.eventTime }, { label: '参与对象', value: objectNode ? `${ontologyElementName(detail, 'class', objectNode.classCode)} / ${objectNode.name}` : event.objectId }, { label: '参与主体', value: actorNode?.name || event.actorId || '—' }, { label: '所属组织', value: organizationNode?.name || event.organizationId || '—' }, { label: '涉及金额', value: event.amount === null ? '—' : `${event.amount.toLocaleString()}元` }, { label: '状态', value: <StatusTag>{event.status}</StatusTag> }, { label: '来源系统', value: event.sourceSystem }]}/><Panel title="发生信息" className="drawer-section"><KeyValue items={[{ label: '类编码', value: definition?.code || event.eventCode }, { label: '发生时间', value: event.eventTime }, { label: '关联对象所属类', value: objectNode?.classCode || '—' }, { label: '约束', value: definition?.constraint || '—' }, { label: '业务说明', value: definition?.description || '—' }]}/></Panel><DatabaseRawProperties title="节点扩展属性" properties={event.properties}/></>
}

function TradeCyclePanel({ rows }: { rows: DemoWarningDetail['tradeCycle'] }) {
  return <div className="database-case-panel"><div className="alert-box danger"><Icon name="warning"/><span>合同、应收预付、付款回款和账户路径来自同一演示批次，可用于讲解资金闭环和无实质贸易。</span></div><div className="table-container"><table><thead><tr><th>业务ID / 类型</th><th>交易主体</th><th>标的 / 规格</th><th>数量</th><th>金额</th><th>方向</th><th>账户路径</th><th>模式 / 结论</th></tr></thead><tbody>{rows.map((row) => <tr key={row.businessId}><td><strong>{row.businessType}</strong><small className="cell-sub">{row.businessId} · {row.businessTime}</small></td><td>{row.internalOrgId}<small className="cell-sub">{row.counterpartyId}</small></td><td>{row.itemName}<small className="cell-sub">{row.specification}</small></td><td>{row.quantity}</td><td>{row.amount.toLocaleString()}元</td><td><StatusTag>{row.direction}</StatusTag></td><td>{row.sourceAccountId || '—'}<small className="cell-sub">→ {row.targetAccountId || '—'}</small></td><td>{row.modeCodes}<small className="cell-sub">{row.evidenceConclusion}</small></td></tr>)}</tbody></table></div></div>
}

function NodeDetail({ selectedNode, path }: { selectedNode: string; path: string }) {
  return <><KeyValue items={[{ label: '详情类型', value: selectedNode === 'file' ? '附件预览' : selectedNode === 'bid' ? '事件详情' : selectedNode === 'phone' ? '关系与来源' : '节点属性' }, { label: '实体/证据ID', value: `ENTITY-${selectedNode.toUpperCase()}` }, { label: '归属组织', value: '电子云采购中心' }, { label: '业务有效时间', value: '2026-01-01 至今' }, { label: '来源系统', value: selectedNode === 'file' ? '工商司法外部数据' : '集团ERP采购视图' }, { label: '知识图谱', value: 'GRAPH-20260717.2' }, { label: '敏感等级', value: <StatusTag>{selectedNode === 'phone' ? '强敏感' : '内部'}</StatusTag> }]}/>{selectedNode === 'file' && <div className="file-preview"><Icon name="file" size={38}/><strong>工商主体查询记录.pdf</strong><span>历史快照 v20260717 · 内容哈希 8AC2…91F0</span><p>预览摘要：主体登记信息、股东及联系方式查询结果。</p></div>}<Panel title="命中作用" className="drawer-section"><p className="drawer-note">属于{path === 'path1' ? '直接命中路径' : '辅助证据路径'}，参与规则 R-PROC-ASSOC-06。</p></Panel></>
}

export function RiskEventListPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const events = useAppStore((state) => state.riskEvents)
  const scenes = useAppStore((state) => state.scenes)
  const transferRiskEvent = useAppStore((state) => state.transferRiskEvent)
  const submitRectification = useAppStore((state) => state.submitRectification)
  const reviewRiskEvent = useAppStore((state) => state.reviewRiskEvent)
  const setToast = useAppStore((state) => state.setToast)
  const requestedStatus = searchParams.get('status')
  const initialStatus = requestedStatus === 'open' ? '未关闭' : requestedStatus && ['未关闭', '全部', '待整改', '待复核', '已关闭'].includes(requestedStatus) ? requestedStatus : '未关闭'
  const initialDomain = searchParams.get('domain') === '全部授权领域' ? '全部' : searchParams.get('domain') || '全部'
  const [draft, setDraft] = useState({ keyword: '', status: initialStatus, level: searchParams.get('level') || '全部', org: searchParams.get('org') || '全部', domain: initialDomain, overdue: searchParams.get('overdue') || '全部' })
  const [filters, setFilters] = useState(draft)
  const [page, setPage] = useState(1)
  const [action, setAction] = useState<EventAction>(null)
  const [target, setTarget] = useState<RiskEvent | null>(null)
  const [form, setForm] = useState({ owner: '孙凯', reason: '', rectificationResult: '已完成', measures: '', materials: [] as string[], reviewResult: '通过' as '通过' | '退回整改' | '不成立关闭', evidence: '' })
  const sceneDomains = useMemo(() => Object.fromEntries(scenes.map((item) => [item.name, item.domain])), [scenes])
  const rows = events.filter((item) => {
    const domain = inferSituationDomain(sceneDomains[item.scene], `${item.scene}${item.title}${item.target}`)
    return (!filters.keyword || `${item.id}${item.title}${item.target}`.toLowerCase().includes(filters.keyword.toLowerCase())) &&
      (filters.status === '全部' || (filters.status === '未关闭' && item.status !== '已关闭') || item.status === filters.status) &&
      (filters.level === '全部' || filters.level.includes(item.level)) &&
      (filters.org === '全部' || item.organization === filters.org) &&
      (filters.domain === '全部' || domain === filters.domain) &&
      (filters.overdue === '全部' || (filters.overdue === '是') === item.overdue)
  })
  const totalPages = Math.max(1, Math.ceil(rows.length / listPageSize))
  const pageRows = rows.slice((page - 1) * listPageSize, page * listPageSize)
  const query = () => { setFilters(draft); setPage(1) }
  const openAction = (item: RiskEvent, next: Exclude<EventAction, null>) => {
    setTarget(item)
    setAction(next)
    setForm({
      owner: item.owner === '孙凯' ? '李华' : '孙凯',
      reason: '',
      rectificationResult: '已完成',
      measures: '',
      materials: [],
      reviewResult: '通过',
      evidence: '',
    })
  }
  const execute = () => {
    if (!target || !action) return
    const result = action === 'transfer'
      ? transferRiskEvent(target.id, form.owner, form.reason)
      : action === 'submit'
        ? submitRectification(target.id, form.rectificationResult, form.measures, form.materials)
        : reviewRiskEvent(target.id, form.reviewResult, form.reason, form.evidence)
    setToast(result.message)
    if (result.ok) setAction(null)
  }
  return <>
    <PageHeader eyebrow="风险监管 / 风险事件" title="风险事件" description="承接已升级预警，完成查看、转派、整改、复核和闭环留痕。" actions={<Button icon="refresh" onClick={() => setToast('风险事件列表已刷新')}>刷新</Button>}/>
    <div className="page-query page-query-events">
      <FilterGrid onReset={() => { const value = { keyword: '', status: '未关闭', level: '全部', org: '全部', domain: '全部', overdue: '全部' }; setDraft(value); setFilters(value); setPage(1) }} onSearch={query}>
        <Field label="关键词"><input value={draft.keyword} onChange={(event) => setDraft({ ...draft, keyword: event.target.value })} onKeyDown={(event) => event.key === 'Enter' && query()} placeholder="事件编号、标题或主对象"/></Field>
        <Field label="风险等级"><select value={draft.level} onChange={(event) => setDraft({ ...draft, level: event.target.value })}><option>全部</option><option>重大、高</option><option>重大</option><option>高</option><option>中、低</option><option>中</option><option>低</option></select></Field>
        <Field label="责任组织"><select value={draft.org} onChange={(event) => setDraft({ ...draft, org: event.target.value })}><option>全部</option><option>集团采购中心</option><option>集团财务共享中心</option><option>数据智能事业部</option></select></Field>
        <Field label="监管领域"><select value={draft.domain} onChange={(event) => setDraft({ ...draft, domain: event.target.value })}><option>全部</option>{SITUATION_DOMAINS.map((item) => <option key={item.key}>{item.key}</option>)}</select></Field>
        <Field label="状态"><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option>未关闭</option><option>全部</option><option>待整改</option><option>待复核</option><option>已关闭</option></select></Field>
        <Field label="是否逾期"><select value={draft.overdue} onChange={(event) => setDraft({ ...draft, overdue: event.target.value })}><option>全部</option><option>是</option><option>否</option></select></Field>
      </FilterGrid>
    </div>
    <Panel title="风险事件列表" subtitle={`共 ${rows.length} 项，当前第 ${page}/${totalPages} 页`}><div className="table-container"><table><thead><tr><th>风险事件编号 / 标题</th><th>来源预警</th><th>等级 / 场景</th><th>主对象</th><th>责任组织 / 当前处理人</th><th>状态</th><th>截止时间</th><th>最近更新</th><th>操作</th></tr></thead><tbody>{pageRows.map((item) => <tr key={item.id}><td><button className="table-link title-cell" onClick={() => navigate(`/risk/events/${item.id}`)}><strong>{item.title}</strong><span>{item.id}</span></button></td><td><button className="table-link" onClick={() => navigate(`/risk/warnings/${item.warningId}`)}>{item.warningId}</button></td><td><RiskTag level={item.level}/><small className="cell-sub">{item.scene}</small></td><td>{item.target}</td><td>{item.organization}<small className="cell-sub">{item.owner || '待分配'}</small></td><td><StatusTag>{item.status}</StatusTag></td><td><span className={`deadline ${item.overdue ? 'overdue' : ''}`}>{item.dueAt}<small>{item.overdue ? '已逾期' : '正常'}</small></span></td><td>{item.updatedAt}</td><td><div className="row-actions vertical"><button onClick={() => navigate(`/risk/events/${item.id}`)}>查看</button>{item.status !== '已关闭' && <button onClick={() => openAction(item, 'transfer')}>转派</button>}{item.status === '待整改' && <button onClick={() => openAction(item, 'submit')}>整改</button>}{item.status === '待复核' && <button onClick={() => openAction(item, 'review')}>复核</button>}</div></td></tr>)}</tbody></table></div><div className="pagination"><span>共 {rows.length} 条</span><button disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>{Array.from({ length: totalPages }, (_, index) => <button key={index + 1} className={page === index + 1 ? 'active' : ''} onClick={() => setPage(index + 1)}>{index + 1}</button>)}<button disabled={page === totalPages} onClick={() => setPage(page + 1)}>›</button></div></Panel>
    <Modal open={!!action} title={action === 'transfer' ? '转派风险事件' : action === 'submit' ? '提交整改结果' : '监管复核风险事件'} description={target ? `${target.id} · ${target.title}` : ''} confirmText={action === 'transfer' ? '确认转派' : action === 'review' ? '确认复核' : '提交整改'} danger={action === 'review'} onClose={() => setAction(null)} onConfirm={execute}>{action && <EventActionForm action={action} form={form} onChange={setForm}/>}</Modal>
  </>
}

export function RiskEventDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const event = useAppStore((state) => state.riskEvents.find((item) => item.id === id))
  const transferRiskEvent = useAppStore((state) => state.transferRiskEvent)
  const submitRectification = useAppStore((state) => state.submitRectification)
  const reviewRiskEvent = useAppStore((state) => state.reviewRiskEvent)
  const setToast = useAppStore((state) => state.setToast)
  const [tab, setTab] = useState('facts')
  const [action, setAction] = useState<EventAction>(null)
  const [selectedNode, setSelectedNode] = useState('')
  const [graphScale, setGraphScale] = useState(1)
  const [graphFullScreen, setGraphFullScreen] = useState(false)
  const [relationFilter, setRelationFilter] = useState<DatabaseGraphRelationFilter>('核心证据链')
  const [graphViewMode, setGraphViewMode] = useState<DatabaseGraphViewMode>('风险链视图')
  const [showGraphEvents, setShowGraphEvents] = useState(false)
  const [sourceDetail, setSourceDetail] = useState<DemoWarningDetail | null>(null)
  const [sourceLoading, setSourceLoading] = useState(Boolean(event))
  const [sourceRefresh, setSourceRefresh] = useState(0)
  const [form, setForm] = useState({ owner: '孙凯', reason: '', rectificationResult: '已完成', measures: '', materials: [] as string[], reviewResult: '通过' as '通过' | '退回整改' | '不成立关闭', evidence: '' })

  useEffect(() => {
    const warningId = event?.warningId
    if (!warningId) {
      setSourceDetail(null)
      setSourceLoading(false)
      return
    }
    let active = true
    setSourceLoading(true)
    setSelectedNode('')
    void demoDataApi.warningDetail(warningId)
      .then((detail) => { if (active) setSourceDetail(detail) })
      .catch(() => { if (active) setSourceDetail(null) })
      .finally(() => { if (active) setSourceLoading(false) })
    return () => { active = false }
  }, [event?.warningId, sourceRefresh])

  if (!event) return <EmptyState title="风险事件不存在或无权访问" description="请从风险事件列表重新进入。"/>
  const selectedSourceNode = sourceDetail?.graph.nodes.find((item) => item.id === selectedNode)
  const selectedSourceRelation = sourceDetail?.graph.relations.find((item) => item.id === selectedNode)
  const selectedSourceEvent = sourceDetail?.graph.events.find((item) => item.id === selectedNode)
  const nodeTitle = selectedSourceNode?.name || (selectedSourceRelation ? ontologyElementName(sourceDetail!, 'relation', selectedSourceRelation.relationCode) : selectedSourceEvent?.name) || (selectedNode === 'supplier' ? '华北数字科技有限公司' : selectedNode === 'phone' ? '手机号 138****8201' : selectedNode === 'reviewer' ? '评审人员 王**' : selectedNode === 'project' ? '云资源扩容采购项目' : selectedNode === 'bid' ? '中标确认事件' : '工商查询记录')
  const graphVersion = sourceDetail?.graph.id || 'GRAPH-20260717.2'
  const sourceGraphProjection = sourceDetail ? createDatabaseGraphProjection(sourceDetail, relationFilter) : null
  const graphNodeCount = sourceGraphProjection?.nodes.length ?? 6
  const graphRelationCount = sourceGraphProjection?.relations.length ?? 5
  const evidenceCount = sourceDetail?.evidence.length ?? 8
  const openAction = (next: Exclude<EventAction, null>) => {
    setAction(next)
    setForm({
      owner: event.owner === '孙凯' ? '李华' : '孙凯',
      reason: '',
      rectificationResult: '已完成',
      measures: '',
      materials: [],
      reviewResult: '通过',
      evidence: '',
    })
  }
  const execute = () => {
    if (!action) return
    const result = action === 'transfer'
      ? transferRiskEvent(event.id, form.owner, form.reason)
      : action === 'submit'
        ? submitRectification(event.id, form.rectificationResult, form.measures, form.materials)
        : reviewRiskEvent(event.id, form.reviewResult, form.reason, form.evidence)
    setToast(result.message)
    if (result.ok) setAction(null)
  }
  return <div className={`risk-event-detail-page ${graphFullScreen ? 'graph-fullscreen' : ''}`}>
    <div className="detail-topbar"><div><button className="back-button" onClick={() => navigate('/risk/events')}>‹ 返回风险事件列表</button><p>{event.id}</p><h1>{event.title}</h1></div><div className="detail-top-actions"><Button icon="refresh" onClick={() => { setSourceRefresh((value) => value + 1); setToast('风险事件状态、待办和来源预警证据已刷新') }}>刷新</Button></div></div>
    <section className="summary-strip risk-summary"><div><span>风险等级</span><RiskTag level={event.level}/></div><div><span>当前状态</span><StatusTag>{event.status}</StatusTag></div><div><span>来源预警</span><button className="table-link" onClick={() => navigate(`/risk/warnings/${event.warningId}`)}>{event.warningId}</button></div><div><span>主对象</span><strong>{event.target}</strong></div><div><span>责任组织 / 当前处理人</span><strong>{event.organization}</strong><small>{event.owner || '待分配'}</small></div><div><span>截止时间</span><strong className={event.overdue ? 'danger-text' : ''}>{event.dueAt}</strong><small>{event.overdue ? '已逾期' : '正常'}</small></div></section>
    {event.overdue && event.status !== '已关闭' && <div className="alert-box danger evidence-alert"><Icon name="clock"/><span>当前风险事件已逾期，请优先完成转派、整改或复核。</span></div>}
    <Panel className="risk-event-detail"><Tabs value={tab} onChange={(value) => { setTab(value); if (value !== 'graph') setGraphFullScreen(false) }} items={[{ key: 'facts', label: '风险事实' }, { key: 'graph', label: '证据子图', count: graphNodeCount }, { key: 'evidence', label: '实际证据', count: evidenceCount }, { key: 'timeline', label: '处理时间线', count: 5 }, { key: 'rectification', label: '整改反馈', count: event.status === '待复核' || event.status === '已关闭' ? 2 : 0 }, { key: 'review', label: '复核记录', count: event.status === '已关闭' ? 2 : event.status === '待复核' ? 1 : 0 }]}/>{tab === 'facts' && <RiskFacts event={event} sourceDetail={sourceDetail}/>} {tab === 'graph' && <div className="risk-event-evidence-view"><div className="risk-event-evidence-banner"><span><Icon name="lock" size={17}/></span><div><strong>来源预警固化证据快照</strong><small>{event.warningId} · {graphVersion} · {graphNodeCount}个节点 / {graphRelationCount}条关系</small></div><StatusTag>{sourceDetail ? 'MySQL快照' : '固化快照'}</StatusTag><Button icon="link" onClick={() => navigate(`/risk/warnings/${event.warningId}`)}>查看来源预警</Button></div><div className="risk-event-evidence-toolbar"><div><strong>证据关系画布</strong><span>与来源预警使用同一知识图谱快照和证据关系；整改材料作为补充证据单独保存</span></div><div className="graph-tools"><div className="graph-view-switch" aria-label="证据图展示方式"><button className={graphViewMode === '风险链视图' ? 'active' : ''} onClick={() => { setGraphViewMode('风险链视图'); setRelationFilter('核心证据链'); setShowGraphEvents(false) }}>风险链</button><button className={graphViewMode === '完整图谱视图' ? 'active' : ''} onClick={() => { setGraphViewMode('完整图谱视图'); setRelationFilter('全部关系') }}>完整图谱结构</button></div>{graphViewMode === '完整图谱视图' && <select value={relationFilter} onChange={(event) => setRelationFilter(event.target.value as DatabaseGraphRelationFilter)}><option>核心证据链</option><option>仅命中关系</option><option>隐藏辅助关系</option><option>全部关系</option></select>}{sourceDetail && <button className={showGraphEvents ? 'active' : ''} onClick={() => { if (showGraphEvents && selectedSourceEvent) setSelectedNode(''); setShowGraphEvents(!showGraphEvents) }}><Icon name="clock" size={14}/>{showGraphEvents ? '隐藏事件实例' : '显示事件实例'}</button>}<button onClick={() => setGraphScale(Math.min(1.5, graphScale + .1))}>＋</button><button onClick={() => setGraphScale(Math.max(.7, graphScale - .1))}>－</button><button onClick={() => setGraphScale(1)}><Icon name="refresh" size={14}/>重置</button><button onClick={() => setGraphFullScreen(!graphFullScreen)}><Icon name="eye" size={14}/>{graphFullScreen ? '退出全屏' : '全屏'}</button></div></div><div className="risk-event-graph-stage">{sourceLoading ? <DatabaseGraphLoading/> : <div style={{ transform: `scale(${graphScale})`, transformOrigin: 'center top', transition: '.18s' }}>{sourceDetail ? <DatabaseGraphView detail={sourceDetail} filter={relationFilter} viewMode={graphViewMode} showEvents={showGraphEvents} selected={selectedNode} onSelect={setSelectedNode}/> : <EvidenceGraph selected={selectedNode} onSelect={setSelectedNode}/>}</div>}</div><div className="risk-event-evidence-footnote"><Icon name="lock" size={14}/><span>风险事件只读复用来源预警升级时对应的证据图谱；后续整改证明不会覆盖初始风险事实。</span></div></div>} {tab === 'evidence' && <EvidenceTable filter="全部" onFilter={() => undefined} onSelect={setSelectedNode} rows={sourceDetail?.evidence}/>} {tab === 'timeline' && <RiskTimeline event={event}/>} {tab === 'rectification' && <RectificationView event={event}/>} {tab === 'review' && <ReviewView event={event}/>}</Panel>
    <footer className="fixed-action-bar"><div><span>当前任务</span><strong>{event.status === '待整改' ? '提交整改结果' : event.status === '待复核' ? '完成监管复核' : '事件已闭环'}</strong><small>当前处理人：{event.owner || '待分配'} · 最近更新：{event.updatedAt}</small></div><div className="action-group"><Button onClick={() => navigate('/risk/events')}>返回</Button>{event.status !== '已关闭' && <Button onClick={() => openAction('transfer')}>转派</Button>}{event.status === '待整改' && <Button variant="primary" onClick={() => openAction('submit')}>整改</Button>}{event.status === '待复核' && <Button variant="primary" icon="check" onClick={() => openAction('review')}>复核</Button>}</div></footer>
    <Modal open={!!action} title={action === 'transfer' ? '转派风险事件' : action === 'submit' ? '提交整改结果' : '监管复核'} description="操作成功后将同步更新风险事件、工作台待办、消息和审计日志。" confirmText={action === 'transfer' ? '确认转派' : action === 'review' ? '确认复核' : '提交整改'} danger={action === 'review'} onClose={() => setAction(null)} onConfirm={execute}>{action && <EventActionForm action={action} form={form} onChange={setForm}/>}</Modal>
    <Drawer modal={false} className="evidence-inspector" open={!!selectedNode} title={nodeTitle} eyebrow={selectedSourceNode ? '来源预警节点实例' : selectedSourceRelation ? '来源预警关系实例' : selectedSourceEvent ? '来源预警事件实例' : selectedNode === 'bid' ? '事件详情' : selectedNode === 'file' ? '证据详情与预览' : selectedNode === 'phone' ? '关系证据详情' : '节点详情'} onClose={() => setSelectedNode('')} footer={<><Button onClick={() => setSelectedNode('')}>关闭</Button><Button variant="primary" onClick={() => setToast('已按来源预警快照完成证据溯源')}>来源追溯</Button></>}><div className="alert-box"><Icon name="lock"/><span>当前查看的是风险事件升级时固化的来源预警证据快照。</span></div>{selectedSourceNode ? <DatabaseNodeDetail node={selectedSourceNode} detail={sourceDetail!}/> : selectedSourceRelation ? <DatabaseRelationDetail relation={selectedSourceRelation} detail={sourceDetail!}/> : selectedSourceEvent ? <DatabaseEventDetail event={selectedSourceEvent} detail={sourceDetail!}/> : <NodeDetail selectedNode={selectedNode} path="path1"/>}</Drawer>
  </div>
}

function EventActionForm({ action, form, onChange }: { action: Exclude<EventAction, null>; form: { owner: string; reason: string; rectificationResult: string; measures: string; materials: string[]; reviewResult: '通过' | '退回整改' | '不成立关闭'; evidence: string }; onChange: (value: typeof form) => void }) {
  if (action === 'transfer') return <div className="form-stack"><Field label="新处理人 *"><select value={form.owner} onChange={(event) => onChange({ ...form, owner: event.target.value })}><option>孙凯</option><option>李华</option><option>周航</option><option>王宁</option><option>尹晨阳</option></select></Field><Field label="转派原因"><textarea value={form.reason} onChange={(event) => onChange({ ...form, reason: event.target.value })} placeholder="可选，说明职责调整或转派原因"/></Field><div className="alert-box"><Icon name="user"/><span>转派只变更当前任务处理人，不改变事件状态。</span></div></div>
  if (action === 'submit') return <div className="form-stack"><Field label="整改结果 *"><select value={form.rectificationResult} onChange={(event) => onChange({ ...form, rectificationResult: event.target.value })}><option>已完成</option><option>部分完成</option><option>无法完成</option><option>无需整改</option></select></Field><Field label="整改措施"><textarea value={form.measures} onChange={(event) => onChange({ ...form, measures: event.target.value })} placeholder="可选，说明整改措施"/></Field><Field label="证明材料"><div className="upload-zone"><span>{form.materials.length ? form.materials.join('、') : '尚未添加证明材料'}</span><Button onClick={() => onChange({ ...form, materials: [...form.materials, `整改证明-${form.materials.length + 1}.pdf`] })}>模拟上传</Button></div></Field>{['已完成','部分完成'].includes(form.rectificationResult) && form.materials.length === 0 && <div className="alert-box danger"><Icon name="warning"/><span>当前整改结果至少需要一项证明材料。</span></div>}</div>
  return <div className="form-stack"><Field label="复核结论 *"><select value={form.reviewResult} onChange={(event) => onChange({ ...form, reviewResult: event.target.value as typeof form.reviewResult })}><option>通过</option><option>退回整改</option><option>不成立关闭</option></select></Field><Field label="复核说明 *"><textarea value={form.reason} onChange={(event) => onChange({ ...form, reason: event.target.value })}/></Field>{form.reviewResult !== '退回整改' && <Field label="引用证据 *"><input value={form.evidence} onChange={(event) => onChange({ ...form, evidence: event.target.value })} placeholder="例如 EVI-001、整改证明-1.pdf"/></Field>}<div className="alert-box danger"><Icon name="warning"/><span>{form.reviewResult === '退回整改' ? '退回后将恢复原整改责任人待办，事件回到“待整改”。' : '关闭后事件只读，关联待办同步关闭。'}</span></div></div>
}

function RiskFacts({ event, sourceDetail }: { event: RiskEvent; sourceDetail?: DemoWarningDetail | null }) { return <div className="detail-grid"><Panel title="风险事实摘要"><div className="fact-callout"><Icon name="warning" size={24}/><div><strong>{event.title}</strong><p>来源预警的初始证据快照、规则版本和图谱结构已经固化，后续材料以新增记录保存。</p></div></div><KeyValue items={[{ label: '风险场景', value: event.scene }, { label: '主对象', value: event.target }, { label: '来源预警', value: event.warningId }, { label: '图谱结构', value: sourceDetail ? `${sourceDetail.ontology?.name || sourceDetail.ontology?.id || 'ONT-PROC-DEMO'} ${sourceDetail.ontology?.version || ''}` : 'BASE v1.6 / PROC v2.2' }, { label: '知识图谱', value: sourceDetail?.graph.id || 'GRAPH-20260717.2' }, { label: '规则版本', value: sourceDetail ? `${sourceDetail.warning.sceneVersion} / ${sourceDetail.runs[0]?.ruleVersionId || '演示规则'}` : 'SCENE v2.3 / RULE v6.1' }]}/></Panel><Panel title="处置要求"><ul className="check-list"><li><Icon name="check"/>确认主体关联事实与责任边界</li><li><Icon name="check"/>落实整改措施并提交证明材料</li><li><Icon name="clock"/>在截止时间前完成当前任务</li><li><Icon name="lock"/>初始证据快照只读不可覆盖</li></ul></Panel></div> }

function RiskTimeline({ event }: { event: RiskEvent }) {
  const rows = [
    ['预警生成', '规则命中并固化证据快照'],
    ['升级风险事件', '监管人员确认风险并指定首位整改责任人'],
    ['当前处理人', event.owner || '待分配'],
    [event.status === '待整改' ? '等待提交整改' : '已提交整改', event.status === '待整改' ? '完成后进入待复核' : '证明材料以新增记录保存'],
    [event.status === '已关闭' ? '复核关闭' : event.status === '待复核' ? '等待监管复核' : '整改完成后进入复核', event.status],
  ]
  return <div className="timeline risk-timeline">{rows.map((item,index) => <button key={`${item[0]}-${index}`} className={index === rows.length - 1 && event.status !== '已关闭' ? 'future' : ''}><time>{index < 2 ? '历史记录' : '当前流程'}</time><i/><div><strong>{item[0]}</strong><span>{item[1]}</span></div></button>)}</div>
}
function RectificationView({ event }: { event: RiskEvent }) { return event.status === '待整改' ? <div className="empty-state"><span><Icon name="file"/></span><strong>尚未提交整改结果</strong><p>当前处理人提交后将在此展示整改结果、措施和证明材料。</p></div> : <div className="record-list"><article><header><div><strong>整改反馈</strong><span>{event.rectificationOwner || event.owner} · 最近提交</span></div><StatusTag>已提交</StatusTag></header><p>已确认主体关系并落实整改措施，相关材料以新增记录保存。</p><div className="attachment"><Icon name="file"/><span>整改证明-1.pdf</span><button>预览</button></div></article></div> }
function ReviewView({ event }: { event: RiskEvent }) { return <div className="review-card"><StatusTag>{event.status === '已关闭' ? '复核通过' : event.status === '待复核' ? '待复核' : '未进入复核'}</StatusTag><h3>监管复核记录</h3><p>{event.status === '已关闭' ? '风险事实和整改材料完整，整改措施已执行，事件已经关闭。' : event.status === '待复核' ? '等待当前处理人选择通过、退回整改或不成立关闭。' : '整改结果提交后，系统将生成复核待办并在此留痕。'}</p></div> }

