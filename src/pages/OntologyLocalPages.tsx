import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useOntologyStore, type OntologyElement, type OntologyElementType } from '../ontologyMysqlStore'
import { useAppStore } from '../store'
import { Button, Drawer, EmptyState, Field, Icon, ListPagination, ListStatus, ListToolbar, Modal, PageHeader, Panel, StatusTag, Tabs } from '../ui'
import { OntologyVisualModeler, saveOntologyLayoutPosition, type CanvasPosition } from './OntologyVisualModeler'

const productText = (value = '') => value
  .replaceAll('本体与图谱', '知识图谱')
  .replaceAll('监管基础本体', '基础图谱模型')
  .replaceAll('领域扩展本体', '领域图谱模型')
  .replaceAll('本体管理', '图谱模型')
  .replaceAll('本体类', '实体类型')
  .replaceAll('本体元素', '模型结构项')
  .replaceAll('本体', '图谱模型')

const displayOntologyDomain = (item: { id: string; domain: string }) => item.id === 'ONT-PROC' && item.domain === '采购' ? '采购与供应链' : item.domain
const ontologyDomainOrder = ['采购与供应链', '采购', '合同', '财务', '通用']
const ontologyDomainOptions = ['采购与供应链', '采购', '合同', '财务', '投资', '通用']
const ontologyHasStructure = (item: { classes: number; properties: number; relations: number }) => item.classes + item.properties + item.relations > 0

