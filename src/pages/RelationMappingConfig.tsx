import { useEffect, useState } from 'react'
import { relationConfiguration, relationConfigurationIssue, sortEntitySources, type RelationConfiguration } from '../../graphMappingConfig'
import type { MappingItem, SourceMetadataItem } from '../dataGraphApi'
import type { DataSourceItem, GraphStructureElement } from '../types'
import { Button } from '../ui'
import { directRelationConfiguration, intermediateRelationConfiguration, relationFieldSelection } from '../../relationMappingForm'

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
  const [advancedOpen, setAdvancedOpen] = useState(false)
  useEffect(() => { setDraft(initial); setSourceId(initialSource); setFailed(false) }, [initialKey])
  const selection = relationFieldSelection(draft, relation)
  const tableMode = selection.kind === 'table'
  const custom = selection.kind === 'custom'
  const tableValue = draft.origin.kind === 'table' ? JSON.stringify([sourceId, draft.origin.table]) : ''
  const issue = relationConfigurationIssue(draft, relation, elements, entityCodes, propertyCodes, metadata[sourceId] || [])
  const issueMessage = issue === '请选择两端的来源字段和实体匹配字段' ? '请选择源实体关联字段和目标实体关联字段'
    : issue === '来源表或来源字段已失效' ? '中间表或关联字段已失效，请重新选择'
    : issue === '实体匹配属性尚未完成映射' ? tableMode || custom ? '请在高级匹配设置中选择有效的实体属性' : '关联字段尚未完成实体映射'
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
    if (tableMode) update({ ...draft, [side]: { ...draft[side], field: value } })
    else update(directRelationConfiguration(relation, side === 'start' ? value : selection.sourceField, side === 'end' ? value : selection.targetField), entitySource(relation.ownerCode || ''))
  }
  const changeAdvanced = (side: 'start' | 'end', field: 'field' | 'match', value: string) => update({ ...draft, [side]: { ...draft[side], [field]: value } })
  const options = (items: { value: string; label: string }[], value: string, useCustom = false) => <><option value="" disabled>请选择关联字段</option>{useCustom && <option value="__advanced__" disabled>沿用高级配置</option>}{value && !useCustom && !items.some((item) => item.value === value) && <option value={value}>{value}（字段已失效）</option>}{items.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</>
  const matchLabel = (owner: string, value: string) => entityFields(owner).find((item) => item.value === value)?.label || `${value}（字段已失效）`
  const tableAvailable = draft.origin.kind !== 'table' || sources.some((source) => source.id === sourceId && metadata[source.id]?.some((item) => item.tableName === (draft.origin.kind === 'table' ? draft.origin.table : '')))
  const advancedOriginFields = draft.origin.kind === 'entity' ? entityFields(draft.origin.entityCode) : []
  return <>
    <div className="mapping-relation-attribute-fields mapping-simple-relation-fields">
      <div className="mapping-relation-attribute-field"><label htmlFor="relation-middle-table">中间表 <small>（选填）</small></label><div><select id="relation-middle-table" value={tableValue} disabled={disabled} onChange={(event) => {
        if (!event.target.value) { setDraft(directRelationConfiguration(relation)); setSourceId(entitySource(relation.ownerCode || '')) }
        else { const [nextSource, table] = JSON.parse(event.target.value) as [string, string]; setDraft(intermediateRelationConfiguration(table)); setSourceId(nextSource) }
        setFailed(false); setAdvancedOpen(false)
      }}><option value="">不使用中间表，按实体字段关联</option>{tableValue && !tableAvailable && <option value={tableValue}>当前中间表已失效，请重新选择</option>}{sources.map((source) => <optgroup label={source.name} key={source.id}>{(metadata[source.id] || []).map((table) => <option key={table.id} value={JSON.stringify([source.id, table.tableName])}>{source.name} · {table.tableName}</option>)}</optgroup>)}</select><small className="mapping-relation-lineage">支持业务表、关系表或视图，无需专门新建中间表。</small></div></div>
      {(['start', 'end'] as const).map((side) => {
        const owner = side === 'start' ? relation.ownerCode || '' : relation.targetCode || ''
        const field = side === 'start' ? selection.sourceField : selection.targetField
        const fieldOptions = tableMode ? tableFields : entityFields(owner)
        return <div className="mapping-relation-attribute-field" key={side}><label htmlFor={`relation-${side}-association`}><em>*</em>{side === 'start' ? '源实体关联字段' : '目标实体关联字段'}</label><div><select id={`relation-${side}-association`} value={custom ? '__advanced__' : field} disabled={disabled} onChange={(event) => changeAssociation(side, event.target.value)}>{options(fieldOptions, field, custom)}</select><small className="mapping-relation-lineage">{tableMode ? `中间表中的字段 → ${entityName(owner)} · ${matchLabel(owner, draft[side].match)}` : `从${entityName(owner)}的已映射属性或唯一标识中选择。`}</small></div></div>
      })}
    </div>
    {custom && <p className="mapping-form-help">当前沿用已保存的特殊关联规则，可展开高级匹配设置查看；重新选择两端关联字段将替换该规则。</p>}
    {(tableMode || custom) && <details className="mapping-advanced-matching" open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
      <summary>高级匹配设置</summary>
      <div className="mapping-relation-attribute-fields">
        {custom && draft.origin.kind === 'entity' && <div className="mapping-relation-attribute-field"><label htmlFor="relation-advanced-origin">来源实体</label><div><select id="relation-advanced-origin" value={draft.origin.entityCode} disabled={disabled} onChange={(event) => {
          const code = event.target.value
          update({ origin: { kind: 'entity', entityCode: code }, start: { field: '', match: '$identifier' }, end: { field: '', match: '$identifier' } }, entitySource(code))
        }}>{!entityCodes.includes(draft.origin.entityCode) && <option value={draft.origin.entityCode}>{draft.origin.entityCode}（来源已失效）</option>}{elements.filter((item) => item.type === 'class' && entityCodes.includes(item.code)).map((item) => <option value={item.code} key={item.code}>{item.name}</option>)}</select></div></div>}
        {(['start', 'end'] as const).map((side) => {
          const owner = side === 'start' ? relation.ownerCode || '' : relation.targetCode || ''
          return <div className="mapping-advanced-endpoint" key={side}>
            {custom && <div className="mapping-relation-attribute-field"><label htmlFor={`relation-advanced-${side}-field`}>{side === 'start' ? '起点取值字段' : '终点取值字段'}</label><div><select id={`relation-advanced-${side}-field`} value={draft[side].field} disabled={disabled} onChange={(event) => changeAdvanced(side, 'field', event.target.value)}>{options(advancedOriginFields, draft[side].field)}</select></div></div>}
            <div className="mapping-relation-attribute-field"><label htmlFor={`relation-${side}-match`}>{side === 'start' ? '源实体匹配属性' : '目标实体匹配属性'}</label><div><select id={`relation-${side}-match`} value={draft[side].match} disabled={disabled} onChange={(event) => changeAdvanced(side, 'match', event.target.value)}>{options(entityFields(owner), draft[side].match)}</select><small className="mapping-relation-lineage">默认使用{entityName(owner)}实体唯一标识；中间表保存其他业务标识时，可在此更改。</small></div></div>
          </div>
        })}
      </div>
    </details>}
    {pending && issue && <p className="mapping-form-help">{issueMessage}</p>}
    {(failed || mapping?.status === '待检查') && <div className="mapping-relation-dependency"><span>{failed ? '配置尚未保存，请重试。' : '实体映射已修改，请确认关联字段后保存。'}</span><Button disabled={disabled || Boolean(issue)} onClick={() => void save()}>保存关联配置</Button></div>}
    {(changed || failed) && <button type="button" className="mapping-inline-link mapping-relation-undo" disabled={disabled} onClick={() => { setDraft(initial); setSourceId(initialSource); setFailed(false); setAdvancedOpen(false) }}>撤销本次修改</button>}
    <p className="mapping-relation-form-note">{tableMode ? '中间表的两端字段分别对应源实体、目标实体的唯一标识；特殊情况可展开高级匹配设置。' : '不使用中间表时，按两端实体关联字段的值相等建立关系。'} 配置完整后自动保存，数据检查在“确认生成”环节进行。</p>
  </>
}
