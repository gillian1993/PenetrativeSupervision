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

export function mapRuleRow(row) {
  const sceneNames=String(row.scene_names||row.scene_name||'').split(/[、,]/).map((item)=>item.trim()).filter(Boolean)
  const sceneIds=String(row.scene_ids||row.scene_id||'').split(',').map((item)=>item.trim()).filter(Boolean)
  return {
    id:row.rule_id,versionId:row.id,sceneId:row.scene_id||sceneIds[0]||'',sceneVersionId:row.scene_version_id||'',
    code:row.code,name:row.name,version:row.version,type:row.rule_type,level:row.effective_risk_level||row.risk_level,defaultLevel:row.risk_level,
    enabled:row.binding_enabled===undefined?row.enabled===undefined?true:Boolean(row.enabled):Boolean(row.binding_enabled),status:row.status,
    conditions: parseJson(row.condition_json,{id:'group-root',logic:'AND',items:[]}),
    pathConfig: parseJson(row.path_json,{hops:[]}),
    timeConfig: parseJson(row.time_json,{eventCode:'',windowValue:180,windowUnit:'天',direction:'之前'}),
    aggregateConfig: parseJson(row.aggregate_json,{function:'COUNT',fieldCode:'',groupBy:'',operator:'大于等于',threshold:2}),
    exceptions: parseJson(row.exception_json,{enabled:false,description:'',whitelist:[]}),
    outputs: parseJson(row.output_json,[]), evidence: parseJson(row.evidence_json,[]),
    policy: parseJson(row.policy_json,{name:'',version:'',clause:''}), failureStrategy: row.failure_strategy,
    summary:row.summary,lockVersion:Number(row.lock_version),updatedAt:row.updated_at,
    domain:row.domain||'',objectCode:row.object_code||'',objectName:row.object_name||'',eventCode:row.event_code||'',eventName:row.event_name||'',
    sceneName:row.scene_name||sceneNames[0]||'',sceneNames,sceneIds,bindingCount:Number(row.binding_count||sceneNames.length||0),
    sceneStatus:row.scene_status||'',ontologyId:row.ontology_id||'',graphVersion:row.graph_version||'',priority:Number(row.priority||100),
  }
}

export function mapSceneRow(row, rules = [], versions = []) {
  return {
    id:row.scene_id, versionId:row.id, code:row.code, name:row.name, version:row.version, status:row.status,
    domain:row.domain, description:row.description, objectCode:row.object_code, objectName:row.object_name,
    eventCode:row.event_code, eventName:row.event_name, level:row.risk_level,
    observationValue:Number(row.observation_value), observationUnit:row.observation_unit,
    ontologyId:row.ontology_id, graphVersion:row.graph_version,
    organizations:parseJson(row.organization_json,[]), objectScope:parseJson(row.object_scope_json,{logic:'AND',items:[]}),
    exceptions:parseJson(row.exception_json,{description:'',validUntil:''}), evidence:parseJson(row.evidence_json,[]),
    policies:parseJson(row.policy_json,[]), checkTemplate:parseJson(row.check_template_json,{requirements:'',materials:[],deadlineHours:48}),
    validation:parseJson(row.validation_json,{blockers:[],warnings:[],validatedAt:''}),
    lastTrialId:row.last_trial_id||'', lastTrialStatus:row.last_trial_status||'', runCount:Number(row.run_count||0),
    lockVersion:Number(row.lock_version), updatedBy:row.updated_by, updatedAt:row.updated_at,
    publishedAt:row.published_at||'', stopReason:row.stop_reason||'', rules,
    ruleCount:rules.length||Number(row.rule_count||0),
    enabledRuleCount:rules.length?rules.filter((item)=>item.enabled).length:Number(row.enabled_rule_count||0), versions,
  }
}

