import { useEffect, useState } from 'react'
import { relationConfiguration, relationConfigurationIssue, sortEntitySources, type RelationConfiguration } from '../../graphMappingConfig'
import type { MappingItem, SourceMetadataItem } from '../dataGraphApi'
import type { DataSourceItem, GraphStructureElement } from '../types'
import { Button } from '../ui'
import { directRelationConfiguration, intermediateRelationConfiguration, relationFieldSelection, updateRelationAssociation } from '../../relationMappingForm'

interface Props {
  relation: GraphStructureElement
  mapping: MappingItem | null
  elements: GraphStructureElement[]
  mappings: MappingItem[]
  sources: DataSourceItem[]
  metadata: Record<string, SourceMetadataItem[]>
  entityCodes: string[]
  propertyCodes: string[]
  disabled: boolean
  onSave: (sourceId: string, config: RelationConfiguration) => Promise<boolean>
  onPendingChange: (pending: boolean) => void
}
export function RelationMappingConfig({ relation, mapping, elements, mappings, sources, metadata, entityCodes, propertyCodes, disabled, onSave, onPendingChange }: Props) {
  const entityName = (code?: string) => elements.find((item) => item.type === 'class' && item.code === code)?.name || code || '未指定'
  const entitySource = (code: string) => sortEntitySources(mappings.filter((item) => item.type === '实体类型' && item.targetCode === code && sources.some((source) => source.id === item.sourceId)))[0]?.sourceId || ''
  const initial = relationConfiguration(mapping, relation) || directRelationConfiguration(relation)
  const initialSource = mapping?.sourceId || entitySource(relation.ownerCode || '')
  const initialKey = JSON.stringify([mapping?.id, mapping?.status, initialSource, initial])
  const [draft, setDraft] = useState(initial)
  const [sourceId, setSourceId] = useState(initialSource)
  const [failed, setFailed] = useState(false)
  useEffect(() => { setDraft(initial); setSourceId(initialSource); setFailed(false) }, [initialKey])
  const selection = relationFieldSelection(draft, relation)
  const tableMode = selection.kind === 'table'
  const custom = selection.kind === 'custom'
  const tableValue = draft.origin.kind === 'table' ? JSON.stringify([sourceId, draft.origin.table]) : ''
  const issue = relationConfigurationIssue(draft, relation, elements, entityCodes, propertyCodes, metadata[sourceId] || [])
  const issueMessage = issue === '请选择两端的来源字段和实体匹配字段' ? '请选择源实体关联字段和目标实体关联字段'
    : issue === '来源表或来源字段已失效' ? '中间表或关联字段已失效，请重新选择'
    : issue === '实体匹配属性尚未完成映射' ? '关联字段尚未完成实体映射'
    : issue === '来源实体字段尚未完成映射' ? '关联字段尚未完成实体映射' : issue
  const changed = JSON.stringify(draft) !== JSON.stringify(initial) || sourceId !== initialSource
  const pending = changed || failed || mapping?.status === '待检查'
  useEffect(() => { onPendingChange(pending) }, [pending, onPendingChange])
  useEffect(() => () => onPendingChange(false), [onPendingChange])
  const entityFields = (code: string) => [{ value: '$identifier', label: '实体唯一标识' }, ...elements.filter((item) => item.type === 'property' && item.ownerCode === code && propertyCodes.includes(item.code)).map((item) => ({ value: item.code, label: `${item.name} · ${item.code}` }))]
  const tableFields = draft.origin.kind === 'table' ? (metadata[sourceId]?.find((item) => item.tableName === (draft.origin.kind === 'table' ? draft.origin.table : ''))?.fields || []).map((field) => ({ value: field, label: field })) : []
  const save = async (next = draft, nextSource = sourceId) => { setFailed(!await onSave(nextSource, next)) }
  const update = (next: RelationConfiguration, nextSource = sourceId) => {
    setDraft(next); setSourceId(nextSource); setFailed(false)
    if (!relationConfigurationIssue(next, relation, elements, entityCodes, propertyCodes, metadata[nextSource] || [])) void save(next, nextSource)
  }
  const changeAssociation = (side: 'start' | 'end', value: string) => {
    const next = updateRelationAssociation(draft, relation, side, value)
    update(next, next.origin.kind === 'table' ? sourceId : entitySource(relation.ownerCode || ''))
  }
  const options = (items: { value: string; label: string }[], value: string, useCustom = false) => <><option value="" disabled>请选择关联字段</option>{useCustom && <option value="__legacy__" disabled>已保存配置</option>}{value && !useCustom && !items.some((item) => item.value === value) && <option value={value}>{value}（字段已失效）</option>}{items.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</>
  const matchLabel = (owner: string, value: string) => entityFields(owner).find((item) => item.value === value)?.label || `${value}（字段已失效）`
  const tableAvailable = draft.origin.kind !== 'table' || sources.some((source) => source.id === sourceId && metadata[source.id]?.some((item) => item.tableName === (draft.origin.kind === 'table' ? draft.origin.table : '')))
  return <>
    <div className="mapping-relation-attribute-fields mapping-simple-relation-fields">
      <div className="mapping-relation-attribute-field"><label htmlFor="relation-middle-table">中间表 <small>（选填）</small></label><div><select id="relation-middle-table" value={tableValue} disabled={disabled} onChange={(event) => {
        if (!event.target.value) { setDraft(directRelationConfiguration(relation)); setSourceId(entitySource(relation.ownerCode || '')) }
        else { const [nextSource, table] = JSON.parse(event.target.value) as [string, string]; setDraft(intermediateRelationConfiguration(table)); setSourceId(nextSource) }
        setFailed(false)
      }}><option value="">不使用中间表，按实体字段关联</option>{tableValue && !tableAvailable && <option value={tableValue}>当前中间表已失效，请重新选择</option>}{sources.map((source) => <optgroup label={source.name} key={source.id}>{(metadata[source.id] || []).map((table) => <option key={table.id} value={JSON.stringify([source.id, table.tableName])}>{source.name} · {table.tableName}</option>)}</optgroup>)}</select><small className="mapping-relation-lineage">支持业务表、关系表或视图，无需专门新建中间表。</small></div></div>
      {(['start', 'end'] as const).map((side) => {
        const owner = side === 'start' ? relation.ownerCode || '' : relation.targetCode || ''
        const field = side === 'start' ? selection.sourceField : selection.targetField
        const fieldOptions = tableMode ? tableFields : entityFields(owner)
        return <div className="mapping-relation-attribute-field" key={side}><label htmlFor={`relation-${side}-association`}><em>*</em>{side === 'start' ? '源实体关联字段' : '目标实体关联字段'}</label><div><select id={`relation-${side}-association`} value={custom ? '__legacy__' : field} disabled={disabled} onChange={(event) => changeAssociation(side, event.target.value)}>{options(fieldOptions, field, custom)}</select><small className="mapping-relation-lineage">{tableMode ? `中间表中的字段 → ${entityName(owner)} · ${matchLabel(owner, draft[side].match)}` : `从${entityName(owner)}的已映射属性或唯一标识中选择。`}</small></div></div>
      })}
    </div>
    {pending && issue && <p className="mapping-form-help">{issueMessage}</p>}
    {(failed || mapping?.status === '待检查') && <div className="mapping-relation-dependency"><span>{failed ? '配置尚未保存，请重试。' : '实体映射已修改，请确认关联字段后保存。'}</span><Button disabled={disabled || Boolean(issue)} onClick={() => void save()}>保存关联配置</Button></div>}
    {(changed || failed) && <button type="button" className="mapping-inline-link mapping-relation-undo" disabled={disabled} onClick={() => { setDraft(initial); setSourceId(initialSource); setFailed(false) }}>撤销本次修改</button>}
  </>
}
