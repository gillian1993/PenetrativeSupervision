import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { dataGraphApi } from '../dataGraphApi'
import { useAppStore } from '../store'
import type { GraphSyncRecord, GraphVersion } from '../types'
import { Button, Drawer, EmptyState, Icon, ListPagination, ListStatus, Modal } from '../ui'

export function GraphSyncSummary({ graph, busy, onClick }: { graph: GraphVersion; busy: boolean; onClick: () => void }) {
  const label = busy ? '同步中' : graph.latestSync?.status
  const time = graph.latestSync?.startedAt || graph.syncedAt
  return <button type="button" className="graph-sync-summary" onClick={onClick} title="查看同步记录" aria-label={`${graph.graphName || graph.id}的同步记录`}>
    {label ? <ListStatus>{label}</ListStatus> : <span>{time ? '已生成' : '未同步'}</span>}
    {time && <small>{time}</small>}
  </button>
}

function SyncHistory({ graph, onClose, onRetry }: { graph: GraphVersion | null; onClose: () => void; onRetry: (graph: GraphVersion) => void }) {
  const navigate = useNavigate()
  const [records, setRecords] = useState<GraphSyncRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  useEffect(() => { setPage(1) }, [graph?.id])
  useEffect(() => {
    if (!graph) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    setLoading(true)
    setRecords([])
    setError('')
    const load = async () => {
      try {
        const next = await dataGraphApi.graphSyncRecords(graph.id)
        if (cancelled) return
        setRecords(next)
        setError('')
        if (next.some((record) => record.status === '同步中')) timer = setTimeout(() => void load(), 2500)
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '同步记录获取失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [graph?.id, revision])

  const latest = records[0]
  return <Drawer open={Boolean(graph)} title="同步记录" eyebrow={graph?.graphName || graph?.id || '知识图谱'} className="graph-sync-drawer" onClose={onClose}>
    <div className="graph-sync-history-toolbar"><span>手动全量同步 · 最近 100 次</span><div>
      {graph && graph.status !== '草稿' && latest?.status === '失败' && !loading && !error && <Button icon="refresh" onClick={() => onRetry({ ...graph, latestSync: latest })}>重试同步</Button>}
      <button type="button" className="icon-button" aria-label="刷新同步记录" title="刷新同步记录" disabled={loading} onClick={() => setRevision((value) => value + 1)}><Icon name="refresh" size={16}/></button>
    </div></div>
    {loading ? <div className="loading-state"><i/><span>正在加载同步记录…</span></div> : error ? <div className="graph-sync-error" role="alert"><p>{error}</p><Button onClick={() => setRevision((value) => value + 1)}>重新加载</Button></div> : records.length ? <>
      <div className="table-container"><table className="graph-sync-history-table"><thead><tr><th>开始时间 / 耗时</th><th>结果</th><th>实体 / 关系</th><th>详情</th></tr></thead><tbody>{records.slice((page - 1) * pageSize, page * pageSize).map((record) => <tr key={record.id}>
        <td>{record.startedAt}<small className="cell-sub">{record.durationMs == null ? '进行中' : `${Math.max(1, Math.ceil(record.durationMs / 1000))} 秒`}</small></td>
        <td><ListStatus>{record.status}</ListStatus></td>
        <td>{record.entities == null ? '—' : `${record.entities.toLocaleString()} 个实体`}<small className="cell-sub">{record.relations == null ? '—' : `${record.relations.toLocaleString()} 条关系`}</small></td>
        <td>{record.status === '失败' ? <span className="danger-text">{record.errorMessage || '同步失败，请重试'}</span> : record.status === '同步中' ? '正在读取来源数据' : record.resultGraphId && record.resultGraphId !== graph?.id ? <button type="button" className="table-link" onClick={() => { onClose(); navigate(`/graphs/results/${record.resultGraphId}`) }}>查看生成版本</button> : record.resultGraphId ? '当前版本同步完成' : '生成版本已删除'}</td>
      </tr>)}</tbody></table></div>
      <ListPagination total={records.length} page={page} pageSize={pageSize} onChange={(nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize) }}/>
    </> : <EmptyState title="暂无同步记录" description={graph?.syncedAt ? `当前数据生成于 ${graph.syncedAt}` : '尚未执行数据同步。'}/>}
  </Drawer>
}

export function useGraphSync(onSettled: (updated: GraphVersion | null) => Promise<void> | void) {
  const setToast = useAppStore((state) => state.setToast)
  const [target, setTarget] = useState<GraphVersion | null>(null)
  const [historyTarget, setHistoryTarget] = useState<GraphVersion | null>(null)
  const [syncingId, setSyncingId] = useState('')
  const [error, setError] = useState('')
  const submitting = useRef(false)
  const busyFor = (graph: GraphVersion) => syncingId === graph.id || graph.latestSync?.status === '同步中'
  const openSync = (graph: GraphVersion) => {
    if (submitting.current || busyFor(graph) || graph.status === '草稿') return
    setHistoryTarget(null)
    setError('')
    setTarget(graph)
  }
  const submit = async () => {
    if (!target || submitting.current) return
    submitting.current = true
    setSyncingId(target.id)
    setError('')
    let updated: GraphVersion | null = null
    try {
      updated = await dataGraphApi.syncGraph(target.id)
      setTarget(null)
      setToast(updated.id === target.id ? '同步成功' : '同步成功，已生成待发布版本')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '同步失败，请稍后重试')
    } finally {
      try { await onSettled(updated) } catch { setToast('页面刷新失败，请刷新后查看同步记录') }
      submitting.current = false
      setSyncingId('')
    }
  }
  return {
    syncingId, busyFor, openSync, openHistory: setHistoryTarget,
    controls: <>
      <Modal open={Boolean(target)} title="同步图谱数据" description={target?.graphName || target?.id} busy={Boolean(syncingId)} confirmText={syncingId ? '同步中…' : error ? '重试同步' : '开始同步'} onClose={() => { if (!submitting.current) setTarget(null) }} onConfirm={() => void submit()}>
        <div className="graph-sync-confirm">
          <p>{target?.status === '已发布' ? '按当前映射重新读取数据，生成新的待发布版本。当前已发布版本继续可用。' : '按当前映射重新读取数据，成功后替换当前图谱数据，状态仍为待发布。'}</p>
          <dl><div><dt>同步方式</dt><dd>全量同步</dd></div><div><dt>数据源</dt><dd>{target?.sourceNames.join('、') || target?.sourceIds.join('、') || '未绑定'}</dd></div></dl>
          <p className="graph-sync-file-note">文件导入使用已上传的文件；文件内容变化后，请先在数据源中更新文件。</p>
          {error && <div className="graph-sync-error" role="alert"><strong>同步未完成</strong><p>{error}</p><span>上一次成功生成的数据已保留。</span></div>}
        </div>
      </Modal>
      <SyncHistory graph={historyTarget} onClose={() => setHistoryTarget(null)} onRetry={openSync}/>
    </>,
  }
}
