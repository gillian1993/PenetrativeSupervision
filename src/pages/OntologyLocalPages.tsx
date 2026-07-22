import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useOntologyStore, type OntologyElement, type OntologyElementType } from '../ontologyMysqlStore'
import { useAppStore } from '../store'
import { Button, Drawer, EmptyState, Field, FilterGrid, Icon, KeyValue, Modal, PageHeader, Panel, StatusTag, Tabs } from '../ui'
import { OntologyVisualModeler, saveOntologyLayoutPosition, type CanvasPosition } from './OntologyVisualModeler'

const createInitial = { id: '', name: '', scope: '领域扩展本体', domain: '采购', description: '' }
const elementInitial = { type: 'class' as OntologyElementType, code: '', name: '', ownerCode: '', targetCode: '', dataType: '本体类', constraint: '', description: '' }
const typeLabels: Record<OntologyElementType, string> = { class: '类', property: '属性', relation: '关系' }
type OntologyEditorMode = 'structured' | 'visual'

const editorModeStorageKey = (ontologyId: string) => 'penetrative-supervision:ontology-editor-mode:' + ontologyId
const readEditorMode = (ontologyId: string): OntologyEditorMode | null => {
  try {
    const saved = window.localStorage.getItem(editorModeStorageKey(ontologyId))
    return saved === 'structured' || saved === 'visual' ? saved : null
  } catch {
    return null
  }
}
const rememberEditorMode = (ontologyId: string, mode: OntologyEditorMode) => {
  try {
    window.localStorage.setItem(editorModeStorageKey(ontologyId), mode)
  } catch {
    // 本机存储不可用时不影响本体编辑主流程。
  }
}

