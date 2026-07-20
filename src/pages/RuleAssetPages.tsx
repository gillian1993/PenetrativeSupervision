import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ruleClosureApi } from '../ruleClosureApi'
import { dataGraphApi } from '../dataGraphApi'
import { sceneRuleApi } from '../sceneRuleApi'
import type { ConditionGroup, OntologyElement, PathHop, RuleCondition, RuleItem, ValidationIssue } from '../sceneRuleTypes'
import { isConditionGroup } from '../sceneRuleTypes'
import type { RiskLevel } from '../types'
import { useAppStore } from '../store'
import { Button, EmptyState, Field, FilterGrid, Icon, Modal, PageHeader, Panel, RiskTag, StatusTag } from '../ui'

const ruleTypes:RuleItem['type'][]=['属性','字段比对','关系路径','时序','聚合']
const levels:RiskLevel[]=['重大','高','中','低']
const domains=['采购','合同','财务','投资','通用']
const defaultOutputs=['主体名称与编码','命中条件及实际值','来源记录与版本','规则执行时间']
const defaultEvidence=['业务来源记录','主体信息','规则运行明细']
const optionalOutputs=['关系路径','事件时间','聚合结果']
const optionalEvidence=['审批记录','联系方式来源','附件材料']
const fallbackElements:OntologyElement[]=[
  {id:'c1',type:'class',code:'PROC.Supplier',name:'供应商',dataType:'本体类',constraint:'',description:''},
  {id:'c2',type:'class',code:'PROC.PurchaseProject',name:'采购项目',dataType:'本体类',constraint:'',description:''},
  {id:'p1',type:'property',code:'PROC.Supplier.phone',name:'供应商联系电话',dataType:'文本',constraint:'',description:''},
  {id:'p2',type:'property',code:'PROC.Reviewer.phone',name:'评审人员联系电话',dataType:'文本',constraint:'',description:''},
  {id:'p3',type:'property',code:'PROC.Contract.change_rate',name:'合同金额变更比例',dataType:'数字',constraint:'',description:''},
  {id:'p4',type:'property',code:'PROC.Contract.change_amount',name:'合同变更金额',dataType:'金额',constraint:'',description:''},
  {id:'r1',type:'relation',code:'PROC.shared_contact',name:'共同使用',dataType:'联系方式 → 评审人员',constraint:'',description:''},
  {id:'e1',type:'event',code:'PROC.BidConfirmed',name:'中标确认',dataType:'采购项目事件',constraint:'',description:''},
]
type OntologyOption={id:string;name:string;status?:string;elements:OntologyElement[]}
type GraphOption={id:string;status:string;ontologyId:string}

const messageOf=(error:unknown)=>error instanceof Error?error.message:'操作失败，请稍后重试'
const dateText=(value:unknown)=>value?new Date(String(value)).toLocaleString('zh-CN',{hour12:false}):'—'
const unique=(items:string[])=>[...new Set(items.filter(Boolean))]
const configured=(rule:RuleItem)=>{
  if(['已发布','已停用'].includes(rule.status))return true
  if(rule.type==='关系路径')return rule.pathConfig.hops.length>0
  if(rule.type==='时序')return Boolean(rule.timeConfig.eventCode&&rule.timeConfig.windowValue)
  if(rule.type==='聚合')return Boolean(rule.aggregateConfig.fieldCode&&rule.aggregateConfig.threshold)
  return rule.conditions.items.some((item)=>!isConditionGroup(item)&&item.fieldCode&&item.operator&&(['为空','不为空'].includes(item.operator)||item.value||item.valueFieldCode))
}
const displayStatus=(rule:RuleItem)=>rule.status==='已发布'||rule.status==='已停用'?rule.status:configured(rule)?'已配置':'未完成'

