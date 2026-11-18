import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { dataGraphApi, type AutoMappingPreview, type MappingItem, type SourceMetadataItem } from '../dataGraphApi'
import { useAppStore } from '../store'
import type { DataSourceItem, GraphStructureElement, GraphStructureElementType } from '../types'
import { Button, Drawer, EmptyState, Field, Icon, Modal, StatusTag, Tabs } from '../ui'
import { entityConfigurationIssue, propertyMappingAvailable, mappingGroup, relationConfiguration, relationConfigurationIssue, type MappingConfig, type RelationConfiguration } from '../../graphMappingConfig'
import { EntitySourcesConfig } from './EntitySourcesConfig'
import { RelationMappingConfig } from './RelationMappingConfig'

type MappingMode = 'entity' | 'relations'
type MappingFilter = 'all' | 'mapped' | 'unmapped'
type MappingTab = 'entityTypes' | 'properties' | 'relations'
type StructureEditorState = { type: GraphStructureElementType; target?: GraphStructureElement }

interface GraphMappingPanelProps {
  ontologyId: string
  ontologyName: string
  ontologyStatus?: string
  ontologyElements: GraphStructureElement[]
  allowedSourceIds?: string[]
  graphId?: string
  onElementsChange?: (elements: GraphStructureElement[]) => void
  onSavingChange?: (saving: boolean) => void
}

const mappingKindLabel: Record<MappingTab, string> = { entityTypes: '实体类型映射', properties: '属性映射', relations: '关系映射' }
const structureTypeLabel: Record<GraphStructureElementType, string> = { class: '实体类型', property: '属性字段', relation: '关系类型' }
const targetMappingType: Record<MappingTab, MappingItem['type']> = { entityTypes: '实体类型', properties: '属性', relations: '关系' }
const unique = (values: string[]) => [...new Set(values.map((item) => item.trim()).filter(Boolean))]
const requiredProperty = (target: GraphStructureElement) => /必填|主标识/.test(target.constraint || '')
const mappingErrorMessage = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : ''
  return /failed to fetch|networkerror|network request/i.test(message) ? fallback : message || fallback
}

