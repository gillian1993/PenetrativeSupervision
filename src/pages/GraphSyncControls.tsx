import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { dataGraphApi } from '../dataGraphApi'
import { useAppStore } from '../store'
import type { GraphSyncRecord, GraphVersion } from '../types'
import { Button, Drawer, EmptyState, Icon, ListPagination, ListStatus, Modal } from '../ui'

const syncDuration = (record: GraphSyncRecord) => record.durationMs == null
  ? record.status === '同步中' ? '进行中' : '—'
  : record.durationMs < 1000 ? '小于 1 秒' : `${Math.ceil(record.durationMs / 1000).toLocaleString()} 秒`

export function GraphSyncRecordList({ records, graphId, onViewVersion }: { records: GraphSyncRecord[]; graphId: string; onViewVersion: (id: string) => void }) {
  return <ol className="graph-sync-record-list" aria-label="同步历史记录">
    {records.map((record) => <li key={record.id}>
      <article className="graph-sync-record">
        <header>
          <div className="graph-sync-record-start"><Icon name="clock" size={15}/><span>{record.startedAt || '开始时间未知'}</span></div>
          <ListStatus>{record.status}</ListStatus>
        </header>
        <dl className="graph-sync-record-facts">
          <div><dt>同步耗时</dt><dd>{syncDuration(record)}</dd></div>
          <div><dt>完成时间</dt><dd>{record.finishedAt || '—'}</dd></div>
          <div><dt>实体数量</dt><dd>{record.entities == null ? '—' : record.entities.toLocaleString()}</dd></div>
          <div><dt>关系数量</dt><dd>{record.relations == null ? '—' : record.relations.toLocaleString()}</dd></div>
        </dl>
        {record.status === '失败' ? <div className="graph-sync-record-message failed"><Icon name="warning" size={16}/><div><strong>失败原因</strong><p>{record.errorMessage || '同步失败，请重试。'}</p></div></div>
          : record.status === '同步中' ? <div className="graph-sync-record-message processing"><Icon name="clock" size={16}/><p>正在读取来源数据，记录会自动更新。</p></div>
          : <div className="graph-sync-record-message completed"><Icon name="check" size={16}/><span>{record.resultGraphId ? record.resultGraphId === graphId ? '同步完成，数据已更新至当前版本' : '同步完成，已生成新的图谱版本' : '同步完成，生成版本已删除'}</span>{record.resultGraphId && record.resultGraphId !== graphId && <button type="button" onClick={() => onViewVersion(record.resultGraphId!)}>查看生成版本<Icon name="chevron" size={13}/></button>}</div>}
      </article>
    </li>)}
  </ol>
}

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
  const currentPage = Math.min(page, Math.max(1, Math.ceil(records.length / pageSize)))
  return createPortal(<Drawer open={Boolean(graph)} title="同步记录" eyebrow="知识图谱" className="graph-sync-drawer" onClose={onClose} footer={records.length && !error && !loading
    ? <ListPagination total={records.length} page={currentPage} pageSize={pageSize} onChange={(nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize) }}/>
    : <Button onClick={onClose}>关闭</Button>}>
    <section className="graph-sync-context" aria-label="当前知识图谱">
      <span className="graph-sync-context-icon"><Icon name="graph" size={20}/></span>
      <div><strong title={graph?.graphName || graph?.id}>{graph?.graphName || graph?.id || '知识图谱'}</strong><span>{graph?.graphCode || graph?.id || '—'}</span></div>
    </section>
    <div className="graph-sync-history-toolbar">
      <div className="graph-sync-history-title"><div><strong>同步历史</strong>{!loading && !error && <span>{records.length}</span>}</div><p>手动全量同步 · 最近 100 次</p></div>
      <div className="graph-sync-history-actions">
        {graph && graph.status !== '草稿' && latest?.status === '失败' && !loading && !error && <Button icon="refresh" onClick={() => onRetry({ ...graph, latestSync: latest })}>重试同步</Button>}
        <button type="button" className="icon-button" aria-label="刷新同步记录" title="刷新同步记录" disabled={loading} onClick={() => setRevision((value) => value + 1)}><Icon name="refresh" size={16}/></button>
      </div>
    </div>
    <div className="graph-sync-history-scroll" aria-busy={loading}>
      {loading ? <div className="graph-sync-history-state"><div className="loading-state"><i/><span>正在加载同步记录…</span></div></div>
        : error ? <div className="graph-sync-history-state"><div className="graph-sync-history-error" role="alert"><Icon name="warning" size={26}/><strong>同步记录加载失败</strong><p>{error}</p><Button onClick={() => setRevision((value) => value + 1)}>重新加载</Button></div></div>
        : records.length ? <GraphSyncRecordList records={records.slice((currentPage - 1) * pageSize, currentPage * pageSize)} graphId={graph?.id || ''} onViewVersion={(id) => { onClose(); navigate(`/graphs/results/${id}`) }}/>
        : <div className="graph-sync-history-state"><EmptyState title="暂无同步记录" description={graph?.syncedAt ? `当前数据生成于 ${graph.syncedAt}` : '执行数据同步后，可在这里查看进度和结果。'}/></div>}
    </div>
  </Drawer>, document.body)
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
      {createPortal(<Modal open={Boolean(target)} title="同步图谱数据" description={target?.graphName || target?.id} busy={Boolean(syncingId)} confirmText={syncingId ? '同步中…' : error ? '重试同步' : '开始同步'} onClose={() => { if (!submitting.current) setTarget(null) }} onConfirm={() => void submit()}>
        <div className="graph-sync-confirm">
          <p>{target?.status === '已发布' ? '按当前映射重新读取数据，生成新的待发布版本。当前已发布版本继续可用。' : '按当前映射重新读取数据，成功后替换当前图谱数据，状态仍为待发布。'}</p>
          <dl><div><dt>同步方式</dt><dd>全量同步</dd></div><div><dt>数据源</dt><dd>{target?.sourceNames.join('、') || target?.sourceIds.join('、') || '未绑定'}</dd></div></dl>
          <p className="graph-sync-file-note">文件导入使用已上传的文件；文件内容变化后，请先在数据源中更新文件。</p>
          {error && <div className="graph-sync-error" role="alert"><strong>同步未完成</strong><p>{error}</p><span>上一次成功生成的数据已保留。</span></div>}
        </div>
      </Modal>, document.body)}
      <SyncHistory graph={historyTarget} onClose={() => setHistoryTarget(null)} onRetry={openSync}/>
    </>,
  }
}