export function RuleAssetManagementPage(){
  const navigate=useNavigate()
  const setToast=useAppStore((state)=>state.setToast)
  const [keyword,setKeyword]=useState('')
  const [rows,setRows]=useState<RuleItem[]>([])
  const [ontologies,setOntologies]=useState<OntologyOption[]>([])
  const [loading,setLoading]=useState(true)
  const [graphs,setGraphs]=useState<GraphOption[]>([])
  const [error,setError]=useState('')
  const [open,setOpen]=useState(false)
  const [draft,setDraft]=useState({name:'',code:'',type:'属性' as RuleItem['type'],level:'高' as RiskLevel,domain:'采购',ontologyId:'ONT-PROC',objectCode:'PROC.Supplier',objectName:'供应商',eventCode:'PROC.BidConfirmed',eventName:'中标确认',graphVersion:''})
  const ontology=ontologies.find((item)=>item.id===draft.ontologyId)
  const classes=(ontology?.elements||[]).filter((item)=>item.type==='class')
  const events=(ontology?.elements||[]).filter((item)=>item.type==='event')
  const availableGraphs=graphs.filter((item)=>item.ontologyId===draft.ontologyId)

  const load=async(nextKeyword=keyword)=>{
    setLoading(true);setError('')
    try{
      const [ruleRows,ontologyRows,graphRows]=await Promise.all([
        ruleClosureApi.listRules(nextKeyword),
        fetch('/api/ontologies').then((response)=>response.json()) as Promise<OntologyOption[]>,
        dataGraphApi.listGraphs('已发布'),
      ])
      const graphOntologyIds=new Set(graphRows.map((item)=>item.ontologyId))
      setRows(ruleRows)
      setOntologies(ontologyRows.filter((item)=>item.status==='已发布'&&item.elements?.some((element)=>element.type==='class')&&graphOntologyIds.has(item.id)))
      setGraphs(graphRows.map((item)=>({id:item.id,status:item.status,ontologyId:item.ontologyId})))
    }catch(err){setError(messageOf(err))}finally{setLoading(false)}
  }
  useEffect(()=>{void load('')},[])
  const openNew=()=>{
    const selected=ontologies.find((item)=>item.id==='ONT-PROC')||ontologies[0]
    const selectedClasses=(selected?.elements||[]).filter((item)=>item.type==='class')
    const selectedEvents=(selected?.elements||[]).filter((item)=>item.type==='event')
    const object=selectedClasses[0]
    const event=selectedEvents[0]
    const graph=graphs.find((item)=>item.ontologyId===selected?.id)
    setDraft({name:'',code:'',type:'属性',level:'高',domain:'采购',ontologyId:selected?.id||'',objectCode:object?.code||'',objectName:object?.name||'',eventCode:event?.code||'',eventName:event?.name||'',graphVersion:graph?.id||''})
    setOpen(true)
  }
  const chooseOntology=(ontologyId:string)=>{
    const selected=ontologies.find((item)=>item.id===ontologyId)
    const object=selected?.elements.find((item)=>item.type==='class')
    const event=selected?.elements.find((item)=>item.type==='event')
    const graph=graphs.find((item)=>item.ontologyId===ontologyId)
    setDraft({...draft,ontologyId,objectCode:object?.code||'',objectName:object?.name||'',eventCode:event?.code||'',eventName:event?.name||'',graphVersion:graph?.id||''})
  }
  const create=async()=>{
    if(!draft.name.trim()){setToast('规则名称不能为空');return}
    if(!draft.ontologyId||!draft.objectCode){setToast('请先选择已发布本体和主对象');return}
    if(!draft.graphVersion){setToast('请先选择与本体匹配的已发布图谱版本');return}
    try{
      const rule=await ruleClosureApi.createRule({...draft,code:draft.code||undefined})
      setOpen(false);setToast('独立规则草稿已创建，可被多个场景引用');navigate('/rules/'+rule.versionId)
    }catch(err){setToast(messageOf(err))}
  }
  const remove=async(rule:RuleItem)=>{
    if((rule.bindingCount||0)>0){setToast('该规则仍被场景引用，请先解除关联');return}
    if(!window.confirm('确认删除规则草稿“'+rule.name+'”？'))return
    try{await ruleClosureApi.deleteRule(rule.versionId);setToast('规则草稿已删除');await load()}catch(err){setToast(messageOf(err))}
  }

  return <>
    <PageHeader eyebrow="场景与规则 / 规则管理" title="规则库" description="规则作为独立、可版本化资产管理；同一规则可以被多个场景引用。" actions={<><Button icon="refresh" onClick={()=>void load()}>刷新</Button><Button variant="primary" icon="plus" onClick={openNew}>新增独立规则</Button></>}/>
    <FilterGrid onReset={()=>{setKeyword('');void load('')}} onSearch={()=>void load()}><Field label="关键词"><input value={keyword} onChange={(event)=>setKeyword(event.target.value)} placeholder="规则名称、编码或领域"/></Field></FilterGrid>
    <Panel title="规则资产列表" subtitle="删除规则与移出场景是两个独立操作；被场景引用的规则不可删除">
      {loading?<div className="loading-state"><i/><span>正在加载规则库…</span></div>:error?<div className="error-state"><Icon name="warning"/><div><strong>规则加载失败</strong><span>{error}</span></div><Button onClick={()=>void load()}>重试</Button></div>:rows.length===0?<EmptyState title="暂无规则资产" description="点击“新增独立规则”创建第一条可复用规则。"/>:<div className="table-container"><table><thead><tr><th>规则名称 / 编码</th><th>适用语义范围</th><th>判断类型</th><th>默认等级</th><th>场景引用</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead><tbody>{rows.map((rule)=>{const status=displayStatus(rule);const readonly=['已发布','已停用'].includes(status);const canDelete=!readonly&&(rule.bindingCount||0)===0;return <tr key={rule.versionId}><td><strong>{rule.name}</strong><small className="cell-sub">{rule.code} · {rule.version}</small></td><td>{rule.domain||'通用'}<small className="cell-sub">{rule.objectName||'未指定对象'} / {rule.eventName||'无目标事件'}</small></td><td>{rule.type}</td><td><RiskTag level={rule.defaultLevel||rule.level}/></td><td><strong>{rule.bindingCount||0} 个场景版本</strong><small className="cell-sub">{rule.sceneNames?.join('、')||'尚未被场景引用'}</small></td><td><StatusTag>{status}</StatusTag></td><td>{dateText(rule.updatedAt)}</td><td><div className="row-actions"><button onClick={()=>navigate('/rules/'+rule.versionId)}>{readonly?'查看':'配置'}</button>{canDelete&&<button className="danger-link" onClick={()=>void remove(rule)}>删除</button>}</div></td></tr>})}</tbody></table></div>}
    </Panel>
    <Modal open={open} title="新增独立规则" description="规则创建后进入规则库，可在一个或多个场景中引用。" confirmText="下一步：配置判断逻辑" onClose={()=>setOpen(false)} onConfirm={()=>void create()}>
      <div className="form-stack"><div className="form-section two-column">
        <Field label="规则名称 *"><input value={draft.name} onChange={(event)=>setDraft({...draft,name:event.target.value})} placeholder="例如：供应商与评审人员联系电话相同"/></Field>
        <Field label="规则编码"><input value={draft.code} onChange={(event)=>setDraft({...draft,code:event.target.value.toUpperCase()})} placeholder="留空自动生成"/></Field>
        <Field label="规则类型 *"><select value={draft.type} onChange={(event)=>setDraft({...draft,type:event.target.value as RuleItem['type']})}>{ruleTypes.map((item)=><option key={item}>{item}</option>)}</select></Field>
        <Field label="默认风险等级"><select value={draft.level} onChange={(event)=>setDraft({...draft,level:event.target.value as RiskLevel})}>{levels.map((item)=><option key={item}>{item}</option>)}</select></Field>
        <Field label="监管领域"><select value={draft.domain} onChange={(event)=>setDraft({...draft,domain:event.target.value})}>{domains.map((item)=><option key={item}>{item}</option>)}</select></Field>
        <Field label="适用本体"><select value={draft.ontologyId} onChange={(event)=>chooseOntology(event.target.value)}>{ontologies.map((item)=><option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>
        <Field label="主对象"><select value={draft.objectCode} onChange={(event)=>{const item=classes.find((candidate)=>candidate.code===event.target.value);setDraft({...draft,objectCode:event.target.value,objectName:item?.name||''})}}>{classes.map((item)=><option value={item.code} key={item.code}>{item.name}</option>)}</select></Field>
        <Field label="目标事件"><select value={draft.eventCode} onChange={(event)=>{const item=events.find((candidate)=>candidate.code===event.target.value);setDraft({...draft,eventCode:event.target.value,eventName:item?.name||''})}}><option value="">无固定目标事件</option>{events.map((item)=><option value={item.code} key={item.code}>{item.name}</option>)}</select></Field>
        <Field label="图谱版本"><select value={draft.graphVersion} onChange={(event)=>setDraft({...draft,graphVersion:event.target.value})}>{availableGraphs.map((item)=><option value={item.id} key={item.id}>{item.id}</option>)}</select></Field>
      </div></div>
    </Modal>
  </>
}

export function RuleAssetEditorPage(){
  const {id=''}=useParams()
  const navigate=useNavigate()
  const setToast=useAppStore((state)=>state.setToast)
  const [rule,setRule]=useState<RuleItem|null>(null)
  const [draft,setDraft]=useState<RuleItem|null>(null)
  const [ontologies,setOntologies]=useState<OntologyOption[]>([])
  const [editorGraphs,setEditorGraphs]=useState<GraphOption[]>([])
  const [elements,setElements]=useState<OntologyElement[]>([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [dirty,setDirty]=useState(false)
  const [issues,setIssues]=useState<ValidationIssue[]>([])
  const [advanced,setAdvanced]=useState(false)
  const readonly=!!rule&&['已发布','已停用'].includes(rule.status)

  const load=async()=>{
    setLoading(true);setError('')
    try{
      const [current,ontologyRows,graphRows]=await Promise.all([
        sceneRuleApi.getRule(id),
        fetch('/api/ontologies').then((response)=>response.json()) as Promise<OntologyOption[]>,
        dataGraphApi.listGraphs('已发布'),
      ])
      const graphOntologyIds=new Set(graphRows.map((item)=>item.ontologyId))
      setRule(current);setDraft(structuredClone(current))
      setOntologies(ontologyRows.filter((item)=>item.status==='已发布'&&item.elements?.some((element)=>element.type==='class')&&graphOntologyIds.has(item.id)))
      setEditorGraphs(graphRows.map((item)=>({id:item.id,status:item.status,ontologyId:item.ontologyId})))
      const found=ontologyRows.find((item)=>item.id===current.ontologyId)
      setElements(found?.elements || [])
    }catch(err){setError(messageOf(err))}finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[id])
  useEffect(()=>{const handler=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue=''}};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler)},[dirty])
  const patch=(next:Partial<RuleItem>)=>{if(!draft)return;setDraft({...draft,...next});setDirty(true);setIssues([])}
  const properties=elements.filter((item)=>item.type==='property')
  const relations=elements.filter((item)=>item.type==='relation')
  const events=elements.filter((item)=>item.type==='event')
  const classes=elements.filter((item)=>item.type==='class')
  const flatConditions=draft?draft.conditions.items.filter((item):item is RuleCondition=>!isConditionGroup(item)):[]
  const extraOutputs=draft?draft.outputs.filter((item)=>!defaultOutputs.includes(item)):[]
  const extraEvidence=draft?draft.evidence.filter((item)=>!defaultEvidence.includes(item)):[]
  const availableEditorGraphs=editorGraphs.filter((item)=>item.ontologyId===draft?.ontologyId)
  const addCondition=()=>{if(!draft)return;const field=properties[0];const condition:RuleCondition={id:'cond-'+Date.now(),fieldCode:field?.code||'',fieldName:field?.name||'',fieldType:field?.dataType||'文本',operator:'等于',valueMode:draft.type==='字段比对'?'field':'literal',value:'',valueFieldCode:'',valueFieldName:''};patch({conditions:{...draft.conditions,items:[...draft.conditions.items,condition]}})}
  const updateCondition=(conditionId:string,next:Partial<RuleCondition>)=>{if(!draft)return;patch({conditions:{...draft.conditions,items:draft.conditions.items.map((item)=>!isConditionGroup(item)&&item.id===conditionId?{...item,...next}:item)}})}
  const removeCondition=(conditionId:string)=>{if(!draft)return;patch({conditions:{...draft.conditions,items:draft.conditions.items.filter((item)=>item.id!==conditionId)}})}
  const relationCode=(hop:PathHop)=>relations.find((item)=>item.name===hop.relation)?.code||hop.relation
  const normalizedConditions=():ConditionGroup=>{
    if(!draft)return{id:'group-root',logic:'AND',items:[]}
    if(draft.type==='关系路径'){const hop=draft.pathConfig.hops[0];return{id:'group-root',logic:'AND',items:hop?[{id:'relation-condition',fieldCode:relationCode(hop),fieldName:hop.relation,fieldType:'关系',operator:'存在',valueMode:'literal',value:'true'}]:[]}}
    if(draft.type==='时序')return{id:'group-root',logic:'AND',items:draft.timeConfig.eventCode?[{id:'time-condition',fieldCode:draft.timeConfig.eventCode,fieldName:events.find((item)=>item.code===draft.timeConfig.eventCode)?.name||'事件',fieldType:'事件',operator:draft.timeConfig.direction||'之前',valueMode:'literal',value:String(draft.timeConfig.windowValue)+draft.timeConfig.windowUnit}]:[]}
    if(draft.type==='聚合')return{id:'group-root',logic:'AND',items:draft.aggregateConfig.fieldCode?[{id:'aggregate-condition',fieldCode:draft.aggregateConfig.fieldCode,fieldName:properties.find((item)=>item.code===draft.aggregateConfig.fieldCode)?.name||'聚合字段',fieldType:'聚合',operator:draft.aggregateConfig.operator,valueMode:'literal',value:String(draft.aggregateConfig.threshold)}]:[]}
    return draft.conditions
  }
  const composePayload=()=>{
    if(!draft)return null
    return{name:draft.name,domain:draft.domain,objectCode:draft.objectCode,objectName:draft.objectName,eventCode:draft.eventCode,eventName:draft.eventName,ontologyId:draft.ontologyId,graphVersion:draft.graphVersion,type:draft.type,level:draft.level,enabled:true,conditions:normalizedConditions(),pathConfig:draft.pathConfig,timeConfig:draft.timeConfig,aggregateConfig:draft.aggregateConfig,exceptions:draft.exceptions,outputs:unique([...defaultOutputs,...extraOutputs]),evidence:unique([...defaultEvidence,...extraEvidence]),policy:draft.policy,failureStrategy:draft.failureStrategy,lockVersion:rule?.lockVersion||draft.lockVersion}
  }
  const save=async(silent=false)=>{
    if(!draft||!rule)return null
    const payload=composePayload();if(!payload)return null
    try{const saved=await sceneRuleApi.updateRule(rule.versionId,payload);setRule(saved);setDraft(structuredClone(saved));setDirty(false);if(!silent)setToast('规则草稿已保存');return saved}catch(err){setToast(messageOf(err));return null}
  }
  const complete=async()=>{
    const saved=await save(true);if(!saved)return
    try{const result=await sceneRuleApi.validateRule(saved.versionId);if(result.blockers.length){setIssues(result.blockers);setToast('还有'+result.blockers.length+'项需要完成');return}setToast('规则配置完成，现在可以在多个场景中引用');navigate('/rules')}catch(err){setToast(messageOf(err))}
  }
  const cancel=()=>{if(dirty&&!window.confirm('当前修改尚未保存，确认放弃并返回规则库？'))return;navigate('/rules')}
  const changeOntology=(ontologyId:string)=>{
    const ontology=ontologies.find((item)=>item.id===ontologyId)
    const nextElements=ontology?.elements || []
    setElements(nextElements)
    const object=nextElements.find((item)=>item.type==='class')
    const event=nextElements.find((item)=>item.type==='event')
    const graph=editorGraphs.find((item)=>item.ontologyId===ontologyId)
    patch({ontologyId,graphVersion:graph?.id||'',objectCode:object?.code||'',objectName:object?.name||'',eventCode:event?.code||'',eventName:event?.name||'',conditions:{id:'group-root',logic:'AND',items:[]},pathConfig:{hops:[]}})
  }

  if(loading)return <div className="loading-state page-loading"><i/><span>正在加载规则配置…</span></div>
  if(error||!draft||!rule)return <div className="error-state page-error"><Icon name="warning"/><div><strong>规则加载失败</strong><span>{error||'规则不存在'}</span></div><Button onClick={()=>navigate('/rules')}>返回规则库</Button></div>
  const logicDone=configured({...draft,conditions:normalizedConditions()})
  const currentStatus=displayStatus({...draft,conditions:normalizedConditions()})
  return <>
    <div className="simple-rule-header"><div><button className="back-button" onClick={cancel}>‹ 返回规则库</button><p className="eyebrow">独立规则 / {rule.code} / {rule.version}</p><h1>{draft.name}</h1><div className="editor-meta"><StatusTag>{currentStatus}</StatusTag><span>{draft.type}</span><span>被 {draft.bindingCount||0} 个场景版本引用</span><span>{dirty?'存在未保存修改':'最近保存：'+dateText(rule.updatedAt)}</span></div></div>{readonly?<Button onClick={()=>navigate('/rules')}>返回规则库</Button>:<div className="page-actions"><Button onClick={cancel}>取消</Button><Button onClick={()=>void save()}>保存草稿</Button><Button variant="primary" onClick={()=>void complete()}>完成规则配置</Button></div>}</div>
    <div className="simple-rule-steps">{[{label:'基本信息',done:Boolean(draft.name&&draft.type)},{label:'判断逻辑',done:logicDone},{label:'默认结果',done:true},{label:'可供场景引用',done:logicDone}].map((step,index)=><div className={step.done?'done':''} key={step.label}><i>{step.done?'✓':index+1}</i><span>{step.label}</span></div>)}</div>
    <section className="rule-context-strip"><div><span>监管领域</span><strong>{draft.domain||'通用'}</strong></div><div><span>适用主对象</span><strong>{draft.objectName||'未指定'}</strong></div><div><span>目标事件</span><strong>{draft.eventName||'无固定事件'}</strong></div><div><span>本体版本</span><strong>{draft.ontologyId}</strong></div><div><span>引用场景</span><strong>{draft.bindingCount||0} 个版本</strong></div></section>
    <div className="simple-rule-layout">
      <main className="simple-rule-main">
        <Panel title="1. 规则基本信息" subtitle="规则独立于场景创建，适用语义范围用于场景选择时判断是否匹配"><div className="form-section two-column">
          <Field label="规则名称 *"><input value={draft.name} disabled={readonly} onChange={(event)=>patch({name:event.target.value})}/></Field>
          <Field label="规则编码"><input value={rule.code} disabled/></Field>
          <Field label="规则类型 *"><select value={draft.type} disabled={readonly} onChange={(event)=>patch({type:event.target.value as RuleItem['type'],conditions:{id:'group-root',logic:'AND',items:[]},pathConfig:{hops:[]}})}>{ruleTypes.map((item)=><option key={item}>{item}</option>)}</select></Field>
          <Field label="默认风险等级"><select value={draft.level} disabled={readonly} onChange={(event)=>patch({level:event.target.value as RiskLevel})}>{levels.map((item)=><option key={item}>{item}</option>)}</select></Field>
          <Field label="监管领域"><select value={draft.domain||'采购'} disabled={readonly} onChange={(event)=>patch({domain:event.target.value})}>{domains.map((item)=><option key={item}>{item}</option>)}</select></Field>
          <Field label="适用本体"><select value={draft.ontologyId} disabled={readonly} onChange={(event)=>changeOntology(event.target.value)}>{ontologies.map((item)=><option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>
          <Field label="主对象"><select value={draft.objectCode||''} disabled={readonly} onChange={(event)=>{const item=classes.find((candidate)=>candidate.code===event.target.value);patch({objectCode:event.target.value,objectName:item?.name||''})}}>{classes.map((item)=><option value={item.code} key={item.code}>{item.name}</option>)}</select></Field>
          <Field label="目标事件"><select value={draft.eventCode||''} disabled={readonly} onChange={(event)=>{const item=events.find((candidate)=>candidate.code===event.target.value);patch({eventCode:event.target.value,eventName:item?.name||''})}}><option value="">无固定目标事件</option>{events.map((item)=><option value={item.code} key={item.code}>{item.name}</option>)}</select></Field>
          <Field label="图谱版本"><select value={draft.graphVersion||''} disabled={readonly} onChange={(event)=>patch({graphVersion:event.target.value})}>{availableEditorGraphs.map((item)=><option value={item.id} key={item.id}>{item.id}</option>)}</select></Field>
        </div></Panel>
        <Panel title="2. 配置判断逻辑" subtitle={logicHelp(draft.type)}>
          {(draft.type==='属性'||draft.type==='字段比对')&&<ConditionRows conditions={flatConditions} properties={properties} readonly={readonly} fieldCompare={draft.type==='字段比对'} onAdd={addCondition} onUpdate={updateCondition} onRemove={removeCondition}/>}
          {draft.type==='关系路径'&&<div className="guided-logic"><div className="logic-origin"><span>起点对象</span><strong>{draft.objectName||'规则主对象'}</strong><small>规则适用语义范围</small></div>{draft.pathConfig.hops.map((hop,index)=><div className="guided-hop" key={String(index)}><i>{index+1}</i><select value={relationCode(hop)} disabled={readonly} onChange={(event)=>{const relation=relations.find((item)=>item.code===event.target.value);if(!relation)return;const parts=String(relation.dataType||'').split('→').map((item)=>item.trim());const hops=[...draft.pathConfig.hops];hops[index]={from:parts[0]||draft.objectName||'',relation:relation.name,to:parts[1]||'目标对象'};patch({pathConfig:{hops}})}}>{relations.map((item)=><option value={item.code} key={item.code}>{item.name} · {item.dataType}</option>)}</select><div><span>{hop.from}</span><Icon name="chevron"/><strong>{hop.relation}</strong><Icon name="chevron"/><span>{hop.to}</span></div>{!readonly&&<button onClick={()=>patch({pathConfig:{hops:draft.pathConfig.hops.filter((_,itemIndex)=>itemIndex!==index)}})}><Icon name="close" size={14}/></button>}</div>)}{!readonly&&draft.pathConfig.hops.length<2&&<div className="element-choice-grid">{relations.map((item)=><button key={item.code} onClick={()=>{const parts=String(item.dataType||'').split('→').map((value)=>value.trim());patch({pathConfig:{hops:[...draft.pathConfig.hops,{from:parts[0]||draft.objectName||'',relation:item.name,to:parts[1]||'目标对象'}]}})}}><Icon name="link"/><div><strong>添加到关系路径</strong><span>{item.name}</span><small>{item.dataType}</small></div></button>)}</div>}</div>}
          {draft.type==='时序'&&<div className="guided-logic"><div className="element-choice-grid">{events.map((item)=><button className={draft.timeConfig.eventCode===item.code?'selected':''} disabled={readonly} key={item.code} onClick={()=>patch({timeConfig:{...draft.timeConfig,eventCode:item.code}})}><Icon name="clock"/><div><strong>设为判断事件</strong><span>{item.name}</span><small>{item.code}</small></div></button>)}</div><div className="time-sentence"><span>该事件发生在场景目标事件</span><select value={draft.timeConfig.direction||'之前'} disabled={readonly} onChange={(event)=>patch({timeConfig:{...draft.timeConfig,direction:event.target.value}})}><option>之前</option><option>之后</option></select><input type="number" value={draft.timeConfig.windowValue} disabled={readonly} onChange={(event)=>patch({timeConfig:{...draft.timeConfig,windowValue:Number(event.target.value)}})}/><select value={draft.timeConfig.windowUnit} disabled={readonly} onChange={(event)=>patch({timeConfig:{...draft.timeConfig,windowUnit:event.target.value}})}><option>小时</option><option>天</option><option>月</option></select><span>以内</span></div></div>}
          {draft.type==='聚合'&&<div className="guided-logic"><div className="form-section two-column"><Field label="统计属性 *"><select value={draft.aggregateConfig.fieldCode} disabled={readonly} onChange={(event)=>patch({aggregateConfig:{...draft.aggregateConfig,fieldCode:event.target.value}})}><option value="">选择数字或金额属性</option>{properties.filter((item)=>/数字|金额/.test(item.dataType)).map((item)=><option value={item.code} key={item.code}>{item.name}</option>)}</select></Field><Field label="聚合函数"><select value={draft.aggregateConfig.function} disabled={readonly} onChange={(event)=>patch({aggregateConfig:{...draft.aggregateConfig,function:event.target.value}})}><option>COUNT</option><option>SUM</option><option>AVG</option><option>MAX</option></select></Field><Field label="判断条件"><select value={draft.aggregateConfig.operator} disabled={readonly} onChange={(event)=>patch({aggregateConfig:{...draft.aggregateConfig,operator:event.target.value}})}><option>大于</option><option>大于等于</option><option>等于</option><option>小于</option></select></Field><Field label="阈值"><input type="number" value={draft.aggregateConfig.threshold} disabled={readonly} onChange={(event)=>patch({aggregateConfig:{...draft.aggregateConfig,threshold:Number(event.target.value)}})}/></Field></div><div className="inherit-note"><Icon name="check"/><span>分组对象、观察周期和组织范围在场景引用时提供。</span></div></div>}
        </Panel>
        {issues.length>0&&<Panel title={'还有 '+issues.length+' 项需要完成'} className="simple-rule-issues">{issues.map((issue,index)=><div key={issue.field+'-'+index}><Icon name="warning"/><span>{issue.message}</span></div>)}</Panel>}
      </main>
      <aside className="simple-rule-result"><Panel title="3. 规则默认结果" subtitle="场景引用后可以使用场景自己的制度、组织范围和观察周期"><div className="result-summary-list"><section><span>默认风险等级</span><strong>{draft.level}风险</strong></section><section><span>命中输出</span><strong>系统默认 {defaultOutputs.length} 项</strong><p>{defaultOutputs.join('、')}</p></section><section><span>规则证据要求</span><strong>{defaultEvidence.length+extraEvidence.length} 项</strong><p>{unique([...defaultEvidence,...extraEvidence]).join('、')}</p></section><section><span>制度依据</span><strong>由引用场景统一配置</strong><p>同一规则在不同场景中可以使用不同制度和条款。</p></section><section><span>当前引用</span><strong>{draft.bindingCount||0} 个场景版本</strong><p>{draft.sceneNames?.join('、')||'规则尚未被场景引用'}</p></section></div>{!readonly&&<button className="advanced-toggle" onClick={()=>setAdvanced((value)=>!value)}>{advanced?'收起高级设置':'展开高级设置'} <Icon name="chevron" size={14}/></button>}{advanced&&!readonly&&<div className="advanced-settings"><Field label="补充命中输出"><div className="check-grid vertical">{optionalOutputs.map((item)=><label key={item}><input type="checkbox" checked={extraOutputs.includes(item)} onChange={()=>patch({outputs:draft.outputs.includes(item)?draft.outputs.filter((value)=>value!==item):unique([...draft.outputs,item])})}/><span>{item}</span></label>)}</div></Field><Field label="补充证据"><div className="check-grid vertical">{optionalEvidence.map((item)=><label key={item}><input type="checkbox" checked={extraEvidence.includes(item)} onChange={()=>patch({evidence:draft.evidence.includes(item)?draft.evidence.filter((value)=>value!==item):unique([...draft.evidence,item])})}/><span>{item}</span></label>)}</div></Field><Field label="规则级例外"><textarea value={draft.exceptions.description} onChange={(event)=>patch({exceptions:{...draft.exceptions,description:event.target.value,enabled:Boolean(event.target.value)}})} placeholder="不填写时由场景配置例外范围"/></Field></div>}</Panel><div className="next-action-card"><Icon name={logicDone?'check':'clock'}/><div><strong>{logicDone?'规则配置已完整':'请完成判断逻辑'}</strong><span>{logicDone?'完成后回到规则库，再由一个或多个场景选择引用。':'系统只检查规则自身的判断逻辑和默认结果。'}</span></div></div></aside>
    </div>
    {!readonly&&<footer className="editor-action-bar"><div><span className={dirty?'dirty-dot':''}/><strong>{dirty?'修改尚未保存':currentStatus}</strong><small>规则独立保存，不会自动归属于任何场景</small></div><div><Button onClick={cancel}>取消</Button><Button onClick={()=>void save()}>保存草稿</Button><Button variant="primary" onClick={()=>void complete()}>完成规则配置</Button></div></footer>}
  </>
}

function logicHelp(type:RuleItem['type']){return type==='属性'?'选择一个属性，与固定值进行比较。':type==='字段比对'?'选择两个属性进行比较。':type==='关系路径'?'从规则主对象出发，配置最多两跳关系。':type==='时序'?'配置判断事件和相对场景目标事件的时间窗口。':'配置统计属性、聚合函数和判断阈值。'}
function operatorsFor(element?:OntologyElement){const type=element?.dataType||'';if(/数字|金额|日期/.test(type))return['等于','不等于','大于','大于等于','小于','小于等于','为空','不为空'];return['等于','不等于','包含','不包含','为空','不为空']}
function ConditionRows({conditions,properties,readonly,fieldCompare,onAdd,onUpdate,onRemove}:{conditions:RuleCondition[];properties:OntologyElement[];readonly:boolean;fieldCompare:boolean;onAdd:()=>void;onUpdate:(id:string,next:Partial<RuleCondition>)=>void;onRemove:(id:string)=>void}){
  return <div className="simple-condition-list">{conditions.length>0&&<div className="simple-condition-head"><span>序号</span><span>判断属性</span><span>运算符</span><span>{fieldCompare?'对比属性':'比较值'}</span><span>操作</span></div>}{conditions.map((condition,index)=>{const element=properties.find((item)=>item.code===condition.fieldCode);const unary=['为空','不为空'].includes(condition.operator);return <div className="simple-condition" key={condition.id}><b>{index+1}</b><select value={condition.fieldCode} disabled={readonly} onChange={(event)=>{const next=properties.find((item)=>item.code===event.target.value);onUpdate(condition.id,{fieldCode:event.target.value,fieldName:next?.name||'',fieldType:next?.dataType||'',operator:'等于'})}}><option value="">选择判断属性</option>{properties.map((item)=><option value={item.code} key={item.code}>{item.name}</option>)}</select><select value={condition.operator} disabled={readonly} onChange={(event)=>{const operator=event.target.value;onUpdate(condition.id,{operator,value:['为空','不为空'].includes(operator)?'':condition.value})}}>{operatorsFor(element).map((item)=><option key={item}>{item}</option>)}</select>{unary?<div className="unary-value">无需比较值</div>:fieldCompare?<select value={condition.valueFieldCode||''} disabled={readonly} onChange={(event)=>{const next=properties.find((item)=>item.code===event.target.value);onUpdate(condition.id,{valueMode:'field',value:'',valueFieldCode:event.target.value,valueFieldName:next?.name||''})}}><option value="">选择对比属性</option>{properties.map((item)=><option value={item.code} key={item.code}>{item.name}</option>)}</select>:<input value={condition.value} disabled={readonly} onChange={(event)=>onUpdate(condition.id,{valueMode:'literal',value:event.target.value})} placeholder="输入比较值"/>}{!readonly&&<button onClick={()=>onRemove(condition.id)}><Icon name="close" size={14}/></button>}</div>})}{!conditions.length&&<EmptyState title="尚未配置判断条件" description={fieldCompare?'请选择两个属性进行比较。':'请选择一个属性并输入比较值。'}/>} {!readonly&&<Button icon="plus" onClick={onAdd}>添加判断条件</Button>}</div>
}

