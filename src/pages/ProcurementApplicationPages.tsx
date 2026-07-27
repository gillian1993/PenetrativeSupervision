import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Drawer, Icon, PageHeader, Panel, StatusTag, type IconName } from '../ui'

const procurementModules = {
  tender: {
    title: '招投标智能工作台',
    eyebrow: '采购应用 / 招投标',
    summary: '覆盖招投标书撰写、供应商资格审查、围串标识别和智能评标，围绕任务列表、材料上传、结果预览和 AI 建议办理。',
    tabs: ['招投标书撰写', '供应商资格审查', '围串标识别', '智能评标'],
    tasks: [
      ['云资源扩容项目招标书', '草稿生成中'],
      ['核心系统运维资格审查', '待人工确认'],
      ['围串标疑似线索', '待分析'],
    ],
    prompt: '生成招标文件，并补充评分办法、资质要求和附件清单',
  },
  contract: {
    title: '合同智能工作台',
    eyebrow: '采购应用 / 合同',
    summary: '承载合同撰写、合同抽取、合同归档、合同对比和智能审查，突出条款定位、问题确认和导出。',
    tabs: ['合同撰写', '合同抽取', '合同归档', '合同对比', '智能审查'],
    tasks: [
      ['云平台资源采购合同', '高风险待确认'],
      ['软件许可服务协议', '抽取完成'],
      ['硬件框架采购协议', '归档异常'],
    ],
    prompt: '审查合同付款比例、违约责任、履约周期和验收条件',
  },
  review: {
    title: '文档与单据审查工作台',
    eyebrow: '采购应用 / 审查',
    summary: '承载文档审查和单据审查，围绕对象选择、字段核对、异常提示和问题处理形成统一交互。',
    tabs: ['文档审查', '单据审查'],
    tasks: [
      ['采购需求说明书完整性审查', '发现 3 项问题'],
      ['验收单与发票一致性审查', '待处理'],
      ['供应商承诺函合规审查', '已通过'],
    ],
    prompt: '核对文档完整性和单据金额一致性，输出异常清单',
  },
  purchase: {
    title: '采购智能工作台',
    eyebrow: '采购应用 / 采购',
    summary: '覆盖采购方案撰写、智能预算和采购单撰写，围绕采购需求、预算测算、采购单生成和 AI 建议办理。',
    tabs: ['采购方案撰写', '智能预算', '采购单撰写'],
    tasks: [
      ['云资源扩容采购方案', '待完善'],
      ['年度云服务预算测算', '测算中'],
      ['网络安全设备采购单', '待生成'],
    ],
    prompt: '生成采购方案，补充预算依据、采购范围、采购单明细和审批要点',
  },
}

const moduleEntries = [
  { id: 'tender', label: '招投标', icon: 'file', badge: '招投标书撰写、供应商资格审查、围串标识别、智能评标', description: '进入招投标业务域，处理项目材料、供应商资格、围串标识别与评标辅助。' },
  { id: 'contract', label: '合同', icon: 'file', badge: '合同撰写、合同抽取、合同归档、合同对比、智能审查', description: '进入合同业务域，处理条款撰写、字段抽取、归档和版本差异。' },
  { id: 'review', label: '审查', icon: 'check', badge: '文档审查、单据审查', description: '进入审查业务域，处理文档完整性、单据一致性和异常项确认。' },
  { id: 'purchase', label: '采购', icon: 'workbench', badge: '采购方案撰写、智能预算、采购单撰写', description: '进入采购业务域，处理采购方案、预算测算和采购单生成。' },
] as const

const overviewStats = [
  ['招投标任务', '24', '撰写、识别、评标', 70],
  ['合同任务', '16', '撰写、抽取、归档', 58],
  ['审查任务', '11', '文档与单据', 46],
  ['采购任务', '13', '方案、预算、采购单', 52],
] as const

