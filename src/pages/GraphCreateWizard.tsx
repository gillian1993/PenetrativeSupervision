import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { dataGraphApi, type CreateGraphPayload, type MappingDependencyItem, type MappingItem } from '../dataGraphApi'
import { useOntologyStore, type OntologyElement } from '../ontologyMysqlStore'
import { useAppStore } from '../store'
import type { DataSourceItem, GraphVersion } from '../types'
import { Button, EmptyState, Field, Icon, StatusTag } from '../ui'

const steps = ['基本信息', '选择本体', '选择数据源', '确认构建']
const draftStorageKey = 'graph-create-workspace-draft'
const dependencyLabels: Record<MappingDependencyItem['status'], string> = { ready: '已就绪', missing: '未配置', pending: '待校验', invalid: '已失效', disabled: '未启用' }
const initialForm = (): CreateGraphPayload => ({
  graphCode: `GRAPH-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`,
  graphName: '',
  ontologyId: '',
  sourceIds: [],
  range: `${new Date().getFullYear()}-01-01 至今`,
})

interface GraphDraftState {
  step: number
  form: CreateGraphPayload
}

function loadDraft(): GraphDraftState {
  const fallback = { step: 0, form: initialForm() }
  try {
    const saved = window.sessionStorage.getItem(draftStorageKey)
    if (!saved) return fallback
    const parsed = JSON.parse(saved) as Partial<GraphDraftState>
    const form = parsed.form || fallback.form
    return {
      step: Math.min(3, Math.max(0, Number(parsed.step) || 0)),
      form: { ...fallback.form, ...form, sourceIds: Array.isArray(form.sourceIds) ? form.sourceIds : [] },
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
  const { id: routeGraphId } = useParams()
  const editingGraphId = graphId || routeGraphId
  const editing = Boolean(editingGraphId)
  const setToast = useAppStore((state) => state.setToast)
  const ontologies = useOntologyStore((state) => state.ontologies)
  const loaded = useOntologyStore((state) => state.loaded)
  const loadOntologies = useOntologyStore((state) => state.loadOntologies)
  const [draftSeed] = useState(() => editing || dialogMode ? { step: 0, form: initialForm() } : loadDraft())
  const [step, setStep] = useState(draftSeed.step)
  const [form, setForm] = useState<CreateGraphPayload>(draftSeed.form)
  const [sources, setSources] = useState<DataSourceItem[]>([])
  const [dependencies, setDependencies] = useState<MappingDependencyItem[]>([])
  const [checkingDependencies, setCheckingDependencies] = useState(false)
  const [mappingSourceId, setMappingSourceId] = useState('')
  const [mappingRows, setMappingRows] = useState<MappingItem[]>([])
  const [mappingLoading, setMappingLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editingGraph, setEditingGraph] = useState<GraphVersion | null>(null)

  const publishedOntologies = useMemo(() => ontologies.filter((item) => item.status === '已发布' && item.elements.length > 0), [ontologies])
  const selectedOntology = publishedOntologies.find((item) => item.id === form.ontologyId)
  const selectedSources = sources.filter((item) => form.sourceIds.includes(item.id))
  const enabledSourceKey = sources.filter((item) => item.status === '启用').map((item) => item.id).join('|')
  const dependencyBySource = useMemo(() => new Map(dependencies.map((item) => [item.sourceId, item])), [dependencies])
  const selectedDependencies = form.sourceIds.map((id) => dependencyBySource.get(id)).filter((item): item is MappingDependencyItem => Boolean(item))
  const dependenciesReady = form.sourceIds.length > 0 && selectedDependencies.length === form.sourceIds.length && selectedDependencies.every((item) => item.status === 'ready')
  const totalMappingCount = selectedDependencies.reduce((sum, item) => sum + item.mappingCount, 0)
  const mappingSource = sources.find((item) => item.id === mappingSourceId)
  const mappingDependency = dependencyBySource.get(mappingSourceId)
  const hasDraft = editing ? Boolean(editingGraph) : Boolean(step > 0 || form.graphName.trim() || form.ontologyId || form.sourceIds.length)

  useEffect(() => {
    let active = true
    setLoading(true)
    void Promise.all([loaded ? Promise.resolve() : loadOntologies(), dataGraphApi.listSources(), editing ? dataGraphApi.listGraphs() : Promise.resolve([] as GraphVersion[])])
      .then(([, sourceRows, graphRows]) => {
        if (!active) return
        setSources(sourceRows)
        if (editingGraphId) {
          const graph = graphRows.find((item) => item.id === editingGraphId)
          if (!graph) throw new Error('图谱版本不存在或已被删除')
          if (!['校验中', '待发布', '失败'].includes(graph.status)) throw new Error('已发布或已归档图谱版本不能编辑')
          setEditingGraph(graph)
          setForm({ graphCode: graph.graphCode, graphName: graph.graphName, ontologyId: graph.ontologyId, sourceIds: graph.sourceIds, range: graph.range })
          setStep(0)
        }
      })
      .catch((error) => { setToast(error instanceof Error ? error.message : '图谱配置加载失败'); if (editingGraphId) { if (onClose) onClose(); else navigate('/graphs') } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [editing, editingGraphId, loaded, loadOntologies, navigate, onClose, setToast])

  useEffect(() => {
    if (!editing && !dialogMode) window.sessionStorage.setItem(draftStorageKey, JSON.stringify({ step, form }))
  }, [dialogMode, editing, step, form])

  useEffect(() => {
    if (step !== 2 || !form.ontologyId || !enabledSourceKey) return
    void checkDependencies()
  }, [step, form.ontologyId, enabledSourceKey])

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasDraft) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [hasDraft])

  const checkDependencies = async () => {
    const sourceIds = sources.filter((item) => item.status === '启用').map((item) => item.id)
    if (!form.ontologyId || !sourceIds.length) { setDependencies([]); return }
    setCheckingDependencies(true)
    try {
      const result = await dataGraphApi.checkGraphDependencies({ ontologyId: form.ontologyId, sourceIds })
      setDependencies(result.items)
    } catch (error) {
      setToast(error instanceof Error ? error.message : '公共映射状态检查失败')
    } finally {
      setCheckingDependencies(false)
    }
  }

  const chooseOntology = (ontologyId: string) => {
    setForm((value) => ({ ...value, ontologyId, sourceIds: [] }))
    setDependencies([])
    setMappingSourceId('')
  }

  const toggleSource = (source: DataSourceItem) => {
    if (source.status !== '启用') return
    setForm((value) => ({ ...value, sourceIds: value.sourceIds.includes(source.id) ? value.sourceIds.filter((id) => id !== source.id) : [...value.sourceIds, source.id] }))
  }

  const loadMappingsForSource = async (sourceId: string) => {
    setMappingLoading(true)
    try {
      setMappingRows(await dataGraphApi.mappings(sourceId, undefined, form.ontologyId))
    } catch (error) {
      setToast(error instanceof Error ? error.message : '公共语义映射加载失败')
    } finally {
      setMappingLoading(false)
    }
  }

  const maintainMapping = (sourceId: string) => {
    setMappingSourceId(sourceId)
    void loadMappingsForSource(sourceId)
  }

  const closeMapping = () => {
    setMappingSourceId('')
    setMappingRows([])
    void checkDependencies()
  }

  const generateMappings = async () => {
    if (!mappingSourceId) return
    setMappingLoading(true)
    try {
      await dataGraphApi.parseMetadata(mappingSourceId, form.ontologyId)
      setMappingRows(await dataGraphApi.mappings(mappingSourceId, undefined, form.ontologyId))
      await checkDependencies()
      setToast(`已为 ${mappingSourceId} 生成公共映射建议，请确认后保存并校验`)
    } catch (error) {
      setToast(error instanceof Error ? error.message : '映射建议生成失败')
    } finally {
      setMappingLoading(false)
    }
  }

  const updateTarget = async (row: MappingItem, targetCode: string) => {
    if (!mappingSourceId) return
    try {
      await dataGraphApi.updateMapping(mappingSourceId, row.id, { ontologyId: form.ontologyId, targetCode })
      setMappingRows(await dataGraphApi.mappings(mappingSourceId, undefined, form.ontologyId))
      await checkDependencies()
      setToast('公共映射已更新，保存并校验后才能继续构建')
    } catch (error) {
      setToast(error instanceof Error ? error.message : '公共映射更新失败')
    }
  }

  const validateMapping = async () => {
    if (!mappingSourceId) return
    setMappingLoading(true)
    try {
      const result = await dataGraphApi.validateMappings(mappingSourceId, form.ontologyId)
      await checkDependencies()
      setToast(result.message)
      setMappingSourceId('')
      setMappingRows([])
    } catch (error) {
      setToast(error instanceof Error ? error.message : '公共语义映射校验失败')
    } finally {
      setMappingLoading(false)
    }
  }

  const targetOptions = (row: MappingItem): OntologyElement[] => {
    if (!selectedOntology) return []
    const types = row.type === '属性' ? ['property', 'class'] : row.type === '关系' ? ['relation'] : ['event']
    return selectedOntology.elements.filter((item) => types.includes(item.type))
  }

  const next = () => {
    if (step === 0 && (!form.graphName.trim() || !/^[A-Z0-9_-]{3,64}$/.test(form.graphCode) || !form.range.trim())) { setToast('请填写图谱名称、规范编码和数据范围'); return }
    if (step === 1 && !selectedOntology) { setToast('请选择一个已发布本体版本'); return }
    if (step === 2 && !form.sourceIds.length) { setToast('请至少选择一个已启用数据源'); return }
    if (step === 2 && !dependenciesReady) { const blocked = selectedDependencies.find((item) => item.status !== 'ready'); setToast(blocked?.message || '所选数据源的公共映射尚未就绪'); return }
    setStep((value) => Math.min(steps.length - 1, value + 1))
  }

  const saveDraft = () => {
    window.sessionStorage.setItem(draftStorageKey, JSON.stringify({ step, form }))
    setToast('新建图谱草稿已暂存到当前浏览器')
  }

  const leave = () => {
    const message = dialogMode ? '当前内容尚未保存，确认关闭弹框吗？' : editing ? '当前修改尚未保存，确认返回图谱管理吗？' : '当前新建图谱内容已暂存，确认返回图谱管理吗？'
    if (hasDraft && !window.confirm(message)) return
    if (onClose) onClose(); else navigate('/graphs')
  }

  const submit = async () => {
    setCreating(true)
    try {
      const graph = editingGraphId ? await dataGraphApi.updateGraph(editingGraphId, form) : await dataGraphApi.createGraph(form)
      if (!editing && !dialogMode) window.sessionStorage.removeItem(draftStorageKey)
      setEditingGraph(null)
      setToast(editing ? `图谱版本 ${graph.id} 已重新构建，并绑定 ${graph.mappingVersion}` : `图谱版本 ${graph.id} 已创建，并绑定 ${graph.mappingVersion}`)
      if (onSaved) await onSaved(graph); if (onClose) onClose(); else navigate('/graphs')
    } catch (error) {
      setToast(error instanceof Error ? error.message : editing ? '图谱重新构建失败' : '图谱创建失败')
    } finally {
      setCreating(false)
    }
  }

  const mappingFullscreen = dialogMode && Boolean(mappingSourceId)
  const hostClass = dialogMode ? (mappingFullscreen ? 'graph-create-fullscreen-overlay' : 'graph-create-dialog-overlay') : 'graph-create-route-host'
  return <div className={hostClass} onMouseDown={(event) => { if (dialogMode && !mappingFullscreen && event.target === event.currentTarget) leave() }}><div className={`graph-create-page ${mappingSourceId ? 'mapping-step' : ''} ${dialogMode && !mappingFullscreen ? 'graph-create-dialog' : ''} ${mappingFullscreen ? 'graph-create-mapping-fullscreen' : ''}`} role={dialogMode && !mappingFullscreen ? 'dialog' : undefined} aria-modal={dialogMode && !mappingFullscreen ? true : undefined}>
    <header className="graph-create-header">
      <div><button className="back-button" onClick={leave}>{dialogMode ? '关闭' : '‹ 返回图谱管理'}</button><p className="eyebrow">{editing ? '图谱管理 / 编辑图谱' : '图谱管理 / 新建图谱'}</p><h1>{editing ? '编辑图谱构建配置' : '新建图谱构建任务'}</h1><p>{editing ? `修改 ${editingGraphId} 的本体、数据源和范围，保存后重新构建当前版本。` : '选择本体和数据源，系统自动检查公共映射后生成可发布图谱版本。'}</p></div>
      <div className="graph-create-header-actions">{!editing && !dialogMode && <Button onClick={saveDraft}>保存草稿</Button>}<Button onClick={leave}>{dialogMode ? '关闭' : '退出'}</Button></div>
    </header>
    <div className="graph-create-progress"><div className="step-indicator graph-wizard-steps">{steps.map((item, index) => <span className={index === step ? 'active' : index < step ? 'done' : ''} key={item}>{index + 1} {item}</span>)}</div></div>
    <main className="graph-create-main">
      <div className={`graph-create-content ${mappingSourceId ? 'mapping-mode' : ''}`}>
        {loading && <div className="loading-state graph-create-loading"><i/><span>正在加载配置…</span></div>}
        {!loading && step === 0 && <div className="form-section two-column"><Field label="图谱名称 *"><input value={form.graphName} onChange={(event) => setForm({ ...form, graphName: event.target.value })} placeholder="例如：采购监管图谱"/></Field><Field label="图谱编码 *"><input value={form.graphCode} onChange={(event) => setForm({ ...form, graphCode: event.target.value.toUpperCase() })} placeholder="例如：PROCUREMENT_RISK"/></Field><Field label="数据范围 *"><textarea value={form.range} onChange={(event) => setForm({ ...form, range: event.target.value })}/></Field><Field label="版本编号"><input value={editing ? `${editingGraphId}（保存后重新构建）` : '系统自动生成图谱版本号'} disabled/></Field></div>}
        {!loading && step === 1 && <div className="wizard-choice-grid">{publishedOntologies.length ? publishedOntologies.map((ontology) => <button className={form.ontologyId === ontology.id ? 'selected' : ''} onClick={() => chooseOntology(ontology.id)} key={ontology.id}><Icon name="graph"/><div><strong>{ontology.name}</strong><span>{ontology.version} · {ontology.domain}</span><small>{ontology.id} · 类{ontology.classes} / 属性{ontology.properties} / 关系{ontology.relations} / 事件{ontology.events}</small></div><StatusTag>{ontology.status}</StatusTag></button>) : <EmptyState title="暂无已发布本体" description="请先在本体管理中完成本体校验和发布。"/>}</div>}
        {!loading && step === 2 && !mappingSourceId && <><div className="wizard-source-grid">{sources.map((source) => { const dependency = dependencyBySource.get(source.id); return <label className={`${form.sourceIds.includes(source.id) ? 'selected' : ''} ${source.status !== '启用' ? 'disabled' : ''}`} key={source.id}><input type="checkbox" disabled={source.status !== '启用'} checked={form.sourceIds.includes(source.id)} onChange={() => toggleSource(source)}/><div><strong>{source.name}</strong><span>{source.id} · {source.mode} · {source.syncMode}</span><small>{source.range}</small></div><div className="source-readiness"><StatusTag>{source.status}</StatusTag>{source.status === '启用' && <small className={dependency?.status === 'ready' ? 'ready' : 'blocked'}>{checkingDependencies ? '检查中' : dependency ? dependencyLabels[dependency.status] : '待检查'}</small>}</div></label> })}</div><section className="dependency-check-panel"><header><div><strong>公共映射自动检查</strong><span>图谱只引用已校验的公共映射，正常情况下无需重复维护。</span></div><Button onClick={() => void checkDependencies()} disabled={checkingDependencies}>{checkingDependencies ? '检查中…' : '重新检查'}</Button></header>{selectedSources.length ? <div className="dependency-list">{selectedSources.map((source) => { const dependency = dependencyBySource.get(source.id); return <article key={source.id}><div><strong>{source.name}</strong><span>{dependency ? `公共映射 R${dependency.revision} · ${dependency.mappingCount} 条` : '正在获取公共映射状态'}</span></div><StatusTag>{dependency ? dependencyLabels[dependency.status] : '检查中'}</StatusTag><small>{dependency?.message || '请稍候'}</small>{dependency && dependency.status !== 'ready' && <Button variant="primary" onClick={() => maintainMapping(source.id)}>维护公共映射</Button>}</article> })}</div> : <EmptyState title="请选择数据源" description="选择后系统会自动检查该数据源与当前本体的公共映射。"/>}</section></>}
        {!loading && step === 2 && mappingSourceId && <><div className="mapping-public-warning"><Icon name="warning"/><div><strong>正在维护公共语义映射</strong><span>当前修改会同步到“{mappingSource?.name} + {selectedOntology?.name}”的公共映射，并影响后续使用该映射的新图谱。</span></div><Button onClick={closeMapping}>返回数据源选择</Button></div><section className="mapping-workbench-summary"><div><span>数据源</span><strong>{mappingSource?.name}</strong><small>{mappingSourceId}</small></div><div><span>当前本体</span><strong>{selectedOntology?.name} {selectedOntology?.version}</strong><small>{selectedOntology?.id}</small></div><div><span>公共映射</span><strong>R{mappingRows[0]?.revision || mappingDependency?.revision || 1}</strong><small>{mappingRows[0]?.setStatus || dependencyLabels[mappingDependency?.status || 'pending']} · 最近校验 {mappingRows[0]?.lastValidatedAt || mappingDependency?.lastValidatedAt || '—'}</small></div></section>{mappingLoading ? <div className="loading-state graph-create-loading"><i/><span>正在加载公共映射…</span></div> : mappingRows.length ? <div className="wizard-mapping-list"><section><header><div><strong>{mappingSource?.name}</strong><span>{mappingRows.length} 条公共映射 · 修改后需要重新校验</span></div><Button variant="primary" onClick={() => void validateMapping()}>保存并校验</Button></header><div className="table-container mapping-table-container"><table><thead><tr><th>类型</th><th>来源字段</th><th>转换与识别规则</th><th>目标本体元素</th><th>状态</th></tr></thead><tbody>{mappingRows.map((row) => <tr key={row.id}><td><StatusTag>{row.type}</StatusTag></td><td><strong>{row.sourceField}</strong></td><td>{row.transform}</td><td><select value={row.targetCode} onChange={(event) => void updateTarget(row, event.target.value)}>{targetOptions(row).map((item) => <option value={item.code} key={item.code}>{item.name} · {item.code}</option>)}</select></td><td><StatusTag>{row.status}</StatusTag></td></tr>)}</tbody></table></div></section></div> : <EmptyState title="尚未配置公共映射" description="读取数据源元数据，并基于当前本体生成可复用的公共映射建议。" action={<Button variant="primary" onClick={() => void generateMappings()}>生成映射建议</Button>}/>}</>}
        {!loading && step === 3 && <div className="wizard-confirm-grid"><article><span>图谱</span><strong>{form.graphName}</strong><small>{form.graphCode}</small></article><article><span>本体版本</span><strong>{selectedOntology?.name}</strong><small>{selectedOntology?.version} · {selectedOntology?.id}</small></article><article><span>数据源</span><strong>{selectedSources.length} 个</strong><small>{selectedSources.map((item) => item.name).join('、')}</small></article><article><span>公共映射快照</span><strong>{totalMappingCount} 条</strong><small>{selectedDependencies.map((item) => `${item.sourceId}:R${item.revision}`).join(' / ')}</small></article><article className="wide"><span>数据范围</span><strong>{form.range}</strong><small>构建时保存公共映射快照，后续映射修改不会影响当前图谱版本。</small></article></div>}
      </div>
    </main>
    <footer className="graph-create-footer"><div><span>步骤 {step + 1} / {steps.length}</span><strong>{mappingSourceId ? '维护公共映射' : steps[step]}</strong></div><div>{mappingSourceId ? <><Button onClick={closeMapping}>返回数据源选择</Button>{mappingRows.length ? <Button variant="primary" disabled={mappingLoading} onClick={() => void validateMapping()}>保存并校验</Button> : <Button variant="primary" disabled={mappingLoading} onClick={() => void generateMappings()}>生成映射建议</Button>}</> : <>{!editing && !dialogMode && <Button onClick={saveDraft}>保存草稿</Button>}{step > 0 && <Button onClick={() => setStep((value) => value - 1)}>上一步</Button>}{step < steps.length - 1 ? <Button variant="primary" disabled={step === 2 && checkingDependencies} onClick={next}>下一步</Button> : <Button variant="primary" disabled={creating} onClick={() => void submit()}>{creating ? (editing ? '正在重新构建…' : '正在构建…') : (editing ? '保存并重新构建' : '构建图谱版本')}</Button>}</>}</div></footer>
  </div></div>
}

export function GraphCreatePage() { return <GraphCreateWorkspace/> }

export function GraphCreateDialog({ open, graphId, onClose, onSaved }: { open: boolean; graphId?: string; onClose: () => void; onSaved: (graph: GraphVersion) => void | Promise<void> }) {
  if (!open) return null
  return <GraphCreateWorkspace dialogMode graphId={graphId} onClose={onClose} onSaved={onSaved}/>
}
