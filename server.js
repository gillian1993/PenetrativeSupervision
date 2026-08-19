import http from 'node:http'
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import { initializeSceneRuleDatabase } from './sceneRuleService.js'
import { handleSceneRuleApi } from './sceneRuleRouter.js'
import { initializeDataGraphDatabase, handleDataGraphApi } from './dataGraphApi.js'
import { handleDemoReadApi } from './demoReadApi.js'
import { initializeRuleCatalogDatabase } from './ruleCatalogService.js'
import { handleRuleCatalogApi } from './ruleCatalogRouter.js'
import { handleSuperAgentApi } from './superAgentRouter.js'

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
  ['ONT-BASE','平台基础图谱结构','基础图谱结构','通用','v1.6',14,126,28,32,'已发布','统一组织、人员、主体、账户、文档、预警和风险事件的基础语义。'],
  ['ONT-PROC','采购监管扩展图谱结构','领域图谱结构','采购','v2.2',12,94,21,18,'已发布','覆盖供应商、采购项目、投标、评审和中标确认等采购监管对象。'],
  ['ONT-CONTRACT','合同监管扩展图谱结构','领域图谱结构','合同','v1.4',8,67,16,14,'已发布','覆盖合同签订、履约、变更、验收和结算事件。'],
  ['ONT-FIN','财务资金扩展图谱结构','领域图谱结构','财务','v1.1',10,88,19,21,'待校验','覆盖付款、账户、资金流水、融资和担保关系。'],
]
const initialElements=[
  ['ONT-PROC','class','PROC.Supplier','供应商','实体类型','统一社会信用代码为主标识','参与采购、合同或服务活动的业务主体。'],
  ['ONT-PROC','class','PROC.Reviewer','评审人员','实体类型','人员编码为主标识','参与采购评审的专家或业务人员。'],
  ['ONT-PROC','class','PROC.Contract','合同','实体类型','合同编码为主标识','采购结果形成的合同对象。'],
  ['ONT-PROC','class','PROC.PurchaseProject','采购项目','实体类型','项目编码为主标识','采购立项、评审与中标的核心对象。'],
  ['ONT-PROC','class','PROC.Contact','联系方式','实体类型','联系方式标准化值为主标识','用于识别多个主体共同使用的联系方式。'],
  ['ONT-PROC','property','PROC.Supplier.credit_code','统一社会信用代码','文本','主标识、必填','供应商工商登记主标识。'],
  ['ONT-PROC','property','PROC.Supplier.phone','供应商联系电话','文本','手机号或固话','供应商登记联系方式。'],
  ['ONT-PROC','property','PROC.Reviewer.phone','评审人员联系电话','文本','脱敏比对','评审人员登记联系方式。'],
  ['ONT-PROC','property','PROC.Contract.change_rate','合同金额变更比例','数字','百分比','合同金额相对中标金额的变化比例。'],
  ['ONT-PROC','property','PROC.Contract.change_amount','合同变更金额','金额','人民币','合同累计变更金额。'],
  ['ONT-PROC','property','PROC.Contact.valid_time','关系有效时间','日期时间','标准时间','主体联系方式关系的有效时间。'],
  ['ONT-PROC','property','PROC.BidConfirmed.event_id','中标确认记录编号','文本','主标识、必填','中标确认节点实例的稳定标识。'],
  ['ONT-PROC','property','PROC.BidConfirmed.occurred_at','中标确认发生时间','日期时间','必填、发生时间','中标确认实际发生的业务时间。'],
  ['ONT-PROC','property','PROC.ContractChanged.event_id','合同变更记录编号','文本','主标识、必填','合同变更节点实例的稳定标识。'],
  ['ONT-PROC','property','PROC.ContractChanged.occurred_at','合同变更发生时间','日期时间','必填、发生时间','合同变更实际发生的业务时间。'],
  ['ONT-PROC','property','PROC.PurchaseCreated.event_id','采购立项记录编号','文本','主标识、必填','采购立项节点实例的稳定标识。'],
  ['ONT-PROC','property','PROC.PurchaseCreated.occurred_at','采购立项发生时间','日期时间','必填、发生时间','采购立项实际发生的业务时间。'],
  ['ONT-PROC','relation','PROC.supplier_contact','登记联系方式','供应商 → 联系方式','一对多','供应商登记或使用联系方式。'],
  ['ONT-PROC','relation','PROC.shared_contact','共同使用','联系方式 → 评审人员','多对多','多个主体共同使用同一联系方式。'],
  ['ONT-PROC','relation','PROC.actual_control','实际控制','供应商 → 人员','多对多','供应商实际控制关系。'],
  ['ONT-PROC','relation','PROC.bid_confirmed_project','所属采购项目','中标确认 → 采购项目','多对一、参与对象','中标确认节点实例关联对应采购项目。'],
  ['ONT-PROC','relation','PROC.contract_changed_contract','变更合同','合同变更 → 合同','多对一、参与对象','合同变更节点实例关联被变更合同。'],
  ['ONT-PROC','relation','PROC.purchase_created_project','立项项目','采购立项 → 采购项目','一对一、参与对象','采购立项节点实例关联对应采购项目。'],
  ['ONT-PROC','class','PROC.BidConfirmed','中标确认','实体类型','发生时间必填','采购项目确认中标结果的业务记录。'],
  ['ONT-PROC','class','PROC.ContractChanged','合同变更','实体类型','发生时间必填','合同金额或关键条款发生变更的业务记录。'],
  ['ONT-PROC','class','PROC.PurchaseCreated','采购立项','实体类型','发生时间必填','采购项目完成立项的业务记录。'],
]