const moduleIntros = {
  procurement: {
    kind: '主线介绍',
    title: '采购应用',
    route: '/procurement',
    lead: '面向采购业务办理的智能体工作区，聚合招投标、合同、审查、采购四类高频场景，帮助业务人员完成材料上传、智能生成、风险审查和结果确认。',
    items: [
      ['适用对象', '采购人员、合同管理人员、评审人员和业务部门经办人。'],
      ['核心能力', '招投标书撰写、供应商资格审查、围串标识别、智能评标、合同撰写、合同抽取、合同归档、合同对比、智能审查、文档审查、单据审查、采购方案撰写、智能预算和采购单撰写。'],
      ['使用方式', '进入后按业务域选择具体场景，再在对应工作台通过任务列表和中间工作区完成办理。'],
    ],
  },
  supervision: {
    kind: '主线介绍',
    title: '穿透式监管',
    route: '/workbench',
    lead: '面向采购风险监控和闭环处置的监管主线，围绕风险发现、预警甄别、事件处置、规则管理和数据追溯形成穿透式监管能力。',
    items: [
      ['适用对象', '监管人员、审计人员、管理人员和风险处置协同人员。'],
      ['核心能力', '监管工作台、监控大盘、领域监管、风险闭环、模型规则、知识库以及数据与集成。'],
      ['使用方式', '进入后从监管态势或风险列表出发，完成预警甄别、事件派发、整改复核和规则优化。'],
    ],
  },
} as const

function HtmlStatCard({ label, value, helper, progress }: { label: string; value: string; helper: string; progress: number }) {
  return <article className="html-stat-card"><span>{label}</span><strong>{value}</strong><span>{helper}</span><div className="html-stat-bar"><i style={{ width: `${progress}%` }}/></div></article>
}

function HtmlBadge({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'ok' | 'warn' | 'risk' }) {
  return <span className={`html-badge ${tone}`}>{children}</span>
}

function MainlineEntry({ title, badge, description, icon, onEnter, onExplain }: { title: string; badge: string; description: string; icon: IconName; onEnter: () => void; onExplain?: () => void }) {
  return <article className="html-entry-card"><div className="html-entry-head"><div><h2>{title}</h2><span className="tag info">{badge}</span></div><span className="html-entry-icon"><Icon name={icon}/></span></div><p>{description}</p><div className="html-entry-links"><Button variant="primary" onClick={onEnter}>进入主线</Button>{onExplain && <Button onClick={onExplain}>查看说明</Button>}</div></article>
}

function ModuleIntroModal({ intro, onClose, onEnter }: { intro: (typeof moduleIntros)[keyof typeof moduleIntros] | null; onClose: () => void; onEnter: (route: string) => void }) {
  if (!intro) return null
  return <div className="html-intro-mask" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="html-intro-card" role="dialog" aria-modal="true" aria-labelledby="html-intro-title">
      <header><div><p className="eyebrow">{intro.kind}</p><h2 id="html-intro-title">{intro.title}</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭说明"><Icon name="close"/></button></header>
      <div className="html-intro-body"><p className="html-intro-lead">{intro.lead}</p><ul className="html-intro-list">{intro.items.map(([label, text]) => <li key={label}><strong>{label}</strong><span>{text}</span></li>)}</ul></div>
      <footer><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={() => onEnter(intro.route)}>进入{intro.title}</Button></footer>
    </section>
  </div>
}

