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
  .replaceAll('本体类', '类')
  .replaceAll('本体元素', '结构元素')
  .replaceAll('本体版本', '图谱结构版本')
  .replaceAll('本体', '图谱结构')

const createInitial = { id: '', name: '', scope: '领域图谱结构', domain: '采购', description: '' }
const elementInitial = { type: 'class' as OntologyElementType, code: '', name: '', ownerCode: '', targetCode: '', dataType: '类', constraint: '', description: '' }
const typeLabels: Record<OntologyElementType, string> = { class: '类', property: '属性', relation: '关系' }
type OntologyEditorMode = 'structured' | 'visual'
const codeSegment = (code: string, fallback: string) => {
  const raw = (code.split('.').pop() || code || fallback).trim()
  const value = raw.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase()
  return value || fallback
}

const readonlyOntologyStatuses = ['已发布', '已下架', '已删除', '已废止', '已启用', '已启动', '启用']
const copyableOntologyStatuses = ['已发布', '已下架', '已废止', '已启用', '已启动', '启用']
const isReadonlyOntology = (status: string) => readonlyOntologyStatuses.includes(status)
const isCopyableOntology = (status: string) => copyableOntologyStatuses.includes(status)
const ontologyActionLabel = (status: string) => isCopyableOntology(status) ? '复制版本' : status === '待校验' ? '发布' : '校验'
const ontologyActionTitle = (status = '') => isCopyableOntology(status) ? '复制图谱结构新版本' : status === '待校验' ? '发布图谱结构版本' : '校验图谱结构版本'
const ontologyActionConfirm = (status = '') => isCopyableOntology(status) ? '确认复制' : status === '待校验' ? '确认发布' : '开始校验'
const deleteOntologyTitle = (status = '') => status === '已发布' ? '删除已发布图谱结构' : status === '已下架' ? '删除已下架图谱结构' : '删除图谱结构'
const deleteOntologyNotice = (status = '') => status === '已发布'
  ? '已发布图谱结构若没有业务引用将软删除；如已被引用，请先下架或解除引用后再删除。'
  : status === '已下架'
    ? '删除后将从列表和新业务选择中移除，历史引用和审计仍保留。'
    : '仅未被场景、规则、数据源或知识图谱引用的草稿/待校验版本可以删除，操作不可恢复。'