let pool

async function ensureColumn(table,column,definition){
  const [rows]=await pool.query('SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?',[database,table,column])
  if(!Number(rows[0].total))await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`)
}

async function columnExists(table,column){
  const [rows]=await pool.query('SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?',[database,table,column])
  return Number(rows[0].total)>0
}

async function dropColumnIfExists(table,column){
  if(await columnExists(table,column))await pool.query('ALTER TABLE '+table+' DROP COLUMN '+column)
}

async function syncOntologyCounts(connection=pool,id=''){
  const where=id?' WHERE id=?':'';const params=id?[id]:[]
  await connection.query(`UPDATE ontologies o SET
    class_count=(SELECT COUNT(*) FROM ontology_elements e WHERE e.ontology_id=o.id AND e.element_type='class'),
    property_count=(SELECT COUNT(*) FROM ontology_elements e WHERE e.ontology_id=o.id AND e.element_type='property'),
    relation_count=(SELECT COUNT(*) FROM ontology_elements e WHERE e.ontology_id=o.id AND e.element_type='relation'),
    event_count=0${where}`,params)
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
    operator_name VARCHAR(80) NOT NULL DEFAULT '尹晨阳',created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,KEY idx_ontology_audit (ontology_id,created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await ensureColumn('ontologies','source_version_id','source_version_id VARCHAR(64) NULL AFTER version')
  await ensureColumn('ontologies','validation_json','validation_json JSON NULL AFTER description')
  await ensureColumn('ontologies','published_at','published_at TIMESTAMP NULL AFTER validation_json')
  await ensureColumn('ontology_elements','owner_code','owner_code VARCHAR(120) NOT NULL DEFAULT \'\' AFTER name')
  await ensureColumn('ontology_elements','target_code','target_code VARCHAR(120) NOT NULL DEFAULT \'\' AFTER owner_code')
  await pool.query("UPDATE ontology_elements SET element_type='class',owner_code='',target_code='',data_type='实体类型' WHERE element_type='event'")
  await pool.query("UPDATE ontology_elements SET data_type='实体类型' WHERE element_type='class'")
  await pool.query("UPDATE ontology_elements SET constraint_desc='发生时间必填' WHERE element_type='class' AND constraint_desc IN ('起始事件','前置事件','目标事件','履约事件','结算事件','事后事件','监管事件','评标事件')")
  await pool.query("UPDATE ontology_elements SET name=REPLACE(name,'事件编号','记录编号'),constraint_desc=REPLACE(constraint_desc,'事件时间','发生时间'),description=REPLACE(REPLACE(description,'事件实例','节点实例'),'事件关联','节点实例关联') WHERE element_type IN ('property','relation')")
  await dropColumnIfExists('ontology_elements','class_kind')
  for(const item of initialOntologies)await pool.query(`INSERT IGNORE INTO ontologies (id,name,scope,domain,version,class_count,property_count,relation_count,event_count,status,description) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,item)
  for(const item of initialElements)await pool.query('INSERT IGNORE INTO ontology_elements (ontology_id,element_type,code,name,data_type,constraint_desc,description) VALUES (?,?,?,?,?,?,?)',item)
  const elementReferences=[
    ['PROC.Supplier.credit_code','PROC.Supplier',''],['PROC.Supplier.phone','PROC.Supplier',''],['PROC.Reviewer.phone','PROC.Reviewer',''],
    ['PROC.Contract.change_rate','PROC.Contract',''],['PROC.Contract.change_amount','PROC.Contract',''],['PROC.Contact.valid_time','PROC.Contact',''],
    ['PROC.supplier_contact','PROC.Supplier','PROC.Contact'],['PROC.shared_contact','PROC.Contact','PROC.Reviewer'],['PROC.actual_control','PROC.Supplier','PROC.Reviewer'],
    ['PROC.BidConfirmed.event_id','PROC.BidConfirmed',''],['PROC.BidConfirmed.occurred_at','PROC.BidConfirmed',''],
    ['PROC.ContractChanged.event_id','PROC.ContractChanged',''],['PROC.ContractChanged.occurred_at','PROC.ContractChanged',''],
    ['PROC.PurchaseCreated.event_id','PROC.PurchaseCreated',''],['PROC.PurchaseCreated.occurred_at','PROC.PurchaseCreated',''],
    ['PROC.participate','PROC.Supplier','PROC.PurchaseProject'],
    ['PROC.bid_confirmed_project','PROC.BidConfirmed','PROC.PurchaseProject'],['PROC.contract_changed_contract','PROC.ContractChanged','PROC.Contract'],['PROC.purchase_created_project','PROC.PurchaseCreated','PROC.PurchaseProject'],
  ]
  for(const [code,owner,target] of elementReferences)await pool.query("UPDATE ontology_elements SET owner_code=IF(owner_code='',?,owner_code),target_code=IF(target_code='',?,target_code) WHERE ontology_id='ONT-PROC' AND code=?",[owner,target,code])
  await syncOntologyCounts()
  await pool.query("UPDATE ontologies SET status='草稿',validation_json=NULL,published_at=NULL WHERE status IN ('待校验','已发布') AND class_count=0")
  await initializeSceneRuleDatabase(pool)
  await initializeRuleCatalogDatabase(pool)
  await initializeDataGraphDatabase(pool)
}