export function ProcurementHomePage() {
  const navigate = useNavigate()
  const [introKey, setIntroKey] = useState<keyof typeof moduleIntros | null>(null)
  const activeIntro = introKey ? moduleIntros[introKey] : null
  return <>
    <section className="html-home-hero">
      <div className="html-hero-main">
        <span className="html-hero-kicker"><Icon name="agent" size={16}/>采购管理应用</span>
        <h1><span>AI 驱动采购智能化</span><br/>业务办理与穿透监管统一入口</h1>
        <p>面向采购业务办理与风险监管的一体化智能平台。首页聚焦产品心智和主线选择，智能任务统一进入左侧“超级智能体”菜单处理。</p>
        <div className="page-actions html-hero-actions"><Button variant="primary" onClick={() => navigate('/super-agent')}>进入超级智能体</Button><Button onClick={() => navigate('/procurement')}>采购应用</Button><Button onClick={() => navigate('/workbench')}>穿透式监管</Button></div>
      </div>
      <aside className="html-hero-side"><div className="ai-orbit"><div className="orbit-ring r1"/><div className="orbit-ring r2"/><div className="orbit-ring r3"/><div className="ai-core"><div><strong>AI</strong><span>Procurement</span></div></div></div></aside>
    </section>
    <section className="section"><div className="html-grid two"><MainlineEntry title="采购应用" badge="招投标、合同、审查、采购" description="进入采购业务工作区，承接文档生成、材料审查、合同处理、采购编制与结果导出。" icon="file" onEnter={() => navigate('/procurement')} onExplain={() => setIntroKey('procurement')}/><MainlineEntry title="穿透式监管" badge="监管工作台、风险闭环、模型规则" description="进入监管工作区，承接监管分析、事件处置、规则管理与证据追溯。" icon="shield" onEnter={() => navigate('/workbench')} onExplain={() => setIntroKey('supervision')}/></div></section>
    <ModuleIntroModal intro={activeIntro} onClose={() => setIntroKey(null)} onEnter={(route) => { setIntroKey(null); navigate(route) }}/>
  </>
}

type AgentPhase = 'confirm' | 'running' | 'failed' | 'done'
type AgentTone = 'warn' | 'ok' | 'risk'
type AgentTask = { title: string; meta: string; status: string; cls: AgentTone; kind?: 'tenderWrite'; query: string; result?: string[] }

const superAgentTasks: AgentTask[] = [
  { title: '云资源扩容项目投标书撰写', meta: '待确认 / 刚刚', status: '待确认', cls: 'warn', kind: 'tenderWrite', query: '帮我写一份云资源扩容采购项目的投标书。' },
  { title: '采购合同高风险条款审查', meta: '待确认 / 今天 10:12', status: '待确认', cls: 'warn', query: '审查合同付款比例、违约责任和验收条件', result: ['发现 3 项高风险条款', '付款比例变更需复核', '违约责任条款建议补充'] },
  { title: '当前待处理事件查询', meta: '已生成列表 / 今天 09:30', status: '已完成', cls: 'ok', query: '帮我找出当前待处理的事件', result: ['待处理事件 23 个', '高风险 5 个', '逾期未处理 2 个'] },
  { title: '年度云服务预算测算', meta: '测算中 / 昨天 18:20', status: '执行中', cls: 'warn', query: '继续年度云服务预算测算', result: ['已读取历史价格', '待补充采购范围', '预算口径需确认'] },
]

const agentSteps = [
  ['招标文件解析', '识别项目名称、采购范围、评分办法和格式要求'],
  ['任务识别与路由', '已路由至招投标 Agent / 招投标书撰写'],
  ['材料完整性校验', '发现 3 项材料待补充，允许先生成草稿'],
  ['章节大纲与正文生成', '按模板生成商务响应、技术方案和实施计划'],
  ['风险与一致性检查', '检查招标要求响应、主体信息和引用材料'],
] as const

function agentPhaseInfo(phase: AgentPhase): { label: string; cls: AgentTone; meta: string } {
  if (phase === 'running') return { label: '执行中', cls: 'warn', meta: '后台生成中 / 刚刚' }
  if (phase === 'failed') return { label: '执行失败', cls: 'risk', meta: '等待重试 / 刚刚' }
  if (phase === 'done') return { label: '已完成', cls: 'ok', meta: '已生成草稿 / 刚刚' }
  return { label: '待确认', cls: 'warn', meta: '待确认 / 刚刚' }
}

function agentStepClass(phase: AgentPhase, progress: number, index: number) {
  if (phase === 'done') return index === 2 ? 'warning' : 'done'
  if (phase === 'failed') {
    if (index < 3) return index === 2 ? 'warning' : 'done'
    if (index === 3) return 'failed'
    return 'pending'
  }
  if (phase === 'running') {
    if (index < progress) return index === 2 ? 'warning' : 'done'
    if (index === progress) return 'active'
  }
  return 'pending'
}

