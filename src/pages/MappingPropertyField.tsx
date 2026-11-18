import { Icon } from '../ui'

interface Props {
  groups: { table: string; fields: string[] }[]
  table: string
  field: string
  disabled: boolean
  label?: string
  onChange: (value: string) => void
}

export function MappingPropertyField({ groups, table, field, disabled, label = '属性来源字段', onChange }: Props) {
  const value = field ? JSON.stringify([table, field]) : ''
  const available = groups.some((group) => group.table === table && group.fields.includes(field))
  return <div className="mapping-property-select"><select aria-label={label} value={value} disabled={disabled} className={field && !available ? 'mapping-select-error' : undefined} aria-invalid={Boolean(field && !available)} onChange={(event) => onChange(event.target.value)}>
    <option value="">请选择来源字段</option>
    {field && !available && <option value={value}>{table}.{field}（来源已失效，请重新选择）</option>}
    {groups.map((group, index) => <optgroup key={group.table} label={`${index ? '关联表' : '主表'} · ${group.table}`}>{group.fields.map((item) => <option key={item} value={JSON.stringify([group.table, item])}>{group.table}.{item}</option>)}</optgroup>)}
  </select>{field && <button type="button" className="mapping-property-clear" title={`清除${label}`} aria-label={`清除${label}`} disabled={disabled} onClick={() => onChange('')}><Icon name="close" size={13}/></button>}</div>
}