const formatTime=(value)=>value instanceof Date?value.toLocaleString('zh-CN',{hour12:false}).replaceAll('/','-'):String(value||'')
const parseJson=(value,fallback)=>{if(value===null||value===undefined||value==='')return fallback;if(typeof value==='object')return value;try{return JSON.parse(value)}catch{return fallback}}
const toJson=(value)=>JSON.stringify(value??null)
const mapElement=(row)=>({id:String(row.element_id),type:row.element_type,code:row.code,name:row.name,ownerCode:row.owner_code||'',targetCode:row.target_code||'',dataType:row.element_type==='class'?'实体类型':row.data_type,constraint:row.constraint_desc,description:row.description})
const mapOntology=(row,elements=[])=>{
  const count=(type)=>elements.filter((item)=>item.type===type).length
  return {id:row.id,name:row.name,scope:row.scope,domain:row.domain,version:row.version,sourceVersionId:row.source_version_id||'',classes:count('class'),properties:count('property'),relations:count('relation'),events:0,status:row.status,description:row.description,validation:parseJson(row.validation_json,{blockers:[],warnings:[],validatedAt:''}),publishedAt:formatTime(row.published_at),updatedAt:formatTime(row.updated_at),elements}
}

async function getOntology(id,connection=pool){const [rows]=await connection.query('SELECT * FROM ontologies WHERE id=?',[id]);if(!rows.length)return null;const [elements]=await connection.query('SELECT * FROM ontology_elements WHERE ontology_id=? ORDER BY element_type,element_id',[id]);return mapOntology(rows[0],elements.map(mapElement))}
async function listOntologies(){const [rows]=await pool.query("SELECT * FROM ontologies WHERE status<>'已删除' ORDER BY updated_at DESC,id ASC");const [elements]=await pool.query('SELECT * FROM ontology_elements ORDER BY element_type,element_id');const grouped=new Map();for(const element of elements){if(!grouped.has(element.ontology_id))grouped.set(element.ontology_id,[]);grouped.get(element.ontology_id).push(mapElement(element))}return rows.map((row)=>mapOntology(row,grouped.get(row.id)||[]))}
async function ontologyAudit(connection,id,action,summary){await connection.query('INSERT INTO ontology_audits (ontology_id,action,summary) VALUES (?,?,?)',[id,action,summary])}
const lockedOntologyStatuses=new Set(['已发布','已下架','已删除'])
function isLockedOntologyStatus(status){return lockedOntologyStatuses.has(status)}
function lockedOntologyMessage(status,action){return status==='已下架'?`已下架图谱结构不可${action}，请复制新版本`:status==='已删除'?`已删除图谱结构不可${action}`:`已发布图谱结构不可${action}，请复制新版本`}
async function ontologyReferenceSummary(connection,id){
  const checks=[
    {label:'数据源',sql:'SELECT COUNT(DISTINCT source_id) AS total FROM data_source_structures WHERE ontology_id=?'},
    {label:'知识图谱',sql:'SELECT COUNT(*) AS total FROM graph_versions WHERE ontology_id=?'},
    {label:'风险场景',sql:'SELECT COUNT(*) AS total FROM scene_versions WHERE ontology_id=?'},
    {label:'规则',sql:'SELECT COUNT(*) AS total FROM rule_asset_versions WHERE ontology_id=?'},
  ]
  let total=0;const parts=[]
  for(const item of checks){const [rows]=await connection.query(item.sql,[id]);const count=Number(rows[0]?.total||0);if(count>0)parts.push(`${item.label}${count}个`);total+=count}
  return {total,summary:parts.length?parts.join('、'):'无引用'}
}

