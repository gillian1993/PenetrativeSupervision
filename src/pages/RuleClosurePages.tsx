import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { ruleClosureApi } from '../ruleClosureApi'
import { sceneRuleApi } from '../sceneRuleApi'
import type { RuleItem, SceneItem } from '../sceneRuleTypes'
import type { RiskLevel } from '../types'
import { useAppStore } from '../store'
import { Button, EmptyState, Field, FilterGrid, Icon, Modal, PageHeader, Panel, RiskTag, StatusTag } from '../ui'
import { SceneEditorPage as BaseSceneEditorPage } from './SceneRulePages'

const ruleTypes:RuleItem['type'][]=['属性','字段比对','关系路径','时序','聚合']
const levels:RiskLevel[]=['重大','高','中','低']
const messageOf=(error:unknown)=>error instanceof Error?error.message:'操作失败，请稍后重试'
const dateText=(value:unknown)=>value?new Date(String(value)).toLocaleString('zh-CN',{hour12:false}):'—'

export function SceneEditorWithRuleSelection(){
  const {id=''}=useParams();const setToast=useAppStore((state)=>state.setToast)
  const [reloadKey,setReloadKey]=useState(0);const [scene,setScene]=useState<SceneItem|null>(null);const [toolbar,setToolbar]=useState<Element|null>(null)
  const [open,setOpen]=useState(false);const [library,setLibrary]=useState<RuleItem[]>([]);const [selected,setSelected]=useState<string[]>([]);const [loading,setLoading]=useState(false)

  useEffect(()=>{void sceneRuleApi.getScene(id).then(setScene).catch(()=>setScene(null))},[id,reloadKey])
  useEffect(()=>{
    const locate=()=>{const target=[...document.querySelectorAll('.section-toolbar')].find((element)=>element.textContent?.includes('启用规则'))||null;setToolbar(target)}
    locate();const observer=new MutationObserver(locate);observer.observe(document.body,{childList:true,subtree:true});return()=>observer.disconnect()
  },[reloadKey])
  const editable=!!scene&&!['已发布','已停用'].includes(scene.status)
  const openLibrary=async()=>{setOpen(true);setSelected([]);setLoading(true);try{setLibrary(await ruleClosureApi.listLibrary(id))}catch(error){setToast(messageOf(error));setLibrary([])}finally{setLoading(false)}}
  const confirm=async()=>{if(!selected.length){setToast('请至少选择一条规则');return}try{const next=await ruleClosureApi.selectRules(id,selected);setScene(next);setOpen(false);setSelected([]);setReloadKey((value)=>value+1);setToast(`已建立${selected.length}条规则引用，规则内容未复制`)}catch(error){setToast(messageOf(error))}}
  const toggle=(versionId:string)=>setSelected((items)=>items.includes(versionId)?items.filter((item)=>item!==versionId):[...items,versionId])

  return <>
    <BaseSceneEditorPage key={reloadKey}/>
    {toolbar&&editable&&createPortal(<Button icon="link" onClick={()=>void openLibrary()}>选择已有规则</Button>,toolbar)}
    <Modal open={open} title="引用规则库规则" description="选择后建立引用关系，同一规则可以被多个场景使用，不会复制规则内容。" confirmText={`引用到场景${selected.length?`（${selected.length}）`:''}`} onClose={()=>setOpen(false)} onConfirm={()=>void confirm()}>
      {loading?<div className="loading-state"><i/><span>正在加载规则库…</span></div>:library.length===0?<EmptyState title="暂无可选择规则" description="请先在规则管理中新建独立规则，或当前规则均已被引用。"/>:<div className="rule-library-list">{library.map((rule)=><label key={rule.versionId} className={selected.includes(rule.versionId)?'selected':''}><input type="checkbox" checked={selected.includes(rule.versionId)} onChange={()=>toggle(rule.versionId)}/><div><strong>{rule.name}</strong><span>{rule.code} · {rule.domain||'通用'} · {rule.type}</span><small>{rule.summary}；当前被 {rule.bindingCount||0} 个场景版本引用</small></div><RiskTag level={rule.level}/></label>)}</div>}
    </Modal>
  </>
}

