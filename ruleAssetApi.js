import { assertSemanticReferences, collectAdvancedExpressionReferenceIssues, collectSemanticReferenceIssues, editableSceneStatuses, getCurrentSceneRow, getSceneAggregate, makeBusinessId, mapRuleRow, normalizeWarningStage, parseJson, toJson, validateRuleRecord, writeSceneAudit } from './sceneRuleRepo.js'

const defaultOutputs=['主体名称与编码','命中条件及实际值','来源记录与版本','规则执行时间']
const outputsForRuleType=(type)=>[...defaultOutputs,...(type==='关系路径'?['关系路径']:type==='时序'?['事件时间']:type==='聚合'?['聚合结果']:type==='高级表达式'?['表达式计算明细']:[])]
const defaultEvidence=[{id:'evidence-source',name:'业务来源记录',source:'ERP/采购业务系统',sourceField:'业务单据编号',attachmentRequirement:'可选附件',completeness:'必须保存来源系统、记录编号和取数批次',description:''},{id:'evidence-subject',name:'主体信息',source:'本体主数据',sourceField:'主体编码',attachmentRequirement:'无需附件',completeness:'必须包含主体编码和来源版本',description:''},{id:'evidence-run',name:'规则运行明细',source:'规则运行服务',sourceField:'命中条件及实际值',attachmentRequirement:'无需附件',completeness:'必须保存规则版本、命中值和执行时间',description:''}]

const ruleSelect=[
  'SELECT rav.*,ra.code,',
  "(SELECT COUNT(*) FROM scene_rule_bindings bx JOIN rule_asset_versions rvx ON rvx.id=bx.rule_version_id WHERE rvx.rule_id=ra.id) AS binding_count,",
  "(SELECT COUNT(*) FROM pattern_rule_bindings prb JOIN rule_asset_versions rvx ON rvx.id=prb.rule_version_id WHERE rvx.rule_id=ra.id) AS catalog_binding_count,",
  "(SELECT GROUP_CONCAT(DISTINCT svx.name ORDER BY svx.name SEPARATOR '、') FROM scene_rule_bindings bx JOIN rule_asset_versions rvx ON rvx.id=bx.rule_version_id JOIN scene_versions svx ON svx.id=bx.scene_version_id WHERE rvx.rule_id=ra.id) AS scene_names,",
  "(SELECT GROUP_CONCAT(DISTINCT svx.scene_id ORDER BY svx.scene_id SEPARATOR ',') FROM scene_rule_bindings bx JOIN rule_asset_versions rvx ON rvx.id=bx.rule_version_id JOIN scene_versions svx ON svx.id=bx.scene_version_id WHERE rvx.rule_id=ra.id) AS scene_ids",
  'FROM rule_assets ra JOIN rule_asset_versions rav ON rav.id=ra.current_version_id'
].join(' ')

function summarize(payload){
  const count=payload.type==='高级表达式'?(payload.conditions?.expression?1:0):payload.type==='关系路径'?(payload.pathConfig?.constraints||[]).length||Math.min(1,(payload.pathConfig?.hops||[]).length):payload.type==='时序'?(payload.timeConfig?.conditions||[]).length:payload.type==='聚合'?(payload.aggregateConfig?.metrics||[]).length:(payload.conditions?.items||[]).length
  const logic=payload.type==='高级表达式'?'EXPRESSION':payload.type==='关系路径'?payload.pathConfig?.logic:payload.type==='时序'?payload.timeConfig?.logic:payload.type==='聚合'?payload.aggregateConfig?.logic:payload.conditions?.logic
  const typeText=payload.type==='高级表达式'?'执行受控高级表达式':payload.type==='关系路径'?`按${(payload.pathConfig?.hops||[]).length}跳关系路径和${count}个约束判断`:payload.type==='时序'?`围绕目标类节点组合${count}个时序条件`:payload.type==='聚合'?`组合${count}个聚合指标`:'按属性与字段条件判断'
  const levelText=(payload.level||'继承场景')==='继承场景'?'继承场景默认等级':(payload.level||'高')+'风险'
  const stageText=normalizeWarningStage(payload.stage)
  return '适用于'+stageText+'监管；'+typeText+'，'+(logic==='EXPRESSION'?'按表达式计算':logic==='OR'?'满足任一':'满足全部')+'；命中后'+levelText+'并固化'+(payload.outputs||[]).length+'项输出。'
}