export async function writeSceneAudit(connection, sceneVersionId, action, summary, risk = '普通') {
  await connection.query('INSERT INTO scene_rule_audits (scene_version_id,action,summary,risk_level) VALUES (?,?,?,?)',[sceneVersionId,action,summary,risk])
}
export async function getBoundRuleRows(connection,sceneVersionId,enabledOnly=false){
  const sql=['SELECT rav.*,ra.code,sv.scene_id,sv.name AS scene_name,sv.status AS scene_status,',
    'b.scene_version_id,b.enabled AS binding_enabled,b.priority,b.risk_level_override,',
    'COALESCE(b.risk_level_override,rav.risk_level) AS effective_risk_level',
    'FROM scene_rule_bindings b JOIN rule_asset_versions rav ON rav.id=b.rule_version_id',
    'JOIN rule_assets ra ON ra.id=rav.rule_id JOIN scene_versions sv ON sv.id=b.scene_version_id',
    'WHERE b.scene_version_id=?',enabledOnly?'AND b.enabled=1':'','ORDER BY b.priority ASC,rav.updated_at DESC'].filter(Boolean).join(' ')
  const [rows]=await connection.query(sql,[sceneVersionId])
  return rows
}


export async function getCurrentSceneRow(pool, id, connection = pool) {
  const [rows] = await connection.query(`SELECT sv.*,rs.code,
    (SELECT COUNT(*) FROM scene_rule_bindings b WHERE b.scene_version_id=sv.id) AS rule_count,
    (SELECT COUNT(*) FROM scene_rule_bindings b WHERE b.scene_version_id=sv.id AND b.enabled=1) AS enabled_rule_count,
    (SELECT COUNT(*) FROM rule_run_records rr WHERE rr.scene_version_id=sv.id) AS run_count,
    (SELECT status FROM rule_trial_tasks tt WHERE tt.id=sv.last_trial_id) AS last_trial_status
    FROM risk_scenes rs JOIN scene_versions sv ON sv.id=rs.current_version_id
    WHERE rs.id=? OR rs.code=? OR sv.id=? LIMIT 1`,[id,id,id])
  return rows[0]||null
}

export async function getSceneAggregate(pool,id) {
  const row=await getCurrentSceneRow(pool,id)
  if(!row)return null
  const rules=await getBoundRuleRows(pool,row.id)
  const [versions]=await pool.query(`SELECT id,version,status,updated_by,updated_at,published_at,source_version_id FROM scene_versions WHERE scene_id=? ORDER BY created_at DESC`,[row.scene_id])
  return mapSceneRow(row,rules.map(mapRuleRow),versions.map((item)=>({id:item.id,version:item.version,status:item.status,updatedBy:item.updated_by,updatedAt:item.updated_at,publishedAt:item.published_at||'',sourceVersionId:item.source_version_id||''})))
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
  const ontologyId=reference.ontologyId||reference.ontology_id||'ONT-PROC'
  const graphVersion=reference.graphVersion||reference.graph_version||'GRAPH-20260717.2'
  const objectCode=reference.objectCode||reference.object_code||''
  const eventCode=reference.eventCode||reference.event_code||''
  const [ontologies]=await connection.query('SELECT id,status FROM ontologies WHERE id=? LIMIT 1',[ontologyId])
  if(!ontologies.length)blockers.push({field:'ontologyId',tab,message:`适用本体 ${ontologyId} 不存在`})
  else if(ontologies[0].status!=='已发布')blockers.push({field:'ontologyId',tab,message:`适用本体 ${ontologyId} 尚未发布`})
  if(objectCode){const [objects]=await connection.query("SELECT element_id FROM ontology_elements WHERE ontology_id=? AND element_type='class' AND code=? LIMIT 1",[ontologyId,objectCode]);if(!objects.length)blockers.push({field:'objectCode',tab,message:`主对象 ${objectCode} 不存在于适用本体`})}
  if(eventCode){const [events]=await connection.query("SELECT element_id FROM ontology_elements WHERE ontology_id=? AND element_type='event' AND code=? LIMIT 1",[ontologyId,eventCode]);if(!events.length)blockers.push({field:'eventCode',tab,message:`目标事件 ${eventCode} 不存在于适用本体`})}
  const [graphs]=await connection.query('SELECT id,status,ontology_id FROM graph_versions WHERE id=? LIMIT 1',[graphVersion])
  if(!graphs.length)blockers.push({field:'graphVersion',tab,message:`图谱版本 ${graphVersion} 不存在`})
  else {if(graphs[0].status!=='已发布')blockers.push({field:'graphVersion',tab,message:`图谱版本 ${graphVersion} 尚未发布`});if(graphs[0].ontology_id&&graphs[0].ontology_id!==ontologyId)blockers.push({field:'graphVersion',tab,message:`图谱版本 ${graphVersion} 使用的本体与当前配置不一致`})}
  if(!graphVersion)warnings.push({field:'graphVersion',tab,message:'建议选择一个已发布生产图谱版本'})
  return {blockers,warnings}
}