export function RuleManagementPage(){
  const navigate=useNavigate();const setToast=useAppStore((state)=>state.setToast)
  const [keyword,setKeyword]=useState('');const [rows,setRows]=useState<RuleItem[]>([]);const [scenes,setScenes]=useState<SceneItem[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState('')
  const [newOpen,setNewOpen]=useState(false);const [draft,setDraft]=useState({sceneId:'',name:'',code:'',type:'属性' as RuleItem['type'],level:'高' as RiskLevel})
  const editableScenes=useMemo(()=>scenes.filter((scene)=>!['已发布','已停用'].includes(scene.status)),[scenes])
  const load=async(nextKeyword=keyword)=>{setLoading(true);setError('');try{const [ruleRows,sceneRows]=await Promise.all([ruleClosureApi.listRules(nextKeyword),ruleClosureApi.listScenes()]);setRows(ruleRows);setScenes(sceneRows)}catch(err){setError(messageOf(err))}finally{setLoading(false)}}
  useEffect(()=>{void load('')},[])
  const openNew=()=>{const sceneId=editableScenes[0]?.id||'';setDraft({sceneId,name:'',code:'',type:'属性',level:'高'});setNewOpen(true)}
  const create=async()=>{if(!draft.sceneId){setToast('当前没有可编辑的场景草稿，请先新建或复制场景版本');return}if(!draft.name.trim()){setToast('规则名称不能为空');return}try{const rule=await sceneRuleApi.createRuleForScene(draft.sceneId,{name:draft.name,code:draft.code||undefined,type:draft.type,level:draft.level});setNewOpen(false);setToast('规则草稿已创建');navigate(`/rules/${rule.versionId}`)}catch(err){setToast(messageOf(err))}}
  const remove=async(rule:RuleItem)=>{if(!window.confirm(`确认删除草稿规则“${rule.name}”？已发布历史版本不会受到影响。`))return;try{await ruleClosureApi.deleteRule(rule.versionId);setToast('草稿规则已删除');await load()}catch(err){setToast(messageOf(err))}}
  const reset=()=>{setKeyword('');void load('')}

  return <>
    <PageHeader eyebrow="能力中心 / 规则管理" title="规则管理" description="集中查看规则，并完成新增、编辑和删除草稿规则的最小闭环。" actions={<><Button icon="refresh" onClick={()=>void load()}>刷新</Button><Button variant="primary" icon="plus" onClick={openNew}>新增规则</Button></>}/>
    <FilterGrid onReset={reset} onSearch={()=>void load()}><Field label="关键词"><input value={keyword} onChange={(event)=>setKeyword(event.target.value)} placeholder="规则名称、编码或所属场景"/></Field></FilterGrid>
    <Panel title="规则列表" subtitle="已发布规则只读；删除草稿规则不会影响历史发布版本">
      {loading?<div className="loading-state"><i/><span>正在加载规则…</span></div>:error?<div className="error-state"><Icon name="warning"/><div><strong>规则加载失败</strong><span>{error}</span></div><Button onClick={()=>void load()}>重试</Button></div>:rows.length===0?<EmptyState title="暂无规则" description="点击右上角“新增规则”创建第一条规则。"/>:<div className="table-container"><table><thead><tr><th>规则名称 / 编码</th><th>所属场景</th><th>类型</th><th>等级</th><th>条件摘要</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead><tbody>{rows.map((rule)=>{const canDelete=!['已发布','已停用'].includes(rule.sceneStatus||'');return <tr key={rule.versionId}><td><strong>{rule.name}</strong><small className="cell-sub">{rule.code}</small></td><td><button className="table-link" onClick={()=>navigate(`/scenes/${rule.sceneId}?tab=rules`)}>{rule.sceneName}</button></td><td>{rule.type}</td><td><RiskTag level={rule.level}/></td><td className="summary-cell">{rule.summary}</td><td><StatusTag>{rule.status}</StatusTag></td><td>{dateText(rule.updatedAt)}</td><td><div className="row-actions"><button onClick={()=>navigate(`/rules/${rule.versionId}`)}>{canDelete?'编辑':'查看'}</button>{canDelete&&<button className="danger-link" onClick={()=>void remove(rule)}>删除</button>}</div></td></tr>})}</tbody></table></div>}
    </Panel>
    <Modal open={newOpen} title="新增规则" description="选择所属场景后创建规则草稿。" confirmText="创建并编辑" onClose={()=>setNewOpen(false)} onConfirm={()=>void create()}><div className="form-stack">{editableScenes.length===0&&<div className="alert-box danger"><Icon name="warning"/><span>没有可编辑的场景版本，请先新建场景或从已发布场景复制新版本。</span></div>}<div className="form-section two-column"><Field label="所属场景 *"><select value={draft.sceneId} onChange={(event)=>setDraft({...draft,sceneId:event.target.value})}><option value="">请选择场景</option>{editableScenes.map((scene)=><option value={scene.id} key={scene.id}>{scene.name} · {scene.version} · {scene.status}</option>)}</select></Field><Field label="规则名称 *"><input value={draft.name} onChange={(event)=>setDraft({...draft,name:event.target.value})} placeholder="请输入规则名称"/></Field><Field label="规则编码"><input value={draft.code} onChange={(event)=>setDraft({...draft,code:event.target.value.toUpperCase()})} placeholder="留空自动生成"/></Field><Field label="规则类型"><select value={draft.type} onChange={(event)=>setDraft({...draft,type:event.target.value as RuleItem['type']})}>{ruleTypes.map((item)=><option key={item}>{item}</option>)}</select></Field><Field label="风险等级"><select value={draft.level} onChange={(event)=>setDraft({...draft,level:event.target.value as RiskLevel})}>{levels.map((item)=><option key={item}>{item}</option>)}</select></Field></div></div></Modal>
  </>
}