async function getRule(pool,id){
  const [rows]=await pool.query(ruleSelect+' WHERE rav.id=? OR ra.id=? OR ra.code=? LIMIT 1',[id,id,id])
  return rows.length?mapRuleRow(rows[0]):null
}

async function listRules(pool,url){
  const keyword=String(url.searchParams.get('keyword')||'').trim()
  const params=[]
  let where=''
  if(keyword){where=' WHERE rav.name LIKE ? OR ra.code LIKE ? OR rav.domain LIKE ?';params.push('%'+keyword+'%','%'+keyword+'%','%'+keyword+'%')}
  const [rows]=await pool.query(ruleSelect+where+' ORDER BY rav.updated_at DESC',params)
  return rows.map(mapRuleRow)
}

async function uniqueCode(pool,preferred){
  const requested=String(preferred||'').trim().toUpperCase()
  if(requested){
    if(!/^[A-Z0-9_-]{3,64}$/.test(requested))throw Object.assign(new Error('规则编码只能包含大写字母、数字、下划线和中划线'),{status:400})
    const [exists]=await pool.query('SELECT id FROM rule_assets WHERE code=? LIMIT 1',[requested])
    if(exists.length)throw Object.assign(new Error('规则编码 '+requested+' 已存在'),{status:409})
    return requested
  }
  const [rows]=await pool.query('SELECT code FROM rule_assets WHERE code LIKE ?',['RULE-%'])
  const used=new Set(rows.map((row)=>String(row.code)))
  for(let index=1;index<10000;index++){const code='RULE-'+String(index).padStart(3,'0');if(!used.has(code))return code}
  return 'RULE-'+Date.now().toString().slice(-8)
}

function normalizeRuleVersion(value){
  const raw=String(value??'').trim()
  if(!raw)throw Object.assign(new Error('规则版本号不能为空'),{status:400})
  const version=raw.toUpperCase()
  if(version.length>24)throw Object.assign(new Error('规则版本号不能超过24个字符'),{status:400})
  if(!/^[\u4e00-\u9fa5A-Z0-9_.-]+$/.test(version))throw Object.assign(new Error('规则版本号只能包含中文、字母、数字、点、下划线和中划线'),{status:400})
  return version
}
async function assertRuleVersionUnique(connection,ruleId,version,currentVersionId=''){
  const [rows]=await connection.query('SELECT id FROM rule_asset_versions WHERE rule_id=? AND version=? AND id<>? LIMIT 1',[ruleId,version,currentVersionId])
  if(rows.length)throw Object.assign(new Error(`规则版本号 ${version} 已存在，请换一个版本号`),{status:409})
}
async function graphSemanticContext(pool,graphVersion){
  if(!String(graphVersion||'').trim())throw Object.assign(new Error('请选择已发布图谱版本'),{status:400})
  const [rows]=await pool.query('SELECT id,ontology_id,status FROM graph_versions WHERE id=?',[graphVersion])
  if(!rows.length)throw Object.assign(new Error('图谱版本不存在'),{status:404})
  if(rows[0].status!=='已发布')throw Object.assign(new Error('规则只能引用已发布图谱版本'),{status:409})
  return{graphVersion:rows[0].id,ontologyId:rows[0].ontology_id}
}