function normalizeElementPayload(payload,typeFallback=''){
  const requestedType=String(payload.type||typeFallback||'').trim()
  const type=requestedType==='event'?'class':requestedType
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
  if(!ontology.elements.some((item)=>item.type==='class'))blockers.push({field:'classes',tab:'class',message:'至少需要定义一个实体类型'})
  for(const element of ontology.elements){
    if(!String(element.name||'').trim())blockers.push({field:element.id,tab:element.type,message:`${element.code} 的中文名称不能为空`})
    if(element.type==='property'){
      if(!element.ownerCode)blockers.push({field:element.id,tab:'property',message:`属性字段 ${element.name} 必须选择所属实体类型`})
      else if(!classCodes.has(element.ownerCode))blockers.push({field:element.id,tab:'property',message:`属性字段 ${element.name} 的所属实体类型不存在`})
    }
    if(element.type==='relation'){
      if(!element.ownerCode||!element.targetCode)blockers.push({field:element.id,tab:'relation',message:`关系类型 ${element.name} 必须选择起点实体类型和终点实体类型`})
      else {
        if(!classCodes.has(element.ownerCode))blockers.push({field:element.id,tab:'relation',message:`关系类型 ${element.name} 的起点实体类型不存在`})
        if(!classCodes.has(element.targetCode))blockers.push({field:element.id,tab:'relation',message:`关系类型 ${element.name} 的终点实体类型不存在`})
      }
    }
  }
  if(!ontology.elements.some((item)=>item.type==='property'&&/主标识/.test(item.constraint||'')))warnings.push({field:'identity',tab:'property',message:'建议至少配置一个标记为“主标识”的属性字段，便于图谱实例识别'})
  return {blockers,warnings,validatedAt:new Date().toISOString()}
}
async function resetOntologyDraft(connection,id){
  await connection.query("UPDATE ontologies SET status='草稿',validation_json=NULL,published_at=NULL WHERE id=?",[id])
}
async function validateOntologyVersion(connection,id){
  const ontology=await getOntology(id,connection);if(!ontology)return null
  const validation=validateOntologyRecord(ontology)
  await connection.query('UPDATE ontologies SET validation_json=?,status=? WHERE id=?',[toJson(validation),validation.blockers.length?'草稿':'待校验',id])
  await ontologyAudit(connection,id,'校验图谱结构版本',`${validation.blockers.length}个阻断项，${validation.warnings.length}个提示项`)
  return {ontology:await getOntology(id,connection),validation}
}
async function rejectReferencedClass(connection,id,elementId,code){
  const [refs]=await connection.query('SELECT COUNT(*) AS total FROM ontology_elements WHERE ontology_id=? AND element_id<>? AND (owner_code=? OR target_code=?)',[id,elementId,code,code])
  if(Number(refs[0].total))throw Object.assign(new Error(`实体类型 ${code} 已被属性字段或关系类型引用，请先调整引用后再修改或删除`),{status:409})
}

function sendJson(res,status,data){const body=JSON.stringify(data);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body)});res.end(body)}
async function readBody(req){let body='';for await(const chunk of req){body+=chunk;if(body.length>1024*1024)throw Object.assign(new Error('请求内容过大'),{status:413})}return body?JSON.parse(body):{}}

