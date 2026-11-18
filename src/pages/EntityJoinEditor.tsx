import { useState } from 'react'
import type { EntityJoin } from '../../graphMappingConfig'
import type { SourceMetadataItem } from '../dataGraphApi'
import { Button, Drawer, Field } from '../ui'

interface Props {
  mainTable: string
  metadata: SourceMetadataItem[]
  joins: EntityJoin[]
  disabled: boolean
  onChange: (joins: EntityJoin[]) => Promise<boolean>
}

export function EntityJoinEditor({ mainTable, metadata, joins, disabled, onChange }: Props) {
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState<EntityJoin>({ table: '', mainField: '', joinField: '' })
  const [error, setError] = useState('')
  const mainFields = metadata.find((item) => item.tableName === mainTable)?.fields || []
  const joinFields = metadata.find((item) => item.tableName === draft.table)?.fields || []
  const open = (index: number) => { setDraft(joins[index] || { table: '', mainField: '', joinField: '' }); setError(''); setEditing(index) }
  const save = async () => {
    if (editing === null) return
    if (!draft.table || !mainFields.includes(draft.mainField) || !joinFields.includes(draft.joinField)) { setError('请选择关联表及两端有效字段'); return }
    const next = [...joins]
    next[editing] = draft
    if (await onChange(next)) setEditing(null)
  }
  return <section className="mapping-join-section">
    <div className="mapping-join-heading"><strong>关联表 <small>可选，用于补充当前实体属性</small></strong><Button icon="plus" disabled={disabled} onClick={() => open(joins.length)}>添加关联表</Button></div>
    {joins.map((join, index) => <div className="mapping-join-item" key={join.table}>
      <div><strong>{join.table}</strong><small>{mainTable}.{join.mainField} ＝ {join.table}.{join.joinField}</small></div>
      <div className="mapping-row-actions"><button type="button" className="mapping-inline-link" disabled={disabled} onClick={() => open(index)}>编辑</button><button type="button" className="mapping-inline-link danger-link" disabled={disabled} onClick={() => { if (window.confirm('移除关联表后，引用其字段的属性和关系需要重新配置。确定移除吗？')) void onChange(joins.filter((_, position) => position !== index)) }}>移除</button></div>
    </div>)}
    <Drawer open={editing !== null} title={editing !== null && editing < joins.length ? '编辑关联表' : '添加关联表'} eyebrow="实体映射" onClose={() => { if (!disabled) setEditing(null) }} footer={<><Button variant="primary" disabled={disabled} onClick={() => void save()}>确定</Button><Button disabled={disabled} onClick={() => setEditing(null)}>取消</Button></>}>
      <fieldset className="form-stack mapping-join-fields" disabled={disabled}>
        <Field label="关联表 *"><select aria-label="关联表" value={draft.table} onChange={(event) => { setDraft({ ...draft, table: event.target.value, joinField: '' }); setError('') }}><option value="">请选择关联表 / 视图</option>{metadata.filter((item) => item.tableName !== mainTable && !joins.some((join, index) => index !== editing && join.table === item.tableName)).map((item) => <option key={item.id} value={item.tableName}>{item.tableName}{item.displayName !== item.tableName ? `（${item.displayName}）` : ''}</option>)}</select></Field>
        <Field label="主表关联字段 *"><select aria-label="主表关联字段" value={draft.mainField} onChange={(event) => { setDraft({ ...draft, mainField: event.target.value }); setError('') }}><option value="">请选择主表字段</option>{mainFields.map((field) => <option key={field} value={field}>{mainTable}.{field}</option>)}</select></Field>
        <Field label="关联表匹配字段 *"><select aria-label="关联表匹配字段" value={draft.joinField} disabled={!draft.table} onChange={(event) => { setDraft({ ...draft, joinField: event.target.value }); setError('') }}><option value="">请选择关联表字段</option>{joinFields.map((field) => <option key={field} value={field}>{draft.table}.{field}</option>)}</select></Field>
        <p className="mapping-form-help">保留全部主表记录，每条主表记录在关联表中最多匹配一条。</p>
        {error && <p role="alert" className="mapping-form-help mapping-form-help-error">{error}</p>}
      </fieldset>
    </Drawer>
  </section>
}