export function SuperAgentPage() {
  const navigate = useNavigate()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [agentPhase, setAgentPhase] = useState<AgentPhase>('confirm')
  const [agentProgress, setAgentProgress] = useState(0)
  const [agentFailedOnce, setAgentFailedOnce] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  useEffect(() => {
    if (agentPhase !== 'running') return undefined
    const timer = window.setTimeout(() => {
      if (agentProgress === 3 && !agentFailedOnce) {
        setAgentFailedOnce(true)
        setAgentPhase('failed')
        return
      }
      if (agentProgress >= 4) {
        setAgentProgress(5)
        setAgentPhase('done')
        return
      }
      setAgentProgress((value) => value + 1)
    }, 760)
    return () => window.clearTimeout(timer)
  }, [agentFailedOnce, agentPhase, agentProgress])
  const phase = agentPhaseInfo(agentPhase)
  const tasks = superAgentTasks.map((task, index) => index === 0 ? { ...task, meta: phase.meta, status: phase.label, cls: phase.cls } : task)
  const displayedSelected = selectedIndex >= 0 ? tasks[selectedIndex] : null
  const startAgentGeneration = () => {
    setSelectedIndex(0)
    setAgentPhase('running')
    setAgentProgress(0)
    setAgentFailedOnce(false)
  }
  const retryAgentGeneration = () => {
    setSelectedIndex(0)
    setAgentPhase('running')
  }
  const startNewTask = () => {
    setSelectedIndex(-1)
    setAgentPhase('confirm')
    setAgentProgress(0)
    setAgentFailedOnce(false)
  }
  return <>
    <PageHeader eyebrow="统一入口 / 超级智能体" title="超级智能体" description="统一发起、恢复和跟踪智能任务；生成类任务在会话中完成识别、确认、执行和结果回传。"/>
    <section className="section html-agent-shell">
      <aside className="html-agent-sidebar"><div className="html-agent-sidebar-head"><Button variant="primary" icon="plus" onClick={startNewTask}>新建任务</Button></div><div className="html-agent-list"><div className="html-agent-list-title">最近任务</div>{tasks.map((task, index) => <button key={task.title} className={`html-agent-history-item ${selectedIndex === index ? 'active' : ''}`} onClick={() => setSelectedIndex(index)}><strong>{task.title}</strong><small>来源：超级智能体</small><small>{task.meta}</small><span className="html-agent-record-meta"><HtmlBadge tone={task.cls === 'ok' ? 'ok' : task.cls === 'risk' ? 'risk' : 'warn'}>{task.status}</HtmlBadge></span></button>)}</div></aside>
      <main className="html-agent-main">{displayedSelected ? <AgentTaskMain task={displayedSelected} phase={agentPhase} progress={agentProgress} onStart={startAgentGeneration} onRetry={retryAgentGeneration} onPreview={() => setPreviewOpen(true)} onEnterTender={() => navigate('/procurement/tender/bid-writing')}/> : <NewAgentTask onSend={() => { setSelectedIndex(0); setAgentPhase('confirm'); setAgentProgress(0); setAgentFailedOnce(false) }}/>}</main>
    </section>
    <Drawer open={previewOpen} title="云资源扩容项目投标书草稿" eyebrow="投标书预览" onClose={() => setPreviewOpen(false)} footer={<><Button onClick={() => setPreviewOpen(false)}>取消</Button><Button variant="primary" onClick={() => { setPreviewOpen(false); navigate('/procurement/tender/bid-writing') }}>继续编辑</Button></>}>
      <AgentDraftPreview/>
    </Drawer>
  </>
}

