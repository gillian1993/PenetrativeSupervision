import { useEffect, useRef, useState } from 'react'
import type { DataSourceItem } from '../types'
import { Button, Icon, Modal } from '../ui'
import './sourceAccessDialog.css'

type AccessResult = { message: string; source?: DataSourceItem }
type AccessOperation = {
  kind: 'enable' | 'test' | 'save'
  mode: string
  name: string
  execute: () => Promise<AccessResult>
  onSuccess?: (result: AccessResult) => void
  onFailure?: () => Promise<void> | void
  onComplete?: () => void
  onEdit?: () => void
}
type AccessState = { operation: AccessOperation; phase: 'testing' | 'success' | 'failure'; message: string }

export function useSourceAccessDialog() {
  const [state, setState] = useState<AccessState | null>(null)
  const submitting = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  const run = async (operation: AccessOperation) => {
    if (submitting.current) return
    submitting.current = true
    setState({ operation, phase: 'testing', message: '' })
    try {
      const result = await operation.execute()
      if (!mounted.current) return
      operation.onSuccess?.(result)
      setState({ operation, phase: 'success', message: result.message })
    } catch (error) {
      if (!mounted.current) return
      setState({ operation, phase: 'failure', message: error instanceof Error ? error.message : '接入校验失败，请重试' })
      try { await operation.onFailure?.() } catch { /* Preserve the actionable test error. */ }
    } finally {
      submitting.current = false
    }
  }
  const close = () => {
    if (submitting.current) return
    setState(null)
    if (state?.phase === 'success') state.operation.onComplete?.()
  }
  const edit = () => { if (!submitting.current) { setState(null); state?.operation.onEdit?.() } }
  const busy = state?.phase === 'testing'
  const file = state?.operation.mode === '文件导入'
  const heading = state?.phase === 'testing' ? file ? '正在校验文件…' : '测试中…' : state?.phase === 'failure' ? file ? '文件校验失败' : '测试失败' : state?.operation.kind === 'enable' ? file ? '文件校验通过，数据源已启用' : '测试通过，数据源已启用' : state?.operation.kind === 'save' ? '校验通过，配置已保存' : '测试通过'
  const title = state?.operation.kind === 'enable' ? '启用数据源' : state?.operation.kind === 'save' ? '保存数据源配置' : '测试连接'
  const footer = busy ? <span className="source-access-wait">校验完成后可关闭</span> : state?.phase === 'failure' ? <><Button variant="primary" onClick={() => state && void run(state.operation)}>重新测试</Button>{state.operation.onEdit && <Button onClick={edit}>修改配置</Button>}</> : <Button variant="primary" onClick={close}>完成</Button>
  const dialog = <Modal open={Boolean(state)} title={title} description={state?.operation.name} eyebrow="接入校验" busy={busy} onClose={close} footer={footer}>
    <div className={`source-access-result ${state?.phase || ''}`} role={state?.phase === 'failure' ? 'alert' : 'status'} aria-live="polite">
      {busy ? <i className="source-access-spinner" aria-hidden="true"/> : <span className="source-access-result-icon"><Icon name={state?.phase === 'failure' ? 'warning' : 'check'} size={26}/></span>}
      <div><h3>{heading}</h3><p>{busy ? state?.operation.kind === 'enable' ? '通过后将自动启用数据源。' : state?.operation.kind === 'save' ? '新配置通过校验后生效，原有配置继续使用。' : '正在检查当前连接配置，请稍候。' : state?.message}</p></div>
    </div>
  </Modal>
  return { run, dialog, busy, open: Boolean(state) }
}
