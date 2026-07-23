import { editableSceneStatuses, getCurrentSceneRow, getSceneAggregate, makeBusinessId, mapSkillRow, normalizeEvidenceRequirements, normalizePolicyList, parseJson, toJson, validateSkillRecord, writeSceneAudit } from './sceneRuleRepo.js'

const automaticInputs=[
  {id:'input-context',name:'场景业务上下文',sourceType:'对象字段',source:'系统自动组装当前对象、关联事件和图谱关系',required:false},
  {id:'input-attachment',name:'关联附件',sourceType:'附件',source:'系统自动获取当前对象关联附件',required:false},
]
const defaultOutputs=[
  {id:'output-match',name:'是否命中',dataType:'布尔',description:'是否达到风险命中条件'},
  {id:'output-score',name:'风险评分',dataType:'数字',description:'0至100分'},
  {id:'output-conclusion',name:'判断结论',dataType:'文本',description:'结构化风险结论'},
  {id:'output-evidence',name:'实际证据',dataType:'列表',description:'来源数据、原文片段、页码或字段比对明细'},
]
const generationFailureStrategy='数据不足时返回无法判断，不产生预警并记录运行原因'

const skillSelect=[
  'SELECT sav.*,sa.code,',
  "(SELECT COUNT(*) FROM scene_skill_bindings bx WHERE bx.skill_version_id=sav.id) AS binding_count,",
  "(SELECT GROUP_CONCAT(DISTINCT svx.name ORDER BY svx.name SEPARATOR '、') FROM scene_skill_bindings bx JOIN scene_versions svx ON svx.id=bx.scene_version_id WHERE bx.skill_version_id=sav.id) AS scene_names,",
  "(SELECT GROUP_CONCAT(DISTINCT svx.scene_id ORDER BY svx.scene_id SEPARATOR ',') FROM scene_skill_bindings bx JOIN scene_versions svx ON svx.id=bx.scene_version_id WHERE bx.skill_version_id=sav.id) AS scene_ids",
  'FROM skill_assets sa JOIN skill_asset_versions sav ON sav.id=sa.current_version_id',
].join(' ')

