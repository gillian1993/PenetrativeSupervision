import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { dataGraphApi, type CreateGraphPayload, type GraphDependencyCheck, type MappingDependencyItem } from '../dataGraphApi'
import { useOntologyStore } from '../ontologyMysqlStore'
import { useAppStore } from '../store'
import type { DataSourceItem, GraphStructureElement, GraphVersion } from '../types'
import { Button, EmptyState, Field, Icon, ListStatus } from '../ui'
import { GraphMappingPanel } from './GraphMappingPanel'

const steps = ['基本信息', '图谱模型', '数据源', '数据映射', '确认生成']
const draftStorageKey = 'graph-create-workspace-draft'
const graphTagOptions = ['采购监管', '财务监管', '供应商监管', '合同监管', '通用图谱']

const initialForm = (): CreateGraphPayload => ({
  graphCode: `GRAPH-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`,
  graphName: '',
  tag: '采购监管',
  ontologyId: '',
  sourceIds: [],
  range: '',
  structureElements: [],
})

interface GraphDraftState { step: number; form: CreateGraphPayload; structureElements: GraphStructureElement[] }

const normalizeStructureElement = (element: GraphStructureElement): GraphStructureElement => ({
  id: String(element.id || `GEL-${Date.now()}`),
  type: element.type,
  code: element.code,
  name: element.name,
  ownerCode: element.ownerCode || '',
  targetCode: element.targetCode || '',
  dataType: element.dataType || (element.type === 'class' ? '实体类型' : element.type === 'property' ? '文本' : '实体类型 → 实体类型'),
  constraint: element.constraint || '',
  description: element.description || '',
  sourceType: element.sourceType || 'model',
})

const cloneModelElements = (elements: GraphStructureElement[]): GraphStructureElement[] => elements.map((element) => normalizeStructureElement({ ...element, sourceType: 'model' }))

const graphErrorMessage = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : ''
  return /failed to fetch|networkerror|network request/i.test(message) ? fallback : message || fallback
}

function loadDraft(): GraphDraftState {
  const fallback = { step: 0, form: initialForm(), structureElements: [] }
  try {
    const saved = window.sessionStorage.getItem(draftStorageKey)
    if (!saved) return fallback
    const parsed = JSON.parse(saved) as Partial<GraphDraftState>
    const form = parsed.form || fallback.form
    const structureElements = Array.isArray(parsed.structureElements) ? parsed.structureElements.map(normalizeStructureElement) : Array.isArray(form.structureElements) ? form.structureElements.map(normalizeStructureElement) : []
    return {
      step: Math.min(steps.length - 1, Math.max(0, Number(parsed.step) || 0)),
      form: { ...fallback.form, ...form, tag: typeof form.tag === 'string' && form.tag ? form.tag : fallback.form.tag, sourceIds: Array.isArray(form.sourceIds) ? form.sourceIds : [], structureElements },
      structureElements,
    }
  } catch {
    return fallback
  }
}

interface GraphCreateWorkspaceProps {
  dialogMode?: boolean
  graphId?: string
  onClose?: () => void
  onSaved?: (graph: GraphVersion) => void | Promise<void>
}