async function createOntology(req,res){
  const payload=await readBody(req)
  const name=String(payload.name||'').trim();if(!name)return sendJson(res,400,{message:'结构名称不能为空'})
  const domain=String(payload.domain||'采购').trim()||'采购'
  const domainCode={通用:'BASE',采购:'PROC',合同:'CONTRACT',财务:'FIN',投资:'INVEST'}[domain]||domain.toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'')||'CUSTOM'
  const id=String(payload.id||`ONT-${domainCode}-${Date.now().toString(36).toUpperCase()}`).trim().toUpperCase()
  if(!/^[A-Z0-9_-]{3,64}$/.test(id))return sendJson(res,400,{message:'结构编码只能包含大写字母、数字、下划线和中划线'})
  try{await pool.query(`INSERT INTO ontologies (id,name,scope,domain,version,status,description) VALUES (?,?,?,?,?,'草稿',?)`,[id,name,payload.scope||'领域图谱结构',domain,'v0.1',String(payload.description||'')]);await ontologyAudit(pool,id,'新建图谱结构',`${name} / ${domain}`);sendJson(res,201,await getOntology(id))}catch(error){if(error?.code==='ER_DUP_ENTRY')return sendJson(res,409,{message:`结构编码 ${id} 已存在`});throw error}
}
async function updateOntology(req,res,id){const payload=await readBody(req);const current=await getOntology(id);if(!current)return sendJson(res,404,{message:'图谱结构不存在'});if(isLockedOntologyStatus(current.status))return sendJson(res,409,{message:lockedOntologyMessage(current.status,'直接修改')});if(payload.name!==undefined&&!String(payload.name).trim())return sendJson(res,400,{message:'结构名称不能为空'});await pool.query('UPDATE ontologies SET name=?,scope=?,domain=?,description=? WHERE id=?',[payload.name??current.name,payload.scope??current.scope,payload.domain??current.domain,payload.description??current.description,id]);await ontologyAudit(pool,id,'保存图谱结构草稿','更新基本信息');sendJson(res,200,await getOntology(id))}
async function copyOntology(res,id){const connection=await pool.getConnection();try{await connection.beginTransaction();const [rows]=await connection.query('SELECT * FROM ontologies WHERE id=? FOR UPDATE',[id]);if(!rows.length){await connection.rollback();return sendJson(res,404,{message:'图谱结构不存在'})}const source=rows[0];const major=Number(String(source.version).replace(/^v/,'').split('.')[0])||0;const base=id.replace(/-DRAFT-[A-Z0-9]+$/,'');const nextId=`${base}-DRAFT-${Date.now().toString(36).toUpperCase()}`;await connection.query(`INSERT INTO ontologies (id,name,scope,domain,version,class_count,property_count,relation_count,event_count,status,description) VALUES (?,?,?,?,?,?,?,?,?,'草稿',?)`,[nextId,source.name,source.scope,source.domain,`v${major+1}.0`,source.class_count,source.property_count,source.relation_count,source.event_count,source.description]);await connection.query(`INSERT INTO ontology_elements (ontology_id,element_type,code,name,data_type,constraint_desc,description) SELECT ?,element_type,code,name,data_type,constraint_desc,description FROM ontology_elements WHERE ontology_id=?`,[nextId,id]);await ontologyAudit(connection,nextId,'复制图谱结构版本',`${id} → ${nextId}`);await connection.commit();sendJson(res,201,await getOntology(nextId))}catch(error){await connection.rollback();throw error}finally{connection.release()}}
async function publishOntology(res,id){const current=await getOntology(id);if(!current)return sendJson(res,404,{message:'图谱结构不存在'});if(current.classes<1)return sendJson(res,409,{message:'图谱结构至少需要一个实体类型才能发布'});await pool.query("UPDATE ontologies SET status='已发布' WHERE id=?",[id]);await ontologyAudit(pool,id,'发布图谱结构版本',`${current.name} ${current.version}`);sendJson(res,200,await getOntology(id))}