function inferSkillType(demand){
  const text=String(demand||'')
  if(/相似|雷同|围标|串标/.test(text))return'文档异常相似检测'
  if(/一致|比对|核验|匹配/.test(text))return'数据与附件一致性检查'
  if(/合同|条款|倾向|排斥/.test(text))return'风险条款识别'
  if(/提取|识别字段|结构化/.test(text))return'文档信息提取'
  if(/附件|文件|材料|文本/.test(text))return'文档一致性检查'
  return'综合风险研判'
}
function generatedReviewContent(domain,demand){
  const text=String(demand||'')
  if(/投标|招标|采购文件/.test(text))return'当前风险场景中的采购项目数据、供应商投标文件及其关联附件。'
  if(/合同|条款/.test(text))return'当前风险场景中的合同正文、合同附件及关联业务对象数据。'
  if(/付款|资金|发票/.test(text))return'当前风险场景中的付款、发票、资金流向及关联主体数据。'
  if(/附件|文件|材料/.test(text))return'当前风险场景关联的业务材料、附件文本及其所属业务对象数据。'
  return`${domain||'通用'}领域当前风险场景的业务对象、关联事件、图谱关系和附件材料。`
}
function generatedReviewRequirement(demand){return`围绕“${String(demand||'').trim()}”开展审查，识别相关异常、矛盾、缺失或高风险内容。所有判断必须引用实际业务数据或附件位置；数据不足时返回“无法判断”，不得直接形成风险结论。`}
function generatedExpectedOutput(demand){
  const location=/附件|文件|合同|投标|条款|材料/.test(String(demand||''))?'原文片段和页码':'来源字段和业务记录编号'
  return`输出是否命中、风险评分、判断结论和实际证据；实际证据必须包含${location}，并说明其与审查结论的对应关系。`
}
function evidenceFor(expectedOutput){return[{id:'evidence-result',name:'Skill实际证据',source:'Skill自动审查结果',sourceField:'evidence',attachmentRequirement:'可选附件',completeness:String(expectedOutput||'必须包含风险结论、来源位置和Skill版本'),description:'系统根据输出结果要求自动固化实际证据'}]}
function summarize(payload){return`审查内容：${payload.reviewContent||'未生成'}；审查要求：${payload.reviewRequirement||'未生成'}；输出结果：${payload.expectedOutput||'未生成'}`}
function generateSkill(payload){
  const reviewDemand=String(payload.reviewDemand||'').trim()
  if(!reviewDemand)throw Object.assign(new Error('请先填写审查需求'),{status:400})
  const domain=String(payload.domain||'采购')
  const reviewContent=generatedReviewContent(domain,reviewDemand)
  const reviewRequirement=generatedReviewRequirement(reviewDemand)
  const expectedOutput=generatedExpectedOutput(reviewDemand)
  return{
    type:inferSkillType(reviewDemand),description:reviewContent,reviewDemand,reviewContent,reviewRequirement,expectedOutput,
    instruction:reviewRequirement,threshold:80,inputs:automaticInputs,outputs:defaultOutputs,evidenceRequirements:evidenceFor(expectedOutput),policies:[],failureStrategy:generationFailureStrategy,generatedAt:new Date().toISOString(),
  }
}
function generatedConfig(payload,current={}){
  const reviewDemand=String(payload.reviewDemand??current.reviewDemand??current.instruction??'').trim()
  const reviewContent=String(payload.reviewContent??current.reviewContent??'').trim()
  const reviewRequirement=String(payload.reviewRequirement??current.reviewRequirement??payload.instruction??current.instruction??'').trim()
  const expectedOutput=String(payload.expectedOutput??current.expectedOutput??'').trim()
  return{...current,reviewDemand,reviewContent,reviewRequirement,expectedOutput,instruction:reviewRequirement,threshold:80,generatedAt:String(payload.generatedAt??current.generatedAt??new Date().toISOString())}
}
function assertGenerated(payload){
  if(!String(payload.name||'').trim())throw Object.assign(new Error('Skill名称不能为空'),{status:400})
  if(!String(payload.domain||'').trim())throw Object.assign(new Error('监管领域不能为空'),{status:400})
  for(const [field,label] of [['reviewDemand','审查需求'],['reviewContent','审查内容'],['reviewRequirement','审查要求'],['expectedOutput','输出结果']])if(!String(payload[field]||'').trim())throw Object.assign(new Error(label+'不能为空，请先生成Skill'),{status:400})
}

async function getSkill(pool,id){
  const [rows]=await pool.query(skillSelect+' WHERE sav.id=? OR sa.id=? OR sa.code=? LIMIT 1',[id,id,id])
  return rows.length?mapSkillRow(rows[0]):null
}

async function listSkills(pool,url){
  const keyword=String(url.searchParams.get('keyword')||'').trim()
  const params=[];let where=''
  if(keyword){where=' WHERE sav.name LIKE ? OR sa.code LIKE ? OR sav.domain LIKE ? OR sav.skill_type LIKE ?';params.push(...Array(4).fill(`%${keyword}%`))}
  const [rows]=await pool.query(skillSelect+where+' ORDER BY sav.updated_at DESC',params)
  return rows.map(mapSkillRow)
}

async function nextCode(pool,value){
  const requested=String(value||'').trim().toUpperCase()
  if(requested){
    if(!/^[A-Z0-9_-]{3,64}$/.test(requested))throw Object.assign(new Error('Skill编码只能包含大写字母、数字、下划线和中划线'),{status:400})
    const [exists]=await pool.query('SELECT id FROM skill_assets WHERE code=? LIMIT 1',[requested])
    if(exists.length)throw Object.assign(new Error('Skill编码 '+requested+' 已存在'),{status:409})
    return requested
  }
  const [rows]=await pool.query("SELECT code FROM skill_assets WHERE code LIKE 'SKILL-%'")
  return 'SKILL-'+String(rows.length+1).padStart(3,'0')
}

