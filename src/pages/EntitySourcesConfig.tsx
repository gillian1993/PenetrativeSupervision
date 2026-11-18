import { useEffect, useId, useState } from 'react'
import { entityConfigurationIssue, entityJoins, mappingGroup, mappingPriority, propertyMappingAvailable, propertyTable, sameMappingGroup, sortEntitySources, type MappingConfig } from '../../graphMappingConfig'
import type { MappingItem, SourceMetadataItem } from '../dataGraphApi'
import type { DataSourceItem, GraphStructureElement } from '../types'
import { EmptyState, Icon } from '../ui'
import { EntityJoinEditor } from './EntityJoinEditor'
import { MappingPropertyField } from './MappingPropertyField'

interface Props {
  entity: GraphStructureElement
  properties: GraphStructureElement[]
  mappings: MappingItem[]
  sources: DataSourceItem[]
  metadata: Record<string, SourceMetadataItem[]>
  disabled: boolean
  onSave: (sourceId: string, tab: 'entityTypes' | 'properties', target: GraphStructureElement, field: string, transform: string, config: MappingConfig, groupId: string) => Promise<boolean>
  onRemove: (mapping: MappingItem, label: string) => void
  onRemoveSource: (mapping: MappingItem) => void
  onAddProperty: () => void
  onPendingChange: (pending: boolean) => void
}
const groupKey = (mapping: MappingItem) => `${mapping.sourceId}|${mappingGroup(mapping)}`
const identityField = (mapping: MappingItem) => mapping.transform.match(/主键字段[：:]\s*([^；;]+)/)?.[1]?.trim() || ''
const emptySource = () => ({ sourceId: '', table: '', key: '', groupId: `G-${crypto.randomUUID()}` })