const countColumns={class:'class_count',property:'property_count',relation:'relation_count'}
async function addElement(req,res,id){const payload=await readBody(req);const current=await getOntology(id);if(!current)return sendJson(res,404,{message:'图谱结构不存在'});if(isLockedOntologyStatus(current.status))return sendJson(res,409,{message:lockedOntologyMessage(current.status,'新增元素')});if(!countColumns[payload.type])return sendJson(res,400,{message:'结构元素类型无效'});if(!String(payload.code||'').trim()||!String(payload.name||'').trim())return sendJson(res,400,{message:'元素编码和名称不能为空'});const connection=await pool.getConnection();try{await connection.beginTransaction();await connection.query('INSERT INTO ontology_elements (ontology_id,element_type,code,name,data_type,constraint_desc,description) VALUES (?,?,?,?,?,?,?)',[id,payload.type,String(payload.code).trim(),String(payload.name).trim(),String(payload.dataType||''),String(payload.constraint||''),String(payload.description||'')]);const column=countColumns[payload.type];await connection.query(`UPDATE ontologies SET ${column}=${column}+1 WHERE id=?`,[id]);await ontologyAudit(connection,id,'新增结构元素',`${payload.type} / ${payload.code}`);await connection.commit();sendJson(res,201,await getOntology(id))}catch(error){await connection.rollback();if(error?.code==='ER_DUP_ENTRY')return sendJson(res,409,{message:'同类型元素编码已存在'});throw error}finally{connection.release()}}
async function deleteElement(res,id,elementId){const current=await getOntology(id);if(!current)return sendJson(res,404,{message:'图谱结构不存在'});if(isLockedOntologyStatus(current.status))return sendJson(res,409,{message:lockedOntologyMessage(current.status,'删除元素')});const connection=await pool.getConnection();try{await connection.beginTransaction();const [rows]=await connection.query('SELECT * FROM ontology_elements WHERE ontology_id=? AND element_id=? FOR UPDATE',[id,elementId]);if(!rows.length){await connection.rollback();return sendJson(res,404,{message:'结构元素不存在'})}const column=countColumns[rows[0].element_type];await connection.query('DELETE FROM ontology_elements WHERE element_id=?',[elementId]);await connection.query(`UPDATE ontologies SET ${column}=GREATEST(${column}-1,0) WHERE id=?`,[id]);await ontologyAudit(connection,id,'删除结构元素',`${rows[0].element_type} / ${rows[0].code}`);await connection.commit();sendJson(res,200,await getOntology(id))}catch(error){await connection.rollback();throw error}finally{connection.release()}}
async function updateOntologyV2(req,res,id){
  const payload=await readBody(req)
  const current=await getOntology(id)
  if(!current)return sendJson(res,404,{message:'图谱结构不存在'})
  if(isLockedOntologyStatus(current.status))return sendJson(res,409,{message:lockedOntologyMessage(current.status,'直接修改')})
  if(payload.name!==undefined&&!String(payload.name).trim())return sendJson(res,400,{message:'结构名称不能为空'})
  await pool.query("UPDATE ontologies SET name=?,scope=?,domain=?,description=?,status='草稿',validation_json=NULL WHERE id=?",[payload.name??current.name,payload.scope??current.scope,payload.domain??current.domain,payload.description??current.description,id])
  await ontologyAudit(pool,id,'保存图谱结构草稿','更新基本信息')
  sendJson(res,200,await getOntology(id))
}

async function copyOntologyV2(res,id){
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction()
    const [rows]=await connection.query('SELECT * FROM ontologies WHERE id=? FOR UPDATE',[id])
    if(!rows.length){await connection.rollback();return sendJson(res,404,{message:'图谱结构不存在'})}
    const source=rows[0]
    if(source.status==='已删除'){await connection.rollback();return sendJson(res,404,{message:'图谱结构不存在'})}
    const major=Number(String(source.version).replace(/^v/,'').split('.')[0])||0
    const base=id.replace(/-DRAFT-[A-Z0-9]+$/,'')
    const nextId=`${base}-DRAFT-${Date.now().toString(36).toUpperCase()}`
    await connection.query(`INSERT INTO ontologies (id,name,scope,domain,version,source_version_id,class_count,property_count,relation_count,event_count,status,description) VALUES (?,?,?,?,?,?,?,?,?,?,'草稿',?)`,[nextId,source.name,source.scope,source.domain,`v${major+1}.0`,id,source.class_count,source.property_count,source.relation_count,source.event_count,source.description])
    await connection.query('INSERT INTO ontology_elements (ontology_id,element_type,code,name,owner_code,target_code,data_type,constraint_desc,description) SELECT ?,element_type,code,name,owner_code,target_code,data_type,constraint_desc,description FROM ontology_elements WHERE ontology_id=?',[nextId,id])
    await syncOntologyCounts(connection,nextId)
    await ontologyAudit(connection,nextId,'复制图谱结构版本',`${id} → ${nextId}`)
    await connection.commit()
    sendJson(res,201,await getOntology(nextId))
  }catch(error){await connection.rollback();throw error}finally{connection.release()}
}

async function validateOntologyV2(res,id){
  const current=await getOntology(id)
  if(!current)return sendJson(res,404,{message:'图谱结构不存在'})
  if(current.status!=='草稿')return sendJson(res,409,{message:'只有草稿图谱结构可以发起校验'})
  const result=await validateOntologyVersion(pool,id)
  sendJson(res,200,result)
}
async function publishOntologyV2(res,id){
  const current=await getOntology(id)
  if(!current)return sendJson(res,404,{message:'图谱结构不存在'})
  if(current.status!=='待校验')return sendJson(res,409,{message:'请先完成图谱结构校验，校验通过后才能发布'})
  const validation=validateOntologyRecord(current)
  if(validation.blockers.length){
    await pool.query("UPDATE ontologies SET status='草稿',validation_json=? WHERE id=?",[toJson(validation),id])
    return sendJson(res,409,{message:'图谱结构校验未通过，不能发布',validation})
  }
  await pool.query("UPDATE ontologies SET status='已发布',validation_json=?,published_at=NOW() WHERE id=?",[toJson(validation),id])
  await ontologyAudit(pool,id,'发布图谱结构版本',`${current.name} ${current.version}`)
  sendJson(res,200,await getOntology(id))
}

