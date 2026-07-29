import { createHash, randomUUID } from 'node:crypto'

export const editableSceneStatuses = new Set(['草稿', '待试跑', '待发布'])
export const parseJson = (value, fallback) => {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch { return fallback }
}
export const toJson = (value) => JSON.stringify(value ?? null)
export const makeBusinessId = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`
export const configHash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function normalizePolicyList(value){const parsed=parseJson(value,[]);const list=Array.isArray(parsed)?parsed:parsed&&typeof parsed==='object'?[parsed]:[];return list.map((item)=>({id:item?.id||'',name:String(item?.name||''),version:String(item?.version||''),clause:String(item?.clause||''),text:String(item?.text||'')}))}
function evidenceSourceFor(name){return {'业务来源记录':'ERP/采购业务系统','主体信息':'本体主数据、工商司法外部数据','审批记录':'OA/ERP审批流','联系方式来源':'供应商登记、人员主数据','附件材料':'业务系统附件归档','规则运行明细':'规则运行服务'}[name]||'业务来源系统'}
export function normalizeEvidenceRequirements(value){const parsed=parseJson(value,[]);const list=Array.isArray(parsed)?parsed:[];return list.map((item,index)=>typeof item==='string'?{id:`evidence-${index+1}`,name:item,source:evidenceSourceFor(item),sourceField:'',attachmentRequirement:item==='附件材料'?'必须有附件':'可选附件',completeness:'必须保存来源记录编号和取数批次',description:''}:{id:item?.id||`evidence-${index+1}`,name:String(item?.name||''),source:String(item?.source||''),sourceField:String(item?.sourceField||item?.source_field||''),attachmentRequirement:String(item?.attachmentRequirement||item?.attachment_requirement||'可选附件'),completeness:String(item?.completeness||''),description:String(item?.description||'')})}
export function normalizeSkillInputs(value){const parsed=parseJson(value,[]);return(Array.isArray(parsed)?parsed:[]).map((item,index)=>({id:String(item?.id||`input-${index+1}`),name:String(item?.name||''),sourceType:['对象字段','事件数据','附件','文本'].includes(item?.sourceType)?item.sourceType:'附件',source:String(item?.source||''),required:item?.required!==false}))}
export function normalizeSkillOutputs(value){const parsed=parseJson(value,[]);return(Array.isArray(parsed)?parsed:[]).map((item,index)=>({id:String(item?.id||`output-${index+1}`),name:String(item?.name||''),dataType:String(item?.dataType||'文本'),description:String(item?.description||'')}))}export function normalizePathConfig(value){const parsed=parseJson(value,{});return{hops:Array.isArray(parsed?.hops)?parsed.hops:[],logic:parsed?.logic==='OR'?'OR':'AND',constraints:Array.isArray(parsed?.constraints)?parsed.constraints:[]}}
export function normalizeTimeConfig(value){const parsed=parseJson(value,{});const legacyEvent=String(parsed?.eventCode||'');const conditions=Array.isArray(parsed?.conditions)?parsed.conditions:legacyEvent?[{id:'time-legacy',eventCode:legacyEvent,eventName:String(parsed?.eventName||''),requirement:'必须发生'}]:[];return{baseline:parsed?.baseline==='runtime'?'runtime':'event',logic:parsed?.logic==='OR'?'OR':'AND',conditions:conditions.map((item,index)=>({id:item?.id||`time-${index+1}`,eventCode:String(item?.eventCode||''),eventName:String(item?.eventName||''),requirement:item?.requirement==='不得发生'?'不得发生':'必须发生'})),eventCode:legacyEvent,windowValue:Number(parsed?.windowValue??30),windowUnit:String(parsed?.windowUnit||'天'),direction:String(parsed?.direction||'之前')}}
export function normalizeAggregateConfig(value){const parsed=parseJson(value,{});const legacyField=String(parsed?.fieldCode||'');const metrics=Array.isArray(parsed?.metrics)?parsed.metrics:legacyField?[{id:'metric-legacy',function:String(parsed?.function||'COUNT'),fieldCode:legacyField,fieldName:String(parsed?.fieldName||''),operator:String(parsed?.operator||'大于等于'),threshold:Number(parsed?.threshold||0)}]:[];return{logic:parsed?.logic==='OR'?'OR':'AND',metrics:metrics.map((item,index)=>({id:item?.id||`metric-${index+1}`,function:String(item?.function||'COUNT'),fieldCode:String(item?.fieldCode||''),fieldName:String(item?.fieldName||''),operator:String(item?.operator||'大于等于'),threshold:Number(item?.threshold||0)})),function:String(parsed?.function||metrics[0]?.function||'COUNT'),fieldCode:legacyField||String(metrics[0]?.fieldCode||''),groupBy:String(parsed?.groupBy||''),operator:String(parsed?.operator||metrics[0]?.operator||'大于等于'),threshold:Number(parsed?.threshold??metrics[0]?.threshold??0)}}
const advancedExpressionFunctions=new Set(['SUM','AVG','MAX','MIN','COUNT','COUNT_DISTINCT','RATIO','SIMILARITY','EVENT_COUNT','EXISTS_PATH','DATE_DIFF','ABS','IN_LIST','TEXT_CLASSIFY','AI_REVIEW'])
export function validateAdvancedExpression(value){
  const expression=String(value||'').trim()
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
  const unknown=functions.find((item)=>!advancedExpressionFunctions.has(item))
  return unknown?`不支持函数 ${unknown}`:''
}
export function rawRiskLevel(rule){return String(rule?.risk_level||rule?.level||'继承场景')}
export function effectiveRiskLevel(rule,sceneLevel='高'){const raw=rawRiskLevel(rule);return rule?.effective_risk_level||(raw==='继承场景'?sceneLevel:raw)}
export function normalizeValidation(value){const validation=parseJson(value,{blockers:[],warnings:[],validatedAt:''});const fix=(item)=>({...item,message:String(item?.message||'').replaceAll('必备证据','证据要求')});return{...validation,blockers:(validation.blockers||[]).map(fix),warnings:(validation.warnings||[]).map(fix)}}


export function mapSkillRow(row){
  const sceneNames=String(row.scene_names||row.scene_name||'').split(/[、,]/).map((item)=>item.trim()).filter(Boolean)
  const sceneIds=String(row.scene_ids||row.scene_id||'').split(',').map((item)=>item.trim()).filter(Boolean)
  const config=parseJson(row.config_json,{})
  const outputs=normalizeSkillOutputs(row.output_json)
  const reviewDemand=String(config.reviewDemand||config.instruction||row.description||'')
  const reviewContent=String(config.reviewContent||row.description||reviewDemand)
  const reviewRequirement=String(config.reviewRequirement||config.instruction||reviewDemand)
  const expectedOutput=String(config.expectedOutput||outputs.map((item)=>item.name).filter(Boolean).join('、'))
  return{
    id:row.skill_id,versionId:row.id,code:row.code,name:row.name,version:row.version,type:row.skill_type,domain:row.domain||'',description:row.description||'',
    level:row.effective_risk_level||row.risk_level||'高',enabled:row.binding_enabled===undefined?true:Boolean(row.binding_enabled),status:row.status,
    inputs:normalizeSkillInputs(row.input_json),instruction:String(config.instruction||reviewRequirement),threshold:Number(config.threshold??80),reviewDemand,reviewContent,reviewRequirement,expectedOutput,generatedAt:String(config.generatedAt||''),outputs,
    policies:normalizePolicyList(row.policy_json),evidenceRequirements:normalizeEvidenceRequirements(row.evidence_json),failureStrategy:row.failure_strategy||'记录执行异常，不产生预警',
    summary:row.summary||'',lockVersion:Number(row.lock_version||1),updatedAt:row.updated_at,sceneNames,sceneIds,bindingCount:Number(row.binding_count||sceneNames.length||0),priority:Number(row.priority||100),
  }
}
export function mapRuleRow(row) {
  const sceneNames=String(row.scene_names||row.scene_name||'').split(/[、,]/).map((item)=>item.trim()).filter(Boolean)
  const sceneIds=String(row.scene_ids||row.scene_id||'').split(',').map((item)=>item.trim()).filter(Boolean)
  const policies=normalizePolicyList(row.policy_json)
  const evidenceRequirements=normalizeEvidenceRequirements(row.evidence_json)
  const configuredLevel=rawRiskLevel(row)
  return {
    id:row.rule_id,versionId:row.id,sceneId:row.scene_id||sceneIds[0]||'',sceneVersionId:row.scene_version_id||'',
    code:row.code,name:row.name,version:row.version,type:row.rule_type,level:effectiveRiskLevel(row),defaultLevel:configuredLevel==='继承场景'?undefined:configuredLevel,
    levelMode:configuredLevel==='继承场景'?'inherit':'override',
    enabled:row.binding_enabled===undefined?row.enabled===undefined?true:Boolean(row.enabled):Boolean(row.binding_enabled),status:row.status,
    conditions:parseJson(row.condition_json,{id:'group-root',logic:'AND',items:[]}),
    pathConfig:normalizePathConfig(row.path_json),
    timeConfig:normalizeTimeConfig(row.time_json),
    aggregateConfig:normalizeAggregateConfig(row.aggregate_json),
    exceptions:parseJson(row.exception_json,{enabled:false,description:'',whitelist:[]}),
    outputs:parseJson(row.output_json,[]),evidence:evidenceRequirements.map((item)=>item.name).filter(Boolean),evidenceRequirements,
    policy:policies[0]||{name:'',version:'',clause:''},policies,failureStrategy:row.failure_strategy,
    summary:row.summary,lockVersion:Number(row.lock_version),updatedAt:row.updated_at,
    domain:row.domain||'',objectCode:row.object_code||'',objectName:row.object_name||'',eventCode:row.event_code||'',eventName:row.event_name||'',
    sceneName:row.scene_name||sceneNames[0]||'',sceneNames,sceneIds,bindingCount:Number(row.binding_count||sceneNames.length||0),catalogBindingCount:Number(row.catalog_binding_count||0),
    sceneStatus:row.scene_status||'',ontologyId:row.ontology_id||'',graphVersion:row.graph_version||'',priority:Number(row.priority||100),
  }
}

export function mapSceneRow(row, rules = [], skills = [], versions = []) {
  return {
    id:row.scene_id, versionId:row.id, code:row.code, name:row.name, version:row.version, status:row.status,
    domain:row.domain, description:row.description, objectCode:row.object_code, objectName:row.object_name,
    eventCode:row.event_code, eventName:row.event_name, level:row.risk_level,
    observationValue:Number(row.observation_value), observationUnit:row.observation_unit,
    ontologyId:row.ontology_id, graphVersion:row.graph_version,
    organizations:parseJson(row.organization_json,[]), objectScope:parseJson(row.object_scope_json,{logic:'AND',items:[]}),
    exceptions:parseJson(row.exception_json,{description:'',validUntil:''}), evidence:parseJson(row.evidence_json,[]),
    policies:parseJson(row.policy_json,[]), checkTemplate:parseJson(row.check_template_json,{requirements:'',materials:[],deadlineHours:48}),
    validation:normalizeValidation(row.validation_json),
    lastTrialId:row.last_trial_id||'', lastTrialStatus:row.last_trial_status||'', runCount:Number(row.run_count||0),
    lockVersion:Number(row.lock_version), updatedBy:row.updated_by, updatedAt:row.updated_at,
    publishedAt:row.published_at||'', stopReason:row.stop_reason||'', rules,
    ruleCount:rules.length||Number(row.rule_count||0),
    enabledRuleCount:rules.length?rules.filter((item)=>item.enabled).length:Number(row.enabled_rule_count||0), versions,
    skills,skillCount:skills.length||Number(row.skill_count||0),
    enabledSkillCount:skills.length?skills.filter((item)=>item.enabled).length:Number(row.enabled_skill_count||0),
    canDelete:editableSceneStatuses.has(row.status)&&Number(row.run_count||0)===0,
  }
}

export async function writeSceneAudit(connection, sceneVersionId, action, summary, risk = '普通') {
  await connection.query('INSERT INTO scene_rule_audits (scene_version_id,action,summary,risk_level) VALUES (?,?,?,?)',[sceneVersionId,action,summary,risk])
}
export async function getBoundRuleRows(connection,sceneVersionId,enabledOnly=false){
  const sql=['SELECT rav.*,ra.code,sv.scene_id,sv.name AS scene_name,sv.status AS scene_status,',
    'b.scene_version_id,b.enabled AS binding_enabled,b.priority,b.risk_level_override,',
    "COALESCE(b.risk_level_override,NULLIF(rav.risk_level,'继承场景'),sv.risk_level) AS effective_risk_level,",
    "(SELECT COUNT(*) FROM scene_rule_bindings bx JOIN rule_asset_versions rvx ON rvx.id=bx.rule_version_id WHERE rvx.rule_id=rav.rule_id) AS binding_count,",
    "(SELECT COUNT(*) FROM pattern_rule_bindings prb JOIN rule_asset_versions rvx ON rvx.id=prb.rule_version_id WHERE rvx.rule_id=rav.rule_id) AS catalog_binding_count,",
    "(SELECT GROUP_CONCAT(DISTINCT svx.name ORDER BY svx.name SEPARATOR '、') FROM scene_rule_bindings bx JOIN rule_asset_versions rvx ON rvx.id=bx.rule_version_id JOIN scene_versions svx ON svx.id=bx.scene_version_id WHERE rvx.rule_id=rav.rule_id) AS scene_names,",
    "(SELECT GROUP_CONCAT(DISTINCT svx.scene_id ORDER BY svx.scene_id SEPARATOR ',') FROM scene_rule_bindings bx JOIN rule_asset_versions rvx ON rvx.id=bx.rule_version_id JOIN scene_versions svx ON svx.id=bx.scene_version_id WHERE rvx.rule_id=rav.rule_id) AS scene_ids",
    'FROM scene_rule_bindings b JOIN rule_asset_versions rav ON rav.id=b.rule_version_id',
    'JOIN rule_assets ra ON ra.id=rav.rule_id JOIN scene_versions sv ON sv.id=b.scene_version_id',
    'WHERE b.scene_version_id=?',enabledOnly?'AND b.enabled=1':'','ORDER BY b.priority ASC,rav.updated_at DESC'].filter(Boolean).join(' ')
  const [rows]=await connection.query(sql,[sceneVersionId])
  return rows
}


export async function getBoundSkillRows(connection,sceneVersionId,enabledOnly=false){
  const sql=['SELECT sav.*,sa.code,sv.scene_id,sv.name AS scene_name,sv.status AS scene_status,',
    'b.scene_version_id,b.enabled AS binding_enabled,b.priority,b.risk_level_override,',
    "COALESCE(b.risk_level_override,NULLIF(sav.risk_level,'继承场景'),sv.risk_level) AS effective_risk_level",
    'FROM scene_skill_bindings b JOIN skill_asset_versions sav ON sav.id=b.skill_version_id',
    'JOIN skill_assets sa ON sa.id=sav.skill_id JOIN scene_versions sv ON sv.id=b.scene_version_id',
    'WHERE b.scene_version_id=?',enabledOnly?'AND b.enabled=1':'','ORDER BY b.priority ASC,sav.updated_at DESC'].filter(Boolean).join(' ')
  const [rows]=await connection.query(sql,[sceneVersionId])
  return rows
}
export async function getCurrentSceneRow(pool, id, connection = pool) {
  const [rows] = await connection.query(`SELECT sv.*,rs.code,
    (SELECT COUNT(*) FROM scene_rule_bindings b WHERE b.scene_version_id=sv.id) AS rule_count,
    (SELECT COUNT(*) FROM scene_rule_bindings b WHERE b.scene_version_id=sv.id AND b.enabled=1) AS enabled_rule_count,
    (SELECT COUNT(*) FROM scene_skill_bindings b WHERE b.scene_version_id=sv.id) AS skill_count,
    (SELECT COUNT(*) FROM scene_skill_bindings b WHERE b.scene_version_id=sv.id AND b.enabled=1) AS enabled_skill_count,
    ((SELECT COUNT(*) FROM rule_run_records rr WHERE rr.scene_version_id=sv.id)+(SELECT COUNT(*) FROM skill_run_records sr WHERE sr.scene_version_id=sv.id)) AS run_count,
    (SELECT status FROM rule_trial_tasks tt WHERE tt.id=sv.last_trial_id) AS last_trial_status
    FROM risk_scenes rs JOIN scene_versions sv ON sv.id=rs.current_version_id
    WHERE rs.id=? OR rs.code=? OR sv.id=? LIMIT 1`,[id,id,id])
  return rows[0]||null
}

export async function getSceneAggregate(pool,id) {
  const row=await getCurrentSceneRow(pool,id)
  if(!row)return null
  const rules=await getBoundRuleRows(pool,row.id)
  const skills=await getBoundSkillRows(pool,row.id)
  const [versions]=await pool.query(`SELECT id,version,status,updated_by,updated_at,published_at,source_version_id FROM scene_versions WHERE scene_id=? ORDER BY created_at DESC`,[row.scene_id])
  return mapSceneRow(row,rules.map(mapRuleRow),skills.map(mapSkillRow),versions.map((item)=>({id:item.id,version:item.version,status:item.status,updatedBy:item.updated_by,updatedAt:item.updated_at,publishedAt:item.published_at||'',sourceVersionId:item.source_version_id||''})))
}

export function collectConditionIssues(group,issues,depth=1){
  if(!group||!Array.isArray(group.items)){issues.push({field:'conditions',tab:'conditions',message:'条件表达式格式无效'});return}
  if(depth>3)issues.push({field:group.id||'conditions',tab:'conditions',message:'条件组最多支持三层嵌套'})
  if(!group.items.length)issues.push({field:group.id||'conditions',tab:'conditions',message:'条件组至少需要一个条件'})
  for(const item of group.items){
    if(Array.isArray(item?.items))collectConditionIssues(item,issues,depth+1)
    else if(!item?.fieldCode||!item?.operator||(!['为空','不为空'].includes(item.operator)&&item?.value===''&&!item?.valueFieldCode))issues.push({field:item?.id||'condition',tab:'conditions',message:'条件字段、运算符和值不能为空'})
  }
}

export async function collectSemanticReferenceIssues(connection, reference, tab = 'basic') {
  const blockers=[];const warnings=[]
  const ontologyId=reference.ontologyId||reference.ontology_id||''
  const graphVersion=reference.graphVersion||reference.graph_version||''
  const objectCode=reference.objectCode||reference.object_code||''
  const eventCode=reference.eventCode||reference.event_code||''
  if(ontologyId){
    const [ontologies]=await connection.query('SELECT id,status FROM ontologies WHERE id=? LIMIT 1',[ontologyId])
    if(!ontologies.length)blockers.push({field:'ontologyId',tab,message:`适用本体 ${ontologyId} 不存在`})
    else if(ontologies[0].status!=='已发布')blockers.push({field:'ontologyId',tab,message:`适用本体 ${ontologyId} 尚未发布`})
  }
  if(objectCode&&ontologyId){const [objects]=await connection.query("SELECT element_id FROM ontology_elements WHERE ontology_id=? AND element_type='class' AND code=? LIMIT 1",[ontologyId,objectCode]);if(!objects.length)blockers.push({field:'objectCode',tab,message:`主对象 ${objectCode} 不存在于适用本体类`})}
  if(eventCode&&ontologyId){const [targets]=await connection.query("SELECT element_id FROM ontology_elements WHERE ontology_id=? AND element_type='class' AND code=? LIMIT 1",[ontologyId,eventCode]);if(!targets.length)blockers.push({field:'eventCode',tab,message:`目标类 ${eventCode} 不存在于适用本体`})}
  if(graphVersion){
    const [graphs]=await connection.query('SELECT id,status,ontology_id FROM graph_versions WHERE id=? LIMIT 1',[graphVersion])
    if(!graphs.length)blockers.push({field:'graphVersion',tab,message:`图谱版本 ${graphVersion} 不存在`})
    else {if(graphs[0].status!=='已发布')blockers.push({field:'graphVersion',tab,message:`图谱版本 ${graphVersion} 尚未发布`});if(graphs[0].ontology_id&&ontologyId&&graphs[0].ontology_id!==ontologyId)blockers.push({field:'graphVersion',tab,message:`图谱版本 ${graphVersion} 使用的本体与当前配置不一致`})}
  }else warnings.push({field:'graphVersion',tab,message:'建议选择一个已发布生产图谱版本'})
  return {blockers,warnings}
}

export async function collectAdvancedExpressionReferenceIssues(connection,ontologyId,value,tab='conditions'){
  const expression=String(value||'')
  const codes=[...new Set(expression.match(/\b[A-Z][A-Z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+\b/g)||[])]
  if(!codes.length)return{blockers:[],warnings:[]}
  const placeholders=codes.map(()=>'?').join(',')
  const [rows]=await connection.query(`SELECT code FROM ontology_elements WHERE ontology_id=? AND code IN (${placeholders})`,[ontologyId,...codes])
  const found=new Set(rows.map((item)=>String(item.code)))
  return{blockers:codes.filter((code)=>!found.has(code)).map((code)=>({field:'advancedExpression',tab,message:`高级表达式引用的本体元素 ${code} 不存在`})),warnings:[]}
}
export async function assertSemanticReferences(connection, reference) {
  const result=await collectSemanticReferenceIssues(connection, reference)
  if(result.blockers.length)throw Object.assign(new Error(result.blockers[0].message),{status:409,validation:result})
}

export function validateRuleRecord(rule){
  const blockers=[];const warnings=[]
  if(!String(rule.name||'').trim())blockers.push({field:'name',tab:'basic',message:'规则名称不能为空'})
  if(!String(rule.ontology_id||'').trim())blockers.push({field:'ontologyId',tab:'basic',message:'适用本体不能为空'})
  if(!String(rule.graph_version||'').trim())blockers.push({field:'graphVersion',tab:'basic',message:'图谱版本不能为空'})
  const usesTimeWindow=['时序','聚合'].includes(rule.rule_type)
  const scope=normalizeTimeConfig(rule.time_json)
  if(usesTimeWindow&&scope.baseline==='event'&&!String(rule.event_code||'').trim())blockers.push({field:'eventCode',tab:'conditions',message:'以目标类节点为计算基准时，必须配置目标类'})
  if(usesTimeWindow&&!Number(scope.windowValue))blockers.push({field:'window',tab:'conditions',message:'观察窗口必须大于0'})
  if(rule.rule_type==='高级表达式'){
    const advanced=parseJson(rule.condition_json,{})
    const issue=validateAdvancedExpression(advanced.expression)
    if(issue)blockers.push({field:'advancedExpression',tab:'conditions',message:issue})
  }
  if(['属性','字段比对'].includes(rule.rule_type)){
    const conditions=parseJson(rule.condition_json,{id:'group-root',logic:'AND',items:[]})
    collectConditionIssues(conditions,blockers)
    if((conditions.items||[]).length>10)blockers.push({field:'conditions',tab:'conditions',message:'单条规则最多支持10个判断条件'})
  }
  if(rule.rule_type==='关系路径'){
    const path=normalizePathConfig(rule.path_json)
    if(!path.hops.length)blockers.push({field:'path',tab:'conditions',message:'关系路径规则至少需要一跳路径'})
    if(path.hops.length>2)blockers.push({field:'path',tab:'conditions',message:'关系路径最多支持两跳'})
    if(path.constraints.length>10)blockers.push({field:'pathConstraints',tab:'conditions',message:'关系路径最多支持10个约束条件'})
    if(path.constraints.length)collectConditionIssues({id:'path-constraints',logic:path.logic,items:path.constraints},blockers)
  }
  if(rule.rule_type==='时序'){
    const time=normalizeTimeConfig(rule.time_json)
    if(!time.conditions.length)blockers.push({field:'time',tab:'conditions',message:'时序规则至少需要一个事件条件'})
    if(time.conditions.length>10)blockers.push({field:'time',tab:'conditions',message:'时序规则最多支持10个事件条件'})
    for(const item of time.conditions)if(!item.eventCode)blockers.push({field:item.id,tab:'conditions',message:'判断事件不能为空'})
  }
  if(rule.rule_type==='聚合'){
    const aggregate=normalizeAggregateConfig(rule.aggregate_json)
    if(!aggregate.metrics.length)blockers.push({field:'aggregate',tab:'conditions',message:'聚合规则至少需要一个统计指标'})
    if(aggregate.metrics.length>3)blockers.push({field:'aggregate',tab:'conditions',message:'聚合规则最多支持3个统计指标'})
    for(const item of aggregate.metrics)if(!item.fieldCode||!item.function||!item.operator||!Number.isFinite(Number(item.threshold)))blockers.push({field:item.id,tab:'conditions',message:'聚合函数、统计字段、判断条件和阈值不能为空'})
  }
  if(!parseJson(rule.output_json,[]).length)blockers.push({field:'outputs',tab:'conditions',message:'规则缺少系统命中输出配置'})
  const evidence=normalizeEvidenceRequirements(rule.evidence_json)
  if(!evidence.length)blockers.push({field:'evidence',tab:'output',message:'至少配置一项证据要求'})
  else if(evidence.some((item)=>!item.name.trim()||!item.source.trim()||!item.completeness.trim()))blockers.push({field:'evidence',tab:'output',message:'证据名称、数据来源和完整性要求不能为空'})
  const policies=normalizePolicyList(rule.policy_json)
  if(!policies.some((item)=>item.name.trim()&&item.clause.trim()))blockers.push({field:'policy',tab:'output',message:'至少配置一条完整制度依据'})
  if(!parseJson(rule.exception_json,{}).enabled)warnings.push({field:'exceptions',tab:'conditions',message:'尚未配置例外条件，请确认适用边界'})
  return {blockers,warnings}
}

export function validateSkillRecord(skill){
  const blockers=[];const warnings=[]
  const config=parseJson(skill.config_json,{})
  const reviewDemand=String(config.reviewDemand||config.instruction||skill.description||'').trim()
  const reviewContent=String(config.reviewContent||skill.description||'').trim()
  const reviewRequirement=String(config.reviewRequirement||config.instruction||'').trim()
  const expectedOutput=String(config.expectedOutput||normalizeSkillOutputs(skill.output_json).map((item)=>item.name).filter(Boolean).join('、')).trim()
  if(!String(skill.name||'').trim())blockers.push({field:'name',tab:'basic',message:'Skill名称不能为空'})
  if(!String(skill.domain||'').trim())blockers.push({field:'domain',tab:'basic',message:'监管领域不能为空'})
  if(!reviewDemand)blockers.push({field:'reviewDemand',tab:'generate',message:'审查需求不能为空'})
  if(!reviewContent)blockers.push({field:'reviewContent',tab:'generate',message:'请先生成审查内容'})
  if(!reviewRequirement)blockers.push({field:'reviewRequirement',tab:'generate',message:'请先生成审查要求'})
  if(!expectedOutput)blockers.push({field:'expectedOutput',tab:'generate',message:'请先生成输出结果'})
  return{blockers,warnings}
}

export function snapshotForHash(scene,rules,skills=[]){
  return {
    scene:{name:scene.name,domain:scene.domain,description:scene.description,level:scene.risk_level,organizations:parseJson(scene.organization_json,[]),objectScope:parseJson(scene.object_scope_json,{}),exceptions:parseJson(scene.exception_json,{}),checkTemplate:parseJson(scene.check_template_json,{})},
    rules:rules.map((rule)=>({id:rule.id,name:rule.name,type:rule.rule_type,level:effectiveRiskLevel(rule,scene.risk_level),enabled:Boolean(rule.binding_enabled===undefined?rule.enabled:rule.binding_enabled),ontologyId:rule.ontology_id,graphVersion:rule.graph_version,objectCode:rule.object_code,eventCode:rule.event_code,conditions:parseJson(rule.condition_json,{}),path:normalizePathConfig(rule.path_json),time:normalizeTimeConfig(rule.time_json),aggregate:normalizeAggregateConfig(rule.aggregate_json),exceptions:parseJson(rule.exception_json,{}),outputs:parseJson(rule.output_json,[]),evidence:normalizeEvidenceRequirements(rule.evidence_json),policies:normalizePolicyList(rule.policy_json),failureStrategy:rule.failure_strategy})),
    skills:skills.map((skill)=>({id:skill.id,name:skill.name,type:skill.skill_type,level:skill.effective_risk_level||skill.risk_level,inputs:normalizeSkillInputs(skill.input_json),config:parseJson(skill.config_json,{}),outputs:normalizeSkillOutputs(skill.output_json),evidence:normalizeEvidenceRequirements(skill.evidence_json),policies:normalizePolicyList(skill.policy_json),failureStrategy:skill.failure_strategy})),
  }
}