function AgentTaskMain({ task, phase, progress, onStart, onRetry, onPreview, onEnterTender }: { task: AgentTask; phase: AgentPhase; progress: number; onStart: () => void; onRetry: () => void; onPreview: () => void; onEnterTender: () => void }) {
  if (task.kind !== 'tenderWrite') return <><div className="html-agent-main-head"><div><h2>{task.title}</h2><p>{task.meta}</p></div><HtmlBadge>任务会话</HtmlBadge></div><div className="html-agent-thread"><div className="html-agent-message user">{task.query}</div><div className="html-agent-message agent">已恢复任务上下文，以下是当前处理结果。</div><div className="html-agent-result-list">{task.result?.map((item) => <div className="html-agent-result-row" key={item}><span>{item}</span><Button>查看</Button></div>)}</div></div><AgentComposer placeholder="继续输入任务要求"/></>
  let tenderContent = <AgentConfirmCard onStart={onStart}/>
  if (phase === 'running' || phase === 'failed') tenderContent = <AgentProgressCard phase={phase} progress={progress} onRetry={onRetry}/>
  if (phase === 'done') tenderContent = <AgentResultCard onPreview={onPreview} onEnterTender={onEnterTender}/>
  return <>
    <div className="html-agent-main-head"><div><h2>{task.title}</h2><p>{task.meta}</p></div><HtmlBadge tone={task.cls === 'ok' ? 'ok' : task.cls === 'risk' ? 'risk' : 'warn'}>{task.status}</HtmlBadge></div>
    <div className="html-agent-thread"><div className="html-agent-message user">{task.query}</div><div className="html-agent-message agent">已识别为“招投标书撰写”任务，请确认项目、主体、模板和引用材料。</div>{tenderContent}</div>
    <AgentComposer placeholder="继续输入，例如：重点突出安全保障能力"/>
  </>
}

function NewAgentTask({ onSend }: { onSend: () => void }) {
  return <><div className="html-agent-main-head"><div><h2>新建智能任务</h2><p>输入任务后，系统会识别业务域、能力项和所需信息。</p></div><StatusTag>Primary Agent</StatusTag></div><div className="html-agent-empty-state"><div><h2>今天要处理什么？</h2><p>当前演示重点展示招投标书撰写任务。</p><div className="html-agent-composer"><input readOnly value="帮我写一份云资源扩容采购项目的投标书"/><Button variant="primary" onClick={onSend}>发送</Button></div></div></div></>
}

function AgentConfirmCard({ onStart }: { onStart: () => void }) {
  return <div className="html-agent-confirm-card">
    <div className="html-agent-card-head"><div><h3>任务识别与执行确认</h3><p>确认后由招投标 Agent 异步生成投标书草稿。</p></div><HtmlBadge tone="warn">待确认</HtmlBadge></div>
    <div className="html-agent-route-card"><span className="html-agent-route-icon"><Icon name="agent"/></span><div><strong>招投标 Agent / 招投标书撰写</strong><small>识别置信度 96%，将生成投标书并检查缺失材料。</small></div><HtmlBadge tone="ok">路由已识别</HtmlBadge></div>
    <div className="html-agent-info-grid"><div><strong>投标书模板</strong><span>政企云资源项目投标书模板</span></div><div><strong>投标主体</strong><span>中国电子云股份有限公司</span></div><div><strong>项目名称</strong><span>云资源扩容采购项目</span></div><div><strong>引用材料</strong><span>招标文件.pdf、公司资质与案例材料.zip</span></div></div>
    <div className="html-agent-inline-alert"><Icon name="warning"/><span>法定代表人授权函、同类项目案例、项目经理资格证明待补充；允许先生成草稿。</span></div>
    <div className="page-actions html-agent-card-actions"><Button variant="primary" icon="agent" onClick={onStart}>确认并开始执行</Button><Button>补充资料</Button></div>
  </div>
}

