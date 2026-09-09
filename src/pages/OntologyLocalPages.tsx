import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useOntologyStore, type OntologyElement, type OntologyElementType } from '../ontologyMysqlStore'
import { useAppStore } from '../store'
import { Button, Drawer, EmptyState, Field, FilterGrid, Icon, Modal, PageHeader, Panel, StatusTag, Tabs } from '../ui'
import { OntologyVisualModeler, saveOntologyLayoutPosition, type CanvasPosition } from './OntologyVisualModeler'

const productText = (value = '') => value
  .replaceAll('本体与图谱', '知识图谱')
  .replaceAll('监管基础本体', '基础图谱结构')
  .replaceAll('领域扩展本体', '领域图谱结构')
  .replaceAll('本体管理', '图谱结构')
  .replaceAll('本体类', '实体类型')
  .replaceAll('本体元素', '结构定义项')
  .replaceAll('本体版本', '图谱结构版本')
  .replaceAll('本体', '图谱结构')

const displayOntologyDomain = (item: { id: string; domain: string }) => item.id === 'ONT-PROC' && item.domain === '采购' ? '采购与供应链' : item.domain
const ontologyDomainOrder = ['采购与供应链', '采购', '合同', '财务', '通用']
const ontologyHasStructure = (item: { classes: number; properties: number; relations: number }) => item.classes + item.properties + item.relations > 0

const createInitial = { id: '', name: '', scope: '领域图谱结构', domain: '采购', description: '' }
const elementInitial = { type: 'class' as OntologyElementType, code: '', name: '', ownerCode: '', targetCode: '', dataType: '实体类型', constraint: '', description: '' }
const typeLabels: Record<OntologyElementType, string> = { class: '实体类型', property: '属性字段', relation: '关系类型' }
const entityGroupOrder = ['组织与供应商', '物料与价格', '仓储与库存', '寻源与采购', '履约与到货', '质量与退货', '结算与付款', '合同主档与模板', '条款与版本', '审批与签署', '合同履约与交付', '合同商务与订单', '合同变更与终止', '合同风险与争议', '合同文档与追溯', '合同分析事实', '治理与追溯']
const entityGroupLabel = (code = '') => {
  if (/CONTRACT\.(Company|LegalEntity|BusinessUnit|User|Party|PartyRole|Contact|Address|ContractType|ContractCategory)/.test(code)) return '组织与供应商'
  if (/CONTRACT\.(Contract|ContractTemplate)/.test(code)) return '合同主档与模板'
  if (/CONTRACT\.(ContractVersion|ContractSection|ContractClause|ClauseVersion)/.test(code)) return '条款与版本'
  if (/CONTRACT\.(ApprovalTask|ApprovalRecord|SignatureRecord|SignatureEvidence)/.test(code)) return '审批与签署'
  if (/CONTRACT\.(ContractObligation|ContractRight|ContractDeliverable|Milestone|Acceptance|AcceptanceLine|ServiceLevelAgreement|SLACommitment|Project|Task|Timesheet|Delivery)/.test(code)) return '合同履约与交付'
  if (/CONTRACT\.(Opportunity|Quotation|PurchaseAgreement|SalesOrder|PurchaseOrder|OrderLine)/.test(code)) return '合同商务与订单'
  if (/CONTRACT\.(ContractChange|Renewal|Suspension|Termination|Closeout)/.test(code)) return '合同变更与终止'
  if (/CONTRACT\.(RiskEvent|BreachEvent|Claim|Dispute|CorrectiveAction)/.test(code)) return '合同风险与争议'
  if (/CONTRACT\.(Document|DocumentVersion|Communication|SourceSystem|SourceRecord)/.test(code)) return '合同文档与追溯'
  if (/CONTRACT\.(ContractValueFact|ObligationPerformanceFact|RenewalForecast|PaymentExposure)/.test(code)) return '合同分析事实'
  if (/CONTRACT\.(Invoice|Bill|PaymentPlan|Payment|PaymentAllocation)/.test(code)) return '结算与付款'
  if (/PROC\.(Company|LegalEntity|BusinessUnit|User|Role|Address|BankAccount|Supplier|SupplierSite|SupplierQualification|SupplierRiskProfile|SupplierPerformance|Reviewer|Contact)/.test(code)) return '组织与供应商'
  if (/PROC\.(Product|ProductIdentifier|ProductCategory|ProductAttribute|ProductVariant|ProductPackage|SupplierProduct|ApprovedSupplierList|ProductPrice|PriceHistory)/.test(code)) return '物料与价格'
  if (/PROC\.(Warehouse|Location|StockBalance|InventoryLedger|StockMove|StockMoveLine|InventoryOwner|InventoryOperation|InventoryOperationLine|InventoryTransfer|InventoryCount|InventoryAdjustment|StockReservation|OwnershipTransfer|LotSerial|LogisticUnit)/.test(code)) return '仓储与库存'
  if (/PROC\.(PurchaseRequest|SourcingEvent|RFQ|RFQLine|RFQSupplier|SupplierQuotation|SupplierQuotationLine|BidEvaluation|AwardDecision|PurchaseAgreement|PurchaseAgreementLine|PurchaseOrder|PurchaseOrderLine)/.test(code)) return '寻源与采购'
  if (/PROC\.(PaymentPlan|PaymentPlanLine|OrderSchedule|ChangeOrder|AdvanceShipmentNotice|ASNLine|PurchaseArrival|PurchaseArrivalLine|PurchaseReceipt|PurchaseReceiptLine)/.test(code)) return '履约与到货'
  if (/PROC\.(QualityInspection|QualityInspectionLine|NonConformance|CorrectiveAction|PurchaseReturn|PurchaseReturnLine)/.test(code)) return '质量与退货'
  if (/PROC\.(PurchaseSettlement|PurchaseSettlementLine|PurchaseInvoice|PurchaseInvoiceLine|SupplierReconciliation|SupplierReconciliationLine|Payment|PaymentAllocation|AccountJournal)/.test(code)) return '结算与付款'
  return '治理与追溯'
}
type OntologyEditorMode = 'structured' | 'visual'
type StructureElementFilter = '全部' | '属性字段' | '关系类型'
const structureElementFilters: StructureElementFilter[] = ['全部', '属性字段', '关系类型']
const codeSegment = (code: string, fallback: string) => {
  const raw = (code.split('.').pop() || code || fallback).trim()
  const value = raw.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase()
  return value || fallback
}
const readonlyOntologyStatuses = ['已发布', '已下架', '已删除', '已启用', '已启动', '启用']
const copyableOntologyStatuses = ['已发布', '已下架', '已启用', '已启动', '启用']
const isReadonlyOntology = (status: string) => readonlyOntologyStatuses.includes(status)
const isCopyableOntology = (status: string) => copyableOntologyStatuses.includes(status)
const ontologyActionLabel = (status: string) => isCopyableOntology(status) ? '复制版本' : '发布'
const ontologyActionTitle = (status = '') => isCopyableOntology(status) ? '复制图谱结构新版本' : '发布图谱结构版本'
const ontologyActionConfirm = (status = '') => isCopyableOntology(status) ? '确认复制' : '确认发布'
const deleteOntologyTitle = (status = '') => status === '已发布' ? '删除已发布图谱结构' : status === '已下架' ? '删除已下架图谱结构' : '删除图谱结构'
const deleteOntologyNotice = (status = '') => status === '已发布'
  ? '已发布图谱结构不能直接删除，请先下架后再删除。'
  : status === '已下架'
    ? '删除后将从列表和新业务选择中移除，历史引用和审计仍保留。'
    : '仅未被场景、规则、数据源或知识图谱引用的草稿版本可以删除，操作不可恢复。'
