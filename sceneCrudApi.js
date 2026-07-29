import { assertSemanticReferences, collectAdvancedExpressionReferenceIssues, collectSemanticReferenceIssues, editableSceneStatuses, getBoundRuleRows, getCurrentSceneRow, getSceneAggregate, mapSceneRow, makeBusinessId, toJson, parseJson, validateRuleRecord, writeSceneAudit } from './sceneRuleRepo.js'

async function listScenes(pool,url){
  const keyword=String(url.searchParams.get('keyword')||'').trim();const status=String(url.searchParams.get('status')||'').trim();const domain=String(url.searchParams.get('domain')||'').trim()
  const where=[];const params=[]
  if(keyword){where.push('(sv.name LIKE ? OR rs.code LIKE ?)');params.push(`%${keyword}%`,`%${keyword}%`)}
  if(status&&status!=='全部'){where.push('sv.status=?');params.push(status)}
  if(domain&&domain!=='全部'){where.push('sv.domain=?');params.push(domain)}
  const [rows]=await pool.query(`SELECT sv.*,rs.code,
    (SELECT COUNT(*) FROM scene_rule_bindings b WHERE b.scene_version_id=sv.id) AS rule_count,
    (SELECT COUNT(*) FROM scene_rule_bindings b WHERE b.scene_version_id=sv.id AND b.enabled=1) AS enabled_rule_count,
    (SELECT COUNT(*) FROM scene_skill_bindings b WHERE b.scene_version_id=sv.id) AS skill_count,
    (SELECT COUNT(*) FROM scene_skill_bindings b WHERE b.scene_version_id=sv.id AND b.enabled=1) AS enabled_skill_count,
    ((SELECT COUNT(*) FROM rule_run_records rr WHERE rr.scene_version_id=sv.id)+(SELECT COUNT(*) FROM skill_run_records sr WHERE sr.scene_version_id=sv.id)) AS run_count,
    (SELECT COUNT(*) FROM scene_versions history WHERE history.scene_id=sv.scene_id) AS version_count,
    (SELECT status FROM rule_trial_tasks tt WHERE tt.id=sv.last_trial_id) AS last_trial_status
    FROM risk_scenes rs JOIN scene_versions sv ON sv.id=rs.current_version_id ${where.length?`WHERE ${where.join(' AND ')}`:''} ORDER BY sv.updated_at DESC`,params)
  return rows.map((row)=>mapSceneRow(row))
}