async function createRule(pool,payload,scene=null){
  if(!String(payload.name||'').trim())throw Object.assign(new Error('规则名称不能为空'),{status:400})
  const code=await uniqueCode(pool,payload.code)
  const ruleId=makeBusinessId('RULE')
  const versionId=makeBusinessId('RV')
  const context=scene||{}
  const domain=payload.domain||context.domain||'采购'
  const requestedGraphVersion=String(payload.graphVersion||'').trim()
  let ontologyId=''
  let graphVersion=''
  if(requestedGraphVersion){
    const graphContext=await graphSemanticContext(pool,requestedGraphVersion)
    ontologyId=graphContext.ontologyId
    graphVersion=graphContext.graphVersion
  }
  const objectCode=graphVersion?(payload.objectCode||context.object_code||''):''
  const objectName=graphVersion?(payload.objectName||context.object_name||''):''
  const eventCode=graphVersion?(payload.eventCode??''):''
  const eventName=graphVersion?(payload.eventName??''):''
  const level=payload.level||'继承场景'
  const stage=normalizeWarningStage(payload.stage||context.stage)
  const version=normalizeRuleVersion(payload.version||'V1')
  const connection=await pool.getConnection()
  if(graphVersion)await assertSemanticReferences(pool,{ontologyId,objectCode,eventCode,graphVersion})
  try{
    await connection.beginTransaction()
    await connection.query("INSERT INTO rule_assets (id,code,current_version_id,status) VALUES (?,?,?,'草稿')",[ruleId,code,versionId])
    await connection.query('INSERT INTO rule_asset_versions (id,rule_id,version,name,domain,object_code,object_name,event_code,event_name,ontology_id,graph_version,rule_type,risk_level,stage,status,condition_json,path_json,time_json,aggregate_json,exception_json,output_json,evidence_json,policy_json,failure_strategy,summary) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[versionId,ruleId,version,String(payload.name).trim(),domain,objectCode,objectName,eventCode,eventName,ontologyId,graphVersion,payload.type||'属性',level,stage,'草稿',toJson({id:'group-root',logic:'AND',items:[]}),toJson({hops:[],logic:'AND',constraints:[]}),toJson({baseline:'runtime',logic:'AND',conditions:[],eventCode:'',windowValue:Number(payload.windowValue||30),windowUnit:payload.windowUnit||'天',direction:'之前'}),toJson({logic:'AND',metrics:[],function:'COUNT',fieldCode:'',groupBy:'',operator:'大于等于',threshold:0}),toJson({enabled:false,description:'',whitelist:[]}),toJson(outputsForRuleType(payload.type||'属性')),toJson(defaultEvidence),toJson([]),'进入异常队列','尚未生成规则摘要'])
    if(scene){
      await connection.query('INSERT INTO scene_rule_bindings (scene_version_id,rule_version_id,enabled,risk_level_override,parameters_json,priority) VALUES (?,?,1,NULL,JSON_OBJECT(),100)',[scene.id,versionId])
      await connection.query("UPDATE scene_versions SET status='草稿',validation_json=NULL,last_trial_id=NULL,dependency_hash='',lock_version=lock_version+1 WHERE id=?",[scene.id])
      await writeSceneAudit(connection,scene.id,'新建并引用规则',code+' / '+String(payload.name).trim()+' / '+version)
    }
    await connection.commit()
    return await getRule(pool,versionId)
  }catch(error){await connection.rollback();throw error}finally{connection.release()}
}

async function updateRule(pool,id,payload){
  const [rows]=await pool.query('SELECT rav.*,ra.code FROM rule_asset_versions rav JOIN rule_assets ra ON ra.id=rav.rule_id WHERE rav.id=?',[id])
  if(!rows.length)throw Object.assign(new Error('规则不存在'),{status:404})
  const row=rows[0]
  if(['已发布','已停用'].includes(row.status))throw Object.assign(new Error('已被发布场景锁定的规则版本不可直接修改，请创建新版本'),{status:409})
  if(Number(payload.lockVersion)!==Number(row.lock_version))throw Object.assign(new Error('规则已被其他人更新，请刷新后重试'),{status:409})
  const version=normalizeRuleVersion(payload.version??row.version)
  await assertRuleVersionUnique(pool,row.rule_id,version,row.id)
  const [published]=await pool.query("SELECT COUNT(*) AS total FROM scene_rule_bindings b JOIN scene_versions sv ON sv.id=b.scene_version_id WHERE b.rule_version_id=? AND sv.status IN ('已发布','已停用')",[id])
  if(Number(published[0].total)>0)throw Object.assign(new Error('该规则版本已被已发布场景引用，不能直接修改'),{status:409})
  const outputs=outputsForRuleType(payload.type??row.rule_type)
  const evidenceRequirements=payload.evidenceRequirements??payload.evidence??parseJson(row.evidence_json,defaultEvidence)
  const policies=payload.policies??(payload.policy?[payload.policy]:parseJson(row.policy_json,[]))
  const stage=normalizeWarningStage(payload.stage??row.stage)
  const requestedGraphVersion=String(payload.graphVersion??row.graph_version??'').trim()
  let graphVersion=''
  let ontologyId=''
  let objectCode=payload.objectCode??row.object_code
  let objectName=payload.objectName??row.object_name
  let eventCode=payload.eventCode??row.event_code
  let eventName=payload.eventName??row.event_name
  if(requestedGraphVersion){
    const graphContext=await graphSemanticContext(pool,requestedGraphVersion)
    graphVersion=graphContext.graphVersion
    ontologyId=graphContext.ontologyId
    await assertSemanticReferences(pool,{ontologyId,objectCode,eventCode,graphVersion})
  }else{
    objectCode=''
    objectName=''
    eventCode=''
    eventName=''
  }
  payload={...payload,graphVersion,ontologyId,objectCode,objectName,eventCode,eventName}
  const [result]=await pool.query("UPDATE rule_asset_versions SET version=?,name=?,domain=?,object_code=?,object_name=?,event_code=?,event_name=?,ontology_id=?,graph_version=?,rule_type=?,risk_level=?,stage=?,status='草稿',condition_json=?,path_json=?,time_json=?,aggregate_json=?,exception_json=?,output_json=?,evidence_json=?,policy_json=?,failure_strategy=?,summary=?,lock_version=lock_version+1 WHERE id=? AND lock_version=?",[version,payload.name??row.name,payload.domain??row.domain,payload.objectCode,payload.objectName,payload.eventCode,payload.eventName,payload.ontologyId,payload.graphVersion,payload.type??row.rule_type,payload.level??row.risk_level,stage,toJson(payload.conditions??parseJson(row.condition_json,{})),toJson(payload.pathConfig??parseJson(row.path_json,{})),toJson(payload.timeConfig??parseJson(row.time_json,{})),toJson(payload.aggregateConfig??parseJson(row.aggregate_json,{})),toJson(payload.exceptions??parseJson(row.exception_json,{})),toJson(outputs),toJson(evidenceRequirements),toJson(policies),payload.failureStrategy??row.failure_strategy,summarize({...payload,stage,outputs}),id,row.lock_version])
  if(!result.affectedRows)throw Object.assign(new Error('规则版本冲突，请刷新后重试'),{status:409})
  await pool.query("UPDATE rule_assets SET status='草稿' WHERE id=?",[row.rule_id])
  const [scenes]=await pool.query("SELECT sv.id FROM scene_rule_bindings b JOIN scene_versions sv ON sv.id=b.scene_version_id WHERE b.rule_version_id=? AND sv.status IN ('草稿','待试跑','待发布')",[id])
  for(const scene of scenes){
    await pool.query("UPDATE scene_versions SET status='草稿',validation_json=NULL,last_trial_id=NULL,dependency_hash='',lock_version=lock_version+1 WHERE id=?",[scene.id])
    await writeSceneAudit(pool,scene.id,'共享规则已更新',row.code+' / '+(payload.name??row.name))
  }
  return await getRule(pool,id)
}

async function validateRule(pool,id){
  const [rows]=await pool.query('SELECT * FROM rule_asset_versions WHERE id=?',[id])
  if(!rows.length)throw Object.assign(new Error('规则不存在'),{status:404})
  const result=validateRuleRecord(rows[0])
  const refs=await collectSemanticReferenceIssues(pool,{ontologyId:rows[0].ontology_id,objectCode:rows[0].object_code,eventCode:rows[0].event_code,graphVersion:rows[0].graph_version},'basic')
  result.blockers.push(...refs.blockers)
  result.warnings.push(...refs.warnings)
  if(rows[0].rule_type==='高级表达式'){
    const advanced=await collectAdvancedExpressionReferenceIssues(pool,rows[0].ontology_id,parseJson(rows[0].condition_json,{}).expression,'conditions')
    result.blockers.push(...advanced.blockers)
    result.warnings.push(...advanced.warnings)
  }
  return result
}

async function deleteRule(pool,id){
  const [rows]=await pool.query('SELECT rav.*,ra.id AS asset_id,ra.code FROM rule_asset_versions rav JOIN rule_assets ra ON ra.id=rav.rule_id WHERE rav.id=? OR ra.id=? OR ra.code=? LIMIT 1',[id,id,id])
  if(!rows.length)throw Object.assign(new Error('规则不存在'),{status:404})
  const row=rows[0]
  if(['已发布','已停用'].includes(row.status))throw Object.assign(new Error('已发布或已停用规则不能删除'),{status:409})
  const refs=await getRuleAssetReferences(pool,row.asset_id)
  const lockedScenes=refs.scenes.filter((scene)=>!editableSceneStatuses.has(scene.status))
  if(lockedScenes.length)throw Object.assign(new Error('该规则已被已发布或已停用场景固化引用，不能删除'),{status:409})
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction()
    const affectedScenes=[...new Map(refs.scenes.map((scene)=>[scene.sceneVersionId,scene])).values()]
    await connection.query('DELETE prb FROM pattern_rule_bindings prb JOIN rule_asset_versions rav ON rav.id=prb.rule_version_id WHERE rav.rule_id=?',[row.asset_id])
    await connection.query('DELETE b FROM scene_rule_bindings b JOIN rule_asset_versions rav ON rav.id=b.rule_version_id WHERE rav.rule_id=?',[row.asset_id])
    await connection.query('DELETE FROM rule_assets WHERE id=?',[row.asset_id])
    for(const scene of affectedScenes){
      await connection.query("UPDATE scene_versions SET status='草稿',validation_json=NULL,last_trial_id=NULL,dependency_hash='',lock_version=lock_version+1 WHERE id=?",[scene.sceneVersionId])
      await writeSceneAudit(connection,scene.sceneVersionId,'删除规则资产',row.code+' / '+row.name)
    }
    await connection.commit()
    const parts=[]
    if(refs.scene)parts.push(`解除${refs.scene}个场景版本引用`)
    if(refs.catalog)parts.push(`解除${refs.catalog}个风险模式目录引用`)
    return{ok:true,message:parts.length?`规则草稿已删除，并${parts.join('、')}`:'规则草稿已删除'}
  }catch(error){await connection.rollback();throw error}finally{connection.release()}
}