export function OntologyListPage({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate()
  const ontologies = useOntologyStore((state) => state.ontologies)

  const copyOntology = useOntologyStore((state) => state.copyOntology)
  const activateOntology = useOntologyStore((state) => state.activateOntology)
  const deleteOntology = useOntologyStore((state) => state.deleteOntology)
  const retireOntology = useOntologyStore((state) => state.retireOntology)
  const publishOntology = useOntologyStore((state) => state.publishOntology)
  const addAudit = useAppStore((state) => state.addAudit)
  const setToast = useAppStore((state) => state.setToast)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('全部')

  const [target, setTarget] = useState<(typeof ontologies)[number] | null>(null)
  const [activateTarget, setActivateTarget] = useState<(typeof ontologies)[number] | null>(null)
  const [retireTarget, setRetireTarget] = useState<(typeof ontologies)[number] | null>(null)
  const [listDeleteTarget, setListDeleteTarget] = useState<(typeof ontologies)[number] | null>(null)

  const rows = useMemo(() => ontologies
    .filter((item) => (!keyword || `${productText(item.name)}${item.id}${displayOntologyDomain(item)}`.toLowerCase().includes(keyword.toLowerCase())) && (status === '全部' || item.status === status))
    .sort((a, b) => {
      const domainDiff = ontologyDomainOrder.indexOf(displayOntologyDomain(a)) - ontologyDomainOrder.indexOf(displayOntologyDomain(b))
      const structureDiff = Number(ontologyHasStructure(b)) - Number(ontologyHasStructure(a))
      return domainDiff || structureDiff || a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id)
    }), [ontologies, keyword, status])
  const confirmVersionAction = async () => {
    if (!target) return
    const copy = isCopyableOntology(target.status)
    const result = copy ? await copyOntology(target.id) : await publishOntology(target.id)
    setToast(result.message)
    if (!result.ok) return
    addAudit({ operator: '陈洁', organization: '数据管理部', action: copy ? '复制图谱结构版本' : '发布图谱结构版本', objectType: '图谱结构', objectId: result.objectId || target.id, summary: `${productText(target.name)} ${target.version}`, result: '成功', risk: copy ? '普通' : '高危' })
    setTarget(null)
    if (result.objectId) navigate(`/ontology/${result.objectId}`)
  }

  const retire = async () => {
    if (!retireTarget) return
    const result = await retireOntology(retireTarget.id)
    setToast(result.message)
    if (!result.ok) return
    addAudit({ operator: '陈洁', organization: '数据管理部', action: '下架图谱结构', objectType: '图谱结构', objectId: retireTarget.id, summary: `${productText(retireTarget.name)} ${retireTarget.version}`, result: '成功', risk: '高危' })
    setRetireTarget(null)
  }

  const activate = async () => {
    if (!activateTarget) return
    const result = await activateOntology(activateTarget.id)
    setToast(result.message)
    if (!result.ok) return
    addAudit({ operator: '陈洁', organization: '数据管理部', action: '重新上架图谱结构', objectType: '图谱结构', objectId: activateTarget.id, summary: `${productText(activateTarget.name)} ${activateTarget.version}`, result: '成功', risk: '高危' })
    setActivateTarget(null)
  }

  const remove = async () => {
    if (!listDeleteTarget) return
    const result = await deleteOntology(listDeleteTarget.id)
    setToast(result.message)
    if (!result.ok) return
    addAudit({ operator: '陈洁', organization: '数据管理部', action: '删除图谱结构', objectType: '图谱结构', objectId: listDeleteTarget.id, summary: `${productText(listDeleteTarget.name)} ${listDeleteTarget.version}`, result: '成功', risk: '高危' })
    setListDeleteTarget(null)
  }


  return <>
    {!embedded && <PageHeader eyebrow="能力中心 / 知识图谱 / 图谱结构" title="图谱结构" description="维护知识图谱中的实体、属性与关系定义。" actions={<><Button icon="refresh" onClick={() => setToast('图谱结构列表已刷新')}>刷新</Button><Button variant="primary" icon="plus" onClick={() => navigate('/ontology/new')}>新建图谱结构</Button></>}/>}
    {embedded && <div className="section-toolbar"><div><strong>图谱结构</strong><span>维护知识图谱中的实体、属性与关系定义。</span></div><div className="page-actions"><Button icon="refresh" onClick={() => setToast('图谱结构列表已刷新')}>刷新</Button><Button variant="primary" icon="plus" onClick={() => navigate('/ontology/new')}>新建图谱结构</Button></div></div>}
    <FilterGrid onReset={() => { setKeyword(''); setStatus('全部') }} onSearch={() => setToast(`查询完成，共${rows.length}个图谱结构`)}><Field label="关键词"><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="结构名称、编码或领域"/></Field><Field label="状态"><select value={status} onChange={(event) => setStatus(event.target.value)}><option>全部</option><option>草稿</option><option>已发布</option><option>已下架</option></select></Field></FilterGrid>
    <Panel title="图谱结构列表" subtitle="草稿可编辑；已发布和已下架版本只读，变更必须复制新版本。">{rows.length === 0 ? <EmptyState title="没有符合条件的图谱结构" description="请调整筛选条件或新建图谱结构。"/> : <div className="table-container"><table><thead><tr><th>结构名称 / 编码</th><th>监管领域</th><th>版本</th><th>实体类型 / 属性字段 / 关系类型</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td><button className="table-link title-cell" onClick={() => navigate(`/ontology/${item.id}`)}><strong>{productText(item.name)}</strong><span>{item.id}</span></button></td><td>{displayOntologyDomain(item)}</td><td>{item.version}</td><td><span className="metrics-inline"><b>{item.classes}</b>实体类型 · <b>{item.properties}</b>属性字段 · <b>{item.relations}</b>关系类型</span></td><td><StatusTag>{item.status}</StatusTag></td><td>{item.updatedAt}</td><td><div className="row-actions"><button onClick={() => navigate(`/ontology/${item.id}`)}>{isReadonlyOntology(item.status) ? '查看' : '编辑'}</button>{item.status === '已下架' && <button onClick={() => setActivateTarget(item)}>上架</button>}<button onClick={() => setTarget(item)}>{ontologyActionLabel(item.status)}</button>{item.status === '已发布' && <button onClick={() => setRetireTarget(item)}>下架</button>}{item.status !== '已发布' && <button className="danger-link" onClick={() => setListDeleteTarget(item)}>删除</button>}</div></td></tr>)}</tbody></table></div>}</Panel>

    <Modal open={!!target} title={ontologyActionTitle(target?.status)} description={target ? `${productText(target.name)} ${target.version}` : ''} confirmText={ontologyActionConfirm(target?.status)} onClose={() => setTarget(null)} onConfirm={confirmVersionAction}>{target?.status === '草稿' ? <><div className="publish-checklist">{[['基本信息完整', true], ['至少定义一个实体类型', Boolean(target && target.classes > 0)], ['正式版本号自动生成', true], ['发布/下架后版本只读', true]].map(([label, pass]) => <div key={String(label)}><Icon name={pass ? 'check' : 'warning'}/><span>{label}</span><StatusTag>{pass ? '通过' : '需检查'}</StatusTag></div>)}</div><div className="alert-box"><Icon name="check"/><span>确认发布后，系统会自动校验属性字段和关系类型引用，并生成下一个正式版本号；首次发布为 V1，V1 内容复制后再次发布为 V2。</span></div></> : <div className="alert-box"><Icon name="copy"/><span>复制后进入待发布状态，发布时自动生成下一个正式版本号；例如 V1 内容复制后，发布为 V2。</span></div>}</Modal>
    <Modal open={!!retireTarget} title="下架图谱结构" description={retireTarget ? `${productText(retireTarget.name)} · ${retireTarget.id}` : ''} confirmText="确认下架" onClose={() => setRetireTarget(null)} onConfirm={retire}><div className="alert-box"><Icon name="warning"/><span>下架后该图谱结构不再允许新业务引用，但历史数据、引用关系和审计记录会继续保留；如需调整请复制新版本。</span></div></Modal>
    <Modal open={!!activateTarget} title="上架图谱结构" description={activateTarget ? `${productText(activateTarget.name)} · ${activateTarget.id}` : ''} confirmText="确认上架" onClose={() => setActivateTarget(null)} onConfirm={activate}><div className="alert-box"><Icon name="check"/><span>上架后该图谱结构将恢复为已发布状态，可重新被新业务选择；原版本内容和历史引用保持不变。</span></div></Modal>
    <Modal open={!!listDeleteTarget} title={deleteOntologyTitle(listDeleteTarget?.status)} description={listDeleteTarget ? `${productText(listDeleteTarget.name)} · ${listDeleteTarget.id}` : ''} confirmText="确认删除" danger onClose={() => setListDeleteTarget(null)} onConfirm={remove}><div className="alert-box danger"><Icon name="warning"/><span>{deleteOntologyNotice(listDeleteTarget?.status)}</span></div></Modal>
  </>
}
export function OntologyCreatePage() {
  const navigate = useNavigate()
  const createOntology = useOntologyStore((state) => state.createOntology)
  const addAudit = useAppStore((state) => state.addAudit)
  const setToast = useAppStore((state) => state.setToast)
  const [form, setForm] = useState(createInitial)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const patch = (next: Partial<typeof createInitial>) => { setForm((value) => ({ ...value, ...next })); setDirty(true) }
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirty || saving) return
      event.preventDefault(); event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty, saving])
  const basicDone = Boolean(form.name.trim() && form.domain)
  const createDraft = async (nextStep = false) => {
    if (saving) return
    if (!form.name.trim()) { setToast('结构名称不能为空'); return }
    setSaving(true)
    const payload = { ...form, id: form.id.trim().toUpperCase(), name: form.name.trim(), description: form.description.trim() }
    const result = await createOntology(payload)
    setToast(result.message)
    if (!result.ok || !result.objectId) { setSaving(false); return }
    addAudit({ operator: '尹晨阳', organization: '集团监管部', action: '新建图谱结构', objectType: '图谱结构', objectId: result.objectId, summary: `${payload.name} / ${payload.domain}`, result: '成功', risk: '普通' })
    setDirty(false)
    navigate(`/ontology/${encodeURIComponent(result.objectId)}?tab=${nextStep ? 'structure' : 'basic'}&flow=create`, { replace: true })
  }
  const cancel = () => {
    if (saving) { setToast('正在创建图谱结构，请稍候'); return }
    if (dirty && !window.confirm('当前新建内容尚未保存，确认放弃并返回？')) return
    navigate('/graphs/structures')
  }
  return <>
    <div className="simple-rule-header"><div><button type="button" className="back-button" onClick={cancel}>‹ 返回图谱结构</button><p className="eyebrow">图谱结构 / 新建图谱结构</p><h1>{form.name.trim() || '新增图谱结构'}</h1><div className="editor-meta"><StatusTag>未创建</StatusTag><span>创建后版本为待发布</span><span>{dirty ? '存在未保存修改' : '填写基本信息后保存'}</span></div></div></div>
    <main className="rule-step-content">
      <Panel title="1. 基本信息" subtitle="先创建图谱结构；实体类型、属性字段、关系类型和版本校验在编辑页继续维护">
        <div className="form-section two-column">
          <Field label="结构名称 *"><input value={form.name} onChange={(event) => patch({ name: event.target.value })} placeholder="例如：供应链监管图谱结构"/></Field>
          <Field label="结构编码"><input value={form.id} onChange={(event) => patch({ id: event.target.value.toUpperCase() })} placeholder="留空自动生成"/></Field>
          <Field label="监管领域 *"><select value={form.domain} onChange={(event) => patch({ domain: event.target.value })}><option>采购</option><option>合同</option><option>财务</option><option>投资</option><option>通用</option></select></Field>
          <Field label="结构说明" wide><textarea value={form.description} onChange={(event) => patch({ description: event.target.value })} placeholder="说明图谱结构覆盖范围、关键实体和使用边界"/></Field>
        </div>
        <div className="next-action-card"><Icon name={basicDone ? 'check' : 'clock'}/><div><strong>{basicDone ? '基本信息已完整' : '请先补齐基本信息'}</strong><span>{basicDone ? '点击下一步后创建图谱结构，并进入实体类型定义配置。' : '至少填写结构名称和监管领域；结构编码可留空自动生成，结构说明可后续补充。'}</span></div></div>
      </Panel>
    </main>
    <footer className="editor-action-bar"><div><span className={dirty ? 'dirty-dot' : ''}/><strong>{dirty ? '新建内容尚未保存' : '尚未创建图谱结构'}</strong><small>创建后可继续维护实体类型、属性字段和关系类型</small></div><div><Button disabled={saving} onClick={cancel}>取消</Button><Button disabled={saving} onClick={() => void createDraft(false)}>{saving ? '正在创建…' : '保存'}</Button><Button variant="primary" disabled={saving} onClick={() => void createDraft(true)}>{saving ? '正在创建…' : '下一步'}</Button></div></footer>
  </>
}