export function OntologyListPage() {
  const navigate = useNavigate()
  const ontologies = useOntologyStore((state) => state.ontologies)
  const createOntology = useOntologyStore((state) => state.createOntology)
  const copyOntology = useOntologyStore((state) => state.copyOntology)
  const deleteOntology = useOntologyStore((state) => state.deleteOntology)
  const validateOntology = useOntologyStore((state) => state.validateOntology)
  const publishOntology = useOntologyStore((state) => state.publishOntology)
  const addAudit = useAppStore((state) => state.addAudit)
  const setToast = useAppStore((state) => state.setToast)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('全部')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(createInitial)
  const [target, setTarget] = useState<(typeof ontologies)[number] | null>(null)
  const [listDeleteTarget, setListDeleteTarget] = useState<(typeof ontologies)[number] | null>(null)

  const rows = useMemo(() => ontologies.filter((item) => (!keyword || `${item.name}${item.id}${item.domain}`.toLowerCase().includes(keyword.toLowerCase())) && (status === '全部' || item.status === status)), [ontologies, keyword, status])

  const create = async () => {
    const result = await createOntology(form)
    setToast(result.message)
    if (!result.ok || !result.objectId) return
    addAudit({ operator: '尹晨阳', organization: '集团监管部', action: '新建本体', objectType: '本体', objectId: result.objectId, summary: `${form.name} / ${form.domain}`, result: '成功', risk: '普通' })
    setCreateOpen(false)
    setForm(createInitial)
    navigate(`/ontology/${result.objectId}`)
  }

  const confirmVersionAction = async () => {
    if (!target) return
    const copy = target.status === '已发布'; const checking = target.status === '草稿'
    const result = copy ? await copyOntology(target.id) : checking ? await validateOntology(target.id) : await publishOntology(target.id)
    setToast(result.message)
    if (!result.ok) return
    addAudit({ operator: '陈洁', organization: '数据管理部', action: copy ? '复制本体版本' : checking ? '校验本体版本' : '发布本体版本', objectType: '本体', objectId: result.objectId || target.id, summary: `${target.name} ${target.version}`, result: '成功', risk: copy || checking ? '普通' : '高危' })
    setTarget(null)
    if (result.objectId) navigate(`/ontology/${result.objectId}`)
  }

  const remove = async () => {
    if (!listDeleteTarget) return
    const result = await deleteOntology(listDeleteTarget.id)
    setToast(result.message)
    if (!result.ok) return
    addAudit({ operator: '陈洁', organization: '数据管理部', action: '删除本体草稿', objectType: '本体', objectId: listDeleteTarget.id, summary: `${listDeleteTarget.name} ${listDeleteTarget.version}`, result: '成功', risk: '高危' })
    setListDeleteTarget(null)
  }

  return <>
    <PageHeader eyebrow="本体与图谱 / 本体管理" title="本体管理" description="维护本体类、属性与关系的统一语义定义。" actions={<><Button icon="refresh" onClick={() => setToast('本体列表已刷新')}>刷新</Button><Button variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>新建本体</Button></>}/>
    <FilterGrid onReset={() => { setKeyword(''); setStatus('全部') }} onSearch={() => setToast(`查询完成，共${rows.length}个本体`)}><Field label="关键词"><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="本体名称、编码或领域"/></Field><Field label="状态"><select value={status} onChange={(event) => setStatus(event.target.value)}><option>全部</option><option>草稿</option><option>待校验</option><option>已发布</option><option>已废止</option></select></Field></FilterGrid>
    <Panel title="本体列表" subtitle="已发布版本只读，变更必须复制新版本">{rows.length === 0 ? <EmptyState title="没有符合条件的本体" description="请调整筛选条件或新建本体。"/> : <div className="table-container"><table><thead><tr><th>本体名称 / 编码</th><th>范围 / 领域</th><th>版本</th><th>类 / 属性 / 关系</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td><button className="table-link title-cell" onClick={() => navigate(`/ontology/${item.id}`)}><strong>{item.name}</strong><span>{item.id}</span></button></td><td>{item.scope}<small className="cell-sub">{item.domain}</small></td><td>{item.version}</td><td><span className="metrics-inline"><b>{item.classes}</b>类 · <b>{item.properties}</b>属性 · <b>{item.relations}</b>关系</span></td><td><StatusTag>{item.status}</StatusTag></td><td>{item.updatedAt}</td><td><div className="row-actions"><button onClick={() => navigate(`/ontology/${item.id}`)}>{item.status === '已发布' ? '查看' : '编辑'}</button><button onClick={() => setTarget(item)}>{item.status === '已发布' ? '复制版本' : item.status === '待校验' ? '发布' : '校验'}</button>{item.status !== '已发布' && <button className="danger-link" onClick={() => setListDeleteTarget(item)}>删除</button>}</div></td></tr>)}</tbody></table></div>}</Panel>
    <Modal open={createOpen} title="新建本体" description="创建独立草稿后，可继续配置类、属性和关系。" confirmText="创建并编辑" onClose={() => setCreateOpen(false)} onConfirm={create}><div className="form-stack"><Field label="本体名称 *"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：供应链监管扩展本体"/></Field><Field label="本体编码 *"><input value={form.id} onChange={(event) => setForm({ ...form, id: event.target.value.toUpperCase() })} placeholder="例如：ONT-SUPPLY"/></Field><Field label="适用范围"><select value={form.scope} onChange={(event) => setForm({ ...form, scope: event.target.value })}><option>领域扩展本体</option><option>监管基础本体</option></select></Field><Field label="监管领域"><select value={form.domain} onChange={(event) => setForm({ ...form, domain: event.target.value })}><option>采购</option><option>合同</option><option>财务</option><option>投资</option><option>通用</option></select></Field><Field label="本体说明"><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="说明本体覆盖的业务对象、业务记录和边界"/></Field></div></Modal>
    <Modal open={!!target} title={target?.status === '已发布' ? '复制本体新版本' : target?.status === '待校验' ? '发布本体版本' : '校验本体版本'} description={target ? `${target.name} ${target.version}` : ''} confirmText={target?.status === '已发布' ? '确认复制' : target?.status === '待校验' ? '确认发布' : '开始校验'} onClose={() => setTarget(null)} onConfirm={confirmVersionAction}><div className="publish-checklist">{['基本信息与编码有效','至少定义一个本体类','属性和关系引用真实本体类','本体元素编码与引用完整','发布后版本只读'].map((label, index) => { const pass = index === 1 ? Boolean(target && target.classes > 0) : index === 2 || index === 3 ? Boolean(target && (target.validation?.blockers.length || 0) === 0) : true; return <div key={label}><Icon name={pass ? 'check' : 'warning'}/><span>{label}</span><StatusTag>{pass ? '通过' : '未通过'}</StatusTag></div> })}</div></Modal>
    <Modal open={!!listDeleteTarget} title="删除本体草稿" description={listDeleteTarget ? `${listDeleteTarget.name} · ${listDeleteTarget.id}` : ''} confirmText="确认删除" danger onClose={() => setListDeleteTarget(null)} onConfirm={remove}><div className="alert-box danger"><Icon name="warning"/><span>仅未发布且未被场景、规则或图谱引用的本体版本可以删除，操作不可恢复。</span></div></Modal>
  </>
}