async function getRuleAssetReferences(pool,assetId){
  const [[sceneRows],[catalogBindings]]=await Promise.all([
    pool.query('SELECT b.scene_version_id AS sceneVersionId,sv.scene_id AS sceneId,sv.name,sv.status FROM scene_rule_bindings b JOIN rule_asset_versions rav ON rav.id=b.rule_version_id JOIN scene_versions sv ON sv.id=b.scene_version_id WHERE rav.rule_id=?',[assetId]),
    pool.query('SELECT COUNT(*) AS total FROM pattern_rule_bindings prb JOIN rule_asset_versions rav ON rav.id=prb.rule_version_id WHERE rav.rule_id=?',[assetId])
  ])
  return{scene:sceneRows.length,catalog:Number(catalogBindings[0]?.total||0),scenes:sceneRows}
}

async function listLibrary(pool,url){
  const sceneId=String(url.searchParams.get('sceneId')||'')
  const target=sceneId?await getCurrentSceneRow(pool,sceneId):null
  const params=[]
  let where=''
  if(target){where=' WHERE NOT EXISTS (SELECT 1 FROM scene_rule_bindings bx WHERE bx.scene_version_id=? AND bx.rule_version_id=rav.id)';params.push(target.id)}
  const [rows]=await pool.query(ruleSelect+where+' ORDER BY rav.updated_at DESC',params)
  return rows.map(mapRuleRow)
}