function AgentProgressCard({ phase, progress, onRetry }: { phase: AgentPhase; progress: number; onRetry: () => void }) {
  const failed = phase === 'failed'
  return <div className="html-agent-output-card">
    <div className="html-agent-card-head"><div><h3>{failed ? '执行遇到异常' : '正在生成投标书草稿'}</h3><p>{failed ? '可以从失败步骤继续，不需要重新上传材料。' : '任务在后台异步执行，离开页面不会中断。'}</p></div><HtmlBadge tone={failed ? 'risk' : 'warn'}>{failed ? '执行失败' : '执行中'}</HtmlBadge></div>
    <div className="html-agent-flow">{agentSteps.map(([title, description], index) => {
      const cls = agentStepClass(phase, progress, index)
      const mark = cls === 'done' ? '✓' : cls === 'warning' || cls === 'failed' ? '!' : String(index + 1)
      const detail = cls === 'failed' ? '模型服务响应超时，前序解析结果已保留' : description
      return <div className={`html-agent-step ${cls}`} key={title}><span className="html-agent-step-mark">{mark}</span><div className="html-agent-step-content"><strong>{title}</strong><span>{detail}</span></div>{cls === 'active' ? <i className="html-agent-spinner"/> : cls === 'failed' ? <HtmlBadge tone="risk">失败</HtmlBadge> : null}</div>
    })}</div>
    {failed && <div className="html-agent-inline-alert risk"><Icon name="warning"/><span>“章节大纲与正文生成”首次执行失败。重试后将继续完成当前任务。</span></div>}
    <div className="page-actions html-agent-card-actions">{failed ? <Button variant="primary" icon="refresh" onClick={onRetry}>重试失败步骤</Button> : <Button icon="clock" disabled>后台执行中</Button>}</div>
  </div>
}

function AgentResultCard({ onPreview, onEnterTender }: { onPreview: () => void; onEnterTender: () => void }) {
  return <><div className="html-agent-message agent">投标书草稿已生成，结果已同步到最近任务。业务页面保持原有操作方式，可在右下角调用智能助手。</div><div className="html-agent-output-card">
    <div className="html-agent-card-head"><div><h3>投标书草稿生成结果</h3><p>已形成章节正文、缺失材料清单和人工确认项。</p></div><HtmlBadge tone="ok">生成完成</HtmlBadge></div>
    <div className="html-agent-output-grid"><div><strong>已生成章节</strong><span>商务响应、技术服务方案、实施计划、服务保障、附件清单</span></div><div><strong>待补充材料</strong><span>授权函、案例材料、项目经理资格证明</span></div><div><strong>需人工确认</strong><span>报价范围、重大故障响应时限</span></div><div><strong>后续处理</strong><span>进入原招投标书撰写页面继续办理</span></div></div>
    <div className="page-actions html-agent-card-actions"><Button icon="eye" onClick={onPreview}>预览草稿</Button><Button variant="primary" onClick={onEnterTender}>进入撰写页面</Button><Button>导出 Word</Button></div>
  </div></>
}

function AgentComposer({ placeholder }: { placeholder: string }) {
  return <div className="html-agent-composer html-agent-bottom-composer"><input placeholder={placeholder}/><Button variant="primary">发送</Button></div>
}

function AgentDraftPreview() {
  return <div className="html-agent-doc-preview"><h3>云资源扩容采购项目投标书</h3><p className="marked">投标主体：中国电子云股份有限公司</p><p>本草稿依据《云资源扩容采购项目招标文件.pdf》和“政企云资源项目投标书模板”生成。</p><p>一、商务响应已根据招标文件要求生成，包含报价说明、服务承诺和响应偏离表。</p><p>二、技术服务方案已生成初稿，包含总体架构、实施路径、运维保障和安全措施。</p><p>三、实施计划已生成，包含项目启动、资源准备、部署实施、验收交付四个阶段。</p><p className="warn">待补充材料：授权函、近三年同类项目案例、项目经理资格证明。</p><p>后续可点击对话区“继续编辑”，进入招投标书撰写页面完成章节编辑、附件补充、格式调整和导出。</p></div>
}