export function OntologyEditorPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab') || 'basic'
  const normalizedRequestedTab = ['basic','structure','versions'].includes(requestedTab) ? requestedTab : ['class','property','relation'].includes(requestedTab) ? 'structure' : 'basic'
  const creatingFlow = searchParams.get('flow') === 'create'
  const item = useOntologyStore((state) => state.ontologies.find((row) => row.id === id))
  const updateOntology = useOntologyStore((state) => state.updateOntology)
  const deleteOntology = useOntologyStore((state) => state.deleteOntology)
  const activateOntology = useOntologyStore((state) => state.activateOntology)
  const publishOntology = useOntologyStore((state) => state.publishOntology)
  const addElement = useOntologyStore((state) => state.addElement)
  const deleteElement = useOntologyStore((state) => state.deleteElement)
  const addAudit = useAppStore((state) => state.addAudit)
  const setToast = useAppStore((state) => state.setToast)
  const [tab, setTab] = useState(normalizedRequestedTab)
  const [editorMode, setEditorMode] = useState<OntologyEditorMode>('structured')
  const [draft, setDraft] = useState({ name: '', scope: '领域图谱结构', domain: '采购', description: '' })
  const [elementOpen, setElementOpen] = useState(false)
  const validateOntology = useOntologyStore((state) => state.validateOntology)
  const [elementForm, setElementForm] = useState(elementInitial)
  const [deleteTarget, setDeleteTarget] = useState<OntologyElement | null>(null)
  const updateElement = useOntologyStore((state) => state.updateElement)
  const [publishOpen, setPublishOpen] = useState(false)
  const [activateOpen, setActivateOpen] = useState(false)
  const [cancelCreateOpen, setCancelCreateOpen] = useState(false)
  const [cancelingCreate, setCancelingCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<OntologyElement | null>(null)
  const [pendingCanvasPosition, setPendingCanvasPosition] = useState<CanvasPosition | null>(null)
  const [elementCodeTouched, setElementCodeTouched] = useState(false)
  const [elementNameTouched, setElementNameTouched] = useState(false)
  const [selectedEntityCode, setSelectedEntityCode] = useState('')
  const [entityKeyword, setEntityKeyword] = useState('')
  const [structureKeyword, setStructureKeyword] = useState('')
  const [elementFilter, setElementFilter] = useState<StructureElementFilter>('全部')
  const modeScrollPositions = useRef<Record<OntologyEditorMode, number>>({ structured: 0, visual: 0 })
  const classOptions = useMemo(() => (item?.elements || []).filter((element) => element.type === 'class').sort((a, b) => {
    const groupDiff = entityGroupOrder.indexOf(entityGroupLabel(a.code)) - entityGroupOrder.indexOf(entityGroupLabel(b.code))
    return groupDiff || a.name.localeCompare(b.name, 'zh-CN') || a.code.localeCompare(b.code)
  }), [item?.elements])
  const propertyCountsByOwner = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const element of item?.elements || []) {
      if (element.type === 'property' && element.ownerCode) counts[element.ownerCode] = (counts[element.ownerCode] || 0) + 1
    }
    return counts
  }, [item?.elements])
  const relationCountsByEntity = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const element of item?.elements || []) {
      if (element.type !== 'relation') continue
      if (element.ownerCode) counts[element.ownerCode] = (counts[element.ownerCode] || 0) + 1
      if (element.targetCode && element.targetCode !== element.ownerCode) counts[element.targetCode] = (counts[element.targetCode] || 0) + 1
    }
    return counts
  }, [item?.elements])

  useEffect(() => {
    if (item) setDraft({ name: productText(item.name), scope: productText(item.scope), domain: item.domain, description: productText(item.description) })
  }, [item])

  useEffect(() => {
    if (!item) return
    setEditorMode('structured')
    setTab(normalizedRequestedTab)
    setEntityKeyword('')
    setStructureKeyword('')
    setElementFilter('全部')
    modeScrollPositions.current = { structured: 0, visual: 0 }
  }, [item?.id, normalizedRequestedTab])

  useEffect(() => {
    if (!item) return
    setSelectedEntityCode((current) => current && classOptions.some((element) => element.code === current) ? current : classOptions[0]?.code || '')
  }, [item?.id, classOptions])

  if (!item) return <EmptyState title="图谱结构版本不存在" description="请从图谱结构列表选择可访问版本。"/>
  const readonly = isReadonlyOntology(item.status)
  const canCancelCreation = creatingFlow && !readonly
  const selectedEntity = classOptions.find((element) => element.code === selectedEntityCode) || classOptions[0]
  const entityName = (code = '') => classOptions.find((option) => option.code === code)?.name || code || '未选择'
  const selectedProperties = selectedEntity ? item.elements.filter((element) => element.type === 'property' && element.ownerCode === selectedEntity.code) : []
  const selectedRelations = selectedEntity ? item.elements.filter((element) => element.type === 'relation' && (element.ownerCode === selectedEntity.code || element.targetCode === selectedEntity.code)) : []
  const structureElements = [...selectedProperties, ...selectedRelations]
  const entityKeywordValue = entityKeyword.trim().toLowerCase()
  const visibleClassOptions = classOptions.filter((element) => !entityKeywordValue || `${element.name}${element.code}${productText(element.description)}`.toLowerCase().includes(entityKeywordValue))
  const visibleClassGroups = entityGroupOrder.map((label) => ({ label, items: visibleClassOptions.filter((element) => entityGroupLabel(element.code) === label) })).filter((group) => group.items.length > 0)
  const structureKeywordValue = structureKeyword.trim().toLowerCase()
  const visibleStructureElements = structureElements.filter((element) => {
    const filterMatched = elementFilter === '全部' || typeLabels[element.type] === elementFilter
    const text = `${element.name}${element.code}${element.dataType}${productText(element.description)}${entityName(element.ownerCode)}${entityName(element.targetCode)}`.toLowerCase()
    return filterMatched && (!structureKeywordValue || text.includes(structureKeywordValue))
  })
  const deleteTargetLabel = deleteTarget ? typeLabels[deleteTarget.type] : '结构定义项'
  const deleteTargetProperties = deleteTarget?.type === 'class' ? item.elements.filter((element) => element.type === 'property' && element.ownerCode === deleteTarget.code) : []
  const deleteTargetRelations = deleteTarget?.type === 'class' ? item.elements.filter((element) => element.type === 'relation' && (element.ownerCode === deleteTarget.code || element.targetCode === deleteTarget.code)) : []
  const deleteBlockedByReferences = Boolean(deleteTarget?.type === 'class' && (deleteTargetProperties.length || deleteTargetRelations.length))
  const deleteTargetNotice = deleteBlockedByReferences
    ? `该实体类型已被 ${deleteTargetProperties.length} 个属性字段、${deleteTargetRelations.length} 个关系类型引用，不能直接删除。请先删除或调整这些属性字段和关系类型后再删除实体类型。`
    : deleteTarget?.type === 'class'
      ? '删除后将从当前草稿版本中移除该实体类型；已发布历史版本不受影响。'
      : deleteTarget?.type === 'property'
        ? '删除后将从当前草稿版本中移除该属性字段；已发布历史版本不受影响。'
        : deleteTarget?.type === 'relation'
          ? '删除后将从当前草稿版本中移除该关系类型；已发布历史版本不受影响。'
          : '删除后将从当前草稿版本中移除该结构定义项；已发布历史版本不受影响。'
  const relationSuggestion = (ownerCode: string, targetCode: string, excludeId = '') => {
    if (!ownerCode || !targetCode) return { code: '', name: '' }
    const named = (code: string) => classOptions.find((row) => row.code === code)?.name || code
    const namespace = ownerCode.includes('.') ? ownerCode.slice(0, ownerCode.lastIndexOf('.')) : 'REL'
    const base = `${namespace}.${codeSegment(ownerCode, 'source')}_to_${codeSegment(targetCode, 'target')}`
    const existing = new Set(item.elements.filter((element) => element.type === 'relation' && element.id !== excludeId).map((element) => element.code))
    let code = base
    let index = 2
    while (existing.has(code)) code = `${base}_${index++}`
    return { code, name: ownerCode && targetCode ? `${named(ownerCode)}关联${named(targetCode)}` : '' }
  }
  const entityFieldValue = (code = '') => code ? `${entityName(code)} · ${code}` : ''

  const save = async () => {
    const result = await updateOntology(item.id, draft)
    setToast(result.message)
    if (result.ok) addAudit({ operator: '陈洁', organization: '数据管理部', action: '保存图谱结构草稿', objectType: '图谱结构', objectId: item.id, summary: '更新基本信息', result: '成功', risk: '普通' })
  }
  const validate = async () => {
    const result = await validateOntology(item.id)
    setToast(result.message)
    if (result.ok) addAudit({ operator: '陈洁', organization: '数据管理部', action: '校验图谱结构版本', objectType: '图谱结构', objectId: item.id, summary: `${productText(item.name)} ${item.version}`, result: '成功', risk: '普通' })
  }
  const activate = async () => {
    const result = await activateOntology(item.id)
    setToast(result.message)
    if (!result.ok) return
    addAudit({ operator: '陈洁', organization: '数据管理部', action: '重新上架图谱结构', objectType: '图谱结构', objectId: item.id, summary: `${productText(item.name)} ${item.version}`, result: '成功', risk: '高危' })
    setActivateOpen(false)
  }
  const publish = async () => {
    const result = await publishOntology(item.id)
    setToast(result.message)
    if (!result.ok) return
    addAudit({ operator: '陈洁', organization: '数据管理部', action: '发布图谱结构版本', objectType: '图谱结构', objectId: item.id, summary: `${productText(item.name)} ${item.version}`, result: '成功', risk: '高危' })
    setPublishOpen(false)
  }
  const cancelCreation = async () => {
    if (!canCancelCreation || cancelingCreate) return
    setCancelingCreate(true)
    const result = await deleteOntology(item.id)
    setToast(result.message)
    setCancelingCreate(false)
    if (!result.ok) return
    addAudit({ operator: '陈洁', organization: '数据管理部', action: '取消新建图谱结构', objectType: '图谱结构', objectId: item.id, summary: `${productText(item.name)} ${item.version}`, result: '成功', risk: '普通' })
    setCancelCreateOpen(false)
    navigate('/graphs/structures', { replace: true })
  }
  const closeElementEditor = () => {
    setElementOpen(false)
    setEditTarget(null)
    setPendingCanvasPosition(null)
    setElementCodeTouched(false)
    setElementNameTouched(false)
  }
  const openElement = (type: OntologyElementType, element?: OntologyElement, defaults: Partial<typeof elementInitial> = {}, position?: CanvasPosition) => {
    const currentClass = classOptions.find((option) => option.code === selectedEntityCode) || classOptions[0]
    const ownerCode = type === 'class' ? '' : defaults.ownerCode || currentClass?.code || ''
    const targetCode = type === 'relation' ? defaults.targetCode || '' : ''
    const suggestion = type === 'relation' && !element ? relationSuggestion(ownerCode, targetCode) : { code: '', name: '' }
    setEditTarget(element || null)
    setPendingCanvasPosition(!element && position ? position : null)
    setElementCodeTouched(Boolean(element))
    setElementNameTouched(Boolean(element))
    setElementForm(element ? { ...elementInitial, ...element, dataType: productText(element.dataType), description: productText(element.description), ownerCode: element.ownerCode || '', targetCode: element.targetCode || '' } : { ...elementInitial, type, code: type === 'property' && ownerCode ? `${ownerCode}.` : type === 'relation' ? suggestion.code : '', name: type === 'relation' ? suggestion.name : '', ownerCode, targetCode, dataType: type === 'class' ? '实体类型' : type === 'property' ? '文本' : '实体类型 → 实体类型' })
    setElementOpen(true)
  }
  const updateRelationEndpoint = (field: 'ownerCode' | 'targetCode', value: string) => {
    const next = { ...elementForm, [field]: value }
    if (!editTarget && next.type === 'relation') {
      const suggestion = relationSuggestion(next.ownerCode, next.targetCode)
      if (!elementCodeTouched) next.code = suggestion.code
      if (!elementNameTouched) next.name = suggestion.name
    }
    setElementForm(next)
  }
  const resetPropertyEditor = (ownerCode = elementForm.ownerCode, dataType = elementForm.dataType || '文本') => {
    setEditTarget(null)
    setElementCodeTouched(false)
    setElementNameTouched(false)
    setElementForm({ ...elementInitial, type: 'property', code: ownerCode ? `${ownerCode}.` : '', ownerCode, dataType })
    setPendingCanvasPosition(null)
  }
  const saveElement = async (continueAdding = false) => {
    if (readonly) { setToast('当前版本只读，请先复制新版本'); return }
    if (elementForm.type === 'property' && !elementForm.ownerCode) { setToast('请先在实体上下文中新增属性字段'); return }
    if (elementForm.type === 'relation' && !elementForm.ownerCode) { setToast('请先选择一个实体，再新增关系类型'); return }
    if (elementForm.type === 'relation' && !elementForm.targetCode) { setToast('请先选择关系类型的终点实体类型'); return }
    const named = (code: string) => classOptions.find((row) => row.code === code)?.name || code
    const payload = { ...elementForm, constraint: elementForm.type === 'relation' ? '' : elementForm.constraint, dataType: elementForm.type === 'class' ? '实体类型' : elementForm.type === 'relation' && elementForm.ownerCode && elementForm.targetCode ? `${named(elementForm.ownerCode)} → ${named(elementForm.targetCode)}` : elementForm.dataType }
    const result = editTarget ? await updateElement(item.id, editTarget.id, payload) : await addElement(item.id, payload)
    setToast(result.message)
    if (!result.ok) return
    if (!editTarget && pendingCanvasPosition && elementForm.type === 'class') saveOntologyLayoutPosition(item.id, elementForm.code, pendingCanvasPosition)
    addAudit({ operator: '陈洁', organization: '数据管理部', action: `${editTarget ? '编辑' : '新增'}${typeLabels[elementForm.type]}`, objectType: '图谱结构', objectId: item.id, summary: `${typeLabels[elementForm.type]}：${elementForm.code}`, result: '成功', risk: '普通' })
    if (elementForm.type === 'property' && (continueAdding || editTarget)) {
      resetPropertyEditor(elementForm.ownerCode, elementForm.dataType || '文本')
      return
    }
    closeElementEditor()
  }
  const removeElement = async () => {
    if (!deleteTarget) return
    if (deleteBlockedByReferences) { setDeleteTarget(null); return }
    if (readonly) { setToast('当前版本只读，请先复制新版本'); setDeleteTarget(null); return }
    const result = await deleteElement(item.id, deleteTarget.id)
    setToast(result.message)
    if (!result.ok) return
    if (editTarget?.id === deleteTarget.id && deleteTarget.type === 'property') resetPropertyEditor(deleteTarget.ownerCode || '')
    setDeleteTarget(null)
  }
  const switchEditorMode = (nextMode: OntologyEditorMode) => {
    if (nextMode === editorMode) return
    modeScrollPositions.current[editorMode] = window.scrollY
    if (nextMode === 'visual') setTab('structure')
    setEditorMode(nextMode)
    window.requestAnimationFrame(() => window.scrollTo({ top: modeScrollPositions.current[nextMode], behavior: 'auto' }))
  }


  const elementDrawerTitle = `${readonly && editTarget ? '查看' : editTarget ? '编辑' : '新增'}${typeLabels[elementForm.type]}`
  const elementDrawerFooter = readonly ? <Button onClick={closeElementEditor}>关闭</Button> : <><Button onClick={closeElementEditor}>取消</Button>{editTarget && elementForm.type === 'property' && <Button onClick={() => resetPropertyEditor(elementForm.ownerCode, elementForm.dataType)}>返回新增</Button>}{!editTarget && elementForm.type === 'property' && <Button onClick={() => void saveElement(true)}>保存并继续新增</Button>}<Button variant="primary" onClick={() => void saveElement()}>{editTarget ? '保存修改' : '保存定义'}</Button></>

  return <>
    <div className="editor-header"><div><button className="back-button" onClick={() => navigate('/graphs/structures')}>‹ 返回图谱结构</button><p className="eyebrow">图谱结构版本编辑 / {item.id}</p><h1>{productText(item.name)}</h1><div className="editor-meta"><StatusTag>{item.status}</StatusTag><span>版本 {item.version}</span><span>{item.domain}领域</span><span>最近保存：{item.updatedAt}</span></div></div><div className="ontology-editor-header-tools"><div className="ontology-editor-mode" aria-label="图谱结构编辑方式"><span>编辑方式</span><div role="group"><button className={editorMode === 'structured' ? 'active' : ''} aria-pressed={editorMode === 'structured'} onClick={() => switchEditorMode('structured')}><Icon name="menu" size={15}/>结构化配置</button><button className={editorMode === 'visual' ? 'active' : ''} aria-pressed={editorMode === 'visual'} onClick={() => switchEditorMode('visual')}><Icon name="graph" size={15}/>可视化建模</button></div></div><div className="page-actions">{readonly && item.status === '已下架' && <Button variant="primary" onClick={() => setActivateOpen(true)}>上架</Button>}</div></div></div>
    <Panel className={'editor-panel' + (editorMode === 'visual' ? ' ontology-visual-editor-panel' : '')}>{editorMode === 'structured' && <Tabs value={tab} onChange={setTab} items={[{ key: 'basic', label: '基本信息' }, { key: 'structure', label: '结构定义' }, { key: 'versions', label: '版本记录' }]}/>}
      {editorMode === 'structured' && tab === 'basic' && <div className="form-section two-column"><Field label="结构名称"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} disabled={readonly}/></Field><Field label="结构编码"><input value={item.id} disabled/></Field><Field label="监管领域"><select value={draft.domain} onChange={(event) => setDraft({ ...draft, domain: event.target.value })} disabled={readonly}><option>通用</option><option>采购</option><option>合同</option><option>财务</option><option>投资</option></select></Field><Field label="结构说明" wide><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} disabled={readonly} placeholder="说明图谱结构覆盖范围和使用边界"/></Field></div>}
      {editorMode === 'structured' && tab === 'structure' && (classOptions.length === 0 ? <EmptyState title="尚未定义实体类型" description={readonly ? '当前只读版本没有登记实体类型。' : '先新增实体类型，再为它维护属性字段和关系类型。'} action={!readonly && <Button variant="primary" icon="plus" onClick={() => openElement('class')}>新增实体类型</Button>}/> : <div className="ontology-structure-workbench">
        <aside className="ontology-structure-sidebar">
          <header><div><strong>实体类型</strong><span>按名称或编码快速定位</span></div><StatusTag>{classOptions.length} 个</StatusTag></header>
          <div className="ontology-structure-sidebar-tools"><input value={entityKeyword} onChange={(event) => setEntityKeyword(event.target.value)} placeholder="搜索实体名称或编码"/><button className="icon-button" disabled={readonly} title={readonly ? '当前版本只读，请先复制新版本' : '新增实体类型'} aria-label="新增实体类型" onClick={() => openElement('class')}><Icon name="plus" size={16}/></button></div>
          {visibleClassOptions.length === 0 ? <p className="ontology-structure-empty">没有匹配的实体类型</p> : <div className="ontology-entity-groups">{visibleClassGroups.map((group) => <section className="ontology-entity-group" key={group.label}>{group.label !== '治理与追溯' && <header><strong>{group.label}</strong><span>{group.items.length} 个</span></header>}<div className="ontology-entity-list">{group.items.map((entity) => <div key={entity.id} className={'ontology-entity-row' + (selectedEntity?.code === entity.code ? ' active' : '')}><button className="ontology-entity-select" onClick={() => setSelectedEntityCode(entity.code)}><div><strong>{entity.name}</strong><small>{entity.code}</small></div><span><b>{propertyCountsByOwner[entity.code] || 0}</b> 属性 <b>{relationCountsByEntity[entity.code] || 0}</b> 关系</span></button><details className="ontology-action-menu entity-action-menu"><summary title="更多操作" aria-label={`${entity.name} 更多操作`}><Icon name="more" size={16}/></summary><div><button onClick={() => openElement('class', entity)}><Icon name={readonly ? 'eye' : 'edit'} size={14}/>{readonly ? '查看实体类型' : '编辑实体类型'}</button>{!readonly && <button className="danger-link" onClick={() => setDeleteTarget(entity)}><Icon name="trash" size={14}/>删除实体类型</button>}</div></details></div>)}</div></section>)}</div>}
        </aside>
        <section className="ontology-structure-detail">
          {selectedEntity && <><header className="ontology-structure-context">
            <div className="entity-context-title"><span>当前实体类型</span><h2>{selectedEntity.name}</h2><code>{selectedEntity.code}</code></div>
            <dl className="entity-context-meta"><div><dt>业务说明</dt><dd>{productText(selectedEntity.description) || '未填写业务说明'}</dd></div></dl>
            <div className="entity-context-actions"><details className="ontology-action-menu context-action-menu"><summary title="实体更多操作" aria-label="实体更多操作"><Icon name="more" size={17}/></summary><div><button onClick={() => openElement('class', selectedEntity)}><Icon name={readonly ? 'eye' : 'edit'} size={14}/>{readonly ? '查看实体类型' : '编辑实体类型'}</button>{!readonly && <button className="danger-link" onClick={() => setDeleteTarget(selectedEntity)}><Icon name="trash" size={14}/>删除实体类型</button>}</div></details></div>
          </header>
          <section className="structure-element-section">
            <header className="structure-element-head">
              <div><strong>属性与关系</strong><span>属性字段自动归属于当前实体；关系类型自动以当前实体为起点。</span></div>
              <div className="structure-element-head-actions">{readonly ? <Button icon="plus" disabled title="当前版本只读，请先复制新版本">新增</Button> : <details className="ontology-action-menu create-structure-menu"><summary title="新增" aria-label="新增"><Icon name="plus" size={15}/><span>新增</span></summary><div><button onClick={() => openElement('property', undefined, { ownerCode: selectedEntity.code })}><Icon name="plus" size={14}/>属性字段</button><button onClick={() => openElement('relation', undefined, { ownerCode: selectedEntity.code })}><Icon name="link" size={14}/>关系类型</button></div></details>}</div>
            </header>
            <div className="structure-element-toolbar">
              <div className="structure-element-filters">{structureElementFilters.map((filter) => { const count = filter === '属性字段' ? selectedProperties.length : filter === '关系类型' ? selectedRelations.length : structureElements.length; return <button key={filter} className={elementFilter === filter ? 'active' : ''} onClick={() => setElementFilter(filter)}>{filter}<b>{count}</b></button> })}</div>
              <input value={structureKeyword} onChange={(event) => setStructureKeyword(event.target.value)} placeholder="搜索名称、编码、说明"/>
            </div>
            {structureElements.length === 0 ? <EmptyState title="尚未定义属性字段或关系类型" description={readonly ? '当前实体类型下没有属性字段或关系类型。' : '点击上方按钮新增属性字段或关系类型。'}/> : visibleStructureElements.length === 0 ? <EmptyState title="没有匹配的属性字段或关系类型" description="请调整筛选条件或关键词。"/> : <div className="table-container structure-element-table"><table><thead><tr><th>类型</th><th>名称</th><th>编码</th><th>所属实体类型</th><th>关系方向</th><th>数据类型</th><th>业务说明</th><th>操作</th></tr></thead><tbody>{visibleStructureElements.map((element) => {
              const ownerName = entityName(element.ownerCode)
              const targetName = entityName(element.targetCode)
              const relationRole = element.ownerCode === selectedEntity.code ? '当前实体作为起点' : element.targetCode === selectedEntity.code ? '当前实体作为终点' : '关系两端'
              return <tr key={element.id}><td><span className={`structure-element-type ${element.type}`}>{typeLabels[element.type]}</span></td><td><strong>{element.name}</strong></td><td><code className="structure-code-cell">{element.code}</code></td><td><strong>{ownerName}</strong>{element.type === 'relation' && <small className="cell-sub">关系起点</small>}</td><td>{element.type === 'relation' ? <><strong>{ownerName} → {targetName}</strong><small className="cell-sub">{relationRole}</small></> : <span className="structure-empty-cell">—</span>}</td><td>{element.type === 'property' ? <strong>{productText(element.dataType) || '未设置类型'}</strong> : <span className="structure-empty-cell">—</span>}</td><td className="structure-description-cell">{productText(element.description) || '—'}</td><td><div className="row-actions"><button onClick={() => openElement(element.type, element)}>{readonly ? '查看' : '编辑'}</button>{!readonly && <button className="danger-link" onClick={() => setDeleteTarget(element)}>删除</button>}</div></td></tr>
            })}</tbody></table></div>}
          </section></>}
        </section>
      </div>)}
      {editorMode === 'visual' && <OntologyVisualModeler ontologyId={item.id} status={item.status} elements={item.elements} validation={item.validation} onCreate={(type, position, defaults) => openElement(type, undefined, defaults || {}, position)} onEdit={(type, element) => openElement(type, element)}/>}
      {editorMode === 'structured' && tab === 'versions' && <div className="version-timeline"><article><i/><div><strong>{item.version} · {item.status}</strong><span>{item.updatedAt} · 当前版本</span></div></article><article><i/><div><strong>版本创建</strong><span>保留发布、复制和结构定义变更审计</span></div></article></div>}
    </Panel>
    {!readonly && <footer className="editor-action-bar"><div><span/><strong>图谱结构草稿操作</strong><small>建议保存后先校验，确认无阻断项后再发布</small></div><div>{canCancelCreation && <Button onClick={() => setCancelCreateOpen(true)}>取消</Button>}<Button onClick={save}>保存草稿</Button><Button onClick={validate}>校验</Button><Button variant="primary" onClick={() => setPublishOpen(true)}>发布</Button></div></footer>}
    <Drawer open={elementOpen} title={elementDrawerTitle} eyebrow="结构定义" onClose={closeElementEditor} footer={elementDrawerFooter}>
      <div className="form-stack">
        {elementForm.type === 'property' && <div className="alert-box"><Icon name="graph"/><span>当前实体：{entityName(elementForm.ownerCode)}；新增属性将自动归属于当前实体。</span></div>}
        <Field label={`${typeLabels[elementForm.type]}编码 *`}><input value={elementForm.code} disabled={readonly} onChange={(event) => { setElementCodeTouched(true); setElementForm({ ...elementForm, code: event.target.value }) }} placeholder="请输入唯一编码"/></Field>
        <Field label="中文名称 *"><input value={elementForm.name} disabled={readonly} onChange={(event) => { setElementNameTouched(true); setElementForm({ ...elementForm, name: event.target.value }) }}/></Field>
        {elementForm.type === 'relation' && <><Field label="起点实体类型"><input value={entityFieldValue(elementForm.ownerCode)} disabled/></Field><Field label="终点实体类型 *"><select value={elementForm.targetCode || ''} disabled={readonly} onChange={(event) => updateRelationEndpoint('targetCode', event.target.value)}><option value="">请选择终点实体类型</option>{classOptions.map((option) => <option value={option.code} key={option.code}>{option.name} · {option.code}</option>)}</select></Field></>}
        {elementForm.type !== 'class' && <Field label={elementForm.type === 'relation' ? '关系方向' : '数据类型'}><input value={elementForm.type === 'relation' ? `${classOptions.find((option) => option.code === elementForm.ownerCode)?.name || elementForm.ownerCode || '起点实体类型'} → ${classOptions.find((option) => option.code === elementForm.targetCode)?.name || elementForm.targetCode || '终点实体类型'}` : elementForm.dataType} disabled={readonly || elementForm.type === 'relation'} onChange={(event) => setElementForm({ ...elementForm, dataType: event.target.value })}/></Field>}
        <Field label="业务说明"><textarea value={elementForm.description} disabled={readonly} onChange={(event) => setElementForm({ ...elementForm, description: event.target.value })}/></Field>
      </div>
    </Drawer>
    <Modal open={publishOpen} title="发布图谱结构版本" description={`${productText(item.name)} ${item.version}`} confirmText="确认发布" onClose={() => setPublishOpen(false)} onConfirm={publish}><div className="publish-checklist">{[["基本信息完整",Boolean(item.name.trim() && item.domain)],["至少定义一个实体类型",item.classes > 0],["正式版本号自动生成",true],["发布后版本只读",true]].map(([label, pass]) => <div key={String(label)}><Icon name={pass ? "check" : "warning"}/><span>{label}</span><StatusTag>{pass ? "通过" : "需检查"}</StatusTag></div>)}</div><div className="alert-box"><Icon name="check"/><span>确认发布后，系统会自动校验属性字段和关系类型引用，并生成下一个正式版本号；首次发布为 V1，V1 内容复制后再次发布为 V2。</span></div></Modal>
    <Modal open={activateOpen} title="上架图谱结构" description={`${productText(item.name)} ${item.version}`} confirmText="确认上架" onClose={() => setActivateOpen(false)} onConfirm={activate}><div className="alert-box"><Icon name="check"/><span>上架后该图谱结构将恢复为已发布状态，可重新被新业务选择；原版本内容和历史引用保持不变。</span></div></Modal>
    <Modal open={cancelCreateOpen} title="取消新建图谱结构" description={`${productText(item.name)} · ${item.id}`} confirmText={cancelingCreate ? '正在取消…' : '确认取消'} danger onClose={() => { if (!cancelingCreate) setCancelCreateOpen(false) }} onConfirm={cancelCreation}><div className="alert-box danger"><Icon name="warning"/><span>取消后将删除当前草稿以及已配置的实体类型、属性字段和关系类型；已发布历史版本不受影响。</span></div></Modal>
    <Modal open={!!deleteTarget} title={`删除${deleteTargetLabel}`} description={deleteTarget ? `${deleteTarget.name} · ${deleteTarget.code}` : ''} confirmText={deleteBlockedByReferences ? '知道了' : '确认删除'} danger={!deleteBlockedByReferences} onClose={() => setDeleteTarget(null)} onConfirm={removeElement}><div className={`alert-box ${deleteBlockedByReferences ? '' : 'danger'}`}><Icon name="warning"/><span>{deleteTargetNotice}</span></div></Modal>
  </>
}
