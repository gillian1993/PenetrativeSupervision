import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ruleClosureApi } from '../ruleClosureApi'
import { dataGraphApi } from '../dataGraphApi'
import { sceneRuleApi } from '../sceneRuleApi'
import type { AggregateMetric, ConditionGroup, EvidenceRequirement, Logic, OntologyElement, PathHop, PolicyBasis, RuleCondition, RuleItem, TimeCondition, ValidationIssue } from '../sceneRuleTypes'
import { isConditionGroup } from '../sceneRuleTypes'
import type { RiskLevel } from '../types'
import { useAppStore } from '../store'
import { Button, Drawer, EmptyState, Field, Icon, KeyValue, Modal, PageHeader, Panel, RiskTag, StatusTag, Tabs } from '../ui'

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
type RuleTreeNode={id:string;name:string;children?:RuleTreeNode[]}
type RuleTreeEntry={node:RuleTreeNode;depth:number;path:string[]}
type RuleTreeState={libraries:RuleTreeNode[];directories:Record<string,RuleTreeNode[]>}
type TreeEditorState={kind:'library'|'directory';parentId?:string;parentPath?:string[];name:string}

const RULE_TREE_STORAGE_KEY='ruleAssetTree:v1'
const defaultLibraryName='文档审核规则库'
const treeNode=(id:string,name:string,children:RuleTreeNode[]=[]):RuleTreeNode=>children.length?{id,name,children}:{id,name}
const defaultRuleTreeState:RuleTreeState={
  libraries:[
    treeNode('lib-custom','自定义规则库',[treeNode('lib-custom-document','文档审核规则库'),treeNode('lib-custom-business','业务校验规则库')]),
    treeNode('lib-built-in','内置规则库',[treeNode('lib-built-in-basic','基础审查规则库'),treeNode('lib-built-in-risk','风险提示规则库')]),
    treeNode('lib-industry','行业监管规则库',[treeNode('lib-tender','招投标审核规则库'),treeNode('lib-contract','合同审核规则库'),treeNode('lib-supervision','穿透式监管规则库')]),
  ],
  directories:{
    自定义规则库:[treeNode('dir-custom-default','默认目录'),treeNode('dir-custom-document','文档审核'),treeNode('dir-custom-business','业务校验')],
    文档审核规则库:[
      treeNode('dir-doc-tender','招标文件审核',[treeNode('dir-doc-tender-qualification','资格条件'),treeNode('dir-doc-tender-score','评分办法'),treeNode('dir-doc-tender-business','商务条款')]),
      treeNode('dir-doc-bid','投标文件审核',[treeNode('dir-doc-bid-format','格式完整性'),treeNode('dir-doc-bid-response','响应偏离'),treeNode('dir-doc-bid-similarity','相似性审查')]),
      treeNode('dir-doc-contract','合同文本审核',[treeNode('dir-doc-contract-clause','关键条款'),treeNode('dir-doc-contract-payment','付款约定')]),
    ],
    业务校验规则库:[treeNode('dir-business-default','默认目录'),treeNode('dir-business-master-data','主数据校验'),treeNode('dir-business-process','流程一致性')],
    内置规则库:[treeNode('dir-built-basic','基础审查'),treeNode('dir-built-common','通用校验'),treeNode('dir-built-risk','风险提示')],
    基础审查规则库:[treeNode('dir-basic-completeness','完整性审查'),treeNode('dir-basic-validity','有效性审查')],
    风险提示规则库:[treeNode('dir-risk-reminder','提示类规则'),treeNode('dir-risk-observation','观察类规则')],
    招投标审核规则库:[treeNode('dir-tender-qualification','资格审查'),treeNode('dir-tender-business','商务审查'),treeNode('dir-tender-tech','技术审查'),treeNode('dir-tender-score','评分规则')],
    合同审核规则库:[treeNode('dir-contract-clause','合同条款审查'),treeNode('dir-contract-performance','履约审查'),treeNode('dir-contract-payment','付款审查')],
    穿透式监管规则库:[treeNode('dir-supervision-tender','招投标异常'),treeNode('dir-supervision-contract','合同异常'),treeNode('dir-supervision-supplier','供应商关联'),treeNode('dir-supervision-delivery','资金与交付')],
  },
}
const cloneRuleTreeState=(state:RuleTreeState=defaultRuleTreeState):RuleTreeState=>JSON.parse(JSON.stringify(state)) as RuleTreeState
const normalizeTreeNodes=(value:unknown):RuleTreeNode[]=>Array.isArray(value)?value.map((item,index)=>{
  if(!item||typeof item!=='object')return null
  const raw=item as Partial<RuleTreeNode>
  const name=String(raw.name||'').trim()
  if(!name)return null
  const id=String(raw.id||`tree-${Date.now()}-${index}`)
  const children=normalizeTreeNodes(raw.children)
  return treeNode(id,name,children)
}).filter((item):item is RuleTreeNode=>Boolean(item)):[]
function readRuleTreeState():RuleTreeState{
  if(typeof window==='undefined')return cloneRuleTreeState()
  try{
    const raw=window.localStorage.getItem(RULE_TREE_STORAGE_KEY)
    if(!raw)return cloneRuleTreeState()
    const parsed=JSON.parse(raw) as Partial<RuleTreeState>
    const libraries=normalizeTreeNodes(parsed.libraries)
    const directoryEntries=Object.entries(parsed.directories||{}).map(([library,nodes])=>[library,normalizeTreeNodes(nodes)] as const)
    return{libraries:libraries.length?libraries:cloneRuleTreeState().libraries,directories:Object.fromEntries(directoryEntries)}
  }catch{return cloneRuleTreeState()}
}
const saveRuleTreeState=(state:RuleTreeState)=>{if(typeof window!=='undefined')window.localStorage.setItem(RULE_TREE_STORAGE_KEY,JSON.stringify(state))}
const flattenRuleTree=(nodes:RuleTreeNode[],depth=0,path:string[]=[]):RuleTreeEntry[]=>nodes.flatMap((node)=>{const currentPath=[...path,node.name];return[{node,depth,path:currentPath},...flattenRuleTree(node.children||[],depth+1,currentPath)]})
const visibleRuleTreeEntries=(nodes:RuleTreeNode[],expanded:Record<string,boolean>,depth=0,path:string[]=[]):RuleTreeEntry[]=>nodes.flatMap((node)=>{const currentPath=[...path,node.name];const children=node.children||[];return[{node,depth,path:currentPath},...(children.length&&expanded[node.id]?visibleRuleTreeEntries(children,expanded,depth+1,currentPath):[])]})
const ruleTreePathText=(entry:RuleTreeEntry)=>entry.path.join(' / ')
const treeEntryKey=(entry:RuleTreeEntry)=>ruleTreePathText(entry)
const firstRuleTreeEntry=(nodes:RuleTreeNode[])=>flattenRuleTree(nodes)[0]||null
const findRuleTreeEntry=(nodes:RuleTreeNode[],predicate:(entry:RuleTreeEntry)=>boolean)=>flattenRuleTree(nodes).find(predicate)||null
const collectTreeNames=(node:RuleTreeNode):string[]=>[node.name,...(node.children||[]).flatMap(collectTreeNames)]
const treeSiblings=(nodes:RuleTreeNode[],parentId?:string):RuleTreeNode[]=>parentId?(findRuleTreeEntry(nodes,(entry)=>entry.node.id===parentId)?.node.children||[]):nodes
const insertRuleTreeNode=(nodes:RuleTreeNode[],parentId:string|undefined,node:RuleTreeNode):RuleTreeNode[]=>parentId?nodes.map((item)=>item.id===parentId?{...item,children:[...(item.children||[]),node]}:{...item,children:item.children?insertRuleTreeNode(item.children,parentId,node):item.children}):[...nodes,node]
const removeRuleTreeNode=(nodes:RuleTreeNode[],nodeId:string):RuleTreeNode[]=>nodes.filter((node)=>node.id!==nodeId).map((node)=>({...node,children:node.children?removeRuleTreeNode(node.children,nodeId):node.children}))
const stableTreeId=(prefix:string,value:string)=>`${prefix}-${Array.from(value).map((char)=>char.charCodeAt(0).toString(36)).join('-').slice(0,72)}`
function upsertTreePath(nodes:RuleTreeNode[],path:string[],prefix:string):RuleTreeNode[]{
  if(!path.length)return nodes
  const [name,...rest]=path
  const existing=nodes.find((node)=>node.name===name)
  if(!existing){const child=rest.length?treeNode(stableTreeId(prefix,path.join('/')),name,upsertTreePath([],rest,prefix)):treeNode(stableTreeId(prefix,path.join('/')),name);return[...nodes,child]}
  return nodes.map((node)=>node.name===name?{...node,children:upsertTreePath(node.children||[],rest,prefix)}:node)
}
function ensureTreeHasRuleRows(state:RuleTreeState,rules:RuleItem[]){
  let next=cloneRuleTreeState(state)
  const libraryNames=()=>flattenRuleTree(next.libraries).map((entry)=>entry.node.name)
  for(const rule of rules){
    const library=rule.libraryName||'穿透式监管规则库'
    const directory=(rule.directoryName||'默认目录').split('/').map((item)=>item.trim()).filter(Boolean)
    if(!libraryNames().includes(library))next={...next,libraries:[...next.libraries,treeNode(stableTreeId('lib-row',library),library)]}
    next={...next,directories:{...next.directories,[library]:upsertTreePath(next.directories[library]||[],directory.length?directory:['默认目录'],`dir-row-${library}`)}}
  }
  return next
}
const initialExpandedMap=(nodes:RuleTreeNode[])=>Object.fromEntries(flattenRuleTree(nodes).filter((entry)=>(entry.node.children||[]).length).map((entry)=>[entry.node.id,true]))
const ruleLibraryOptions=()=>unique(flattenRuleTree(readRuleTreeState().libraries).map((entry)=>entry.node.name))
const directoriesForLibrary=(library:string)=>{const state=readRuleTreeState();const nodes=state.directories[library]||[treeNode(stableTreeId('dir-default',library),'默认目录')];const options=flattenRuleTree(nodes).map(ruleTreePathText);return options.length?options:['默认目录']}
const defaultDirectoryFor=(library:string)=>directoriesForLibrary(library)[0]||'默认目录'
const defaultOutputs=['主体名称与编码','命中条件及实际值','来源记录与版本','规则执行时间']
const fallbackElements:OntologyElement[]=[
  {id:'c1',type:'class',code:'PROC.Supplier',name:'供应商',dataType:'类',constraint:'',description:''},
  {id:'c2',type:'class',code:'PROC.PurchaseProject',name:'采购项目',dataType:'类',constraint:'',description:''},
  {id:'p1',type:'property',code:'PROC.Supplier.phone',name:'供应商联系电话',dataType:'文本',constraint:'',description:''},
  {id:'p2',type:'property',code:'PROC.Reviewer.phone',name:'评审人员联系电话',dataType:'文本',constraint:'',description:''},
  {id:'p3',type:'property',code:'PROC.Contract.change_rate',name:'合同金额变更比例',dataType:'数字',constraint:'',description:''},
  {id:'p4',type:'property',code:'PROC.Contract.change_amount',name:'合同变更金额',dataType:'金额',constraint:'',description:''},
  {id:'r1',type:'relation',code:'PROC.shared_contact',name:'共同使用',dataType:'联系方式 → 评审人员',constraint:'',description:''},
  {id:'e1',type:'class',code:'PROC.BidConfirmed',name:'中标确认',dataType:'类',constraint:'发生时间必填',description:'用于表达中标确认业务记录的普通类'},
]
type OntologyOption={id:string;name:string;status?:string;elements:OntologyElement[]}
type GraphOption={id:string;status:string;ontologyId:string;graphName?:string;ontologyVersion?:string}
type RuleCreateDraft={name:string;code:string;version:string;type:RuleItem['type'];levelMode:'inherit'|'override';level:RiskLevel;domain:string;libraryName:string;directoryName:string;description:string;status:string;ontologyId:string;objectCode:string;objectName:string;eventCode:string;eventName:string;graphVersion:string}
type RuleEditorStep='basic'|'logic'|'governance'|'expression'|'policies'|'evidence'
type GovernanceTab='policies'|'evidence'