async function bindRules(pool,sceneId,payload){
  const target=await getCurrentSceneRow(pool,sceneId)
  if(!target)throw Object.assign(new Error('目标场景不存在'),{status:404})
  if(!editableSceneStatuses.has(target.status))throw Object.assign(new Error('已发布或已停用场景不能调整规则引用'),{status:409})
  const ids=Array.isArray(payload.ruleVersionIds)?[...new Set(payload.ruleVersionIds.map(String))]:[]
  if(!ids.length)throw Object.assign(new Error('请至少选择一条规则'),{status:400})
  const connection=await pool.getConnection()
  let linked=0
  try{
    await connection.beginTransaction()
    for(const id of ids){
      const [exists]=await connection.query('SELECT id FROM rule_asset_versions WHERE id=? LIMIT 1',[id])
      if(!exists.length)continue
      const [result]=await connection.query('INSERT IGNORE INTO scene_rule_bindings (scene_version_id,rule_version_id,enabled,risk_level_override,parameters_json,priority) VALUES (?,?,1,NULL,JSON_OBJECT(),100)',[target.id,id])
      linked+=Number(result.affectedRows||0)
    }
    if(!linked)throw Object.assign(new Error('所选规则已在当前场景中或已失效'),{status:409})
    await connection.query("UPDATE scene_versions SET status='草稿',validation_json=NULL,last_trial_id=NULL,dependency_hash='',lock_version=lock_version+1 WHERE id=?",[target.id])
    await writeSceneAudit(connection,target.id,'引用规则库规则','建立'+linked+'条规则引用，未复制规则')
    await connection.commit()
    return await getSceneAggregate(pool,target.scene_id)
  }catch(error){await connection.rollback();throw error}finally{connection.release()}
}