function normalizeSceneVersion(value){
  const raw=String(value??'').trim()
  if(!raw)throw Object.assign(new Error('场景版本号不能为空'),{status:400})
  const version=raw.toUpperCase()
  if(version.length>24)throw Object.assign(new Error('场景版本号不能超过24个字符'),{status:400})
  if(!/^[\u4e00-\u9fa5A-Z0-9_.-]+$/.test(version))throw Object.assign(new Error('场景版本号只能包含中文、字母、数字、点、下划线和中划线'),{status:400})
  return version
}
function sceneVersionNumber(value){const match=String(value||'').trim().match(/^V?(\d+)(?:\.\d+)?$/i);return match?Number(match[1]):0}
async function suggestSceneVersion(connection,sceneId){
  const [rows]=await connection.query('SELECT version FROM scene_versions WHERE scene_id=?',[sceneId])
  const used=new Set(rows.map((item)=>String(item.version||'').toUpperCase()))
  const max=rows.reduce((value,item)=>Math.max(value,sceneVersionNumber(item.version)),0)
  let index=max>0?max+1:1;let version=`V${index}`
  while(used.has(version.toUpperCase())){index+=1;version=`V${index}`}
  return version
}
async function assertSceneVersionUnique(connection,sceneId,version,currentVersionId=''){
  const [rows]=await connection.query('SELECT id FROM scene_versions WHERE scene_id=? AND version=? AND id<>? LIMIT 1',[sceneId,version,currentVersionId])
  if(rows.length)throw Object.assign(new Error(`场景版本号 ${version} 已存在，请换一个版本号`),{status:409})
}
async function createScene(pool,payload){
  const code=String(payload.code||`SCENE-${Date.now().toString().slice(-6)}`).trim().toUpperCase()
  if(!/^[A-Z0-9_-]{3,64}$/.test(code))throw Object.assign(new Error('场景编码只能包含大写字母、数字、下划线和中划线'),{status:400})
  if(!String(payload.name||'').trim())throw Object.assign(new Error('场景名称不能为空'),{status:400})
  const version=normalizeSceneVersion(payload.version||'V1')
  const versionId=makeBusinessId(`SV-${code}`);const connection=await pool.getConnection()
  try{
    await connection.beginTransaction();await connection.query('INSERT INTO risk_scenes (id,code,current_version_id) VALUES (?,?,?)',[code,code,versionId])
    await connection.query(`INSERT INTO scene_versions (id,scene_id,version,status,name,domain,description,object_code,object_name,event_code,event_name,risk_level,observation_value,observation_unit,ontology_id,graph_version,organization_json,object_scope_json,exception_json,evidence_json,policy_json,check_template_json) VALUES (?,?,?,'草稿',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[versionId,code,version,String(payload.name).trim(),payload.domain||'采购',payload.description||'','','','','',payload.level||'高',0,'天','','',toJson(payload.organizations||['中国电子云集团']),toJson({logic:'AND',items:[]}),toJson({description:'',validUntil:''}),toJson([]),toJson([]),toJson({requirements:'',materials:[],deadlineHours:48})])
    await writeSceneAudit(connection,versionId,'新建风险场景',`${payload.name} / ${code} / ${version}`);await connection.commit();return await getSceneAggregate(pool,code)
  }catch(error){await connection.rollback();if(error?.code==='ER_DUP_ENTRY')throw Object.assign(new Error(`场景编码 ${code} 已存在`),{status:409});throw error}finally{connection.release()}
}

async function updateScene(pool,id,payload){
  const row=await getCurrentSceneRow(pool,id);if(!row)throw Object.assign(new Error('场景不存在'),{status:404})
  if(!editableSceneStatuses.has(row.status))throw Object.assign(new Error('已发布或已停用版本不可直接编辑，请复制新版本'),{status:409})
  if(Number(payload.lockVersion)!==Number(row.lock_version))throw Object.assign(new Error('场景草稿已被其他人更新，请刷新后重试'),{status:409})
  const version=normalizeSceneVersion(payload.version??row.version)
  await assertSceneVersionUnique(pool,row.scene_id,version,row.id)
  const [result]=await pool.query(`UPDATE scene_versions SET version=?,name=?,domain=?,description=?,risk_level=?,organization_json=?,object_scope_json=?,exception_json=?,check_template_json=?,status='草稿',validation_json=NULL,last_trial_id=NULL,dependency_hash='',lock_version=lock_version+1,updated_by='尹晨阳' WHERE id=? AND lock_version=?`,[version,payload.name??row.name,payload.domain??row.domain,payload.description??row.description,payload.level??row.risk_level,toJson(payload.organizations??parseJson(row.organization_json,[])),toJson(payload.objectScope??parseJson(row.object_scope_json,{})),toJson(payload.exceptions??parseJson(row.exception_json,{})),toJson(payload.checkTemplate??parseJson(row.check_template_json,{})),row.id,row.lock_version])
  if(!result.affectedRows)throw Object.assign(new Error('版本冲突，请刷新后重试'),{status:409})
  await writeSceneAudit(pool,row.id,'保存场景草稿',`场景配置已更新，当前版本号：${version}；历史校验和试跑结果已失效`);return await getSceneAggregate(pool,row.scene_id)
}

async function validateScene(pool,id){
  const row=await getCurrentSceneRow(pool,id);if(!row)throw Object.assign(new Error('场景不存在'),{status:404});if(!editableSceneStatuses.has(row.status))throw Object.assign(new Error('当前版本不可校验'),{status:409})
  const rules=await getBoundRuleRows(pool,row.id);const blockers=[];const warnings=[]
  if(!row.description.trim())blockers.push({field:'description',tab:'basic',message:'场景说明不能为空'})
  if(!parseJson(row.organization_json,[]).length)blockers.push({field:'organizations',tab:'scope',message:'至少选择一个适用组织'})
  const enabledRules=rules.filter((rule)=>Boolean(rule.binding_enabled));if(!enabledRules.length)blockers.push({field:'detections',tab:'rules',message:'至少需要一条启用规则'})
  for(const rule of enabledRules){const result=validateRuleRecord(rule);blockers.push(...result.blockers.map((item)=>({...item,ruleId:rule.id,message:`${rule.name}：${item.message}`})));warnings.push(...result.warnings.map((item)=>({...item,ruleId:rule.id,message:`${rule.name}：${item.message}`})))}

  for(const rule of enabledRules){
    const refs=await collectSemanticReferenceIssues(pool,{ontologyId:rule.ontology_id,objectCode:rule.object_code,eventCode:rule.event_code,graphVersion:rule.graph_version},'rules')
    blockers.push(...refs.blockers.map((item)=>({...item,ruleId:rule.id,message:`${rule.name}：${item.message}`})))
    warnings.push(...refs.warnings.map((item)=>({...item,ruleId:rule.id,message:`${rule.name}：${item.message}`})))
    if(rule.rule_type==='高级表达式'){
      const advanced=await collectAdvancedExpressionReferenceIssues(pool,rule.ontology_id,parseJson(rule.condition_json,{}).expression,'rules')
      blockers.push(...advanced.blockers.map((item)=>({...item,ruleId:rule.id,message:`${rule.name}：${item.message}`})))
    }
  }
  const validation={blockers,warnings,validatedAt:new Date().toISOString()};const status=blockers.length?'草稿':'待试跑'
  await pool.query('UPDATE scene_versions SET validation_json=?,status=?,lock_version=lock_version+1 WHERE id=?',[toJson(validation),status,row.id]);await writeSceneAudit(pool,row.id,'校验场景版本',`${blockers.length}个阻断项，${warnings.length}个提示项`)
  return {scene:await getSceneAggregate(pool,row.scene_id),validation}
}

async function copyScene(pool,id,payload={}){
  const source=await getCurrentSceneRow(pool,id);if(!source)throw Object.assign(new Error('场景不存在'),{status:404});if(!['已发布','已停用'].includes(source.status))throw Object.assign(new Error('仅已发布或已停用版本可以复制新版本'),{status:409})
  const [drafts]=await pool.query("SELECT version FROM scene_versions WHERE scene_id=? AND status IN ('草稿','待试跑','待发布') LIMIT 1",[source.scene_id]);if(drafts.length)throw Object.assign(new Error(`该场景已存在未发布版本 ${drafts[0].version}`),{status:409})
  const version=normalizeSceneVersion(payload.version||await suggestSceneVersion(pool,source.scene_id));await assertSceneVersionUnique(pool,source.scene_id,version)
  const versionId=makeBusinessId(`SV-${source.scene_id}`);const connection=await pool.getConnection()
  try{
    await connection.beginTransaction();await connection.query(`INSERT INTO scene_versions (id,scene_id,version,status,name,domain,description,object_code,object_name,event_code,event_name,risk_level,observation_value,observation_unit,ontology_id,graph_version,organization_json,object_scope_json,exception_json,evidence_json,policy_json,check_template_json,source_version_id) SELECT ?,scene_id,?,'草稿',name,domain,description,object_code,object_name,event_code,event_name,risk_level,observation_value,observation_unit,ontology_id,graph_version,organization_json,object_scope_json,exception_json,evidence_json,policy_json,check_template_json,id FROM scene_versions WHERE id=?`,[versionId,version,source.id])
    await connection.query('INSERT INTO scene_rule_bindings (scene_version_id,rule_version_id,enabled,risk_level_override,parameters_json,priority) SELECT ?,rule_version_id,enabled,risk_level_override,parameters_json,priority FROM scene_rule_bindings WHERE scene_version_id=?',[versionId,source.id])
    await connection.query('INSERT INTO scene_skill_bindings (scene_version_id,skill_version_id,enabled,risk_level_override,parameters_json,priority) SELECT ?,skill_version_id,enabled,risk_level_override,parameters_json,priority FROM scene_skill_bindings WHERE scene_version_id=?',[versionId,source.id])
    await connection.query('UPDATE risk_scenes SET current_version_id=? WHERE id=?',[versionId,source.scene_id]);await writeSceneAudit(connection,versionId,'复制场景新版本',`${source.version} → ${version}`);await connection.commit();return await getSceneAggregate(pool,source.scene_id)
  }catch(error){await connection.rollback();throw error}finally{connection.release()}
}

async function deleteScene(pool,id){
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction()
    const [rows]=await connection.query(`SELECT sv.*,rs.code,rs.current_version_id,
      ((SELECT COUNT(*) FROM rule_run_records rr WHERE rr.scene_version_id=sv.id)+(SELECT COUNT(*) FROM skill_run_records sr WHERE sr.scene_version_id=sv.id)) AS run_count,
      (SELECT COUNT(*) FROM scene_versions history WHERE history.scene_id=sv.scene_id) AS version_count
      FROM risk_scenes rs JOIN scene_versions sv ON sv.id=rs.current_version_id
      WHERE rs.id=? OR rs.code=? OR sv.id=? LIMIT 1 FOR UPDATE`,[id,id,id])
    const row=rows[0]
    if(!row)throw Object.assign(new Error('场景不存在'),{status:404})
    if(!editableSceneStatuses.has(row.status))throw Object.assign(new Error('已发布或已停用场景不能删除'),{status:409})
    if(Number(row.run_count||0)>0)throw Object.assign(new Error('该场景已有命中记录，不能删除'),{status:409})
    const [versions]=await connection.query('SELECT id,version,status,source_version_id,created_at FROM scene_versions WHERE scene_id=? ORDER BY created_at DESC FOR UPDATE',[row.scene_id])
    if(Number(row.version_count||versions.length||0)<=1){
      await connection.query('DELETE FROM scene_rule_audits WHERE scene_version_id=?',[row.id])
      await connection.query('DELETE FROM risk_scenes WHERE id=?',[row.scene_id])
      await connection.commit()
      return{ok:true,message:'场景草稿已删除'}
    }
    const fallback=versions.find((item)=>item.id===row.source_version_id)||versions.find((item)=>item.id!==row.id)
    if(!fallback)throw Object.assign(new Error('未找到可回退的历史版本，不能删除当前草稿'),{status:409})
    await connection.query('UPDATE risk_scenes SET current_version_id=? WHERE id=?',[fallback.id,row.scene_id])
    await connection.query('DELETE FROM scene_rule_audits WHERE scene_version_id=?',[row.id])
    await connection.query('DELETE FROM scene_versions WHERE id=?',[row.id])
    await writeSceneAudit(connection,fallback.id,'删除草稿版本',`${row.version} 已删除，当前版本回退到 ${fallback.version}`)
    await connection.commit()
    return{ok:true,message:`场景草稿版本已删除，已回退到 ${fallback.version}`}
  }catch(error){await connection.rollback();throw error}finally{connection.release()}
}
export async function handleSceneCrudApi(req,res,url,{pool,sendJson,readBody}){
  if(url.pathname==='/api/scenes'&&req.method==='GET'){sendJson(res,200,await listScenes(pool,url));return true}
  if(url.pathname==='/api/scenes'&&req.method==='POST'){sendJson(res,201,await createScene(pool,await readBody(req)));return true}
  const action=url.pathname.match(/^\/api\/scenes\/([^/]+)\/(validate|copy)$/)
  if(action&&req.method==='POST'){sendJson(res,action[2]==='copy'?201:200,action[2]==='copy'?await copyScene(pool,decodeURIComponent(action[1]),await readBody(req)):await validateScene(pool,decodeURIComponent(action[1])));return true}
  const item=url.pathname.match(/^\/api\/scenes\/([^/]+)$/)
  if(item){const id=decodeURIComponent(item[1]);if(req.method==='GET'){const result=await getSceneAggregate(pool,id);sendJson(res,result?200:404,result||{message:'场景不存在'});return true}if(req.method==='PUT'){sendJson(res,200,await updateScene(pool,id,await readBody(req)));return true}if(req.method==='DELETE'){sendJson(res,200,await deleteScene(pool,id));return true}}
  return false
}