const messageOf=(error:unknown)=>error instanceof Error?error.message:'操作失败，请稍后重试'
const dateText=(value:unknown)=>value?new Date(String(value)).toLocaleString('zh-CN',{hour12:false}):'—'
const unique=(items:string[])=>[...new Set(items.filter(Boolean))]
const riskLevelValue=(value?:string):RiskLevel=>levels.includes(value as RiskLevel)?value as RiskLevel:'高'
const outputsForRuleType=(type:RuleItem['type'])=>unique([...defaultOutputs,...(type==='关系路径'?['关系路径']:type==='时序'?['事件时间']:type==='聚合'?['聚合结果']:type==='高级表达式'?['表达式计算明细']:[])])
const expressionFunctions=['SUM','AVG','MAX','MIN','COUNT','COUNT_DISTINCT','RATIO','SIMILARITY','EVENT_COUNT','EXISTS_PATH','DATE_DIFF','ABS','IN_LIST','TEXT_CLASSIFY','AI_REVIEW'] as const
const expressionFunctionLabels:Record<string,string>={SUM:'求和',AVG:'平均值',MAX:'最大值',MIN:'最小值',COUNT:'计数',COUNT_DISTINCT:'去重计数',RATIO:'比例',SIMILARITY:'相似度',EVENT_COUNT:'事件次数',EXISTS_PATH:'存在关系路径',DATE_DIFF:'日期差',ABS:'绝对值',IN_LIST:'名单匹配',TEXT_CLASSIFY:'文本分类',AI_REVIEW:'智能判定'}
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
  const functions=[...expression.matchAll(/\b([A-Z][A-Z0-9_]*)\s*\(/g)].map((item)=>item[1]).filter((item)=>!['AND','OR','NOT'].includes(item))
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
  const range=rule.timeConfig.baseline==='runtime'?'以规则运行时间为基准':`当“${rule.eventName||'目标类'}”节点发生时`
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
type DetectionGenerationMode='generate'
function cleanSentence(value:string){return value.trim().replace(/\s+/g,' ').replace(/[。；;,.，]+$/,'')}
function expressionLiteral(value:string){return `"${value.replace(/["']/g,'').trim()||'业务事实'}"`}
function codeOrLiteral(element:OntologyElement|undefined,fallback:string){return element?.code||expressionLiteral(fallback)}
function findElement(elements:OntologyElement[],patterns:RegExp[],type?:OntologyElement['type']){return elements.find((item)=>(!type||item.type===type)&&patterns.some((pattern)=>pattern.test(item.name)||pattern.test(item.code)))}
function numberFromText(value:string,fallback:number){const percent=value.match(/(\d+(?:\.\d+)?)\s*%/);if(percent)return Number(percent[1])/100;const decimal=value.match(/(?:比例|相似度|超过|达到|高于|大于|不低于)[^0-9]*(0?\.\d+)/);if(decimal)return Number(decimal[1]);const number=value.match(/(?:超过|达到|高于|大于|不低于)\s*(\d+(?:\.\d+)?)/);return number?Number(number[1]):fallback}
function hasExplicitThreshold(value:string){return /(\d+(?:\.\d+)?)\s*%/.test(value)||/(?:比例|相似度|超过|达到|高于|大于|不低于|不少于|至少|金额|价格|报价|费率|天内|日前|日后)[^0-9]*(\d+(?:\.\d+)?)/.test(value)}
function hasExplicitDays(value:string){return /(\d+)\s*天/.test(value)}
function aiReviewExpression(risk:string,text:string){return `AI_REVIEW(${expressionLiteral(risk)}, ${expressionLiteral(text)}) == true`}
function graphLabel(graph?:GraphOption){return graph?`${graph.graphName||graph.ontologyVersion||graph.id}（${graph.id}）`:'未选择知识图谱'}
function ruleGraphScope(rule:Pick<RuleItem,'graphVersion'|'ontologyId'|'eventName'>,graphs:GraphOption[]=[]){
  const graph=graphs.find((item)=>item.id===rule.graphVersion)
  const graphText=graph?graphLabel(graph):(rule.graphVersion||'未配置适用图谱')
  const ontologyText=graph?.ontologyVersion||rule.ontologyId||'图谱结构由适用图谱带出'
  return{graphText,detailText:`${ontologyText}${rule.eventName?` · ${rule.eventName}`:''}`}
}
function makeReviewDemoRule(suffix:string,name:string,directoryName:string,level:RiskLevel,detectionText:string,expression:string,policies:PolicyBasis[]=[],evidenceRequirements:EvidenceRequirement[]=[]):RuleItem{
  return{
    id:`DEMO-DOC-${suffix}`,versionId:`DEMO-DOC-RULE-${suffix}`,sceneId:'',sceneVersionId:'',code:`DOC-RULE-${suffix}`,name,version:'V1',type:'高级表达式',level,defaultLevel:level,enabled:true,status:'草稿',
    conditions:{id:`DEMO-COND-${suffix}`,logic:'AND',items:[],detectionInput:detectionText,detectionText,expression,expressionLanguage:'DSL'},
    pathConfig:{hops:[],logic:'AND',constraints:[]},timeConfig:{baseline:'runtime',logic:'AND',conditions:[],eventCode:'',windowValue:30,windowUnit:'天',direction:'之前'},aggregateConfig:{logic:'AND',metrics:[],function:'COUNT',fieldCode:'',groupBy:'',operator:'大于等于',threshold:0},
    exceptions:{enabled:false,description:'',whitelist:[]},outputs:outputsForRuleType('高级表达式'),evidence:evidenceRequirements.map((item)=>item.name),policy:{name:'',version:'',clause:''},failureStrategy:'进入人工复核队列',summary:detectionText,lockVersion:1,updatedAt:'2026-07-30T09:30:00+08:00',
    policies,evidenceRequirements,domain:'通用',libraryName:defaultLibraryName,directoryName,description:detectionText,bindingCount:0,catalogBindingCount:0,graphVersion:'',ontologyId:'',
  }
}
const reviewDemoRules:RuleItem[]=[
  makeReviewDemoRule('001','招标文件资格条件排他性审查','招标文件审核 / 资格条件','高','识别招标文件资格条件中是否存在限定特定行政区域、特定品牌、特定所有制或不合理业绩门槛等排他性要求。','AI_REVIEW("资格条件", "限定地区、品牌、所有制或设置不合理业绩门槛") == true',[{id:'POL-DOC-001',name:'招标投标法实施条例',version:'现行有效',clause:'第三十二条',text:'不得以不合理条件限制、排斥潜在投标人。'}],[{id:'EVI-DOC-001',name:'招标公告与资格条件页',source:'电子招投标平台',sourceField:'公告正文、资格条件',attachmentRequirement:'必须有附件',completeness:'需保留公告原文、发布时间和文件版本。',description:'用于复核资格条件是否构成排他性限制。'}]),
  makeReviewDemoRule('002','评分办法主观分异常审查','招标文件审核 / 评分办法','中','识别评分办法中主观评分占比过高、评分因素缺少量化标准或分值描述不一致的情况。','AI_REVIEW("评分办法", "主观分占比过高或评分标准不可量化") == true',[{id:'POL-DOC-002',name:'政府采购货物和服务招标投标管理办法',version:'现行有效',clause:'第五十五条',text:'评审因素应当细化和量化，并与采购需求对应。'}],[{id:'EVI-DOC-002',name:'评分办法章节',source:'招标文件解析服务',sourceField:'评分表、评审因素',attachmentRequirement:'可选附件',completeness:'需包含评分项、分值、评审标准和章节页码。',description:'用于定位评分办法问题。'}]),
  makeReviewDemoRule('003','投标文件签章完整性审查','投标文件审核 / 格式完整性','中','识别投标文件关键页缺少签章、授权委托书缺失或附件清单与正文不一致的情况。','AI_REVIEW("格式完整性", "关键页缺少签章或授权材料缺失") == true',[],[{id:'EVI-DOC-003',name:'投标文件签章页',source:'投标文件OCR',sourceField:'签章页、授权委托书、附件目录',attachmentRequirement:'必须有附件',completeness:'需保留页码、签章识别结果和缺失项截图。',description:'用于确认投标文件形式完整性。'}]),
  makeReviewDemoRule('004','投标响应偏离未说明审查','投标文件审核 / 响应偏离','低','识别投标文件对关键商务或技术条款存在偏离但未在偏离表中说明的情况。','AI_REVIEW("响应偏离", "关键条款偏离但偏离表未说明") == true',[],[{id:'EVI-DOC-004',name:'响应偏离对照表',source:'文档比对服务',sourceField:'偏离表、技术响应表、商务响应表',attachmentRequirement:'可选附件',completeness:'需记录招标条款、投标响应内容和比对结论。',description:'用于支撑响应偏离判断。'}]),
  makeReviewDemoRule('005','投标文件相似度异常审查','投标文件审核 / 相似性审查','高','识别同一项目下不同投标文件正文、报价说明或附件元数据相似度异常偏高的情况。','SIMILARITY("投标文件正文", "其他投标文件正文") >= 0.82\nAND COUNT("相似段落") >= 3',[],[{id:'EVI-DOC-005',name:'相似段落与附件元数据',source:'文本相似度服务',sourceField:'正文片段、附件Hash、作者信息',attachmentRequirement:'必须有附件',completeness:'需保留相似度得分、相似段落和涉及投标人清单。',description:'用于复核相似性异常。'}]),
  makeReviewDemoRule('006','合同关键条款缺失审查','合同文本审核 / 关键条款','中','识别合同文本中履约期限、验收标准、违约责任或争议解决等关键条款缺失的情况。','AI_REVIEW("合同关键条款", "履约期限、验收标准、违约责任或争议解决缺失") == true',[{id:'POL-DOC-006',name:'合同管理办法',version:'集团制度V3',clause:'第十八条',text:'合同文本应明确履约、验收、付款、违约责任及争议解决条款。'}],[{id:'EVI-DOC-006',name:'合同文本关键条款',source:'合同管理系统',sourceField:'合同正文、条款抽取结果',attachmentRequirement:'无需附件',completeness:'需包含缺失条款类型、上下文段落和合同版本号。',description:'用于支撑合同文本审核。'}]),
]
const isDemoRule=(rule:RuleItem)=>rule.versionId.startsWith('DEMO-DOC-RULE-')
const ruleMatchesKeyword=(rule:RuleItem,keyword:string)=>{const value=keyword.trim().toLowerCase();return !value||`${rule.name}${rule.code}${rule.libraryName||''}${rule.directoryName||''}${rule.description||''}${rule.summary||''}`.toLowerCase().includes(value)}
const ruleDirectoryInScope=(ruleDirectory:string,directory:string)=>ruleDirectory===directory||ruleDirectory.startsWith(`${directory} / `)
function makeNewRuleDraft(library=defaultLibraryName,directory=defaultDirectoryFor(library)):RuleCreateDraft{return{name:'',code:'',version:'V1',type:'高级表达式',levelMode:'override',level:'高',domain:'通用',libraryName:library,directoryName:directory,description:'',status:'草稿',ontologyId:'',objectCode:'',objectName:'',eventCode:'',eventName:'',graphVersion:''}}
function editorRouteStep():RuleEditorStep{const value=routeParams().get('step');return value==='logic'||value==='governance'?value:'basic'}
function generatedDetection(input:string,draft:RuleItem,elements:OntologyElement[]){
  const text=cleanSentence(input)
  const risk=draft.name?.trim()||'该风险'
  const sourceElements=elements.length?elements:fallbackElements
  const classes=sourceElements.filter((item)=>item.type==='class')
  const properties=sourceElements.filter((item)=>item.type==='property')
  const supplier=findElement(sourceElements,[/供应商|投标人|供方/i],'class')||classes[0]
  const project=findElement(sourceElements,[/项目|采购|标段/i],'class')||classes[0]
  const event=findElement(sourceElements,[/中标|确认|签订|审批|发生/i],'class')||classes[0]
  const contactA=findElement(sourceElements,[/供应商.*(电话|手机|联系人)|联系电话|手机号|联系方式/i],'property')||properties[0]
  const contactB=properties.find((item)=>item.code!==contactA?.code&&/电话|手机|联系人|联系方式/i.test(item.name+item.code))
  const amount=findElement(sourceElements,[/金额|比例|变更|价格|报价|费率/i],'property')||properties[0]
  const days=Number((text.match(/(\d+)\s*天/)||[])[1]||0)
  if(/相似|重复|围标|串标|雷同/.test(text)){
    if(!hasExplicitThreshold(text))return{detectionText:`系统对${text}进行智能审查，综合文本相似、异常一致、附件特征和业务上下文判断是否构成${risk}。`,expression:aiReviewExpression(risk,text)}
    const threshold=numberFromText(text,0.7)
    const expression=[
      `COUNT(${codeOrLiteral(supplier,'供应商')}) >= 2`,
      `SIMILARITY(${expressionLiteral('投标文件正文')}, ${expressionLiteral('投标文件正文')}) >= ${Number(threshold.toFixed(2))}`,
    ]
    if(days&&event)expression.push(`EVENT_COUNT("${event.code}", ${days}, "DAY", "BEFORE") >= 1`)
    return{detectionText:`当同一采购项目下，两个及以上供应商提交的投标文件正文内容相似度达到或超过 ${Math.round(threshold*100)}%，且存在连续重复段落、异常一致格式或相同错误内容时，判定为${risk}。`,expression:expression.join('\nAND ')}
  }
  if(/电话|手机|联系人|联系方式|地址|邮箱|关联/.test(text)){
    const expression=contactA&&contactB?`${contactA.code} == ${contactB.code}`:`${codeOrLiteral(contactA,'联系方式')} != ""`
    return{detectionText:`当${text}，且相关主体信息经标准化后仍保持一致或存在异常重合时，判定为${risk}。`,expression}
  }
  if(/金额|变更|价格|报价|比例|费率|超预算|超概算/.test(text)){
    if(!hasExplicitThreshold(text))return{detectionText:`系统对${text}进行智能审查，结合金额、价格、比例变化及业务背景判断是否构成${risk}。`,expression:aiReviewExpression(risk,text)}
    const threshold=numberFromText(text,0)
    const expression=`${codeOrLiteral(amount,'金额或比例')} >= ${Number(threshold.toFixed(2))}`
    return{detectionText:`当${text}，且金额、比例或价格指标达到规则阈值时，判定为${risk}。`,expression}
  }
  if(/之前|之后|天内|期间|时序|发生/.test(text)&&event){
    if(!hasExplicitDays(text))return{detectionText:`系统对${text}进行智能审查，结合相关事件顺序、时间间隔和业务上下文判断是否构成${risk}。`,expression:aiReviewExpression(risk,text)}
    const windowDays=days||30
    return{detectionText:`当${text}，且相关事件在 ${windowDays} 天观察范围内满足发生要求时，判定为${risk}。`,expression:`EVENT_COUNT("${event.code}", ${windowDays}, "DAY", "BEFORE") >= 1`}
  }
  return{detectionText:`系统对${text}进行智能审查，综合业务事实、关系证据和附件材料判断是否构成${risk}。`,expression:aiReviewExpression(risk,text)}
}
function RuleTreeView({entries,expanded,activeKey,icon,emptyTitle,countOf,onToggle,onSelect,onAddChild,onDelete}:{entries:RuleTreeEntry[];expanded:Record<string,boolean>;activeKey:string;icon:'rules'|'file';emptyTitle:string;countOf:(entry:RuleTreeEntry)=>number;onToggle:(id:string)=>void;onSelect:(entry:RuleTreeEntry)=>void;onAddChild:(entry:RuleTreeEntry)=>void;onDelete:(entry:RuleTreeEntry)=>void}){
  if(!entries.length)return <EmptyState title={emptyTitle} description="可以先新增一个节点，再在节点下维护规则。"/>
  return <div className="rule-tree-list nested">{entries.map((entry)=>{const children=entry.node.children||[];const key=treeEntryKey(entry);const active=activeKey===key||activeKey===entry.node.name;const depth=Math.min(entry.depth,4);return <div className={`rule-tree-row ${active?'active':''} depth-${depth}`} data-depth={entry.depth} style={{'--tree-depth':entry.depth} as CSSProperties} key={entry.node.id+'-'+key}>
    <button type="button" className={`rule-tree-toggle ${children.length&&expanded[entry.node.id]?'expanded':''}`} disabled={!children.length} aria-label={children.length?'展开或收起节点':'无下级节点'} onClick={()=>onToggle(entry.node.id)}><Icon name="chevron" size={13}/></button>
    <button type="button" className="rule-tree-main" onClick={()=>onSelect(entry)}><Icon name={icon} size={15}/><span><strong>{entry.node.name}</strong><small>{entry.depth?entry.path.slice(0,-1).join(' / ')||'下级节点':key}</small></span></button>
    <b>{countOf(entry)}</b>
    <span className="rule-tree-actions"><button type="button" title="新增下级" onClick={()=>onAddChild(entry)}><Icon name="plus" size={13}/></button><button type="button" title="删除节点" onClick={()=>onDelete(entry)}><Icon name="close" size={13}/></button></span>
  </div>})}</div>
}
export function RuleAssetManagementPage(){
  const navigate=useNavigate()
  const setToast=useAppStore((state)=>state.setToast)
  const [keyword,setKeyword]=useState('')
  const [rows,setRows]=useState<RuleItem[]>([])
  const [loading,setLoading]=useState(true)
  const [graphs,setGraphs]=useState<GraphOption[]>([])
  const [error,setError]=useState('')
  const [treeState,setTreeState]=useState<RuleTreeState>(()=>readRuleTreeState())
  const [libraryExpanded,setLibraryExpanded]=useState<Record<string,boolean>>(()=>initialExpandedMap(readRuleTreeState().libraries))
  const [directoryExpanded,setDirectoryExpanded]=useState<Record<string,Record<string,boolean>>>(()=>{const state=readRuleTreeState();return Object.fromEntries(Object.entries(state.directories).map(([library,nodes])=>[library,initialExpandedMap(nodes)]))})
  const [activeLibrary,setActiveLibrary]=useState(defaultLibraryName)
  const [activeDirectory,setActiveDirectory]=useState(defaultDirectoryFor(defaultLibraryName))
  const [selectedRuleId,setSelectedRuleId]=useState('')
  const [detailTab,setDetailTab]=useState<RuleEditorStep>('basic')
  const [treeEditor,setTreeEditor]=useState<TreeEditorState|null>(null)
  const [detailOpen,setDetailOpen]=useState(false)

  const load=async(nextKeyword=keyword)=>{setLoading(true);setError('');try{const [ruleRows,graphRows]=await Promise.all([ruleClosureApi.listRules(nextKeyword),dataGraphApi.listGraphs('已发布')]);setRows(ruleRows);setGraphs(graphRows.map((item)=>({id:item.id,status:item.status,ontologyId:item.ontologyId,graphName:item.graphName,ontologyVersion:item.ontologyVersion})))}catch(err){setError(messageOf(err))}finally{setLoading(false)}}
  useEffect(()=>{const params=routeParams();if(params.get('create')==='1'){const sceneId=params.get('sceneId')||'';navigate('/rules/new'+(sceneId?'?sceneId='+encodeURIComponent(sceneId):''),{replace:true})}},[navigate])
  useEffect(()=>{void load('')},[])
  useEffect(()=>saveRuleTreeState(treeState),[treeState])
  useEffect(()=>{setTreeState((value)=>{const next=ensureTreeHasRuleRows(value,[...rows,...reviewDemoRules]);return JSON.stringify(next)===JSON.stringify(value)?value:next})},[rows])

  const demoRows=reviewDemoRules.filter((rule)=>ruleMatchesKeyword(rule,keyword))
  const allRows=[...rows,...demoRows]
  const treeWithRules=ensureTreeHasRuleRows(treeState,allRows)
  const ruleLibrary=(rule:RuleItem)=>rule.libraryName||'穿透式监管规则库'
  const ruleDirectory=(rule:RuleItem)=>rule.directoryName||defaultDirectoryFor(ruleLibrary(rule))
  const libraryEntries=flattenRuleTree(treeWithRules.libraries)
  const currentLibraryEntry=libraryEntries.find((entry)=>entry.node.name===activeLibrary)||libraryEntries.find((entry)=>entry.node.name===defaultLibraryName)||firstRuleTreeEntry(treeWithRules.libraries)
  const currentLibrary=currentLibraryEntry?.node.name||defaultLibraryName
  const directoryNodes=treeWithRules.directories[currentLibrary]||[treeNode(stableTreeId('dir-default',currentLibrary),'默认目录')]
  const directoryEntries=flattenRuleTree(directoryNodes)
  const currentDirectoryEntry=directoryEntries.find((entry)=>ruleTreePathText(entry)===activeDirectory)||firstRuleTreeEntry(directoryNodes)
  const currentDirectory=currentDirectoryEntry?ruleTreePathText(currentDirectoryEntry):'默认目录'
  const currentDirectoryExpanded=directoryExpanded[currentLibrary]||initialExpandedMap(directoryNodes)
  const visibleLibraryEntries=visibleRuleTreeEntries(treeWithRules.libraries,libraryExpanded)
  const visibleDirectoryEntries=visibleRuleTreeEntries(directoryNodes,currentDirectoryExpanded)
  const libraryRows=(entry:RuleTreeEntry)=>{const names=collectTreeNames(entry.node);return allRows.filter((rule)=>names.includes(ruleLibrary(rule)))}
  const directoryRows=(entry:RuleTreeEntry)=>{const directory=ruleTreePathText(entry);return allRows.filter((rule)=>ruleLibrary(rule)===currentLibrary&&ruleDirectoryInScope(ruleDirectory(rule),directory))}
  const visibleRules=allRows.filter((rule)=>ruleLibrary(rule)===currentLibrary&&ruleDirectoryInScope(ruleDirectory(rule),currentDirectory))
  const selectedRule=visibleRules.find((rule)=>rule.versionId===selectedRuleId)||visibleRules[0]||null
  const currentLibraryPath=currentLibraryEntry?ruleTreePathText(currentLibraryEntry):currentLibrary
  const currentDirectoryPath=currentDirectoryEntry?ruleTreePathText(currentDirectoryEntry):currentDirectory
  const openNew=()=>navigate(`/rules/new?library=${encodeURIComponent(currentLibrary)}&directory=${encodeURIComponent(currentDirectory)}`)
  const openRuleDetail=(rule:RuleItem)=>{setSelectedRuleId(rule.versionId);setDetailTab('basic');setDetailOpen(true)}

  useEffect(()=>{if(activeLibrary!==currentLibrary)setActiveLibrary(currentLibrary)},[activeLibrary,currentLibrary])
  useEffect(()=>{if(activeDirectory!==currentDirectory)setActiveDirectory(currentDirectory)},[activeDirectory,currentDirectory])
  useEffect(()=>{if(selectedRule&&selectedRule.versionId!==selectedRuleId)setSelectedRuleId(selectedRule.versionId);if(!selectedRule&&selectedRuleId)setSelectedRuleId('')},[selectedRule?.versionId,selectedRuleId])

  const remove=async(rule:RuleItem)=>{if(isDemoRule(rule)){setToast('文档审核样例不写入数据库，不能在这里删除');return}const bindingCount=Number(rule.bindingCount||0);const hint=bindingCount?`删除后会同步从 ${bindingCount} 个引用关系中移出。`:'';if(!window.confirm(`确认删除规则草稿“${rule.name}”？${hint}删除后不可恢复。`))return;try{const result=await ruleClosureApi.deleteRule(rule.versionId);setToast(result.message||'规则草稿已删除');await load()}catch(err){setToast(messageOf(err))}}
  const toggleLibrary=(id:string)=>setLibraryExpanded((value)=>({...value,[id]:!value[id]}))
  const toggleDirectory=(id:string)=>setDirectoryExpanded((value)=>{const current=value[currentLibrary]||initialExpandedMap(directoryNodes);return{...value,[currentLibrary]:{...current,[id]:!current[id]}}})
  const openTreeEditor=(kind:TreeEditorState['kind'],entry?:RuleTreeEntry)=>setTreeEditor({kind,parentId:entry?.node.id,parentPath:entry?.path,name:''})
  const saveTreeEditor=()=>{if(!treeEditor)return;const name=treeEditor.name.trim();if(!name){setToast('节点名称不能为空');return}const id=`${treeEditor.kind}-${Date.now()}`;if(treeEditor.kind==='library'){if(flattenRuleTree(treeState.libraries).some((entry)=>entry.node.name===name)){setToast('规则库名称不能重复');return}setTreeState((value)=>({...value,libraries:insertRuleTreeNode(value.libraries,treeEditor.parentId,treeNode(id,name)),directories:{...value.directories,[name]:[treeNode(`dir-${Date.now()}`,'默认目录')]}}));if(treeEditor.parentId)setLibraryExpanded((value)=>({...value,[treeEditor.parentId as string]:true}));setActiveLibrary(name);setActiveDirectory('默认目录');setSelectedRuleId('')}else{const siblings=treeSiblings(treeState.directories[currentLibrary]||[],treeEditor.parentId);if(siblings.some((node)=>node.name===name)){setToast('同级目录名称不能重复');return}const nextDirectory=[...(treeEditor.parentPath||[]),name].join(' / ');setTreeState((value)=>({...value,directories:{...value.directories,[currentLibrary]:insertRuleTreeNode(value.directories[currentLibrary]||[],treeEditor.parentId,treeNode(id,name))}}));if(treeEditor.parentId)setDirectoryExpanded((value)=>({...value,[currentLibrary]:{...(value[currentLibrary]||{}),[treeEditor.parentId as string]:true}}));setActiveDirectory(nextDirectory);setSelectedRuleId('')}setTreeEditor(null)}
  const deleteLibraryNode=(entry:RuleTreeEntry)=>{const names=collectTreeNames(entry.node);const count=allRows.filter((rule)=>names.includes(ruleLibrary(rule))).length;if(count>0){setToast(`该规则库下仍有 ${count} 条规则，请先移动或删除规则后再删除节点`);return}if(!window.confirm(`确认删除规则库节点“${entry.node.name}”？仅删除目录结构，不删除任何规则数据。`))return;setTreeState((value)=>{const directories={...value.directories};names.forEach((name)=>delete directories[name]);return{libraries:removeRuleTreeNode(value.libraries,entry.node.id),directories}});if(names.includes(currentLibrary)){setActiveLibrary('');setActiveDirectory('');setSelectedRuleId('')}}
  const deleteDirectoryNode=(entry:RuleTreeEntry)=>{const directory=ruleTreePathText(entry);const count=allRows.filter((rule)=>ruleLibrary(rule)===currentLibrary&&ruleDirectoryInScope(ruleDirectory(rule),directory)).length;if(count>0){setToast(`该目录下仍有 ${count} 条规则，请先移动或删除规则后再删除目录`);return}if(!window.confirm(`确认删除目录“${directory}”？仅删除目录结构，不删除任何规则数据。`))return;setTreeState((value)=>{const nextNodes=removeRuleTreeNode(value.directories[currentLibrary]||[],entry.node.id);return{...value,directories:{...value.directories,[currentLibrary]:nextNodes.length?nextNodes:[treeNode(stableTreeId('dir-default',currentLibrary),'默认目录')]}}});if(ruleDirectoryInScope(currentDirectory,directory)){setActiveDirectory('');setSelectedRuleId('')}}

  return <main className="rule-management-page rule-management-hierarchy">
    <PageHeader eyebrow="规则中心 / 规则管理" title="规则管理" description="按规则库、规则目录和规则清单分层管理通用规则。" actions={<Button icon="refresh" onClick={()=>void load()}>刷新</Button>}/>
    <section className="rule-asset-workbench rule-hierarchy-workbench">
      <aside className="rule-library-nav" aria-label="规则库"><header className="rule-panel-title"><div><h2>规则库</h2><span>{libraryEntries.length} 个节点</span></div><Button icon="plus" onClick={()=>openTreeEditor('library')}>新增库</Button></header><RuleTreeView entries={visibleLibraryEntries} expanded={libraryExpanded} activeKey={currentLibrary} icon="rules" emptyTitle="暂无规则库" countOf={(entry)=>libraryRows(entry).length} onToggle={toggleLibrary} onSelect={(entry)=>{setActiveLibrary(entry.node.name);setActiveDirectory(defaultDirectoryFor(entry.node.name));setSelectedRuleId('');setDetailOpen(false)}} onAddChild={(entry)=>openTreeEditor('library',entry)} onDelete={deleteLibraryNode}/></aside>
      <section className="rule-library-workspace">
        <header className="rule-library-context"><div><h2>{currentLibrary}</h2><span>{currentLibraryPath}</span></div><div><strong>{directoryEntries.length}</strong><span>目录节点</span></div><div><strong>{currentLibraryEntry?libraryRows(currentLibraryEntry).length:0}</strong><span>库内规则</span></div></header>
        <div className="rule-library-work-area"><aside className="rule-directory-nav" aria-label="当前规则库目录"><header className="rule-panel-title"><div><h2>规则目录</h2><span>{currentLibrary}</span></div><Button icon="plus" onClick={()=>openTreeEditor('directory')}>新增目录</Button></header><RuleTreeView entries={visibleDirectoryEntries} expanded={currentDirectoryExpanded} activeKey={currentDirectory} icon="file" emptyTitle="暂无规则目录" countOf={(entry)=>directoryRows(entry).length} onToggle={toggleDirectory} onSelect={(entry)=>{setActiveDirectory(ruleTreePathText(entry));setSelectedRuleId('');setDetailOpen(false)}} onAddChild={(entry)=>openTreeEditor('directory',entry)} onDelete={deleteDirectoryNode}/></aside>
          <section className="rule-list-panel">{loading&&allRows.length===0?<div className="loading-state"><i/><span>正在加载规则库…</span></div>:<>{error&&<div className="rule-inline-warning"><Icon name="warning"/><span>规则服务暂未连接，当前展示文档审核样例和本地目录结构。</span><Button onClick={()=>void load()}>重试</Button></div>}<div className="rule-list-toolbar"><div><h2>{currentDirectoryEntry?.node.name||currentDirectory}</h2><span>{currentLibraryPath} / {currentDirectoryPath} / {visibleRules.length} 条规则</span></div><div className="rule-list-actions"><label className="rule-list-search"><Icon name="search" size={15}/><input value={keyword} onChange={(event)=>setKeyword(event.target.value)} onKeyDown={(event)=>{if(event.key==='Enter')void load()}} placeholder="搜索规则名称、编码"/></label><Button icon="search" onClick={()=>void load()}>查询</Button><Button icon="plus" onClick={openNew}>新增规则</Button></div></div>{visibleRules.length===0?<EmptyState title="当前目录暂无规则" description="可在当前规则库和目录下创建第一条通用规则。" action={<Button variant="primary" icon="plus" onClick={openNew}>新增规则</Button>}/>:<div className="rule-list-table"><div className="rule-list-table-head"><span>规则名称 / 编码</span><span>风险等级</span><span>状态</span><span>依据与证据</span><span>更新时间</span><span>操作</span></div><div className="rule-list-table-body">{visibleRules.map((rule)=>{const status=displayStatus(rule);const demo=isDemoRule(rule);const readonly=['已发布','已停用'].includes(status);const canDelete=!readonly&&!demo;const deleteReason=demo?'文档审核样例只在前端展示，不会写入或删除旧规则数据':readonly?'已发布或已停用规则不可删除':(rule.bindingCount||0)>0||(rule.catalogBindingCount||0)>0?`删除后会同步解除 ${rule.bindingCount||0} 个业务流程引用、${rule.catalogBindingCount||0} 个业务目录引用`:'删除规则';return <article className={rule.versionId===selectedRule?.versionId?'rule-list-table-row active':'rule-list-table-row'} key={rule.versionId} role="button" tabIndex={0} onClick={()=>openRuleDetail(rule)} onKeyDown={(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openRuleDetail(rule)}}}><div className="rule-list-title"><strong>{rule.name}</strong><small>{rule.code} · {rule.version}</small><p>{rule.description||rule.summary||'暂无规则说明'}</p></div><RiskTag level={riskLevelValue(rule.defaultLevel||rule.level)}/><StatusTag>{status}</StatusTag><span className="rule-list-counts">{rule.policies?.length||0} 条制度依据<br/>{rule.evidenceRequirements?.length||rule.evidence.length} 项证据要求</span><span className="rule-list-time">{dateText(rule.updatedAt)}</span><div className="rule-row-actions"><button type="button" onClick={(event)=>{event.stopPropagation();openRuleDetail(rule)}}>详情</button><span className="disabled-action-tip" title={demo?'样例规则不进入编辑页，可按当前目录新增真实规则':''}><button type="button" disabled={demo} onClick={(event)=>{event.stopPropagation();if(!demo)navigate('/rules/'+rule.versionId)}}>{demo?'样例':'编辑'}</button></span><span className="disabled-action-tip" title={deleteReason}><button type="button" className="danger-link" disabled={!canDelete} aria-label={`删除 ${rule.name}`} onClick={(event)=>{event.stopPropagation();void remove(rule)}}>删除</button></span></div></article>})}</div></div>}</>}</section>
        </div>
      </section>
    </section>
    <Drawer open={detailOpen&&!!selectedRule} title={selectedRule?.name||'规则详情'} eyebrow="规则详情" onClose={()=>setDetailOpen(false)} className="rule-detail-drawer"><RuleAssetDetailPreview rule={selectedRule} tab={detailTab} graphs={graphs} onTabChange={setDetailTab} onEdit={(rule)=>{if(!isDemoRule(rule))navigate('/rules/'+rule.versionId)}}/></Drawer>
    <Modal open={!!treeEditor} title={treeEditor?.kind==='library'?'新增规则库节点':'新增规则目录节点'} description={treeEditor?.parentPath?.length?`新增到：${treeEditor.parentPath.join(' / ')}`:'新增到当前层级'} confirmText="保存" onClose={()=>setTreeEditor(null)} onConfirm={saveTreeEditor}>{treeEditor&&<Field label="节点名称 *" wide><input autoFocus value={treeEditor.name} onChange={(event)=>setTreeEditor({...treeEditor,name:event.target.value})} placeholder={treeEditor.kind==='library'?'例如：制度审核规则库':'例如：一致性审查'}/></Field>}</Modal>
  </main>
}

