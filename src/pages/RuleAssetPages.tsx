import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ruleClosureApi } from '../ruleClosureApi'
import { dataGraphApi } from '../dataGraphApi'
import { sceneRuleApi } from '../sceneRuleApi'
import type { AggregateMetric, ConditionGroup, EvidenceRequirement, Logic, OntologyElement, PathHop, PolicyBasis, RuleCondition, RuleItem, TimeCondition, ValidationIssue } from '../sceneRuleTypes'
import { isConditionGroup } from '../sceneRuleTypes'
import type { RiskLevel } from '../types'
import { useAppStore } from '../store'
import { Button, Drawer, EmptyState, Field, FilterGrid, Icon, Modal, PageHeader, Panel, RiskTag, StatusTag } from '../ui'

const ruleTypes:RuleItem['type'][]=['属性','字段比对','关系路径','时序','聚合','高级表达式']
const ruleTypeHelp:Record<RuleItem['type'],string>={
  属性:'一个或多个属性与固定值比较',
  字段比对:'同一对象的两个属性相互比较',
  关系路径:'沿一至两跳关系查找并增加约束',
  时序:'判断窗口内相关事件是否发生',
  聚合:'对窗口内数据进行计数、求和或均值',
  高级表达式:'使用受控 DSL 组合字段、事件、关系和函数',
}
const levels:RiskLevel[]=['重大','高','中','低']
const domains=['采购','合同','财务','投资','通用']
const defaultOutputs=['主体名称与编码','命中条件及实际值','来源记录与版本','规则执行时间']
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
type RuleEditorStep='basic'|'logic'|'governance'
type GovernanceTab='policies'|'evidence'

