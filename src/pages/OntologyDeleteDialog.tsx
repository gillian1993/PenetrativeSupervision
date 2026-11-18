import { useEffect, useRef, useState } from 'react'
import { ontologyApi, type OntologyReferenceSummary } from '../ontologyApi'
import { Button, Icon, Modal } from '../ui'

interface Props {
  model: { id: string; name: string; status: string } | null
  onClose: () => void
  onConfirm: () => Promise<{ ok: boolean; message: string }>
}

export function OntologyDeleteDialog({ model, onClose, onConfirm }: Props) {
  const [referenceState, setReferenceState] = useState<{ id: string; value: OntologyReferenceSummary } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    setReferenceState(null); setError('')
    if (model) void ontologyApi.references(model.id).then(value => { if (active) setReferenceState({ id: model.id, value }) }).catch(e => { if (active) setError(e instanceof Error ? e.message : '引用检查失败') })
    return () => { active = false }
  }, [model?.id, revision])
  const references = referenceState?.id === model?.id ? referenceState?.value : null
  const allowed = Boolean(model && ['草稿', '停用'].includes(model.status) && references?.total === 0 && !error)
  const submit = async () => {
    if (!allowed || submitting.current) return
    submitting.current = true; setBusy(true)
    try {
      const result = await onConfirm()
      if (!result.ok) { setRevision(value => value + 1); setError(result.message) }
    } catch (e) { setError(e instanceof Error ? e.message : '删除失败') }
    finally { submitting.current = false; setBusy(false) }
  }
  return <Modal open={!!model} title="删除图谱模型" description={model ? `${model.name} · ${model.id} · ${model.status}` : ''} danger busy={busy} onClose={onClose} footer={<><Button disabled={busy} onClick={onClose}>取消</Button><Button variant="danger" disabled={!allowed || busy} onClick={() => void submit()}>{busy ? '正在删除…' : '确认删除'}</Button></>}>
    <div className="alert-box"><Icon name="warning"/><span>草稿或停用的模型在无引用时可以删除。删除后将从管理列表移除，模型结构和历史审计保留。</span></div>
    {!references && !error && <p role="status">正在检查模型引用…</p>}
    {error && <div role="alert"><p className="danger-text">{error}</p><Button onClick={() => setRevision(value => value + 1)}>重新检查</Button></div>}
    {references && (references.total === 0 ? <p role="status">未发现引用，可以删除。</p> : <div role="alert"><p className="danger-text">模型仍被引用，暂不能删除。请先解除以下引用：</p>{references.items.map(item => <section className="kg-version-card" key={item.type}><strong>{item.label} · {item.count}{item.unit}</strong><ul className="plain-list">{item.objects.map(object => <li key={object.id}>{object.name}<small className="cell-sub">{object.id}</small></li>)}</ul>{item.truncated && <small>仅展示前 {item.objects.length} 项，共 {item.count}{item.unit}。</small>}</section>)}</div>)}
  </Modal>
}