function RuleAssetDetailPreview({rule,tab,graphs,onTabChange,onEdit}:{rule:RuleItem|null;tab:RuleEditorStep;graphs:GraphOption[];onTabChange:(tab:RuleEditorStep)=>void;onEdit:(rule:RuleItem)=>void}){
  if(!rule)return <section className="rule-detail-region"><EmptyState title="请选择规则" description="从左侧规则库和目录中选择规则后查看详情。"/></section>
  const status=displayStatus(rule);const expression=ruleExpression(rule);const scope=ruleGraphScope(rule,graphs);const policies=rule.policies||[];const evidenceRequirements=rule.evidenceRequirements||[]
  return <section className="rule-detail-region"><div className="rule-detail-header"><div><h2>{rule.name}</h2><span>{rule.code} · {rule.version} · {rule.libraryName||'穿透式监管规则库'} / {rule.directoryName||'默认目录'}</span></div><Button icon="edit" disabled={isDemoRule(rule)} onClick={()=>onEdit(rule)}>{isDemoRule(rule)?'样例':['已发布','已停用'].includes(rule.status)?'查看':'编辑'}</Button></div><Tabs value={tab} onChange={(value)=>onTabChange(value as RuleEditorStep)} items={[{key:'basic',label:'基本信息'},{key:'expression',label:'规则表达式'},{key:'policies',label:'制度依据',count:policies.length},{key:'evidence',label:'证据要求',count:evidenceRequirements.length}]}/>{tab==='basic'&&<div className="rule-detail-basic"><KeyValue items={[{label:'所属规则库',value:rule.libraryName||'穿透式监管规则库'},{label:'所属规则目录',value:rule.directoryName||'默认目录'},{label:'规则编码',value:rule.code},{label:'风险等级',value:<RiskTag level={riskLevelValue(rule.defaultLevel||rule.level)}/>},{label:'状态',value:<StatusTag>{status}</StatusTag>},{label:'引用关系',value:`${rule.bindingCount||0} 个引用`},{label:'适用图谱',value:scope.graphText},{label:'更新时间',value:dateText(rule.updatedAt)}]}/><div className="rule-detail-note"><strong>规则说明</strong><p>{rule.description||rule.summary||'暂无规则说明'}</p></div></div>}{tab==='expression'&&<div className="rule-expression-card"><header><div><Icon name="rules"/><span><strong>规则表达式</strong><small>表达式页面保持现有配置模型，列表详情只做摘要预览</small></span></div></header><div><span>标准检测口径</span><p>{rule.conditions.detectionText||expression.business}</p></div><div><span>表达式</span><code>{rule.conditions.expression||expression.machine}</code></div></div>}{tab==='policies'&&(policies.length?<div className="rule-governance-preview">{policies.map((policy,index)=><article key={policy.id||index}><strong>{policy.name||'未填写制度名称'}</strong><span>{policy.version||'未填写版本'} · {policy.clause||'未填写条款'}</span><p>{policy.text||'暂无条款原文'}</p></article>)}</div>:<EmptyState title="尚未配置制度依据" description="制度依据为可选项，不需要时可以保持为空。"/>)}{tab==='evidence'&&(evidenceRequirements.length?<div className="rule-governance-preview">{evidenceRequirements.map((item,index)=><article key={item.id||index}><strong>{item.name||'未填写证据名称'}</strong><span>{item.source||'未填写数据来源'} · {item.sourceField||'未填写来源字段'} · {item.attachmentRequirement}</span><p>{item.completeness||'暂无完整性要求'}</p></article>)}</div>:<EmptyState title="尚未配置证据要求" description="证据要求为可选项，不需要时可以保持为空。"/>)}</section>
}
export function RuleAssetCreatePage(){
  const navigate=useNavigate()
  const setToast=useAppStore((state)=>state.setToast)
  const sceneId=routeParams().get('sceneId')||''
  const returnPath=sceneId?`/scenes/${encodeURIComponent(sceneId)}?tab=rules`:'/rules'
  const [draft,setDraft]=useState<RuleCreateDraft>(()=>makeNewRuleDraft())
  const [dirty,setDirty]=useState(false)
  const [saving,setSaving]=useState(false)
  const patch=(next:Partial<RuleCreateDraft>)=>{setDraft((value)=>({...value,...next}));setDirty(true)}
  useEffect(()=>{const handler=(event:BeforeUnloadEvent)=>{if(dirty&&!saving){event.preventDefault();event.returnValue=''}};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler)},[dirty,saving])
  const basicDone=Boolean(draft.name.trim()&&draft.version.trim()&&draft.domain&&draft.levelMode)
  const targetPath=(ruleId:string,nextStep=false)=>{const params=new URLSearchParams();if(sceneId)params.set('sceneId',sceneId);if(nextStep)params.set('step','logic');const query=params.toString();return `/rules/${encodeURIComponent(ruleId)}${query?`?${query}`:''}`}
  const createDraft=async(nextStep=false)=>{
    if(saving)return
    if(!draft.name.trim()){setToast('规则名称不能为空');return}
    const normalizedVersion=draft.version.trim().toUpperCase()
    if(!normalizedVersion){setToast('规则版本号不能为空');return}
    setSaving(true)
    try{
      const rule=await ruleClosureApi.createRule({name:draft.name.trim(),code:draft.code.trim()||undefined,version:normalizedVersion,type:draft.type,level:draft.levelMode==='inherit'?'继承场景':draft.level,domain:draft.domain})
      if(sceneId)await ruleClosureApi.selectRules(sceneId,[rule.versionId])
      setDirty(false)
      setToast(sceneId?'规则草稿已创建并关联当前场景':'规则草稿已创建')
      navigate(targetPath(rule.versionId,nextStep),{replace:true})
    }catch(err){setToast(messageOf(err));setSaving(false)}
  }
  const cancel=()=>{if(dirty&&!window.confirm('当前新建内容尚未保存，确认放弃并返回？'))return;navigate(returnPath)}
  const stepCards:Array<{key:RuleEditorStep;label:string;description:string;done:boolean}>=[
    {key:'basic',label:'基本信息',description:'名称、版本、领域与风险等级',done:basicDone},
    {key:'logic',label:'检测口径',description:'创建草稿后继续配置',done:false},
    {key:'governance',label:'依据与证据',description:'创建草稿后继续配置',done:false},
  ]
  return <>
    <div className="simple-rule-header"><div><button className="back-button" onClick={cancel}>‹ {sceneId?'返回风险场景':'返回规则管理'}</button><p className="eyebrow">风险规则 / 新建规则</p><h1>{draft.name.trim()||'新增风险规则'}</h1><div className="editor-meta"><StatusTag>未创建</StatusTag><span>规则版本：{draft.version.trim()||'V1'}</span><span>{dirty?'存在未保存修改':'填写基本信息后创建草稿'}</span></div></div></div>
    <nav className="rule-editor-tabs" aria-label="规则配置步骤">{stepCards.map((step,index)=><button type="button" className={[step.key==='basic'?'active':'',step.done?'done':''].filter(Boolean).join(' ')} onClick={()=>step.key==='basic'?undefined:setToast('请先完成基本信息并点击下一步创建规则草稿')} key={step.key}><i>{step.done?'✓':index+1}</i><span><strong>{step.label}</strong><small>{step.description}</small></span></button>)}</nav>
    <main className="rule-step-content">
      <Panel title="1. 基本信息" subtitle="先填写规则资产基础信息；版本号默认 V1，可在发布前调整，适用图谱和检测口径在下一步配置">
        <div className="form-section two-column">
          <Field label="规则名称 *"><input value={draft.name} onChange={(event)=>patch({name:event.target.value})} placeholder="例如：供应商与评审人员联系电话相同"/></Field>
          <Field label="规则编码"><input value={draft.code} onChange={(event)=>patch({code:event.target.value.toUpperCase()})} placeholder="留空自动生成"/></Field>
          <Field label="监管领域 *"><select value={draft.domain} onChange={(event)=>patch({domain:event.target.value})}>{domains.map((item)=><option key={item}>{item}</option>)}</select></Field>
          <Field label="命中风险等级"><select value={draft.levelMode==='inherit'?'inherit':draft.level} onChange={(event)=>event.target.value==='inherit'?patch({levelMode:'inherit'}):patch({levelMode:'override',level:event.target.value as RiskLevel})}><option value="inherit">继承场景默认等级</option>{levels.map((item)=><option value={item} key={item}>固定为：{item}</option>)}</select></Field>
          <Field label="规则版本号 *"><input value={draft.version} onChange={(event)=>patch({version:event.target.value.toUpperCase()})} placeholder="例如：V1"/></Field>
        </div>
        <div className="next-action-card"><Icon name={basicDone?'check':'clock'}/><div><strong>{basicDone?'基本信息已完整':'请先补齐基本信息'}</strong><span>{basicDone?'点击下一步后创建规则草稿，并进入检测口径配置。':'至少填写规则名称、规则版本号、监管领域和命中风险等级。'}</span></div></div>
      </Panel>
    </main>
    <footer className="editor-action-bar"><div><span className={dirty?'dirty-dot':''}/><strong>{dirty?'新建内容尚未保存':'尚未创建规则草稿'}</strong><small>{sceneId?'创建后会自动关联当前风险场景':'创建后可被多个风险场景引用'}</small></div><div><Button onClick={cancel}>取消</Button><Button disabled={saving} onClick={()=>void createDraft(false)}>{saving?'正在创建…':'保存草稿'}</Button><Button variant="primary" disabled={saving} onClick={()=>void createDraft(true)}>{saving?'正在创建…':'下一步'}</Button></div></footer>
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
  const [activeStep,setActiveStep]=useState<RuleEditorStep>(()=>editorRouteStep())
  const [governanceTab,setGovernanceTab]=useState<GovernanceTab>('policies')
  const [policyEditor,setPolicyEditor]=useState<{index:number;value:PolicyBasis}|null>(null)
  const [evidenceEditor,setEvidenceEditor]=useState<{index:number;value:EvidenceRequirement}|null>(null)
  const [generating,setGenerating]=useState<DetectionGenerationMode|''>('')
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
      setEditorGraphs(graphRows.map((item)=>({id:item.id,status:item.status,ontologyId:item.ontologyId,graphName:item.graphName,ontologyVersion:item.ontologyVersion})))
      const found=ontologyRows.find((item)=>item.id===current.ontologyId)
      setElements(found?.elements || [])
    }catch(err){setError(messageOf(err))}finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[id])
  useEffect(()=>{setActiveStep(editorRouteStep())},[id])
  useEffect(()=>{const handler=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue=''}};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler)},[dirty])
  const patch=(next:Partial<RuleItem>)=>{if(!draft)return;setDraft({...draft,...next});setDirty(true);setIssues([])}
  const properties=elements.filter((item)=>item.type==='property')
  const relations=elements.filter((item)=>item.type==='relation')
  const events=elements.filter((item)=>item.type==='class')
  const flatConditions=draft?draft.conditions.items.filter((item):item is RuleCondition=>!isConditionGroup(item)):[]
  const pathConstraints=draft?.pathConfig.constraints||[]
  const timeConditions=draft?.timeConfig.conditions||[]
  const aggregateMetrics=draft?.aggregateConfig.metrics||[]
  const advancedExpression=draft?.conditions.expression||''
  const advancedIssue=advancedExpressionIssue(advancedExpression)
  const detectionInput=draft?.conditions.detectionInput||''
  const detectionText=draft?.conditions.detectionText||''
  const effectiveDetectionText=detectionText||(draft&&advancedExpression?ruleExpression(draft,elements).business:'')
  const selectedGraph=editorGraphs.find((item)=>item.id===draft?.graphVersion)
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
  const addTimeCondition=()=>{if(!draft)return;if(timeConditions.length>=10){setToast('时序规则最多支持10个类节点条件');return}const item=events.find((event)=>event.code!==draft.eventCode&&!timeConditions.some((condition)=>condition.eventCode===event.code))||events.find((event)=>event.code!==draft.eventCode)||events[0];const condition:TimeCondition={id:'time-'+Date.now(),eventCode:item?.code||'',eventName:item?.name||'',requirement:'必须发生'};patch({timeConfig:{...draft.timeConfig,conditions:[...timeConditions,condition]}})}
  const updateTimeCondition=(id:string,next:Partial<TimeCondition>)=>{if(!draft)return;patch({timeConfig:{...draft.timeConfig,conditions:timeConditions.map((item)=>item.id===id?{...item,...next}:item)}})}
  const removeTimeCondition=(id:string)=>{if(!draft)return;patch({timeConfig:{...draft.timeConfig,conditions:timeConditions.filter((item)=>item.id!==id)}})}
  const addAggregateMetric=()=>{if(!draft)return;if(aggregateMetrics.length>=3){setToast('聚合规则最多支持3个统计指标');return}const field=properties.find((item)=>/数字|金额/.test(item.dataType)&&!aggregateMetrics.some((metric)=>metric.fieldCode===item.code))||properties.find((item)=>/数字|金额/.test(item.dataType));const metric:AggregateMetric={id:'metric-'+Date.now(),function:'COUNT',fieldCode:field?.code||'',fieldName:field?.name||'',operator:'大于等于',threshold:1};patch({aggregateConfig:{...draft.aggregateConfig,metrics:[...aggregateMetrics,metric]}})}
  const updateAggregateMetric=(id:string,next:Partial<AggregateMetric>)=>{if(!draft)return;patch({aggregateConfig:{...draft.aggregateConfig,metrics:aggregateMetrics.map((item)=>item.id===id?{...item,...next}:item)}})}
  const removeAggregateMetric=(id:string)=>{if(!draft)return;patch({aggregateConfig:{...draft.aggregateConfig,metrics:aggregateMetrics.filter((item)=>item.id!==id)}})}
  const relationCode=(hop:PathHop)=>relations.find((item)=>item.name===hop.relation)?.code||hop.relation
  const normalizedConditions=():ConditionGroup=>{
    if(!draft)return{id:'group-root',logic:'AND',items:[]}
    const detectionMeta:Pick<ConditionGroup,'detectionInput'|'detectionText'|'expression'|'expressionLanguage'|'generationMode'|'generatedAt'>={
      detectionInput:draft.conditions.detectionInput||'',
      detectionText:draft.conditions.detectionText||effectiveDetectionText||'',
      expression:draft.conditions.expression||'',
      expressionLanguage:draft.conditions.expressionLanguage||'DSL',
      generationMode:draft.conditions.generationMode,
      generatedAt:draft.conditions.generatedAt||'',
    }
    if(draft.type==='关系路径'){
      const hop=draft.pathConfig.hops[0]
      const items=pathConstraints.length?pathConstraints:hop?[{id:'relation-condition',fieldCode:relationCode(hop),fieldName:hop.relation,fieldType:'关系',operator:'存在',valueMode:'literal' as const,value:'true'}]:[]
      return{id:'group-root',logic:draft.pathConfig.logic||'AND',items,...detectionMeta}
    }
    if(draft.type==='时序')return{id:'group-root',logic:draft.timeConfig.logic||'AND',items:timeConditions.map((item)=>({id:item.id,fieldCode:item.eventCode,fieldName:item.eventName||events.find((event)=>event.code===item.eventCode)?.name||'事件',fieldType:'事件',operator:item.requirement,valueMode:'literal' as const,value:`${draft.timeConfig.direction}${draft.timeConfig.windowValue}${draft.timeConfig.windowUnit}`})),...detectionMeta}
    if(draft.type==='聚合')return{id:'group-root',logic:draft.aggregateConfig.logic||'AND',items:aggregateMetrics.map((item)=>({id:item.id,fieldCode:item.fieldCode,fieldName:item.fieldName||properties.find((field)=>field.code===item.fieldCode)?.name||'聚合字段',fieldType:'聚合',operator:`${item.function} ${item.operator}`,valueMode:'literal' as const,value:String(item.threshold)})),...detectionMeta}
    if(draft.type==='高级表达式')return{...draft.conditions,...detectionMeta}
    return {...draft.conditions,...detectionMeta}
  }
  const composePayload=()=>{
    if(!draft)return null
    const firstTime=timeConditions[0]
    const firstMetric=aggregateMetrics[0]
    const pathConfig={...draft.pathConfig,logic:draft.pathConfig.logic||'AND',constraints:pathConstraints}
    const timeConfig={...draft.timeConfig,baseline:usesTimeWindow?scopeBaseline:'runtime',logic:draft.timeConfig.logic||'AND',conditions:draft.type==='时序'?timeConditions:[],eventCode:draft.type==='时序'?(firstTime?.eventCode||''):'',windowValue:Number(draft.timeConfig.windowValue??30),windowUnit:draft.timeConfig.windowUnit||'天',direction:draft.timeConfig.direction||'之前'}
    const aggregateConfig={...draft.aggregateConfig,logic:draft.aggregateConfig.logic||'AND',metrics:aggregateMetrics,function:firstMetric?.function||'COUNT',fieldCode:firstMetric?.fieldCode||'',operator:firstMetric?.operator||'大于等于',threshold:Number(firstMetric?.threshold||0)}
    return{version:draft.version.trim().toUpperCase(),name:draft.name,domain:draft.domain,objectCode:draft.objectCode,objectName:draft.objectName,eventCode:usesTimeWindow&&scopeBaseline==='event'?draft.eventCode:'',eventName:usesTimeWindow&&scopeBaseline==='event'?draft.eventName:'',ontologyId:draft.ontologyId,graphVersion:draft.graphVersion,type:draft.type,level:draft.levelMode==='inherit'?'继承场景':draft.level,enabled:true,conditions:normalizedConditions(),pathConfig,timeConfig,aggregateConfig,exceptions:draft.exceptions,outputs:outputsForRuleType(draft.type),evidenceRequirements,policies,failureStrategy:draft.failureStrategy,lockVersion:rule?.lockVersion||draft.lockVersion}
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
    const event=nextElements.find((item)=>item.type==='class')
    const graph=editorGraphs.find((item)=>item.ontologyId===ontologyId)
    patch({ontologyId,graphVersion:graph?.id||'',objectCode:'',objectName:'',eventCode:usesTimeWindow&&scopeBaseline==='event'?event?.code||'':'',eventName:usesTimeWindow&&scopeBaseline==='event'?event?.name||'':'',conditions:{id:'group-root',logic:'AND',items:[]},pathConfig:{...draft!.pathConfig,hops:[],logic:'AND',constraints:[]},timeConfig:{...draft!.timeConfig,conditions:[],eventCode:''},aggregateConfig:{...draft!.aggregateConfig,metrics:[],fieldCode:'',threshold:0}})
  }
  const changeGraph=(graphVersion:string)=>{
    const graph=editorGraphs.find((item)=>item.id===graphVersion)
    const ontology=ontologies.find((item)=>item.id===graph?.ontologyId)
    const nextElements=ontology?.elements||[];setElements(nextElements)
    const event=nextElements.find((item)=>item.type==='class')
    patch({graphVersion,ontologyId:graph?.ontologyId||'',objectCode:'',objectName:'',eventCode:usesTimeWindow&&scopeBaseline==='event'?event?.code||'':'',eventName:usesTimeWindow&&scopeBaseline==='event'?event?.name||'':'',conditions:{id:'group-root',logic:'AND',items:[]},pathConfig:{...draft!.pathConfig,hops:[],logic:'AND',constraints:[]},timeConfig:{...draft!.timeConfig,conditions:[],eventCode:''},aggregateConfig:{...draft!.aggregateConfig,metrics:[],fieldCode:'',threshold:0}})
  }

  const generateDetection=async()=>{
    if(!draft)return
    if(!draft.graphVersion||!draft.ontologyId){setToast('请先选择适用图谱，再生成检测口径和表达式');return}
    const input=cleanSentence(detectionInput)
    if(!input){setToast('请先填写规则描述');return}
    setGenerating('generate')
    try{
      const result=generatedDetection(input,draft,elements)
      patch({
        type:'高级表达式',
        eventCode:'',
        eventName:'',
        conditions:{...draft.conditions,id:'group-root',logic:'AND',items:[],expression:result.expression,expressionLanguage:'DSL',detectionInput:input,detectionText:result.detectionText,generationMode:'generate',generatedAt:new Date().toISOString()},
        pathConfig:{...draft.pathConfig,hops:[],logic:'AND',constraints:[]},
        timeConfig:{...draft.timeConfig,baseline:'runtime',logic:'AND',conditions:[],eventCode:''},
        aggregateConfig:{...draft.aggregateConfig,logic:'AND',metrics:[],fieldCode:'',threshold:0},
      })
      setToast('已生成检测口径和表达式')
    }finally{setGenerating('')}
  }

  if(loading)return <div className="loading-state page-loading"><i/><span>正在加载规则配置…</span></div>
  if(error||!draft||!rule)return <div className="error-state page-error"><Icon name="warning"/><div><strong>规则加载失败</strong><span>{error||'规则不存在'}</span></div><Button onClick={()=>navigate('/rules')}>返回规则库</Button></div>
  const validCondition=(item:RuleCondition)=>Boolean(item.fieldCode&&item.operator&&(['为空','不为空'].includes(item.operator)||item.value||item.valueFieldCode))
  const logicDone=Boolean(effectiveDetectionText.trim()&&!advancedIssue)
  const currentStatus=displayStatus({...draft,conditions:normalizedConditions()})

  const basicDone=Boolean(draft.name.trim()&&draft.version.trim()&&draft.domain&&draft.levelMode)
  const scopeDone=Boolean(draft.ontologyId&&draft.graphVersion)
  const dataLogicDone=scopeDone&&logicDone
  const allDone=basicDone&&dataLogicDone&&governanceDone
  const editorSteps:Array<{key:RuleEditorStep;label:string;description:string;done:boolean;incomplete:string}>=[
    {key:'basic',label:'基本信息',description:'名称、版本、领域与风险等级',done:basicDone,incomplete:'请先填写规则名称、规则版本号、监管领域和命中风险等级'},
    {key:'logic',label:'检测口径',description:'规则描述、标准口径与表达式',done:dataLogicDone,incomplete:'请填写规则描述，生成或填写标准检测口径和表达式，并确认适用图谱'},
    {key:'governance',label:'依据与证据',description:'制度依据与证据要求',done:governanceDone,incomplete:'请至少配置一条制度依据和一项完整的证据要求'},
  ]
  const activeIndex=Math.max(0,editorSteps.findIndex((item)=>item.key===activeStep))
  const issueStep=(issue:ValidationIssue):RuleEditorStep=>issue.field==='name'?'basic':issue.field==='policy'||issue.field==='evidence'?'governance':'logic'
  const goToIssue=(issue:ValidationIssue)=>{const step=issueStep(issue);setActiveStep(step);if(step==='governance')setGovernanceTab(issue.field==='evidence'?'evidence':'policies')}
  const goNext=()=>{const current=editorSteps[activeIndex];if(!current.done){setToast(current.incomplete);return}if(activeIndex<editorSteps.length-1)setActiveStep(editorSteps[activeIndex+1].key)}
  const goPrevious=()=>{if(activeIndex>0)setActiveStep(editorSteps[activeIndex-1].key)}
  return <>
    <div className="simple-rule-header"><div><button className="back-button" onClick={cancel}>‹ {sceneId?'返回风险场景':'返回规则管理'}</button><p className="eyebrow">风险规则 / {rule.code} / {draft.version}</p><h1>{draft.name}</h1><div className="editor-meta"><StatusTag>{currentStatus}</StatusTag><span>被 {draft.bindingCount||0} 个场景版本引用</span><span>{dirty?'存在未保存修改':'最近保存：'+dateText(rule.updatedAt)}</span></div></div></div>
    <nav className="rule-editor-tabs" aria-label="规则配置步骤">{editorSteps.map((step,index)=>{const hasIssue=issues.some((issue)=>issueStep(issue)===step.key);return <button type="button" className={[activeStep===step.key?'active':'',step.done?'done':'',hasIssue?'error':''].filter(Boolean).join(' ')} onClick={()=>setActiveStep(step.key)} key={step.key}><i>{step.done?'✓':index+1}</i><span><strong>{step.label}</strong><small>{step.description}</small></span></button>})}</nav>
    {issues.length>0&&<section className="rule-validation-banner"><div><Icon name="warning"/><span><strong>还有 {issues.length} 项需要完成</strong><small>点击问题可直接进入对应配置步骤</small></span></div><div>{issues.map((issue,index)=><button type="button" onClick={()=>goToIssue(issue)} key={issue.field+'-'+index}>{issue.message}</button>)}</div></section>}
    <main className="rule-step-content">
      {activeStep==='basic'&&<Panel title="1. 基本信息" subtitle="维护规则资产信息、规则版本号以及命中后的风险等级"><div className="form-section two-column">
        <Field label="规则名称 *"><input value={draft.name} disabled={readonly} onChange={(event)=>patch({name:event.target.value})}/></Field>
        <Field label="规则编码"><input value={rule.code} disabled/></Field>
        <Field label="监管领域 *"><select value={draft.domain||'采购'} disabled={readonly} onChange={(event)=>patch({domain:event.target.value})}>{domains.map((item)=><option key={item}>{item}</option>)}</select></Field>
        <Field label="命中风险等级"><select value={draft.levelMode==='inherit'?'inherit':draft.level} disabled={readonly} onChange={(event)=>event.target.value==='inherit'?patch({levelMode:'inherit'}):patch({levelMode:'override',level:event.target.value as RiskLevel})}><option value="inherit">继承场景默认等级</option>{levels.map((item)=><option value={item} key={item}>固定为：{item}</option>)}</select></Field>
        <Field label="规则版本号 *"><input value={draft.version} disabled={readonly} onChange={(event)=>patch({version:event.target.value.toUpperCase()})} placeholder="例如：V1"/></Field>
      </div><div className="rule-basic-summary"><div><span>当前状态</span><strong>{currentStatus}</strong></div><div><span>引用场景</span><strong>{draft.bindingCount||0} 个版本</strong></div><div><span>最近保存</span><strong>{dateText(rule.updatedAt)}</strong></div></div></Panel>}
      {activeStep==='logic'&&<Panel title="2. 检测口径" subtitle="先选择适用图谱，再用自然语言描述检测规则，系统生成标准口径和可编辑表达式">
        <div className="rule-editor-section detection-graph-section">
          <header><div><strong>适用图谱</strong><span>只保留规则生成和表达式校验所需的图谱上下文。</span></div><em className={scopeDone?'complete':'pending'}>{scopeDone?'已确认':'待确认'}</em></header>
          <div className="detection-graph-card"><Icon name="graph"/><div><span>适用图谱</span><strong>{selectedGraph?graphLabel(selectedGraph):(draft.graphVersion||'未选择知识图谱')}</strong><small>系统将基于该图谱校验表达式；涉及对象和目标事件由表达式自然推导，不在检测口径页单独配置。</small></div>{!readonly&&<select value={draft.graphVersion||''} onChange={(event)=>changeGraph(event.target.value)}><option value="">请选择已发布知识图谱</option>{availableEditorGraphs.map((item)=><option value={item.id} key={item.id}>{item.graphName||item.id} · {item.id}</option>)}</select>}</div>
        </div>
        <div className="rule-editor-section detection-ai-section">
          <header><div><strong>规则描述</strong><span>描述希望系统识别什么风险，系统会结合上方图谱生成标准检测口径和表达式。</span></div><em className={detectionInput.trim()?'complete':'pending'}>{detectionInput.trim()?'已填写':'待填写'}</em></header>
          <Field label="规则描述 *" wide><textarea value={detectionInput} disabled={readonly} onChange={(event)=>patch({conditions:{...draft.conditions,detectionInput:event.target.value}})} placeholder="例如：同一采购项目下，不同供应商的投标文件内容高度相似，相似度超过70%，判定为疑似围标串标。"/></Field>
          {!readonly&&<div className="detection-ai-actions"><Button variant="primary" icon="agent" disabled={generating!==''} onClick={()=>void generateDetection()}>{generating==='generate'?'正在生成…':'AI生成规则'}</Button></div>}
        </div>
        <div className="rule-editor-section detection-result-section">
          <header><div><strong>标准口径与表达式</strong><span>标准检测口径用于业务展示，表达式用于系统执行；两者都可以人工修改。</span></div><em className={logicDone?'complete':'pending'}>{logicDone?'已通过':'待生成'}</em></header>
          <div className="form-stack">
            <Field label="标准检测口径 *" wide><textarea value={effectiveDetectionText} disabled={readonly} onChange={(event)=>patch({conditions:{...draft.conditions,detectionText:event.target.value}})} placeholder="点击 AI生成规则 后，系统会生成一段可直接展示给业务人员的检测口径。"/></Field>
            <AdvancedExpressionEditor expression={advancedExpression} elements={elements} readonly={readonly} compact onChange={(value)=>patch({type:'高级表达式',conditions:{...draft.conditions,expression:value,expressionLanguage:'DSL'}})}/>
          </div>
        </div>
        {!readonly&&<button className="advanced-toggle" onClick={()=>setAdvanced((value)=>!value)}>{advanced?'收起规则级例外':draft.exceptions.description?'修改规则级例外':'配置规则级例外'} <Icon name="chevron" size={14}/></button>}
        {advanced&&!readonly&&<div className="advanced-settings"><Field label="规则级例外"><textarea value={draft.exceptions.description} onChange={(event)=>patch({exceptions:{...draft.exceptions,description:event.target.value,enabled:Boolean(event.target.value)}})} placeholder="说明白名单、特殊授权或不适用情形"/></Field></div>}
        {readonly&&draft.exceptions.description&&<div className="rule-exception-readonly"><strong>规则级例外</strong><p>{draft.exceptions.description}</p></div>}
      </Panel>}
      {activeStep==='governance'&&<Panel title="3. 依据与证据" subtitle="配置态统一使用“证据要求”，规则运行后才形成“实际证据”"><nav className="governance-subtabs"><button type="button" className={governanceTab==='policies'?'active':''} onClick={()=>setGovernanceTab('policies')}>制度依据 <b>{policies.length}</b></button><button type="button" className={governanceTab==='evidence'?'active':''} onClick={()=>setGovernanceTab('evidence')}>证据要求 <b>{evidenceRequirements.length}</b></button></nav>
        {governanceTab==='policies'&&<section className="governance-list"><div className="section-toolbar compact"><div><strong>制度依据</strong><span>说明规则判定所依据的制度、版本和具体条款</span></div>{!readonly&&<Button icon="plus" onClick={()=>openPolicyEditor()}>新增制度依据</Button>}</div>{policies.length?<div className="table-container"><table><thead><tr><th>制度名称</th><th>制度版本</th><th>制度条款</th><th>条款原文</th><th>操作</th></tr></thead><tbody>{policies.map((policy,index)=><tr key={policy.id||index}><td><strong>{policy.name||'未填写'}</strong></td><td>{policy.version||'—'}</td><td>{policy.clause||'未填写'}</td><td><span className="table-text-ellipsis">{policy.text||'—'}</span></td><td><div className="row-actions"><button onClick={()=>openPolicyEditor(index)}>{readonly?'查看':'编辑'}</button>{!readonly&&<button className="danger-link" onClick={()=>deletePolicy(index)}>删除</button>}</div></td></tr>)}</tbody></table></div>:<div className="governance-empty"><EmptyState title="尚未配置制度依据" description="至少添加一条制度名称和条款后才能完成规则配置。"/></div>}</section>}
        {governanceTab==='evidence'&&<section className="governance-list"><div className="section-toolbar compact"><div><strong>证据要求</strong><span>定义规则命中后系统需要固化的数据和附件要求</span></div>{!readonly&&<Button icon="plus" onClick={()=>openEvidenceEditor()}>新增证据要求</Button>}</div>{evidenceRequirements.length?<div className="table-container"><table><thead><tr><th>证据名称</th><th>数据来源</th><th>来源字段</th><th>附件要求</th><th>完整性要求</th><th>操作</th></tr></thead><tbody>{evidenceRequirements.map((item,index)=><tr key={item.id||index}><td><strong>{item.name||'未填写'}</strong></td><td>{item.source||'未填写'}</td><td>{item.sourceField||'—'}</td><td>{item.attachmentRequirement}</td><td><span className="table-text-ellipsis">{item.completeness||'未填写'}</span></td><td><div className="row-actions"><button onClick={()=>openEvidenceEditor(index)}>{readonly?'查看':'编辑'}</button>{!readonly&&<button className="danger-link" onClick={()=>deleteEvidenceRequirement(index)}>删除</button>}</div></td></tr>)}</tbody></table></div>:<div className="governance-empty"><EmptyState title="尚未配置证据要求" description="至少配置一项证据名称、数据来源和完整性要求。"/></div>}</section>}
        <div className="next-action-card"><Icon name={allDone?'check':'clock'}/><div><strong>{allDone?'规则配置已完整':'规则仍有未完成配置'}</strong><span>{allDone?`命中输出将由系统自动生成：${outputsForRuleType(draft.type).join('、')}`:'请根据顶部步骤状态补齐缺失信息。'}</span></div></div></Panel>}
    </main>
    {!readonly&&<footer className="editor-action-bar"><div><span className={dirty?'dirty-dot':''}/><strong>{dirty?'修改尚未保存':currentStatus}</strong><small>{sceneId?'保存后返回当前风险场景':'规则独立保存，可由多个场景选择引用'}</small></div><div><Button onClick={cancel}>取消</Button>{activeIndex>0&&<Button onClick={goPrevious}>上一步</Button>}<Button onClick={()=>void save()}>保存草稿</Button>{activeIndex<editorSteps.length-1?<Button variant="primary" onClick={goNext}>下一步</Button>:<Button variant="primary" onClick={()=>void complete()}>完成规则配置</Button>}</div></footer>}
    {policyEditor&&<Drawer open title={policyEditor?.index===-1?'新增制度依据':'制度依据详情'} eyebrow="依据与证据" onClose={()=>setPolicyEditor(null)} footer={readonly?<Button onClick={()=>setPolicyEditor(null)}>关闭</Button>:<><Button onClick={()=>setPolicyEditor(null)}>取消</Button><Button variant="primary" onClick={savePolicyEditor}>保存</Button></>}>{policyEditor&&<div className="form-stack"><Field label="制度名称 *"><input value={policyEditor.value.name} disabled={readonly} onChange={(event)=>setPolicyEditor({...policyEditor,value:{...policyEditor.value,name:event.target.value}})}/></Field><Field label="制度版本"><input value={policyEditor.value.version} disabled={readonly} onChange={(event)=>setPolicyEditor({...policyEditor,value:{...policyEditor.value,version:event.target.value}})}/></Field><Field label="制度条款 *"><input value={policyEditor.value.clause} disabled={readonly} onChange={(event)=>setPolicyEditor({...policyEditor,value:{...policyEditor.value,clause:event.target.value}})} placeholder="例如：第十二条"/></Field><Field label="条款原文"><textarea value={policyEditor.value.text||''} disabled={readonly} onChange={(event)=>setPolicyEditor({...policyEditor,value:{...policyEditor.value,text:event.target.value}})}/></Field></div>}</Drawer>}
    {evidenceEditor&&<Drawer open title={evidenceEditor?.index===-1?'新增证据要求':'证据要求详情'} eyebrow="依据与证据" onClose={()=>setEvidenceEditor(null)} footer={readonly?<Button onClick={()=>setEvidenceEditor(null)}>关闭</Button>:<><Button onClick={()=>setEvidenceEditor(null)}>取消</Button><Button variant="primary" onClick={saveEvidenceEditor}>保存</Button></>}>{evidenceEditor&&<div className="form-stack"><Field label="证据名称 *"><input value={evidenceEditor.value.name} disabled={readonly} onChange={(event)=>setEvidenceEditor({...evidenceEditor,value:{...evidenceEditor.value,name:event.target.value}})}/></Field><Field label="数据来源 *"><input value={evidenceEditor.value.source} disabled={readonly} onChange={(event)=>setEvidenceEditor({...evidenceEditor,value:{...evidenceEditor.value,source:event.target.value}})} placeholder="例如：ERP采购系统"/></Field><Field label="来源字段"><input value={evidenceEditor.value.sourceField} disabled={readonly} onChange={(event)=>setEvidenceEditor({...evidenceEditor,value:{...evidenceEditor.value,sourceField:event.target.value}})} placeholder="单据编号或字段编码"/></Field><Field label="附件要求"><select value={evidenceEditor.value.attachmentRequirement} disabled={readonly} onChange={(event)=>setEvidenceEditor({...evidenceEditor,value:{...evidenceEditor.value,attachmentRequirement:event.target.value}})}><option>无需附件</option><option>可选附件</option><option>必须有附件</option></select></Field><Field label="完整性要求 *"><textarea value={evidenceEditor.value.completeness} disabled={readonly} onChange={(event)=>setEvidenceEditor({...evidenceEditor,value:{...evidenceEditor.value,completeness:event.target.value}})}/></Field><Field label="说明"><textarea value={evidenceEditor.value.description} disabled={readonly} onChange={(event)=>setEvidenceEditor({...evidenceEditor,value:{...evidenceEditor.value,description:event.target.value}})}/></Field></div>}</Drawer>}
  </>
}