export function ProcurementOverviewPage() {
  const navigate = useNavigate()
  return <>
    <PageHeader eyebrow="采购应用 / 总览" title="采购应用总览" description="聚合招投标、合同、审查、采购四类业务视图，展示采购应用侧的场景导航、任务统计与处理记录。"/>
    <section className="html-grid four">{overviewStats.map(([label, value, helper, progress]) => <HtmlStatCard key={label} label={label} value={value} helper={helper} progress={progress}/>)}</section>
    <section className="section"><div className="section-title"><h2>场景入口</h2></div><div className="html-grid four">{moduleEntries.map((item) => <MainlineEntry key={item.id} title={item.label} badge={item.badge} description={item.description} icon={item.icon} onEnter={() => navigate(`/procurement/${item.id}`)}/>)}</div></section>
    <section className="section html-grid two"><Panel title="业务动态"><div className="html-notes"><div>招投标：云资源扩容项目材料已更新，资格条件待业务确认。</div><div>合同：采购合同高风险条款待法务复核。</div><div>审查：验收单与发票一致性存在待处理异常。</div><div>采购：年度云服务预算测算进行中。</div></div></Panel><Panel title="场景提示"><div className="html-notes"><div>采购人员常用：招投标书撰写、合同撰写、采购方案撰写。</div><div>评审人员常用：供应商资格审查、围串标识别、智能评标。</div><div>业务部门常用：文档审查、单据审查、智能预算、采购单撰写。</div></div></Panel></section>
  </>
}

export function ProcurementModulePage() {
  const navigate = useNavigate()
  const { module = 'tender', submodule } = useParams()
  const config = procurementModules[module as keyof typeof procurementModules] || procurementModules.tender
  const activeTab = useMemo(() => {
    const bySlug: Record<string, string> = {
      'bid-writing': '招投标书撰写',
      qualification: '供应商资格审查',
      collusion: '围串标识别',
      evaluation: '智能评标',
      writing: '合同撰写',
      extraction: '合同抽取',
      archive: '合同归档',
      compare: '合同对比',
      review: module === 'contract' ? '智能审查' : '文档审查',
      document: '文档审查',
      receipt: '单据审查',
      plan: '采购方案撰写',
      budget: '智能预算',
      order: '采购单撰写',
    }
    return bySlug[submodule || ''] || config.tabs[0]
  }, [config.tabs, module, submodule])
  return <>
    <PageHeader eyebrow={config.eyebrow} title={config.title} description={config.summary} actions={<><Button icon="plus" variant="primary">新建任务</Button><Button icon="agent" onClick={() => navigate('/super-agent')}>询问智能体</Button></>}/>
    <nav className="module-tab-nav" aria-label={`${config.title}能力切换`}>{config.tabs.map((tab) => <button key={tab} className={tab === activeTab ? 'active' : ''}>{tab}</button>)}</nav>
    <section className="procurement-workspace"><Panel title="任务列表" subtitle="按最近处理时间排序"><div className="task-card-list">{config.tasks.map((task, index) => <button key={task[0]} className={index === 0 ? 'active' : ''}><strong>{task[0]}</strong><span>{task[1]}</span></button>)}</div></Panel><Panel title={activeTab} subtitle="中间工作区承载材料上传、解析进度、结果预览和人工确认"><div className="procurement-result-preview"><div className="upload-placeholder"><Icon name="file"/><strong>上传或选择项目资料</strong><span>支持采购需求说明、合同草稿、投标文件、发票验收单等材料。</span></div><div className="doc-preview-lines"><p className="hot">智能指令：{config.prompt}</p><p>一、已识别业务对象和适用模板。</p><p>二、已匹配知识库口径和历史相似任务。</p><p className="risk">三、发现需人工确认的风险项：付款比例、资质证明或单据一致性。</p><p>四、下一步：提交确认后可导出结果。</p></div></div></Panel><Panel title="AI 建议" subtitle="当前页面级助手"><div className="ai-suggestion-list">{['补充评分办法中的客观分规则', '检查供应商资质有效期', '引用采购制度最新口径'].map((item) => <article key={item}><Icon name="agent"/><span>{item}</span><StatusTag>建议</StatusTag></article>)}</div></Panel></section>
  </>
}