export function GraphMappingPanel({ ontologyId, ontologyName, ontologyStatus, ontologyElements, allowedSourceIds, graphId, onElementsChange, onSavingChange }: GraphMappingPanelProps) {
  const navigate = useNavigate()
  const setToast = useAppStore((state) => state.setToast)
  const [sources, setSources] = useState<DataSourceItem[]>([])
  const [metadataBySource, setMetadataBySource] = useState<Record<string, SourceMetadataItem[]>>({})
  const [mappingsBySource, setMappingsBySource] = useState<Record<string, MappingItem[]>>({})
  const [loadingSources, setLoadingSources] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [mode, setMode] = useState<MappingMode>('entity')
  const [filter, setFilter] = useState<MappingFilter>('all')
  const [autoPreview, setAutoPreview] = useState<AutoMappingPreview | null>(null)
  const [autoLoading, setAutoLoading] = useState(false)
  const [autoApplying, setAutoApplying] = useState(false)
  const [selectedEntityCode, setSelectedEntityCode] = useState('')
  const [selectedRelationCode, setSelectedRelationCode] = useState('')
  const [typeKeyword, setTypeKeyword] = useState('')
  const [savingKey, setSavingKey] = useState('')
  const [pendingConfig, setPendingConfig] = useState(false)
  useEffect(() => { onSavingChange?.(Boolean(savingKey) || pendingConfig || autoApplying) }, [savingKey, pendingConfig, autoApplying, onSavingChange])
  useEffect(() => () => onSavingChange?.(false), [onSavingChange])
  const [structureEditor, setStructureEditor] = useState<StructureEditorState | null>(null)
  const [elementForm, setElementForm] = useState<Omit<GraphStructureElement, 'id'>>({ type: 'class', code: '', name: '', ownerCode: '', targetCode: '', dataType: '实体类型', constraint: '', description: '', sourceType: 'custom' })

  const allowedSourceKey = allowedSourceIds?.join('|') || ''
  const eligibleSources = useMemo(() => sources.filter((item) => !allowedSourceIds || allowedSourceIds.includes(item.id)), [allowedSourceKey, allowedSourceIds, sources])
  const enabledEligibleSources = eligibleSources.filter((item) => item.status === '启用')
  const allMappings = eligibleSources.flatMap((source) => mappingsBySource[source.id] || [])
  const mappingIndex = new Map(allMappings.map((row) => [`${row.sourceId}|${row.type}|${row.targetCode}|${mappingGroup(row)}`, row]))
  const sourceMapping = (sourceId: string, type: MappingItem['type'], code: string, groupId = '') => mappingIndex.get(`${sourceId}|${type}|${code}|${groupId}`) || null
  const targetEntityTypes = useMemo(() => ontologyElements.filter((item) => item.type === 'class'), [ontologyElements])
  const targetProperties = useMemo(() => ontologyElements.filter((item) => item.type === 'property'), [ontologyElements])
  const targetRelations = useMemo(() => ontologyElements.filter((item) => item.type === 'relation'), [ontologyElements])
  const entityTypeMappings = allMappings.filter((row) => row.type === '实体类型')
  const relationMappings = allMappings.filter((row) => row.type === '关系')
  const relationByTarget = new Map([...relationMappings].reverse().map((row) => [row.targetCode, row]))
  const activeEntityType = targetEntityTypes.find((item) => item.code === selectedEntityCode) || targetEntityTypes[0] || null
  const activeRelation = targetRelations.find((item) => item.code === selectedRelationCode) || targetRelations[0] || null
  const activeRelationMapping = activeRelation ? relationByTarget.get(activeRelation.code) || null : null
  const activeEntityProperties = activeEntityType ? targetProperties.filter((item) => item.ownerCode === activeEntityType.code) : []
  const hasValidPropertyMapping = (property: GraphStructureElement) => entityTypeMappings.some((entity) => {
    if (entity.targetCode !== property.ownerCode || !enabledEligibleSources.some((source) => source.id === entity.sourceId)) return false
    return propertyMappingAvailable(entity, sourceMapping(entity.sourceId, '属性', property.code, mappingGroup(entity)), metadataBySource[entity.sourceId] || [])
  })
  const availableEntityCodes = unique(entityTypeMappings.filter((entity) => enabledEligibleSources.some((source) => source.id === entity.sourceId) && !entityConfigurationIssue(entity, metadataBySource[entity.sourceId] || [])).map((entity) => entity.targetCode))
  const availablePropertyCodes = targetProperties.filter(hasValidPropertyMapping).map((property) => property.code)
  const relationMappingStatus = (mapping: MappingItem | null) => {
    if (!mapping) return '未配置'
    if (!enabledEligibleSources.some((source) => source.id === mapping.sourceId)) return '待补全'
    if (mapping.status === '待检查') return '待补全'
    const relation = targetRelations.find((item) => item.code === mapping.targetCode)
    if (!relation) return '需调整'
    return relationConfigurationIssue(relationConfiguration(mapping, relation), relation, ontologyElements, availableEntityCodes, availablePropertyCodes, metadataBySource[mapping.sourceId] || []) ? '待补全' : '已配置'
  }
  const entityMappingStatus = (target: GraphStructureElement) => {
    const mappings = entityTypeMappings.filter((row) => row.targetCode === target.code)
    if (!mappings.length) return '未配置'
    if (mappings.some((mapping) => eligibleSources.find((source) => source.id === mapping.sourceId)?.status !== '启用')) return '待补全'
    if (mappings.some((mapping) => entityConfigurationIssue(mapping, metadataBySource[mapping.sourceId] || []))) return '待补全'
    if (mappings.some((mapping) => targetProperties.some((property) => property.ownerCode === target.code && sourceMapping(mapping.sourceId, '属性', property.code, mappingGroup(mapping)) && !propertyMappingAvailable(mapping, sourceMapping(mapping.sourceId, '属性', property.code, mappingGroup(mapping)), metadataBySource[mapping.sourceId] || [])))) return '待补全'
    const requiredProperties = targetProperties.filter((item) => item.ownerCode === target.code && requiredProperty(item))
    const hasMissingRequired = requiredProperties.some((property) => {
      return !mappings.some((mapping) => {
        const propertyMapping = sourceMapping(mapping.sourceId, '属性', property.code, mappingGroup(mapping))
        return propertyMappingAvailable(mapping, propertyMapping, metadataBySource[mapping.sourceId] || [])
      })
    })
    return hasMissingRequired ? '待补全' : '已配置'
  }
  const configuredEntityTypeCount = targetEntityTypes.filter((item) => entityMappingStatus(item) === '已配置').length
  const configuredRelationCount = targetRelations.filter((item) => relationMappingStatus(relationByTarget.get(item.code) || null) === '已配置').length
  const visibleEntityTypes = targetEntityTypes.filter((item) => `${item.name} ${item.code}`.toLowerCase().includes(typeKeyword.trim().toLowerCase()) && (filter === 'all' || (entityMappingStatus(item) === '已配置') === (filter === 'mapped')))
  const visibleRelations = targetRelations.filter((item) => {
    const owner = ontologyElements.find((element) => element.type === 'class' && element.code === item.ownerCode)?.name || item.ownerCode
    const target = ontologyElements.find((element) => element.type === 'class' && element.code === item.targetCode)?.name || item.targetCode
    return `${owner} ${target} ${item.code}`.toLowerCase().includes(typeKeyword.trim().toLowerCase()) && (filter === 'all' || (relationMappingStatus(relationByTarget.get(item.code) || null) === '已配置') === (filter === 'mapped'))
  })

  useEffect(() => {
    let active = true
    setLoadingSources(true)
    void dataGraphApi.listSources().then((rows) => {
      if (!active) return
      setSources(rows)
    }).catch((error) => {
      setToast(mappingErrorMessage(error, '数据源加载失败，请稍后重试'))
    }).finally(() => {
      if (active) setLoadingSources(false)
    })
    return () => { active = false }
  }, [allowedSourceKey, ontologyId, setToast])

  useEffect(() => {
    if (!eligibleSources.length) {
      setMetadataBySource({})
      setMappingsBySource({})
      return
    }
    let active = true
    setLoadingDetail(true)
    void Promise.all(eligibleSources.map(async (source) => {
      const [metadataResult, mappingResult] = await Promise.allSettled([dataGraphApi.metadata(source.id), dataGraphApi.mappings(source.id, undefined, ontologyId, graphId)])
      let metadataRows = metadataResult.status === 'fulfilled' ? metadataResult.value : []
      let mappingRows = mappingResult.status === 'fulfilled' ? mappingResult.value : []
      let failed = metadataResult.status === 'rejected' || mappingResult.status === 'rejected'
      if (!failed && !metadataRows.length) {
        try {
          metadataRows = await dataGraphApi.parseMetadata(source.id, ontologyId)
          mappingRows = await dataGraphApi.mappings(source.id, undefined, ontologyId, graphId)
        } catch { failed = true }
      }
      return { sourceId: source.id, metadataRows, mappingRows, failed }
    })).then((results) => {
      if (!active) return
      setMetadataBySource(Object.fromEntries(results.map((item) => [item.sourceId, item.metadataRows])))
      setMappingsBySource(Object.fromEntries(results.map((item) => [item.sourceId, item.mappingRows])))
      if (results.some((item) => item.failed)) setToast('部分数据源的映射信息加载失败，请检查数据源接入配置')
    }).finally(() => {
      if (active) setLoadingDetail(false)
    })
    return () => { active = false }
  }, [eligibleSources, graphId, ontologyId, setToast])

  useEffect(() => {
    if (!targetEntityTypes.some((item) => item.code === selectedEntityCode)) setSelectedEntityCode(targetEntityTypes[0]?.code || '')
  }, [selectedEntityCode, targetEntityTypes])

  useEffect(() => {
    if (!targetRelations.some((item) => item.code === selectedRelationCode)) setSelectedRelationCode(targetRelations[0]?.code || '')
  }, [selectedRelationCode, targetRelations])

  const saveInlineMapping = async (sourceId: string, tab: MappingTab, target: GraphStructureElement, sourceField: string, transform: string, config?: MappingConfig, groupId = '') => {
    if (!sourceId || !sourceField.trim() || !transform.trim()) return false
    const mapping = sourceMapping(sourceId, targetMappingType[tab], target.code, groupId)
    const key = `${sourceId}:${tab}:${target.code}`
    setSavingKey(key)
    try {
      if (mapping) await dataGraphApi.updateMapping(sourceId, mapping.id, { ontologyId, targetCode: target.code, targetType: target.type, sourceField: sourceField.trim(), transform: transform.trim(), config }, graphId)
      else await dataGraphApi.createMapping(sourceId, { ontologyId, targetCode: target.code, targetType: target.type, sourceField: sourceField.trim(), transform: transform.trim(), config, groupId, type: targetMappingType[tab] }, graphId)
      await refreshAllMappings()
      setToast(`${mappingKindLabel[tab]}已保存`)
      return true
    } catch (error) {
      setToast(mappingErrorMessage(error, '数据映射保存失败，请稍后重试'))
      return false
    } finally {
      setSavingKey('')
    }
  }

  const refreshMappings = async (sourceId: string) => {
    const rows = await dataGraphApi.mappings(sourceId, undefined, ontologyId, graphId)
    setMappingsBySource((current) => ({ ...current, [sourceId]: rows }))
  }
  const refreshAllMappings = async () => {
    const entries = await Promise.all(eligibleSources.map(async (source) => [source.id, await dataGraphApi.mappings(source.id, undefined, ontologyId, graphId)] as const))
    setMappingsBySource(Object.fromEntries(entries))
  }

  const autoMappingPayload = () => ({ ontologyId, sourceIds: eligibleSources.map((source) => source.id), structureElements: ontologyElements, graphId })
  const previewAutoMapping = async () => {
    setAutoLoading(true)
    try {
      const preview = await dataGraphApi.previewAutoMapping(autoMappingPayload())
      if (!preview.entities.length && !preview.relations.length) { setToast(enabledEligibleSources.length ? '暂无可自动映射的项目，请在右侧手动配置' : '候选数据源均未启用，请先选择可用数据源'); return }
      setAutoPreview(preview)
    } catch (error) {
      setToast(mappingErrorMessage(error, '自动映射建议生成失败，请稍后重试'))
    } finally {
      setAutoLoading(false)
    }
  }

  const applyAutoMapping = async () => {
    if (autoApplying || !autoPreview) return
    setAutoApplying(true)
    try {
      const result = await dataGraphApi.applyAutoMapping(autoMappingPayload())
      const refreshed = await Promise.all(eligibleSources.map(async (source) => [source.id, await dataGraphApi.mappings(source.id, undefined, ontologyId, graphId)] as const))
      setMappingsBySource(Object.fromEntries(refreshed))
      const nextEntity = targetEntityTypes.find((item) => entityMappingStatus(item) !== '已配置' && !autoPreview.entities.some((proposal) => proposal.targetCode === item.code))
      const nextRelation = targetRelations.find((item) => relationMappingStatus(relationByTarget.get(item.code) || null) !== '已配置' && !autoPreview.relations.some((proposal) => proposal.targetCode === item.code))
      if (nextEntity) setSelectedEntityCode(nextEntity.code)
      if (nextRelation) setSelectedRelationCode(nextRelation.code)
      setAutoPreview(null)
      setFilter('unmapped')
      setToast(`已映射 ${result.entities} 个实体类型、${result.relations} 个关系类型`)
    } catch (error) {
      setToast(mappingErrorMessage(error, '自动映射未完成，请稍后重试'))
    } finally {
      setAutoApplying(false)
    }
  }

  const removeMapping = async (mapping: MappingItem | null | undefined, label: string, confirmText?: string) => {
    if (!mapping) return
    if (!window.confirm(confirmText || `确认移除${label}吗？`)) return
    setSavingKey(`delete:${mapping.id}`)
    try {
      await dataGraphApi.deleteMapping(mapping.sourceId, mapping.id, ontologyId, graphId)
      await refreshAllMappings()
      setToast(`${label}已移除`)
    } catch (error) {
      setToast(mappingErrorMessage(error, '映射规则移除失败，请稍后重试'))
    } finally {
      setSavingKey('')
    }
  }

  const saveRelationRule = async (sourceId: string, config: RelationConfiguration) => {
    if (!activeRelation || !sourceId) return false
    setSavingKey(`relation:${activeRelation.code}`)
    try {
      const sourceField = config.origin.kind === 'table' ? config.origin.table : config.origin.entityCode
      await dataGraphApi.createMapping(sourceId, { ontologyId, targetCode: activeRelation.code, targetType: 'relation', sourceField, transform: '关联方式：统一字段映射', config: { relation: config }, type: '关系' }, graphId)
      for (const previous of relationMappings.filter((item) => item.targetCode === activeRelation.code && item.sourceId !== sourceId)) await dataGraphApi.deleteMapping(previous.sourceId, previous.id, ontologyId, graphId)
      await refreshAllMappings()
      setToast('关系映射已保存')
      return true
    } catch (error) {
      setToast(mappingErrorMessage(error, '关系映射保存失败，请稍后重试'))
      return false
    } finally { setSavingKey('') }
  }

  const removeEntitySourceMapping = async (mapping: MappingItem) => {
    if (!activeEntityType || !window.confirm(`确认移除${activeEntityType.name}在当前数据源的映射吗？该来源下的属性映射也会移除。`)) return
    const properties = activeEntityProperties.map((property) => sourceMapping(mapping.sourceId, '属性', property.code, mappingGroup(mapping))).filter((item): item is MappingItem => Boolean(item))
    setSavingKey(`delete:${mapping.id}`)
    try {
      for (const property of properties) await dataGraphApi.deleteMapping(mapping.sourceId, property.id, ontologyId, graphId)
      await dataGraphApi.deleteMapping(mapping.sourceId, mapping.id, ontologyId, graphId)
      await refreshAllMappings()
      setToast('来源映射已移除')
    } catch (error) {
      await refreshMappings(mapping.sourceId)
      setToast(mappingErrorMessage(error, '来源映射移除失败，请稍后重试'))
    } finally {
      setSavingKey('')
    }
  }

  const relationEndpoint = (relation: GraphStructureElement) => {
    const owner = ontologyElements.find((item) => item.type === 'class' && item.code === relation.ownerCode)
    const target = ontologyElements.find((item) => item.type === 'class' && item.code === relation.targetCode)
    return `${owner?.name || relation.ownerCode || '起点实体类型'} → ${target?.name || relation.targetCode || '终点实体类型'}`
  }

  const entityTypeName = (code?: string) => ontologyElements.find((item) => item.type === 'class' && item.code === code)?.name || code || '未指定'
  const mappingListStatus = (target: GraphStructureElement, mapping: MappingItem | null, tab: 'entityTypes' | 'relations') => {
    const status = tab === 'entityTypes' ? entityMappingStatus(target) : relationMappingStatus(mapping)
    return status === '已配置' ? '已映射' : status === '未配置' ? '未映射' : '待检查'
  }

  const focusEntity = (code: string) => {
    if (!code) return
    setMode('entity')
    setSelectedEntityCode(code)
  }

  const changeFilter = (value: MappingFilter) => {
    setFilter(value)
    const entity = targetEntityTypes.find((item) => value === 'all' || (entityMappingStatus(item) === '已配置') === (value === 'mapped'))
    const relation = targetRelations.find((item) => value === 'all' || (relationMappingStatus(relationByTarget.get(item.code) || null) === '已配置') === (value === 'mapped'))
    if (entity) setSelectedEntityCode(entity.code)
    if (relation) setSelectedRelationCode(relation.code)
  }

  const renderListFilter = () => <div className="mapping-list-filter" role="group" aria-label="映射筛选">{([['all', '全部'], ['unmapped', '未映射'], ['mapped', '已映射']] as const).map(([value, label]) => <button type="button" className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => changeFilter(value)} key={value}>{label}</button>)}</div>

  const entityName = (code = '') => targetEntityTypes.find((item) => item.code === code)?.name || code || '未选择'
  const relationSuggestion = (ownerCode: string, targetCode: string, excludeId = '') => {
    if (!ownerCode || !targetCode) return { code: '', name: '' }
    const namespace = ownerCode.includes('.') ? ownerCode.slice(0, ownerCode.lastIndexOf('.')) : 'GRAPH'
    const segment = (code: string) => (code.split('.').pop() || code).replace(/[^A-Za-z0-9_]/g, '_')
    const base = `${namespace}.${segment(ownerCode)}_to_${segment(targetCode)}`
    const existing = new Set(ontologyElements.filter((element) => element.id !== excludeId).map((element) => element.code))
    let code = base
    let index = 2
    while (existing.has(code)) code = `${base}_${index++}`
    return { code, name: `${entityName(ownerCode)}关联${entityName(targetCode)}` }
  }

  const openStructureEditor = (type: GraphStructureElementType, target?: GraphStructureElement, defaults: Partial<GraphStructureElement> = {}) => {
    const ownerCode = type === 'class' ? '' : defaults.ownerCode || target?.ownerCode || activeEntityType?.code || targetEntityTypes[0]?.code || ''
    const targetCode = type === 'relation' ? defaults.targetCode || target?.targetCode || targetEntityTypes.find((item) => item.code !== ownerCode)?.code || ownerCode : ''
    const suggestion = type === 'relation' && !target ? relationSuggestion(ownerCode, targetCode) : { code: '', name: '' }
    setStructureEditor({ type, target })
    setElementForm(target ? { type: target.type, code: target.code, name: target.name, ownerCode: target.ownerCode || '', targetCode: target.targetCode || '', dataType: target.dataType || (target.type === 'class' ? '实体类型' : '文本'), constraint: target.constraint || '', description: target.description || '', sourceType: target.sourceType || 'model' } : {
      type,
      code: type === 'property' && ownerCode ? `${ownerCode}.` : type === 'relation' ? suggestion.code : '',
      name: type === 'relation' ? suggestion.name : '',
      ownerCode,
      targetCode,
      dataType: type === 'class' ? '实体类型' : type === 'property' ? '文本' : ownerCode && targetCode ? `${entityName(ownerCode)} → ${entityName(targetCode)}` : '实体类型 → 实体类型',
      constraint: '',
      description: '',
      sourceType: 'custom',
    })
  }

  const updateElementForm = (patch: Partial<Omit<GraphStructureElement, 'id'>>) => {
    const next = { ...elementForm, ...patch }
    if (next.type === 'relation') {
      const suggestion = relationSuggestion(next.ownerCode || '', next.targetCode || '', structureEditor?.target?.id)
      if (!structureEditor?.target && (patch.ownerCode || patch.targetCode)) {
        next.code = suggestion.code
        next.name = suggestion.name
      }
      next.dataType = `${entityName(next.ownerCode)} → ${entityName(next.targetCode)}`
    }
    setElementForm(next)
  }

  const saveStructureElement = () => {
    if (!structureEditor) return
    const code = elementForm.code.trim()
    const name = elementForm.name.trim()
    if (!code || !name) { setToast('请填写名称和编码'); return }
    if (elementForm.type !== 'class' && !elementForm.ownerCode) { setToast('请选择所属实体类型'); return }
    if (elementForm.type === 'relation' && !elementForm.targetCode) { setToast('请选择终点实体类型'); return }
    if (ontologyElements.some((item) => item.code === code && item.id !== structureEditor.target?.id)) { setToast(`编码 ${code} 已存在，请调整后保存`); return }
    const current: GraphStructureElement = {
      id: structureEditor.target?.id || `GEL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type: elementForm.type,
      code,
      name,
      ownerCode: elementForm.type === 'class' ? '' : elementForm.ownerCode || '',
      targetCode: elementForm.type === 'relation' ? elementForm.targetCode || '' : '',
      dataType: elementForm.type === 'class' ? '实体类型' : elementForm.type === 'relation' ? `${entityName(elementForm.ownerCode)} → ${entityName(elementForm.targetCode)}` : elementForm.dataType || '文本',
      constraint: elementForm.type === 'relation' ? '' : elementForm.constraint || '',
      description: elementForm.description || '',
      sourceType: structureEditor.target?.sourceType === 'model' ? 'modified' : elementForm.sourceType || 'custom',
    }
    const nextElements = structureEditor.target ? ontologyElements.map((item) => item.id === structureEditor.target?.id ? current : item) : [...ontologyElements, current]
    onElementsChange?.(nextElements)
    if (current.type === 'class') setSelectedEntityCode(current.code)
    if (current.type === 'relation') setSelectedRelationCode(current.code)
    setStructureEditor(null)
    setToast(`${structureTypeLabel[current.type]}已保存到当前图谱结构`)
  }

  const removeStructureElement = (element: GraphStructureElement) => {
    const related = ontologyElements.filter((item) => element.type === 'class' && item.id !== element.id && (item.ownerCode === element.code || item.targetCode === element.code))
    const confirmText = related.length ? `确认从当前图谱结构移除 ${element.name} 以及 ${related.length} 个关联属性/关系吗？图谱模型不会受影响。` : `确认从当前图谱结构移除 ${element.name} 吗？图谱模型不会受影响。`
    if (!window.confirm(confirmText)) return
    onElementsChange?.(ontologyElements.filter((item) => item.id !== element.id && !related.some((target) => target.id === item.id)))
    setToast(`${element.name}已从当前图谱结构移除`)
  }

  const renderStructureActions = (target: GraphStructureElement, type: 'class' | 'relation') => <div className="mapping-structure-actions"><details className="mapping-structure-menu"><summary className="mapping-structure-icon" title="更多操作" aria-label={`${target.name}更多操作`}><Icon name="more" size={16}/></summary><div><button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); openStructureEditor(type, target) }}><Icon name="edit" size={14}/>编辑</button><button type="button" className="danger-link" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); removeStructureElement(target) }}><Icon name="trash" size={14}/>移除</button></div></details></div>

  const renderEntityMapping = () => {
    if (!activeEntityType) return <EmptyState title="暂无实体类型" description="先新增实体类型，再配置来源表。" action={<Button variant="primary" icon="plus" onClick={() => openStructureEditor('class')}>新增实体类型</Button>}/>
    return <div className="mapping-config-layout">
      <aside className="mapping-type-list"><header className="mapping-type-list-header"><div><h3>实体类型</h3><small>共 {targetEntityTypes.length} 项</small></div><button type="button" className="mapping-structure-icon" title="新增实体类型" aria-label="新增实体类型" onClick={() => openStructureEditor('class')}><Icon name="plus" size={16}/></button></header><label className="mapping-type-search"><Icon name="search" size={14}/><input value={typeKeyword} onChange={(event) => setTypeKeyword(event.target.value)} placeholder="搜索实体类型" aria-label="搜索实体类型"/></label>{renderListFilter()}<div className="mapping-type-items">{visibleEntityTypes.map((target) => <div className={`mapping-type-item${target.code === activeEntityType.code ? ' active' : ''}`} key={target.id}><button type="button" className="mapping-type-select" onClick={() => focusEntity(target.code)}><Icon name="file" size={16}/><span><strong>{target.name}</strong><small>{target.code}</small></span><StatusTag>{mappingListStatus(target, null, 'entityTypes')}</StatusTag></button>{renderStructureActions(target, 'class')}</div>)}{!visibleEntityTypes.length && <p className="mapping-list-empty">未找到匹配的实体类型</p>}</div></aside>
      <EntitySourcesConfig key={activeEntityType.code} entity={activeEntityType} properties={activeEntityProperties} mappings={allMappings} sources={eligibleSources} metadata={metadataBySource} disabled={Boolean(savingKey) || autoApplying} onSave={saveInlineMapping} onRemove={(mapping, label) => void removeMapping(mapping, label)} onRemoveSource={(mapping) => void removeEntitySourceMapping(mapping)} onAddProperty={() => openStructureEditor('property', undefined, { ownerCode: activeEntityType.code })} onPendingChange={setPendingConfig}/>
    </div>
  }

  const renderRelationMapping = () => {
    if (!activeRelation) return <EmptyState title="暂无关系类型" description="请先在当前图谱结构中补充关系类型。"/>
    return <div className="mapping-config-layout">
      <aside className="mapping-type-list relation-type-list">
        <header className="mapping-type-list-header"><div><h3>关系类型</h3><small>共 {targetRelations.length} 项</small></div><button type="button" className="mapping-structure-icon" title="新增关系类型" aria-label="新增关系类型" onClick={() => openStructureEditor('relation', undefined, { ownerCode: activeRelation.ownerCode })}><Icon name="plus" size={16}/></button></header>
        <label className="mapping-type-search"><Icon name="search" size={14}/><input value={typeKeyword} onChange={(event) => setTypeKeyword(event.target.value)} placeholder="搜索关系类型" aria-label="搜索关系类型"/></label>
        {renderListFilter()}
        <div className="mapping-type-items">{visibleRelations.map((target) => {
          const mapping = relationByTarget.get(target.code) || null
          return <div className={'mapping-type-item' + (target.code === activeRelation.code ? ' active' : '')} key={target.id}>
            <button type="button" className="mapping-type-select" onClick={() => setSelectedRelationCode(target.code)}><Icon name="link" size={16}/><span><strong>{relationEndpoint(target)}</strong><small>{target.code}</small></span><StatusTag>{mappingListStatus(target, mapping, 'relations')}</StatusTag></button>
            {renderStructureActions(target, 'relation')}
          </div>
        })}{!visibleRelations.length && <p className="mapping-list-empty">未找到匹配的关系类型</p>}</div>
      </aside>
      <section className="mapping-config-panel mapping-relation-config">
        <header className="mapping-config-header"><div><h2>{activeRelation.name}</h2><p>选择两端实体关联字段，可选用中间表提供关系记录。</p></div><div className="mapping-config-header-meta"><StatusTag>{mappingListStatus(activeRelation, activeRelationMapping, 'relations')}</StatusTag><span className="mapping-code">{activeRelation.code}</span></div></header>
        <div className="mapping-relation-form-panel">
          <div className="mapping-relation-form-title"><div><strong>关联配置</strong><p>关系映射只作用于当前知识图谱</p></div><div className="mapping-relation-actions">{savingKey && <span className="mapping-saving">保存中…</span>}{activeRelationMapping && <button type="button" className="mapping-inline-link danger-link" disabled={Boolean(savingKey)} onClick={() => void removeMapping(activeRelationMapping, activeRelation.name + '关系映射')}>移除映射</button>}</div></div>
          <div className="mapping-relation-route"><div className="mapping-relation-endpoint"><span>起点实体类型</span><strong>{entityTypeName(activeRelation.ownerCode)}</strong><small>{activeRelation.ownerCode}</small></div><span className="mapping-relation-arrow">→</span><div className="mapping-relation-endpoint"><span>终点实体类型</span><strong>{entityTypeName(activeRelation.targetCode)}</strong><small>{activeRelation.targetCode}</small></div></div>
          <RelationMappingConfig key={`${activeRelation.code}:${activeRelationMapping?.id || 'new'}`} relation={activeRelation} mapping={activeRelationMapping} elements={ontologyElements} mappings={allMappings} sources={enabledEligibleSources} metadata={metadataBySource} entityCodes={availableEntityCodes} propertyCodes={availablePropertyCodes} disabled={Boolean(savingKey) || autoApplying} onSave={saveRelationRule} onPendingChange={setPendingConfig}/>
        </div>
      </section>
    </div>
  }

  if (ontologyStatus && ontologyStatus !== '启用') return <EmptyState title="图谱模型启用后才能配置图谱映射" description="图谱映射需要引用启用状态的图谱模型。"/>
  if (loadingSources) return <div className="loading-state"><i/><span>正在加载数据映射配置…</span></div>
  if (!eligibleSources.length) return <EmptyState title="暂无可映射数据源" description="请先新建并启用数据源，再回到知识图谱生成流程。" action={<Button variant="primary" icon="plus" onClick={() => navigate('/graphs/sources/new')}>新建数据源</Button>}/>

  return <>
    <div className="semantic-mapping-view">
      <div className="semantic-mapping-context">
        <div className="semantic-mapping-context-title"><span>图谱模型</span><strong title={ontologyName}>{ontologyName}</strong></div>
        <div className="semantic-mapping-context-source"><div className="mapping-source-compact"><span>候选数据源</span><strong>{eligibleSources.length} 个</strong></div></div>
        <span className="semantic-mapping-scope" title="仅实际映射的数据源参与本次构图">仅影响当前图谱</span>
      </div>
      {loadingDetail ? <div className="loading-state"><i/><span>正在加载候选数据源映射…</span></div> : <div className="mapping-workspace">
        <div className="mapping-tabs-toolbar">
          <Tabs value={mode} onChange={(value) => { setMode(value as MappingMode); setFilter('all'); setTypeKeyword('') }} items={[{ key: 'entity', label: `实体映射 ${configuredEntityTypeCount}/${targetEntityTypes.length}` }, { key: 'relations', label: `关系映射 ${configuredRelationCount}/${targetRelations.length}` }]}/>
          <Button variant="primary" icon="refresh" disabled={Boolean(savingKey) || pendingConfig || autoLoading || autoApplying || !enabledEligibleSources.length} onClick={() => void previewAutoMapping()}>{autoLoading ? '正在匹配…' : '批量自动映射'}</Button>
        </div>
        {!enabledEligibleSources.length && <p className="mapping-source-warning"><Icon name="warning" size={15}/>候选数据源均未启用，请返回上一步选择可用数据源。</p>}
        {mode === 'entity' ? renderEntityMapping() : renderRelationMapping()}
      </div>}
    </div>
    <Modal open={Boolean(autoPreview)} title="自动映射预览" description="仅应用依据明确的建议，不覆盖已有人工映射。" confirmText={autoApplying ? '正在应用…' : '应用映射'} onClose={() => { if (!autoApplying) setAutoPreview(null) }} onConfirm={() => void applyAutoMapping()}>
      {autoPreview && <div className="mapping-auto-preview">
        <div><strong>{autoPreview.entities.length}</strong><span>个实体类型</span></div>
        <div><strong>{autoPreview.relations.length}</strong><span>个关系类型</span></div>
        <p>其余 {autoPreview.skippedEntities} 个实体类型、{autoPreview.skippedRelations} 个关系类型可稍后手动配置；未映射类型不参与本次构图。</p>
      </div>}
    </Modal>
    <Drawer open={!!structureEditor} title={structureEditor ? `${structureEditor.target ? '编辑' : '新增'}${structureTypeLabel[structureEditor.type]}` : '编辑当前图谱结构'} eyebrow="当前图谱结构" onClose={() => setStructureEditor(null)} footer={<><Button onClick={() => setStructureEditor(null)}>取消</Button><Button variant="primary" onClick={saveStructureElement}>{structureEditor?.target ? '保存修改' : '保存定义'}</Button></>}>
      {structureEditor && <div className="form-stack"><div className="alert-box"><Icon name="graph"/><span>这里修改的是当前知识图谱的结构副本，不会改变图谱模型。</span></div><Field label={`${structureTypeLabel[structureEditor.type]}编码 *`}><input value={elementForm.code} disabled={Boolean(structureEditor.target)} onChange={(event) => updateElementForm({ code: event.target.value })} placeholder="请输入唯一编码"/></Field><Field label="名称 *"><input value={elementForm.name} onChange={(event) => updateElementForm({ name: event.target.value })}/></Field>{structureEditor.type !== 'class' && <Field label="所属实体类型 *"><select value={elementForm.ownerCode || ''} onChange={(event) => updateElementForm({ ownerCode: event.target.value })}><option value="">请选择实体类型</option>{targetEntityTypes.map((option) => <option value={option.code} key={option.code}>{option.name} · {option.code}</option>)}</select></Field>}{structureEditor.type === 'relation' && <Field label="终点实体类型 *"><select value={elementForm.targetCode || ''} onChange={(event) => updateElementForm({ targetCode: event.target.value })}><option value="">请选择终点实体类型</option>{targetEntityTypes.map((option) => <option value={option.code} key={option.code}>{option.name} · {option.code}</option>)}</select></Field>}{structureEditor.type === 'property' && <Field label="数据类型"><input value={elementForm.dataType} onChange={(event) => updateElementForm({ dataType: event.target.value })}/></Field>}{structureEditor.type !== 'relation' && <Field label="约束"><input value={elementForm.constraint} onChange={(event) => updateElementForm({ constraint: event.target.value })} placeholder="例如：必填、主标识"/></Field>}<Field label="业务说明"><textarea value={elementForm.description} onChange={(event) => updateElementForm({ description: event.target.value })}/></Field></div>}
    </Drawer>
  </>
}