function logicHelp(type:RuleItem['type']){return type==='属性'?'添加一个或多个属性判断条件。':type==='字段比对'?'添加一个或多个字段之间的比较条件。':type==='关系路径'?'配置一至两跳关系路径，并可增加属性约束。':type==='时序'?'添加一个或多个类节点发生要求，共用同一观察窗口。':type==='聚合'?'添加一至三个统计指标，并设置组合方式。':'使用受控表达式组合字段、类节点、关系和白名单函数。'}
function operatorsFor(element?:OntologyElement){const type=element?.dataType||'';if(/数字|金额|日期/.test(type))return['等于','不等于','大于','大于等于','小于','小于等于','为空','不为空'];return['等于','不等于','包含','不包含','为空','不为空']}
function ConditionRows({conditions,properties,readonly,fieldCompare,onAdd,onUpdate,onRemove}:{conditions:RuleCondition[];properties:OntologyElement[];readonly:boolean;fieldCompare:boolean;onAdd:()=>void;onUpdate:(id:string,next:Partial<RuleCondition>)=>void;onRemove:(id:string)=>void}){
  return <div className="simple-condition-list">{conditions.length>0&&<div className="simple-condition-head"><span>序号</span><span>判断属性</span><span>运算符</span><span>{fieldCompare?'对比属性':'比较值'}</span><span>操作</span></div>}{conditions.map((condition,index)=>{const element=properties.find((item)=>item.code===condition.fieldCode);const unary=['为空','不为空'].includes(condition.operator);return <div className="simple-condition" key={condition.id}><b>{index+1}</b><select value={condition.fieldCode} disabled={readonly} onChange={(event)=>{const next=properties.find((item)=>item.code===event.target.value);onUpdate(condition.id,{fieldCode:event.target.value,fieldName:next?.name||'',fieldType:next?.dataType||'',operator:'等于'})}}><option value="">选择判断属性</option>{properties.map((item)=><option value={item.code} key={item.code}>{item.name}</option>)}</select><select value={condition.operator} disabled={readonly} onChange={(event)=>{const operator=event.target.value;onUpdate(condition.id,{operator,value:['为空','不为空'].includes(operator)?'':condition.value})}}>{operatorsFor(element).map((item)=><option key={item}>{item}</option>)}</select>{unary?<div className="unary-value">无需比较值</div>:fieldCompare?<select value={condition.valueFieldCode||''} disabled={readonly} onChange={(event)=>{const next=properties.find((item)=>item.code===event.target.value);onUpdate(condition.id,{valueMode:'field',value:'',valueFieldCode:event.target.value,valueFieldName:next?.name||''})}}><option value="">选择对比属性</option>{properties.map((item)=><option value={item.code} key={item.code}>{item.name}</option>)}</select>:<input value={condition.value} disabled={readonly} onChange={(event)=>onUpdate(condition.id,{valueMode:'literal',value:event.target.value})} placeholder="输入比较值"/>}{!readonly&&<button onClick={()=>onRemove(condition.id)}><Icon name="close" size={14}/></button>}</div>})}{!conditions.length&&<EmptyState title="尚未配置判断条件" description={fieldCompare?'请选择两个属性进行比较。':'请选择一个属性并输入比较值。'}/>} {!readonly&&<Button icon="plus" onClick={onAdd}>添加判断条件</Button>}</div>
}


