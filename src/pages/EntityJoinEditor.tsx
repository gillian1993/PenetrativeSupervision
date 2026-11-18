import { useEffect, useState } from 'react'
import type { EntityJoin } from '../../graphMappingConfig'
import type { SourceMetadataItem } from '../dataGraphApi'
import { Icon } from '../ui'

interface Props {
  mainTable: string
  metadata: SourceMetadataItem[]
  joins: EntityJoin[]
  disabled: boolean
  onChange: (joins: EntityJoin[]) => Promise<boolean>
  onPendingChange: (pending: boolean) => void
}

export function EntityJoinEditor({ mainTable, metadata, joins, disabled, onChange, onPendingChange }: Props) {
  const [draft, setDraft] = useState<{ index: number; join: EntityJoin } | null>(null)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const busy = disabled || saving
  const pending = Boolean(draft) || saving
  useEffect(() => { onPendingChange(pending) }, [pending, onPendingChange])
  useEffect(() => () => onPendingChange(false), [onPendingChange])
  const mainFields = metadata.find((item) => item.tableName === mainTable)?.fields || []
  const valid = (join: EntityJoin, index: number) => join.table !== mainTable
    && !joins.some((item, position) => position !== index && item.table === join.table)
    && mainFields.includes(join.mainField)
    && Boolean(metadata.find((item) => item.tableName === join.table)?.fields?.includes(join.joinField))
  const save = async (nextDraft: { index: number; join: EntityJoin }) => {
    const next = [...joins]
    next[nextDraft.index] = nextDraft.join
    setSaving(true)
    try {
      if (await onChange(next)) { setDraft(null); setFailed(false) }
      else setFailed(true)
    } finally { setSaving(false) }
  }
  const change = (index: number, field: keyof EntityJoin, value: string) => {
    const join = draft?.index === index ? draft.join : joins[index] || { table: '', mainField: '', joinField: '' }
    const nextDraft = { index, join: field === 'table' ? { ...join, table: value, joinField: '' } : { ...join, [field]: value } }
    setDraft(nextDraft); setFailed(false)
    if (valid(nextDraft.join, index)) void save(nextDraft)
  }
  const remove = async (index: number) => {
    if (index === joins.length) { setDraft(null); setFailed(false); return }
    if (!window.confirm('移除关联表后，引用其字段的属性和关系需要重新配置。确定移除吗？')) return
    setSaving(true)
    try { if (await onChange(joins.filter((_, position) => position !== index))) { setDraft(null); setFailed(false) } }
    finally { setSaving(false) }
  }
  const rows = [...joins]
  if (draft) rows[draft.index] = draft.join
  return <section className="mapping-join-section mapping-inline-join-section">
    <div className="mapping-join-heading"><strong>关联表 <small>（选填）</small></strong><button type="button" className="mapping-inline-link mapping-add-join" disabled={busy || Boolean(draft)} onClick={() => { setDraft({ index: joins.length, join: { table: '', mainField: '', joinField: '' } }); setFailed(false) }}><Icon name="plus" size={14}/>添加关联表</button></div>
    {rows.length > 0 && <div className="mapping-inline-joins">
      <div className="mapping-inline-join-head" aria-hidden="true"><span>关联表</span><span>主表关联字段</span><span>关联表匹配字段</span><span/></div>
      {rows.map((join, index) => {
        const joinFields = metadata.find((item) => item.tableName === join.table)?.fields || []
        const locked = busy || Boolean(draft && draft.index !== index)
        const tables = metadata.filter((item) => item.tableName !== mainTable && !rows.some((row, position) => position !== index && row.table === item.tableName))
        return <div className="mapping-inline-join-row" key={index}>
          <select aria-label={`第${index + 1}个关联表`} title={join.table || '请选择关联表'} value={join.table} disabled={locked} onChange={(event) => change(index, 'table', event.target.value)}><option value="" disabled>请选择关联表</option>{join.table && !tables.some((item) => item.tableName === join.table) && <option value={join.table}>{join.table}（来源已失效）</option>}{tables.map((item) => <option key={item.id} value={item.tableName}>{item.tableName}</option>)}</select>
          <select aria-label={`第${index + 1}个主表关联字段`} title={join.mainField || '请选择主表字段'} value={join.mainField} disabled={locked} onChange={(event) => change(index, 'mainField', event.target.value)}><option value="" disabled>请选择主表字段</option>{join.mainField && !mainFields.includes(join.mainField) && <option value={join.mainField}>{join.mainField}（字段已失效）</option>}{mainFields.map((field) => <option key={field} value={field}>{field}</option>)}</select>
          <select aria-label={`第${index + 1}个关联表匹配字段`} title={join.joinField || '请选择关联表字段'} value={join.joinField} disabled={locked || !join.table} onChange={(event) => change(index, 'joinField', event.target.value)}><option value="" disabled>请选择关联表字段</option>{join.joinField && !joinFields.includes(join.joinField) && <option value={join.joinField}>{join.joinField}（字段已失效）</option>}{joinFields.map((field) => <option key={field} value={field}>{field}</option>)}</select>
          <button type="button" className="mapping-join-remove" aria-label={index === joins.length ? '取消添加关联表' : `移除关联表${join.table}`} title={index === joins.length ? '取消添加' : '移除关联表'} disabled={locked} onClick={() => void remove(index)}><Icon name="close" size={15}/></button>
        </div>
      })}
    </div>}
    {draft && <div className="mapping-join-draft-actions">{failed ? <><span role="alert">关联表配置尚未保存。</span><button type="button" className="mapping-inline-link" disabled={busy} onClick={() => void save(draft)}>重试保存</button></> : !busy && <span>请选择关联表及两端字段。</span>}<button type="button" className="mapping-inline-link" disabled={busy} onClick={() => { setDraft(null); setFailed(false) }}>撤销本次修改</button></div>}
  </section>
}