const createInitial = { id: '', name: '', scope: '领域图谱模型', domain: '采购', description: '' }
const elementInitial = { type: 'class' as OntologyElementType, code: '', name: '', groupName: '未分组', ownerCode: '', targetCode: '', dataType: '实体类型', constraint: '', description: '' }
const typeLabels: Record<OntologyElementType, string> = { class: '实体类型', property: '属性字段', relation: '关系类型' }
type OntologyEditorMode = 'structured' | 'visual'
type OntologySidebarMenu = { groupName: string; left: number; top: number; trigger: HTMLButtonElement }
type StructureElementFilter = '属性字段' | '关系类型'
const structureElementFilters: StructureElementFilter[] = ['属性字段', '关系类型']
const codeSegment = (code: string, fallback: string) => {
  const raw = (code.split('.').pop() || code || fallback).trim()
  const value = raw.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase()
  return value || fallback
}
const isReadonlyOntology = (status: string) => status !== '草稿'
const deleteOntologyNotice = '仅未被场景、规则、数据源或知识图谱引用的草稿模型可以删除，操作不可恢复。'
export function OntologyListPage({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate()
  const ontologies = useOntologyStore((state) => state.ontologies)
  const loadOntologies = useOntologyStore((state) => state.loadOntologies)
  const enableOntology = useOntologyStore((state) => state.enableOntology)
  const copyOntology = useOntologyStore((state) => state.copyOntology)
  const deleteOntology = useOntologyStore((state) => state.deleteOntology)
  const disableOntology = useOntologyStore((state) => state.disableOntology)
  const addAudit = useAppStore((state) => state.addAudit)
  const setToast = useAppStore((state) => state.setToast)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('全部')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [target, setTarget] = useState<(typeof ontologies)[number] | null>(null)
  const [enableTarget, setEnableTarget] = useState<(typeof ontologies)[number] | null>(null)
  const [disableTarget, setDisableTarget] = useState<(typeof ontologies)[number] | null>(null)
  const [listDeleteTarget, setListDeleteTarget] = useState<(typeof ontologies)[number] | null>(null)
  const [editingStoppedId, setEditingStoppedId] = useState('')

  const rows = useMemo(() => ontologies
    .filter((item) => (!keyword || `${productText(item.name)}${item.id}${displayOntologyDomain(item)}`.toLowerCase().includes(keyword.toLowerCase())) && (status === '全部' || item.status === status))
    .sort((a, b) => {
      const domainDiff = ontologyDomainOrder.indexOf(displayOntologyDomain(a)) - ontologyDomainOrder.indexOf(displayOntologyDomain(b))
      const structureDiff = Number(ontologyHasStructure(b)) - Number(ontologyHasStructure(a))
      return domainDiff || structureDiff || a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id)
    }), [ontologies, keyword, status])
  const pagedRows = rows.slice((page - 1) * pageSize, page * pageSize)
  const refresh = async () => {
    const result = await loadOntologies()
    if (!result.ok) setToast(result.message)
  }
  const enable = async () => {
    if (!target) return
    const result = await enableOntology(target.id)
    setToast(result.message)
    if (!result.ok) return
    addAudit({ operator: '陈洁', organization: '数据管理部', action: '启用图谱模型', objectType: '图谱模型', objectId: result.objectId || target.id, summary: productText(target.name), result: '成功', risk: '高危' })
    setTarget(null)
    if (result.objectId) navigate(`/ontology/${result.objectId}`)
  }

  const disable = async () => {
    if (!disableTarget) return
    const result = await disableOntology(disableTarget.id)
    setToast(result.message)
    if (!result.ok) return
    addAudit({ operator: '陈洁', organization: '数据管理部', action: '停用图谱模型', objectType: '图谱模型', objectId: disableTarget.id, summary: productText(disableTarget.name), result: '成功', risk: '高危' })
    setDisableTarget(null)
  }

  const enableStopped = async () => {
    if (!enableTarget) return
    const result = await enableOntology(enableTarget.id)
    setToast(result.message)
    if (!result.ok) return
    addAudit({ operator: '陈洁', organization: '数据管理部', action: '重新启用图谱模型', objectType: '图谱模型', objectId: enableTarget.id, summary: productText(enableTarget.name), result: '成功', risk: '高危' })
    setEnableTarget(null)
  }

  const remove = async () => {
    if (!listDeleteTarget) return
    const result = await deleteOntology(listDeleteTarget.id)
    setToast(result.message)
    if (!result.ok) return
    addAudit({ operator: '陈洁', organization: '数据管理部', action: '删除图谱模型', objectType: '图谱模型', objectId: listDeleteTarget.id, summary: productText(listDeleteTarget.name), result: '成功', risk: '高危' })
    setListDeleteTarget(null)
  }

  const editStopped = async (item: (typeof ontologies)[number]) => {
    if (editingStoppedId) return
    setEditingStoppedId(item.id)
    const result = await copyOntology(item.id)
    setEditingStoppedId('')
    setToast(result.ok ? '已创建可编辑草稿，原停用模型保持不变' : result.message)
    if (!result.ok || !result.objectId) return
    addAudit({ operator: '陈洁', organization: '数据管理部', action: '复制图谱模型为草稿', objectType: '图谱模型', objectId: result.objectId, summary: productText(item.name), result: '成功', risk: '普通' })
    navigate(`/ontology/${result.objectId}`)
  }


  return <>
    {!embedded && <PageHeader eyebrow="知识图谱 / 图谱模型" title="图谱模型" description="维护知识图谱中的实体、属性与关系定义。"/>}
    <section className="standard-list-page">
      <ListToolbar keyword={keyword} placeholder="搜索模型名称、编码或领域" onKeywordChange={(value) => { setKeyword(value); setPage(1) }} onSearch={() => setPage(1)} onRefresh={() => void refresh()} primaryAction={<Button className="compact" variant="primary" icon="plus" onClick={() => navigate('/ontology/new')}>新建图谱模型</Button>}/>
      {rows.length === 0 ? <EmptyState title="没有符合条件的图谱模型" description="请调整筛选条件或新建图谱模型。"/> : <>
<div className="table-container standard-list-table"><table className="ontology-model-list-table"><thead><tr><th>模型名称</th><th>监管领域</th><th>模型结构</th><th><label className="table-header-filter"><span>状态</span><Icon name="filter" size={14}/><select aria-label="模型状态" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option>全部</option><option>草稿</option><option>启用</option><option>停用</option></select></label></th><th>更新时间</th><th>操作</th></tr></thead><tbody>{pagedRows.map((item) => <tr key={item.id}><td><button className="table-link title-cell" onClick={() => navigate(`/ontology/${item.id}`)}><strong>{productText(item.name)}</strong><span>{item.id}</span></button></td><td>{displayOntologyDomain(item)}</td><td><span className="metrics-inline"><b>{item.classes}</b> 个实体类型 · <b>{item.properties}</b> 个属性 · <b>{item.relations}</b> 个关系</span></td><td><ListStatus>{item.status}</ListStatus></td><td>{item.updatedAt}</td><td><div className="list-row-actions"><button onClick={() => navigate(`/ontology/${item.id}`)}>{isReadonlyOntology(item.status) ? '查看' : '编辑'}</button>{item.status === '停用' && <button disabled={Boolean(editingStoppedId)} onClick={() => void editStopped(item)}>编辑</button>}{item.status === '停用' && <button onClick={() => setEnableTarget(item)}>启用</button>}{item.status === '草稿' && <button onClick={() => setTarget(item)}>启用</button>}{item.status === '启用' && <button onClick={() => setDisableTarget(item)}>停用</button>}{item.status === '草稿' && <button className="danger-link" onClick={() => setListDeleteTarget(item)}>删除</button>}</div></td></tr>)}</tbody></table></div>
        <ListPagination total={rows.length} page={page} pageSize={pageSize} onChange={(nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize) }}/>
      </>}
    </section>

    <Modal open={!!target} title="启用图谱模型" description={target ? `${productText(target.name)} · ${target.id}` : ''} confirmText="确认启用" onClose={() => setTarget(null)} onConfirm={enable}><div className="alert-box"><Icon name="check"/><span>启用后，当前图谱模型可被新建知识图谱引用；系统会自动检查模型结构是否完整。</span></div></Modal>
    <Modal open={!!disableTarget} title="停用图谱模型" description={disableTarget ? `${productText(disableTarget.name)} · ${disableTarget.id}` : ''} confirmText="确认停用" onClose={() => setDisableTarget(null)} onConfirm={disable}><div className="alert-box"><Icon name="warning"/><span>停用后该图谱模型不再允许新建图谱引用，已经生成的知识图谱不受影响。</span></div></Modal>
    <Modal open={!!enableTarget} title="启用图谱模型" description={enableTarget ? `${productText(enableTarget.name)} · ${enableTarget.id}` : ''} confirmText="确认启用" onClose={() => setEnableTarget(null)} onConfirm={enableStopped}><div className="alert-box"><Icon name="check"/><span>启用后该图谱模型可以重新被新建知识图谱选择。</span></div></Modal>
    <Modal open={!!listDeleteTarget} title="删除图谱模型" description={listDeleteTarget ? `${productText(listDeleteTarget.name)} · ${listDeleteTarget.id}` : ''} confirmText="确认删除" danger onClose={() => setListDeleteTarget(null)} onConfirm={remove}><div className="alert-box danger"><Icon name="warning"/><span>{deleteOntologyNotice}</span></div></Modal>
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
  const [nameError, setNameError] = useState('')
  const patch = (next: Partial<typeof createInitial>) => {
    setForm((value) => ({ ...value, ...next }))
    if (next.name !== undefined) setNameError('')
    setDirty(true)
  }
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirty || saving) return
      event.preventDefault(); event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty, saving])
  const createDraft = async () => {
    if (saving) return
    if (!form.name.trim()) { setNameError('请输入模型名称'); return }
    setSaving(true)
    const payload = { ...form, id: form.id.trim().toUpperCase(), name: form.name.trim(), description: form.description.trim() }
    const result = await createOntology(payload)
    setToast(result.message)
    if (!result.ok || !result.objectId) { setSaving(false); return }
    addAudit({ operator: '尹晨阳', organization: '集团监管部', action: '新建图谱模型', objectType: '图谱模型', objectId: result.objectId, summary: `${payload.name} / ${payload.domain}`, result: '成功', risk: '普通' })
    setDirty(false)
    navigate(`/ontology/${encodeURIComponent(result.objectId)}?tab=structure&flow=create`, { replace: true })
  }
  const cancel = () => {
    if (saving) { setToast('正在创建图谱模型，请稍候'); return }
    if (dirty && !window.confirm('当前新建内容尚未保存，确认放弃并返回？')) return
    navigate('/graphs/structures')
  }
  return <>
    <div className="ontology-create-page">
      <header className="simple-rule-header ontology-create-header"><div><button type="button" className="back-button" onClick={cancel}>‹ 返回图谱模型</button><h1>创建图谱模型</h1></div></header>
      <main className="rule-step-content ontology-create-content">
        <Panel className="ontology-create-panel" title="基本信息" subtitle="创建后进入模型结构配置，可继续添加实体类型、属性字段和关系类型。">
          <div className="form-section ontology-create-form">
            <Field label="模型名称 *"><div><input className={nameError ? 'input-error' : ''} value={form.name} onChange={(event) => patch({ name: event.target.value })} placeholder="例如：采购与供应链监管图谱" aria-invalid={Boolean(nameError)}/>{nameError && <small className="field-error">{nameError}</small>}</div></Field>
            <Field label="模型编码"><input value={form.id} onChange={(event) => patch({ id: event.target.value.toUpperCase() })} placeholder="留空后自动生成"/></Field>
            <Field label="监管领域 *"><select value={form.domain} onChange={(event) => patch({ domain: event.target.value })}>{ontologyDomainOptions.map((domain) => <option key={domain} value={domain}>{domain}</option>)}</select></Field>
            <Field label="模型说明"><textarea value={form.description} onChange={(event) => patch({ description: event.target.value })} placeholder="说明模型覆盖的业务对象和使用边界"/></Field>
          </div>
        </Panel>
      </main>
      <footer className="editor-action-bar ontology-create-action-bar"><div className="ontology-create-actions"><Button variant="primary" disabled={saving} onClick={() => void createDraft()}>{saving ? '正在创建…' : '创建并配置结构'}</Button><Button disabled={saving} onClick={cancel}>取消</Button></div></footer>
    </div>
  </>
}