export function OntologyEditorPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const item = useOntologyStore((state) => state.ontologies.find((row) => row.id === id))
  const updateOntology = useOntologyStore((state) => state.updateOntology)
  const copyOntology = useOntologyStore((state) => state.copyOntology)
  const publishOntology = useOntologyStore((state) => state.publishOntology)
  const addElement = useOntologyStore((state) => state.addElement)
  const deleteElement = useOntologyStore((state) => state.deleteElement)
  const addAudit = useAppStore((state) => state.addAudit)
  const setToast = useAppStore((state) => state.setToast)
  const [tab, setTab] = useState('basic')
  const [editorMode, setEditorMode] = useState<OntologyEditorMode>(() => readEditorMode(id) || 'structured')
  const [draft, setDraft] = useState({ name: '', scope: '领域扩展本体', domain: '采购', description: '' })
  const [elementOpen, setElementOpen] = useState(false)
  const validateOntology = useOntologyStore((state) => state.validateOntology)
  const [elementForm, setElementForm] = useState(elementInitial)
  const [deleteTarget, setDeleteTarget] = useState<OntologyElement | null>(null)
  const updateElement = useOntologyStore((state) => state.updateElement)
  const [publishOpen, setPublishOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<OntologyElement | null>(null)
  const [pendingCanvasPosition, setPendingCanvasPosition] = useState<CanvasPosition | null>(null)
  const modeScrollPositions = useRef<Record<OntologyEditorMode, number>>({ structured: 0, visual: 0 })

  useEffect(() => {
    if (item) setDraft({ name: item.name, scope: item.scope, domain: item.domain, description: item.description })
  }, [item])

  useEffect(() => {
    if (!item) return
    setEditorMode(readEditorMode(item.id) || (item.status === '已发布' ? 'visual' : 'structured'))
    setTab('basic')
    modeScrollPositions.current = { structured: 0, visual: 0 }
  }, [item?.id])

  if (!item) return <EmptyState title="本体版本不存在" description="请从本体列表选择可访问版本。"/>
  const readonly = item.status === '已发布'
  const activeType = (['class','property','relation'].includes(tab) ? tab : 'class') as OntologyElementType
  const elements = item.elements.filter((element) => element.type === activeType)
  const classOptions = item.elements.filter((element) => element.type === 'class')

  const save = async () => {
    const result = await updateOntology(item.id, draft)
    setToast(result.message)
    if (result.ok) addAudit({ operator: '陈洁', organization: '数据管理部', action: '保存本体草稿', objectType: '本体', objectId: item.id, summary: '更新基本信息', result: '成功', risk: '普通' })
  }
  const validate = async () => {
    const result = await validateOntology(item.id)
    setToast(result.message)
    if (result.ok) addAudit({ operator: '陈洁', organization: '数据管理部', action: '校验本体版本', objectType: '本体', objectId: item.id, summary: `${item.name} ${item.version}`, result: '成功', risk: '普通' })
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
    addAudit({ operator: '陈洁', organization: '数据管理部', action: '发布本体版本', objectType: '本体', objectId: item.id, summary: `${item.name} ${item.version}`, result: '成功', risk: '高危' })
    setPublishOpen(false)
  }
  const closeElementEditor = () => {
    setElementOpen(false)
    setEditTarget(null)
    setPendingCanvasPosition(null)
  }
  const openElement = (type: OntologyElementType, element?: OntologyElement, defaults: Partial<typeof elementInitial> = {}, position?: CanvasPosition) => {
    setEditTarget(element || null)
    const firstClass = classOptions[0]
    setPendingCanvasPosition(!element && position ? position : null)
    setElementForm(element ? { ...elementInitial, ...element, ownerCode: element.ownerCode || '', targetCode: element.targetCode || '' } : { ...elementInitial, type, ownerCode: type === 'class' ? '' : firstClass?.code || '', targetCode: type === 'relation' ? firstClass?.code || '' : '', dataType: type === 'class' ? '本体类' : type === 'property' ? '文本' : '本体类 → 本体类', ...defaults })
    setElementOpen(true)
  }
  const saveElement = async () => {
    const named = (code: string) => classOptions.find((row) => row.code === code)?.name || code
    const payload = { ...elementForm, dataType: elementForm.type === 'class' ? '本体类' : elementForm.type === 'relation' && elementForm.ownerCode && elementForm.targetCode ? `${named(elementForm.ownerCode)} → ${named(elementForm.targetCode)}` : elementForm.dataType }
    const result = editTarget ? await updateElement(item.id, editTarget.id, payload) : await addElement(item.id, payload)
    setToast(result.message)
    if (!result.ok) return
    if (!editTarget && pendingCanvasPosition && elementForm.type === 'class') saveOntologyLayoutPosition(item.id, elementForm.code, pendingCanvasPosition)
    addAudit({ operator: '陈洁', organization: '数据管理部', action: editTarget ? '编辑本体元素' : '新增本体元素', objectType: '本体', objectId: item.id, summary: `${typeLabels[elementForm.type]}：${elementForm.code}`, result: '成功', risk: '普通' })
    closeElementEditor()
  }
  const removeElement = async () => {
    if (!deleteTarget) return
    const result = await deleteElement(item.id, deleteTarget.id)
    setToast(result.message)
    if (result.ok) setDeleteTarget(null)
  }
  const switchEditorMode = (nextMode: OntologyEditorMode) => {
    if (nextMode === editorMode) return
    modeScrollPositions.current[editorMode] = window.scrollY
    setEditorMode(nextMode)
    rememberEditorMode(item.id, nextMode)
    window.requestAnimationFrame(() => window.scrollTo({ top: modeScrollPositions.current[nextMode], behavior: 'auto' }))
  }


  return <>
    <div className="editor-header"><div><button className="back-button" onClick={() => navigate('/ontology')}>‹ 返回本体列表</button><p className="eyebrow">本体版本编辑 / {item.id}</p><h1>{item.name}</h1><div className="editor-meta"><StatusTag>{item.status}</StatusTag><span>版本 {item.version}</span><span>{item.scope}</span><span>最近保存：{item.updatedAt}</span></div></div><div className="ontology-editor-header-tools"><div className="ontology-editor-mode" aria-label="本体编辑方式"><span>编辑方式</span><div role="group"><button className={editorMode === 'structured' ? 'active' : ''} aria-pressed={editorMode === 'structured'} onClick={() => switchEditorMode('structured')}><Icon name="menu" size={15}/>结构化配置</button><button className={editorMode === 'visual' ? 'active' : ''} aria-pressed={editorMode === 'visual'} onClick={() => switchEditorMode('visual')}><Icon name="graph" size={15}/>可视化建模</button></div></div><div className="page-actions">{readonly ? <Button variant="primary" onClick={copy}>复制新版本</Button> : <><Button onClick={save}>保存草稿</Button><Button onClick={validate}>校验</Button><Button variant="primary" onClick={() => setPublishOpen(true)}>发布</Button></>}</div></div></div>
    <Panel className={'editor-panel' + (editorMode === 'visual' ? ' ontology-visual-editor-panel' : '')}>{editorMode === 'structured' && <Tabs value={tab} onChange={setTab} items={[{ key: 'basic', label: '基本信息' }, { key: 'class', label: '类定义', count: item.classes }, { key: 'property', label: '属性', count: item.properties }, { key: 'relation', label: '关系', count: item.relations }, { key: 'versions', label: '版本记录' }]}/>}
      {editorMode === 'structured' && tab === 'basic' && <div className="form-section two-column"><Field label="本体名称"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} disabled={readonly}/></Field><Field label="本体编码"><input value={item.id} disabled/></Field><Field label="适用范围"><select value={draft.scope} onChange={(event) => setDraft({ ...draft, scope: event.target.value })} disabled={readonly}><option>监管基础本体</option><option>领域扩展本体</option></select></Field><Field label="监管领域"><select value={draft.domain} onChange={(event) => setDraft({ ...draft, domain: event.target.value })} disabled={readonly}><option>通用</option><option>采购</option><option>合同</option><option>财务</option><option>投资</option></select></Field><Field label="本体说明" wide><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} disabled={readonly} placeholder="说明本体覆盖范围和使用边界"/></Field><Panel title="版本统计" className="mini-summary"><KeyValue items={[{ label: '类', value: item.classes }, { label: '属性', value: item.properties }, { label: '关系', value: item.relations }]}/></Panel></div>}
      {editorMode === 'structured' && ['class','property','relation'].includes(tab) && <div><div className="section-toolbar"><div><strong>{typeLabels[activeType]}定义</strong><span>{activeType === 'class' ? '维护统一的本体类及其业务语义' : '使用稳定编码引用，发布后不可直接修改'}</span></div><Button variant="primary" icon="plus" disabled={readonly} title={readonly ? '已发布版本只读，请先复制新版本' : undefined} onClick={() => openElement(activeType)}>新增{typeLabels[activeType]}</Button></div>{elements.length === 0 ? <EmptyState title={`尚未定义${typeLabels[activeType]}`} description={readonly ? '当前发布版本没有登记该类型元素。' : `点击“新增${typeLabels[activeType]}”开始配置。`}/> : <div className="table-container"><table><thead><tr><th>编码 / 名称</th><th>{activeType === 'class' ? '类型' : '数据类型或方向'}</th><th>约束</th><th>说明</th><th>操作</th></tr></thead><tbody>{elements.map((element) => <tr key={element.id}><td><strong>{element.name}</strong><small className="cell-sub">{element.code}</small></td><td>{element.type === 'class' ? <StatusTag>本体类</StatusTag> : element.dataType || '—'}</td><td>{element.constraint || '—'}</td><td>{element.description || '—'}</td><td><div className="row-actions"><button onClick={() => openElement(activeType, element)}>{readonly ? '查看' : '编辑'}</button>{!readonly && <button onClick={() => setDeleteTarget(element)}>删除</button>}</div></td></tr>)}</tbody></table></div>}</div>}
      {editorMode === 'visual' && <OntologyVisualModeler ontologyId={item.id} status={item.status} elements={item.elements} validation={item.validation} onCreate={(type, position, defaults) => openElement(type, undefined, defaults || {}, position)} onEdit={(type, element) => openElement(type, element)} onCreateRelation={(sourceCode, targetCode) => openElement('relation', undefined, { ownerCode: sourceCode, targetCode })}/>}
      {editorMode === 'structured' && tab === 'versions' && <div className="version-timeline"><article><i/><div><strong>{item.version} · {item.status}</strong><span>{item.updatedAt} · 当前版本</span></div></article><article><i/><div><strong>版本创建</strong><span>保留发布、复制和元素变更审计</span></div></article></div>}
    </Panel>
    <Drawer open={elementOpen} title={`${editTarget ? '编辑' : '新增'}${typeLabels[elementForm.type]}`} eyebrow="本体元素" onClose={closeElementEditor} footer={<><Button onClick={closeElementEditor}>取消</Button><Button variant="primary" onClick={saveElement}>保存元素</Button></>}>
      <div className="form-stack">
        <Field label="元素类型"><input value={typeLabels[elementForm.type]} disabled/></Field>
        <Field label="元素编码 *"><input value={elementForm.code} onChange={(event) => setElementForm({ ...elementForm, code: event.target.value })} placeholder={elementForm.type === 'class' ? '例如 SUPPLY.Supplier' : '请输入稳定英文编码'}/></Field>
        <Field label="中文名称 *"><input value={elementForm.name} onChange={(event) => setElementForm({ ...elementForm, name: event.target.value })}/></Field>
        {elementForm.type === 'property' && <Field label="所属类 *"><select value={elementForm.ownerCode || ''} onChange={(event) => setElementForm({ ...elementForm, ownerCode: event.target.value })}>{classOptions.map((option) => <option value={option.code} key={option.code}>{option.name} · {option.code}</option>)}</select></Field>}
        {elementForm.type === 'relation' && <><Field label="起点类 *"><select value={elementForm.ownerCode || ''} onChange={(event) => setElementForm({ ...elementForm, ownerCode: event.target.value })}>{classOptions.map((option) => <option value={option.code} key={option.code}>{option.name} · {option.code}</option>)}</select></Field><Field label="终点类 *"><select value={elementForm.targetCode || ''} onChange={(event) => setElementForm({ ...elementForm, targetCode: event.target.value })}>{classOptions.map((option) => <option value={option.code} key={option.code}>{option.name} · {option.code}</option>)}</select></Field></>}
        {elementForm.type !== 'class' && <Field label={elementForm.type === 'relation' ? '关系方向' : '数据类型'}><input value={elementForm.type === 'relation' ? `${classOptions.find((option) => option.code === elementForm.ownerCode)?.name || elementForm.ownerCode || '起点类'} → ${classOptions.find((option) => option.code === elementForm.targetCode)?.name || elementForm.targetCode || '终点类'}` : elementForm.dataType} disabled={elementForm.type === 'relation'} onChange={(event) => setElementForm({ ...elementForm, dataType: event.target.value })}/></Field>}
        <Field label="约束"><input value={elementForm.constraint} onChange={(event) => setElementForm({ ...elementForm, constraint: event.target.value })} placeholder="主标识、必填、多对多、发生时间等"/></Field>
        <Field label="业务说明"><textarea value={elementForm.description} onChange={(event) => setElementForm({ ...elementForm, description: event.target.value })}/></Field>
      </div>
    </Drawer>
    <Modal open={publishOpen} title="发布本体版本" description={`${item.name} ${item.version}`} confirmText="确认发布" onClose={() => setPublishOpen(false)} onConfirm={publish}><div className="publish-checklist">{[["已完成本体校验",item.status === "待校验"],["至少定义一个本体类",item.classes > 0],["属性和关系引用真实本体类",(item.validation?.blockers.length || 0) === 0],["本体元素编码与引用完整",(item.validation?.blockers.length || 0) === 0],["发布后版本只读",true]].map(([label, pass]) => <div key={String(label)}><Icon name={pass ? "check" : "warning"}/><span>{label}</span><StatusTag>{pass ? "通过" : "未通过"}</StatusTag></div>)}</div></Modal>
    <Modal open={!!deleteTarget} title="删除本体元素" description={deleteTarget ? `${deleteTarget.name} · ${deleteTarget.code}` : ''} confirmText="确认删除" danger onClose={() => setDeleteTarget(null)} onConfirm={removeElement}><div className="alert-box danger"><Icon name="warning"/><span>删除会同步更新当前草稿版本的元素统计，已发布历史版本不受影响。</span></div></Modal>
  </>
}