async function unbindRule(pool,sceneId,ruleVersionId){
  const target=await getCurrentSceneRow(pool,sceneId)
  if(!target)throw Object.assign(new Error('场景不存在'),{status:404})
  if(!editableSceneStatuses.has(target.status))throw Object.assign(new Error('已发布或已停用场景不能解除规则引用'),{status:409})
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction()
    const [ruleRows]=await connection.query('SELECT rav.name,ra.code FROM rule_asset_versions rav JOIN rule_assets ra ON ra.id=rav.rule_id WHERE rav.id=?',[ruleVersionId])
    const [result]=await connection.query('DELETE FROM scene_rule_bindings WHERE scene_version_id=? AND rule_version_id=?',[target.id,ruleVersionId])
    if(!result.affectedRows)throw Object.assign(new Error('当前场景未引用该规则'),{status:404})
    await connection.query("UPDATE scene_versions SET status='草稿',validation_json=NULL,last_trial_id=NULL,dependency_hash='',lock_version=lock_version+1 WHERE id=?",[target.id])
    await writeSceneAudit(connection,target.id,'解除规则引用',(ruleRows[0]?.code||ruleVersionId)+' / '+(ruleRows[0]?.name||''))
    await connection.commit()
    return await getSceneAggregate(pool,target.scene_id)
  }catch(error){await connection.rollback();throw error}finally{connection.release()}
}

