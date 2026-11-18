import { useEffect, useState } from 'react'
import { entityConfigurationIssue, entityJoins, mappingGroup, mappingPriority, propertyMappingAvailable, propertyTable, sameMappingGroup, sortEntitySources, type MappingConfig } from '../../graphMappingConfig'
import type { MappingItem, SourceMetadataItem } from '../dataGraphApi'
import type { DataSourceItem, GraphStructureElement } from '../types'
import { Button, EmptyState, StatusTag } from '../ui'
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
  const [moving, setMoving] = useState(false)
  const active = groups.find((group) => groupKey(group) === selected) || groups[0]
  const source = sources.find((item) => item.id === active?.sourceId)
  const isAdding = adding || !groups.length
  const pending = moving || Boolean(mainDraft) || isAdding && Boolean(draft.sourceId)
  useEffect(() => { onPendingChange(pending) }, [pending, onPendingChange])
  useEffect(() => () => onPendingChange(false), [onPendingChange])
  const busy = disabled || moving
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
  const move = async (position: number, delta: number) => {
    const next = [...groups]; [next[position], next[position + delta]] = [next[position + delta], next[position]]
    setMoving(true)
    try {
      for (const [index, group] of next.entries()) if (!await onSave(group.sourceId, 'entityTypes', entity, group.sourceField, group.transform, { ...group.config, priority: index + 1 }, mappingGroup(group))) break
    } finally { setMoving(false) }
  }
  return <section className="mapping-config-panel">
    <header className="mapping-config-header"><div className="mapping-config-heading"><h2>{entity.name}</h2><span className="mapping-code">{entity.code}</span></div>{busy && <span className="mapping-saving">保存中…</span>}</header>
    <section className="mapping-source-groups">
      <div className="mapping-source-group-heading"><strong>数据来源 <small>{groups.length} 组来源表</small></strong><Button icon="plus" disabled={busy || isAdding} onClick={() => { setAdding(true); setMainDraft(null); setDraft(emptySource()) }}>添加来源表</Button></div>
      <p className="mapping-form-help">各来源请选择同一业务标识作为实体唯一标识，相同标识合并为一个实体。按列表优先级取首个非空属性值。</p>
      {groups.map((group, index) => <div className={`mapping-source-group${active && groupKey(active) === groupKey(group) && !isAdding ? ' active' : ''}`} key={groupKey(group)}>
        <button type="button" className="mapping-source-group-select" disabled={busy} onClick={() => { setSelected(groupKey(group)); setAdding(false); setMainDraft(null); setDraft(emptySource()) }}><span className="mapping-source-priority">{index + 1}</span><span><strong>{group.sourceField}</strong><small>{sourceName(group.sourceId)} · 唯一标识：{identityField(group)}</small></span>{entityConfigurationIssue(group, metadata[group.sourceId] || []) && <StatusTag>待检查</StatusTag>}</button>
        <div className="mapping-source-group-actions"><button type="button" className="mapping-inline-link" aria-label={`${group.sourceField}提高优先级`} disabled={busy || index === 0} onClick={() => void move(index, -1)}>上移</button><button type="button" className="mapping-inline-link" aria-label={`${group.sourceField}降低优先级`} disabled={busy || index === groups.length - 1} onClick={() => void move(index, 1)}>下移</button><button type="button" className="mapping-inline-link danger-link" disabled={busy} onClick={() => onRemoveSource(group)}>移除</button></div>
      </div>)}
    </section>
    {isAdding ? <section className="mapping-new-source">
      <div className="mapping-source-group-heading"><strong>{groups.length ? '添加来源表' : '配置第一组来源表'}</strong>{groups.length > 0 && <button type="button" className="mapping-inline-link" disabled={busy} onClick={() => { setAdding(false); setDraft(emptySource()) }}>取消添加</button>}</div>
      <div className="mapping-form-row"><label htmlFor="mapping-add-main">主表 <span>*</span></label><div className="mapping-form-control"><select id="mapping-add-main" value={draft.table ? JSON.stringify([draft.sourceId, draft.table]) : ''} disabled={busy} onChange={(event) => { const [sourceId, table] = JSON.parse(event.target.value) as [string, string]; setDraft({ ...draft, sourceId, table, key: '' }) }}><option value="" disabled>请选择主表</option>{sources.filter((item) => item.status === '启用').map((item) => <optgroup key={item.id} label={item.name}>{(metadata[item.id] || []).map((table) => <option key={table.id} disabled={groups.some((group) => group.sourceId === item.id && group.sourceField === table.tableName)} value={JSON.stringify([item.id, table.tableName])}>{item.name} · {table.tableName}</option>)}</optgroup>)}</select><small className="mapping-form-help">支持数据表或视图。</small></div></div>
      <div className="mapping-form-row"><label htmlFor="mapping-add-key">实体唯一标识 <span>*</span></label><div className="mapping-form-control"><select id="mapping-add-key" value={draft.key} disabled={busy || !draft.table} onChange={(event) => void saveNew(event.target.value)}><option value="" disabled>请选择业务标识字段</option>{fields(draft.sourceId, draft.table).map((field) => <option value={field} key={field}>{field}</option>)}</select>{draft.key && <button type="button" className="mapping-inline-link" disabled={busy} onClick={() => void saveNew(draft.key)}>重试保存</button>}</div></div>
    </section> : active && source && <>
      <div className="mapping-entity-table-picker"><label htmlFor="mapping-source-table">主表 <span>*</span></label><div className="mapping-entity-table-control"><select id="mapping-source-table" value={mainTable} disabled={busy} onChange={(event) => setMainDraft(event.target.value === active.sourceField ? null : { table: event.target.value, key: '' })}>{!metadata[source.id]?.some((table) => table.tableName === mainTable) && <option value={mainTable}>{mainTable}（来源已失效）</option>}{(metadata[source.id] || []).map((table) => <option key={table.id} value={table.tableName} disabled={groups.some((group) => group.id !== active.id && group.sourceId === source.id && group.sourceField === table.tableName)}>{table.tableName}</option>)}</select><div className="mapping-entity-table-meta"><span>{source.name} · 支持数据表或视图</span>{mainDraft && <button type="button" className="mapping-inline-link" disabled={busy} onClick={() => setMainDraft(null)}>取消更换</button>}</div></div></div>
      <div className="mapping-entity-form"><div className="mapping-form-row"><label htmlFor="mapping-entity-key">实体唯一标识 <span>*</span></label><div className="mapping-form-control"><select id="mapping-entity-key" value={key} disabled={busy} onChange={(event) => void saveMain(event.target.value)}><option value="" disabled>请选择业务标识字段</option>{key && !mainFields.includes(key) && <option value={key}>{key}（字段已失效）</option>}{mainFields.map((field) => <option key={field} value={field}>{field}</option>)}</select>{mainDraft?.key && <button type="button" className="mapping-inline-link" disabled={busy} onClick={() => void saveMain(mainDraft.key)}>重试保存</button>}</div></div></div>
      {!mainDraft && <>
        {source.mode === '数据库接入' && <EntityJoinEditor key={groupKey(active)} mainTable={mainTable} metadata={metadata[source.id] || []} joins={joins} disabled={busy} onChange={(next) => onSave(source.id, 'entityTypes', entity, mainTable, active.transform, { ...active.config, joins: next }, mappingGroup(active))}/>}
        <section className="mapping-entity-properties"><header className="mapping-entity-properties-header"><div><strong>当前来源的属性映射</strong><span>已匹配 {properties.filter((property) => propertyMappingAvailable(active, ownProperty(property) || null, metadata[source.id] || [])).length}/{properties.length}</span></div><Button icon="plus" disabled={busy} onClick={onAddProperty}>新增属性</Button></header>
          <div className="table-container mapping-field-table"><table><thead><tr><th>图谱属性</th><th>类型 / 约束</th><th>来源字段</th><th>操作</th></tr></thead><tbody>{properties.length ? properties.map((property) => { const mapping = ownProperty(property); return <tr key={property.id}><td><strong>{property.name}</strong><small className="cell-sub">{property.code}</small></td><td>{property.dataType || '文本'}<small className="cell-sub">{property.constraint || '无特殊约束'}</small></td><td><MappingPropertyField groups={[mainTable, ...joins.map((join) => join.table)].map((table) => ({ table, fields: fields(source.id, table) }))} table={mapping ? propertyTable(active, mapping) : mainTable} field={mapping?.sourceField || ''} disabled={busy} onChange={(value) => { if (!value) return; const [sourceTable, field] = JSON.parse(value) as [string, string]; void onSave(source.id, 'properties', property, field, mapping?.transform || '直接映射', { sourceTable }, mappingGroup(active)) }}/></td><td>{mapping && <button type="button" className="mapping-inline-link danger-link" disabled={busy} onClick={() => onRemove(mapping, `${property.name}属性映射`)}>移除</button>}</td></tr> }) : <tr><td colSpan={4}><EmptyState title="暂无属性" description="可先新增属性，再配置来源字段。"/></td></tr>}</tbody></table></div>
        </section>
      </>}
    </>}
    {pending && !busy && <p className="mapping-form-help">请完成当前来源的唯一标识配置，或取消本次修改后继续。</p>}
  </section>
}