export async function assertSemanticReferences(connection, reference) {
  const result=await collectSemanticReferenceIssues(connection, reference)
  if(result.blockers.length)throw Object.assign(new Error(result.blockers[0].message),{status:409,validation:result})
}

export function validateRuleRecord(rule){
  const blockers=[];const warnings=[]
  if(!String(rule.name||'').trim())blockers.push({field:'name',tab:'basic',message:'规则名称不能为空'})
  collectConditionIssues(parseJson(rule.condition_json,{items:[]}),blockers)
  if(rule.rule_type==='关系路径'){
    const hops=parseJson(rule.path_json,{hops:[]}).hops||[]
    if(!hops.length)blockers.push({field:'path',tab:'conditions',message:'关系路径规则至少需要一跳路径'})
    if(hops.length>2)blockers.push({field:'path',tab:'conditions',message:'关系路径最多支持两跳'})
  }
  if(rule.rule_type==='时序'&&!parseJson(rule.time_json,{}).eventCode)blockers.push({field:'time',tab:'conditions',message:'时序规则必须选择事件类型'})
  if(rule.rule_type==='聚合'&&!parseJson(rule.aggregate_json,{}).fieldCode)blockers.push({field:'aggregate',tab:'conditions',message:'聚合规则必须配置聚合字段'})
  if(!parseJson(rule.output_json,[]).length)blockers.push({field:'outputs',tab:'output',message:'至少选择一项实际命中输出'})
  if(!parseJson(rule.evidence_json,[]).length)blockers.push({field:'evidence',tab:'output',message:'至少选择一项必备证据'})
  const policy=parseJson(rule.policy_json,{})
  if(false&&(!policy.name||!policy.clause))blockers.push({field:'policy',tab:'output',message:'制度依据和条款不能为空'})
  if(!parseJson(rule.exception_json,{}).enabled)warnings.push({field:'exceptions',tab:'conditions',message:'尚未配置例外条件，请确认适用边界'})
  return {blockers,warnings}
}

export function snapshotForHash(scene,rules){
  return {scene:{name:scene.name,domain:scene.domain,description:scene.description,objectCode:scene.object_code,eventCode:scene.event_code,level:scene.risk_level,observationValue:scene.observation_value,observationUnit:scene.observation_unit,ontologyId:scene.ontology_id,graphVersion:scene.graph_version,organizations:parseJson(scene.organization_json,[]),objectScope:parseJson(scene.object_scope_json,{}),exceptions:parseJson(scene.exception_json,{}),evidence:parseJson(scene.evidence_json,[]),policies:parseJson(scene.policy_json,[]),checkTemplate:parseJson(scene.check_template_json,{})},rules:rules.map((rule)=>({id:rule.id,name:rule.name,type:rule.rule_type,level:rule.effective_risk_level||rule.risk_level,enabled:Boolean(rule.binding_enabled===undefined?rule.enabled:rule.binding_enabled),conditions:parseJson(rule.condition_json,{}),path:parseJson(rule.path_json,{}),time:parseJson(rule.time_json,{}),aggregate:parseJson(rule.aggregate_json,{}),exceptions:parseJson(rule.exception_json,{}),outputs:parseJson(rule.output_json,[]),evidence:parseJson(rule.evidence_json,[]),policy:parseJson(rule.policy_json,{}),failureStrategy:rule.failure_strategy}))}
}