async function deleteRuleFromScene(pool,sceneId,ruleVersionId){
  const target=await getCurrentSceneRow(pool,sceneId)
  if(!target)throw Object.assign(new Error('场景不存在'),{status:404})
  if(!editableSceneStatuses.has(target.status))throw Object.assign(new Error('已发布或已停用场景不能删除规则'),{status:409})
  const [rows]=await pool.query('SELECT rav.*,ra.id AS asset_id,ra.code FROM scene_rule_bindings b JOIN rule_asset_versions rav ON rav.id=b.rule_version_id JOIN rule_assets ra ON ra.id=rav.rule_id WHERE b.scene_version_id=? AND b.rule_version_id=? LIMIT 1',[target.id,ruleVersionId])
  if(!rows.length)throw Object.assign(new Error('当前场景未引用该规则'),{status:404})
  const row=rows[0]
  if(['已发布','已停用'].includes(row.status))throw Object.assign(new Error('已发布或已停用规则不能删除'),{status:409})
  const refs=await getRuleAssetReferences(pool,row.asset_id)
  if(refs.scene>1)throw Object.assign(new Error('该规则已被'+refs.scene+'个场景版本引用，只能先从当前场景移出，不能直接删除资产'),{status:409})
  if(refs.catalog>0)throw Object.assign(new Error('该规则已被'+refs.catalog+'个风险模式目录引用，不能直接删除资产'),{status:409})
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction()
    await connection.query('DELETE FROM scene_rule_bindings WHERE scene_version_id=? AND rule_version_id=?',[target.id,ruleVersionId])
    await connection.query('DELETE FROM rule_assets WHERE id=?',[row.asset_id])
    await connection.query("UPDATE scene_versions SET status='草稿',validation_json=NULL,last_trial_id=NULL,dependency_hash='',lock_version=lock_version+1 WHERE id=?",[target.id])
    await writeSceneAudit(connection,target.id,'删除规则资产',row.code+' / '+row.name)
    await connection.commit()
    return await getSceneAggregate(pool,target.scene_id)
  }catch(error){await connection.rollback();throw error}finally{connection.release()}
}

export async function handleRuleAssetApi(req,res,url,{pool,sendJson,readBody}){
  if(url.pathname==='/api/rules'&&req.method==='GET'){sendJson(res,200,await listRules(pool,url));return true}
  if(url.pathname==='/api/rules'&&req.method==='POST'){sendJson(res,201,await createRule(pool,await readBody(req)));return true}
  if(url.pathname==='/api/rule-library'&&req.method==='GET'){sendJson(res,200,await listLibrary(pool,url));return true}
  const bind=url.pathname.match(/^\/api\/scenes\/([^/]+)\/rules\/select$/)
  if(bind&&req.method==='POST'){sendJson(res,201,await bindRules(pool,decodeURIComponent(bind[1]),await readBody(req)));return true}
  const deleteInScene=url.pathname.match(/^\/api\/scenes\/([^/]+)\/rules\/([^/]+)\/asset$/)
  if(deleteInScene&&req.method==='DELETE'){sendJson(res,200,await deleteRuleFromScene(pool,decodeURIComponent(deleteInScene[1]),decodeURIComponent(deleteInScene[2])));return true}
  const unbind=url.pathname.match(/^\/api\/scenes\/([^/]+)\/rules\/([^/]+)$/)
  if(unbind&&req.method==='DELETE'){sendJson(res,200,await unbindRule(pool,decodeURIComponent(unbind[1]),decodeURIComponent(unbind[2])));return true}
  const createInScene=url.pathname.match(/^\/api\/scenes\/([^/]+)\/rules$/)
  if(createInScene&&req.method==='POST'){
    const scene=await getCurrentSceneRow(pool,decodeURIComponent(createInScene[1]))
    if(!scene)return sendJson(res,404,{message:'场景不存在'})
    if(!editableSceneStatuses.has(scene.status))return sendJson(res,409,{message:'当前场景版本不可新增规则'})
    sendJson(res,201,await createRule(pool,await readBody(req),scene));return true
  }
  const validate=url.pathname.match(/^\/api\/rules\/([^/]+)\/validate$/)
  if(validate&&req.method==='POST'){sendJson(res,200,await validateRule(pool,decodeURIComponent(validate[1])));return true}
  const item=url.pathname.match(/^\/api\/rules\/([^/]+)$/)
  if(item){
    const id=decodeURIComponent(item[1])
    if(req.method==='GET'){const result=await getRule(pool,id);sendJson(res,result?200:404,result||{message:'规则不存在'});return true}
    if(req.method==='PUT'){sendJson(res,200,await updateRule(pool,id,await readBody(req)));return true}
    if(req.method==='DELETE'){sendJson(res,200,await deleteRule(pool,id));return true}
  }
  return false
}