function LogicSelector({logic,count,readonly,onChange}:{logic:Logic;count:number;readonly:boolean;onChange:(logic:Logic)=>void}){
  return <div className="condition-logic-bar"><div><strong>条件组合</strong><span>当前共 {count} 条条件</span></div><div><button type="button" className={logic==='AND'?'active':''} disabled={readonly} onClick={()=>onChange('AND')}><b>AND</b><span>满足全部条件</span></button><button type="button" className={logic==='OR'?'active':''} disabled={readonly} onClick={()=>onChange('OR')}><b>OR</b><span>满足任一条件</span></button></div></div>
}

function TimeConditionRows({conditions,events,readonly,onAdd,onUpdate,onRemove}:{conditions:TimeCondition[];events:OntologyElement[];readonly:boolean;onAdd:()=>void;onUpdate:(id:string,next:Partial<TimeCondition>)=>void;onRemove:(id:string)=>void}){
  return <div className="time-condition-list">
    {conditions.length>0&&<div className="time-condition-head"><span>序号</span><span>判断类节点</span><span>发生要求</span><span>操作</span></div>}
    {conditions.map((condition,index)=><div className="time-condition-row" key={condition.id}><b>{index+1}</b><select value={condition.eventCode} disabled={readonly} onChange={(event)=>{const item=events.find((candidate)=>candidate.code===event.target.value);onUpdate(condition.id,{eventCode:event.target.value,eventName:item?.name||''})}}><option value="">选择判断类</option>{events.map((item)=><option value={item.code} key={item.code}>{item.name}</option>)}</select><select value={condition.requirement} disabled={readonly} onChange={(event)=>onUpdate(condition.id,{requirement:event.target.value as TimeCondition['requirement']})}><option>必须发生</option><option>不得发生</option></select>{!readonly&&<button type="button" onClick={()=>onRemove(condition.id)}><Icon name="close" size={14}/></button>}</div>)}
    {!conditions.length&&<EmptyState title="尚未配置时序条件" description="选择一个或多个类，并判断对应类节点必须发生或不得发生。"/>}
    {!readonly&&<Button icon="plus" onClick={onAdd}>添加类节点条件</Button>}
  </div>
}