async function addElementV2(req,res,id){
  const payload=normalizeElementPayload(await readBody(req))
  const current=await getOntology(id)
  if(!current)return sendJson(res,404,{message:'图谱结构不存在'})
  if(isLockedOntologyStatus(current.status))return sendJson(res,409,{message:lockedOntologyMessage(current.status,'新增元素')})
  if(!countColumns[payload.type])return sendJson(res,400,{message:'结构元素类型无效'})
  if(!payload.code||!payload.name)return sendJson(res,400,{message:'元素编码和名称不能为空'})
  const owner=payload.type==='class'?'':payload.ownerCode
  const dataType=payload.type==='class'?'实体类型':payload.dataType
  const target=payload.type==='relation'?payload.targetCode:''
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction()
    await connection.query('INSERT INTO ontology_elements (ontology_id,element_type,code,name,owner_code,target_code,data_type,constraint_desc,description) VALUES (?,?,?,?,?,?,?,?,?)',[id,payload.type,payload.code,payload.name,owner,target,dataType,payload.constraint,payload.description])
    await resetOntologyDraft(connection,id)
    await syncOntologyCounts(connection,id)
    await ontologyAudit(connection,id,'新增结构元素',`${payload.type} / ${payload.code}`)
    await connection.commit()
    sendJson(res,201,await getOntology(id))
  }catch(error){await connection.rollback();if(error?.code==='ER_DUP_ENTRY')return sendJson(res,409,{message:'同类型元素编码已存在'});throw error}finally{connection.release()}
}

async function updateElementV2(req,res,id,elementId){
  const payload=await readBody(req)
  const current=await getOntology(id)
  if(!current)return sendJson(res,404,{message:'图谱结构不存在'})
  if(isLockedOntologyStatus(current.status))return sendJson(res,409,{message:lockedOntologyMessage(current.status,'编辑元素')})
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction()
    const [rows]=await connection.query('SELECT * FROM ontology_elements WHERE ontology_id=? AND element_id=? FOR UPDATE',[id,elementId])
    if(!rows.length){await connection.rollback();return sendJson(res,404,{message:'结构元素不存在'})}
    const row=rows[0]
    if(payload.type&&payload.type!==row.element_type){await connection.rollback();return sendJson(res,400,{message:'元素类型不可修改，请删除后重新新增'})}
    const next=normalizeElementPayload({type:row.element_type,code:payload.code??row.code,name:payload.name??row.name,ownerCode:payload.ownerCode??row.owner_code,targetCode:payload.targetCode??row.target_code,dataType:payload.dataType??row.data_type,constraint:payload.constraint??row.constraint_desc,description:payload.description??row.description},row.element_type)
    if(!next.code||!next.name){await connection.rollback();return sendJson(res,400,{message:'元素编码和名称不能为空'})}
    if(row.element_type==='class'&&next.code!==row.code)await rejectReferencedClass(connection,id,elementId,row.code)
    await connection.query('UPDATE ontology_elements SET code=?,name=?,owner_code=?,target_code=?,data_type=?,constraint_desc=?,description=? WHERE ontology_id=? AND element_id=?',[next.code,next.name,row.element_type==='class'?'':next.ownerCode,row.element_type==='relation'?next.targetCode:'',row.element_type==='class'?'实体类型':next.dataType,next.constraint,next.description,id,elementId])
    await resetOntologyDraft(connection,id)
    await syncOntologyCounts(connection,id)
    await ontologyAudit(connection,id,'编辑结构元素',`${row.element_type} / ${next.code}`)
    await connection.commit()
    sendJson(res,200,await getOntology(id))
  }catch(error){await connection.rollback();if(error?.code==='ER_DUP_ENTRY')return sendJson(res,409,{message:'同类型元素编码已存在'});throw error}finally{connection.release()}
}