function GraphCreateWorkspace({ dialogMode = false, graphId, onClose, onSaved }: GraphCreateWorkspaceProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { id: routeGraphId } = useParams()
  const editingGraphId = graphId || routeGraphId
  const editing = Boolean(editingGraphId)
  const requestedStep = Math.min(steps.length - 1, Math.max(0, Number(new URLSearchParams(location.search).get('step')) || 0))
  const setToast = useAppStore((state) => state.setToast)
  const ontologies = useOntologyStore((state) => state.ontologies)
  const loaded = useOntologyStore((state) => state.loaded)
  const loadOntologies = useOntologyStore((state) => state.loadOntologies)
  const [draftSeed] = useState(() => editing || dialogMode ? { step: requestedStep, form: initialForm(), structureElements: [] } : loadDraft())
  const [step, setStep] = useState(draftSeed.step)
  const [form, setForm] = useState<CreateGraphPayload>(draftSeed.form)
  const [sources, setSources] = useState<DataSourceItem[]>([])
  const [dependencies, setDependencies] = useState<MappingDependencyItem[]>([])
  const [dependencyReady, setDependencyReady] = useState(false)
  const [dependencyIssues, setDependencyIssues] = useState<string[]>([])
  const [mappedCounts, setMappedCounts] = useState({ entities: 0, relations: 0 })
  const [graphElements, setGraphElements] = useState<GraphStructureElement[]>(draftSeed.structureElements)
  const [structureBaseOntologyId, setStructureBaseOntologyId] = useState(draftSeed.structureElements.length ? draftSeed.form.ontologyId : '')
  const [checkingDependencies, setCheckingDependencies] = useState(false)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editingGraph, setEditingGraph] = useState<GraphVersion | null>(null)
  const [ontologyKeyword, setOntologyKeyword] = useState('')
  const [sourceKeyword, setSourceKeyword] = useState('')
  const [validationMessage, setValidationMessage] = useState('')

  const enabledOntologies = useMemo(() => ontologies.filter((item) => item.status === '启用' && item.elements.length > 0), [ontologies])
  const selectedOntology = enabledOntologies.find((item) => item.id === form.ontologyId)
  const selectedSources = useMemo(() => sources.filter((item) => form.sourceIds.includes(item.id)), [form.sourceIds, sources])
  const visibleOntologies = useMemo(() => {
    const normalized = ontologyKeyword.trim().toLowerCase()
    return enabledOntologies.filter((item) => !normalized || [item.name, item.id, item.domain].join(' ').toLowerCase().includes(normalized))
  }, [ontologyKeyword, enabledOntologies])
  const visibleSources = useMemo(() => {
    const normalized = sourceKeyword.trim().toLowerCase()
    return sources.filter((item) => !normalized || [item.name, item.id, item.mode, item.owner].join(' ').toLowerCase().includes(normalized))
  }, [sourceKeyword, sources])
  const dependencyBySource = useMemo(() => new Map(dependencies.map((item) => [item.sourceId, item])), [dependencies])
  const selectedDependencies = form.sourceIds.map((id) => dependencyBySource.get(id)).filter((item): item is MappingDependencyItem => Boolean(item))
  const usedSources = selectedSources.filter((source) => dependencyBySource.get(source.id)?.status === 'ready')
  const blockedSource = selectedDependencies.find((item) => item.status !== 'ready')
  const totalMappingCount = selectedDependencies.reduce((sum, item) => sum + item.mappingCount, 0)
  const mappingsReady = selectedDependencies.length > 0 && dependencyReady
  const structureCounts = useMemo(() => ({
    class: graphElements.filter((item) => item.type === 'class').length,
    property: graphElements.filter((item) => item.type === 'property').length,
    relation: graphElements.filter((item) => item.type === 'relation').length,
  }), [graphElements])
  const hasDraft = editing ? Boolean(editingGraph) : Boolean(step > 0 || form.graphName.trim() || form.ontologyId || form.sourceIds.length || graphElements.length)


  useEffect(() => {
    let active = true
    setLoading(true)
    void Promise.all([loaded ? Promise.resolve() : loadOntologies(), dataGraphApi.listSources(), editing ? dataGraphApi.listGraphs() : Promise.resolve([] as GraphVersion[])])
      .then(([, sourceRows, graphRows]) => {
        if (!active) return
        setSources(sourceRows)
        if (editingGraphId) {
          const graph = graphRows.find((item) => item.id === editingGraphId)
          if (!graph) throw new Error('知识图谱生成结果不存在或已被删除')
          if (!['草稿', '待发布'].includes(graph.status)) throw new Error('已发布图谱需要先取消发布后才能编辑')
          const editConfig = { graphCode: graph.graphCode, graphName: graph.graphName, tag: graph.tag, ontologyId: graph.ontologyId, sourceIds: graph.sourceIds, range: graph.range, structureElements: graph.structureElements }
          const structureElements = Array.isArray(editConfig.structureElements) ? editConfig.structureElements.map(normalizeStructureElement) : []
          setEditingGraph(graph)
          setForm({ graphCode: editConfig.graphCode, graphName: editConfig.graphName, tag: editConfig.tag || '通用图谱', ontologyId: editConfig.ontologyId, sourceIds: editConfig.sourceIds, range: editConfig.range, structureElements })
          setGraphElements(structureElements)
          setStructureBaseOntologyId(structureElements.length ? graph.ontologyId : '')
          setStep(requestedStep)
        }
      })
      .catch((error) => { setValidationMessage(graphErrorMessage(error, '知识图谱配置加载失败，请稍后重试')); if (editingGraphId) { if (onClose) onClose(); else navigate('/graphs/results') } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [editing, editingGraphId, loaded, loadOntologies, navigate, onClose, requestedStep, setToast])

  useEffect(() => {
    if (!selectedOntology || structureBaseOntologyId === selectedOntology.id) return
    const nextElements = cloneModelElements(selectedOntology.elements as GraphStructureElement[])
    setGraphElements(nextElements)
    setStructureBaseOntologyId(selectedOntology.id)
  }, [selectedOntology, structureBaseOntologyId])

  useEffect(() => {
    if (!editing && !dialogMode) window.sessionStorage.setItem(draftStorageKey, JSON.stringify({ step, form: { ...form, structureElements: graphElements }, structureElements: graphElements }))
  }, [dialogMode, editing, step, form, graphElements])

  const payload = (): CreateGraphPayload => ({ ...form, structureElements: graphElements })

  const checkDependencies = async (): Promise<GraphDependencyCheck | null> => {
    if (!form.ontologyId || !form.sourceIds.length) { setDependencies([]); setDependencyReady(false); setDependencyIssues([]); setMappedCounts({ entities: 0, relations: 0 }); return null }
    setCheckingDependencies(true)
    try {
      const result = await dataGraphApi.checkGraphDependencies({ ontologyId: form.ontologyId, sourceIds: form.sourceIds, structureElements: graphElements, graphId: editingGraphId })
      setDependencies(result.items)
      setDependencyReady(result.ready)
      setDependencyIssues(result.issues)
      setMappedCounts({ entities: result.mappedEntityCount, relations: result.mappedRelationCount })
      return result
    } catch (error) {
      setDependencyReady(false)
      setToast(graphErrorMessage(error, '图谱映射检查失败，请稍后重试'))
      return null
    } finally {
      setCheckingDependencies(false)
    }
  }

  const chooseOntology = (ontologyId: string) => {
    const ontology = enabledOntologies.find((item) => item.id === ontologyId)
    const nextElements = ontology ? cloneModelElements(ontology.elements as GraphStructureElement[]) : []
    setForm((value) => ({ ...value, ontologyId, sourceIds: [], structureElements: nextElements }))
    setGraphElements(nextElements)
    setStructureBaseOntologyId(ontologyId)
    setDependencies([])
    setDependencyReady(false)
    setDependencyIssues([])
    setMappedCounts({ entities: 0, relations: 0 })
    setValidationMessage('')
  }

  const toggleSource = (source: DataSourceItem) => {
    if (source.status !== '启用' && !form.sourceIds.includes(source.id)) return
    setForm((value) => ({ ...value, sourceIds: value.sourceIds.includes(source.id) ? value.sourceIds.filter((id) => id !== source.id) : [...value.sourceIds, source.id] }))
    setDependencies([])
    setDependencyReady(false)
    setDependencyIssues([])
    setMappedCounts({ entities: 0, relations: 0 })
    setValidationMessage('')
  }

  const validateCurrentStructure = () => {
    if (!structureCounts.class) { setToast('当前图谱结构至少需要一个实体类型'); return false }
    const classCodes = new Set(graphElements.filter((element) => element.type === 'class').map((item) => item.code))
    const invalidProperty = graphElements.find((element) => element.type === 'property' && !classCodes.has(element.ownerCode || ''))
    if (invalidProperty) { setToast(`${invalidProperty.name} 缺少所属实体类型`); return false }
    const invalidRelation = graphElements.find((element) => element.type === 'relation' && (!classCodes.has(element.ownerCode || '') || !classCodes.has(element.targetCode || '')))
    if (invalidRelation) { setToast(`${invalidRelation.name} 缺少有效的起点或终点实体类型`); return false }
    return true
  }

  const next = async () => {
    setValidationMessage('')
    if (step === 0 && !form.graphName.trim()) { setValidationMessage('请填写图谱名称'); return }
    if (step === 0 && !/^[A-Z0-9_-]{3,64}$/.test(form.graphCode)) { setValidationMessage('图谱编码需使用 3-64 位大写字母、数字、下划线或短横线'); return }
    if (step === 0 && (!form.tag || !form.range.trim())) { setValidationMessage('请补充图谱标签和图谱说明'); return }
    if (step === 1 && !selectedOntology) { setValidationMessage('请选择一个启用状态的图谱模型'); return }
    if (step === 2 && !form.sourceIds.length) { setValidationMessage('请至少选择一个启用状态的数据源'); return }
    if (step === 2 && !editingGraphId && !dialogMode) { await saveDraft(3); return }
    if (step === 3 && !validateCurrentStructure()) return
    if (step === 3) await checkDependencies()
    setStep((value) => Math.min(steps.length - 1, value + 1))
    setValidationMessage('')
  }

  const saveDraft = async (resumeStep?: number): Promise<GraphVersion | null> => {
    if (creating) return null
    setCreating(true)
    try {
      const graph = editingGraphId
        ? await dataGraphApi.saveGraphDraft(editingGraphId, payload())
        : await dataGraphApi.createGraphDraft(payload())
      if (!dialogMode) window.sessionStorage.removeItem(draftStorageKey)
      setToast(resumeStep === 3 ? '已创建草稿，请完成数据映射' : '知识图谱草稿已保存')
      if (onSaved) await onSaved(graph)
      if (!editing && !dialogMode) navigate(`/graphs/${graph.id}/edit${resumeStep === undefined ? '' : `?step=${resumeStep}`}`)
      return graph
    } catch (error) {
      setToast(graphErrorMessage(error, '草稿保存失败，请稍后重试'))
      return null
    } finally {
      setCreating(false)
    }
  }

  const leave = () => {
    const message = dialogMode ? '当前内容尚未保存，确认关闭弹框吗？' : editing ? '当前修改尚未保存，确认返回知识图谱吗？' : '当前生成草稿已暂存，确认返回知识图谱吗？'
    if (hasDraft && !window.confirm(message)) return
    if (onClose) onClose(); else navigate('/graphs/results')
  }

  const submit = async () => {
    if (!validateCurrentStructure()) return
    const dependencyCheck = await checkDependencies()
    if (!dependencyCheck?.ready) {
      const blocked = dependencyCheck?.items.find((item) => item.status !== 'ready')
      setValidationMessage(blocked?.message || dependencyCheck?.issues[0] || '请先完成数据映射')
      setStep(3)
      return
    }
    setCreating(true)
    try {
      const graph = editingGraphId
        ? await dataGraphApi.updateGraph(editingGraphId, payload())
        : await dataGraphApi.createGraph(payload())
      if (!editing && !dialogMode) window.sessionStorage.removeItem(draftStorageKey)
      setEditingGraph(null)
      setToast(`数据同步完成，已生成 ${graph.entities} 个实体、${graph.relations} 条关系，当前状态为${graph.status}`)
      if (onSaved) await onSaved(graph)
      if (onClose) onClose(); else navigate(`/graphs/results/${graph.id}`)
    } catch (error) {
      setToast(graphErrorMessage(error, editing ? '保存未完成，图谱仍保留为草稿，请调整映射后重试' : '知识图谱生成未完成，当前配置仍可继续编辑'))
    } finally {
      setCreating(false)
    }
  }

  const hostClass = dialogMode ? 'graph-create-dialog-overlay' : 'graph-create-route-host'
  return <div className={hostClass} onMouseDown={(event) => { if (dialogMode && event.target === event.currentTarget) leave() }}><div className={`graph-create-page ${dialogMode ? 'graph-create-dialog' : ''}`} role={dialogMode ? 'dialog' : undefined} aria-modal={dialogMode ? true : undefined}>
    <header className="graph-create-header">
      <div className="graph-create-header-main"><button className="back-button" onClick={leave}>{dialogMode ? '关闭' : '‹ 返回知识图谱'}</button><h1>{editing ? '编辑知识图谱' : '新建知识图谱'}</h1></div>
    </header>
    <div className="graph-create-progress"><ol className="graph-wizard-steps">{steps.map((item, index) => <li className={index === step ? 'active' : index < step ? 'done' : ''} aria-current={index === step ? 'step' : undefined} key={item}><span className="graph-step-marker">{index < step ? <Icon name="check" size={13}/> : index + 1}</span><span>{item}</span></li>)}</ol><div className="graph-wizard-mobile-progress"><strong>第 {step + 1}/{steps.length} 步 · {steps[step]}</strong><progress value={step + 1} max={steps.length} aria-label="创建进度"/></div></div>
    <main className="graph-create-main">
      <div className="graph-create-content">
        {loading && <div className="loading-state graph-create-loading"><i/><span>正在加载配置…</span></div>}
        {!loading && validationMessage && <div className="graph-validation-message"><Icon name="warning" size={16}/><span>{validationMessage}</span></div>}
        {!loading && step === 0 && <div className="graph-basic-info-form"><Field label="图谱名称 *"><input value={form.graphName} onChange={(event) => { setValidationMessage(''); setForm({ ...form, graphName: event.target.value }) }} placeholder="例如：采购监管图谱"/></Field><Field label="图谱编码 *"><input value={form.graphCode} onChange={(event) => { setValidationMessage(''); setForm({ ...form, graphCode: event.target.value.toUpperCase() }) }} placeholder="例如：PROCUREMENT_RISK"/></Field><Field label="图谱标签 *"><select value={form.tag} onChange={(event) => { setValidationMessage(''); setForm({ ...form, tag: event.target.value }) }}>{graphTagOptions.map((tag) => <option value={tag} key={tag}>{tag}</option>)}</select></Field><Field label="图谱说明 *" wide><textarea value={form.range} onChange={(event) => { setValidationMessage(''); setForm({ ...form, range: event.target.value }) }} placeholder="说明这个图谱的业务用途、覆盖对象和使用场景"/></Field></div>}
        {!loading && step === 1 && <div className="graph-selection-workspace"><div className="graph-selection-toolbar"><label className="graph-selection-search"><Icon name="search" size={16}/><input value={ontologyKeyword} onChange={(event) => setOntologyKeyword(event.target.value)} placeholder="搜索模型名称、编码或领域"/></label><div className="graph-selection-meta"><span>{visibleOntologies.length} 个模型</span>{selectedOntology && <strong title={selectedOntology.name}>已选：{selectedOntology.name}</strong>}</div></div>{visibleOntologies.length ? <div className="table-container graph-selection-table"><table><thead><tr><th className="selection-column">选择</th><th>模型名称</th><th>监管领域</th><th>模型结构</th><th>状态</th></tr></thead><tbody>{visibleOntologies.map((ontology) => <tr className={form.ontologyId === ontology.id ? 'selected' : ''} onClick={() => chooseOntology(ontology.id)} key={ontology.id}><td className="selection-column"><input type="radio" aria-label={`选择${ontology.name}`} checked={form.ontologyId === ontology.id} onClick={(event) => event.stopPropagation()} onChange={() => chooseOntology(ontology.id)}/></td><td><strong>{ontology.name}</strong><small className="cell-sub">{ontology.id}</small></td><td>{ontology.domain}</td><td><span className="metrics-inline"><b>{ontology.classes}</b> 个实体类型 · <b>{ontology.properties}</b> 个属性 · <b>{ontology.relations}</b> 个关系</span></td><td><ListStatus>{ontology.status}</ListStatus></td></tr>)}</tbody></table></div> : <EmptyState title="没有符合条件的图谱模型" description="请调整搜索条件，或先发布一套图谱模型。"/>}</div>}
        {!loading && step === 2 && <div className="graph-selection-workspace"><div className="graph-selection-toolbar"><label className="graph-selection-search"><Icon name="search" size={16}/><input value={sourceKeyword} onChange={(event) => setSourceKeyword(event.target.value)} placeholder="搜索数据源名称、编码、方式或责任人"/></label>{selectedSources.length ? <details className="graph-selected-sources"><summary>已选 {selectedSources.length} 个<Icon name="chevron" size={14}/></summary><div className="graph-selected-sources-menu">{selectedSources.map((source) => <div className="graph-selected-source" key={source.id}><span title={source.name}>{source.name}</span><button type="button" aria-label={`移除${source.name}`} title={`移除${source.name}`} onClick={() => toggleSource(source)}><Icon name="close" size={14}/></button></div>)}</div></details> : <span className="graph-selection-empty-count">已选 0 个</span>}</div>{!sources.length ? <EmptyState title="暂无数据源" description="请先接入并启用数据源，再生成知识图谱。" action={<Button variant="primary" icon="plus" onClick={() => navigate('/graphs/sources/new')}>新建数据源</Button>}/> : visibleSources.length ? <div className="table-container graph-selection-table"><table><thead><tr><th className="selection-column">选择</th><th>数据源</th><th>接入方式</th><th>责任人</th><th>连接状态</th></tr></thead><tbody>{visibleSources.map((source) => { const selectable = source.status === '启用'; const selected = form.sourceIds.includes(source.id); return <tr className={`${selected ? 'selected' : ''} ${!selectable && !selected ? 'disabled' : ''}`} onClick={() => (selectable || selected) && toggleSource(source)} key={source.id}><td className="selection-column"><input type="checkbox" aria-label={`选择${source.name}`} disabled={!selectable && !selected} checked={selected} onClick={(event) => event.stopPropagation()} onChange={() => toggleSource(source)}/></td><td><strong>{source.name}</strong><small className="cell-sub">{source.id}</small></td><td>{source.mode}</td><td>{source.owner}</td><td><ListStatus>{selectable ? '可用' : source.status === '异常' ? '连接异常' : '不可用'}</ListStatus></td></tr> })}</tbody></table></div> : <EmptyState title="没有符合条件的数据源" description="请调整搜索条件，或先接入并启用数据源。"/>}</div>}
        {!loading && step === 3 && <>{selectedOntology && <GraphMappingPanel ontologyId={selectedOntology.id} ontologyName={selectedOntology.name} ontologyStatus={selectedOntology.status} ontologyElements={graphElements} allowedSourceIds={form.sourceIds} graphId={editingGraphId} onElementsChange={(elements) => { setGraphElements(elements); setDependencyReady(false); setDependencyIssues([]) }}/>}</>}
        {!loading && step === 4 && <div className="graph-confirm-summary">
          {!mappingsReady && <p className="graph-confirm-warning"><Icon name="warning" size={16}/>{blockedSource?.message || dependencyIssues[0] || '请至少完成一个实体类型映射，并检查实际参与的映射。'}</p>}
          <section><h3>基本信息</h3><dl><div><dt>图谱名称</dt><dd>{form.graphName}</dd></div><div><dt>图谱编码</dt><dd>{form.graphCode}</dd></div><div><dt>图谱标签</dt><dd>{form.tag}</dd></div><div className="wide"><dt>图谱说明</dt><dd>{form.range}</dd></div></dl></section>
          <section><h3>生成范围</h3><dl>
            <div><dt>图谱模型</dt><dd>{selectedOntology?.name || '未选择'}</dd></div>
            <div><dt>候选数据源</dt><dd>{selectedSources.length} 个</dd></div>
            <div className="wide"><dt>映射涉及数据源</dt><dd>{usedSources.length ? usedSources.map((item) => item.name).join('、') : '暂无'}</dd></div>
            <div><dt>实体类型</dt><dd>{mappedCounts.entities} 个参与 · {Math.max(0, structureCounts.class - mappedCounts.entities)} 个未映射</dd></div>
            <div><dt>关系类型</dt><dd>{mappedCounts.relations} 个参与 · {Math.max(0, structureCounts.relation - mappedCounts.relations)} 个未映射</dd></div>
            <div><dt>数据映射</dt><dd>{mappingsReady ? '已通过检查' : totalMappingCount ? '待完善，请返回数据映射处理' : '待检查'}</dd></div>
          </dl></section>
          <p className="graph-confirm-note graph-confirm-note-mobile"><Icon name="check" size={16}/>{editing ? '保存后' : '生成后'}进入待发布状态，发布后才会对外提供使用。</p>
        </div>}
      </div>
    </main>
    <footer className="graph-create-footer"><div className="graph-create-footer-actions"><Button onClick={leave}>取消</Button>{!dialogMode && <Button disabled={creating} onClick={() => void saveDraft()}>{creating ? '正在保存…' : '保存草稿'}</Button>}</div><div className="graph-create-footer-actions graph-create-footer-primary">{step === steps.length - 1 && <span className="graph-create-footer-note">读取所选数据源并生成待发布图谱</span>}{step > 0 && <Button onClick={() => { setValidationMessage(''); setStep((value) => value - 1) }}>上一步</Button>}{step < steps.length - 1 ? <Button variant="primary" disabled={creating || (step === 3 && checkingDependencies)} onClick={() => void next()}>下一步</Button> : <Button variant="primary" disabled={creating} onClick={() => void submit()}>{creating ? '正在同步并生成…' : '同步并生成图谱'}</Button>}</div></footer>
  </div></div>
}

export function GraphCreatePage() { return <GraphCreateWorkspace/> }

export function GraphCreateDialog({ open, graphId, onClose, onSaved }: { open: boolean; graphId?: string; onClose: () => void; onSaved: (graph: GraphVersion) => void | Promise<void> }) {
  if (!open) return null
  return <GraphCreateWorkspace dialogMode graphId={graphId} onClose={onClose} onSaved={onSaved}/>
}
