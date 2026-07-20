import { editableSceneStatuses, getCurrentSceneRow, getSceneAggregate, makeBusinessId, mapRuleRow, parseJson, toJson, writeSceneAudit } from './sceneRuleRepo.js'

async function uniqueRuleCode(connection,sceneId,sourceCode){
  const base=String(sourceCode||'RULE').replace(/-COPY-\d+$/,'')
  for(let index=0;index<100;index++){
    const code=index===0?base:`${base}-COPY-${index}`
    const [rows]=await connection.query('SELECT id FROM risk_rules WHERE scene_id=? AND code=? LIMIT 1',[sceneId,code])
    if(!rows.length)return code
  }
  return `${base}-${Date.now().toString().slice(-5)}`
}

async function listRuleLibrary(pool,url){
  const sceneId=String(url.searchParams.get('sceneId')||'')
  const target=sceneId?await getCurrentSceneRow(pool,sceneId):null
  const params=[];let exclude=''
  if(target){exclude=' AND rv.scene_version_id<>?';params.push(target.id)}
  const [rows]=await pool.query(`SELECT rv.*,rr.scene_id,rr.code,sv.name AS scene_name,sv.status AS scene_status,sv.ontology_id,sv.graph_version
    FROM risk_rules rr JOIN rule_versions rv ON rv.rule_id=rr.id JOIN scene_versions sv ON sv.id=rv.scene_version_id
    JOIN risk_scenes rs ON rs.id=rr.scene_id
    WHERE sv.id=rs.current_version_id ${exclude}
    ORDER BY rv.updated_at DESC`,params)
  return rows.map(mapRuleRow)
}

async function selectRules(pool,sceneId,payload){
  const target=await getCurrentSceneRow(pool,sceneId)
  if(!target)throw Object.assign(new Error('目标场景不存在'),{status:404})
  if(!editableSceneStatuses.has(target.status))throw Object.assign(new Error('已发布或已停用场景不能选择规则'),{status:409})
  const ids=Array.isArray(payload.ruleVersionIds)?[...new Set(payload.ruleVersionIds.map(String))]:[]
  if(!ids.length)throw Object.assign(new Error('请至少选择一条规则'),{status:400})
  const connection=await pool.getConnection();let copied=0
  try{
    await connection.beginTransaction()
    for(const id of ids){
      const [rows]=await connection.query(`SELECT rv.*,rr.code FROM rule_versions rv JOIN risk_rules rr ON rr.id=rv.rule_id WHERE rv.id=? LIMIT 1`,[id])
      if(!rows.length||rows[0].scene_version_id===target.id)continue
      const source=rows[0];const code=await uniqueRuleCode(connection,target.scene_id,source.code);const ruleId=makeBusinessId('RULE');const versionId=makeBusinessId('RV')
      await connection.query('INSERT INTO risk_rules (id,scene_id,code) VALUES (?,?,?)',[ruleId,target.scene_id,code])
      await connection.query(`INSERT INTO rule_versions
        (id,rule_id,scene_version_id,version,name,rule_type,risk_level,enabled,status,condition_json,path_json,time_json,aggregate_json,exception_json,output_json,evidence_json,policy_json,failure_strategy,summary)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[versionId,ruleId,target.id,target.version,source.name,source.rule_type,source.risk_level,source.enabled,'草稿',toJson(parseJson(source.condition_json,{})),toJson(parseJson(source.path_json,{})),toJson(parseJson(source.time_json,{})),toJson(parseJson(source.aggregate_json,{})),toJson(parseJson(source.exception_json,{})),toJson(parseJson(source.output_json,[])),toJson(parseJson(source.evidence_json,[])),toJson(parseJson(source.policy_json,{})),source.failure_strategy,source.summary])
      copied++
    }
    if(!copied)throw Object.assign(new Error('所选规则均已在当前场景中或已失效'),{status:409})
    await connection.query("UPDATE scene_versions SET status='草稿',validation_json=NULL,last_trial_id=NULL,dependency_hash='',lock_version=lock_version+1 WHERE id=?",[target.id])
    await writeSceneAudit(connection,target.id,'选择已有规则',`从规则库加入${copied}条规则`)
    await connection.commit();return await getSceneAggregate(pool,target.scene_id)
  }catch(error){await connection.rollback();throw error}finally{connection.release()}
}

async function safelyDeleteDraftRule(pool,id){
  const [rows]=await pool.query(`SELECT rv.*,rr.scene_id FROM rule_versions rv JOIN risk_rules rr ON rr.id=rv.rule_id WHERE rv.id=? LIMIT 1`,[id])
  if(!rows.length)throw Object.assign(new Error('规则不存在'),{status:404})
  const rule=rows[0];const scene=await getCurrentSceneRow(pool,rule.scene_id)
  if(!scene||scene.id!==rule.scene_version_id||!editableSceneStatuses.has(scene.status))throw Object.assign(new Error('只能删除当前未发布场景版本中的规则'),{status:409})
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction();await connection.query('DELETE FROM rule_versions WHERE id=?',[id])
    const [remaining]=await connection.query('SELECT COUNT(*) AS total FROM rule_versions WHERE rule_id=?',[rule.rule_id])
    if(Number(remaining[0].total)===0)await connection.query('DELETE FROM risk_rules WHERE id=?',[rule.rule_id])
    await connection.query("UPDATE scene_versions SET status='草稿',validation_json=NULL,last_trial_id=NULL,dependency_hash='',lock_version=lock_version+1 WHERE id=?",[rule.scene_version_id])
    await writeSceneAudit(connection,rule.scene_version_id,'删除草稿规则',`${rule.name}；已发布历史版本保持不变`)
    await connection.commit();return{ok:true,message:'草稿规则已删除，历史发布版本未受影响'}
  }catch(error){await connection.rollback();throw error}finally{connection.release()}
}

export async function handleSimpleRuleClosureApi(req,res,url,{pool,sendJson,readBody}){
  if(url.pathname==='/api/rule-library'&&req.method==='GET'){sendJson(res,200,await listRuleLibrary(pool,url));return true}
  const select=url.pathname.match(/^\/api\/scenes\/([^/]+)\/rules\/select$/)
  if(select&&req.method==='POST'){sendJson(res,201,await selectRules(pool,decodeURIComponent(select[1]),await readBody(req)));return true}
  const remove=url.pathname.match(/^\/api\/rules\/([^/]+)$/)
  if(remove&&req.method==='DELETE'){sendJson(res,200,await safelyDeleteDraftRule(pool,decodeURIComponent(remove[1])));return true}
  return false
}