export function EntitySourcesConfig({ entity, properties, mappings, sources, metadata, disabled, onSave, onRemove, onRemoveSource, onAddProperty, onPendingChange }: Props) {
  const groups = sortEntitySources(mappings.filter((row) => row.type === '实体类型' && row.targetCode === entity.code))
  const [selected, setSelected] = useState('')
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState(emptySource)
  const [mainDraft, setMainDraft] = useState<{ table: string; key: string } | null>(null)
  const [joinPending, setJoinPending] = useState(false)
  const panelId = useId()
  const active = groups.find((group) => groupKey(group) === selected) || groups[0]
  const source = sources.find((item) => item.id === active?.sourceId)
  const isAdding = adding || !groups.length
  const pending = joinPending || Boolean(mainDraft) || isAdding && Boolean(draft.sourceId)
  useEffect(() => { onPendingChange(pending) }, [pending, onPendingChange])
  useEffect(() => () => onPendingChange(false), [onPendingChange])
  const busy = disabled
  const sourceLocked = busy || joinPending || Boolean(mainDraft)
  const sourceName = (sourceId: string) => sources.find((item) => item.id === sourceId)?.name || sourceId
  const fields = (sourceId: string, table: string) => metadata[sourceId]?.find((item) => item.tableName === table)?.fields || []
  const ownProperty = (property: GraphStructureElement) => active ? mappings.find((row) => row.sourceId === active.sourceId && sameMappingGroup(row, active) && row.type === '属性' && row.targetCode === property.code) : undefined
  const mainTable = mainDraft?.table ?? active?.sourceField ?? ''
  const key = mainDraft?.key ?? (active ? identityField(active) : '')
  const mainFields = active ? fields(active.sourceId, mainTable) : []
  const joins = entityJoins(active)
  const saveNew = async (keyField: string) => {
    setDraft((value) => ({ ...value, key: keyField }))
    const priority = Math.max(groups.length, ...groups.map(mappingPriority), 0) + 1
    if (await onSave(draft.sourceId, 'entityTypes', entity, draft.table, `主键字段：${keyField}`, { priority }, draft.groupId)) {
      setSelected(`${draft.sourceId}|${draft.groupId}`); setAdding(false); setDraft(emptySource())
    }
  }
  const saveMain = async (keyField: string) => {
    if (!active) return
    setMainDraft({ table: mainTable, key: keyField })
    if (await onSave(active.sourceId, 'entityTypes', entity, mainTable, `主键字段：${keyField}`, { ...active.config, joins: mainTable === active.sourceField ? joins : [] }, mappingGroup(active))) setMainDraft(null)
  }
  return <section className="mapping-config-panel mapping-entity-config">
    <header className="mapping-config-header"><div className="mapping-config-heading"><h2>{entity.name}</h2><span className="mapping-code">{entity.code}</span></div>{busy && <span className="mapping-saving">保存中…</span>}</header>
    <div className="mapping-source-tabs-bar">
      {groups.length > 0 && <div className="mapping-source-tabs" role="tablist" aria-label="实体数据来源">
        {groups.map((group, index) => {
          const label = groups.filter((item) => item.sourceId === group.sourceId).length > 1 ? group.sourceField : sourceName(group.sourceId)
          const selectedTab = active && groupKey(active) === groupKey(group) && !isAdding
          return <div className={`mapping-source-tab${selectedTab ? ' active' : ''}`} key={groupKey(group)} role="presentation">
            <button type="button" role="tab" id={`${panelId}-tab-${index}`} aria-selected={Boolean(selectedTab)} aria-controls={panelId} title={`${sourceName(group.sourceId)} · ${group.sourceField}`} disabled={sourceLocked} onClick={() => { setSelected(groupKey(group)); setAdding(false); setDraft(emptySource()) }}><span>{label}</span>{entityConfigurationIssue(group, metadata[group.sourceId] || []) && <i title="待检查" aria-label="待检查"/>}</button>
            <button type="button" className="mapping-source-tab-remove" aria-label={`移除来源表${group.sourceField}`} title="移除来源表" disabled={sourceLocked} onClick={() => onRemoveSource(group)}><Icon name="close" size={12}/></button>
          </div>
        })}
      </div>}
      <button type="button" className="mapping-inline-link mapping-add-source" disabled={sourceLocked || isAdding} onClick={() => { setAdding(true); setDraft(emptySource()) }}><Icon name="plus" size={14}/>添加来源表</button>
    </div>
    <div id={panelId} role={isAdding ? undefined : 'tabpanel'} aria-labelledby={!isAdding ? `${panelId}-tab-${Math.max(0, groups.findIndex((group) => groupKey(group) === groupKey(active)))}` : undefined}>
    {isAdding ? <section className="mapping-new-source">
      {groups.length > 0 && <div className="mapping-new-source-heading"><span>添加来源表</span><button type="button" className="mapping-inline-link" disabled={busy} onClick={() => { setAdding(false); setDraft(emptySource()) }}>取消添加</button></div>}
      <div className="mapping-form-row"><label htmlFor="mapping-add-main">主表 <span>*</span></label><div className="mapping-form-control"><select id="mapping-add-main" value={draft.table ? JSON.stringify([draft.sourceId, draft.table]) : ''} disabled={busy} onChange={(event) => { const [sourceId, table] = JSON.parse(event.target.value) as [string, string]; setDraft({ ...draft, sourceId, table, key: '' }) }}><option value="" disabled>请选择主表</option>{sources.filter((item) => item.status === '启用').map((item) => <optgroup key={item.id} label={item.name}>{(metadata[item.id] || []).map((table) => <option key={table.id} disabled={groups.some((group) => group.sourceId === item.id && group.sourceField === table.tableName)} value={JSON.stringify([item.id, table.tableName])}>{item.name} · {table.tableName}</option>)}</optgroup>)}</select><small className="mapping-form-help">支持数据表或视图。</small></div></div>
      <div className="mapping-form-row"><label htmlFor="mapping-add-key">实体唯一标识 <span>*</span></label><div className="mapping-form-control"><select id="mapping-add-key" value={draft.key} disabled={busy || !draft.table} onChange={(event) => void saveNew(event.target.value)}><option value="" disabled>请选择业务标识字段</option>{fields(draft.sourceId, draft.table).map((field) => <option value={field} key={field}>{field}</option>)}</select>{draft.key && <button type="button" className="mapping-inline-link" disabled={busy} onClick={() => void saveNew(draft.key)}>重试保存</button>}</div></div>
    </section> : active && source && <>
      <div className="mapping-entity-table-picker"><label htmlFor="mapping-source-table">主表 <span>*</span></label><div className="mapping-entity-table-control"><select id="mapping-source-table" value={mainTable} disabled={busy || joinPending} onChange={(event) => setMainDraft(event.target.value === active.sourceField ? null : { table: event.target.value, key: '' })}>{!metadata[source.id]?.some((table) => table.tableName === mainTable) && <option value={mainTable}>{source.name} · {mainTable}（来源已失效）</option>}<optgroup label={source.name}>{(metadata[source.id] || []).map((table) => <option key={table.id} value={table.tableName} disabled={groups.some((group) => group.id !== active.id && group.sourceId === source.id && group.sourceField === table.tableName)}>{source.name} · {table.tableName}</option>)}</optgroup></select>{mainDraft && <button type="button" className="mapping-inline-link" disabled={busy} onClick={() => setMainDraft(null)}>取消更换</button>}</div></div>
      <div className="mapping-entity-form"><div className="mapping-form-row"><label htmlFor="mapping-entity-key">实体唯一标识 <span>*</span></label><div className="mapping-form-control"><select id="mapping-entity-key" value={key} disabled={busy || joinPending} onChange={(event) => void saveMain(event.target.value)}><option value="" disabled>请选择业务标识字段</option>{key && !mainFields.includes(key) && <option value={key}>{key}（字段已失效）</option>}{mainFields.map((field) => <option key={field} value={field}>{field}</option>)}</select>{mainDraft?.key && <button type="button" className="mapping-inline-link" disabled={busy} onClick={() => void saveMain(mainDraft.key)}>重试保存</button>}</div></div></div>
      {!mainDraft && <>
        {source.mode === '数据库接入' && <EntityJoinEditor key={groupKey(active)} mainTable={mainTable} metadata={metadata[source.id] || []} joins={joins} disabled={busy} onPendingChange={setJoinPending} onChange={(next) => onSave(source.id, 'entityTypes', entity, mainTable, active.transform, { ...active.config, joins: next }, mappingGroup(active))}/>}
        <section className="mapping-entity-properties"><header className="mapping-entity-properties-header"><div><strong>属性映射</strong><span>已匹配 {properties.filter((property) => propertyMappingAvailable(active, ownProperty(property) || null, metadata[source.id] || [])).length}/{properties.length}</span></div><button type="button" className="mapping-inline-link mapping-add-property" disabled={busy || joinPending} onClick={onAddProperty}><Icon name="plus" size={14}/>新增属性</button></header>
          <div className="table-container mapping-field-table mapping-simple-property-table"><table><thead><tr><th>图谱属性</th><th>来源字段</th></tr></thead><tbody>{properties.length ? properties.map((property) => {
            const mapping = ownProperty(property)
            return <tr key={property.id}>
              <td><strong title={`${property.code} · ${property.dataType || '文本'} · ${property.constraint || '无特殊约束'}`}>{/必填|主标识/.test(property.constraint || '') && <em className="mapping-required">*</em>}{property.name}</strong></td>
              <td><MappingPropertyField label={`${property.name}来源字段`} groups={[mainTable, ...joins.map((join) => join.table)].map((table) => ({ table, fields: fields(source.id, table) }))} table={mapping ? propertyTable(active, mapping) : mainTable} field={mapping?.sourceField || ''} disabled={busy || joinPending} onChange={(value) => {
                if (!value) { if (mapping) onRemove(mapping, `${property.name}属性映射`); return }
                const [sourceTable, field] = JSON.parse(value) as [string, string]
                void onSave(source.id, 'properties', property, field, mapping?.transform || '直接映射', { sourceTable }, mappingGroup(active))
              }}/></td>
            </tr>
          }) : <tr><td colSpan={2}><EmptyState title="暂无属性" description="可先新增属性，再配置来源字段。"/></td></tr>}</tbody></table></div>
        </section>
      </>}
    </>}
    </div>
    {pending && !joinPending && !busy && <p className="mapping-form-help">请完成当前来源的唯一标识配置，或取消本次修改后继续。</p>}
  </section>
}