function AggregateMetricRows({metrics,properties,readonly,onAdd,onUpdate,onRemove}:{metrics:AggregateMetric[];properties:OntologyElement[];readonly:boolean;onAdd:()=>void;onUpdate:(id:string,next:Partial<AggregateMetric>)=>void;onRemove:(id:string)=>void}){
  const numericProperties=properties.filter((item)=>/数字|金额/.test(item.dataType))
  const options=numericProperties.length?numericProperties:properties
  return <div className="aggregate-metric-list">
    {metrics.length>0&&<div className="aggregate-metric-head"><span>序号</span><span>聚合函数</span><span>统计属性</span><span>运算符</span><span>阈值</span><span>操作</span></div>}
    {metrics.map((metric,index)=><div className="aggregate-metric-row" key={metric.id}><b>{index+1}</b><select value={metric.function} disabled={readonly} onChange={(event)=>onUpdate(metric.id,{function:event.target.value})}><option>COUNT</option><option>COUNT_DISTINCT</option><option>SUM</option><option>AVG</option><option>MAX</option><option>MIN</option><option>RATIO</option><option>SIMILARITY</option></select><select value={metric.fieldCode} disabled={readonly} onChange={(event)=>{const item=options.find((candidate)=>candidate.code===event.target.value);onUpdate(metric.id,{fieldCode:event.target.value,fieldName:item?.name||''})}}><option value="">选择统计属性</option>{options.map((item)=><option value={item.code} key={item.code}>{item.name}</option>)}</select><select value={metric.operator} disabled={readonly} onChange={(event)=>onUpdate(metric.id,{operator:event.target.value})}><option>大于</option><option>大于等于</option><option>等于</option><option>小于</option><option>小于等于</option></select><input type="number" value={metric.threshold} disabled={readonly} onChange={(event)=>onUpdate(metric.id,{threshold:Number(event.target.value)})}/>{!readonly&&<button type="button" onClick={()=>onRemove(metric.id)}><Icon name="close" size={14}/></button>}</div>)}
    {!metrics.length&&<EmptyState title="尚未配置统计指标" description="添加一至三个统计指标，指标之间可按 AND 或 OR 组合。"/>}
    {!readonly&&<Button icon="plus" onClick={onAdd}>添加统计指标</Button>}
  </div>
}