const messageOf=(error:unknown)=>error instanceof Error?error.message:'操作失败，请稍后重试'
const dateText=(value:unknown)=>value?new Date(String(value)).toLocaleString('zh-CN',{hour12:false}):'—'
const unique=(items:string[])=>[...new Set(items.filter(Boolean))]
const outputsForRuleType=(type:RuleItem['type'])=>unique([...defaultOutputs,...(type==='关系路径'?['关系路径']:type==='时序'?['事件时间']:type==='聚合'?['聚合结果']:type==='高级表达式'?['表达式计算明细']:[])])
const expressionFunctions=['SUM','AVG','MAX','MIN','COUNT','COUNT_DISTINCT','EVENT_COUNT','EXISTS_PATH','DATE_DIFF','ABS'] as const
const expressionFunctionLabels:Record<string,string>={SUM:'求和',AVG:'平均值',MAX:'最大值',MIN:'最小值',COUNT:'计数',COUNT_DISTINCT:'去重计数',EVENT_COUNT:'事件次数',EXISTS_PATH:'存在关系路径',DATE_DIFF:'日期差',ABS:'绝对值'}
function advancedExpressionIssue(value:string){
  const expression=value.trim()
  if(!expression)return '请填写高级表达式'
  if(expression.length>2000)return '高级表达式不能超过2000个字符'
  if(/\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|EXEC|EVAL|IMPORT|REQUIRE|PROCESS|FETCH)\b/i.test(expression))return '表达式包含不允许使用的脚本或数据库关键字'
  if(!/^[\u4e00-\u9fa5A-Za-z0-9_.\s"'(),+\-*/%<>=!&|:]+$/.test(expression))return '表达式包含不支持的字符'
  let depth=0
  for(const char of expression){if(char==='(')depth+=1;if(char===')')depth-=1;if(depth<0)return '表达式括号不匹配'}
  if(depth!==0)return '表达式括号不匹配'
  if(((expression.match(/"/g)||[]).length%2)||((expression.match(/'/g)||[]).length%2))return '表达式引号不匹配'
  if(/^(AND|OR)\b|\b(AND|OR|NOT)$/i.test(expression))return '表达式不能以逻辑运算符开头或结尾'
  if(!/(==|!=|>=|<=|>|<|\bEXISTS_PATH\s*\()/i.test(expression))return '表达式必须包含比较判断或关系存在判断'
  const functions=[...expression.matchAll(/\b([A-Z][A-Z0-9_]*)\s*\(/g)].map((item)=>item[1])
  const unknown=functions.find((item)=>!expressionFunctions.includes(item as typeof expressionFunctions[number]))
  return unknown?`不支持函数 ${unknown}`:''
}
function advancedBusinessText(value:string,elements:OntologyElement[]){
  let text=value.trim()
  for(const element of [...elements].sort((a,b)=>b.code.length-a.code.length))text=text.replaceAll(element.code,`“${element.name}”`)
  text=text.replace(/\bAND\b/gi,'且').replace(/\bOR\b/gi,'或').replace(/\bNOT\b/gi,'非')
  for(const [name,label] of Object.entries(expressionFunctionLabels))text=text.replace(new RegExp(`\\b${name}\\b`,'g'),label)
  return text||'尚未填写高级表达式'
}
const routeParams=()=>new URLSearchParams(window.location.hash.split('?')[1]||'')
const configured=(rule:RuleItem)=>{
  if(['已发布','已停用'].includes(rule.status))return true
  if(rule.type==='高级表达式')return !advancedExpressionIssue(rule.conditions.expression||'')
  if(rule.type==='关系路径')return rule.pathConfig.hops.length>0
  if(rule.type==='时序')return Boolean(rule.timeConfig.conditions?.some((item)=>item.eventCode)&&rule.timeConfig.windowValue)
  if(rule.type==='聚合')return Boolean(rule.aggregateConfig.metrics?.some((item)=>item.fieldCode&&item.function&&item.operator&&Number.isFinite(Number(item.threshold))))
  return rule.conditions.items.some((item)=>!isConditionGroup(item)&&item.fieldCode&&item.operator&&(['为空','不为空'].includes(item.operator)||item.value||item.valueFieldCode))
}
const displayStatus=(rule:RuleItem)=>rule.status==='已发布'||rule.status==='已停用'?rule.status:configured(rule)?'已配置':'未完成'
const logicWord=(logic?:Logic)=>logic==='OR'?'或':'且'
function ruleExpression(rule:RuleItem,elements:OntologyElement[]=[]){
  const range=rule.timeConfig.baseline==='runtime'?'以规则运行时间为基准':`当“${rule.eventName||'目标事件'}”发生时`
  const window=`观察${rule.timeConfig.direction||'之前'}${rule.timeConfig.windowValue??30}${rule.timeConfig.windowUnit||'天'}`
  if(rule.type==='高级表达式'){
    const expression=rule.conditions.expression||''
    return expression?{business:`当${advancedBusinessText(expression,elements)}时命中。`,machine:expression}:{business:'尚未填写高级表达式。',machine:'尚未填写高级表达式'}
  }
  if(rule.type==='关系路径'){
    const path=rule.pathConfig.hops.map((item)=>`${item.from} → ${item.relation} → ${item.to}`).join('；')||'尚未配置关系路径'
    const constraints=rule.pathConfig.constraints||[]
    const detail=constraints.map((item)=>`${item.fieldName||item.fieldCode} ${item.operator} ${item.valueFieldName||item.value||''}`).join(` ${logicWord(rule.pathConfig.logic)} `)
    return{business:`按当前有效关系，沿“${path}”检查${detail||'关系是否存在'}。`,machine:`CURRENT_PATH(${path})${detail?` ${rule.pathConfig.logic||'AND'} ${detail}`:''}`}
  }
  if(rule.type==='时序'){
    const items=(rule.timeConfig.conditions||[]).map((item)=>`${item.eventName||item.eventCode}${item.requirement}`).join(` ${logicWord(rule.timeConfig.logic)} `)
    return{business:`${range}，${window}，要求${items||'至少配置一个判断事件'}。`,machine:`${rule.timeConfig.logic||'AND'}(${(rule.timeConfig.conditions||[]).map((item)=>`${item.requirement==='不得发生'?'NOT ':''}EVENT(${item.eventCode||'?'})`).join(', ')})`}
  }
  if(rule.type==='聚合'){
    const items=(rule.aggregateConfig.metrics||[]).map((item)=>`${item.function}(${item.fieldName||item.fieldCode}) ${item.operator} ${item.threshold}`).join(` ${logicWord(rule.aggregateConfig.logic)} `)
    return{business:`${range}，${window}，${items||'至少配置一个统计指标'}时命中。`,machine:`${rule.aggregateConfig.logic||'AND'}(${(rule.aggregateConfig.metrics||[]).map((item)=>`${item.function}(${item.fieldCode||'?'}) ${item.operator} ${item.threshold}`).join(', ')})`}
  }
  const items=rule.conditions.items.filter((item):item is RuleCondition=>!isConditionGroup(item)).map((item)=>`${item.fieldName||item.fieldCode} ${item.operator} ${item.valueFieldName||item.value||''}`)
  return{business:`按当前有效数据，${items.join(` ${logicWord(rule.conditions.logic)} `)||'至少配置一个判断条件'}时命中。`,machine:`CURRENT_${rule.conditions.logic}(${items.join(', ')})`}
}
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
  const [draft,setDraft]=useState({name:'',code:'',type:'属性' as RuleItem['type'],levelMode:'inherit' as 'inherit'|'override',level:'高' as RiskLevel,domain:'采购',ontologyId:'ONT-PROC',objectCode:'PROC.Supplier',objectName:'供应商',eventCode:'',eventName:'',graphVersion:''})
  const ontology=ontologies.find((item)=>item.id===draft.ontologyId)
  const classes=(ontology?.elements||[]).filter((item)=>item.type==='class')
  const events=(ontology?.elements||[]).filter((item)=>item.type==='event')
  const availableGraphs=graphs

  const load=async(nextKeyword=keyword)=>{
    setLoading(true);setError('')
    try{
      const [ruleRows,ontologyRows,graphRows]=await Promise.all([
        ruleClosureApi.listRules(nextKeyword),
        fetch('/api/ontologies').then((response)=>response.json()) as Promise<OntologyOption[]>,
        dataGraphApi.listGraphs('已发布'),
      ])
      const graphOntologyIds=new Set(graphRows.map((item)=>item.ontologyId))
      const availableOntologies=ontologyRows.filter((item)=>item.status==='已发布'&&item.elements?.some((element)=>element.type==='class')&&graphOntologyIds.has(item.id))
      const availableGraphRows=graphRows.map((item)=>({id:item.id,status:item.status,ontologyId:item.ontologyId}))
      setRows(ruleRows);setOntologies(availableOntologies);setGraphs(availableGraphRows)
      const params=routeParams()
      if(params.get('create')==='1'){
        const selected=availableOntologies.find((item)=>item.id==='ONT-PROC')||availableOntologies[0];const object=selected?.elements.find((item)=>item.type==='class');const graph=availableGraphRows.find((item)=>item.ontologyId===selected?.id)
        setDraft({name:'',code:'',type:'属性',levelMode:'inherit',level:'高',domain:'采购',ontologyId:selected?.id||'',objectCode:object?.code||'',objectName:object?.name||'',eventCode:'',eventName:'',graphVersion:graph?.id||''});setOpen(true)
      }
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
    setDraft({name:'',code:'',type:'属性',levelMode:'inherit',level:'高',domain:'采购',ontologyId:selected?.id||'',objectCode:object?.code||'',objectName:object?.name||'',eventCode:'',eventName:'',graphVersion:graph?.id||''})
    setOpen(true)
  }
  const chooseOntology=(ontologyId:string)=>{
    const selected=ontologies.find((item)=>item.id===ontologyId)
    const object=selected?.elements.find((item)=>item.type==='class')
    const event=selected?.elements.find((item)=>item.type==='event')
    const graph=graphs.find((item)=>item.ontologyId===ontologyId)
    setDraft({...draft,ontologyId,objectCode:object?.code||'',objectName:object?.name||'',eventCode:event?.code||'',eventName:event?.name||'',graphVersion:graph?.id||''})
  }
  const chooseGraph=(graphVersion:string)=>{
    const graph=graphs.find((item)=>item.id===graphVersion)
    const selected=ontologies.find((item)=>item.id===graph?.ontologyId)
    const object=selected?.elements.find((item)=>item.type==='class')
    const event=selected?.elements.find((item)=>item.type==='event')
    setDraft({...draft,graphVersion,ontologyId:graph?.ontologyId||'',objectCode:object?.code||'',objectName:object?.name||'',eventCode:event?.code||'',eventName:event?.name||''})
  }
  const create=async()=>{
    if(!draft.name.trim()){setToast('规则名称不能为空');return}
    if(!draft.ontologyId||!draft.objectCode){setToast('请先选择已发布本体和主对象');return}
    if(!draft.graphVersion){setToast('请先选择与本体匹配的已发布图谱版本');return}
    try{
      const sceneId=routeParams().get('sceneId')||''
      const rule=await ruleClosureApi.createRule({...draft,level:draft.levelMode==='inherit'?'继承场景':draft.level,code:draft.code||undefined})
      if(sceneId)await ruleClosureApi.selectRules(sceneId,[rule.versionId])
      setOpen(false);setToast(sceneId?'规则草稿已创建并关联当前场景':'独立规则草稿已创建，可被多个场景引用');navigate('/rules/'+rule.versionId+(sceneId?'?sceneId='+encodeURIComponent(sceneId):''))
    }catch(err){setToast(messageOf(err))}
  }
  const remove=async(rule:RuleItem)=>{
    if((rule.bindingCount||0)>0){setToast('该规则仍被场景引用，请先解除关联');return}
    if(!window.confirm('确认删除规则草稿“'+rule.name+'”？'))return
    try{await ruleClosureApi.deleteRule(rule.versionId);setToast('规则草稿已删除');await load()}catch(err){setToast(messageOf(err))}
  }

  return <>
    <PageHeader eyebrow="场景与规则 / 规则管理" title="规则管理" description="规则独立维护基本信息、检测口径、制度依据和证据要求，可被多个风险场景引用。" actions={<><Button icon="refresh" onClick={()=>void load()}>刷新</Button><Button variant="primary" icon="plus" onClick={openNew}>新增规则</Button></>}/>
    <FilterGrid onReset={()=>{setKeyword('');void load('')}} onSearch={()=>void load()}><Field label="关键词"><input value={keyword} onChange={(event)=>setKeyword(event.target.value)} placeholder="规则名称、编码或领域"/></Field></FilterGrid>
    <Panel title="规则资产列表" subtitle="删除规则与移出场景是两个独立操作；被场景引用的规则不可删除">
      {loading?<div className="loading-state"><i/><span>正在加载规则库…</span></div>:error?<div className="error-state"><Icon name="warning"/><div><strong>规则加载失败</strong><span>{error}</span></div><Button onClick={()=>void load()}>重试</Button></div>:rows.length===0?<EmptyState title="暂无规则资产" description="点击“新增规则”创建第一条可复用规则。"/>:<div className="table-container"><table><thead><tr><th>规则名称 / 编码</th><th>检测范围</th><th>判断类型</th><th>命中等级</th><th>依据与证据</th><th>场景引用</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead><tbody>{rows.map((rule)=>{const status=displayStatus(rule);const readonly=['已发布','已停用'].includes(status);const canDelete=!readonly&&(rule.bindingCount||0)===0;const deleteReason=readonly?'已发布或已停用规则不可删除':(rule.bindingCount||0)>0?`已被 ${rule.bindingCount} 个场景版本引用，请先解除关联`:'删除规则';return <tr key={rule.versionId}><td><strong>{rule.name}</strong><small className="cell-sub">{rule.code} · {rule.version}</small></td><td>{rule.objectName||'未配置主对象'}<small className="cell-sub">{rule.ontologyId||'未配置本体'} · {rule.graphVersion||'未配置图谱'}{(['时序','聚合'].includes(rule.type)&&rule.eventName)?` · ${rule.eventName}`:''}</small></td><td>{rule.type}</td><td>{rule.levelMode==='inherit'?<span>继承场景</span>:<RiskTag level={rule.defaultLevel||rule.level}/>}</td><td><strong>{rule.policies?.length||0} 条制度依据</strong><small className="cell-sub">{rule.evidenceRequirements?.length||rule.evidence.length} 项证据要求</small></td><td><strong>{rule.bindingCount||0} 个场景版本</strong><small className="cell-sub">{rule.sceneNames?.join('、')||'尚未被场景引用'}</small></td><td><StatusTag>{status}</StatusTag></td><td>{dateText(rule.updatedAt)}</td><td><div className="row-actions"><button onClick={()=>navigate('/rules/'+rule.versionId)}>{readonly?'查看':'编辑'}</button><span className="disabled-action-tip" title={deleteReason}><button className="danger-link" disabled={!canDelete} aria-label={`删除 ${rule.name}`} onClick={()=>void remove(rule)}>删除</button></span></div></td></tr>})}</tbody></table></div>}
    </Panel>
    <Modal open={open} title="新增风险规则" description={routeParams().get('sceneId')?'创建后自动关联当前风险场景。':'规则创建后进入规则管理，可被一个或多个场景引用。'} confirmText="下一步：完善规则" onClose={()=>setOpen(false)} onConfirm={()=>void create()}>
      <div className="form-stack"><div className="form-section two-column">
        <Field label="规则名称 *"><input value={draft.name} onChange={(event)=>setDraft({...draft,name:event.target.value})} placeholder="例如：供应商与评审人员联系电话相同"/></Field>
        <Field label="规则编码"><input value={draft.code} onChange={(event)=>setDraft({...draft,code:event.target.value.toUpperCase()})} placeholder="留空自动生成"/></Field>
        <Field label="规则类型 *"><select value={draft.type} onChange={(event)=>setDraft({...draft,type:event.target.value as RuleItem['type']})}>{ruleTypes.map((item)=><option key={item}>{item}</option>)}</select></Field>
        <Field label="命中风险等级"><select value={draft.levelMode==='inherit'?'inherit':draft.level} onChange={(event)=>event.target.value==='inherit'?setDraft({...draft,levelMode:'inherit'}):setDraft({...draft,levelMode:'override',level:event.target.value as RiskLevel})}><option value="inherit">继承场景默认等级</option>{levels.map((item)=><option value={item} key={item}>固定为：{item}</option>)}</select></Field>
        <Field label="监管领域"><select value={draft.domain} onChange={(event)=>setDraft({...draft,domain:event.target.value})}>{domains.map((item)=><option key={item}>{item}</option>)}</select></Field>
        <Field label="适用本体（由图谱带出）"><select value={draft.ontologyId} disabled>{ontologies.map((item)=><option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>
        <Field label="主对象"><select value={draft.objectCode} onChange={(event)=>{const item=classes.find((candidate)=>candidate.code===event.target.value);setDraft({...draft,objectCode:event.target.value,objectName:item?.name||''})}}>{classes.map((item)=><option value={item.code} key={item.code}>{item.name}</option>)}</select></Field>
        {draft.type==='时序'&&<Field label="目标事件"><select value={draft.eventCode} onChange={(event)=>{const item=events.find((candidate)=>candidate.code===event.target.value);setDraft({...draft,eventCode:event.target.value,eventName:item?.name||''})}}><option value="">请选择目标事件</option>{events.map((item)=><option value={item.code} key={item.code}>{item.name}</option>)}</select></Field>}
        <Field label="图谱版本"><select value={draft.graphVersion} onChange={(event)=>chooseGraph(event.target.value)}><option value="">请选择已发布图谱</option>{availableGraphs.map((item)=><option value={item.id} key={item.id}>{item.id}</option>)}</select></Field>
      </div></div>
    </Modal>
  </>
}

export function RuleAssetEditorPage(){
  const {id=''}=useParams()
  const navigate=useNavigate()
  const setToast=useAppStore((state)=>state.setToast)
  const sceneId=routeParams().get('sceneId')||''
  const returnPath=sceneId?`/scenes/${encodeURIComponent(sceneId)}?tab=rules`:'/rules'
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
  const [activeStep,setActiveStep]=useState<RuleEditorStep>('basic')
  const [governanceTab,setGovernanceTab]=useState<GovernanceTab>('policies')
  const [policyEditor,setPolicyEditor]=useState<{index:number;value:PolicyBasis}|null>(null)
  const [evidenceEditor,setEvidenceEditor]=useState<{index:number;value:EvidenceRequirement}|null>(null)
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
  const pathConstraints=draft?.pathConfig.constraints||[]
  const timeConditions=draft?.timeConfig.conditions||[]
  const aggregateMetrics=draft?.aggregateConfig.metrics||[]
  const advancedExpression=draft?.conditions.expression||''
  const advancedIssue=advancedExpressionIssue(advancedExpression)
  const usesTimeWindow=Boolean(draft&&(draft.type==='时序'||draft.type==='聚合'))
  const scopeBaseline=usesTimeWindow?(draft?.timeConfig.baseline||(draft?.eventCode?'event':'runtime')):'runtime'
  const conditionLogic:Logic=draft?(draft.type==='关系路径'?draft.pathConfig.logic:draft.type==='时序'?draft.timeConfig.logic:draft.type==='聚合'?draft.aggregateConfig.logic:draft.conditions.logic)||'AND':'AND'
  const conditionCount=draft?(draft.type==='高级表达式'?(advancedExpression.trim()?1:0):draft.type==='关系路径'?pathConstraints.length:draft.type==='时序'?timeConditions.length:draft.type==='聚合'?aggregateMetrics.length:flatConditions.length):0
  const policies=draft?.policies||[]
  const evidenceRequirements=draft?.evidenceRequirements||[]
  const governanceDone=policies.some((item)=>item.name.trim()&&item.clause.trim())&&evidenceRequirements.length>0&&evidenceRequirements.every((item)=>item.name.trim()&&item.source.trim()&&item.completeness.trim())
  const openPolicyEditor=(index=-1)=>setPolicyEditor({index,value:structuredClone(index>=0?policies[index]:{id:'policy-'+Date.now(),name:'',version:'',clause:'',text:''})})
  const savePolicyEditor=()=>{
    if(!policyEditor)return
    const value={...policyEditor.value,name:policyEditor.value.name.trim(),version:policyEditor.value.version.trim(),clause:policyEditor.value.clause.trim(),text:policyEditor.value.text?.trim()||''}
    if(!value.name||!value.clause){setToast('请填写制度名称和制度条款');return}
    patch({policies:policyEditor.index>=0?policies.map((item,index)=>index===policyEditor.index?value:item):[...policies,value]})
    setPolicyEditor(null)
  }
  const deletePolicy=(index:number)=>{if(window.confirm('确认删除这条制度依据？'))patch({policies:policies.filter((_,itemIndex)=>itemIndex!==index)})}
  const openEvidenceEditor=(index=-1)=>setEvidenceEditor({index,value:structuredClone(index>=0?evidenceRequirements[index]:{id:'evidence-'+Date.now(),name:'',source:'',sourceField:'',attachmentRequirement:'可选附件',completeness:'',description:''})})
  const saveEvidenceEditor=()=>{
    if(!evidenceEditor)return
    const value={...evidenceEditor.value,name:evidenceEditor.value.name.trim(),source:evidenceEditor.value.source.trim(),sourceField:evidenceEditor.value.sourceField.trim(),completeness:evidenceEditor.value.completeness.trim(),description:evidenceEditor.value.description.trim()}
    if(!value.name||!value.source||!value.completeness){setToast('请填写证据名称、数据来源和完整性要求');return}
    patch({evidenceRequirements:evidenceEditor.index>=0?evidenceRequirements.map((item,index)=>index===evidenceEditor.index?value:item):[...evidenceRequirements,value]})
    setEvidenceEditor(null)
  }
  const deleteEvidenceRequirement=(index:number)=>{if(window.confirm('确认删除这项证据要求？'))patch({evidenceRequirements:evidenceRequirements.filter((_,itemIndex)=>itemIndex!==index)})}
  const availableEditorGraphs=editorGraphs
  const newCondition=(fieldCompare=false,usedCodes:string[]=[]):RuleCondition=>{const field=properties.find((item)=>!usedCodes.includes(item.code))||properties[0];return{id:'cond-'+Date.now()+'-'+Math.random().toString(36).slice(2,6),fieldCode:field?.code||'',fieldName:field?.name||'',fieldType:field?.dataType||'文本',operator:'等于',valueMode:fieldCompare?'field':'literal',value:'',valueFieldCode:'',valueFieldName:''}}
  const addCondition=()=>{if(!draft)return;if(flatConditions.length>=10){setToast('单条规则最多支持10个判断条件');return}patch({conditions:{...draft.conditions,items:[...draft.conditions.items,newCondition(draft.type==='字段比对',flatConditions.map((item)=>item.fieldCode))]}})}
  const updateCondition=(conditionId:string,next:Partial<RuleCondition>)=>{if(!draft)return;patch({conditions:{...draft.conditions,items:draft.conditions.items.map((item)=>!isConditionGroup(item)&&item.id===conditionId?{...item,...next}:item)}})}
  const removeCondition=(conditionId:string)=>{if(!draft)return;patch({conditions:{...draft.conditions,items:draft.conditions.items.filter((item)=>item.id!==conditionId)}})}
  const setConditionLogic=(logic:Logic)=>{if(!draft)return;if(draft.type==='关系路径')patch({pathConfig:{...draft.pathConfig,logic}});else if(draft.type==='时序')patch({timeConfig:{...draft.timeConfig,logic}});else if(draft.type==='聚合')patch({aggregateConfig:{...draft.aggregateConfig,logic}});else patch({conditions:{...draft.conditions,logic}})}
  const addPathConstraint=()=>{if(!draft)return;if(pathConstraints.length>=10){setToast('关系路径最多支持10个约束条件');return}patch({pathConfig:{...draft.pathConfig,constraints:[...pathConstraints,newCondition(false,pathConstraints.map((item)=>item.fieldCode))]}})}
  const updatePathConstraint=(id:string,next:Partial<RuleCondition>)=>{if(!draft)return;patch({pathConfig:{...draft.pathConfig,constraints:pathConstraints.map((item)=>item.id===id?{...item,...next}:item)}})}
  const removePathConstraint=(id:string)=>{if(!draft)return;patch({pathConfig:{...draft.pathConfig,constraints:pathConstraints.filter((item)=>item.id!==id)}})}
  const addTimeCondition=()=>{if(!draft)return;if(timeConditions.length>=10){setToast('时序规则最多支持10个事件条件');return}const item=events.find((event)=>event.code!==draft.eventCode&&!timeConditions.some((condition)=>condition.eventCode===event.code))||events.find((event)=>event.code!==draft.eventCode)||events[0];const condition:TimeCondition={id:'time-'+Date.now(),eventCode:item?.code||'',eventName:item?.name||'',requirement:'必须发生'};patch({timeConfig:{...draft.timeConfig,conditions:[...timeConditions,condition]}})}
  const updateTimeCondition=(id:string,next:Partial<TimeCondition>)=>{if(!draft)return;patch({timeConfig:{...draft.timeConfig,conditions:timeConditions.map((item)=>item.id===id?{...item,...next}:item)}})}
  const removeTimeCondition=(id:string)=>{if(!draft)return;patch({timeConfig:{...draft.timeConfig,conditions:timeConditions.filter((item)=>item.id!==id)}})}
  const addAggregateMetric=()=>{if(!draft)return;if(aggregateMetrics.length>=3){setToast('聚合规则最多支持3个统计指标');return}const field=properties.find((item)=>/数字|金额/.test(item.dataType)&&!aggregateMetrics.some((metric)=>metric.fieldCode===item.code))||properties.find((item)=>/数字|金额/.test(item.dataType));const metric:AggregateMetric={id:'metric-'+Date.now(),function:'COUNT',fieldCode:field?.code||'',fieldName:field?.name||'',operator:'大于等于',threshold:1};patch({aggregateConfig:{...draft.aggregateConfig,metrics:[...aggregateMetrics,metric]}})}
  const updateAggregateMetric=(id:string,next:Partial<AggregateMetric>)=>{if(!draft)return;patch({aggregateConfig:{...draft.aggregateConfig,metrics:aggregateMetrics.map((item)=>item.id===id?{...item,...next}:item)}})}
  const removeAggregateMetric=(id:string)=>{if(!draft)return;patch({aggregateConfig:{...draft.aggregateConfig,metrics:aggregateMetrics.filter((item)=>item.id!==id)}})}
  const relationCode=(hop:PathHop)=>relations.find((item)=>item.name===hop.relation)?.code||hop.relation
  const normalizedConditions=():ConditionGroup=>{
    if(!draft)return{id:'group-root',logic:'AND',items:[]}
    if(draft.type==='关系路径'){
      const hop=draft.pathConfig.hops[0]
      const items=pathConstraints.length?pathConstraints:hop?[{id:'relation-condition',fieldCode:relationCode(hop),fieldName:hop.relation,fieldType:'关系',operator:'存在',valueMode:'literal' as const,value:'true'}]:[]
      return{id:'group-root',logic:draft.pathConfig.logic||'AND',items}
    }
    if(draft.type==='时序')return{id:'group-root',logic:draft.timeConfig.logic||'AND',items:timeConditions.map((item)=>({id:item.id,fieldCode:item.eventCode,fieldName:item.eventName||events.find((event)=>event.code===item.eventCode)?.name||'事件',fieldType:'事件',operator:item.requirement,valueMode:'literal' as const,value:`${draft.timeConfig.direction}${draft.timeConfig.windowValue}${draft.timeConfig.windowUnit}`}))}
    if(draft.type==='聚合')return{id:'group-root',logic:draft.aggregateConfig.logic||'AND',items:aggregateMetrics.map((item)=>({id:item.id,fieldCode:item.fieldCode,fieldName:item.fieldName||properties.find((field)=>field.code===item.fieldCode)?.name||'聚合字段',fieldType:'聚合',operator:`${item.function} ${item.operator}`,valueMode:'literal' as const,value:String(item.threshold)}))}
    return draft.conditions
  }
  const composePayload=()=>{
    if(!draft)return null
    const firstTime=timeConditions[0]
    const firstMetric=aggregateMetrics[0]
    const pathConfig={...draft.pathConfig,logic:draft.pathConfig.logic||'AND',constraints:pathConstraints}
    const timeConfig={...draft.timeConfig,baseline:usesTimeWindow?scopeBaseline:'runtime',logic:draft.timeConfig.logic||'AND',conditions:draft.type==='时序'?timeConditions:[],eventCode:draft.type==='时序'?(firstTime?.eventCode||''):'',windowValue:Number(draft.timeConfig.windowValue??30),windowUnit:draft.timeConfig.windowUnit||'天',direction:draft.timeConfig.direction||'之前'}
    const aggregateConfig={...draft.aggregateConfig,logic:draft.aggregateConfig.logic||'AND',metrics:aggregateMetrics,function:firstMetric?.function||'COUNT',fieldCode:firstMetric?.fieldCode||'',operator:firstMetric?.operator||'大于等于',threshold:Number(firstMetric?.threshold||0)}
    return{name:draft.name,domain:draft.domain,objectCode:draft.objectCode,objectName:draft.objectName,eventCode:usesTimeWindow&&scopeBaseline==='event'?draft.eventCode:'',eventName:usesTimeWindow&&scopeBaseline==='event'?draft.eventName:'',ontologyId:draft.ontologyId,graphVersion:draft.graphVersion,type:draft.type,level:draft.levelMode==='inherit'?'继承场景':draft.level,enabled:true,conditions:normalizedConditions(),pathConfig,timeConfig,aggregateConfig,exceptions:draft.exceptions,outputs:outputsForRuleType(draft.type),evidenceRequirements,policies,failureStrategy:draft.failureStrategy,lockVersion:rule?.lockVersion||draft.lockVersion}
  }
  const save=async(silent=false)=>{
    if(!draft||!rule)return null
    const payload=composePayload();if(!payload)return null
    try{const saved=await sceneRuleApi.updateRule(rule.versionId,payload);setRule(saved);setDraft(structuredClone(saved));setDirty(false);if(!silent)setToast('规则草稿已保存');return saved}catch(err){setToast(messageOf(err));return null}
  }
  const complete=async()=>{
    const saved=await save(true);if(!saved)return
    try{const result=await sceneRuleApi.validateRule(saved.versionId);if(result.blockers.length){setIssues(result.blockers);goToIssue(result.blockers[0]);setToast('还有'+result.blockers.length+'项需要完成');return}setToast(sceneId?'规则配置完成，已关联当前场景':'规则配置完成，现在可以在多个场景中引用');navigate(returnPath)}catch(err){setToast(messageOf(err))}
  }
  const cancel=()=>{if(dirty&&!window.confirm('当前修改尚未保存，确认放弃并返回？'))return;navigate(returnPath)}
  const changeRuleType=(type:RuleItem['type'])=>{if(!draft)return;const temporal=type==='时序'||type==='聚合';const baseline=temporal?scopeBaseline:'runtime';patch({type,eventCode:temporal&&baseline==='event'?draft.eventCode:'',eventName:temporal&&baseline==='event'?draft.eventName:'',conditions:{id:'group-root',logic:'AND',items:[]},pathConfig:{...draft.pathConfig,hops:[],logic:'AND',constraints:[]},timeConfig:{...draft.timeConfig,baseline,logic:'AND',conditions:[],eventCode:''},aggregateConfig:{...draft.aggregateConfig,logic:'AND',metrics:[],fieldCode:'',threshold:0}})}
  const changeOntology=(ontologyId:string)=>{
    const ontology=ontologies.find((item)=>item.id===ontologyId)
    const nextElements=ontology?.elements || []
    setElements(nextElements)
    const object=nextElements.find((item)=>item.type==='class')
    const event=nextElements.find((item)=>item.type==='event')
    const graph=editorGraphs.find((item)=>item.ontologyId===ontologyId)
    patch({ontologyId,graphVersion:graph?.id||'',objectCode:object?.code||'',objectName:object?.name||'',eventCode:usesTimeWindow&&scopeBaseline==='event'?event?.code||'':'',eventName:usesTimeWindow&&scopeBaseline==='event'?event?.name||'':'',conditions:{id:'group-root',logic:'AND',items:[]},pathConfig:{...draft!.pathConfig,hops:[],logic:'AND',constraints:[]},timeConfig:{...draft!.timeConfig,conditions:[],eventCode:''},aggregateConfig:{...draft!.aggregateConfig,metrics:[],fieldCode:'',threshold:0}})
  }
  const changeGraph=(graphVersion:string)=>{
    const graph=editorGraphs.find((item)=>item.id===graphVersion)
    const ontology=ontologies.find((item)=>item.id===graph?.ontologyId)
    const nextElements=ontology?.elements||[];setElements(nextElements)
    const object=nextElements.find((item)=>item.type==='class')
    const event=nextElements.find((item)=>item.type==='event')
    patch({graphVersion,ontologyId:graph?.ontologyId||'',objectCode:object?.code||'',objectName:object?.name||'',eventCode:usesTimeWindow&&scopeBaseline==='event'?event?.code||'':'',eventName:usesTimeWindow&&scopeBaseline==='event'?event?.name||'':'',conditions:{id:'group-root',logic:'AND',items:[]},pathConfig:{...draft!.pathConfig,hops:[],logic:'AND',constraints:[]},timeConfig:{...draft!.timeConfig,conditions:[],eventCode:''},aggregateConfig:{...draft!.aggregateConfig,metrics:[],fieldCode:'',threshold:0}})
  }


  if(loading)return <div className="loading-state page-loading"><i/><span>正在加载规则配置…</span></div>
  if(error||!draft||!rule)return <div className="error-state page-error"><Icon name="warning"/><div><strong>规则加载失败</strong><span>{error||'规则不存在'}</span></div><Button onClick={()=>navigate('/rules')}>返回规则库</Button></div>
  const validCondition=(item:RuleCondition)=>Boolean(item.fieldCode&&item.operator&&(['为空','不为空'].includes(item.operator)||item.value||item.valueFieldCode))
  const logicDone=draft.type==='高级表达式'
    ?!advancedIssue
    :draft.type==='关系路径'
      ?draft.pathConfig.hops.length>0&&pathConstraints.every(validCondition)
      :draft.type==='时序'
        ?timeConditions.length>0&&timeConditions.every((item)=>Boolean(item.eventCode))
        :draft.type==='聚合'
          ?aggregateMetrics.length>0&&aggregateMetrics.every((item)=>Boolean(item.fieldCode&&item.function&&item.operator&&Number.isFinite(Number(item.threshold))))
          :flatConditions.length>0&&flatConditions.every(validCondition)
  const currentStatus=displayStatus({...draft,conditions:normalizedConditions()})
  const basicDone=Boolean(draft.name.trim()&&draft.domain&&draft.levelMode)
  const scopeDone=Boolean(draft.ontologyId&&draft.graphVersion&&draft.objectCode&&(!usesTimeWindow||(Number(draft.timeConfig.windowValue)>0&&(scopeBaseline==='runtime'||draft.eventCode))))
  const dataLogicDone=scopeDone&&logicDone
  const allDone=basicDone&&dataLogicDone&&governanceDone
  const expression=ruleExpression(draft,elements)
  const editorSteps:Array<{key:RuleEditorStep;label:string;description:string;done:boolean;incomplete:string}>=[
    {key:'basic',label:'基本信息',description:'名称、领域与风险等级',done:basicDone,incomplete:'请先填写规则名称、监管领域和命中风险等级'},
    {key:'logic',label:'检测口径',description:'检测范围与多条件组合',done:dataLogicDone,incomplete:'请完成检测范围和判断条件配置'},
    {key:'governance',label:'依据与证据',description:'制度依据与证据要求',done:governanceDone,incomplete:'请至少配置一条制度依据和一项完整的证据要求'},
  ]
  const activeIndex=Math.max(0,editorSteps.findIndex((item)=>item.key===activeStep))
  const issueStep=(issue:ValidationIssue):RuleEditorStep=>issue.field==='name'?'basic':issue.field==='policy'||issue.field==='evidence'?'governance':'logic'
  const goToIssue=(issue:ValidationIssue)=>{const step=issueStep(issue);setActiveStep(step);if(step==='governance')setGovernanceTab(issue.field==='evidence'?'evidence':'policies')}
  const goNext=()=>{const current=editorSteps[activeIndex];if(!current.done){setToast(current.incomplete);return}if(activeIndex<editorSteps.length-1)setActiveStep(editorSteps[activeIndex+1].key)}
  const goPrevious=()=>{if(activeIndex>0)setActiveStep(editorSteps[activeIndex-1].key)}
  return <>
    <div className="simple-rule-header"><div><button className="back-button" onClick={cancel}>‹ {sceneId?'返回风险场景':'返回规则管理'}</button><p className="eyebrow">风险规则 / {rule.code} / {rule.version}</p><h1>{draft.name}</h1><div className="editor-meta"><StatusTag>{currentStatus}</StatusTag><span>{draft.type}</span><span>被 {draft.bindingCount||0} 个场景版本引用</span><span>{dirty?'存在未保存修改':'最近保存：'+dateText(rule.updatedAt)}</span></div></div></div>
    <nav className="rule-editor-tabs" aria-label="规则配置步骤">{editorSteps.map((step,index)=>{const hasIssue=issues.some((issue)=>issueStep(issue)===step.key);return <button type="button" className={[activeStep===step.key?'active':'',step.done?'done':'',hasIssue?'error':''].filter(Boolean).join(' ')} onClick={()=>setActiveStep(step.key)} key={step.key}><i>{step.done?'✓':index+1}</i><span><strong>{step.label}</strong><small>{step.description}</small></span></button>})}</nav>
    {issues.length>0&&<section className="rule-validation-banner"><div><Icon name="warning"/><span><strong>还有 {issues.length} 项需要完成</strong><small>点击问题可直接进入对应配置步骤</small></span></div><div>{issues.map((issue,index)=><button type="button" onClick={()=>goToIssue(issue)} key={issue.field+'-'+index}>{issue.message}</button>)}</div></section>}
    <main className="rule-step-content">
      {activeStep==='basic'&&<Panel title="1. 基本信息" subtitle="维护规则资产信息以及命中后的风险等级"><div className="form-section two-column">
        <Field label="规则名称 *"><input value={draft.name} disabled={readonly} onChange={(event)=>patch({name:event.target.value})}/></Field>
        <Field label="规则编码"><input value={rule.code} disabled/></Field>
        <Field label="监管领域 *"><select value={draft.domain||'采购'} disabled={readonly} onChange={(event)=>patch({domain:event.target.value})}>{domains.map((item)=><option key={item}>{item}</option>)}</select></Field>
        <Field label="命中风险等级"><select value={draft.levelMode==='inherit'?'inherit':draft.level} disabled={readonly} onChange={(event)=>event.target.value==='inherit'?patch({levelMode:'inherit'}):patch({levelMode:'override',level:event.target.value as RiskLevel})}><option value="inherit">继承场景默认等级</option>{levels.map((item)=><option value={item} key={item}>固定为：{item}</option>)}</select></Field>
        <Field label="规则版本"><input value={rule.version} disabled/></Field>
      </div><div className="rule-basic-summary"><div><span>当前状态</span><strong>{currentStatus}</strong></div><div><span>引用场景</span><strong>{draft.bindingCount||0} 个版本</strong></div><div><span>最近保存</span><strong>{dateText(rule.updatedAt)}</strong></div></div></Panel>}
      {activeStep==='logic'&&<Panel title="2. 检测口径" subtitle="单条规则绑定一套检测范围，并在范围内组合多条判断条件">
        <div className="rule-editor-section detection-scope-section">
          <header><div><strong>检测范围</strong><span>图谱和主对象始终必填；只有时序、聚合规则需要时间范围</span></div><em className={scopeDone?'complete':'pending'}>{scopeDone?'已完成':'待完成'}</em></header>
          <div className="form-section detection-scope-grid">
            <Field label="图谱版本 *"><select value={draft.graphVersion||''} disabled={readonly} onChange={(event)=>changeGraph(event.target.value)}><option value="">请选择已发布图谱</option>{availableEditorGraphs.map((item)=><option value={item.id} key={item.id}>{item.id}</option>)}</select></Field>
            <Field label="适用本体（由图谱带出）"><select value={draft.ontologyId} disabled>{ontologies.map((item)=><option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>
            <Field label="主对象 *"><select value={draft.objectCode||''} disabled={readonly} onChange={(event)=>{const item=classes.find((candidate)=>candidate.code===event.target.value);patch({objectCode:event.target.value,objectName:item?.name||''})}}>{classes.map((item)=><option value={item.code} key={item.code}>{item.name}</option>)}</select></Field>
            {usesTimeWindow&&<>
              <Field label="计算基准 *"><select value={scopeBaseline} disabled={readonly} onChange={(event)=>{const baseline=event.target.value as 'event'|'runtime';const target=events[0];patch({timeConfig:{...draft.timeConfig,baseline},eventCode:baseline==='event'?(draft.eventCode||target?.code||''):'',eventName:baseline==='event'?(draft.eventName||target?.name||''):''})}}><option value="event">目标事件发生时间</option><option value="runtime">规则运行时间</option></select></Field>
              {scopeBaseline==='event'&&<Field label="目标事件 *"><select value={draft.eventCode||''} disabled={readonly} onChange={(event)=>{const item=events.find((candidate)=>candidate.code===event.target.value);patch({eventCode:event.target.value,eventName:item?.name||''})}}><option value="">请选择目标事件</option>{events.map((item)=><option value={item.code} key={item.code}>{item.name}</option>)}</select></Field>}
              <Field label="观察窗口 *"><div className="scope-window-control"><select value={draft.timeConfig.direction||'之前'} disabled={readonly} onChange={(event)=>patch({timeConfig:{...draft.timeConfig,direction:event.target.value}})}><option>之前</option><option>之后</option></select><input type="number" min="1" value={draft.timeConfig.windowValue} disabled={readonly} onChange={(event)=>patch({timeConfig:{...draft.timeConfig,windowValue:Number(event.target.value)}})}/><select value={draft.timeConfig.windowUnit||'天'} disabled={readonly} onChange={(event)=>patch({timeConfig:{...draft.timeConfig,windowUnit:event.target.value}})}><option>小时</option><option>天</option><option>月</option></select></div></Field>
            </>}
          </div>
          <div className="scope-summary"><Icon name="graph"/><span>{usesTimeWindow?(scopeBaseline==='event'?`以“${draft.eventName||'未选择目标事件'}”为基准，检查${draft.timeConfig.direction}${draft.timeConfig.windowValue||0}${draft.timeConfig.windowUnit}`:`以规则运行时间为基准，检查${draft.timeConfig.direction}${draft.timeConfig.windowValue||0}${draft.timeConfig.windowUnit}`):'按规则运行时的当前有效数据判断，不设置观察窗口'}</span></div>
        </div>
        <div className="rule-editor-section detection-condition-section">
          <header><div><strong>判定方式与条件</strong><span>{logicHelp(draft.type)}</span></div><em className={logicDone?'complete':'pending'}>{logicDone?'已完成':'待完成'}</em></header>
          <div className="rule-type-grid">{ruleTypes.map((type,index)=><button type="button" className={draft.type===type?'selected':''} disabled={readonly} onClick={()=>changeRuleType(type)} key={type}><i>{index+1}</i><span><strong>{type}</strong><small>{ruleTypeHelp[type]}</small></span></button>)}</div>
          {draft.type!=='高级表达式'&&<LogicSelector logic={conditionLogic} count={conditionCount} readonly={readonly} onChange={setConditionLogic}/>}
          {(draft.type==='属性'||draft.type==='字段比对')&&<ConditionRows conditions={flatConditions} properties={properties} readonly={readonly} fieldCompare={draft.type==='字段比对'} onAdd={addCondition} onUpdate={updateCondition} onRemove={removeCondition}/>}
          {draft.type==='关系路径'&&<div className="guided-logic">
            <div className="logic-origin"><span>起点对象</span><strong>{draft.objectName||'规则主对象'}</strong><small>最多两跳关系</small></div>
            {draft.pathConfig.hops.map((hop,index)=><div className="guided-hop" key={String(index)}><i>{index+1}</i><select value={relationCode(hop)} disabled={readonly} onChange={(event)=>{const relation=relations.find((item)=>item.code===event.target.value);if(!relation)return;const parts=String(relation.dataType||'').split('→').map((item)=>item.trim());const hops=[...draft.pathConfig.hops];hops[index]={from:parts[0]||draft.objectName||'',relation:relation.name,to:parts[1]||'目标对象'};patch({pathConfig:{...draft.pathConfig,hops}})}}>{relations.map((item)=><option value={item.code} key={item.code}>{item.name} · {item.dataType}</option>)}</select><div><span>{hop.from}</span><Icon name="chevron"/><strong>{hop.relation}</strong><Icon name="chevron"/><span>{hop.to}</span></div>{!readonly&&<button onClick={()=>patch({pathConfig:{...draft.pathConfig,hops:draft.pathConfig.hops.filter((_,itemIndex)=>itemIndex!==index)}})}><Icon name="close" size={14}/></button>}</div>)}
            {!readonly&&draft.pathConfig.hops.length<2&&<div className="element-choice-grid">{relations.map((item)=><button key={item.code} onClick={()=>{const parts=String(item.dataType||'').split('→').map((value)=>value.trim());patch({pathConfig:{...draft.pathConfig,hops:[...draft.pathConfig.hops,{from:parts[0]||draft.objectName||'',relation:item.name,to:parts[1]||'目标对象'}]}})}}><Icon name="link"/><div><strong>添加到关系路径</strong><span>{item.name}</span><small>{item.dataType}</small></div></button>)}</div>}
            {draft.pathConfig.hops.length>0&&<div className="condition-subsection"><header><div><strong>路径约束（可选）</strong><span>对路径上的对象属性增加筛选条件</span></div><b>{pathConstraints.length}/10</b></header><ConditionRows conditions={pathConstraints} properties={properties} readonly={readonly} fieldCompare={false} onAdd={addPathConstraint} onUpdate={updatePathConstraint} onRemove={removePathConstraint}/></div>}
          </div>}
          {draft.type==='时序'&&<TimeConditionRows conditions={timeConditions} events={events} readonly={readonly} onAdd={addTimeCondition} onUpdate={updateTimeCondition} onRemove={removeTimeCondition}/>}
          {draft.type==='聚合'&&<AggregateMetricRows metrics={aggregateMetrics} properties={properties} readonly={readonly} onAdd={addAggregateMetric} onUpdate={updateAggregateMetric} onRemove={removeAggregateMetric}/>}
          {draft.type==='高级表达式'&&<AdvancedExpressionEditor expression={advancedExpression} elements={elements} readonly={readonly} onChange={(value)=>patch({conditions:{...draft.conditions,expression:value,expressionLanguage:'DSL'}})}/>}
          <div className="rule-expression-card"><header><div><Icon name="rules"/><span><strong>规则表达</strong><small>配置变化后自动生成，用于业务确认和系统执行</small></span></div></header><div><span>业务表达</span><p>{expression.business}</p></div><div><span>机器表达</span><code>{expression.machine}</code></div></div>
        </div>
        {!readonly&&<button className="advanced-toggle" onClick={()=>setAdvanced((value)=>!value)}>{advanced?'收起规则级例外':draft.exceptions.description?'修改规则级例外':'配置规则级例外'} <Icon name="chevron" size={14}/></button>}
        {advanced&&!readonly&&<div className="advanced-settings"><Field label="规则级例外"><textarea value={draft.exceptions.description} onChange={(event)=>patch({exceptions:{...draft.exceptions,description:event.target.value,enabled:Boolean(event.target.value)}})} placeholder="说明白名单、特殊授权或不适用情形"/></Field></div>}
        {readonly&&draft.exceptions.description&&<div className="rule-exception-readonly"><strong>规则级例外</strong><p>{draft.exceptions.description}</p></div>}
      </Panel>}
      {activeStep==='governance'&&<Panel title="3. 依据与证据" subtitle="配置态统一使用“证据要求”，规则运行后才形成“实际证据”"><nav className="governance-subtabs"><button type="button" className={governanceTab==='policies'?'active':''} onClick={()=>setGovernanceTab('policies')}>制度依据 <b>{policies.length}</b></button><button type="button" className={governanceTab==='evidence'?'active':''} onClick={()=>setGovernanceTab('evidence')}>证据要求 <b>{evidenceRequirements.length}</b></button></nav>
        {governanceTab==='policies'&&<section className="governance-list"><div className="section-toolbar compact"><div><strong>制度依据</strong><span>说明规则判定所依据的制度、版本和具体条款</span></div>{!readonly&&<Button icon="plus" onClick={()=>openPolicyEditor()}>新增制度依据</Button>}</div>{policies.length?<div className="table-container"><table><thead><tr><th>制度名称</th><th>制度版本</th><th>制度条款</th><th>条款原文</th><th>操作</th></tr></thead><tbody>{policies.map((policy,index)=><tr key={policy.id||index}><td><strong>{policy.name||'未填写'}</strong></td><td>{policy.version||'—'}</td><td>{policy.clause||'未填写'}</td><td><span className="table-text-ellipsis">{policy.text||'—'}</span></td><td><div className="row-actions"><button onClick={()=>openPolicyEditor(index)}>{readonly?'查看':'编辑'}</button>{!readonly&&<button className="danger-link" onClick={()=>deletePolicy(index)}>删除</button>}</div></td></tr>)}</tbody></table></div>:<div className="governance-empty"><EmptyState title="尚未配置制度依据" description="至少添加一条制度名称和条款后才能完成规则配置。"/></div>}</section>}
        {governanceTab==='evidence'&&<section className="governance-list"><div className="section-toolbar compact"><div><strong>证据要求</strong><span>定义规则命中后系统需要固化的数据和附件要求</span></div>{!readonly&&<Button icon="plus" onClick={()=>openEvidenceEditor()}>新增证据要求</Button>}</div>{evidenceRequirements.length?<div className="table-container"><table><thead><tr><th>证据名称</th><th>数据来源</th><th>来源字段</th><th>附件要求</th><th>完整性要求</th><th>操作</th></tr></thead><tbody>{evidenceRequirements.map((item,index)=><tr key={item.id||index}><td><strong>{item.name||'未填写'}</strong></td><td>{item.source||'未填写'}</td><td>{item.sourceField||'—'}</td><td>{item.attachmentRequirement}</td><td><span className="table-text-ellipsis">{item.completeness||'未填写'}</span></td><td><div className="row-actions"><button onClick={()=>openEvidenceEditor(index)}>{readonly?'查看':'编辑'}</button>{!readonly&&<button className="danger-link" onClick={()=>deleteEvidenceRequirement(index)}>删除</button>}</div></td></tr>)}</tbody></table></div>:<div className="governance-empty"><EmptyState title="尚未配置证据要求" description="至少配置一项证据名称、数据来源和完整性要求。"/></div>}</section>}
        <div className="next-action-card"><Icon name={allDone?'check':'clock'}/><div><strong>{allDone?'规则配置已完整':'规则仍有未完成配置'}</strong><span>{allDone?`命中输出将由系统按${draft.type}规则自动生成：${outputsForRuleType(draft.type).join('、')}`:'请根据顶部步骤状态补齐缺失信息。'}</span></div></div></Panel>}
    </main>
    {!readonly&&<footer className="editor-action-bar"><div><span className={dirty?'dirty-dot':''}/><strong>{dirty?'修改尚未保存':currentStatus}</strong><small>{sceneId?'保存后返回当前风险场景':'规则独立保存，可由多个场景选择引用'}</small></div><div><Button onClick={cancel}>取消</Button>{activeIndex>0&&<Button onClick={goPrevious}>上一步</Button>}<Button onClick={()=>void save()}>保存草稿</Button>{activeIndex<editorSteps.length-1?<Button variant="primary" onClick={goNext}>下一步</Button>:<Button variant="primary" onClick={()=>void complete()}>完成规则配置</Button>}</div></footer>}
    {policyEditor&&<Drawer open title={policyEditor?.index===-1?'新增制度依据':'制度依据详情'} eyebrow="依据与证据" onClose={()=>setPolicyEditor(null)} footer={readonly?<Button onClick={()=>setPolicyEditor(null)}>关闭</Button>:<><Button onClick={()=>setPolicyEditor(null)}>取消</Button><Button variant="primary" onClick={savePolicyEditor}>保存</Button></>}>{policyEditor&&<div className="form-stack"><Field label="制度名称 *"><input value={policyEditor.value.name} disabled={readonly} onChange={(event)=>setPolicyEditor({...policyEditor,value:{...policyEditor.value,name:event.target.value}})}/></Field><Field label="制度版本"><input value={policyEditor.value.version} disabled={readonly} onChange={(event)=>setPolicyEditor({...policyEditor,value:{...policyEditor.value,version:event.target.value}})}/></Field><Field label="制度条款 *"><input value={policyEditor.value.clause} disabled={readonly} onChange={(event)=>setPolicyEditor({...policyEditor,value:{...policyEditor.value,clause:event.target.value}})} placeholder="例如：第十二条"/></Field><Field label="条款原文"><textarea value={policyEditor.value.text||''} disabled={readonly} onChange={(event)=>setPolicyEditor({...policyEditor,value:{...policyEditor.value,text:event.target.value}})}/></Field></div>}</Drawer>}
    {evidenceEditor&&<Drawer open title={evidenceEditor?.index===-1?'新增证据要求':'证据要求详情'} eyebrow="依据与证据" onClose={()=>setEvidenceEditor(null)} footer={readonly?<Button onClick={()=>setEvidenceEditor(null)}>关闭</Button>:<><Button onClick={()=>setEvidenceEditor(null)}>取消</Button><Button variant="primary" onClick={saveEvidenceEditor}>保存</Button></>}>{evidenceEditor&&<div className="form-stack"><Field label="证据名称 *"><input value={evidenceEditor.value.name} disabled={readonly} onChange={(event)=>setEvidenceEditor({...evidenceEditor,value:{...evidenceEditor.value,name:event.target.value}})}/></Field><Field label="数据来源 *"><input value={evidenceEditor.value.source} disabled={readonly} onChange={(event)=>setEvidenceEditor({...evidenceEditor,value:{...evidenceEditor.value,source:event.target.value}})} placeholder="例如：ERP采购系统"/></Field><Field label="来源字段"><input value={evidenceEditor.value.sourceField} disabled={readonly} onChange={(event)=>setEvidenceEditor({...evidenceEditor,value:{...evidenceEditor.value,sourceField:event.target.value}})} placeholder="单据编号或字段编码"/></Field><Field label="附件要求"><select value={evidenceEditor.value.attachmentRequirement} disabled={readonly} onChange={(event)=>setEvidenceEditor({...evidenceEditor,value:{...evidenceEditor.value,attachmentRequirement:event.target.value}})}><option>无需附件</option><option>可选附件</option><option>必须有附件</option></select></Field><Field label="完整性要求 *"><textarea value={evidenceEditor.value.completeness} disabled={readonly} onChange={(event)=>setEvidenceEditor({...evidenceEditor,value:{...evidenceEditor.value,completeness:event.target.value}})}/></Field><Field label="说明"><textarea value={evidenceEditor.value.description} disabled={readonly} onChange={(event)=>setEvidenceEditor({...evidenceEditor,value:{...evidenceEditor.value,description:event.target.value}})}/></Field></div>}</Drawer>}
  </>
}

function logicHelp(type:RuleItem['type']){return type==='属性'?'添加一个或多个属性判断条件。':type==='字段比对'?'添加一个或多个字段之间的比较条件。':type==='关系路径'?'从主对象出发配置一至两跳关系，并可增加属性约束。':type==='时序'?'添加一个或多个事件发生要求，共用同一观察窗口。':type==='聚合'?'添加一至三个统计指标，并设置组合方式。':'使用受控表达式组合字段、事件、关系和白名单函数。'}
function operatorsFor(element?:OntologyElement){const type=element?.dataType||'';if(/数字|金额|日期/.test(type))return['等于','不等于','大于','大于等于','小于','小于等于','为空','不为空'];return['等于','不等于','包含','不包含','为空','不为空']}
function ConditionRows({conditions,properties,readonly,fieldCompare,onAdd,onUpdate,onRemove}:{conditions:RuleCondition[];properties:OntologyElement[];readonly:boolean;fieldCompare:boolean;onAdd:()=>void;onUpdate:(id:string,next:Partial<RuleCondition>)=>void;onRemove:(id:string)=>void}){
  return <div className="simple-condition-list">{conditions.length>0&&<div className="simple-condition-head"><span>序号</span><span>判断属性</span><span>运算符</span><span>{fieldCompare?'对比属性':'比较值'}</span><span>操作</span></div>}{conditions.map((condition,index)=>{const element=properties.find((item)=>item.code===condition.fieldCode);const unary=['为空','不为空'].includes(condition.operator);return <div className="simple-condition" key={condition.id}><b>{index+1}</b><select value={condition.fieldCode} disabled={readonly} onChange={(event)=>{const next=properties.find((item)=>item.code===event.target.value);onUpdate(condition.id,{fieldCode:event.target.value,fieldName:next?.name||'',fieldType:next?.dataType||'',operator:'等于'})}}><option value="">选择判断属性</option>{properties.map((item)=><option value={item.code} key={item.code}>{item.name}</option>)}</select><select value={condition.operator} disabled={readonly} onChange={(event)=>{const operator=event.target.value;onUpdate(condition.id,{operator,value:['为空','不为空'].includes(operator)?'':condition.value})}}>{operatorsFor(element).map((item)=><option key={item}>{item}</option>)}</select>{unary?<div className="unary-value">无需比较值</div>:fieldCompare?<select value={condition.valueFieldCode||''} disabled={readonly} onChange={(event)=>{const next=properties.find((item)=>item.code===event.target.value);onUpdate(condition.id,{valueMode:'field',value:'',valueFieldCode:event.target.value,valueFieldName:next?.name||''})}}><option value="">选择对比属性</option>{properties.map((item)=><option value={item.code} key={item.code}>{item.name}</option>)}</select>:<input value={condition.value} disabled={readonly} onChange={(event)=>onUpdate(condition.id,{valueMode:'literal',value:event.target.value})} placeholder="输入比较值"/>}{!readonly&&<button onClick={()=>onRemove(condition.id)}><Icon name="close" size={14}/></button>}</div>})}{!conditions.length&&<EmptyState title="尚未配置判断条件" description={fieldCompare?'请选择两个属性进行比较。':'请选择一个属性并输入比较值。'}/>} {!readonly&&<Button icon="plus" onClick={onAdd}>添加判断条件</Button>}</div>
}


function LogicSelector({logic,count,readonly,onChange}:{logic:Logic;count:number;readonly:boolean;onChange:(logic:Logic)=>void}){
  return <div className="condition-logic-bar"><div><strong>条件组合</strong><span>当前共 {count} 条条件</span></div><div><button type="button" className={logic==='AND'?'active':''} disabled={readonly} onClick={()=>onChange('AND')}><b>AND</b><span>满足全部条件</span></button><button type="button" className={logic==='OR'?'active':''} disabled={readonly} onClick={()=>onChange('OR')}><b>OR</b><span>满足任一条件</span></button></div></div>
}

function TimeConditionRows({conditions,events,readonly,onAdd,onUpdate,onRemove}:{conditions:TimeCondition[];events:OntologyElement[];readonly:boolean;onAdd:()=>void;onUpdate:(id:string,next:Partial<TimeCondition>)=>void;onRemove:(id:string)=>void}){
  return <div className="time-condition-list">
    {conditions.length>0&&<div className="time-condition-head"><span>序号</span><span>判断事件</span><span>发生要求</span><span>操作</span></div>}
    {conditions.map((condition,index)=><div className="time-condition-row" key={condition.id}><b>{index+1}</b><select value={condition.eventCode} disabled={readonly} onChange={(event)=>{const item=events.find((candidate)=>candidate.code===event.target.value);onUpdate(condition.id,{eventCode:event.target.value,eventName:item?.name||''})}}><option value="">选择判断事件</option>{events.map((item)=><option value={item.code} key={item.code}>{item.name}</option>)}</select><select value={condition.requirement} disabled={readonly} onChange={(event)=>onUpdate(condition.id,{requirement:event.target.value as TimeCondition['requirement']})}><option>必须发生</option><option>不得发生</option></select>{!readonly&&<button type="button" onClick={()=>onRemove(condition.id)}><Icon name="close" size={14}/></button>}</div>)}
    {!conditions.length&&<EmptyState title="尚未配置事件条件" description="添加一个或多个判断事件，并确定必须发生或不得发生。"/>}
    {!readonly&&<Button icon="plus" onClick={onAdd}>添加事件条件</Button>}
  </div>
}

function AggregateMetricRows({metrics,properties,readonly,onAdd,onUpdate,onRemove}:{metrics:AggregateMetric[];properties:OntologyElement[];readonly:boolean;onAdd:()=>void;onUpdate:(id:string,next:Partial<AggregateMetric>)=>void;onRemove:(id:string)=>void}){
  const numericProperties=properties.filter((item)=>/数字|金额/.test(item.dataType))
  const options=numericProperties.length?numericProperties:properties
  return <div className="aggregate-metric-list">
    {metrics.length>0&&<div className="aggregate-metric-head"><span>序号</span><span>聚合函数</span><span>统计属性</span><span>运算符</span><span>阈值</span><span>操作</span></div>}
    {metrics.map((metric,index)=><div className="aggregate-metric-row" key={metric.id}><b>{index+1}</b><select value={metric.function} disabled={readonly} onChange={(event)=>onUpdate(metric.id,{function:event.target.value})}><option>COUNT</option><option>SUM</option><option>AVG</option><option>MAX</option><option>MIN</option></select><select value={metric.fieldCode} disabled={readonly} onChange={(event)=>{const item=options.find((candidate)=>candidate.code===event.target.value);onUpdate(metric.id,{fieldCode:event.target.value,fieldName:item?.name||''})}}><option value="">选择统计属性</option>{options.map((item)=><option value={item.code} key={item.code}>{item.name}</option>)}</select><select value={metric.operator} disabled={readonly} onChange={(event)=>onUpdate(metric.id,{operator:event.target.value})}><option>大于</option><option>大于等于</option><option>等于</option><option>小于</option><option>小于等于</option></select><input type="number" value={metric.threshold} disabled={readonly} onChange={(event)=>onUpdate(metric.id,{threshold:Number(event.target.value)})}/>{!readonly&&<button type="button" onClick={()=>onRemove(metric.id)}><Icon name="close" size={14}/></button>}</div>)}
    {!metrics.length&&<EmptyState title="尚未配置统计指标" description="添加一至三个统计指标，指标之间可按 AND 或 OR 组合。"/>}
    {!readonly&&<Button icon="plus" onClick={onAdd}>添加统计指标</Button>}
  </div>
}

function AdvancedExpressionEditor({expression,elements,readonly,onChange}:{expression:string;elements:OntologyElement[];readonly:boolean;onChange:(value:string)=>void}){
  const issue=advancedExpressionIssue(expression)
  const properties=elements.filter((item)=>item.type==='property')
  const events=elements.filter((item)=>item.type==='event')
  const relations=elements.filter((item)=>item.type==='relation')
  const append=(token:string)=>onChange(`${expression}${expression.trim()?'\nAND ':''}${token}`)
  const functionToken=(name:string)=>name==='EVENT_COUNT'?`EVENT_COUNT("", 30, "DAY", "BEFORE")`:name==='EXISTS_PATH'?`EXISTS_PATH("")`:name==='DATE_DIFF'?`DATE_DIFF("", "")`:name==='ABS'?`ABS()`:`${name}("", 30, "DAY", "BEFORE")`
  return <div className="advanced-expression-editor">
    <header><div><strong>高级表达式</strong><span>仅支持当前本体元素和白名单函数，不允许 SQL、JavaScript 或外部调用</span></div><b>受控 DSL</b></header>
    <textarea value={expression} disabled={readonly} maxLength={2000} spellCheck={false} onChange={(event)=>onChange(event.target.value)} placeholder={'例如：\nPROC.Supplier.status == "异常"\nAND EVENT_COUNT("PROC.BidConfirmed", 30, "DAY", "BEFORE") > 0'}/>
    <div className={`expression-validation ${issue?'error':'valid'}`}><Icon name={issue?'warning':'check'} size={14}/><span>{issue||'表达式基础语法检查通过'}</span><small>{expression.length}/2000</small></div>
    {!readonly&&<div className="expression-palette">
      <section><h4>函数</h4><div>{expressionFunctions.map((name)=><button type="button" key={name} onClick={()=>append(functionToken(name))}><strong>{name}</strong><span>{expressionFunctionLabels[name]}</span></button>)}</div></section>
      <section><h4>属性</h4><div>{properties.map((item)=><button type="button" key={item.code} onClick={()=>append(item.code)}><strong>{item.name}</strong><code>{item.code}</code></button>)}</div></section>
      <section><h4>事件</h4><div>{events.map((item)=><button type="button" key={item.code} onClick={()=>append(`EVENT_COUNT("${item.code}", 30, "DAY", "BEFORE") > 0`)}><strong>{item.name}</strong><code>{item.code}</code></button>)}</div></section>
      <section><h4>关系</h4><div>{relations.map((item)=><button type="button" key={item.code} onClick={()=>append(`EXISTS_PATH("${item.code}")`)}><strong>{item.name}</strong><code>{item.code}</code></button>)}</div></section>
    </div>}
    <div className="expression-help"><strong>支持内容</strong><span>AND、OR、NOT、括号、比较和算术运算；时间单位使用 HOUR、DAY、MONTH，方向使用 BEFORE、AFTER。</span></div>
  </div>
}