export function OntologyListPage({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate()
  const ontologies = useOntologyStore((state) => state.ontologies)

  const copyOntology = useOntologyStore((state) => state.copyOntology)
  const deleteOntology = useOntologyStore((state) => state.deleteOntology)
  const retireOntology = useOntologyStore((state) => state.retireOntology)
  const validateOntology = useOntologyStore((state) => state.validateOntology)
  const publishOntology = useOntologyStore((state) => state.publishOntology)
  const addAudit = useAppStore((state) => state.addAudit)
  const setToast = useAppStore((state) => state.setToast)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('全部')

  const [target, setTarget] = useState<(typeof ontologies)[number] | null>(null)
  const [retireTarget, setRetireTarget] = useState<(typeof ontologies)[number] | null>(null)
  const [listDeleteTarget, setListDeleteTarget] = useState<(typeof ontologies)[number] | null>(null)

  const rows = useMemo(() => ontologies.filter((item) => (!keyword || `${productText(item.name)}${item.id}${item.domain}`.toLowerCase().includes(keyword.toLowerCase())) && (status === '全部' || item.status === status)), [ontologies, keyword, status])


  const confirmVersionAction = async () => {
    if (!target) return
    const copy = isCopyableOntology(target.status); const checking = target.status === '草稿'
    const result = copy ? await copyOntology(target.id) : checking ? await validateOntology(target.id) : await publishOntology(target.id)
    setToast(result.message)
    if (!result.ok) return
    addAudit({ operator: '陈洁', organization: '数据管理部', action: copy ? '复制图谱结构版本' : checking ? '校验图谱结构版本' : '发布图谱结构版本', objectType: '图谱结构', objectId: result.objectId || target.id, summary: `${productText(target.name)} ${target.version}`, result: '成功', risk: copy || checking ? '普通' : '高危' })
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

  const remove = async () => {
    if (!listDeleteTarget) return
    const result = await deleteOntology(listDeleteTarget.id)
    setToast(result.message)
    if (!result.ok) return
    addAudit({ operator: '陈洁', organization: '数据管理部', action: '删除图谱结构', objectType: '图谱结构', objectId: listDeleteTarget.id, summary: `${productText(listDeleteTarget.name)} ${listDeleteTarget.version}`, result: '成功', risk: '高危' })
    setListDeleteTarget(null)
  }


  return <>
    {!embedded && <PageHeader eyebrow="能力中心 / 知识图谱 / 图谱结构" title="图谱结构" description="维护知识图谱中的类、属性与关系定义。" actions={<><Button icon="refresh" onClick={() => setToast('图谱结构列表已刷新')}>刷新</Button><Button variant="primary" icon="plus" onClick={() => navigate('/ontology/new')}>新建图谱结构</Button></>}/>}
    {embedded && <div className="section-toolbar"><div><strong>图谱结构</strong><span>维护知识图谱中的类、属性与关系定义。</span></div><div className="page-actions"><Button icon="refresh" onClick={() => setToast('图谱结构列表已刷新')}>刷新</Button><Button variant="primary" icon="plus" onClick={() => navigate('/ontology/new')}>新建图谱结构</Button></div></div>}
    <FilterGrid onReset={() => { setKeyword(''); setStatus('全部') }} onSearch={() => setToast(`查询完成，共${rows.length}个图谱结构`)}><Field label="关键词"><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="结构名称、编码或领域"/></Field><Field label="状态"><select value={status} onChange={(event) => setStatus(event.target.value)}><option>全部</option><option>草稿</option><option>待校验</option><option>已发布</option><option>已下架</option><option>已废止</option></select></Field></FilterGrid>
    <Panel title="图谱结构列表" subtitle="已发布和已下架版本只读，变更必须复制新版本">{rows.length === 0 ? <EmptyState title="没有符合条件的图谱结构" description="请调整筛选条件或新建图谱结构。"/> : <div className="table-container"><table><thead><tr><th>结构名称 / 编码</th><th>监管领域</th><th>版本</th><th>类 / 属性 / 关系</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td><button className="table-link title-cell" onClick={() => navigate(`/ontology/${item.id}`)}><strong>{productText(item.name)}</strong><span>{item.id}</span></button></td><td>{item.domain}</td><td>{item.version}</td><td><span className="metrics-inline"><b>{item.classes}</b>类 · <b>{item.properties}</b>属性 · <b>{item.relations}</b>关系</span></td><td><StatusTag>{item.status}</StatusTag></td><td>{item.updatedAt}</td><td><div className="row-actions"><button onClick={() => navigate(`/ontology/${item.id}`)}>{isReadonlyOntology(item.status) ? '查看' : '编辑'}</button><button onClick={() => setTarget(item)}>{ontologyActionLabel(item.status)}</button>{item.status === '已发布' && <button onClick={() => setRetireTarget(item)}>下架</button>}<button className="danger-link" onClick={() => setListDeleteTarget(item)}>删除</button></div></td></tr>)}</tbody></table></div>}</Panel>

    <Modal open={!!target} title={ontologyActionTitle(target?.status)} description={target ? `${productText(target.name)} ${target.version}` : ''} confirmText={ontologyActionConfirm(target?.status)} onClose={() => setTarget(null)} onConfirm={confirmVersionAction}><div className="publish-checklist">{['基本信息完整','至少定义一个类','属性和关系引用真实类','结构元素与引用完整','发布/下架后版本只读'].map((label, index) => { const pass = index === 1 ? Boolean(target && target.classes > 0) : index === 2 || index === 3 ? Boolean(target && (target.validation?.blockers.length || 0) === 0) : true; return <div key={label}><Icon name={pass ? 'check' : 'warning'}/><span>{label}</span><StatusTag>{pass ? '通过' : '未通过'}</StatusTag></div> })}</div></Modal>
    <Modal open={!!retireTarget} title="下架图谱结构" description={retireTarget ? `${productText(retireTarget.name)} · ${retireTarget.id}` : ''} confirmText="确认下架" onClose={() => setRetireTarget(null)} onConfirm={retire}><div className="alert-box"><Icon name="warning"/><span>下架后该图谱结构不再允许新业务引用，但历史数据、引用关系和审计记录会继续保留；如需调整请复制新版本。</span></div></Modal>
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
    navigate(`/ontology/${encodeURIComponent(result.objectId)}${nextStep ? '?tab=class' : ''}`, { replace: true })
  }
  const cancel = () => { if (dirty && !window.confirm('当前新建内容尚未保存，确认放弃并返回？')) return; navigate('/graphs/structures') }
  const stepCards = [
    { key: 'basic', label: '基本信息', description: '名称、编码、领域与说明', done: basicDone },
    { key: 'class', label: '类定义', description: '创建草稿后继续配置', done: false },
    { key: 'relation', label: '属性与关系', description: '创建草稿后继续配置', done: false },
  ]

  return <>
    <div className="simple-rule-header"><div><button className="back-button" onClick={cancel}>‹ 返回图谱结构</button><p className="eyebrow">图谱结构 / 新建图谱结构</p><h1>{form.name.trim() || '新增图谱结构'}</h1><div className="editor-meta"><StatusTag>未创建</StatusTag><span>尚未生成图谱结构版本</span><span>{dirty ? '存在未保存修改' : '填写基本信息后创建草稿'}</span></div></div></div>
    <nav className="rule-editor-tabs" aria-label="图谱结构创建步骤">{stepCards.map((step, index) => <button type="button" className={[step.key === 'basic' ? 'active' : '', step.done ? 'done' : ''].filter(Boolean).join(' ')} onClick={() => step.key === 'basic' ? undefined : setToast('请先完成基本信息并点击下一步创建图谱结构草稿')} key={step.key}><i>{step.done ? '✓' : index + 1}</i><span><strong>{step.label}</strong><small>{step.description}</small></span></button>)}</nav>
    <main className="rule-step-content">
      <Panel title="1. 基本信息" subtitle="先创建图谱结构草稿；类、属性、关系和版本校验在编辑页继续维护">
        <div className="form-section two-column">
          <Field label="结构名称 *"><input value={form.name} onChange={(event) => patch({ name: event.target.value })} placeholder="例如：供应链监管图谱结构"/></Field>
          <Field label="结构编码"><input value={form.id} onChange={(event) => patch({ id: event.target.value.toUpperCase() })} placeholder="留空自动生成"/></Field>
          <Field label="监管领域 *"><select value={form.domain} onChange={(event) => patch({ domain: event.target.value })}><option>采购</option><option>合同</option><option>财务</option><option>投资</option><option>通用</option></select></Field>
          <Field label="结构说明" wide><textarea value={form.description} onChange={(event) => patch({ description: event.target.value })} placeholder="说明图谱结构覆盖的业务对象、业务记录和边界"/></Field>
        </div>
        <div className="next-action-card"><Icon name={basicDone ? 'check' : 'clock'}/><div><strong>{basicDone ? '基本信息已完整' : '请先补齐基本信息'}</strong><span>{basicDone ? '点击下一步后创建图谱结构草稿，并进入类定义配置。' : '至少填写结构名称和监管领域；结构编码可留空自动生成，结构说明可后续补充。'}</span></div></div>
      </Panel>
    </main>
    <footer className="editor-action-bar"><div><span className={dirty ? 'dirty-dot' : ''}/><strong>{dirty ? '新建内容尚未保存' : '尚未创建图谱结构草稿'}</strong><small>创建后可继续维护类、属性和关系</small></div><div><Button onClick={cancel}>取消</Button><Button disabled={saving} onClick={() => void createDraft(false)}>{saving ? '正在创建…' : '保存草稿'}</Button><Button variant="primary" disabled={saving} onClick={() => void createDraft(true)}>{saving ? '正在创建…' : '下一步'}</Button></div></footer>
  </>
}