function AdvancedExpressionEditor({expression,elements,readonly,compact=false,onChange}:{expression:string;elements:OntologyElement[];readonly:boolean;compact?:boolean;onChange:(value:string)=>void}){
  const issue=advancedExpressionIssue(expression)
  const properties=elements.filter((item)=>item.type==='property')
  const events=elements.filter((item)=>item.type==='class')
  const relations=elements.filter((item)=>item.type==='relation')
  const append=(token:string)=>onChange(`${expression}${expression.trim()?'\nAND ':''}${token}`)
  const functionToken=(name:string)=>name==='AI_REVIEW'?`AI_REVIEW("风险名称", "审查要求") == true`:name==='EVENT_COUNT'?`EVENT_COUNT("", 30, "DAY", "BEFORE")`:name==='EXISTS_PATH'?`EXISTS_PATH("")`:name==='DATE_DIFF'?`DATE_DIFF("", "")`:name==='ABS'?`ABS()`:`${name}("", 30, "DAY", "BEFORE")`
  return <div className={`advanced-expression-editor${compact?' compact':''}`}>
    <header><div><strong>{compact?'表达式':'高级表达式'}</strong><span>{compact?'系统生成的表达式可直接修改，保存前会自动校验基础语法。':'仅支持当前结构元素和白名单函数，不允许 SQL、JavaScript 或外部调用'}</span></div><b>DSL</b></header>
    <textarea value={expression} disabled={readonly} maxLength={2000} spellCheck={false} onChange={(event)=>onChange(event.target.value)} placeholder={'例如：\nPROC.Supplier.status == "异常"\nAND EVENT_COUNT("PROC.BidConfirmed", 30, "DAY", "BEFORE") > 0'}/>
    <div className={`expression-validation ${issue?'error':'valid'}`}><Icon name={issue?'warning':'check'} size={14}/><span>{issue||'表达式基础语法检查通过'}</span><small>{expression.length}/2000</small></div>
    {!readonly&&!compact&&<div className="expression-palette">
      <section><h4>函数</h4><div>{expressionFunctions.map((name)=><button type="button" key={name} onClick={()=>append(functionToken(name))}><strong>{name}</strong><span>{expressionFunctionLabels[name]}</span></button>)}</div></section>
      <section><h4>属性</h4><div>{properties.map((item)=><button type="button" key={item.code} onClick={()=>append(item.code)}><strong>{item.name}</strong><code>{item.code}</code></button>)}</div></section>
      <section><h4>类节点</h4><div>{events.map((item)=><button type="button" key={item.code} onClick={()=>append(`EVENT_COUNT("${item.code}", 30, "DAY", "BEFORE") > 0`)}><strong>{item.name}</strong><code>{item.code}</code></button>)}</div></section>
      <section><h4>关系</h4><div>{relations.map((item)=><button type="button" key={item.code} onClick={()=>append(`EXISTS_PATH("${item.code}")`)}><strong>{item.name}</strong><code>{item.code}</code></button>)}</div></section>
    </div>}
    <div className="expression-help"><strong>支持内容</strong><span>AND、OR、NOT、括号、比较和算术运算；时间单位使用 HOUR、DAY、MONTH，方向使用 BEFORE、AFTER。</span></div>
  </div>
}
