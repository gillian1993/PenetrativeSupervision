import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { Button, Icon, Modal } from './ui'
import './knowledgeGraphDemo.css'

export { knowledgeGraphDemoBatch, withDemoBatch } from './knowledgeGraphDemoScope'
type AssetKind = 'model' | 'source' | 'graph'
interface DemoStatus { ready: boolean; version: number; failure: boolean; qualityError: boolean; delayMs: number; assets: Record<AssetKind, string[]> }
const initial: DemoStatus = { ready: false, version: 1, failure: false, qualityError: true, delayMs: 0, assets: { model: [], source: [], graph: [] } }
export async function demoRequest<T = DemoStatus>(path: string, body?: object): Promise<T> {
  const response = await fetch(`/api/knowledge-graph-demo/${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined)
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || '演示样例操作失败')
  return data as T
}
const useDemoStore = create<{ status: DemoStatus; all: boolean; refresh: () => Promise<void>; setAll: (all: boolean) => void }>((set) => ({
  status: initial, all: localStorage.getItem('knowledgeGraphScope') === 'all',
  refresh: async () => set({ status: await demoRequest('status') }),
  setAll: all => { localStorage.setItem('knowledgeGraphScope', all ? 'all' : 'demo'); set({ all }) },
}))
export function useKnowledgeGraphDemoScope() {
  const state = useDemoStore()
  useEffect(() => { void state.refresh().catch(() => {}) }, [])
  return { ...state, includes: (kind: AssetKind, id: string) => !state.status.ready || state.all || state.status.assets[kind].includes(id) }
}

export function KnowledgeGraphDemoBar() {
  const demo = useKnowledgeGraphDemoScope()
  const [busy, setBusy] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [message, setMessage] = useState('')
  const act = async (path: string, body: object, refreshPage = false) => {
    if (busy) return
    setBusy(true); setMessage('')
    try { await demoRequest(path, body); await demo.refresh(); if (refreshPage) window.location.reload(); else setMessage(path === 'control' ? '演示来源已更新，可测试连接或同步图谱查看结果。' : '演示样例已准备') }
    catch (error) { setMessage(error instanceof Error ? error.message : '操作失败') }
    finally { setBusy(false); setResetOpen(false) }
  }
  return <>
    <div className="kg-demo-bar">
      <div className="kg-demo-bar-label"><Icon name="graph" size={17}/><strong>{demo.status.ready ? '客户演示样例' : '知识图谱演示'}</strong><span>{demo.status.ready ? `${demo.status.assets.model.length} 个模型 · ${demo.status.assets.source.length} 个数据源 · ${demo.status.assets.graph.length} 个图谱` : '准备完整模型、来源与图谱样例'}</span></div>
      <div className="kg-demo-bar-actions">
        {demo.status.ready && <select aria-label="知识图谱数据范围" value={demo.all ? 'all' : 'demo'} onChange={event => demo.setAll(event.target.value === 'all')}><option value="demo">演示样例</option><option value="all">全部数据</option></select>}
        {demo.status.ready ? <details className="kg-demo-menu"><summary>演示工具<Icon name="chevron" size={13}/></summary><div>
          <small>虚构业务数据 · 当前数据包 V{demo.status.version}</small>
          <a href="/api/knowledge-graph-demo/files">下载完整 XLSX 样例</a><a href="/api/knowledge-graph-demo/files?kind=csv">下载供应商 CSV</a><a href="/api/knowledge-graph-demo/files?kind=invalid">下载缺标识错误样例</a>
          <button disabled={busy} onClick={() => void act('control', { version: demo.status.version === 1 ? 2 : 1 })}>切换至 V{demo.status.version === 1 ? 2 : 1} 数据包{demo.status.version === 1 ? '（新增供应商、合同金额变化）' : ''}</button>
          <button disabled={busy} onClick={() => void act('control', { delayMs: demo.status.delayMs ? 0 : 3000 })}>{demo.status.delayMs ? '关闭' : '开启'}同步过程演示（3秒延迟）</button>
          <button disabled={busy} onClick={() => void act('control', { failure: !demo.status.failure })}>{demo.status.failure ? '恢复异常接口连接' : '模拟接口连接异常'}</button>
          <button disabled={busy} onClick={() => void act('control', { failure: false, qualityError: false })}>修复质量样例来源</button>
          <button className="danger-link" disabled={busy} onClick={() => setResetOpen(true)}>恢复知识图谱演示样例</button>
        </div></details> : <Button disabled={busy} onClick={() => void act('prepare', {}, true)}>{busy ? '正在准备…' : '准备演示样例'}</Button>}
      </div>
    </div>
    {message && <div className="kg-demo-message" role="status">{message}</div>}
    <Modal open={resetOpen} title="恢复知识图谱演示样例" description="恢复本批次的模型、数据源、图谱及练习记录；非演示资产和历史监管证据保留。" confirmText={busy ? '正在恢复…' : '恢复初始样例'} danger onClose={() => { if (!busy) setResetOpen(false) }} onConfirm={() => void act('prepare', {}, true)}><p>演示期间对本批次资产的修改将被恢复。若演示资产已被其他规则、场景或业务记录引用，系统会阻止恢复并提示引用位置。</p></Modal>
  </>
}