async function createSkill(pool,payload,scene=null){
  assertGenerated(payload)
  const code=await nextCode(pool,payload.code)
  const skillId=makeBusinessId('SKILL');const versionId=makeBusinessId('SKV')
  const config=generatedConfig(payload)
  const type=payload.type||inferSkillType(config.reviewDemand)
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction()
    await connection.query("INSERT INTO skill_assets (id,code,current_version_id,status) VALUES (?,?,?,'草稿')",[skillId,code,versionId])
    await connection.query(`INSERT INTO skill_asset_versions (id,skill_id,version,name,skill_type,domain,description,risk_level,status,input_json,config_json,output_json,evidence_json,policy_json,failure_strategy,summary) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[
      versionId,skillId,'v0.1',String(payload.name).trim(),type,payload.domain||'采购',config.reviewContent,payload.level||'高','草稿',
      toJson(automaticInputs),toJson(config),toJson(defaultOutputs),toJson(evidenceFor(config.expectedOutput)),toJson([]),generationFailureStrategy,summarize(config),
    ])
    if(scene){
      await connection.query('INSERT INTO scene_skill_bindings (scene_version_id,skill_version_id,enabled,risk_level_override,parameters_json,priority) VALUES (?,?,1,NULL,JSON_OBJECT(),100)',[scene.id,versionId])
      await connection.query("UPDATE scene_versions SET status='草稿',validation_json=NULL,last_trial_id=NULL,dependency_hash='',lock_version=lock_version+1 WHERE id=?",[scene.id])
      await writeSceneAudit(connection,scene.id,'新建并引用Skill',code+' / '+String(payload.name).trim())
    }
    await connection.commit()
    return await getSkill(pool,versionId)
  }catch(error){await connection.rollback();throw error}finally{connection.release()}
}

async function updateSkill(pool,id,payload){
  const [rows]=await pool.query('SELECT sav.*,sa.id AS asset_id,sa.code FROM skill_asset_versions sav JOIN skill_assets sa ON sa.id=sav.skill_id WHERE sav.id=? OR sa.id=? OR sa.code=? LIMIT 1',[id,id,id])
  if(!rows.length)throw Object.assign(new Error('Skill不存在'),{status:404})
  const row=rows[0]
  if(['已发布','已停用'].includes(row.status))throw Object.assign(new Error('已发布或已停用Skill不可直接修改'),{status:409})
  if(Number(payload.lockVersion)!==Number(row.lock_version))throw Object.assign(new Error('Skill已被其他人更新，请刷新后重试'),{status:409})
  const [published]=await pool.query("SELECT COUNT(*) AS total FROM scene_skill_bindings b JOIN scene_versions sv ON sv.id=b.scene_version_id WHERE b.skill_version_id=? AND sv.status IN ('已发布','已停用')",[row.id])
  if(Number(published[0].total)>0)throw Object.assign(new Error('该Skill版本已被已发布场景引用，不能直接修改'),{status:409})
  const currentConfig=parseJson(row.config_json,{})
  const config=generatedConfig(payload,{...currentConfig,reviewContent:currentConfig.reviewContent||row.description})
  const nextPayload={...payload,name:payload.name??row.name,domain:payload.domain??row.domain,reviewDemand:config.reviewDemand,reviewContent:config.reviewContent,reviewRequirement:config.reviewRequirement,expectedOutput:config.expectedOutput}
  assertGenerated(nextPayload)
  const type=payload.type||inferSkillType(config.reviewDemand)||row.skill_type
  const policies=payload.policies??normalizePolicyList(row.policy_json)
  const [result]=await pool.query(`UPDATE skill_asset_versions SET name=?,skill_type=?,domain=?,description=?,risk_level=?,status='草稿',input_json=?,config_json=?,output_json=?,evidence_json=?,policy_json=?,failure_strategy=?,summary=?,lock_version=lock_version+1 WHERE id=? AND lock_version=?`,[
    nextPayload.name,type,nextPayload.domain,config.reviewContent,payload.level??row.risk_level,toJson(automaticInputs),toJson(config),toJson(defaultOutputs),toJson(evidenceFor(config.expectedOutput)),toJson(policies),generationFailureStrategy,summarize(config),row.id,row.lock_version,
  ])
  if(!result.affectedRows)throw Object.assign(new Error('Skill版本冲突，请刷新后重试'),{status:409})
  const [scenes]=await pool.query("SELECT sv.id FROM scene_skill_bindings b JOIN scene_versions sv ON sv.id=b.scene_version_id WHERE b.skill_version_id=? AND sv.status IN ('草稿','待试跑','待发布')",[row.id])
  for(const scene of scenes){
    await pool.query("UPDATE scene_versions SET status='草稿',validation_json=NULL,last_trial_id=NULL,dependency_hash='',lock_version=lock_version+1 WHERE id=?",[scene.id])
    await writeSceneAudit(pool,scene.id,'共享Skill已更新',row.code+' / '+nextPayload.name)
  }
  return await getSkill(pool,row.id)
}

async function validateSkill(pool,id){
  const [rows]=await pool.query('SELECT * FROM skill_asset_versions WHERE id=?',[id])
  if(!rows.length)throw Object.assign(new Error('Skill不存在'),{status:404})
  return validateSkillRecord(rows[0])
}

async function deleteSkill(pool,id){
  const [rows]=await pool.query('SELECT sav.*,sa.id AS asset_id FROM skill_asset_versions sav JOIN skill_assets sa ON sa.id=sav.skill_id WHERE sav.id=? OR sa.id=? OR sa.code=? LIMIT 1',[id,id,id])
  if(!rows.length)throw Object.assign(new Error('Skill不存在'),{status:404})
  const row=rows[0]
  const [bindings]=await pool.query('SELECT COUNT(*) AS total FROM scene_skill_bindings b JOIN skill_asset_versions sav ON sav.id=b.skill_version_id WHERE sav.skill_id=?',[row.asset_id])
  if(Number(bindings[0].total)>0)throw Object.assign(new Error('该Skill已被'+Number(bindings[0].total)+'个场景版本引用，请先从场景中解除关联'),{status:409})
  if(['已发布','已停用'].includes(row.status))throw Object.assign(new Error('已发布或已停用Skill不能删除'),{status:409})
  await pool.query('DELETE FROM skill_assets WHERE id=?',[row.asset_id])
  return{ok:true,message:'Skill草稿已删除'}
}

async function listLibrary(pool,url){
  const sceneId=String(url.searchParams.get('sceneId')||'')
  const target=sceneId?await getCurrentSceneRow(pool,sceneId):null
  const params=[];let where=''
  if(target){where=' WHERE NOT EXISTS (SELECT 1 FROM scene_skill_bindings bx WHERE bx.scene_version_id=? AND bx.skill_version_id=sav.id)';params.push(target.id)}
  const [rows]=await pool.query(skillSelect+where+' ORDER BY sav.updated_at DESC',params)
  return rows.map(mapSkillRow)
}

async function bindSkills(pool,sceneId,payload){
  const target=await getCurrentSceneRow(pool,sceneId)
  if(!target)throw Object.assign(new Error('目标场景不存在'),{status:404})
  if(!editableSceneStatuses.has(target.status))throw Object.assign(new Error('已发布或已停用场景不能调整Skill引用'),{status:409})
  const ids=Array.isArray(payload.skillVersionIds)?[...new Set(payload.skillVersionIds.map(String))]:[]
  if(!ids.length)throw Object.assign(new Error('请至少选择一个Skill'),{status:400})
  const connection=await pool.getConnection();let linked=0
  try{
    await connection.beginTransaction()
    for(const id of ids){
      const [exists]=await connection.query('SELECT id FROM skill_asset_versions WHERE id=? LIMIT 1',[id])
      if(!exists.length)continue
      const [result]=await connection.query('INSERT IGNORE INTO scene_skill_bindings (scene_version_id,skill_version_id,enabled,risk_level_override,parameters_json,priority) VALUES (?,?,1,NULL,JSON_OBJECT(),100)',[target.id,id])
      linked+=Number(result.affectedRows||0)
    }
    if(!linked)throw Object.assign(new Error('所选Skill已在当前场景中或已失效'),{status:409})
    await connection.query("UPDATE scene_versions SET status='草稿',validation_json=NULL,last_trial_id=NULL,dependency_hash='',lock_version=lock_version+1 WHERE id=?",[target.id])
    await writeSceneAudit(connection,target.id,'引用Skill库','建立'+linked+'个Skill引用，未复制Skill')
    await connection.commit()
    return await getSceneAggregate(pool,target.scene_id)
  }catch(error){await connection.rollback();throw error}finally{connection.release()}
}

async function unbindSkill(pool,sceneId,skillVersionId){
  const target=await getCurrentSceneRow(pool,sceneId)
  if(!target)throw Object.assign(new Error('场景不存在'),{status:404})
  if(!editableSceneStatuses.has(target.status))throw Object.assign(new Error('已发布或已停用场景不能解除Skill引用'),{status:409})
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction()
    const [skills]=await connection.query('SELECT sav.name,sa.code FROM skill_asset_versions sav JOIN skill_assets sa ON sa.id=sav.skill_id WHERE sav.id=?',[skillVersionId])
    const [result]=await connection.query('DELETE FROM scene_skill_bindings WHERE scene_version_id=? AND skill_version_id=?',[target.id,skillVersionId])
    if(!result.affectedRows)throw Object.assign(new Error('当前场景未引用该Skill'),{status:404})
    await connection.query("UPDATE scene_versions SET status='草稿',validation_json=NULL,last_trial_id=NULL,dependency_hash='',lock_version=lock_version+1 WHERE id=?",[target.id])
    await writeSceneAudit(connection,target.id,'解除Skill引用',(skills[0]?.code||skillVersionId)+' / '+(skills[0]?.name||''))
    await connection.commit()
    return await getSceneAggregate(pool,target.scene_id)
  }catch(error){await connection.rollback();throw error}finally{connection.release()}
}

export async function handleSkillAssetApi(req,res,url,{pool,sendJson,readBody}){
  if(url.pathname==='/api/skills'&&req.method==='GET'){sendJson(res,200,await listSkills(pool,url));return true}
  if(url.pathname==='/api/skills'&&req.method==='POST'){sendJson(res,201,await createSkill(pool,await readBody(req)));return true}
  if(url.pathname==='/api/skills/generate'&&req.method==='POST'){sendJson(res,200,generateSkill(await readBody(req)));return true}
  if(url.pathname==='/api/skill-library'&&req.method==='GET'){sendJson(res,200,await listLibrary(pool,url));return true}
  const bind=url.pathname.match(/^\/api\/scenes\/([^/]+)\/skills\/select$/)
  if(bind&&req.method==='POST'){sendJson(res,201,await bindSkills(pool,decodeURIComponent(bind[1]),await readBody(req)));return true}
  const unbind=url.pathname.match(/^\/api\/scenes\/([^/]+)\/skills\/([^/]+)$/)
  if(unbind&&req.method==='DELETE'){sendJson(res,200,await unbindSkill(pool,decodeURIComponent(unbind[1]),decodeURIComponent(unbind[2])));return true}
  const createInScene=url.pathname.match(/^\/api\/scenes\/([^/]+)\/skills$/)
  if(createInScene&&req.method==='POST'){
    const scene=await getCurrentSceneRow(pool,decodeURIComponent(createInScene[1]))
    if(!scene)return sendJson(res,404,{message:'场景不存在'})
    if(!editableSceneStatuses.has(scene.status))return sendJson(res,409,{message:'当前场景版本不可新增Skill'})
    sendJson(res,201,await createSkill(pool,await readBody(req),scene));return true
  }
  const validate=url.pathname.match(/^\/api\/skills\/([^/]+)\/validate$/)
  if(validate&&req.method==='POST'){sendJson(res,200,await validateSkill(pool,decodeURIComponent(validate[1])));return true}
  const item=url.pathname.match(/^\/api\/skills\/([^/]+)$/)
  if(item){
    const id=decodeURIComponent(item[1])
    if(req.method==='GET'){const result=await getSkill(pool,id);sendJson(res,result?200:404,result||{message:'Skill不存在'});return true}
    if(req.method==='PUT'){sendJson(res,200,await updateSkill(pool,id,await readBody(req)));return true}
    if(req.method==='DELETE'){sendJson(res,200,await deleteSkill(pool,id));return true}
  }
  return false
}