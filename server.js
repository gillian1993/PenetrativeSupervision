import http from 'node:http'
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import { initializeSceneRuleDatabase } from './sceneRuleService.js'
import { handleSceneRuleApi } from './sceneRuleRouter.js'
import { initializeDataGraphDatabase, handleDataGraphApi } from './dataGraphApi.js'

const root=fileURLToPath(new URL('.',import.meta.url))

function loadLocalEnv(){
  const file=join(root,'.env.local');if(!existsSync(file))return
  for(const raw of readFileSync(file,'utf8').split(/\r?\n/)){
    const line=raw.trim();if(!line||line.startsWith('#'))continue;const index=line.indexOf('=');if(index<1)continue
    const key=line.slice(0,index).trim();const value=line.slice(index+1).trim().replace(/^['"]|['"]$/g,'');if(process.env[key]===undefined)process.env[key]=value
  }
}

loadLocalEnv()
const database=process.env.MYSQL_DATABASE||'penetrative_supervision'
if(!/^[a-zA-Z0-9_]+$/.test(database))throw new Error('MYSQL_DATABASE只能包含字母、数字和下划线')
const connectionConfig={host:process.env.MYSQL_HOST||'127.0.0.1',port:Number(process.env.MYSQL_PORT||3306),user:process.env.MYSQL_USER||'root',password:process.env.MYSQL_PASSWORD||''}

const initialOntologies=[
  ['ONT-BASE','平台监管基础本体','监管基础本体','通用','v1.6',14,126,28,32,'已发布','统一组织、人员、主体、账户、文档、预警和风险事件的基础语义。'],
  ['ONT-PROC','采购监管扩展本体','领域扩展本体','采购','v2.2',12,94,21,18,'已发布','覆盖供应商、采购项目、投标、评审和中标确认等采购监管对象。'],
  ['ONT-CONTRACT','合同监管扩展本体','领域扩展本体','合同','v1.4',8,67,16,14,'已发布','覆盖合同签订、履约、变更、验收和结算事件。'],
  ['ONT-FIN','财务资金扩展本体','领域扩展本体','财务','v1.1',10,88,19,21,'待校验','覆盖付款、账户、资金流水、融资和担保关系。'],
]
const initialElements=[
  ['ONT-PROC','class','PROC.Supplier','供应商','本体类','统一社会信用代码为主标识','参与采购、合同或服务活动的业务主体。'],
  ['ONT-PROC','class','PROC.Reviewer','评审人员','本体类','人员编码为主标识','参与采购评审的专家或业务人员。'],
  ['ONT-PROC','class','PROC.Contract','合同','本体类','合同编码为主标识','采购结果形成的合同对象。'],
  ['ONT-PROC','class','PROC.PurchaseProject','采购项目','本体类','项目编码为主标识','采购立项、评审与中标的核心对象。'],
  ['ONT-PROC','class','PROC.Contact','联系方式','本体类','联系方式标准化值为主标识','用于识别多个主体共同使用的联系方式。'],
  ['ONT-PROC','property','PROC.Supplier.credit_code','统一社会信用代码','文本','主标识、必填','供应商工商登记主标识。'],
  ['ONT-PROC','property','PROC.Supplier.phone','供应商联系电话','文本','手机号或固话','供应商登记联系方式。'],
  ['ONT-PROC','property','PROC.Reviewer.phone','评审人员联系电话','文本','脱敏比对','评审人员登记联系方式。'],
  ['ONT-PROC','property','PROC.Contract.change_rate','合同金额变更比例','数字','百分比','合同金额相对中标金额的变化比例。'],
  ['ONT-PROC','property','PROC.Contract.change_amount','合同变更金额','金额','人民币','合同累计变更金额。'],
  ['ONT-PROC','property','PROC.Contact.valid_time','关系有效时间','日期时间','标准时间','主体联系方式关系的有效时间。'],
  ['ONT-PROC','relation','PROC.supplier_contact','登记联系方式','供应商 → 联系方式','一对多','供应商登记或使用联系方式。'],
  ['ONT-PROC','relation','PROC.shared_contact','共同使用','联系方式 → 评审人员','多对多','多个主体共同使用同一联系方式。'],
  ['ONT-PROC','relation','PROC.actual_control','实际控制','供应商 → 人员','多对多','供应商实际控制关系。'],
  ['ONT-PROC','event','PROC.BidConfirmed','中标确认','采购项目事件','目标事件','采购项目确认中标结果的业务事件。'],
  ['ONT-PROC','event','PROC.ContractChanged','合同变更','合同事件','目标事件','合同金额或关键条款发生变更。'],
  ['ONT-PROC','event','PROC.PurchaseCreated','采购立项','采购项目事件','目标事件','采购项目完成立项。'],
]

let pool

async function ensureColumn(table,column,definition){
  const [rows]=await pool.query('SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?',[database,table,column])
  if(!Number(rows[0].total))await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`)
}

async function syncOntologyCounts(connection=pool,id=''){
  const where=id?' WHERE id=?':'';const params=id?[id]:[]
  await connection.query(`UPDATE ontologies o SET
    class_count=(SELECT COUNT(*) FROM ontology_elements e WHERE e.ontology_id=o.id AND e.element_type='class'),
    property_count=(SELECT COUNT(*) FROM ontology_elements e WHERE e.ontology_id=o.id AND e.element_type='property'),
    relation_count=(SELECT COUNT(*) FROM ontology_elements e WHERE e.ontology_id=o.id AND e.element_type='relation'),
    event_count=(SELECT COUNT(*) FROM ontology_elements e WHERE e.ontology_id=o.id AND e.element_type='event')${where}`,params)
}

async function initializeDatabase(){
  const bootstrap=await mysql.createConnection({...connectionConfig,connectTimeout:10000});await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);await bootstrap.end()
  pool=mysql.createPool({...connectionConfig,database,waitForConnections:true,connectionLimit:8,charset:'utf8mb4'})
  await pool.query(`CREATE TABLE IF NOT EXISTS ontologies (
    id VARCHAR(64) PRIMARY KEY,name VARCHAR(160) NOT NULL,scope VARCHAR(64) NOT NULL,domain VARCHAR(64) NOT NULL,version VARCHAR(24) NOT NULL,
    class_count INT NOT NULL DEFAULT 0,property_count INT NOT NULL DEFAULT 0,relation_count INT NOT NULL DEFAULT 0,event_count INT NOT NULL DEFAULT 0,
    status VARCHAR(24) NOT NULL DEFAULT '草稿',description TEXT NOT NULL,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS ontology_elements (
    element_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,ontology_id VARCHAR(64) NOT NULL,element_type VARCHAR(24) NOT NULL,code VARCHAR(120) NOT NULL,
    name VARCHAR(160) NOT NULL,data_type VARCHAR(120) NOT NULL DEFAULT '',constraint_desc VARCHAR(240) NOT NULL DEFAULT '',description TEXT NOT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_ontology_element (ontology_id,element_type,code),CONSTRAINT fk_element_ontology FOREIGN KEY (ontology_id) REFERENCES ontologies(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS ontology_audits (
    audit_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,ontology_id VARCHAR(64) NOT NULL,action VARCHAR(80) NOT NULL,summary VARCHAR(500) NOT NULL,
    operator_name VARCHAR(80) NOT NULL DEFAULT '赵明',created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,KEY idx_ontology_audit (ontology_id,created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await ensureColumn('ontologies','source_version_id','source_version_id VARCHAR(64) NULL AFTER version')
  await ensureColumn('ontologies','validation_json','validation_json JSON NULL AFTER description')
  await ensureColumn('ontologies','published_at','published_at TIMESTAMP NULL AFTER validation_json')
  await ensureColumn('ontology_elements','owner_code','owner_code VARCHAR(120) NOT NULL DEFAULT \'\' AFTER name')
  await ensureColumn('ontology_elements','target_code','target_code VARCHAR(120) NOT NULL DEFAULT \'\' AFTER owner_code')
  for(const item of initialOntologies)await pool.query(`INSERT IGNORE INTO ontologies (id,name,scope,domain,version,class_count,property_count,relation_count,event_count,status,description) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,item)
  for(const item of initialElements)await pool.query(`INSERT IGNORE INTO ontology_elements (ontology_id,element_type,code,name,data_type,constraint_desc,description) VALUES (?,?,?,?,?,?,?)`,item)
  const elementReferences=[
    ['PROC.Supplier.credit_code','PROC.Supplier',''],['PROC.Supplier.phone','PROC.Supplier',''],['PROC.Reviewer.phone','PROC.Reviewer',''],
    ['PROC.Contract.change_rate','PROC.Contract',''],['PROC.Contract.change_amount','PROC.Contract',''],['PROC.Contact.valid_time','PROC.Contact',''],
    ['PROC.supplier_contact','PROC.Supplier','PROC.Contact'],['PROC.shared_contact','PROC.Contact','PROC.Reviewer'],['PROC.actual_control','PROC.Supplier','PROC.Reviewer'],
    ['PROC.participate','PROC.Supplier','PROC.PurchaseProject'],
    ['PROC.BidConfirmed','PROC.PurchaseProject',''],['PROC.ContractChanged','PROC.Contract',''],['PROC.PurchaseCreated','PROC.PurchaseProject',''],
  ]
  for(const [code,owner,target] of elementReferences)await pool.query("UPDATE ontology_elements SET owner_code=IF(owner_code='',?,owner_code),target_code=IF(target_code='',?,target_code) WHERE ontology_id='ONT-PROC' AND code=?",[owner,target,code])
  await syncOntologyCounts()
  await pool.query("UPDATE ontologies SET status='草稿',validation_json=NULL,published_at=NULL WHERE status IN ('待校验','已发布') AND class_count=0")
  await initializeSceneRuleDatabase(pool)
  await initializeDataGraphDatabase(pool)
}

const formatTime=(value)=>value instanceof Date?value.toLocaleString('zh-CN',{hour12:false}).replaceAll('/','-'):String(value||'')
const parseJson=(value,fallback)=>{if(value===null||value===undefined||value==='')return fallback;if(typeof value==='object')return value;try{return JSON.parse(value)}catch{return fallback}}
const toJson=(value)=>JSON.stringify(value??null)
const mapElement=(row)=>({id:String(row.element_id),type:row.element_type,code:row.code,name:row.name,ownerCode:row.owner_code||'',targetCode:row.target_code||'',dataType:row.data_type,constraint:row.constraint_desc,description:row.description})
const mapOntology=(row,elements=[])=>{
  const count=(type)=>elements.filter((item)=>item.type===type).length
  return {id:row.id,name:row.name,scope:row.scope,domain:row.domain,version:row.version,sourceVersionId:row.source_version_id||'',classes:count('class'),properties:count('property'),relations:count('relation'),events:count('event'),status:row.status,description:row.description,validation:parseJson(row.validation_json,{blockers:[],warnings:[],validatedAt:''}),publishedAt:formatTime(row.published_at),updatedAt:formatTime(row.updated_at),elements}
}

async function getOntology(id,connection=pool){const [rows]=await connection.query('SELECT * FROM ontologies WHERE id=?',[id]);if(!rows.length)return null;const [elements]=await connection.query('SELECT * FROM ontology_elements WHERE ontology_id=? ORDER BY element_type,element_id',[id]);return mapOntology(rows[0],elements.map(mapElement))}
async function listOntologies(){const [rows]=await pool.query('SELECT * FROM ontologies ORDER BY updated_at DESC,id ASC');const [elements]=await pool.query('SELECT * FROM ontology_elements ORDER BY element_type,element_id');const grouped=new Map();for(const element of elements){if(!grouped.has(element.ontology_id))grouped.set(element.ontology_id,[]);grouped.get(element.ontology_id).push(mapElement(element))}return rows.map((row)=>mapOntology(row,grouped.get(row.id)||[]))}
async function ontologyAudit(connection,id,action,summary){await connection.query('INSERT INTO ontology_audits (ontology_id,action,summary) VALUES (?,?,?)',[id,action,summary])}

const elementCodePattern=/^[A-Z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9_]*)+$/
function normalizeElementPayload(payload,typeFallback=''){
  const type=String(payload.type||typeFallback||'').trim()
  return {
    type,
    code:String(payload.code||'').trim(),
    name:String(payload.name||'').trim(),
    ownerCode:String(payload.ownerCode||'').trim(),
    targetCode:String(payload.targetCode||'').trim(),
    dataType:String(payload.dataType||'').trim(),
    constraint:String(payload.constraint||'').trim(),
    description:String(payload.description||'').trim(),
  }
}
function validateOntologyRecord(ontology){
  const blockers=[];const warnings=[]
  const classCodes=new Set(ontology.elements.filter((item)=>item.type==='class').map((item)=>item.code))
  if(!ontology.elements.some((item)=>item.type==='class'))blockers.push({field:'classes',tab:'class',message:'至少需要定义一个本体类'})
  if(!/^[A-Z0-9_-]{3,64}$/.test(ontology.id))blockers.push({field:'id',tab:'basic',message:'本体编码只能包含大写字母、数字、下划线和中划线'})
  for(const element of ontology.elements){
    if(!elementCodePattern.test(element.code))blockers.push({field:element.id,tab:element.type,message:`${element.name||element.code} 的元素编码格式无效`})
    if(!String(element.name||'').trim())blockers.push({field:element.id,tab:element.type,message:`${element.code} 的中文名称不能为空`})
    if(element.type==='property'){
      if(!element.ownerCode)blockers.push({field:element.id,tab:'property',message:`属性 ${element.name} 必须选择所属对象`})
      else if(!classCodes.has(element.ownerCode))blockers.push({field:element.id,tab:'property',message:`属性 ${element.name} 的所属对象不存在`})
    }
    if(element.type==='relation'){
      if(!element.ownerCode||!element.targetCode)blockers.push({field:element.id,tab:'relation',message:`关系 ${element.name} 必须选择起点对象和终点对象`})
      else {
        if(!classCodes.has(element.ownerCode))blockers.push({field:element.id,tab:'relation',message:`关系 ${element.name} 的起点对象不存在`})
        if(!classCodes.has(element.targetCode))blockers.push({field:element.id,tab:'relation',message:`关系 ${element.name} 的终点对象不存在`})
      }
    }
    if(element.type==='event'){
      if(!element.ownerCode)blockers.push({field:element.id,tab:'event',message:`事件 ${element.name} 必须选择事件主体`})
      else if(!classCodes.has(element.ownerCode))blockers.push({field:element.id,tab:'event',message:`事件 ${element.name} 的事件主体不存在`})
    }
  }
  if(!ontology.elements.some((item)=>item.type==='property'&&/主标识/.test(item.constraint||'')))warnings.push({field:'identity',tab:'property',message:'建议至少配置一个标记为“主标识”的属性，便于图谱实体合并'})
  return {blockers,warnings,validatedAt:new Date().toISOString()}
}
async function resetOntologyDraft(connection,id){
  await connection.query("UPDATE ontologies SET status='草稿',validation_json=NULL,published_at=NULL WHERE id=?",[id])
}
async function validateOntologyVersion(connection,id){
  const ontology=await getOntology(id,connection);if(!ontology)return null
  const validation=validateOntologyRecord(ontology)
  await connection.query('UPDATE ontologies SET validation_json=?,status=? WHERE id=?',[toJson(validation),validation.blockers.length?'草稿':'待校验',id])
  await ontologyAudit(connection,id,'校验本体版本',`${validation.blockers.length}个阻断项，${validation.warnings.length}个提示项`)
  return {ontology:await getOntology(id,connection),validation}
}
async function rejectReferencedClass(connection,id,elementId,code){
  const [refs]=await connection.query('SELECT COUNT(*) AS total FROM ontology_elements WHERE ontology_id=? AND element_id<>? AND (owner_code=? OR target_code=?)',[id,elementId,code,code])
  if(Number(refs[0].total))throw Object.assign(new Error(`本体类 ${code} 已被属性、关系或事件引用，请先调整引用后再修改或删除`),{status:409})
}

function sendJson(res,status,data){const body=JSON.stringify(data);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body)});res.end(body)}
async function readBody(req){let body='';for await(const chunk of req){body+=chunk;if(body.length>1024*1024)throw Object.assign(new Error('请求内容过大'),{status:413})}return body?JSON.parse(body):{}}

async function createOntology(req,res){const payload=await readBody(req);const id=String(payload.id||'').trim().toUpperCase();if(!/^[A-Z0-9_-]{3,64}$/.test(id))return sendJson(res,400,{message:'本体编码只能包含大写字母、数字、下划线和中划线'});if(!String(payload.name||'').trim())return sendJson(res,400,{message:'本体名称不能为空'});try{await pool.query(`INSERT INTO ontologies (id,name,scope,domain,version,status,description) VALUES (?,?,?,?,?,'草稿',?)`,[id,String(payload.name).trim(),payload.scope||'领域扩展本体',payload.domain||'采购','v0.1',String(payload.description||'')]);await ontologyAudit(pool,id,'新建本体',`${payload.name} / ${payload.domain||'采购'}`);sendJson(res,201,await getOntology(id))}catch(error){if(error?.code==='ER_DUP_ENTRY')return sendJson(res,409,{message:`本体编码 ${id} 已存在`});throw error}}
async function updateOntology(req,res,id){const payload=await readBody(req);const current=await getOntology(id);if(!current)return sendJson(res,404,{message:'本体不存在'});if(current.status==='已发布')return sendJson(res,409,{message:'已发布本体不可直接修改，请复制新版本'});if(payload.name!==undefined&&!String(payload.name).trim())return sendJson(res,400,{message:'本体名称不能为空'});await pool.query('UPDATE ontologies SET name=?,scope=?,domain=?,description=? WHERE id=?',[payload.name??current.name,payload.scope??current.scope,payload.domain??current.domain,payload.description??current.description,id]);await ontologyAudit(pool,id,'保存本体草稿','更新基本信息');sendJson(res,200,await getOntology(id))}
async function copyOntology(res,id){const connection=await pool.getConnection();try{await connection.beginTransaction();const [rows]=await connection.query('SELECT * FROM ontologies WHERE id=? FOR UPDATE',[id]);if(!rows.length){await connection.rollback();return sendJson(res,404,{message:'本体不存在'})}const source=rows[0];const major=Number(String(source.version).replace(/^v/,'').split('.')[0])||0;const base=id.replace(/-DRAFT-[A-Z0-9]+$/,'');const nextId=`${base}-DRAFT-${Date.now().toString(36).toUpperCase()}`;await connection.query(`INSERT INTO ontologies (id,name,scope,domain,version,class_count,property_count,relation_count,event_count,status,description) VALUES (?,?,?,?,?,?,?,?,?,'草稿',?)`,[nextId,source.name,source.scope,source.domain,`v${major+1}.0`,source.class_count,source.property_count,source.relation_count,source.event_count,source.description]);await connection.query(`INSERT INTO ontology_elements (ontology_id,element_type,code,name,data_type,constraint_desc,description) SELECT ?,element_type,code,name,data_type,constraint_desc,description FROM ontology_elements WHERE ontology_id=?`,[nextId,id]);await ontologyAudit(connection,nextId,'复制本体版本',`${id} → ${nextId}`);await connection.commit();sendJson(res,201,await getOntology(nextId))}catch(error){await connection.rollback();throw error}finally{connection.release()}}
async function publishOntology(res,id){const current=await getOntology(id);if(!current)return sendJson(res,404,{message:'本体不存在'});if(current.classes<1)return sendJson(res,409,{message:'本体至少需要一个本体类才能发布'});await pool.query("UPDATE ontologies SET status='已发布' WHERE id=?",[id]);await ontologyAudit(pool,id,'发布本体版本',`${current.name} ${current.version}`);sendJson(res,200,await getOntology(id))}

const countColumns={class:'class_count',property:'property_count',relation:'relation_count',event:'event_count'}
async function addElement(req,res,id){const payload=await readBody(req);const current=await getOntology(id);if(!current)return sendJson(res,404,{message:'本体不存在'});if(current.status==='已发布')return sendJson(res,409,{message:'已发布本体不可新增元素'});if(!countColumns[payload.type])return sendJson(res,400,{message:'本体元素类型无效'});if(!String(payload.code||'').trim()||!String(payload.name||'').trim())return sendJson(res,400,{message:'元素编码和名称不能为空'});const connection=await pool.getConnection();try{await connection.beginTransaction();await connection.query('INSERT INTO ontology_elements (ontology_id,element_type,code,name,data_type,constraint_desc,description) VALUES (?,?,?,?,?,?,?)',[id,payload.type,String(payload.code).trim(),String(payload.name).trim(),String(payload.dataType||''),String(payload.constraint||''),String(payload.description||'')]);const column=countColumns[payload.type];await connection.query(`UPDATE ontologies SET ${column}=${column}+1 WHERE id=?`,[id]);await ontologyAudit(connection,id,'新增本体元素',`${payload.type} / ${payload.code}`);await connection.commit();sendJson(res,201,await getOntology(id))}catch(error){await connection.rollback();if(error?.code==='ER_DUP_ENTRY')return sendJson(res,409,{message:'同类型元素编码已存在'});throw error}finally{connection.release()}}
async function deleteElement(res,id,elementId){const current=await getOntology(id);if(!current)return sendJson(res,404,{message:'本体不存在'});if(current.status==='已发布')return sendJson(res,409,{message:'已发布本体不可删除元素'});const connection=await pool.getConnection();try{await connection.beginTransaction();const [rows]=await connection.query('SELECT * FROM ontology_elements WHERE ontology_id=? AND element_id=? FOR UPDATE',[id,elementId]);if(!rows.length){await connection.rollback();return sendJson(res,404,{message:'本体元素不存在'})}const column=countColumns[rows[0].element_type];await connection.query('DELETE FROM ontology_elements WHERE element_id=?',[elementId]);await connection.query(`UPDATE ontologies SET ${column}=GREATEST(${column}-1,0) WHERE id=?`,[id]);await ontologyAudit(connection,id,'删除本体元素',`${rows[0].element_type} / ${rows[0].code}`);await connection.commit();sendJson(res,200,await getOntology(id))}catch(error){await connection.rollback();throw error}finally{connection.release()}}
async function updateOntologyV2(req,res,id){
  const payload=await readBody(req)
  const current=await getOntology(id)
  if(!current)return sendJson(res,404,{message:'本体不存在'})
  if(current.status==='已发布')return sendJson(res,409,{message:'已发布本体不可直接修改，请复制新版本'})
  if(payload.name!==undefined&&!String(payload.name).trim())return sendJson(res,400,{message:'本体名称不能为空'})
  await pool.query("UPDATE ontologies SET name=?,scope=?,domain=?,description=?,status='草稿',validation_json=NULL WHERE id=?",[payload.name??current.name,payload.scope??current.scope,payload.domain??current.domain,payload.description??current.description,id])
  await ontologyAudit(pool,id,'保存本体草稿','更新基本信息')
  sendJson(res,200,await getOntology(id))
}

async function copyOntologyV2(res,id){
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction()
    const [rows]=await connection.query('SELECT * FROM ontologies WHERE id=? FOR UPDATE',[id])
    if(!rows.length){await connection.rollback();return sendJson(res,404,{message:'本体不存在'})}
    const source=rows[0]
    const major=Number(String(source.version).replace(/^v/,'').split('.')[0])||0
    const base=id.replace(/-DRAFT-[A-Z0-9]+$/,'')
    const nextId=`${base}-DRAFT-${Date.now().toString(36).toUpperCase()}`
    await connection.query(`INSERT INTO ontologies (id,name,scope,domain,version,source_version_id,class_count,property_count,relation_count,event_count,status,description) VALUES (?,?,?,?,?,?,?,?,?,?,'草稿',?)`,[nextId,source.name,source.scope,source.domain,`v${major+1}.0`,id,source.class_count,source.property_count,source.relation_count,source.event_count,source.description])
    await connection.query(`INSERT INTO ontology_elements (ontology_id,element_type,code,name,owner_code,target_code,data_type,constraint_desc,description) SELECT ?,element_type,code,name,owner_code,target_code,data_type,constraint_desc,description FROM ontology_elements WHERE ontology_id=?`,[nextId,id])
    await syncOntologyCounts(connection,nextId)
    await ontologyAudit(connection,nextId,'复制本体版本',`${id} → ${nextId}`)
    await connection.commit()
    sendJson(res,201,await getOntology(nextId))
  }catch(error){await connection.rollback();throw error}finally{connection.release()}
}

async function validateOntologyV2(res,id){
  const result=await validateOntologyVersion(pool,id)
  if(!result)return sendJson(res,404,{message:'本体不存在'})
  sendJson(res,200,result)
}

async function publishOntologyV2(res,id){
  const current=await getOntology(id)
  if(!current)return sendJson(res,404,{message:'本体不存在'})
  if(current.status!=='待校验')return sendJson(res,409,{message:'请先完成本体校验，校验通过后才能发布'})
  const validation=validateOntologyRecord(current)
  if(validation.blockers.length){
    await pool.query("UPDATE ontologies SET status='草稿',validation_json=? WHERE id=?",[toJson(validation),id])
    return sendJson(res,409,{message:'本体校验未通过，不能发布',validation})
  }
  await pool.query("UPDATE ontologies SET status='已发布',validation_json=?,published_at=NOW() WHERE id=?",[toJson(validation),id])
  await ontologyAudit(pool,id,'发布本体版本',`${current.name} ${current.version}`)
  sendJson(res,200,await getOntology(id))
}

async function addElementV2(req,res,id){
  const payload=normalizeElementPayload(await readBody(req))
  const current=await getOntology(id)
  if(!current)return sendJson(res,404,{message:'本体不存在'})
  if(current.status==='已发布')return sendJson(res,409,{message:'已发布本体不可新增元素'})
  if(!countColumns[payload.type])return sendJson(res,400,{message:'本体元素类型无效'})
  if(!payload.code||!payload.name)return sendJson(res,400,{message:'元素编码和名称不能为空'})
  if(!elementCodePattern.test(payload.code))return sendJson(res,400,{message:'元素编码格式无效，例如 PROC.Supplier.phone'})
  const owner=payload.type==='class'?'':payload.ownerCode
  const target=payload.type==='relation'?payload.targetCode:''
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction()
    await connection.query('INSERT INTO ontology_elements (ontology_id,element_type,code,name,owner_code,target_code,data_type,constraint_desc,description) VALUES (?,?,?,?,?,?,?,?,?)',[id,payload.type,payload.code,payload.name,owner,target,payload.dataType,payload.constraint,payload.description])
    await resetOntologyDraft(connection,id)
    await syncOntologyCounts(connection,id)
    await ontologyAudit(connection,id,'新增本体元素',`${payload.type} / ${payload.code}`)
    await connection.commit()
    sendJson(res,201,await getOntology(id))
  }catch(error){await connection.rollback();if(error?.code==='ER_DUP_ENTRY')return sendJson(res,409,{message:'同类型元素编码已存在'});throw error}finally{connection.release()}
}

async function updateElementV2(req,res,id,elementId){
  const payload=await readBody(req)
  const current=await getOntology(id)
  if(!current)return sendJson(res,404,{message:'本体不存在'})
  if(current.status==='已发布')return sendJson(res,409,{message:'已发布本体不可编辑元素'})
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction()
    const [rows]=await connection.query('SELECT * FROM ontology_elements WHERE ontology_id=? AND element_id=? FOR UPDATE',[id,elementId])
    if(!rows.length){await connection.rollback();return sendJson(res,404,{message:'本体元素不存在'})}
    const row=rows[0]
    if(payload.type&&payload.type!==row.element_type){await connection.rollback();return sendJson(res,400,{message:'元素类型不可修改，请删除后重新新增'})}
    const next=normalizeElementPayload({type:row.element_type,code:payload.code??row.code,name:payload.name??row.name,ownerCode:payload.ownerCode??row.owner_code,targetCode:payload.targetCode??row.target_code,dataType:payload.dataType??row.data_type,constraint:payload.constraint??row.constraint_desc,description:payload.description??row.description},row.element_type)
    if(!next.code||!next.name){await connection.rollback();return sendJson(res,400,{message:'元素编码和名称不能为空'})}
    if(!elementCodePattern.test(next.code)){await connection.rollback();return sendJson(res,400,{message:'元素编码格式无效，例如 PROC.Supplier.phone'})}
    if(row.element_type==='class'&&next.code!==row.code)await rejectReferencedClass(connection,id,elementId,row.code)
    await connection.query('UPDATE ontology_elements SET code=?,name=?,owner_code=?,target_code=?,data_type=?,constraint_desc=?,description=? WHERE ontology_id=? AND element_id=?',[next.code,next.name,row.element_type==='class'?'':next.ownerCode,row.element_type==='relation'?next.targetCode:'',next.dataType,next.constraint,next.description,id,elementId])
    await resetOntologyDraft(connection,id)
    await syncOntologyCounts(connection,id)
    await ontologyAudit(connection,id,'编辑本体元素',`${row.element_type} / ${next.code}`)
    await connection.commit()
    sendJson(res,200,await getOntology(id))
  }catch(error){await connection.rollback();if(error?.code==='ER_DUP_ENTRY')return sendJson(res,409,{message:'同类型元素编码已存在'});throw error}finally{connection.release()}
}

async function deleteElementV2(res,id,elementId){
  const current=await getOntology(id)
  if(!current)return sendJson(res,404,{message:'本体不存在'})
  if(current.status==='已发布')return sendJson(res,409,{message:'已发布本体不可删除元素'})
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction()
    const [rows]=await connection.query('SELECT * FROM ontology_elements WHERE ontology_id=? AND element_id=? FOR UPDATE',[id,elementId])
    if(!rows.length){await connection.rollback();return sendJson(res,404,{message:'本体元素不存在'})}
    if(rows[0].element_type==='class')await rejectReferencedClass(connection,id,elementId,rows[0].code)
    await connection.query('DELETE FROM ontology_elements WHERE element_id=?',[elementId])
    await resetOntologyDraft(connection,id)
    await syncOntologyCounts(connection,id)
    await ontologyAudit(connection,id,'删除本体元素',`${rows[0].element_type} / ${rows[0].code}`)
    await connection.commit()
    sendJson(res,200,await getOntology(id))
  }catch(error){await connection.rollback();throw error}finally{connection.release()}
}

async function deleteOntologyV2(res,id){
  const current=await getOntology(id)
  if(!current)return sendJson(res,404,{message:'本体不存在'})
  if(current.status==='已发布')return sendJson(res,409,{message:'已发布本体不可删除，请保留版本追溯链路'})
  const [[ruleRefs],[graphRefs]]=await Promise.all([
    pool.query('SELECT COUNT(*) AS total FROM rule_asset_versions WHERE ontology_id=?',[id]),
    pool.query('SELECT COUNT(*) AS total FROM graph_versions WHERE ontology_id=?',[id]),
  ])
  const references=Number(ruleRefs[0].total)+Number(graphRefs[0].total)
  if(references>0)return sendJson(res,409,{message:`该本体仍被${references}个规则或图谱版本引用，不能删除`})
  await ontologyAudit(pool,id,'删除本体草稿',`${current.name} ${current.version}`)
  await pool.query('DELETE FROM ontologies WHERE id=?',[id])
  sendJson(res,200,{ok:true,message:'本体草稿已删除'})
}

async function handleApi(req,res,url){
  if(url.pathname==='/api/health'&&req.method==='GET')return sendJson(res,200,{ok:true,database})
  if(await handleSceneRuleApi(req,res,url,{pool,sendJson,readBody}))return
  if(await handleDataGraphApi(req,res,url,{pool,sendJson,readBody}))return
  if(url.pathname==='/api/ontologies'&&req.method==='GET')return sendJson(res,200,await listOntologies())
  if(url.pathname==='/api/ontologies'&&req.method==='POST')return createOntology(req,res)
  const element=url.pathname.match(/^\/api\/ontologies\/([^/]+)\/elements(?:\/([^/]+))?$/);if(element){const id=decodeURIComponent(element[1]);if(req.method==='POST'&&!element[2])return addElementV2(req,res,id);if(req.method==='PUT'&&element[2])return updateElementV2(req,res,id,decodeURIComponent(element[2]));if(req.method==='DELETE'&&element[2])return deleteElementV2(res,id,decodeURIComponent(element[2]))}
  const action=url.pathname.match(/^\/api\/ontologies\/([^/]+)\/(copy|publish|validate)$/);if(action&&req.method==='POST')return action[2]==='copy'?copyOntologyV2(res,decodeURIComponent(action[1])):action[2]==='validate'?validateOntologyV2(res,decodeURIComponent(action[1])):publishOntologyV2(res,decodeURIComponent(action[1]))
  const item=url.pathname.match(/^\/api\/ontologies\/([^/]+)$/);if(item){const id=decodeURIComponent(item[1]);if(req.method==='GET'){const result=await getOntology(id);return sendJson(res,result?200:404,result||{message:'本体不存在'})}if(req.method==='PUT')return updateOntologyV2(req,res,id);if(req.method==='DELETE')return deleteOntologyV2(res,id)}
  sendJson(res,404,{message:'接口不存在'})
}

const mimeTypes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.json':'application/json; charset=utf-8'}
function serveProduction(res,url){const dist=resolve(root,'dist');const relative=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'index.html';let file=resolve(dist,relative);if(!file.startsWith(dist)||!existsSync(file))file=resolve(dist,'index.html');res.writeHead(200,{'Content-Type':mimeTypes[extname(file)]||'application/octet-stream'});createReadStream(file).pipe(res)}

await initializeDatabase()
const devMode=process.argv.includes('--dev');const vite=devMode?await(await import('vite')).createServer({server:{middlewareMode:true},appType:'spa'}):null;const port=Number(process.env.APP_PORT||4173)
const server=http.createServer(async(req,res)=>{const url=new URL(req.url||'/',`http://${req.headers.host||'127.0.0.1'}`);try{if(url.pathname.startsWith('/api/'))return await handleApi(req,res,url);if(vite)return vite.middlewares(req,res,()=>sendJson(res,404,{message:'页面不存在'}));serveProduction(res,url)}catch(error){console.error('[request-error]',error?.message||error);if(!res.headersSent)sendJson(res,Number(error?.status)||500,{message:error?.message||'服务处理失败，请检查数据库连接或请求内容'});else res.end()}})
server.listen(port,'127.0.0.1',()=>{console.log(`穿透式监管服务已启动：http://127.0.0.1:${port}`);console.log(`MySQL业务库已就绪：${database}`)})
async function shutdown(){await vite?.close();await pool?.end();server.close(()=>process.exit(0))}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown)