export function OntologyEditorPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab') || 'basic'
  const normalizedRequestedTab = ['basic','structure'].includes(requestedTab) ? requestedTab : ['class','property','relation'].includes(requestedTab) ? 'structure' : 'basic'
  const creatingFlow = searchParams.get('flow') === 'create'
  const item = useOntologyStore((state) => state.ontologies.find((row) => row.id === id))
  const updateOntology = useOntologyStore((state) => state.updateOntology)
  const copyOntology = useOntologyStore((state) => state.copyOntology)
  const deleteOntology = useOntologyStore((state) => state.deleteOntology)
  const addElement = useOntologyStore((state) => state.addElement)
  const deleteElement = useOntologyStore((state) => state.deleteElement)
  const createGroup = useOntologyStore((state) => state.createGroup)
  const renameGroup = useOntologyStore((state) => state.renameGroup)
  const deleteGroup = useOntologyStore((state) => state.deleteGroup)
  const addAudit = useAppStore((state) => state.addAudit)
  const setToast = useAppStore((state) => state.setToast)
  const [tab, setTab] = useState(normalizedRequestedTab)
  const [editorMode, setEditorMode] = useState<OntologyEditorMode>('structured')
  const [draft, setDraft] = useState({ name: '', scope: '领域图谱模型', domain: '采购', description: '' })
  const [elementOpen, setElementOpen] = useState(false)
  const [elementForm, setElementForm] = useState(elementInitial)
  const [deleteTarget, setDeleteTarget] = useState<OntologyElement | null>(null)
  const updateElement = useOntologyStore((state) => state.updateElement)
  const [cancelCreateOpen, setCancelCreateOpen] = useState(false)
  const [discardChangesOpen, setDiscardChangesOpen] = useState(false)
  const [cancelingCreate, setCancelingCreate] = useState(false)
  const [copying, setCopying] = useState(false)
  const [editTarget, setEditTarget] = useState<OntologyElement | null>(null)
  const [pendingCanvasPosition, setPendingCanvasPosition] = useState<CanvasPosition | null>(null)
  const [elementCodeTouched, setElementCodeTouched] = useState(false)
  const [elementNameTouched, setElementNameTouched] = useState(false)
  const [selectedEntityCode, setSelectedEntityCode] = useState('')
  const [selectedGroupName, setSelectedGroupName] = useState('')
  const [expandedEntityGroup, setExpandedEntityGroup] = useState('')
  const [groupDialog, setGroupDialog] = useState<{ mode: 'create' } | { mode: 'rename'; currentName: string } | null>(null)
  const [groupNameDraft, setGroupNameDraft] = useState('')
  const [groupDeleteTarget, setGroupDeleteTarget] = useState('')
  const [sidebarMenu, setSidebarMenu] = useState<OntologySidebarMenu | null>(null)
  const sidebarMenuRef = useRef<HTMLDivElement | null>(null)
  const [entityKeyword, setEntityKeyword] = useState('')
  const [structureKeyword, setStructureKeyword] = useState('')
  const [elementFilter, setElementFilter] = useState<StructureElementFilter>('属性字段')
  const modeScrollPositions = useRef<Record<OntologyEditorMode, number>>({ structured: 0, visual: 0 })
  const ontologyGroups = useMemo(() => [...new Set([...(item?.groups || []), '未分组'])], [item?.groups])
  const classOptions = useMemo(() => (item?.elements || []).filter((element) => element.type === 'class').sort((a, b) => {
    const groupDiff = ontologyGroups.indexOf(a.groupName || '未分组') - ontologyGroups.indexOf(b.groupName || '未分组')
    return groupDiff || a.name.localeCompare(b.name, 'zh-CN') || a.code.localeCompare(b.code)
  }), [item?.elements, ontologyGroups])
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
  }, [item?.id])

  useEffect(() => {
    if (!item) return
    setEditorMode('structured')
    setTab(normalizedRequestedTab)
    setEntityKeyword('')
    setStructureKeyword('')
    setElementFilter('属性字段')
    modeScrollPositions.current = { structured: 0, visual: 0 }
  }, [item?.id, normalizedRequestedTab])

  useEffect(() => {
    setSelectedGroupName('')
  }, [item?.id])

  useEffect(() => {
    if (!item) return
    setSelectedEntityCode((current) => {
      if (current && classOptions.some((element) => element.code === current)) return current
      if (selectedGroupName && ontologyGroups.includes(selectedGroupName)) return classOptions.find((element) => (element.groupName || '未分组') === selectedGroupName)?.code || ''
      return classOptions[0]?.code || ''
    })
  }, [item?.id, classOptions, ontologyGroups, selectedGroupName])

  useEffect(() => {
    const selected = classOptions.find((element) => element.code === selectedEntityCode)
    if (selected) {
      const groupName = selected.groupName || '未分组'
      setSelectedGroupName(groupName)
      setExpandedEntityGroup(groupName)
    }
  }, [selectedEntityCode, classOptions])

  useEffect(() => {
    if (!sidebarMenu) return
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!sidebarMenuRef.current?.contains(target) && !sidebarMenu.trigger.contains(target)) setSidebarMenu(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setSidebarMenu(null)
      sidebarMenu.trigger.focus()
    }
    const closeOnScroll = () => setSidebarMenu(null)
    sidebarMenuRef.current?.querySelector('button')?.focus()
    document.addEventListener('pointerdown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('scroll', closeOnScroll, true)
    window.addEventListener('resize', closeOnScroll)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('scroll', closeOnScroll, true)
      window.removeEventListener('resize', closeOnScroll)
    }
  }, [sidebarMenu])

  if (!item) return <EmptyState title="图谱模型不存在" description="请从图谱模型列表选择可访问模型。"/>
  const readonly = isReadonlyOntology(item.status)
  const domainOptions = [...new Set([...ontologyDomainOptions, item.domain])]
  const canCancelCreation = creatingFlow && !readonly
  const basicInfoDirty = draft.name !== productText(item.name) || draft.domain !== item.domain || draft.description !== productText(item.description)
  const showEditorFooter = !readonly && ((editorMode === 'structured' && tab === 'basic') || basicInfoDirty || canCancelCreation)
  const selectedEntity = classOptions.find((element) => element.code === selectedEntityCode)
  const entityName = (code = '') => classOptions.find((option) => option.code === code)?.name || code || '未选择'
  const selectedProperties = selectedEntity ? item.elements.filter((element) => element.type === 'property' && element.ownerCode === selectedEntity.code) : []
  const selectedRelations = selectedEntity ? item.elements.filter((element) => element.type === 'relation' && (element.ownerCode === selectedEntity.code || element.targetCode === selectedEntity.code)) : []
  const structureElements = elementFilter === '属性字段' ? selectedProperties : selectedRelations
  const entityKeywordValue = entityKeyword.trim().toLowerCase()
  const visibleClassOptions = classOptions.filter((element) => !entityKeywordValue || `${element.name}${element.code}${productText(element.description)}`.toLowerCase().includes(entityKeywordValue))
  const visibleClassGroups = ontologyGroups.map((label) => ({ label, items: visibleClassOptions.filter((element) => (element.groupName || '未分组') === label) })).filter((group) => group.items.length > 0 || !entityKeywordValue)
  const structureKeywordValue = structureKeyword.trim().toLowerCase()
  const visibleStructureElements = structureElements.filter((element) => {
    const text = `${element.name}${element.code}${element.dataType}${productText(element.description)}${entityName(element.ownerCode)}${entityName(element.targetCode)}`.toLowerCase()
    return !structureKeywordValue || text.includes(structureKeywordValue)
  })
  const deleteTargetLabel = deleteTarget ? typeLabels[deleteTarget.type] : '结构定义项'
  const deleteTargetProperties = deleteTarget?.type === 'class' ? item.elements.filter((element) => element.type === 'property' && element.ownerCode === deleteTarget.code) : []
  const deleteTargetRelations = deleteTarget?.type === 'class' ? item.elements.filter((element) => element.type === 'relation' && (element.ownerCode === deleteTarget.code || element.targetCode === deleteTarget.code)) : []
  const deleteBlockedByReferences = Boolean(deleteTarget?.type === 'class' && (deleteTargetProperties.length || deleteTargetRelations.length))
  const deleteTargetNotice = deleteBlockedByReferences
    ? `该实体类型已被 ${deleteTargetProperties.length} 个属性字段、${deleteTargetRelations.length} 个关系类型引用，不能直接删除。请先删除或调整这些属性字段和关系类型后再删除实体类型。`
    : deleteTarget?.type === 'class'
      ? '删除后将从当前图谱模型中移除该实体类型；已经生成的知识图谱不受影响。'
      : deleteTarget?.type === 'property'
        ? '删除后将从当前图谱模型中移除该属性字段；已经生成的知识图谱不受影响。'
        : deleteTarget?.type === 'relation'
          ? '删除后将从当前图谱模型中移除该关系类型；已经生成的知识图谱不受影响。'
          : '删除后将从当前图谱模型中移除该结构定义项；已经生成的知识图谱不受影响。'
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
  const changeTab = (nextTab: string) => {
    setSidebarMenu(null)
    setTab(nextTab)
    const next = new URLSearchParams(searchParams)
    next.set('tab', nextTab)
    setSearchParams(next, { replace: true })
  }

  const save = async () => {
    if (readonly) { setToast('只有草稿图谱模型可以编辑，请复制为草稿后修改'); return }
    const result = await updateOntology(item.id, draft)
    setToast(result.message)
    if (result.ok) addAudit({ operator: '陈洁', organization: '数据管理部', action: '保存图谱模型', objectType: '图谱模型', objectId: item.id, summary: '更新基本信息', result: '成功', risk: '普通' })
  }
  const copyAsDraft = async () => {
    if (copying) return
    setCopying(true)
    const result = await copyOntology(item.id)
    setCopying(false)
    setToast(result.ok && item.status === '停用' ? '已创建可编辑草稿，原停用模型保持不变' : result.message)
    if (!result.ok || !result.objectId) return
    addAudit({ operator: '陈洁', organization: '数据管理部', action: '复制图谱模型为草稿', objectType: '图谱模型', objectId: result.objectId, summary: productText(item.name), result: '成功', risk: '普通' })
    navigate(`/ontology/${result.objectId}`)
  }
  const cancelEditing = () => {
    if (canCancelCreation) setCancelCreateOpen(true)
    else if (basicInfoDirty) setDiscardChangesOpen(true)
    else navigate('/graphs/structures')
  }
  const discardBasicChanges = () => {
    setDiscardChangesOpen(false)
    navigate('/graphs/structures')
  }
  const cancelCreation = async () => {
    if (!canCancelCreation || cancelingCreate) return
    setCancelingCreate(true)
    const result = await deleteOntology(item.id)
    setToast(result.message)
    setCancelingCreate(false)
    if (!result.ok) return
    addAudit({ operator: '陈洁', organization: '数据管理部', action: '取消新建图谱模型', objectType: '图谱模型', objectId: item.id, summary: productText(item.name), result: '成功', risk: '普通' })
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
  const toggleSidebarMenu = (event: ReactMouseEvent<HTMLButtonElement>, groupName: string) => {
    const trigger = event.currentTarget
    if (sidebarMenu?.trigger === trigger) { setSidebarMenu(null); return }
    const rect = trigger.getBoundingClientRect()
    const left = Math.max(8, Math.min(rect.right - 168, window.innerWidth - 176))
    const top = rect.bottom + 86 > window.innerHeight - 8 ? Math.max(8, rect.top - 82) : rect.bottom + 4
    setSidebarMenu({ groupName, left, top, trigger })
  }
  const openGroupDialog = (mode: 'create' | 'rename', currentName = '') => {
    setGroupNameDraft(currentName)
    setGroupDialog(mode === 'create' ? { mode } : { mode, currentName })
  }
  const submitGroupDialog = async () => {
    if (!groupDialog) return
    const name = groupNameDraft.trim()
    if (!name) { setToast('分组名称不能为空'); return }
    const result = groupDialog.mode === 'create'
      ? await createGroup(item.id, name)
      : await renameGroup(item.id, groupDialog.currentName, name)
    setToast(result.message)
    if (!result.ok) return
    setEntityKeyword('')
    setExpandedEntityGroup(name)
    setSelectedGroupName(name)
    setSelectedEntityCode(groupDialog.mode === 'rename' ? classOptions.find((entity) => (entity.groupName || '未分组') === groupDialog.currentName)?.code || '' : '')
    setGroupDialog(null)
    setGroupNameDraft('')
  }
  const removeGroup = async () => {
    if (!groupDeleteTarget) return
    const targetName = groupDeleteTarget
    const result = await deleteGroup(item.id, targetName)
    setToast(result.message)
    if (result.ok) {
      setGroupDeleteTarget('')
      if (selectedGroupName === targetName) {
        setSelectedGroupName('未分组')
        setExpandedEntityGroup('未分组')
      }
    }
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
    setElementForm(element ? { ...elementInitial, ...element, groupName: element.groupName || '未分组', dataType: productText(element.dataType), description: productText(element.description), ownerCode: element.ownerCode || '', targetCode: element.targetCode || '' } : { ...elementInitial, ...defaults, type, code: type === 'property' && ownerCode ? `${ownerCode}.` : type === 'relation' ? suggestion.code : '', name: type === 'relation' ? suggestion.name : '', groupName: type === 'class' ? defaults.groupName || selectedGroupName || currentClass?.groupName || '未分组' : '', ownerCode, targetCode, dataType: type === 'class' ? '实体类型' : type === 'property' ? '文本' : '实体类型 → 实体类型' })
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
    if (readonly) { setToast('只有草稿图谱模型可以编辑，请复制为草稿后修改'); return }
    if (elementForm.type === 'property' && !elementForm.ownerCode) { setToast('请先在实体上下文中新增属性字段'); return }
    if (elementForm.type === 'relation' && !elementForm.ownerCode) { setToast('请先选择一个实体，再新增关系类型'); return }
    if (elementForm.type === 'relation' && !elementForm.targetCode) { setToast('请先选择关系类型的终点实体类型'); return }
    const named = (code: string) => classOptions.find((row) => row.code === code)?.name || code
    const payload = { ...elementForm, constraint: elementForm.type === 'relation' ? '' : elementForm.constraint, dataType: elementForm.type === 'class' ? '实体类型' : elementForm.type === 'relation' && elementForm.ownerCode && elementForm.targetCode ? `${named(elementForm.ownerCode)} → ${named(elementForm.targetCode)}` : elementForm.dataType }
    const result = editTarget ? await updateElement(item.id, editTarget.id, payload) : await addElement(item.id, payload)
    setToast(result.message)
    if (!result.ok) return
    if (!editTarget && pendingCanvasPosition && elementForm.type === 'class') saveOntologyLayoutPosition(item.id, elementForm.code, pendingCanvasPosition)
    addAudit({ operator: '陈洁', organization: '数据管理部', action: `${editTarget ? '编辑' : '新增'}${typeLabels[elementForm.type]}`, objectType: '图谱模型', objectId: item.id, summary: `${typeLabels[elementForm.type]}：${elementForm.code}`, result: '成功', risk: '普通' })
    if (elementForm.type === 'property' && (continueAdding || editTarget)) {
      resetPropertyEditor(elementForm.ownerCode, elementForm.dataType || '文本')
      return
    }
    closeElementEditor()
  }
  const removeElement = async () => {
    if (!deleteTarget) return
    if (deleteBlockedByReferences) { setDeleteTarget(null); return }
    if (readonly) { setToast('只有草稿图谱模型可以编辑，请复制为草稿后修改'); setDeleteTarget(null); return }
    const result = await deleteElement(item.id, deleteTarget.id)
    setToast(result.message)
    if (!result.ok) return
    if (editTarget?.id === deleteTarget.id && deleteTarget.type === 'property') resetPropertyEditor(deleteTarget.ownerCode || '')
    setDeleteTarget(null)
  }
  const switchEditorMode = (nextMode: OntologyEditorMode) => {
    if (nextMode === editorMode) return
    setSidebarMenu(null)
    modeScrollPositions.current[editorMode] = window.scrollY
    if (nextMode === 'visual') setTab('structure')
    setEditorMode(nextMode)
    window.requestAnimationFrame(() => window.scrollTo({ top: modeScrollPositions.current[nextMode], behavior: 'auto' }))
  }


  const elementDrawerTitle = `${readonly && editTarget ? '查看' : editTarget ? '编辑' : '新增'}${typeLabels[elementForm.type]}`
  const elementDrawerFooter = readonly ? <Button onClick={closeElementEditor}>关闭</Button> : <><Button onClick={closeElementEditor}>取消</Button>{editTarget && elementForm.type === 'property' && <Button onClick={() => resetPropertyEditor(elementForm.ownerCode, elementForm.dataType)}>返回新增</Button>}{!editTarget && elementForm.type === 'property' && <Button onClick={() => void saveElement(true)}>保存并继续新增</Button>}<Button variant="primary" onClick={() => void saveElement()}>{editTarget ? '保存修改' : '保存定义'}</Button></>

  return <>
    <div className="editor-header"><div><button className="back-button" onClick={cancelEditing}>‹ 返回图谱模型</button><h1>{productText(item.name)}</h1><div className="editor-meta"><StatusTag>{item.status}</StatusTag><span className="editor-model-code">{item.id}</span><span>{displayOntologyDomain(item)}</span><span>最近保存：{item.updatedAt}</span></div></div>{readonly && <div className="page-actions"><Button onClick={() => void copyAsDraft()} disabled={copying}>{copying ? '处理中...' : item.status === '停用' ? '编辑' : '复制为草稿'}</Button></div>}</div>
    <Panel className={'editor-panel' + (editorMode === 'visual' ? ' ontology-visual-editor-panel' : '') + (editorMode === 'structured' && tab === 'structure' ? ' ontology-structure-editor-panel' : '')}>
      <div className="ontology-editor-panel-toolbar">
        <Tabs value={tab} onChange={(nextTab) => { if (nextTab === 'basic' && editorMode === 'visual') setEditorMode('structured'); changeTab(nextTab) }} items={[{ key: 'basic', label: '基本信息' }, { key: 'structure', label: '模型结构' }]}/>
        {tab === 'structure' && <div className="ontology-editor-mode" aria-label={`图谱模型${readonly ? '查看' : '编辑'}方式`}><span>{readonly ? '查看方式' : '编辑方式'}</span><div role="group"><button className={editorMode === 'structured' ? 'active' : ''} aria-pressed={editorMode === 'structured'} onClick={() => switchEditorMode('structured')}><Icon name="menu" size={15}/>{readonly ? '结构化查看' : '结构化配置'}</button><button className={editorMode === 'visual' ? 'active' : ''} aria-pressed={editorMode === 'visual'} onClick={() => switchEditorMode('visual')}><Icon name="graph" size={15}/>{readonly ? '结构画布' : '可视化建模'}</button></div></div>}
      </div>
      {editorMode === 'structured' && tab === 'basic' && <div className="form-section two-column"><Field label="结构名称"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} disabled={readonly}/></Field><Field label="结构编码"><input value={item.id} disabled/></Field><Field label="监管领域"><select value={draft.domain} onChange={(event) => setDraft({ ...draft, domain: event.target.value })} disabled={readonly}>{domainOptions.map((domain) => <option key={domain} value={domain}>{domain}</option>)}</select></Field><Field label="结构说明" wide><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} disabled={readonly} placeholder="说明图谱结构覆盖范围和使用边界"/></Field></div>}
      {editorMode === 'structured' && tab === 'structure' && <div className="ontology-structure-workbench">
        <aside className="ontology-structure-sidebar">
          <header><div><strong>实体类型</strong><span>按名称或编码快速定位</span></div><StatusTag>{classOptions.length} 个</StatusTag></header>
          <div className="ontology-structure-sidebar-tools"><label className="ontology-entity-search"><Icon name="search" size={14}/><input value={entityKeyword} onChange={(event) => setEntityKeyword(event.target.value)} placeholder="搜索实体名称或编码" aria-label="搜索实体名称或编码"/></label>{!readonly && <button type="button" className="icon-button" title="新增实体类型" aria-label="新增实体类型" onClick={() => openElement('class')}><Icon name="plus" size={16}/></button>}</div>
{visibleClassOptions.length === 0 && entityKeywordValue ? <p className="ontology-structure-empty">没有匹配的实体类型</p> : <div className="ontology-entity-groups">{visibleClassGroups.map((group) => { const expanded = Boolean(entityKeywordValue) || expandedEntityGroup === group.label; return <section className="ontology-entity-group" key={group.label}><div className={'ontology-group-heading' + (selectedGroupName === group.label ? ' selected' : '')}><button type="button" className="ontology-entity-group-toggle" aria-expanded={expanded} aria-current={selectedGroupName === group.label ? 'true' : undefined} onClick={() => { setSelectedGroupName(group.label); setExpandedEntityGroup(expanded ? '' : group.label); setSelectedEntityCode(group.items[0]?.code || ''); setStructureKeyword('') }}><strong>{group.label}</strong><span>{group.items.length} 个</span><Icon name="chevron" size={14}/></button>{!readonly && group.label !== '未分组' && <button type="button" className="icon-button ontology-group-menu-trigger" title="分组操作：重命名或删除" aria-label={`${group.label}分组操作`} aria-haspopup="menu" aria-expanded={sidebarMenu?.groupName === group.label} onClick={(event) => toggleSidebarMenu(event, group.label)}><Icon name="more" size={16}/></button>}</div>{expanded && <div className="ontology-entity-list">{group.items.map((entity) => <div key={entity.id} className={'ontology-entity-row' + (selectedEntity?.code === entity.code ? ' active' : '')}><button className="ontology-entity-select" onClick={() => { setSelectedGroupName(group.label); setSelectedEntityCode(entity.code); setStructureKeyword('') }}><div><strong>{entity.name}</strong><small>{entity.code}</small></div><span><b>{propertyCountsByOwner[entity.code] || 0}</b> 属性 <b>{relationCountsByEntity[entity.code] || 0}</b> 关系</span></button></div>)}</div>}</section> })}</div>}
          {!readonly && <div className="ontology-entity-group-footer"><button type="button" onClick={() => openGroupDialog('create')}><Icon name="plus" size={14}/>新建分组</button></div>}
        </aside>
        <section className="ontology-structure-detail">
          {selectedEntity ? <><header className="ontology-structure-context">
            <div className="entity-context-title"><h2>{selectedEntity.name}</h2><code>{selectedEntity.code}</code></div>
            <dl className="entity-context-meta"><div><dt>业务说明</dt><dd>{productText(selectedEntity.description) || '未填写业务说明'}</dd></div></dl>
            <div className="entity-context-actions">{readonly ? <button type="button" className="structure-icon-action" title="查看实体类型" aria-label="查看实体类型" onClick={() => openElement('class', selectedEntity)}><Icon name="eye" size={16}/></button> : <details className="ontology-action-menu"><summary aria-label="实体类型操作" title="实体类型操作"><Icon name="more" size={18}/></summary><div><button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); openElement('class', selectedEntity) }}><Icon name="edit" size={14}/>编辑实体类型</button><button type="button" className="danger-link" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); setDeleteTarget(selectedEntity) }}><Icon name="trash" size={14}/>删除实体类型</button></div></details>}</div>
          </header>
          <section className="structure-element-section">
            <div className="structure-element-toolbar">
              <div className="structure-element-filters">{structureElementFilters.map((filter) => { const count = filter === '属性字段' ? selectedProperties.length : selectedRelations.length; return <button key={filter} className={elementFilter === filter ? 'active' : ''} onClick={() => { setElementFilter(filter); setStructureKeyword('') }}>{filter}<b>{count}</b></button> })}</div>
              <div className="structure-element-search-row"><label className="structure-element-search"><Icon name="search" size={14}/><input value={structureKeyword} onChange={(event) => setStructureKeyword(event.target.value)} placeholder={`搜索${elementFilter}名称、编码或说明`} aria-label={`搜索${elementFilter}名称、编码或说明`}/></label>{!readonly && <Button variant="primary" icon="plus" onClick={() => openElement(elementFilter === '属性字段' ? 'property' : 'relation', undefined, { ownerCode: selectedEntity.code })}>{elementFilter === '属性字段' ? '新增属性' : '新增关系'}</Button>}</div>
            </div>
            {structureElements.length === 0 ? <EmptyState title={`尚未定义${elementFilter}`} description={readonly ? `当前实体类型下没有${elementFilter}。` : `点击上方按钮新增${elementFilter === '属性字段' ? '属性' : '关系'}。`}/> : visibleStructureElements.length === 0 ? <EmptyState title={`没有匹配的${elementFilter}`} description="请调整搜索关键词。"/> : <div className={`table-container structure-element-table ${elementFilter === '属性字段' ? 'property-structure-table' : 'relation-structure-table'}`}><table><thead>{elementFilter === '属性字段' ? <tr><th>属性名称</th><th>属性编码</th><th>数据类型</th><th>业务说明</th><th>操作</th></tr> : <tr><th>关系名称</th><th>关系编码</th><th>关系方向</th><th>业务说明</th><th>操作</th></tr>}</thead><tbody>{visibleStructureElements.map((element) => {
              const ownerName = entityName(element.ownerCode)
              const targetName = entityName(element.targetCode)
              const relationRole = element.ownerCode === selectedEntity.code ? '当前实体作为起点' : element.targetCode === selectedEntity.code ? '当前实体作为终点' : '关系两端'
              return elementFilter === '属性字段'
                ? <tr key={element.id}><td><strong>{element.name}</strong></td><td><code className="structure-code-cell">{element.code}</code></td><td><strong>{productText(element.dataType) || '未设置类型'}</strong></td><td className="structure-description-cell">{productText(element.description) || '—'}</td><td><div className="structure-row-actions">{readonly ? <button type="button" className="structure-icon-action" title="查看属性字段" aria-label="查看属性字段" onClick={() => openElement(element.type, element)}><Icon name="eye" size={15}/></button> : <details className="ontology-action-menu"><summary aria-label={`属性字段 ${element.name} 操作`} title="更多操作"><Icon name="more" size={17}/></summary><div><button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); openElement(element.type, element) }}><Icon name="edit" size={14}/>编辑属性</button><button type="button" className="danger-link" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); setDeleteTarget(element) }}><Icon name="trash" size={14}/>删除属性</button></div></details>}</div></td></tr>
                : <tr key={element.id}><td><strong>{element.name}</strong></td><td><code className="structure-code-cell">{element.code}</code></td><td><strong>{ownerName} → {targetName}</strong><small className="cell-sub">{relationRole}</small></td><td className="structure-description-cell">{productText(element.description) || '—'}</td><td><div className="structure-row-actions">{readonly ? <button type="button" className="structure-icon-action" title="查看关系类型" aria-label="查看关系类型" onClick={() => openElement(element.type, element)}><Icon name="eye" size={15}/></button> : <details className="ontology-action-menu"><summary aria-label={`关系类型 ${element.name} 操作`} title="更多操作"><Icon name="more" size={17}/></summary><div><button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); openElement(element.type, element) }}><Icon name="edit" size={14}/>编辑关系</button><button type="button" className="danger-link" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); setDeleteTarget(element) }}><Icon name="trash" size={14}/>删除关系</button></div></details>}</div></td></tr>
            })}</tbody></table></div>}
          </section></> : <EmptyState title={classOptions.length ? '该分组暂无实体类型' : '尚未定义实体类型'} description={classOptions.length ? '当前分组还没有实体类型定义。' : readonly ? '当前模型没有登记实体类型。' : '当前模型还没有实体类型定义。'}/>}
        </section>
      </div>}
      {editorMode === 'visual' && <OntologyVisualModeler ontologyId={item.id} status={item.status} elements={item.elements} onCreate={(type, position, defaults) => openElement(type, undefined, defaults || {}, position)} onEdit={(type, element) => openElement(type, element)}/>}
    </Panel>
    {showEditorFooter && <footer className="editor-action-bar ontology-editor-action-bar"><div className="ontology-editor-footer-actions"><Button variant="primary" disabled={!basicInfoDirty} onClick={save}>{editorMode === 'structured' && tab === 'basic' ? item.status === '草稿' ? '保存草稿' : '保存修改' : '保存基本信息'}</Button><Button onClick={cancelEditing}>取消</Button></div></footer>}
    {sidebarMenu && createPortal(<div ref={sidebarMenuRef} className="ontology-sidebar-popup" role="menu" aria-label={`${sidebarMenu.groupName}分组操作`} style={{ left: sidebarMenu.left, top: sidebarMenu.top }}>
        <button type="button" role="menuitem" onClick={() => { setSidebarMenu(null); openGroupDialog('rename', sidebarMenu.groupName) }}><Icon name="edit" size={14}/>重命名</button>
        <button type="button" role="menuitem" className="danger-link" onClick={() => {
          setSidebarMenu(null)
          setGroupDeleteTarget(sidebarMenu.groupName)
        }}><Icon name="trash" size={14}/>删除分组</button>
    </div>, document.body)}
    <Drawer open={elementOpen} title={elementDrawerTitle} eyebrow={readonly ? '结构定义' : '结构定义 · 保存后立即生效'} onClose={closeElementEditor} footer={elementDrawerFooter}>
      <div className="form-stack">
        {elementForm.type === 'property' && <div className="alert-box"><Icon name="graph"/><span>当前实体：{entityName(elementForm.ownerCode)}；新增属性将自动归属于当前实体。</span></div>}
        <Field label={`${typeLabels[elementForm.type]}编码 *`}><input value={elementForm.code} disabled={readonly} onChange={(event) => { setElementCodeTouched(true); setElementForm({ ...elementForm, code: event.target.value }) }} placeholder="请输入唯一编码"/></Field>
        <Field label="中文名称 *"><input value={elementForm.name} disabled={readonly} onChange={(event) => { setElementNameTouched(true); setElementForm({ ...elementForm, name: event.target.value }) }}/></Field>
        {elementForm.type === 'class' && <Field label="所属分组 *"><select value={elementForm.groupName || '未分组'} disabled={readonly} onChange={(event) => setElementForm({ ...elementForm, groupName: event.target.value })}>{ontologyGroups.map((groupName) => <option value={groupName} key={groupName}>{groupName}</option>)}</select></Field>}
        {elementForm.type === 'relation' && <><Field label="起点实体类型"><input value={entityFieldValue(elementForm.ownerCode)} disabled/></Field><Field label="终点实体类型 *"><select value={elementForm.targetCode || ''} disabled={readonly} onChange={(event) => updateRelationEndpoint('targetCode', event.target.value)}><option value="">请选择终点实体类型</option>{classOptions.map((option) => <option value={option.code} key={option.code}>{option.name} · {option.code}</option>)}</select></Field></>}
        {elementForm.type !== 'class' && <Field label={elementForm.type === 'relation' ? '关系方向' : '数据类型'}><input value={elementForm.type === 'relation' ? `${classOptions.find((option) => option.code === elementForm.ownerCode)?.name || elementForm.ownerCode || '起点实体类型'} → ${classOptions.find((option) => option.code === elementForm.targetCode)?.name || elementForm.targetCode || '终点实体类型'}` : elementForm.dataType} disabled={readonly || elementForm.type === 'relation'} onChange={(event) => setElementForm({ ...elementForm, dataType: event.target.value })}/></Field>}
        <Field label="业务说明"><textarea value={elementForm.description} disabled={readonly} onChange={(event) => setElementForm({ ...elementForm, description: event.target.value })}/></Field>
      </div>
    </Drawer>
    <Modal open={!!groupDialog} title={groupDialog?.mode === 'rename' ? '重命名实体分组' : '新增实体分组'} description={groupDialog?.mode === 'rename' ? `当前名称：${groupDialog.currentName}` : '为当前图谱模型新增一个实体分组。'} confirmText={groupDialog?.mode === 'rename' ? '保存修改' : '创建分组'} onClose={() => setGroupDialog(null)} onConfirm={() => void submitGroupDialog()}><Field label="分组名称 *"><input value={groupNameDraft} maxLength={120} onChange={(event) => setGroupNameDraft(event.target.value)} placeholder="请输入分组名称"/></Field></Modal>
    <Modal open={Boolean(groupDeleteTarget)} title="删除实体分组" description={groupDeleteTarget} confirmText="确认删除" danger onClose={() => setGroupDeleteTarget('')} onConfirm={() => void removeGroup()}><div className="alert-box danger"><Icon name="warning"/><span>{groupDeleteTarget && classOptions.some((entity) => (entity.groupName || '未分组') === groupDeleteTarget) ? `组内 ${classOptions.filter((entity) => (entity.groupName || '未分组') === groupDeleteTarget).length} 个实体类型将移至“未分组”，属性和关系不会删除。` : '删除后该空分组将无法恢复；实体类型不会被删除。'}</span></div></Modal>
    <Modal open={cancelCreateOpen} title="取消新建图谱模型" description={`${productText(item.name)} · ${item.id}`} confirmText={cancelingCreate ? '正在取消…' : '确认取消'} danger onClose={() => { if (!cancelingCreate) setCancelCreateOpen(false) }} onConfirm={cancelCreation}><div className="alert-box danger"><Icon name="warning"/><span>取消后将删除当前草稿以及已配置的实体类型、属性字段和关系类型；已经生成的知识图谱不受影响。</span></div></Modal>
    <Modal open={discardChangesOpen} title="放弃基本信息修改？" description={`${productText(item.name)} · ${item.id}`} confirmText="放弃修改" danger onClose={() => setDiscardChangesOpen(false)} onConfirm={discardBasicChanges}><div className="alert-box danger"><Icon name="warning"/><span>尚未保存的基本信息修改将丢失；模型结构中的增删改已即时保存，不受影响。</span></div></Modal>
    <Modal open={!!deleteTarget} title={`删除${deleteTargetLabel}`} description={deleteTarget ? `${deleteTarget.name} · ${deleteTarget.code}` : ''} confirmText={deleteBlockedByReferences ? '知道了' : '确认删除'} danger={!deleteBlockedByReferences} onClose={() => setDeleteTarget(null)} onConfirm={removeElement}><div className={`alert-box ${deleteBlockedByReferences ? '' : 'danger'}`}><Icon name="warning"/><span>{deleteTargetNotice}</span></div></Modal>
  </>
}
