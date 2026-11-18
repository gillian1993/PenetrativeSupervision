import { useEffect, useState } from 'react'
import { dataGraphApi, type GraphIssueItem, type GovernanceTaskItem, type MappingSnapshotItem } from '../dataGraphApi'
import type { GraphVersion } from '../types'
import { Button, EmptyState, Field, Icon, ListStatus, Modal } from '../ui'
import { demoRequest } from '../knowledgeGraphDemo'
import { useAppStore } from '../store'

export interface PublicationCheck { ready: boolean; blockers: number; warnings: number; entities: number; relations: number; checks: Array<{ label: string; passed: boolean; message: string }> }
export function GraphPublicationChecklist({ graphId }: { graphId: string }) {
  const [result, setResult] = useState<PublicationCheck | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { let active=true; void dataGraphApi.checkPublication(graphId).then(value => { if(active)setResult(value) }).catch(e => { if(active)setError(e.message) }); return () => { active=false } }, [graphId])
  if (error) return <p className="danger-text">{error}</p>
  if (!result) return <p role="status">正在检查实际实例和发布条件…</p>
  return <div className="kg-check-list">{result.checks.map(check => <div className="kg-check-row" key={check.label}><Icon name={check.passed ? 'check' : 'warning'} size={17}/><div><strong>{check.label}</strong><p>{check.message}</p></div><ListStatus>{check.passed ? '通过' : '未通过'}</ListStatus></div>)}</div>
}

export function GraphQualityPanel({ graph, tab, onChanged }: { graph: GraphVersion; tab: string; onChanged: () => Promise<void> }) {
  const toast = useAppStore(state => state.setToast)
  const [issues, setIssues] = useState<GraphIssueItem[]>([])
  const [tasks, setTasks] = useState<GovernanceTaskItem[]>([])
  const [snapshots, setSnapshots] = useState<MappingSnapshotItem[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [target, setTarget] = useState<{ task: GovernanceTaskItem; result: string } | null>(null)
  const [reason, setReason] = useState('')
  const load = async () => {
    setError('')
    try { const [a,b,c] = await Promise.all([dataGraphApi.issues(graph.id),dataGraphApi.governance(graph.id),dataGraphApi.mappingSnapshots(graph.id)]); setIssues(a);setTasks(b);setSnapshots(c) }
    catch(e) { setError(e instanceof Error ? e.message : '详情读取失败') }
  }
  useEffect(() => { void load() }, [graph.id,graph.entities,graph.blockers,tab])
  const run = async (operation: () => Promise<unknown>) => { if(busy)return;setBusy(true);try{await operation();await load();await onChanged()}catch(e){toast(e instanceof Error?e.message:'操作失败')}finally{setBusy(false)} }
  const name = (id: string) => graph.instanceDataset?.nodes.find(node => node.id === id)?.name || id
  return <div className="kg-quality-panel">
    {error && <p className="danger-text" role="alert">{error}</p>}
    {tab === 'quality' && <>
      <div className="kg-quality-toolbar"><strong>生成检查与质量问题</strong><div>{graph.status==='待发布'&&graph.sourceIds.includes('KG-DEMO-S-FAULT')&&<Button disabled={busy} onClick={() => void run(async()=>{await demoRequest('control',{failure:false,qualityError:false});await dataGraphApi.syncGraph(graph.id);toast('已应用修复数据并重新同步')})}>应用修复数据并同步</Button>}<Button icon="refresh" disabled={busy} onClick={() => void run(async()=>{const check=await dataGraphApi.checkPublication(graph.id);toast(`复检完成：${check.blockers} 个阻断、${check.warnings} 个警告`)})}>{busy?'正在检查…':'重新检查'}</Button></div></div>
      {issues.length ? <div className="kg-quality-issues">{issues.map(issue => <article className="kg-quality-issue" key={issue.id}><header><ListStatus>{issue.level}</ListStatus><strong>{issue.title}</strong><ListStatus>{issue.status}</ListStatus></header><p>{issue.description}</p><small>{issue.sourceRef}</small></article>)}</div> : <EmptyState title="没有质量阻断问题" description="可重新检查当前版本；源数据修复后需要重新生成或同步图谱。"/>}
    </>}
    {tab === 'governance' && <>
      <div className="kg-quality-toolbar"><strong>实例治理</strong><Button disabled={busy} onClick={() => void run(async()=>{await dataGraphApi.checkPublication(graph.id)})}>检查重复实体</Button></div>
      {graph.status==='已发布'&&<div className="alert-box"><Icon name="lock"/><span>已发布版本保留实例快照；请在待发布版本中处理治理任务。</span></div>}
      {tasks.length ? tasks.map(task => <article className="kg-governance-card" key={task.id}><header><strong>{task.objectType} · 疑似重复</strong><ListStatus>{task.status}</ListStatus></header><p>{task.candidates.map(name).join(' / ')}</p><p>{task.evidence}</p>{task.status==='已处理'?<p>处理结果：{task.result} · {task.reason}</p>:<footer><Button disabled={busy||graph.status!=='待发布'} onClick={()=>{setTarget({task,result:'保持独立'});setReason('')}}>保持独立</Button><Button disabled={busy||graph.status!=='待发布'} onClick={()=>{setTarget({task,result:'合并'});setReason('')}}>确认合并</Button></footer>}</article>) : <EmptyState title="暂无待确认的重复实体" description="系统根据同类实体相同的统一社会信用代码提出候选，由人工确认处理。"/>}
    </>}
    {tab === 'versions' && <>
      <div className="kg-version-card"><strong>结构与实例快照</strong><p>图谱模型：{graph.ontologyVersion} · 结构定义 {graph.structureElements?.length || 0} 项</p><p>实例 {graph.entities} 个 · 关系 {graph.relations} 条 · 生成时间 {graph.syncedAt || '尚未生成'}</p></div>
      {snapshots.map(snapshot => <article className="kg-version-card" key={snapshot.sourceId}><strong>{graph.sourceNames[graph.sourceIds.indexOf(snapshot.sourceId)] || snapshot.sourceId}</strong><p>映射 R{snapshot.revision} · {snapshot.mappingCount} 条 · {snapshot.createdAt}</p><details><summary>查看映射快照</summary><div className="table-container"><table><thead><tr><th>类型</th><th>来源字段/对象</th><th>目标</th><th>规则</th></tr></thead><tbody>{snapshot.rows.map(row=><tr key={row.id}><td>{row.type}</td><td>{row.sourceField}</td><td>{row.targetCode}</td><td>{row.transform}</td></tr>)}</tbody></table></div></details></article>)}
    </>}
    <Modal open={!!target} title={target?.result==='合并'?'确认合并实体':'保持候选实体独立'} description={target?.result==='合并'?'将保留首个实体、重连关联关系并保存处理前后快照。':'保留各自实体，记录判断依据。'} confirmText={busy?'正在处理…':'确认处理'} onClose={()=>{if(!busy)setTarget(null)}} onConfirm={()=>{if(!target||!reason.trim()||busy){toast('请填写处理原因');return}void run(async()=>{const result=await dataGraphApi.govern(graph.id,target.task.id,{result:target.result,reason});toast(result.message);setTarget(null)})}}><Field label="处理原因 *"><textarea value={reason} maxLength={500} onChange={event=>setReason(event.target.value)} placeholder="填写核验依据及处理理由"/></Field></Modal>
  </div>
}