export function OntologyEditorPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab') || 'basic'
  const normalizedRequestedTab = ['basic','class','property','relation','versions'].includes(requestedTab) ? requestedTab : 'basic'
  const item = useOntologyStore((state) => state.ontologies.find((row) => row.id === id))
  const updateOntology = useOntologyStore((state) => state.updateOntology)
  const copyOntology = useOntologyStore((state) => state.copyOntology)
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
  const [editTarget, setEditTarget] = useState<OntologyElement | null>(null)
  const [pendingCanvasPosition, setPendingCanvasPosition] = useState<CanvasPosition | null>(null)
  const [elementCodeTouched, setElementCodeTouched] = useState(false)
  const [elementNameTouched, setElementNameTouched] = useState(false)
  const modeScrollPositions = useRef<Record<OntologyEditorMode, number>>({ structured: 0, visual: 0 })

  useEffect(() => {
    if (item) setDraft({ name: productText(item.name), scope: productText(item.scope), domain: item.domain, description: productText(item.description) })
  }, [item])

  useEffect(() => {
    if (!item) return
    setEditorMode('structured')
    setTab(normalizedRequestedTab)
    modeScrollPositions.current = { structured: 0, visual: 0 }
  }, [item?.id, normalizedRequestedTab])

  if (!item) return <EmptyState title="图谱结构版本不存在" description="请从图谱结构列表选择可访问版本。"/>
  const readonly = isReadonlyOntology(item.status)
  const activeType = (['class','property','relation'].includes(tab) ? tab : 'class') as OntologyElementType
  const elements = item.elements.filter((element) => element.type === activeType)
  const classOptions = item.elements.filter((element) => element.type === 'class')
  const managedPropertyOwner = elementForm.type === 'property' ? elementForm.ownerCode : ''
  const managedProperties = item.elements.filter((element) => element.type === 'property' && element.ownerCode === managedPropertyOwner)
  const relationSuggestion = (ownerCode: string, targetCode: string, excludeId = '') => {
    const named = (code: string) => classOptions.find((row) => row.code === code)?.name || code
    const namespace = ownerCode.includes('.') ? ownerCode.slice(0, ownerCode.lastIndexOf('.')) : 'REL'
    const base = `${namespace}.${codeSegment(ownerCode, 'source')}_to_${codeSegment(targetCode, 'target')}`
    const existing = new Set(item.elements.filter((element) => element.type === 'relation' && element.id !== excludeId).map((element) => element.code))
    let code = base
    let index = 2
    while (existing.has(code)) code = `${base}_${index++}`
    return { code, name: ownerCode && targetCode ? `${named(ownerCode)}关联${named(targetCode)}` : '' }
  }

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
  const copy = async () => {
    const result = await copyOntology(item.id)
    setToast(result.message)
    if (result.ok && result.objectId) navigate(`/ontology/${result.objectId}`)
  }
  const publish = async () => {
    const result = await publishOntology(item.id)
    setToast(result.message)
    if (!result.ok) return
    addAudit({ operator: '陈洁', organization: '数据管理部', action: '发布图谱结构版本', objectType: '图谱结构', objectId: item.id, summary: `${productText(item.name)} ${item.version}`, result: '成功', risk: '高危' })
    setPublishOpen(false)
  }
  const closeElementEditor = () => {
    setElementOpen(false)
    setEditTarget(null)
    setPendingCanvasPosition(null)
    setElementCodeTouched(false)
    setElementNameTouched(false)
  }
  const openElement = (type: OntologyElementType, element?: OntologyElement, defaults: Partial<typeof elementInitial> = {}, position?: CanvasPosition) => {
    const firstClass = classOptions[0]
    const ownerCode = type === 'class' ? '' : defaults.ownerCode || firstClass?.code || ''
    const targetCode = type === 'relation' ? defaults.targetCode || classOptions.find((option) => option.code !== ownerCode)?.code || firstClass?.code || '' : ''
    const suggestion = type === 'relation' && !element ? relationSuggestion(ownerCode, targetCode) : { code: '', name: '' }
    setEditTarget(element || null)
    setPendingCanvasPosition(!element && position ? position : null)
    setElementCodeTouched(Boolean(element))
    setElementNameTouched(Boolean(element))
    setElementForm(element ? { ...elementInitial, ...element, dataType: productText(element.dataType), description: productText(element.description), ownerCode: element.ownerCode || '', targetCode: element.targetCode || '' } : { ...elementInitial, type, code: type === 'property' && ownerCode ? `${ownerCode}.` : type === 'relation' ? suggestion.code : '', name: type === 'relation' ? suggestion.name : '', ownerCode, targetCode, dataType: type === 'class' ? '类' : type === 'property' ? '文本' : '类 → 类' })
    setElementOpen(true)
  }
  const changePropertyOwner = (ownerCode: string) => {
    const previousPrefix = elementForm.ownerCode ? `${elementForm.ownerCode}.` : ''
    const suffix = !editTarget && elementForm.code.startsWith(previousPrefix) ? elementForm.code.slice(previousPrefix.length) : ''
    setElementForm({ ...elementForm, ownerCode, code: !editTarget ? `${ownerCode}.${suffix}` : elementForm.code })
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
    if (elementForm.type === 'property' && !elementForm.ownerCode) { setToast('请先选择属性所属类'); return }
    if (elementForm.type === 'relation' && (!elementForm.ownerCode || !elementForm.targetCode)) { setToast('请先选择关系的起点类和终点类'); return }
    const named = (code: string) => classOptions.find((row) => row.code === code)?.name || code
    const payload = { ...elementForm, dataType: elementForm.type === 'class' ? '类' : elementForm.type === 'relation' && elementForm.ownerCode && elementForm.targetCode ? `${named(elementForm.ownerCode)} → ${named(elementForm.targetCode)}` : elementForm.dataType }
    const result = editTarget ? await updateElement(item.id, editTarget.id, payload) : await addElement(item.id, payload)
    setToast(result.message)
    if (!result.ok) return
    if (!editTarget && pendingCanvasPosition && elementForm.type === 'class') saveOntologyLayoutPosition(item.id, elementForm.code, pendingCanvasPosition)
    addAudit({ operator: '陈洁', organization: '数据管理部', action: editTarget ? '编辑结构元素' : '新增结构元素', objectType: '图谱结构', objectId: item.id, summary: `${typeLabels[elementForm.type]}：${elementForm.code}`, result: '成功', risk: '普通' })
    if (elementForm.type === 'property' && (continueAdding || editTarget)) {
      resetPropertyEditor(elementForm.ownerCode, elementForm.dataType || '文本')
      return
    }
    closeElementEditor()
  }
  const removeElement = async () => {
    if (!deleteTarget) return
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
    setEditorMode(nextMode)
    window.requestAnimationFrame(() => window.scrollTo({ top: modeScrollPositions.current[nextMode], behavior: 'auto' }))
  }


  const elementDrawerTitle = `${readonly && editTarget ? '查看' : editTarget ? '编辑' : '新增'}${typeLabels[elementForm.type]}`
  const elementDrawerFooter = readonly ? <Button onClick={closeElementEditor}>关闭</Button> : <><Button onClick={closeElementEditor}>取消</Button>{editTarget && elementForm.type === 'property' && <Button onClick={() => resetPropertyEditor(elementForm.ownerCode, elementForm.dataType)}>返回新增</Button>}{!editTarget && elementForm.type === 'property' && <Button onClick={() => void saveElement(true)}>保存并继续新增</Button>}<Button variant="primary" onClick={() => void saveElement()}>{editTarget ? '保存修改' : '保存元素'}</Button></>

  return <>
    <div className="editor-header"><div><button className="back-button" onClick={() => navigate('/graphs/structures')}>‹ 返回图谱结构</button><p className="eyebrow">图谱结构版本编辑 / {item.id}</p><h1>{productText(item.name)}</h1><div className="editor-meta"><StatusTag>{item.status}</StatusTag><span>版本 {item.version}</span><span>{item.domain}领域</span><span>最近保存：{item.updatedAt}</span></div></div><div className="ontology-editor-header-tools"><div className="ontology-editor-mode" aria-label="图谱结构编辑方式"><span>编辑方式</span><div role="group"><button className={editorMode === 'structured' ? 'active' : ''} aria-pressed={editorMode === 'structured'} onClick={() => switchEditorMode('structured')}><Icon name="menu" size={15}/>结构化配置</button><button className={editorMode === 'visual' ? 'active' : ''} aria-pressed={editorMode === 'visual'} onClick={() => switchEditorMode('visual')}><Icon name="graph" size={15}/>可视化建模</button></div></div><div className="page-actions">{readonly ? <Button variant="primary" onClick={copy}>复制新版本</Button> : <><Button onClick={save}>保存草稿</Button><Button onClick={validate}>校验</Button><Button variant="primary" onClick={() => setPublishOpen(true)}>发布</Button></>}</div></div></div>
    <Panel className={'editor-panel' + (editorMode === 'visual' ? ' ontology-visual-editor-panel' : '')}>{editorMode === 'structured' && <Tabs value={tab} onChange={setTab} items={[{ key: 'basic', label: '基本信息' }, { key: 'class', label: '类定义', count: item.classes }, { key: 'property', label: '属性', count: item.properties }, { key: 'relation', label: '关系', count: item.relations }, { key: 'versions', label: '版本记录' }]}/>}
      {editorMode === 'structured' && tab === 'basic' && <div className="form-section two-column"><Field label="结构名称"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} disabled={readonly}/></Field><Field label="结构编码"><input value={item.id} disabled/></Field><Field label="监管领域"><select value={draft.domain} onChange={(event) => setDraft({ ...draft, domain: event.target.value })} disabled={readonly}><option>通用</option><option>采购</option><option>合同</option><option>财务</option><option>投资</option></select></Field><Field label="结构说明" wide><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} disabled={readonly} placeholder="说明图谱结构覆盖范围和使用边界"/></Field></div>}
      {editorMode === 'structured' && ['class','property','relation'].includes(tab) && <div><div className="section-toolbar"><div><strong>{typeLabels[activeType]}定义</strong><span>{activeType === 'class' ? '维护统一的类及其业务语义' : '使用稳定编码引用，发布后不可直接修改'}</span></div><Button variant="primary" icon="plus" disabled={readonly} title={readonly ? '当前版本只读，请先复制新版本' : undefined} onClick={() => openElement(activeType)}>新增{typeLabels[activeType]}</Button></div>{elements.length === 0 ? <EmptyState title={`尚未定义${typeLabels[activeType]}`} description={readonly ? '当前只读版本没有登记该类型元素。' : `点击“新增${typeLabels[activeType]}”开始配置。`}/> : <div className="table-container"><table><thead><tr><th>编码 / 名称</th>{activeType === 'property' && <th>所属类</th>}<th>{activeType === 'class' ? '类型' : '数据类型或方向'}</th><th>约束</th><th>说明</th><th>操作</th></tr></thead><tbody>{elements.map((element) => <tr key={element.id}><td><strong>{element.name}</strong><small className="cell-sub">{element.code}</small></td>{activeType === 'property' && <td>{classOptions.find((option) => option.code === element.ownerCode)?.name || element.ownerCode || '—'}<small className="cell-sub">{element.ownerCode || '未关联类'}</small></td>}<td>{element.type === 'class' ? <StatusTag>类</StatusTag> : productText(element.dataType) || '—'}</td><td>{element.constraint || '—'}</td><td>{productText(element.description) || '—'}</td><td><div className="row-actions"><button onClick={() => openElement(activeType, element)}>{readonly ? '查看' : '编辑'}</button>{!readonly && <button onClick={() => setDeleteTarget(element)}>删除</button>}</div></td></tr>)}</tbody></table></div>}</div>}
      {editorMode === 'visual' && <OntologyVisualModeler ontologyId={item.id} status={item.status} elements={item.elements} validation={item.validation} onCreate={(type, position, defaults) => openElement(type, undefined, defaults || {}, position)} onEdit={(type, element) => openElement(type, element)} onDelete={(element) => setDeleteTarget(element)} onCreateRelation={(sourceCode, targetCode) => openElement('relation', undefined, { ownerCode: sourceCode, targetCode })}/>}
      {editorMode === 'structured' && tab === 'versions' && <div className="version-timeline"><article><i/><div><strong>{item.version} · {item.status}</strong><span>{item.updatedAt} · 当前版本</span></div></article><article><i/><div><strong>版本创建</strong><span>保留发布、复制和元素变更审计</span></div></article></div>}
    </Panel>
    <Drawer open={elementOpen} title={elementDrawerTitle} eyebrow="结构元素" onClose={closeElementEditor} footer={elementDrawerFooter}>
      <div className="form-stack">
        <Field label="元素类型"><input value={typeLabels[elementForm.type]} disabled/></Field>
        <Field label="元素编码 *"><input value={elementForm.code} disabled={readonly} onChange={(event) => { setElementCodeTouched(true); setElementForm({ ...elementForm, code: event.target.value }) }} placeholder="请输入唯一的元素编码"/></Field>
        <Field label="中文名称 *"><input value={elementForm.name} disabled={readonly} onChange={(event) => { setElementNameTouched(true); setElementForm({ ...elementForm, name: event.target.value }) }}/></Field>
        {elementForm.type === 'property' && <Field label="所属类 *"><select value={elementForm.ownerCode || ''} disabled={readonly} onChange={(event) => changePropertyOwner(event.target.value)}>{classOptions.map((option) => <option value={option.code} key={option.code}>{option.name} · {option.code}</option>)}</select></Field>}
        {elementForm.type === 'relation' && <><Field label="起点类 *"><select value={elementForm.ownerCode || ''} disabled={readonly} onChange={(event) => updateRelationEndpoint('ownerCode', event.target.value)}>{classOptions.map((option) => <option value={option.code} key={option.code}>{option.name} · {option.code}</option>)}</select></Field><Field label="终点类 *"><select value={elementForm.targetCode || ''} disabled={readonly} onChange={(event) => updateRelationEndpoint('targetCode', event.target.value)}>{classOptions.map((option) => <option value={option.code} key={option.code}>{option.name} · {option.code}</option>)}</select></Field><div className="alert-box"><Icon name="link"/><span>可视化建模中连接两个类后，系统会自动带出关系编码、名称和方向；你也可以在保存前手动调整。</span></div></>}
        {elementForm.type !== 'class' && <Field label={elementForm.type === 'relation' ? '关系方向' : '数据类型'}><input value={elementForm.type === 'relation' ? `${classOptions.find((option) => option.code === elementForm.ownerCode)?.name || elementForm.ownerCode || '起点类'} → ${classOptions.find((option) => option.code === elementForm.targetCode)?.name || elementForm.targetCode || '终点类'}` : elementForm.dataType} disabled={readonly || elementForm.type === 'relation'} onChange={(event) => setElementForm({ ...elementForm, dataType: event.target.value })}/></Field>}
        <Field label="约束"><input value={elementForm.constraint} disabled={readonly} onChange={(event) => setElementForm({ ...elementForm, constraint: event.target.value })} placeholder="主标识、必填、多对多、发生时间等"/></Field>
        <Field label="业务说明"><textarea value={elementForm.description} disabled={readonly} onChange={(event) => setElementForm({ ...elementForm, description: event.target.value })}/></Field>
      </div>
      {elementForm.type === 'property' && <section className="property-manager-list"><header><div><strong>当前类属性</strong><span>{classOptions.find((option) => option.code === managedPropertyOwner)?.name || managedPropertyOwner || '未选择所属类'} · {managedPropertyOwner || '—'}</span></div><StatusTag>{managedProperties.length} 条</StatusTag></header>{managedProperties.length ? <div>{managedProperties.map((property) => <article className={editTarget?.id === property.id ? 'editing' : ''} key={property.id}><div><strong>{property.name}</strong><small>{property.code}</small></div><span>{property.dataType || '未设置类型'} · {property.constraint || '无约束'}</span><div className="row-actions"><button onClick={() => openElement('property', property)}>{readonly ? '查看' : '编辑'}</button>{!readonly && <button className="danger-link" onClick={() => setDeleteTarget(property)}>删除</button>}</div></article>)}</div> : <p>当前类尚未配置属性，保存后会自动出现在这里。</p>}</section>}
    </Drawer>
    <Modal open={publishOpen} title="发布图谱结构版本" description={`${productText(item.name)} ${item.version}`} confirmText="确认发布" onClose={() => setPublishOpen(false)} onConfirm={publish}><div className="publish-checklist">{[["已完成结构校验",item.status === "待校验"],["至少定义一个类",item.classes > 0],["属性和关系引用真实类",(item.validation?.blockers.length || 0) === 0],["结构元素与引用完整",(item.validation?.blockers.length || 0) === 0],["发布/下架后版本只读",true]].map(([label, pass]) => <div key={String(label)}><Icon name={pass ? "check" : "warning"}/><span>{label}</span><StatusTag>{pass ? "通过" : "未通过"}</StatusTag></div>)}</div></Modal>
    <Modal open={!!deleteTarget} title="删除结构元素" description={deleteTarget ? `${deleteTarget.name} · ${deleteTarget.code}` : ''} confirmText="确认删除" danger onClose={() => setDeleteTarget(null)} onConfirm={removeElement}><div className="alert-box danger"><Icon name="warning"/><span>删除会同步更新当前草稿版本的元素统计，已发布历史版本不受影响。</span></div></Modal>
  </>
}