async function deleteElementV2(res,id,elementId){
  const current=await getOntology(id)
  if(!current)return sendJson(res,404,{message:'图谱结构不存在'})
  if(isLockedOntologyStatus(current.status))return sendJson(res,409,{message:lockedOntologyMessage(current.status,'删除元素')})
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction()
    const [rows]=await connection.query('SELECT * FROM ontology_elements WHERE ontology_id=? AND element_id=? FOR UPDATE',[id,elementId])
    if(!rows.length){await connection.rollback();return sendJson(res,404,{message:'结构元素不存在'})}
    if(rows[0].element_type==='class')await rejectReferencedClass(connection,id,elementId,rows[0].code)
    await connection.query('DELETE FROM ontology_elements WHERE element_id=?',[elementId])
    await resetOntologyDraft(connection,id)
    await syncOntologyCounts(connection,id)
    await ontologyAudit(connection,id,'删除结构元素',`${rows[0].element_type} / ${rows[0].code}`)
    await connection.commit()
    sendJson(res,200,await getOntology(id))
  }catch(error){await connection.rollback();throw error}finally{connection.release()}
}

async function retireOntologyV2(res,id){
  const current=await getOntology(id)
  if(!current||current.status==='已删除')return sendJson(res,404,{message:'图谱结构不存在'})
  if(current.status!=='已发布')return sendJson(res,409,{message:'只有已发布图谱结构可以下架'})
  await pool.query("UPDATE ontologies SET status='已下架' WHERE id=?",[id])
  await ontologyAudit(pool,id,'下架图谱结构',`${current.name} ${current.version}`)
  sendJson(res,200,await getOntology(id))
}

async function deleteOntologyV2(res,id){
  const current=await getOntology(id)
  if(!current||current.status==='已删除')return sendJson(res,404,{message:'图谱结构不存在'})
  const references=await ontologyReferenceSummary(pool,id)
  if(current.status==='已发布'&&references.total>0)return sendJson(res,409,{message:`该图谱结构仍被${references.summary}引用，请先下架后再删除，或解除引用后删除`})
  if(['已发布','已下架','已废止'].includes(current.status)){
    await pool.query("UPDATE ontologies SET status='已删除' WHERE id=?",[id])
    await ontologyAudit(pool,id,'删除图谱结构',`${current.name} ${current.version} / ${current.status} → 已删除`)
    return sendJson(res,200,{ok:true,message:'图谱结构已删除，历史引用和审计记录仍保留'})
  }
  if(references.total>0)return sendJson(res,409,{message:`该图谱结构仍被${references.summary}引用，不能删除`})
  await ontologyAudit(pool,id,'删除图谱结构草稿',`${current.name} ${current.version}`)
  await pool.query('DELETE FROM ontologies WHERE id=?',[id])
  sendJson(res,200,{ok:true,message:'图谱结构草稿已删除'})
}
async function handleApi(req,res,url){
  if(url.pathname==='/api/health'&&req.method==='GET')return sendJson(res,200,{ok:true,database})
  if(await handleSuperAgentApi(req,res,url,{sendJson}))return
  if(await handleDemoReadApi(req,res,url,{pool,sendJson}))return
  if(await handleRuleCatalogApi(req,res,url,{pool,sendJson,readBody}))return
  if(await handleSceneRuleApi(req,res,url,{pool,sendJson,readBody}))return
  if(await handleDataGraphApi(req,res,url,{pool,sendJson,readBody}))return
  if(url.pathname==='/api/ontologies'&&req.method==='GET')return sendJson(res,200,await listOntologies())
  if(url.pathname==='/api/ontologies'&&req.method==='POST')return createOntology(req,res)
  const element=url.pathname.match(/^\/api\/ontologies\/([^/]+)\/elements(?:\/([^/]+))?$/);if(element){const id=decodeURIComponent(element[1]);if(req.method==='POST'&&!element[2])return addElementV2(req,res,id);if(req.method==='PUT'&&element[2])return updateElementV2(req,res,id,decodeURIComponent(element[2]));if(req.method==='DELETE'&&element[2])return deleteElementV2(res,id,decodeURIComponent(element[2]))}
  const action=url.pathname.match(/^\/api\/ontologies\/([^/]+)\/(copy|publish|validate|retire)$/);if(action&&req.method==='POST')return action[2]==='copy'?copyOntologyV2(res,decodeURIComponent(action[1])):action[2]==='validate'?validateOntologyV2(res,decodeURIComponent(action[1])):action[2]==='retire'?retireOntologyV2(res,decodeURIComponent(action[1])):publishOntologyV2(res,decodeURIComponent(action[1]))
  const item=url.pathname.match(/^\/api\/ontologies\/([^/]+)$/);if(item){const id=decodeURIComponent(item[1]);if(req.method==='GET'){const result=await getOntology(id);return sendJson(res,result&&result.status!=='已删除'?200:404,result&&result.status!=='已删除'?result:{message:'图谱结构不存在'})}if(req.method==='PUT')return updateOntologyV2(req,res,id);if(req.method==='DELETE')return deleteOntologyV2(res,id)}
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
