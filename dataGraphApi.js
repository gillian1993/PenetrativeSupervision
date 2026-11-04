import mysql from 'mysql2/promise'
import ExcelJS from 'exceljs'
import { Readable } from 'node:stream'
import { buildGraphDataset } from './graphDataSync.js'
import { assessGraphMappingCoverage } from './graphMappingCoverage.js'
import { suggestGraphMappings } from './graphAutoMapping.js'
import { initializeGraphSyncHistory, listGraphSyncRecords, runTrackedGraphSync, withGraphSyncMetadata } from './graphSyncHistory.js'
import { withSourceOperation } from './dataSourceLifecycle.js'

const json=(value)=>JSON.stringify(value??null)
const parseJson=(value,fallback)=>{if(value===null||value===undefined||value==='')return fallback;if(typeof value==='object')return value;try{return JSON.parse(value)}catch{return fallback}}
const formatTime=(value)=>value instanceof Date?value.toLocaleString('zh-CN',{hour12:false}).replaceAll('/','-'):String(value||'')
const simplifyVersionText=(value)=>String(value||'').replace(/\bv(\d+)(?:\.\d+)?\b/gi,(_,major)=>`V${Math.max(1,Number(major)||1)}`).replace(/草稿/g,'待发布')

async function ensureColumn(pool,table,column,definition){
  const [rows]=await pool.query('SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',[table,column])
  if(!Number(rows[0].total))await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`)
}
async function normalizeGraphOntologyVersions(pool){
  const [rows]=await pool.query('SELECT id,ontology_version FROM graph_versions')
  for(const row of rows){
    const next=simplifyVersionText(row.ontology_version)
    if(next&&next!==row.ontology_version)await pool.query('UPDATE graph_versions SET ontology_version=? WHERE id=?',[next,row.id])
  }
}

const seedSources=[
  ['SRC-ERP','集团ERP采购视图','数据库接入','采购项目、订单、供应商','张海','增量','今天 11:52','启用'],
  ['SRC-OA','OA审批事件接口','接口接入','审批实例、节点、意见','刘敏','事件','今天 12:06','启用'],
  ['SRC-TREASURY','司库付款接口','接口接入','付款申请、账户、流水','王宁','事件','今天 12:08','启用'],
  ['SRC-EXTERNAL','工商司法外部数据','接口接入','主体、股东、司法风险','陈洁','增量','昨天 23:00','异常'],
]
const seedGraphs=[
  ['GRAPH-20260717.2','ONT-PROC','BASE V1 / PROC V3','MAP v3.4','2026-01-01 至 2026-07-17',176752,309861,0,0,8,'已发布','2026-07-17 08:45:00'],
  ['GRAPH-20260717.3','ONT-PROC','BASE V1 / PROC V3','MAP v3.5','2026-01-01 至 2026-07-17',177741,311202,0,0,3,'待发布',null],
  ['GRAPH-20260716.4','ONT-FIN','BASE V1 / FIN 待发布','MAP v2.8','2025-01-01 至 2026-07-16',138017,206871,0,2,12,'失败',null],
]

function splitList(value){return String(value||'').split(',').map((item)=>item.trim()).filter(Boolean)}
function normalizeSourceMode(mode){const text=String(mode||'').trim();if(['数据库接入','接口接入','文件导入'].includes(text))return text;if(text==='数据库视图'||text==='数据库表'||text==='数据库视图/表')return'数据库接入';if(text==='API'||text==='API接口')return'接口接入';if(text==='批量文件')return'文件导入';if(text.includes('消息')||text.includes('日志'))return'接口接入';return'数据库接入'}
function normalizeAccessConfig(mode,config={}){const source=config&&typeof config==='object'?config:{};if(mode==='数据库接入')return{databaseType:String(source.databaseType||'MySQL'),host:String(source.host||'').trim(),port:String(source.port||'').trim(),databaseName:String(source.databaseName||'').trim(),username:String(source.username||'').trim(),password:String(source.password||'')};if(mode==='接口接入')return{apiUrl:String(source.apiUrl||'').trim(),method:String(source.method||'GET'),authType:String(source.authType||'Token'),token:String(source.token||'')};if(mode==='文件导入')return{fileName:String(source.fileName||'').trim()};return{}}
function redactAccessConfig(mode,value){const config=normalizeAccessConfig(mode,parseJson(value,{}));if(mode==='数据库接入')return{databaseType:config.databaseType,host:config.host,port:config.port,databaseName:config.databaseName,username:config.username,passwordConfigured:Boolean(config.password)};if(mode==='接口接入')return{apiUrl:config.apiUrl,method:config.method,authType:config.authType,tokenConfigured:Boolean(config.token)};if(mode==='文件导入')return{fileName:config.fileName};return{}}
function validateAccessConfig(mode,config){if(mode==='数据库接入'){if(!config.host||!config.port||!config.databaseName||!config.username||!config.password)throw Object.assign(new Error('请完整填写数据库接入配置'),{status:400})}else if(mode==='接口接入'){if(!config.apiUrl||!config.method||!config.authType)throw Object.assign(new Error('请完整填写接口接入配置'),{status:400});if(config.authType!=='无认证'&&!config.token)throw Object.assign(new Error('请填写接口 Token/密钥'),{status:400})}}
function mapSource(row){const mode=normalizeSourceMode(row.mode);return{id:row.id,name:row.name,mode,range:row.data_range,owner:row.owner,ontologyIds:splitList(row.ontology_ids),ontologyNames:splitList(row.ontology_names),lastSuccess:row.last_success,status:row.status==='异常'?'草稿':row.status,connectionStatus:['正常','异常'].includes(row.connection_status)?row.connection_status:'未测试',lastTestedAt:formatTime(row.last_tested_at),connectionMessage:row.connection_message||'',accessConfig:redactAccessConfig(mode,row.access_config),fileCount:Number(row.file_count||0)}}
function sourceFieldsForTable(tableName){
  const fields={
    purchase_project:['project_id','project_name','budget_amount','purchase_method','org_code','created_at'],
    supplier_master:['supplier_code','supplier_name','credit_code','phone','contact_name','license_no'],
    purchase_order:['order_id','supplier_code','project_id','contract_id','amount','ordered_at'],
    bid_event:['event_id','occurred_at','participant_id','project_id','bid_amount','result'],
    source_object:['object_id','object_code','object_name','credit_code','phone','owner_org'],
    source_event:['event_id','occurred_at','participant_id','object_id','result','comment'],
  }
  return fields[tableName]||['record_id','object_code','object_name','occurred_at','amount','status']
}
function mapMetadata(row){return{id:String(row.id),sourceId:row.source_id,tableName:row.table_name,displayName:row.display_name,fieldCount:Number(row.field_count),summary:row.summary,fields:row.fields_json?parseJson(row.fields_json,[]):sourceFieldsForTable(row.table_name)}}
function canonicalMappingType(value){const type=String(value||'').trim();if(type==='关系')return'关系';if(type==='实体类型')return'实体类型';return'属性'}
function mappingElementType(value){return value==='实体类型'?'class':value==='关系'?'relation':'property'}
function declaredTargetType(value){const type=String(value||'').trim();return ['class','property','relation'].includes(type)?type:''}
function assertMappingTarget(targets,declaredType,mappingType){const expected=mappingElementType(mappingType);const targetType=targets[0]?.element_type||declaredTargetType(declaredType);if(!targetType)throw Object.assign(new Error('目标元素不属于当前图谱结构版本'),{status:409});if(targetType!==expected)throw Object.assign(new Error(`${mappingType}映射目标类型不匹配，请重新选择`),{status:409})}
function mapMapping(row){return{id:String(row.id),sourceId:row.source_id,ontologyId:row.ontology_id||'ONT-PROC',type:canonicalMappingType(row.mapping_type),sourceField:row.source_field,transform:row.transform_rule,targetCode:row.target_code,confidence:Number(row.confidence),status:row.status,revision:Number(row.revision||1),setStatus:row.set_status||row.status,lastValidatedAt:row.last_validated_at?formatTime(row.last_validated_at):'—'}}
function mapSync(row){return{id:row.id,sourceId:row.source_id,sourceName:row.source_name,mode:row.sync_mode,startedAt:formatTime(row.started_at),processed:Number(row.processed_count),errors:Number(row.error_count),duration:row.duration_text,result:row.result}}
function isGraphGenerationFailed(value){return['生成失败','失败','校验中'].includes(String(value||''))}
function normalizeGraphStatus(value){const status=String(value||'');if(isGraphGenerationFailed(status))return'草稿';if(status==='已归档')return'已发布';return status||'草稿'}
function normalizeGraphTag(value){const text=String(value||'').trim();return text.slice(0,40)||'通用图谱'}
function normalizeStructureElements(value){return (Array.isArray(value)?value:[]).map((item,index)=>({id:String(item.id||`GEL-${index+1}`),type:declaredTargetType(item.type),code:String(item.code||'').trim(),name:String(item.name||'').trim(),ownerCode:String(item.ownerCode||''),targetCode:String(item.targetCode||''),dataType:String(item.dataType||''),constraint:String(item.constraint||''),description:String(item.description||''),sourceType:['model','custom','modified'].includes(String(item.sourceType||''))?String(item.sourceType):'model'})).filter((item)=>item.type&&item.code&&item.name)}
function requiredStructureCodes(structureElements){return normalizeStructureElements(structureElements).filter((item)=>item.type==='property'&&/必填|主标识/.test(item.constraint)).map((item)=>item.code)}
function mapGraph(row){return{id:row.id,ontologyId:row.ontology_id,ontologyVersion:row.ontology_version,mappingVersion:row.mapping_version,tag:normalizeGraphTag(row.graph_tag),range:row.data_range,entities:Number(row.entity_count),relations:Number(row.relation_count),events:Number(row.event_count),blockers:Number(row.blockers),warnings:Number(row.warnings),status:normalizeGraphStatus(row.status),generationFailed:isGraphGenerationFailed(row.status),publishedAt:row.published_at?formatTime(row.published_at):'—'}}
function mapGraphVersion(row){return{id:row.id,graphCode:row.graph_code||row.ontology_id,graphName:row.graph_name||row.ontology_version,tag:normalizeGraphTag(row.graph_tag),ontologyId:row.ontology_id,ontologyVersion:row.ontology_version,mappingVersion:row.mapping_version,range:row.data_range,sourceIds:String(row.source_ids||'').split(',').filter(Boolean),sourceNames:String(row.source_names||'').split(',').filter(Boolean),entities:Number(row.entity_count),relations:Number(row.relation_count),events:Number(row.event_count),blockers:Number(row.blockers),warnings:Number(row.warnings),status:normalizeGraphStatus(row.status),generationFailed:isGraphGenerationFailed(row.status),publishedAt:row.published_at?formatTime(row.published_at):'—',structureElements:normalizeStructureElements(parseJson(row.structure_snapshot,[]))}}
function mapIssue(row){return{id:row.id,graphId:row.graph_id,title:row.title,level:row.level,description:row.description,sourceRef:row.source_ref,status:row.status}}
function mapGovernance(row){return{id:row.id,graphId:row.graph_id,objectType:row.object_type,candidates:parseJson(row.candidate_json,[]),evidence:row.evidence,suggestion:row.suggestion,level:row.level,status:row.status,result:row.result||'',reason:row.reason||''}}
function mapMappingSnapshot(row){const rows=parseJson(row.snapshot_json,[]);return{graphId:row.graph_id,sourceId:row.source_id,ontologyId:row.ontology_id,revision:Number(row.mapping_revision||1),status:row.mapping_status,mappingCount:Number(row.mapping_count||0),createdAt:row.created_at?formatTime(row.created_at):'—',rows:Array.isArray(rows)?rows.map((item)=>mapMapping({...item,revision:row.mapping_revision,set_status:row.mapping_status,last_validated_at:row.created_at})):[]}}
async function ensureMappingSet(pool,sourceId,ontologyId){await pool.query("INSERT IGNORE INTO semantic_mapping_sets (source_id,ontology_id,revision,status) VALUES (?,?,1,'待校验')",[sourceId,ontologyId]);const [rows]=await pool.query('SELECT * FROM semantic_mapping_sets WHERE source_id=? AND ontology_id=?',[sourceId,ontologyId]);return rows[0]}
async function backfillGraphMappingSnapshots(pool){const [links]=await pool.query('SELECT gvs.graph_id,gvs.source_id,gv.ontology_id FROM graph_version_sources gvs JOIN graph_versions gv ON gv.id=gvs.graph_id LEFT JOIN graph_version_mapping_snapshots snap ON snap.graph_id=gvs.graph_id AND snap.source_id=gvs.source_id WHERE snap.graph_id IS NULL');for(const link of links){const set=await ensureMappingSet(pool,link.source_id,link.ontology_id);const [rows]=await pool.query('SELECT id,source_id,ontology_id,mapping_type,source_field,transform_rule,target_code,confidence,status,updated_at FROM semantic_mappings WHERE source_id=? AND ontology_id=? ORDER BY mapping_type,id',[link.source_id,link.ontology_id]);await pool.query('INSERT IGNORE INTO graph_version_mapping_snapshots (graph_id,source_id,ontology_id,mapping_revision,mapping_status,mapping_count,snapshot_json) VALUES (?,?,?,?,?,?,?)',[link.graph_id,link.source_id,link.ontology_id,Number(set?.revision||1),'历史回填',rows.length,json(rows)])}}

async function seedMetadata(pool,sourceId){
  const rows=sourceId==='SRC-ERP'?
    [['purchase_project','采购项目视图',32,'项目、预算、采购方式、组织与时间字段'],['supplier_master','供应商主数据',28,'供应商主体、证照、联系方式字段'],['supplier_qualification','供应商资质与绩效',24,'军工/涉密资质、体系认证、有效期与绩效字段'],['product_master','物料与品类主数据',36,'物料、SKU、UNSPSC品类、供应商物料与价格字段'],['purchase_order','采购订单',41,'订单、金额、合同与明细字段'],['sourcing_event','寻源与报价',30,'询价、供应商报价、评审、授标字段'],['bid_event','招投标事件',18,'报名、评审、中标确认事件字段'],['warehouse_inventory','仓储库存与批次',46,'仓库、库位、库存余额、库存移动、批次序列号字段'],['receipt_settlement','到货、入库与结算',38,'到货签收、质检、入库、结算和退货字段'],['invoice_payment','发票付款与对账',32,'采购发票、付款、核销、供应商对账字段']]:
    sourceId==='SRC-OA'?
      [['approval_workflow','采购审批流程',22,'采购申请、订单、合同和付款审批节点与意见'],['approval_task','审批任务事件',16,'审批人、审批状态、处理时间与留痕字段'],['risk_event','监管风险事件',18,'风险等级、证据引用、整改状态与复核结果']]:
      [['source_object','来源对象',16,'自动解析的来源对象与字段'],['source_event','来源事件',12,'自动解析的业务事件字段']]
  for(const row of rows)await pool.query('INSERT IGNORE INTO data_source_metadata (source_id,table_name,display_name,field_count,summary) VALUES (?,?,?,?,?)',[sourceId,...row])
}
function legacyEntitySourceField(code){return String(code||'').replace(/^PROC\./,'').replaceAll('.','_').toLowerCase()}
function defaultEntitySourceTable(sourceId,code){const text=String(code||'').toLowerCase();if(sourceId==='SRC-ERP'){if(text.includes('supplier'))return'supplier_master';if(text.includes('project'))return'purchase_project';if(text.includes('order'))return'purchase_order';if(text.includes('bid')||text.includes('sourcing')||text.includes('award'))return'bid_event';if(text.includes('inventory')||text.includes('stock')||text.includes('warehouse')||text.includes('location'))return'warehouse_inventory';if(text.includes('invoice')||text.includes('payment')||text.includes('settlement'))return'invoice_payment';return'purchase_project'}if(sourceId==='SRC-OA')return text.includes('risk')?'risk_event':'approval_workflow';return'source_object'}
async function seedMappings(pool,sourceId){
  const rows=[
    ['属性','supplier_code','直接映射','PROC.Supplier.credit_code',98,'待校验'],
    ['属性','supplier_name','去空格','PROC.Supplier.name',99,'待校验'],
    ['属性','credit_code','大写转换','PROC.Supplier.credit_code',96,'待校验'],
    ['关系','supplier_id + phone','哈希关联','PROC.supplier_contact',95,'待校验'],
    ['关系','phone + reviewer_id','哈希关联','PROC.shared_contact',92,'待校验'],
    ['实体类型','bid_confirm_id + occurred_at + project_id','主键字段、发生时间与关联对象','PROC.BidConfirmed',99,'待校验'],
  ]
  for(const row of rows)await pool.query('INSERT IGNORE INTO semantic_mappings (source_id,mapping_type,source_field,transform_rule,target_code,confidence,status) VALUES (?,?,?,?,?,?,?)',[sourceId,...row])
}

async function seedOntologyMappings(pool,sourceId,ontologyId='ONT-PROC'){
  const [elements]=await pool.query("SELECT element_type,code FROM ontology_elements WHERE ontology_id=? AND element_type IN ('class','property','relation') ORDER BY element_id",[ontologyId])
  const codes=(type)=>elements.filter((item)=>item.element_type===type).map((item)=>item.code)
  const classes=codes('class');const properties=codes('property');const relations=codes('relation');const occurrenceProperty=properties.find((code)=>code.endsWith('.event_id'))||properties[0]
  const classMappings=classes.map((code)=>['实体类型',defaultEntitySourceTable(sourceId,code),'主键字段：id；名称字段：name',code,95,'待校验'])
  const rows=[
    ...classMappings,
    ['属性','supplier_code','直接映射',properties[0]||'',98,'待校验'],
    ['属性','supplier_name','去空格',properties[1]||properties[0]||'',99,'待校验'],
    ['属性','credit_code','大写转换',properties[2]||properties[0]||'',96,'待校验'],
    ['关系','supplier_id + phone','哈希关联',relations[0]||'',95,'待校验'],
    ['关系','phone + reviewer_id','哈希关联',relations[1]||relations[0]||'',92,'待校验'],
    ['属性','event_id','直接映射',occurrenceProperty||'',99,'待校验'],
  ].filter((row)=>row[3])
  // 为新增的采购与供应链标准属性补齐可配置的默认映射，避免扩展图谱结构后
  // 数据映射页只显示旧的风险对象字段。实际接入时可在页面逐项替换来源字段。
  const mappedTargets=new Set(rows.map((row)=>row[3]))
  for(const code of properties){
    if(mappedTargets.has(code))continue
    rows.push(['属性',code.replace(/^PROC\./,'').replaceAll('.','_'),'标准化字段映射',code,90,'待校验'])
  }
  for(const row of rows)await pool.query('INSERT IGNORE INTO semantic_mappings (source_id,ontology_id,mapping_type,source_field,transform_rule,target_code,confidence,status) VALUES (?,?,?,?,?,?,?,?)',[sourceId,ontologyId,...row])
}
export async function initializeDataGraphDatabase(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS data_sources (id VARCHAR(64) PRIMARY KEY,name VARCHAR(160) NOT NULL,mode VARCHAR(40) NOT NULL,data_range VARCHAR(300) NOT NULL,owner VARCHAR(80) NOT NULL,sync_mode VARCHAR(40) NOT NULL,last_success VARCHAR(80) NOT NULL DEFAULT '未同步',status VARCHAR(24) NOT NULL DEFAULT '草稿',created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await ensureColumn(pool,'data_sources','access_config',"access_config JSON NULL AFTER sync_mode")
  await ensureColumn(pool,'data_sources','connection_status',"connection_status VARCHAR(24) NOT NULL DEFAULT '未测试' AFTER status")
  await ensureColumn(pool,'data_sources','last_tested_at',"last_tested_at DATETIME NULL AFTER connection_status")
  await ensureColumn(pool,'data_sources','connection_message',"connection_message VARCHAR(500) NOT NULL DEFAULT '' AFTER last_tested_at")
  await pool.query("UPDATE data_sources SET connection_status='异常',connection_message='历史连接状态异常，请重新测试连接' WHERE status='异常' AND connection_status='未测试'")
  await pool.query("UPDATE data_sources SET connection_status='未测试' WHERE connection_status NOT IN ('未测试','正常','异常')")
  await pool.query(`CREATE TABLE IF NOT EXISTS data_source_structures (source_id VARCHAR(64) NOT NULL,ontology_id VARCHAR(64) NOT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY (source_id,ontology_id),KEY idx_source_structure_ontology (ontology_id,source_id),CONSTRAINT fk_source_structure_source FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS data_source_files (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,source_id VARCHAR(64) NOT NULL,file_name VARCHAR(255) NOT NULL,mime_type VARCHAR(120) NOT NULL DEFAULT '',size_bytes BIGINT UNSIGNED NOT NULL,content LONGBLOB NOT NULL,sheet_count INT NOT NULL DEFAULT 0,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE KEY uk_source_file_name (source_id,file_name),CONSTRAINT fk_source_file_source FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS data_source_metadata (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,source_id VARCHAR(64) NOT NULL,table_name VARCHAR(120) NOT NULL,display_name VARCHAR(160) NOT NULL,field_count INT NOT NULL DEFAULT 0,summary VARCHAR(500) NOT NULL DEFAULT '',updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uk_source_table (source_id,table_name),CONSTRAINT fk_metadata_source FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await ensureColumn(pool,'data_source_metadata','file_id','file_id BIGINT UNSIGNED NULL AFTER source_id')
  await ensureColumn(pool,'data_source_metadata','fields_json','fields_json JSON NULL AFTER field_count')
  await pool.query(`CREATE TABLE IF NOT EXISTS semantic_mappings (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,source_id VARCHAR(64) NOT NULL,mapping_type VARCHAR(24) NOT NULL,source_field VARCHAR(160) NOT NULL,transform_rule VARCHAR(160) NOT NULL,target_code VARCHAR(160) NOT NULL,confidence INT NOT NULL DEFAULT 0,status VARCHAR(24) NOT NULL DEFAULT '待校验',updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uk_mapping (source_id,mapping_type,source_field,target_code),CONSTRAINT fk_mapping_source FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS sync_records (id VARCHAR(80) PRIMARY KEY,source_id VARCHAR(64) NOT NULL,source_name VARCHAR(160) NOT NULL,sync_mode VARCHAR(40) NOT NULL,started_at DATETIME NOT NULL,processed_count INT NOT NULL DEFAULT 0,error_count INT NOT NULL DEFAULT 0,duration_text VARCHAR(40) NOT NULL,result VARCHAR(24) NOT NULL,KEY idx_sync_source (source_id,started_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS graph_versions (id VARCHAR(64) PRIMARY KEY,ontology_id VARCHAR(64) NOT NULL DEFAULT 'ONT-PROC',ontology_version VARCHAR(160) NOT NULL,mapping_version VARCHAR(80) NOT NULL,data_range VARCHAR(500) NOT NULL,entity_count INT NOT NULL DEFAULT 0,relation_count INT NOT NULL DEFAULT 0,event_count INT NOT NULL DEFAULT 0,blockers INT NOT NULL DEFAULT 0,warnings INT NOT NULL DEFAULT 0,status VARCHAR(24) NOT NULL DEFAULT '待发布',published_at DATETIME NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_graph_status (status,updated_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS graph_instance_datasets (graph_id VARCHAR(64) PRIMARY KEY,dataset_json JSON NOT NULL,source_stats_json JSON NOT NULL,synced_at DATETIME NOT NULL,CONSTRAINT fk_graph_dataset_graph FOREIGN KEY (graph_id) REFERENCES graph_versions(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await initializeGraphSyncHistory(pool)
  await ensureColumn(pool,'semantic_mappings','ontology_id',"ontology_id VARCHAR(64) NOT NULL DEFAULT 'ONT-PROC' AFTER source_id")
  await pool.query("DELETE duplicate FROM semantic_mappings duplicate JOIN semantic_mappings keep ON keep.source_id=duplicate.source_id AND keep.ontology_id=duplicate.ontology_id AND keep.source_field=duplicate.source_field AND keep.target_code=duplicate.target_code AND keep.id<duplicate.id WHERE duplicate.mapping_type IN ('实体类型','属性','关系','事件','事件实例','节点实例') AND keep.mapping_type IN ('实体类型','属性','关系','事件','事件实例','节点实例')")
  await pool.query("UPDATE semantic_mappings sm JOIN ontology_elements oe ON oe.ontology_id=sm.ontology_id AND oe.code=sm.target_code SET sm.mapping_type=CASE WHEN oe.element_type='class' THEN '实体类型' WHEN oe.element_type='property' THEN '属性' ELSE sm.mapping_type END WHERE sm.mapping_type IN ('属性','事件','事件实例','节点实例') AND oe.element_type IN ('class','property')")
  await pool.query("UPDATE semantic_mappings SET transform_rule=REPLACE(REPLACE(transform_rule,'事件标识','节点标识'),'事件ID','节点ID')")
  const [legacyClassMappings]=await pool.query("SELECT sm.id,sm.source_id,sm.source_field,oe.code FROM semantic_mappings sm JOIN ontology_elements oe ON oe.ontology_id=sm.ontology_id AND oe.code=sm.target_code WHERE sm.mapping_type='实体类型' AND oe.element_type='class'")
  for(const mapping of legacyClassMappings){const nextSourceField=defaultEntitySourceTable(mapping.source_id,mapping.code);const needsMigration=mapping.source_field===legacyEntitySourceField(mapping.code)||(mapping.source_id==='SRC-ERP'&&mapping.source_field==='source_object');if(!needsMigration||mapping.source_field===nextSourceField)continue;const [duplicates]=await pool.query("SELECT id FROM semantic_mappings WHERE source_id=? AND ontology_id=(SELECT ontology_id FROM semantic_mappings WHERE id=?) AND mapping_type='实体类型' AND target_code=? AND source_field=? AND id<>? LIMIT 1",[mapping.source_id,mapping.id,mapping.code,nextSourceField,mapping.id]);if(duplicates.length)await pool.query('DELETE FROM semantic_mappings WHERE id=?',[mapping.id]);else await pool.query('UPDATE semantic_mappings SET source_field=? WHERE id=?',[nextSourceField,mapping.id])}
  await pool.query(`CREATE TABLE IF NOT EXISTS semantic_mapping_sets (source_id VARCHAR(64) NOT NULL,ontology_id VARCHAR(64) NOT NULL,revision INT NOT NULL DEFAULT 1,status VARCHAR(24) NOT NULL DEFAULT '待校验',last_validated_at DATETIME NULL,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,PRIMARY KEY (source_id,ontology_id),KEY idx_mapping_set_status (status,updated_at),CONSTRAINT fk_mapping_set_source FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await ensureColumn(pool,'graph_versions','graph_code',"graph_code VARCHAR(64) NOT NULL DEFAULT '' AFTER id")
  await ensureColumn(pool,'graph_versions','graph_name',"graph_name VARCHAR(160) NOT NULL DEFAULT '' AFTER graph_code")
  await ensureColumn(pool,'graph_versions','graph_tag',"graph_tag VARCHAR(40) NOT NULL DEFAULT '通用图谱' AFTER graph_name")
  await ensureColumn(pool,'graph_versions','structure_snapshot',"structure_snapshot JSON NULL AFTER graph_name")
  await pool.query('ALTER TABLE graph_versions MODIFY COLUMN data_range VARCHAR(500) NOT NULL')
  await pool.query(`CREATE TABLE IF NOT EXISTS graph_version_sources (graph_id VARCHAR(64) NOT NULL,source_id VARCHAR(64) NOT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY (graph_id,source_id),KEY idx_graph_source (source_id,graph_id),CONSTRAINT fk_graph_source_graph FOREIGN KEY (graph_id) REFERENCES graph_versions(id) ON DELETE CASCADE,CONSTRAINT fk_graph_source_source FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE RESTRICT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS graph_version_mapping_snapshots (graph_id VARCHAR(64) NOT NULL,source_id VARCHAR(64) NOT NULL,ontology_id VARCHAR(64) NOT NULL,mapping_revision INT NOT NULL DEFAULT 1,mapping_status VARCHAR(24) NOT NULL,mapping_count INT NOT NULL DEFAULT 0,snapshot_json JSON NOT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY (graph_id,source_id),KEY idx_snapshot_source (source_id,ontology_id),CONSTRAINT fk_snapshot_graph FOREIGN KEY (graph_id) REFERENCES graph_versions(id) ON DELETE CASCADE,CONSTRAINT fk_snapshot_source FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE RESTRICT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS graph_edit_drafts (graph_id VARCHAR(64) PRIMARY KEY,graph_code VARCHAR(64) NOT NULL,graph_name VARCHAR(160) NOT NULL,graph_tag VARCHAR(40) NOT NULL DEFAULT '通用图谱',ontology_id VARCHAR(64) NOT NULL,data_range VARCHAR(500) NOT NULL,source_ids_json JSON NOT NULL,structure_snapshot JSON NOT NULL,mappings_snapshot JSON NOT NULL,dirty TINYINT(1) NOT NULL DEFAULT 0,mapping_revision INT NOT NULL DEFAULT 1,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_graph_edit_dirty (dirty,updated_at),CONSTRAINT fk_graph_edit_graph FOREIGN KEY (graph_id) REFERENCES graph_versions(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await ensureColumn(pool,'graph_edit_drafts','graph_tag',"graph_tag VARCHAR(40) NOT NULL DEFAULT '通用图谱' AFTER graph_name")
  await pool.query('ALTER TABLE graph_edit_drafts MODIFY COLUMN data_range VARCHAR(500) NOT NULL')
  await pool.query(`CREATE TABLE IF NOT EXISTS graph_quality_issues (id VARCHAR(80) PRIMARY KEY,graph_id VARCHAR(64) NOT NULL,title VARCHAR(120) NOT NULL,level VARCHAR(24) NOT NULL,description VARCHAR(500) NOT NULL,source_ref VARCHAR(200) NOT NULL,status VARCHAR(24) NOT NULL DEFAULT '待处理',KEY idx_issue_graph (graph_id,status),CONSTRAINT fk_issue_graph FOREIGN KEY (graph_id) REFERENCES graph_versions(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS graph_governance_tasks (id VARCHAR(80) PRIMARY KEY,graph_id VARCHAR(64) NOT NULL,object_type VARCHAR(40) NOT NULL,candidate_json JSON NOT NULL,evidence VARCHAR(300) NOT NULL,suggestion VARCHAR(60) NOT NULL,level VARCHAR(16) NOT NULL,status VARCHAR(24) NOT NULL DEFAULT '待处理',result VARCHAR(40) NOT NULL DEFAULT '',reason VARCHAR(500) NOT NULL DEFAULT '',KEY idx_governance_graph (graph_id,status),CONSTRAINT fk_governance_graph FOREIGN KEY (graph_id) REFERENCES graph_versions(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  for(const item of seedSources)await pool.query('INSERT IGNORE INTO data_sources (id,name,mode,data_range,owner,sync_mode,last_success,status) VALUES (?,?,?,?,?,?,?,?)',item)
  await pool.query("UPDATE data_sources SET mode='数据库接入' WHERE mode IN ('数据库视图','数据库表','数据库视图/表')")
  await pool.query("UPDATE data_sources SET mode='接口接入' WHERE mode IN ('API','API接口','消息','消息/日志')")
  await pool.query("UPDATE data_sources SET mode='文件导入' WHERE mode='批量文件'")
  await pool.query("UPDATE data_sources SET connection_status='未测试' WHERE connection_status NOT IN ('未测试','正常','异常')")
  await pool.query("UPDATE data_sources ds SET ds.connection_status='正常',ds.connection_message='文件已解析，可启用使用' WHERE ds.mode='文件导入' AND ds.connection_status='未测试' AND EXISTS (SELECT 1 FROM data_source_files dsf WHERE dsf.source_id=ds.id) AND EXISTS (SELECT 1 FROM data_source_metadata dsm WHERE dsm.source_id=ds.id AND dsm.file_id IS NOT NULL)")
  await pool.query("UPDATE data_sources SET status='草稿' WHERE status='异常'")
  await pool.query("UPDATE data_sources ds SET ds.connection_status='异常',ds.connection_message='请先上传并解析至少一份数据文件' WHERE ds.mode='文件导入' AND ds.status='启用' AND (NOT EXISTS (SELECT 1 FROM data_source_files dsf WHERE dsf.source_id=ds.id) OR NOT EXISTS (SELECT 1 FROM data_source_metadata dsm WHERE dsm.source_id=ds.id AND dsm.file_id IS NOT NULL))")
  await pool.query("UPDATE data_sources SET name='司库付款接口' WHERE id='SRC-TREASURY' AND name='司库付款消息'")
  await pool.query("UPDATE sync_records SET source_name='司库付款接口' WHERE source_id='SRC-TREASURY' AND source_name='司库付款消息'")
  await pool.query("INSERT IGNORE INTO data_source_structures (source_id,ontology_id) SELECT id,'ONT-PROC' FROM data_sources")
  await pool.query("INSERT IGNORE INTO data_source_structures (source_id,ontology_id) VALUES ('SRC-TREASURY','ONT-FIN')")
  for(const item of seedGraphs)await pool.query('INSERT IGNORE INTO graph_versions (id,ontology_id,ontology_version,mapping_version,data_range,entity_count,relation_count,event_count,blockers,warnings,status,published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',item)
  await pool.query("UPDATE graph_versions SET graph_tag='采购监管' WHERE graph_tag='通用图谱' AND ontology_id='ONT-PROC'")
  await pool.query("UPDATE graph_versions SET graph_tag='财务监管' WHERE graph_tag='通用图谱' AND ontology_id='ONT-FIN'")
  await pool.query("UPDATE graph_versions SET ontology_version='BASE V1 / PROC V3' WHERE ontology_version='BASE v1.6 / PROC v2.2'")
  await pool.query("UPDATE graph_versions SET ontology_version='BASE V1 / FIN 待发布' WHERE ontology_version='BASE v1.6 / FIN v1.0'")
  await pool.query("UPDATE graph_versions SET status='生成失败' WHERE status IN ('失败','校验中')")
  await normalizeGraphOntologyVersions(pool)
  await pool.query("DELETE FROM semantic_mappings WHERE source_field='record_id + occurred_at + related_id' AND transform_rule='节点标识、发生时间与关联对象'")
  for(const item of seedSources){await seedMetadata(pool,item[0]);await seedOntologyMappings(pool,item[0])}
  await pool.query('UPDATE graph_versions SET entity_count=entity_count+event_count,event_count=0 WHERE event_count<>0')
  await pool.query("INSERT IGNORE INTO semantic_mapping_sets (source_id,ontology_id,revision,status,last_validated_at) SELECT source_id,ontology_id,1,IF(SUM(status='有效')=COUNT(*),'有效','待校验'),IF(SUM(status='有效')=COUNT(*),MAX(updated_at),NULL) FROM semantic_mappings GROUP BY source_id,ontology_id")
  await pool.query("UPDATE graph_versions SET graph_code=IF(graph_code='',ontology_id,graph_code),graph_name=IF(graph_name='',CONCAT(ontology_id,' 监管图谱'),graph_name)")
  await pool.query("INSERT IGNORE INTO graph_version_sources (graph_id,source_id) SELECT id,'SRC-ERP' FROM graph_versions WHERE ontology_id='ONT-PROC'")
  await pool.query("INSERT IGNORE INTO graph_version_sources (graph_id,source_id) SELECT id,'SRC-TREASURY' FROM graph_versions WHERE ontology_id='ONT-FIN'")
  await backfillGraphMappingSnapshots(pool)
  await pool.query('INSERT IGNORE INTO sync_records (id,source_id,source_name,sync_mode,started_at,processed_count,error_count,duration_text,result) VALUES (?,?,?,?,?,?,?,?,?)',['SYNC-0717-006','SRC-TREASURY','司库付款接口','事件','2026-07-17 12:08:00',326,0,'3秒','成功'])
  await pool.query('INSERT IGNORE INTO sync_records (id,source_id,source_name,sync_mode,started_at,processed_count,error_count,duration_text,result) VALUES (?,?,?,?,?,?,?,?,?)',['SYNC-0717-005','SRC-OA','OA审批事件接口','事件','2026-07-17 12:06:00',1824,3,'18秒','部分成功'])
  await pool.query('INSERT IGNORE INTO graph_quality_issues (id,graph_id,title,level,description,source_ref,status) VALUES (?,?,?,?,?,?,?)',['GQI-001','GRAPH-20260717.3','主标识缺失','阻断','供应商记录缺少统一社会信用代码','集团ERP采购视图 · 2条','待处理'])
  await pool.query('INSERT IGNORE INTO graph_quality_issues (id,graph_id,title,level,description,source_ref,status) VALUES (?,?,?,?,?,?,?)',['GQI-002','GRAPH-20260717.3','来源结构变化','警告','OA审批接口新增 approver_org 字段','OA审批事件接口 · 1项','待处理'])
  await pool.query('INSERT IGNORE INTO graph_governance_tasks (id,graph_id,object_type,candidate_json,evidence,suggestion,level,status) VALUES (?,?,?,?,?,?,?,?)',['GOV-0018','GRAPH-20260717.2','供应商',json(['华北数字科技有限公司','华北数字科技（北京）有限公司']),'统一社会信用代码一致','确认合并','高','待处理'])
}

const sourceSelect=`SELECT ds.*,(SELECT GROUP_CONCAT(dss.ontology_id ORDER BY dss.ontology_id) FROM data_source_structures dss WHERE dss.source_id=ds.id) AS ontology_ids,(SELECT GROUP_CONCAT(COALESCE(o.name,dss.ontology_id) ORDER BY dss.ontology_id) FROM data_source_structures dss LEFT JOIN ontologies o ON o.id=dss.ontology_id WHERE dss.source_id=ds.id) AS ontology_names,(SELECT COUNT(*) FROM data_source_files dsf WHERE dsf.source_id=ds.id) AS file_count FROM data_sources ds`
function normalizeSourceOntologyIds(payload){return [...new Set((Array.isArray(payload.ontologyIds)?payload.ontologyIds:[payload.ontologyId]).map((item)=>String(item||'').trim()).filter(Boolean))]}
function inferSourceSyncMode(mode){const text=String(mode||'');if(text.includes('消息'))return'事件';if(text.includes('文件'))return'全量';return'增量'}
async function ensureSourceUsesOntology(pool,sourceId,ontologyId){const [rows]=await pool.query('SELECT COUNT(*) AS total FROM data_source_structures WHERE source_id=? AND ontology_id=?',[sourceId,ontologyId]);if(!Number(rows[0].total))throw Object.assign(new Error('该数据源未绑定当前图谱结构，请先在数据源配置中选择适用图谱结构'),{status:409})}
async function listSources(pool){const [rows]=await pool.query(`${sourceSelect} ORDER BY ds.updated_at DESC,ds.id ASC`);return rows.map(mapSource)}
async function createSource(pool,payload){if(!String(payload.name||'').trim())throw Object.assign(new Error('请填写数据源名称'),{status:400});const mode=normalizeSourceMode(payload.mode);const accessConfig=normalizeAccessConfig(mode,payload.accessConfig);validateAccessConfig(mode,accessConfig);const [rows]=await pool.query("SELECT MAX(CAST(SUBSTRING(id,5) AS UNSIGNED)) AS total FROM data_sources WHERE id REGEXP '^SRC-[0-9]+$'");const id='SRC-'+String(Number(rows[0].total||0)+1).padStart(3,'0');await pool.query('INSERT INTO data_sources (id,name,mode,data_range,owner,sync_mode,access_config,last_success,status,connection_status) VALUES (?,?,?,?,?,?,?,?,?,?)',[id,String(payload.name).trim(),mode,String(payload.range||''),payload.owner||'张海',inferSourceSyncMode(mode),json(accessConfig),'未同步','草稿','未测试']);return mapSource((await pool.query(`${sourceSelect} WHERE ds.id=?`,[id]))[0][0])}
function sourceCandidateConfig(source,mode,patch){
  const config=normalizeAccessConfig(mode,patch)
  if(source&&normalizeSourceMode(source.mode)===mode){
    const stored=normalizeAccessConfig(mode,parseJson(source.access_config,{}))
    if(mode==='数据库接入'&&!config.password)config.password=stored.password
    if(mode==='接口接入'&&!config.token)config.token=stored.token
  }
  return config
}
async function updateSource(pool,id,payload){
  if(!String(payload.name||'').trim())throw Object.assign(new Error('请填写数据源名称'),{status:400})
  const result=await withSourceOperation(pool,id,getSource,async(connection,source)=>{
    const mode=normalizeSourceMode(payload.mode)
    const oldMode=normalizeSourceMode(source.mode)
    if(oldMode==='文件导入'&&mode!==oldMode&&Number(source.file_count))throw Object.assign(new Error('请先移除导入文件，再切换来源方式'),{status:409})
    if(source.status==='启用'&&oldMode!==mode)throw Object.assign(new Error('请先停用数据源，再切换接入方式'),{status:409})
    const config=sourceCandidateConfig(source,mode,payload.accessConfig)
    validateAccessConfig(mode,config)
    const changed=oldMode!==mode||json(config)!==json(normalizeAccessConfig(oldMode,parseJson(source.access_config,{})))
    let message=source.connection_message||''
    if(changed&&source.status==='启用'&&mode!=='文件导入'){
      try{message=await runSourceConnectionTest(mode,config)}catch(error){throw Object.assign(new Error(`新配置校验失败：${error.message}。原有配置继续使用。`),{status:error.status||502})}
    }
    const connectionStatus=changed?(source.status==='启用'?'正常':'未测试'):source.connection_status
    await connection.query('UPDATE data_sources SET name=?,mode=?,data_range=?,owner=?,sync_mode=?,access_config=?,connection_status=?,last_tested_at=?,connection_message=? WHERE id=?',[String(payload.name).trim(),mode,String(payload.range||''),payload.owner||'张海',inferSourceSyncMode(mode),json(config),connectionStatus,changed?(source.status==='启用'?new Date():null):source.last_tested_at,changed?(source.status==='启用'?message:''):message,id])
  })
  return mapSource(result.source)
}
async function getSource(pool,id){const [rows]=await pool.query(`${sourceSelect} WHERE ds.id=?`,[id]);return rows[0]||null}

const maxSourceFiles=10
const maxSourceFileBytes=10*1024*1024
const sourceFileError=(message,status=400)=>Object.assign(new Error(message),{status})
function mapSourceFile(row){return{id:String(row.id),sourceId:row.source_id,name:row.file_name,size:Number(row.size_bytes),sheetCount:Number(row.sheet_count),status:'解析成功',createdAt:formatTime(row.created_at)}}
async function listSourceFiles(pool,id){if(!await getSource(pool,id))throw sourceFileError('数据源不存在',404);const [rows]=await pool.query('SELECT id,source_id,file_name,size_bytes,sheet_count,created_at FROM data_source_files WHERE source_id=? ORDER BY id',[id]);return rows.map(mapSourceFile)}
async function readSourceUpload(req){
  const contentType=String(req.headers['content-type']||'')
  if(!contentType.startsWith('multipart/form-data;'))throw sourceFileError('请通过文件选择器上传文件')
  const chunks=[];let bytes=0
  for await(const chunk of req){bytes+=chunk.length;if(bytes>maxSourceFileBytes+65536)throw sourceFileError('文件不能超过 10 MB',413);chunks.push(chunk)}
  let form
  try{form=await new Request('http://localhost/upload',{method:'POST',headers:{'content-type':contentType},body:Buffer.concat(chunks)}).formData()}catch{throw sourceFileError('文件上传内容无效')}
  const file=form.get('file')
  if(!file||typeof file.arrayBuffer!=='function')throw sourceFileError('请选择文件')
  const name=String(file.name||'').split(/[\\/]/).pop().trim()
  if(!name||name.length>255||/[\x00-\x1f]/.test(name))throw sourceFileError('文件名无效')
  if(!/\.(csv|xlsx)$/i.test(name))throw sourceFileError('仅支持 CSV、XLSX 文件')
  if(!file.size||file.size>maxSourceFileBytes)throw sourceFileError('文件大小需在 10 MB 以内',413)
  return{name,mimeType:String(file.type||''),content:Buffer.from(await file.arrayBuffer())}
}
async function parseSourceWorkbook(name,content){
  const workbook=new ExcelJS.Workbook()
  try{
    if(/\.csv$/i.test(name))await workbook.csv.read(Readable.from([content]))
    else await workbook.xlsx.load(content)
  }catch{throw sourceFileError(`${name} 无法解析，请检查文件内容`,422)}
  const sheets=[]
  for(const sheet of workbook.worksheets){
    const header=sheet.getRow(1)
    if(header.cellCount>200)throw sourceFileError(`${name} 的字段数量不能超过 200`,422)
    const fields=[];const used=new Map()
    for(let index=1;index<=header.cellCount;index++){
      const label=String(header.getCell(index).text||'').trim()
      if(!label)continue
      const count=(used.get(label)||0)+1;used.set(label,count)
      fields.push(count===1?label:`${label}_${count}`)
    }
    if(fields.length)sheets.push({name:sheet.name,fields,rowCount:Math.max(0,sheet.actualRowCount-1)})
  }
  if(!sheets.length)throw sourceFileError(`${name} 没有可读取的表头`,422)
  return sheets
}
async function syncSourceFileName(connection,id){
  const [sources]=await connection.query('SELECT access_config FROM data_sources WHERE id=?',[id])
  const [files]=await connection.query('SELECT file_name FROM data_source_files WHERE source_id=? ORDER BY id LIMIT 1',[id])
  const config=parseJson(sources[0]?.access_config,{})
  await connection.query("UPDATE data_sources SET access_config=?,connection_status=?,connection_message=? WHERE id=?",[json({...config,fileName:files[0]?.file_name||''}),files.length?'正常':'未测试',files.length?'文件已解析，可启用使用':'请先上传并解析数据文件',id])
}
async function uploadSourceFile(pool,id,req){
  const source=await getSource(pool,id)
  if(!source)throw sourceFileError('数据源不存在',404)
  if(source.mode!=='文件导入'||source.status==='启用')throw sourceFileError('请先停用文件数据源，再添加文件',409)
  if(Number(source.file_count)>=maxSourceFiles)throw sourceFileError(`最多上传 ${maxSourceFiles} 个文件`,409)
  const {name,mimeType,content}=await readSourceUpload(req)
  const sheets=await parseSourceWorkbook(name,content)
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction()
    const [existing]=await connection.query('SELECT id FROM data_source_files WHERE source_id=? AND file_name=?',[id,name])
    if(existing.length){await connection.rollback();throw sourceFileError('同名文件已存在，请先移除后重新添加',409)}
    const [result]=await connection.query('INSERT INTO data_source_files (source_id,file_name,mime_type,size_bytes,content,sheet_count) VALUES (?,?,?,?,?,?)',[id,name,mimeType,content.length,content,sheets.length])
    const fileId=result.insertId
    for(let index=0;index<sheets.length;index++){
      const sheet=sheets[index]
      const label=/\.csv$/i.test(name)?name:`${name} · ${sheet.name}`
      await connection.query('INSERT INTO data_source_metadata (source_id,file_id,table_name,display_name,field_count,fields_json,summary) VALUES (?,?,?,?,?,?,?)',[id,fileId,`file_${fileId}_sheet_${index+1}`,label.slice(0,160),sheet.fields.length,json(sheet.fields),`${sheet.rowCount} 行 · ${sheet.fields.length} 个字段`.slice(0,500)])
    }
    await syncSourceFileName(connection,id)
    await connection.commit()
    const [rows]=await pool.query('SELECT id,source_id,file_name,size_bytes,sheet_count,created_at FROM data_source_files WHERE id=?',[fileId])
    return mapSourceFile(rows[0])
  }catch(error){await connection.rollback().catch(()=>undefined);if(error?.code==='ER_DUP_ENTRY')throw sourceFileError('同名文件已存在，请先移除后重新添加',409);throw error}finally{connection.release()}
}
async function deleteSourceFile(pool,id,fileId){
  const source=await getSource(pool,id)
  if(!source)throw sourceFileError('数据源不存在',404)
  if(source.status==='启用')throw sourceFileError('请先停用数据源，再移除文件',409)
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction()
    const [files]=await connection.query('SELECT id FROM data_source_files WHERE source_id=? AND id=? FOR UPDATE',[id,fileId])
    if(!files.length){await connection.rollback();throw sourceFileError('文件不存在',404)}
    const [mappings]=await connection.query('SELECT COUNT(*) AS total FROM semantic_mappings WHERE source_id=?',[id])
    if(Number(mappings[0].total)){await connection.rollback();throw sourceFileError('该数据源已有字段映射，请先移除映射后再删除文件',409)}
    await connection.query('DELETE FROM data_source_metadata WHERE source_id=? AND file_id=?',[id,fileId])
    await connection.query('DELETE FROM data_source_files WHERE source_id=? AND id=?',[id,fileId])
    await syncSourceFileName(connection,id)
    await connection.commit()
    return{ok:true,message:'文件已移除'}
  }catch(error){await connection.rollback().catch(()=>undefined);throw error}finally{connection.release()}
}
async function runSourceConnectionTest(mode,accessConfig){
  validateAccessConfig(mode,accessConfig)
  if(mode==='文件导入')throw Object.assign(new Error('文件导入无需测试连接'),{status:400})
  if(mode==='数据库接入'){
    if(accessConfig.databaseType!=='MySQL')throw Object.assign(new Error(`当前暂不支持${accessConfig.databaseType}连接测试，请使用 MySQL 或配置对应驱动`),{status:400})
    let connection
    try{
      connection=await mysql.createConnection({host:accessConfig.host,port:Number(accessConfig.port),user:accessConfig.username,password:accessConfig.password,database:accessConfig.databaseName,connectTimeout:8000})
      await connection.query({sql:'SELECT 1 AS connectivity_check',timeout:8000})
      return '数据库连接正常，已完成只读连通性检查'
    }catch(error){
      const reason=error?.code?`（${error.code}）`:''
      throw Object.assign(new Error(`数据库连接失败${reason}，请检查地址、端口、库名及账号权限`),{status:502})
    }finally{if(connection)await connection.end().catch(()=>undefined)}
  }
  if(mode==='接口接入'){
    let endpoint
    try{endpoint=new URL(accessConfig.apiUrl)}catch{throw Object.assign(new Error('接口地址格式无效'),{status:400})}
    if(!['http:','https:'].includes(endpoint.protocol))throw Object.assign(new Error('接口地址仅支持 HTTP 或 HTTPS'),{status:400})
    const headers={Accept:'application/json'}
    if(accessConfig.authType==='Token')headers.Authorization=`Bearer ${accessConfig.token}`
    if(accessConfig.authType==='API Key')headers['X-API-Key']=accessConfig.token
    if(accessConfig.authType==='Basic Auth'){
      if(!accessConfig.token.includes(':'))throw Object.assign(new Error('Basic Auth 请按“用户名:密码”填写密钥'),{status:400})
      headers.Authorization=`Basic ${Buffer.from(accessConfig.token).toString('base64')}`
    }
    const controller=new AbortController()
    const timeout=setTimeout(()=>controller.abort(),10000)
    try{
      const response=await fetch(endpoint,{method:accessConfig.method,headers,signal:controller.signal})
      await response.body?.cancel()
      if(!response.ok)throw Object.assign(new Error(`接口返回 HTTP ${response.status}，请检查地址、请求方式和认证配置`),{status:502})
      return `接口调用成功，HTTP ${response.status}`
    }catch(error){
      if(error?.status)throw error
      if(error?.name==='AbortError')throw Object.assign(new Error('接口调用超时（10秒），请检查服务是否可达'),{status:504})
      throw Object.assign(new Error('接口调用失败，请检查接口地址、网络和服务状态'),{status:502})
    }finally{clearTimeout(timeout)}
  }
  throw Object.assign(new Error('暂不支持该数据源接入方式的连接测试'),{status:400})
}
async function recordSourceTest(pool,id,source){
  try{
    const message=await runSourceConnectionTest(normalizeSourceMode(source.mode),normalizeAccessConfig(normalizeSourceMode(source.mode),parseJson(source.access_config,{})))
    await pool.query("UPDATE data_sources SET connection_status='正常',last_tested_at=NOW(),connection_message=? WHERE id=?",[message,id])
    return message
  }catch(error){
    const message=String(error?.message||'连接测试失败').slice(0,500)
    await pool.query("UPDATE data_sources SET connection_status='异常',last_tested_at=NOW(),connection_message=? WHERE id=?",[message,id])
    throw error
  }
}
async function testSourceConfig(pool,payload){const mode=normalizeSourceMode(payload.mode);if(mode==='文件导入')throw Object.assign(new Error('文件导入无需测试连接，请直接读取文件'),{status:400});const source=payload.sourceId?await getSource(pool,String(payload.sourceId)):null;if(payload.sourceId&&!source)throw Object.assign(new Error('数据源不存在'),{status:404});const accessConfig=sourceCandidateConfig(source,mode,payload.accessConfig);return{ok:true,message:await runSourceConnectionTest(mode,accessConfig)}}
async function testSource(pool,id){
  const result=await withSourceOperation(pool,id,getSource,async(connection,source)=>{try{await recordSourceTest(connection,id,source)}catch(error){return error}})
  if(result.error)throw result.error
  return{ok:true,message:result.source.connection_message,source:mapSource(result.source)}
}
async function toggleSource(pool,id,enabled){
  const result=await withSourceOperation(pool,id,getSource,async(connection,source)=>{
    if(!enabled){await connection.query("UPDATE data_sources SET status='停用' WHERE id=?",[id]);return}
    try{
    if(normalizeSourceMode(source.mode)==='文件导入'){
      const [files]=await connection.query('SELECT COUNT(*) AS total FROM data_source_files WHERE source_id=?',[id])
      const [objects]=await connection.query('SELECT COUNT(*) AS total FROM data_source_metadata WHERE source_id=? AND file_id IS NOT NULL',[id])
      if(!Number(files[0].total)||!Number(objects[0].total))throw sourceFileError('请先上传并解析至少一份数据文件',409)
      await connection.query("UPDATE data_sources SET status='启用',connection_status='正常',last_tested_at=NULL,connection_message='文件已接入，可用于图谱构建' WHERE id=?",[id])
    }else{
      await recordSourceTest(connection,id,source)
      await connection.query("UPDATE data_sources SET status='启用',connection_status='正常' WHERE id=?",[id])
    }
    }catch(error){
      if(normalizeSourceMode(source.mode)==='文件导入')await connection.query("UPDATE data_sources SET connection_status='异常',connection_message=? WHERE id=?",[error.message,id])
      return Object.assign(new Error(`启用失败：${error?.message||'连接测试未通过'}。使用状态保持不变，请检查配置后重试。`),{status:error?.status||502})
    }
  })
  if(result.error)throw result.error
  return mapSource(result.source)
}
async function metadata(pool,id){
  const source=await getSource(pool,id)
  if(!source)throw Object.assign(new Error('数据源不存在'),{status:404})
  const fileMode=normalizeSourceMode(source.mode)==='文件导入'
  const [rows]=await pool.query(`SELECT * FROM data_source_metadata WHERE source_id=?${fileMode?' AND file_id IS NOT NULL':''} ORDER BY table_name`,[id])
  return rows.map(mapMetadata)
}
async function parseMetadata(pool,id){const source=await getSource(pool,id);if(!source)throw Object.assign(new Error('数据源不存在'),{status:404});if(normalizeSourceMode(source.mode)==='文件导入')return metadata(pool,id);await seedMetadata(pool,id);await seedMappings(pool,id);return metadata(pool,id)}
async function mappings(pool,id,type=''){const params=[id];let where='WHERE sm.source_id=?';if(type){where+=' AND sm.mapping_type=?';params.push(type)}const [rows]=await pool.query(`SELECT sm.*,sms.revision,sms.status AS set_status,sms.last_validated_at FROM semantic_mappings sm LEFT JOIN semantic_mapping_sets sms ON sms.source_id=sm.source_id AND sms.ontology_id=sm.ontology_id ${where} ORDER BY sm.mapping_type,sm.id`,params);return rows.map(mapMapping)}
async function validateMappings(pool,id){return validateMappingsForOntology(pool,id,'ONT-PROC')}
async function getEnabledOntology(pool,id){const [rows]=await pool.query('SELECT id,name,status FROM ontologies WHERE id=?',[id]);if(!rows.length)throw Object.assign(new Error('图谱模型不存在'),{status:404});if(rows[0].status!=='启用')throw Object.assign(new Error('只有启用状态的图谱模型才能用于图谱构建'),{status:409});return {...rows[0],version:''}}
async function parseMetadataForOntology(pool,id,ontologyId){const source=await getSource(pool,id);if(!source)throw Object.assign(new Error('数据源不存在'),{status:404});await getEnabledOntology(pool,ontologyId);if(normalizeSourceMode(source.mode)!=='文件导入'){await seedMetadata(pool,id);await seedOntologyMappings(pool,id,ontologyId)}await ensureMappingSet(pool,id,ontologyId);await pool.query("UPDATE semantic_mapping_sets SET status='待校验',last_validated_at=NULL WHERE source_id=? AND ontology_id=?",[id,ontologyId]);return metadata(pool,id)}
async function getGraphEditDraft(pool,graphId){const [rows]=await pool.query('SELECT * FROM graph_edit_drafts WHERE graph_id=?',[graphId]);return rows[0]||null}
function draftMappingRows(draft,sourceId,ontologyId,type=''){return parseJson(draft?.mappings_snapshot,[]).filter((item)=>item.source_id===sourceId&&item.ontology_id===ontologyId&&(!type||item.mapping_type===type)).map((item)=>({...item,revision:Number(draft.mapping_revision||1),set_status:draft.dirty?'待发布修改':'已绑定',last_validated_at:null}))}
async function ensureGraphEditDraft(pool,graphId,graphRow=null){
  const existing=await getGraphEditDraft(pool,graphId)
  if(existing)return existing
  const [graphRows]=await pool.query('SELECT * FROM graph_versions WHERE id=?',[graphId])
  const graph=graphRow||graphRows[0]
  if(!graph)throw Object.assign(new Error('知识图谱生成结果不存在'),{status:404})
  const [links]=await pool.query('SELECT source_id FROM graph_version_sources WHERE graph_id=? ORDER BY source_id',[graphId])
  const sourceIds=links.map((item)=>item.source_id)
  const mappingsSnapshot=[]
  for(const sourceId of sourceIds){
    const [snapshots]=await pool.query('SELECT snapshot_json FROM graph_version_mapping_snapshots WHERE graph_id=? AND source_id=?',[graphId,sourceId])
    const snapshotRows=snapshots.length?parseJson(snapshots[0].snapshot_json,[]):(await pool.query('SELECT * FROM semantic_mappings WHERE source_id=? AND ontology_id=? ORDER BY mapping_type,id',[sourceId,graph.ontology_id]))[0]
    snapshotRows.forEach((item,index)=>mappingsSnapshot.push({...item,id:`DRAFT-${graphId}-${sourceId}-${index+1}`,source_id:sourceId,ontology_id:graph.ontology_id}))
  }
  const [setRows]=sourceIds.length?await pool.query('SELECT MAX(revision) AS revision FROM semantic_mapping_sets WHERE ontology_id=? AND source_id IN (?)',[graph.ontology_id,sourceIds]):[[{revision:1}]]
  const revision=Number(setRows[0]?.revision||1)
  await pool.query('INSERT INTO graph_edit_drafts (graph_id,graph_code,graph_name,graph_tag,ontology_id,data_range,source_ids_json,structure_snapshot,mappings_snapshot,dirty,mapping_revision) VALUES (?,?,?,?,?,?,?,?,?,0,?)',[graphId,graph.graph_code||graph.ontology_id,graph.graph_name||`${graph.ontology_id} 监管图谱`,normalizeGraphTag(graph.graph_tag),graph.ontology_id,graph.data_range,json(sourceIds),json(parseJson(graph.structure_snapshot,[])),json(mappingsSnapshot),revision])
  return getGraphEditDraft(pool,graphId)
}
async function updateGraphEditDraft(pool,graphId,patch={},bumpRevision=false){
  const draft=await ensureGraphEditDraft(pool,graphId)
  const next={...draft,...patch}
  const sourceIdsJson=json(parseJson(next.source_ids_json,[]))
  const structureSnapshotJson=json(parseJson(next.structure_snapshot,[]))
  const mappingsSnapshotJson=json(parseJson(next.mappings_snapshot,[]))
  await pool.query('UPDATE graph_edit_drafts SET graph_code=?,graph_name=?,graph_tag=?,ontology_id=?,data_range=?,source_ids_json=?,structure_snapshot=?,mappings_snapshot=?,dirty=1,mapping_revision=? WHERE graph_id=?',[next.graph_code,next.graph_name,normalizeGraphTag(next.graph_tag),next.ontology_id,next.data_range,sourceIdsJson,structureSnapshotJson,mappingsSnapshotJson,Number(next.mapping_revision||1)+(bumpRevision?1:0),graphId])
  return getGraphEditDraft(pool,graphId)
}
async function mappingsForOntology(pool,id,ontologyId,type='',graphId=''){
  if(graphId){const draft=await ensureGraphEditDraft(pool,graphId);return draftMappingRows(draft,id,ontologyId,type).map(mapMapping)}
  const params=[id,ontologyId];let where='WHERE sm.source_id=? AND sm.ontology_id=?';if(type){where+=' AND sm.mapping_type=?';params.push(type)}const [rows]=await pool.query(`SELECT sm.*,sms.revision,sms.status AS set_status,sms.last_validated_at FROM semantic_mappings sm LEFT JOIN semantic_mapping_sets sms ON sms.source_id=sm.source_id AND sms.ontology_id=sm.ontology_id ${where} ORDER BY sm.mapping_type,sm.id`,params);return rows.map(mapMapping)
}
async function updateGraphDraftMapping(pool,graphId,sourceId,mappingId,payload){
  const draft=await ensureGraphEditDraft(pool,graphId)
  const allRows=parseJson(draft.mappings_snapshot,[])
  const index=allRows.findIndex((item)=>String(item.id)===String(mappingId)&&item.source_id===sourceId)
  if(index<0)throw Object.assign(new Error('当前图谱的数据映射不存在'),{status:404})
  const current=allRows[index]
  const ontologyId=String(payload.ontologyId||current.ontology_id||draft.ontology_id).trim();if(!ontologyId)throw Object.assign(new Error('请选择图谱结构版本'),{status:400})
  await getEnabledOntology(pool,ontologyId)
  const mappingType=canonicalMappingType(current.mapping_type)
  const targetCode=String(payload.targetCode??current.target_code).trim();if(!targetCode)throw Object.assign(new Error('目标结构元素不能为空'),{status:400})
  const [targets]=await pool.query('SELECT element_type FROM ontology_elements WHERE ontology_id=? AND code=?',[ontologyId,targetCode]);assertMappingTarget(targets,payload.targetType,mappingType)
  const sourceField=String(payload.sourceField??current.source_field).trim();if(!sourceField)throw Object.assign(new Error('来源字段不能为空'),{status:400})
  allRows[index]={...current,ontology_id:ontologyId,mapping_type:mappingType,source_field:sourceField,target_code:targetCode,transform_rule:String(payload.transform??current.transform_rule),status:'待校验'}
  const saved=await updateGraphEditDraft(pool,graphId,{ontology_id:ontologyId,mappings_snapshot:json(allRows)},true)
  const updated=draftMappingRows(saved,sourceId,ontologyId).find((item)=>String(item.id)===String(mappingId))
  return updated?mapMapping(updated):undefined
}
async function updateMappingForOntology(pool,sourceId,mappingId,payload,graphId=''){
  if(graphId)return updateGraphDraftMapping(pool,graphId,sourceId,mappingId,payload)
  const ontologyId=String(payload.ontologyId||'').trim();if(!ontologyId)throw Object.assign(new Error('请选择图谱结构版本'),{status:400})
  await getEnabledOntology(pool,ontologyId)
  const [rows]=await pool.query('SELECT * FROM semantic_mappings WHERE id=? AND source_id=? AND ontology_id=?',[mappingId,sourceId,ontologyId]);if(!rows.length)throw Object.assign(new Error('数据映射不存在'),{status:404})
  const mappingType=canonicalMappingType(rows[0].mapping_type)
  const targetCode=String(payload.targetCode??rows[0].target_code).trim();if(!targetCode)throw Object.assign(new Error('目标结构元素不能为空'),{status:400})
  const [targets]=await pool.query('SELECT element_type FROM ontology_elements WHERE ontology_id=? AND code=?',[ontologyId,targetCode]);assertMappingTarget(targets,payload.targetType,mappingType)
  const sourceField=String(payload.sourceField??rows[0].source_field).trim();if(!sourceField)throw Object.assign(new Error('来源字段不能为空'),{status:400})
  await ensureMappingSet(pool,sourceId,ontologyId)
  await pool.query("UPDATE semantic_mappings SET mapping_type=?,source_field=?,target_code=?,transform_rule=?,status='待校验' WHERE id=?",[mappingType,sourceField,targetCode,String(payload.transform??rows[0].transform_rule),mappingId])
  await pool.query("UPDATE semantic_mapping_sets SET revision=revision+1,status='待校验',last_validated_at=NULL WHERE source_id=? AND ontology_id=?",[sourceId,ontologyId])
  return (await mappingsForOntology(pool,sourceId,ontologyId)).find((item)=>item.id===String(mappingId))
}
async function upsertGraphDraftMapping(pool,sourceId,payload,graphId){
  const draft=await ensureGraphEditDraft(pool,graphId)
  const ontologyId=String(payload.ontologyId||draft.ontology_id).trim();if(!ontologyId)throw Object.assign(new Error('请选择图谱结构版本'),{status:400})
  await getEnabledOntology(pool,ontologyId)
  const mappingType=canonicalMappingType(payload.type||'属性')
  const targetCode=String(payload.targetCode||'').trim();if(!targetCode)throw Object.assign(new Error(mappingType==='关系'?'目标图谱关系不能为空':mappingType==='实体类型'?'目标实体类型不能为空':'目标图谱属性不能为空'),{status:400})
  const sourceField=String(payload.sourceField||'').trim();if(!sourceField)throw Object.assign(new Error('来源字段不能为空'),{status:400})
  const [targets]=await pool.query('SELECT element_type FROM ontology_elements WHERE ontology_id=? AND code=?',[ontologyId,targetCode]);assertMappingTarget(targets,payload.targetType,mappingType)
  const allRows=parseJson(draft.mappings_snapshot,[])
  const mappingTypes=mappingType==='属性'?['属性','节点实例']:[mappingType]
  const existingIndex=allRows.findIndex((item)=>item.source_id===sourceId&&item.ontology_id===ontologyId&&mappingTypes.includes(canonicalMappingType(item.mapping_type))&&item.target_code===targetCode)
  if(existingIndex>=0)return updateGraphDraftMapping(pool,graphId,sourceId,allRows[existingIndex].id,{ontologyId,targetCode,targetType:payload.targetType,sourceField,transform:payload.transform})
  allRows.push({id:`DRAFT-${graphId}-${sourceId}-${Date.now()}-${Math.floor(Math.random()*1000)}`,source_id:sourceId,ontology_id:ontologyId,mapping_type:mappingType,source_field:sourceField,transform_rule:String(payload.transform||'直接映射'),target_code:targetCode,confidence:100,status:'待校验'})
  const saved=await updateGraphEditDraft(pool,graphId,{ontology_id:ontologyId,mappings_snapshot:json(allRows)},true)
  const created=draftMappingRows(saved,sourceId,ontologyId).find((item)=>item.target_code===targetCode&&canonicalMappingType(item.mapping_type)===mappingType)
  return created?mapMapping(created):undefined
}
async function upsertMappingForOntology(pool,sourceId,payload,graphId=''){
  if(graphId)return upsertGraphDraftMapping(pool,sourceId,payload,graphId)
  const ontologyId=String(payload.ontologyId||'').trim();if(!ontologyId)throw Object.assign(new Error('请选择图谱结构版本'),{status:400})
  await getEnabledOntology(pool,ontologyId)
  const mappingType=canonicalMappingType(payload.type||'属性')
  const targetCode=String(payload.targetCode||'').trim();if(!targetCode)throw Object.assign(new Error(mappingType==='关系'?'目标图谱关系不能为空':mappingType==='实体类型'?'目标实体类型不能为空':'目标图谱属性不能为空'),{status:400})
  const sourceField=String(payload.sourceField||'').trim();if(!sourceField)throw Object.assign(new Error('来源字段不能为空'),{status:400})
  const [targets]=await pool.query("SELECT element_type FROM ontology_elements WHERE ontology_id=? AND code=?",[ontologyId,targetCode]);assertMappingTarget(targets,payload.targetType,mappingType)
  const mappingTypes=mappingType==='属性'?['属性','节点实例']:[mappingType];const placeholders=mappingTypes.map(()=>'?').join(',');const [existing]=await pool.query(`SELECT id FROM semantic_mappings WHERE source_id=? AND ontology_id=? AND mapping_type IN (${placeholders}) AND target_code=? ORDER BY id LIMIT 1`,[sourceId,ontologyId,...mappingTypes,targetCode])
  if(existing.length)return updateMappingForOntology(pool,sourceId,existing[0].id,{ontologyId,targetCode,targetType:payload.targetType,sourceField,transform:payload.transform})
  await ensureMappingSet(pool,sourceId,ontologyId)
  const [result]=await pool.query("INSERT INTO semantic_mappings (source_id,ontology_id,mapping_type,source_field,transform_rule,target_code,confidence,status) VALUES (?,?,?,?,?,?,100,'待校验')",[sourceId,ontologyId,mappingType,sourceField,String(payload.transform||'直接映射'),targetCode])
  await pool.query("UPDATE semantic_mapping_sets SET revision=revision+1,status='待校验',last_validated_at=NULL WHERE source_id=? AND ontology_id=?",[sourceId,ontologyId])
  return (await mappingsForOntology(pool,sourceId,ontologyId)).find((item)=>item.id===String(result.insertId))
}
async function deleteGraphDraftMapping(pool,sourceId,mappingId,ontologyId,graphId){
  const draft=await ensureGraphEditDraft(pool,graphId)
  const allRows=parseJson(draft.mappings_snapshot,[])
  const nextRows=allRows.filter((item)=>!(String(item.id)===String(mappingId)&&item.source_id===sourceId&&item.ontology_id===ontologyId))
  if(nextRows.length===allRows.length)throw Object.assign(new Error('当前图谱的数据映射不存在'),{status:404})
  await updateGraphEditDraft(pool,graphId,{mappings_snapshot:json(nextRows)},true)
  return{ok:true,message:'映射规则已移除'}
}
async function deleteMappingForOntology(pool,sourceId,mappingId,ontologyId,graphId=''){
  if(graphId)return deleteGraphDraftMapping(pool,sourceId,mappingId,String(ontologyId||'').trim(),graphId)
  ontologyId=String(ontologyId||'').trim();if(!ontologyId)throw Object.assign(new Error('请选择图谱结构版本'),{status:400})
  await getEnabledOntology(pool,ontologyId)
  const [rows]=await pool.query('SELECT id FROM semantic_mappings WHERE id=? AND source_id=? AND ontology_id=?',[mappingId,sourceId,ontologyId]);if(!rows.length)throw Object.assign(new Error('数据映射不存在'),{status:404})
  await ensureMappingSet(pool,sourceId,ontologyId)
  await pool.query('DELETE FROM semantic_mappings WHERE id=? AND source_id=? AND ontology_id=?',[mappingId,sourceId,ontologyId])
  await pool.query("UPDATE semantic_mapping_sets SET revision=revision+1,status='待校验',last_validated_at=NULL WHERE source_id=? AND ontology_id=?",[sourceId,ontologyId])
  return{ok:true,message:'映射规则已移除'}
}
async function countMissingRequiredMappings(pool,id,ontologyId,structureElements,graphId=''){
  const requiredCodes=requiredStructureCodes(structureElements)
  if(graphId){
    const draft=await ensureGraphEditDraft(pool,graphId)
    const rows=draftMappingRows(draft,id,ontologyId).filter((item)=>item.type==='属性')
    const mapped=new Map(rows.map((item)=>[item.targetCode,item.sourceField]))
    if(requiredCodes.length)return requiredCodes.filter((code)=>!String(mapped.get(code)||'').trim()).length
    return 0
  }
  if(requiredCodes.length){
    const placeholders=requiredCodes.map(()=>'?').join(',')
    const [rows]=await pool.query(`SELECT target_code,source_field FROM semantic_mappings WHERE source_id=? AND ontology_id=? AND mapping_type IN ('属性','节点实例') AND target_code IN (${placeholders})`,[id,ontologyId,...requiredCodes])
    const mapped=new Map(rows.map((item)=>[item.target_code,item.source_field]))
    return requiredCodes.filter((code)=>!String(mapped.get(code)||'').trim()).length
  }
  const [missingRows]=await pool.query("SELECT COUNT(*) AS total FROM ontology_elements oe LEFT JOIN semantic_mappings sm ON sm.source_id=? AND sm.ontology_id=oe.ontology_id AND sm.mapping_type IN ('属性','节点实例') AND sm.target_code=oe.code WHERE oe.ontology_id=? AND oe.element_type='property' AND (oe.constraint_desc LIKE '%必填%' OR oe.constraint_desc LIKE '%主标识%') AND (sm.id IS NULL OR sm.source_field='')",[id,ontologyId])
  return Number(missingRows[0].total)
}
async function validateMappingsForOntology(pool,id,ontologyId,structureElements){
  await getEnabledOntology(pool,ontologyId)
  const [rows]=await pool.query("SELECT COUNT(*) AS total FROM semantic_mappings WHERE source_id=? AND ontology_id=? AND mapping_type IN ('实体类型','属性','节点实例','关系')",[id,ontologyId]);if(!Number(rows[0].total))throw Object.assign(new Error('当前数据源与图谱结构暂无可校验数据映射'),{status:409})
  const [invalid]=await pool.query("SELECT sm.id FROM semantic_mappings sm LEFT JOIN ontology_elements oe ON oe.ontology_id=sm.ontology_id AND oe.code=sm.target_code WHERE sm.source_id=? AND sm.ontology_id=? AND sm.mapping_type IN ('实体类型','属性','节点实例','关系') AND oe.element_id IS NOT NULL AND ((sm.mapping_type='实体类型' AND oe.element_type<>'class') OR (sm.mapping_type IN ('属性','节点实例') AND oe.element_type<>'property') OR (sm.mapping_type='关系' AND oe.element_type<>'relation'))",[id,ontologyId]);if(invalid.length)throw Object.assign(new Error(`存在${invalid.length}条数据映射目标无效，请先修正`),{status:409})
  const missingRequired=await countMissingRequiredMappings(pool,id,ontologyId,structureElements);if(missingRequired)throw Object.assign(new Error(`存在${missingRequired}个必填图谱字段未匹配来源字段，请先配置`),{status:409})
  const [emptyRules]=await pool.query("SELECT id FROM semantic_mappings WHERE source_id=? AND ontology_id=? AND mapping_type IN ('实体类型','属性','节点实例','关系') AND (source_field='' OR transform_rule='')",[id,ontologyId]);if(emptyRules.length)throw Object.assign(new Error(`存在${emptyRules.length}条数据映射缺少来源字段或转换规则，请先修正`),{status:409})
  await ensureMappingSet(pool,id,ontologyId)
  await pool.query("UPDATE semantic_mappings sm JOIN ontology_elements oe ON oe.ontology_id=sm.ontology_id AND oe.code=sm.target_code AND oe.element_type='class' SET sm.status='有效' WHERE sm.source_id=? AND sm.ontology_id=? AND sm.mapping_type='实体类型'",[id,ontologyId])
  await pool.query("UPDATE semantic_mappings sm JOIN ontology_elements oe ON oe.ontology_id=sm.ontology_id AND oe.code=sm.target_code AND oe.element_type='property' SET sm.status='有效' WHERE sm.source_id=? AND sm.ontology_id=? AND sm.mapping_type IN ('属性','节点实例')",[id,ontologyId])
  await pool.query("UPDATE semantic_mappings sm JOIN ontology_elements oe ON oe.ontology_id=sm.ontology_id AND oe.code=sm.target_code AND oe.element_type='relation' SET sm.status='有效' WHERE sm.source_id=? AND sm.ontology_id=? AND sm.mapping_type='关系'",[id,ontologyId])
  await pool.query("UPDATE semantic_mappings sm LEFT JOIN ontology_elements oe ON oe.ontology_id=sm.ontology_id AND oe.code=sm.target_code SET sm.status='有效' WHERE sm.source_id=? AND sm.ontology_id=? AND sm.mapping_type IN ('实体类型','属性','节点实例','关系') AND oe.element_id IS NULL",[id,ontologyId])
  await pool.query("UPDATE semantic_mapping_sets SET status='有效',last_validated_at=NOW() WHERE source_id=? AND ontology_id=?",[id,ontologyId])
  const set=await ensureMappingSet(pool,id,ontologyId);return{ok:true,message:`数据映射 R${set.revision} 校验通过`,revision:Number(set.revision),status:set.status,lastValidatedAt:formatTime(set.last_validated_at)}
}
async function checkGraphDependencies(pool,payload){const ontologyId=String(payload.ontologyId||'').trim();if(!ontologyId)throw Object.assign(new Error('请选择启用状态的图谱结构'),{status:400});await getEnabledOntology(pool,ontologyId);return assessSelectedSources(pool,ontologyId,payload.sourceIds,payload.structureElements,payload.graphId||'')}
async function graphAutoMappingPreview(pool,payload){
  const ontologyId=String(payload.ontologyId||'').trim()
  if(!ontologyId)throw Object.assign(new Error('请先选择图谱模型'),{status:400})
  await getEnabledOntology(pool,ontologyId)
  const sourceIds=[...new Set((Array.isArray(payload.sourceIds)?payload.sourceIds:[]).map((item)=>String(item).trim()).filter(Boolean))]
  if(!sourceIds.length)throw Object.assign(new Error('请先选择候选数据源'),{status:400})
  const [rows]=await pool.query(`SELECT id,name,status FROM data_sources WHERE id IN (${sourceIds.map(()=>'?').join(',')})`,sourceIds)
  if(rows.length!==sourceIds.length)throw Object.assign(new Error('部分候选数据源不存在'),{status:409})
  const byId=new Map(rows.map((row)=>[row.id,row]))
  const sources=sourceIds.map((id)=>byId.get(id)).filter((source)=>source.status==='启用')
  const graphId=String(payload.graphId||'').trim()
  const draft=graphId?await ensureGraphEditDraft(pool,graphId):null
  const metadataBySource=new Map()
  const mappingsBySource=new Map()
  for(const source of sources){
    metadataBySource.set(source.id,await metadata(pool,source.id))
    mappingsBySource.set(source.id,graphId?draftMappingRows(draft,source.id,ontologyId):(await pool.query('SELECT * FROM semantic_mappings WHERE source_id=? AND ontology_id=?',[source.id,ontologyId]))[0])
  }
  const structure=normalizeStructureElements(payload.structureElements)
  return suggestGraphMappings(structure,sources,metadataBySource,mappingsBySource)
}
async function applyGraphAutoMapping(pool,payload){
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction()
    const graphId=String(payload.graphId||'').trim()
    if(graphId){await ensureGraphEditDraft(connection,graphId);await connection.query('SELECT graph_id FROM graph_edit_drafts WHERE graph_id=? FOR UPDATE',[graphId])}
    const preview=await graphAutoMappingPreview(connection,payload)
    const ontologyId=String(payload.ontologyId||'').trim()
    const additions=[]
    for(const item of preview.entities){
      additions.push({sourceId:item.sourceId,type:'实体类型',targetCode:item.targetCode,sourceField:item.tableName,transform:`主键字段：${item.keyField}`})
      for(const property of item.properties)additions.push({sourceId:item.sourceId,type:'属性',targetCode:property.targetCode,sourceField:property.sourceField,transform:'直接映射'})
    }
    for(const item of preview.relations)additions.push({sourceId:item.sourceId,type:'关系',targetCode:item.targetCode,sourceField:item.sourceField,transform:item.transform})
    if(graphId){
      const draft=await getGraphEditDraft(connection,graphId)
      const rows=parseJson(draft.mappings_snapshot,[])
      for(const [index,item] of additions.entries()){
        if(rows.some((row)=>row.source_id===item.sourceId&&canonicalMappingType(row.mapping_type)===item.type&&row.target_code===item.targetCode))continue
        rows.push({id:`DRAFT-${graphId}-${item.sourceId}-AUTO-${Date.now()}-${index}`,source_id:item.sourceId,ontology_id:ontologyId,mapping_type:item.type,source_field:item.sourceField,transform_rule:item.transform,target_code:item.targetCode,confidence:100,status:'待校验'})
      }
      if(additions.length)await updateGraphEditDraft(connection,graphId,{mappings_snapshot:json(rows)},true)
    }else{
      for(const item of additions){
        await ensureMappingSet(connection,item.sourceId,ontologyId)
        const [existing]=await connection.query('SELECT id FROM semantic_mappings WHERE source_id=? AND ontology_id=? AND mapping_type=? AND target_code=?',[item.sourceId,ontologyId,item.type,item.targetCode])
        if(existing.length)continue
        await connection.query("INSERT INTO semantic_mappings (source_id,ontology_id,mapping_type,source_field,transform_rule,target_code,confidence,status) VALUES (?,?,?,?,?,?,100,'待校验')",[item.sourceId,ontologyId,item.type,item.sourceField,item.transform,item.targetCode])
        await connection.query("UPDATE semantic_mapping_sets SET revision=revision+1,status='待校验',last_validated_at=NULL WHERE source_id=? AND ontology_id=?",[item.sourceId,ontologyId])
      }
    }
    await connection.commit()
    return {entities:preview.entities.length,relations:preview.relations.length,skippedEntities:preview.skippedEntities,skippedRelations:preview.skippedRelations}
  }catch(error){await connection.rollback();throw error}finally{connection.release()}
}
const graphSelect=`SELECT gv.*,(SELECT GROUP_CONCAT(gvs.source_id ORDER BY gvs.source_id) FROM graph_version_sources gvs WHERE gvs.graph_id=gv.id) AS source_ids,(SELECT GROUP_CONCAT(ds.name ORDER BY ds.id) FROM graph_version_sources gvs JOIN data_sources ds ON ds.id=gvs.source_id WHERE gvs.graph_id=gv.id) AS source_names,ged.graph_id AS draft_graph_id,ged.graph_code AS draft_graph_code,ged.graph_name AS draft_graph_name,ged.graph_tag AS draft_graph_tag,ged.ontology_id AS draft_ontology_id,ged.data_range AS draft_data_range,ged.source_ids_json AS draft_source_ids,ged.structure_snapshot AS draft_structure_snapshot,ged.dirty AS draft_dirty FROM graph_versions gv LEFT JOIN graph_edit_drafts ged ON ged.graph_id=gv.id`
function graphStatusFilter(status,column,params){if(status==='草稿'||status==='生成失败'){params.push('草稿','生成失败','失败','校验中');return `${column} IN (?,?,?,?)`}params.push(status);return `${column}=?`}
async function listGraphVersions(pool,url){const status=String(url.searchParams.get('status')||'');const params=[];let where='';if(status){where=` WHERE ${graphStatusFilter(status,'gv.status',params)}`}else{where=' WHERE gv.status<>?';params.push('已归档')}const [rows]=await pool.query(`${graphSelect}${where} ORDER BY gv.updated_at DESC,gv.id DESC`,params);return withGraphSyncMetadata(pool,rows.map(mapGraphVersion))}
async function getGraphVersion(pool,id){const [rows]=await pool.query(`${graphSelect} WHERE gv.id=?`,[id]);if(!rows.length)return null;const graph=mapGraphVersion(rows[0]);const [datasets]=await pool.query('SELECT dataset_json,source_stats_json,synced_at FROM graph_instance_datasets WHERE graph_id=?',[id]);if(datasets.length){graph.instanceDataset=parseJson(datasets[0].dataset_json,{nodes:[],relations:[]});graph.sourceStats=parseJson(datasets[0].source_stats_json,[]);graph.syncedAt=formatTime(datasets[0].synced_at)}return (await withGraphSyncMetadata(pool,[graph]))[0]}
async function graphVersionDetail(pool,id){const graph=await getGraphVersion(pool,id);if(!graph)throw Object.assign(new Error('知识图谱生成结果不存在'),{status:404});return graph}
async function materializeGraph(pool,sourceIds,ontologyId,structureElements,graphId=''){
  const uniqueIds=[...new Set(sourceIds)]
  const [rows]=await pool.query(`SELECT id,name,mode,status,access_config FROM data_sources WHERE id IN (${uniqueIds.map(()=>'?').join(',')})`,uniqueIds)
  const byId=new Map(rows.map((row)=>[row.id,row]))
  if(byId.size!==uniqueIds.length)throw Object.assign(new Error('部分数据源不存在'),{status:409})
  const draft=graphId?await getGraphEditDraft(pool,graphId):null
  const mappings=new Map()
  for(const id of uniqueIds){
    const rows=graphId?draftMappingRows(draft,id,ontologyId):(await pool.query('SELECT mapping_type,source_field,transform_rule,target_code FROM semantic_mappings WHERE source_id=? AND ontology_id=?',[id,ontologyId]))[0]
    mappings.set(id,rows)
  }
  return buildGraphDataset(pool,uniqueIds.map((id)=>byId.get(id)),mappings,structureElements)
}
async function syncGraphVersion(pool,id){
  const result=await runTrackedGraphSync(pool,id,async(connection)=>{
    const [rows]=await connection.query('SELECT * FROM graph_versions WHERE id=? FOR UPDATE',[id])
    if(!rows.length)throw Object.assign(new Error('知识图谱不存在'),{status:404})
    const graph=rows[0]
    if(!['待发布','已发布'].includes(graph.status))throw Object.assign(new Error('请先完成图谱配置和数据映射，再同步数据'),{status:409})
    const [drafts]=await connection.query('SELECT dirty FROM graph_edit_drafts WHERE graph_id=?',[id])
    if(drafts.some((item)=>item.dirty))throw Object.assign(new Error('存在未保存的映射修改，请先生成图谱'),{status:409})
    const dependencies=await validateGraphDependencies(connection,graph)
    const [sources]=await connection.query(`SELECT id,name,mode,status,access_config FROM data_sources WHERE id IN (${dependencies.sourceIds.map(()=>'?').join(',')})`,dependencies.sourceIds)
    const sourceMap=new Map(sources.map((source)=>[source.id,source]))
    const [snapshots]=await connection.query('SELECT source_id,snapshot_json FROM graph_version_mapping_snapshots WHERE graph_id=?',[id])
    const mappings=new Map(snapshots.map((item)=>[item.source_id,parseJson(item.snapshot_json,[])]))
    const dataset=await buildGraphDataset(connection,dependencies.sourceIds.map((sourceId)=>sourceMap.get(sourceId)),mappings,normalizeStructureElements(parseJson(graph.structure_snapshot,[])))
    let resultId=id
    if(graph.status==='已发布'){
      const date=new Date().toISOString().slice(0,10).replaceAll('-','')
      const [numbers]=await connection.query("SELECT MAX(CAST(SUBSTRING_INDEX(id,'.',-1) AS UNSIGNED)) AS suffix FROM graph_versions WHERE id LIKE ?",[`GRAPH-${date}.%`])
      resultId=`GRAPH-${date}.${Number(numbers[0].suffix||0)+1}`
      await connection.query("INSERT INTO graph_versions (id,graph_code,graph_name,graph_tag,structure_snapshot,ontology_id,ontology_version,mapping_version,data_range,entity_count,relation_count,event_count,blockers,warnings,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,0,0,0,'待发布')",[resultId,graph.graph_code,graph.graph_name,graph.graph_tag,graph.structure_snapshot,graph.ontology_id,graph.ontology_version,graph.mapping_version,graph.data_range,dataset.nodes.length,dataset.relations.length])
      for(const sourceId of dependencies.sourceIds)await connection.query('INSERT INTO graph_version_sources (graph_id,source_id) VALUES (?,?)',[resultId,sourceId])
      await connection.query('INSERT INTO graph_version_mapping_snapshots (graph_id,source_id,ontology_id,mapping_revision,mapping_status,mapping_count,snapshot_json) SELECT ?,source_id,ontology_id,mapping_revision,mapping_status,mapping_count,snapshot_json FROM graph_version_mapping_snapshots WHERE graph_id=?',[resultId,id])
    }else{
      await connection.query('UPDATE graph_versions SET entity_count=?,relation_count=?,event_count=0 WHERE id=?',[dataset.nodes.length,dataset.relations.length,id])
    }
    await saveGraphDataset(connection,resultId,dataset)
    for(const item of dataset.sourceStats)await connection.query("UPDATE data_sources SET last_success='刚刚' WHERE id=?",[item.sourceId])
    return {id:resultId,entities:dataset.nodes.length,relations:dataset.relations.length}
  })
  return getGraphVersion(pool,result.id)
}
async function saveGraphDataset(connection,graphId,dataset){await connection.query('INSERT INTO graph_instance_datasets (graph_id,dataset_json,source_stats_json,synced_at) VALUES (?,?,?,NOW()) ON DUPLICATE KEY UPDATE dataset_json=VALUES(dataset_json),source_stats_json=VALUES(source_stats_json),synced_at=NOW()',[graphId,json({nodes:dataset.nodes,relations:dataset.relations}),json(dataset.sourceStats)])}
async function listGraphMappingSnapshots(pool,id){await graphVersionDetail(pool,id);const [rows]=await pool.query('SELECT * FROM graph_version_mapping_snapshots WHERE graph_id=? ORDER BY source_id',[id]);return rows.map(mapMappingSnapshot)}
async function assessSelectedSources(connection,ontologyId,sourceIds,structureElements,graphId=''){
  const uniqueIds=[...new Set((Array.isArray(sourceIds)?sourceIds:[]).map((item)=>String(item).trim()).filter(Boolean))]
  if(!uniqueIds.length)return{ready:false,ontologyId,items:[],issues:['请至少选择一个数据源'],mappedEntityCount:0,mappedRelationCount:0}
  const placeholders=uniqueIds.map(()=>'?').join(',')
  const [sources]=await connection.query(`SELECT id,name,status FROM data_sources WHERE id IN (${placeholders})`,uniqueIds)
  if(sources.length!==uniqueIds.length)throw Object.assign(new Error('部分数据源不存在或已被删除'),{status:409})
  const sourceMap=new Map(sources.map((item)=>[item.id,item]))
  const draft=graphId?await ensureGraphEditDraft(connection,graphId):null
  const items=[]
  const mappingsBySource=new Map()
  for(const sourceId of uniqueIds){
    const source=sourceMap.get(sourceId)
    const [rawRows]=graphId?[draftMappingRows(draft,sourceId,ontologyId)]:await connection.query("SELECT * FROM semantic_mappings WHERE source_id=? AND ontology_id=? AND mapping_type IN ('实体类型','属性','节点实例','关系')",[sourceId,ontologyId])
    if(!rawRows.some((row)=>['实体类型','关系'].includes(canonicalMappingType(row.mapping_type))))continue
    const set=await ensureMappingSet(connection,sourceId,ontologyId)
    mappingsBySource.set(sourceId,rawRows)
    const rows=rawRows.map(mapMapping)
    const [invalidRows]=graphId?[[{total:rows.filter((item)=>item.type==='实体类型'&&!item.targetCode||item.type==='属性'&&!item.targetCode||item.type==='关系'&&!item.targetCode).length}]]:await connection.query("SELECT COUNT(*) AS total FROM semantic_mappings sm LEFT JOIN ontology_elements oe ON oe.ontology_id=sm.ontology_id AND oe.code=sm.target_code WHERE sm.source_id=? AND sm.ontology_id=? AND sm.mapping_type IN ('实体类型','属性','节点实例','关系') AND oe.element_id IS NOT NULL AND ((sm.mapping_type='实体类型' AND oe.element_type<>'class') OR (sm.mapping_type IN ('属性','节点实例') AND oe.element_type<>'property') OR (sm.mapping_type='关系' AND oe.element_type<>'relation'))",[sourceId,ontologyId])
    const resolvedTotal=rows.length
    const resolvedValid=rows.filter((item)=>item.status==='有效').length
    const entityRows=rows.filter((item)=>item.type==='实体类型')
    const resolvedEntityTypeTotal=entityRows.length
    const resolvedFieldTotal=rows.filter((item)=>item.type==='属性').length
    const resolvedRelationTotal=rows.filter((item)=>item.type==='关系').length
    const invalid=Number(invalidRows[0].total)
    let status='ready'
    const revision=graphId?Number(draft.mapping_revision||1):Number(set.revision||1)
    let message=`数据映射 R${revision} 已就绪，实体类型 ${resolvedEntityTypeTotal} 条，属性 ${resolvedFieldTotal} 条，关系 ${resolvedRelationTotal} 条`
    if(source.status!=='启用'){status='disabled';message=`数据源 ${source.name} 尚未启用`}
    else if(!resolvedTotal){status='missing';message=`${source.name} 尚未配置当前图谱结构的数据映射`}
    else if(!entityRows.length&&!rows.some((item)=>item.type==='关系')){status='missing';message=`${source.name} 尚未配置实体或关系映射`}
    else if(invalid){status='invalid';message=`${source.name} 存在${invalid}条无效数据映射`}
    else if(entityRows.some((item)=>!String(item.transform||'').match(/主键字段[：:]\s*([^；;]+)/)?.[1]?.trim())){status='invalid';message=`${source.name} 的实体映射缺少唯一标识字段`}
    else if(entityRows.length){
      const sourceMetadata=await metadata(connection,sourceId)
      const missingEntity=entityRows.find((item)=>{const table=sourceMetadata.find((entry)=>entry.tableName===item.sourceField);const key=String(item.transform||'').match(/主键字段[：:]\s*([^；;]+)/)?.[1]?.trim();return !table||!table.fields.includes(key)})
      if(missingEntity){status='invalid';message=`${source.name} 的 ${missingEntity.targetCode} 来源表或唯一标识字段已失效`}
      else{
        const properties=rows.filter((item)=>item.type==='属性')
        const missingProperty=properties.find((item)=>{const property=normalizeStructureElements(structureElements).find((element)=>element.type==='property'&&element.code===item.targetCode);const entity=entityRows.find((entry)=>entry.targetCode===property?.ownerCode);if(!entity)return false;const table=sourceMetadata.find((entry)=>entry.tableName===entity.sourceField);return !table?.fields.includes(item.sourceField)})
        if(missingProperty){status='invalid';message=`${source.name} 的 ${missingProperty.targetCode} 来源字段已失效`}
      }
    }
    items.push({sourceId,sourceName:source.name,sourceStatus:source.status,status,revision,lastValidatedAt:graphId?'—':set.last_validated_at?formatTime(set.last_validated_at):'—',mappingCount:resolvedTotal,validCount:resolvedValid,message})
  }
  const elements=normalizeStructureElements(structureElements)
  const participatingMappings=new Map([...mappingsBySource].filter(([sourceId])=>items.some((item)=>item.sourceId===sourceId&&item.status==='ready')))
  const coverage=assessGraphMappingCoverage(elements,participatingMappings)
  const mappedEntities=new Set(coverage.mappedEntityCodes)
  const mappedProperties=new Set(coverage.mappedPropertyCodes)
  const relationRows=[...participatingMappings.values()].flat().filter((row)=>row.mapping_type==='关系')
  const issues=[]
  const invalidRelationCodes=new Set()
  if(!mappedEntities.size)issues.push('请至少完成一个实体类型映射')
  if(coverage.missingRequiredCodes.length)issues.push(`已映射实体类型中有 ${coverage.missingRequiredCodes.length} 个必填属性尚未从候选数据源匹配：${coverage.missingRequiredCodes.slice(0,3).join('、')}${coverage.missingRequiredCodes.length>3?' 等':''}`)
  for(const row of relationRows){
    const relation=elements.find((item)=>item.type==='relation'&&item.code===row.target_code)
    if(!relation||!mappedEntities.has(relation.ownerCode)||!mappedEntities.has(relation.targetCode)){issues.push(`${relation?.name||row.target_code} 的起点或终点实体尚未映射`);invalidRelationCodes.add(row.target_code);continue}
    if(/关联方式[：:]\s*关系表/.test(row.transform_rule||'')){
      const start=String(row.transform_rule||'').match(/起点字段[：:]\s*([^；;]+)/)?.[1]?.trim()
      const end=String(row.transform_rule||'').match(/终点字段[：:]\s*([^；;]+)/)?.[1]?.trim()
      const sourceMetadata=await metadata(connection,row.source_id)
      const table=sourceMetadata.find((item)=>item.tableName===row.source_field)
      if(!table||!start||!end||!table.fields.includes(start)||!table.fields.includes(end)){issues.push(`${relation.name} 的关系表或两端标识字段无效`);invalidRelationCodes.add(row.target_code)}
    }else{
      const [ownerCode,targetCode]=String(row.source_field||'').split(/\s*=\s*|\s*\+\s*/).map((item)=>item.trim())
      const owner=elements.find((item)=>item.type==='property'&&item.code===ownerCode&&item.ownerCode===relation.ownerCode)
      const target=elements.find((item)=>item.type==='property'&&item.code===targetCode&&item.ownerCode===relation.targetCode)
      if(!owner||!target||!mappedProperties.has(ownerCode)||!mappedProperties.has(targetCode)){issues.push(`${relation.name} 的关联属性尚未完成映射`);invalidRelationCodes.add(row.target_code)}
    }
  }
  const completeEntities=new Set([...mappedEntities].filter((code)=>!elements.some((item)=>item.type==='property'&&item.ownerCode===code&&coverage.missingRequiredCodes.includes(item.code))))
  const completeRelations=new Set(relationRows.filter((row)=>{const relation=elements.find((item)=>item.type==='relation'&&item.code===row.target_code);return relation&&!invalidRelationCodes.has(row.target_code)&&completeEntities.has(relation.ownerCode)&&completeEntities.has(relation.targetCode)}).map((row)=>row.target_code))
  return{ready:items.length>0&&items.every((item)=>item.status==='ready')&&!issues.length,ontologyId,items,issues,mappedEntityCount:completeEntities.size,mappedRelationCount:completeRelations.size}
}
async function validateSelectedSources(connection,ontologyId,sourceIds,structureElements,graphId=''){if(!Array.isArray(sourceIds)||!sourceIds.length)throw Object.assign(new Error('请至少选择一个启用状态的数据源'),{status:400});const assessment=await assessSelectedSources(connection,ontologyId,sourceIds,structureElements,graphId);if(!assessment.ready){const blocked=assessment.items.find((item)=>item.status!=='ready');throw Object.assign(new Error(blocked?.message||assessment.issues[0]||'请先完成数据映射'),{status:409})}return{sourceIds:assessment.items.map((item)=>item.sourceId),mappingCount:assessment.items.reduce((sum,item)=>sum+item.mappingCount,0),items:assessment.items}}
async function validateGraphDependencies(connection,graph){
  await getEnabledOntology(connection,graph.ontology_id)
  const [links]=await connection.query('SELECT gvs.source_id,ds.name,ds.status FROM graph_version_sources gvs JOIN data_sources ds ON ds.id=gvs.source_id WHERE gvs.graph_id=? ORDER BY gvs.source_id',[graph.id]);if(!links.length)throw Object.assign(new Error('知识图谱未绑定数据源'),{status:409})
  const disabled=links.filter((item)=>item.status!=='启用');if(disabled.length)throw Object.assign(new Error(`数据源 ${disabled.map((item)=>item.name).join('、')} 尚未启用`),{status:409})
  const [snapshots]=await connection.query('SELECT source_id FROM graph_version_mapping_snapshots WHERE graph_id=?',[graph.id]);if(snapshots.length!==links.length)throw Object.assign(new Error('知识图谱缺少完整的数据映射快照'),{status:409})
  return{sourceIds:links.map((item)=>item.source_id),snapshotCount:snapshots.length}
}
async function createGraphVersion(pool,payload){
  const graphCode=String(payload.graphCode||'').trim().toUpperCase();const graphName=String(payload.graphName||'').trim();const graphTag=normalizeGraphTag(payload.tag);const ontologyId=String(payload.ontologyId||'').trim();const range=String(payload.range||'').trim()
  if(!/^[A-Z0-9_-]{3,64}$/.test(graphCode))throw Object.assign(new Error('图谱编码只能包含大写字母、数字、下划线或中划线'),{status:400});if(!graphName)throw Object.assign(new Error('图谱名称不能为空'),{status:400});if(!ontologyId)throw Object.assign(new Error('请选择启用状态的图谱结构'),{status:400})
  const structureSnapshot=normalizeStructureElements(payload.structureElements)
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction()
    const ontology=await getEnabledOntology(connection,ontologyId)
    const dependencies=await validateSelectedSources(connection,ontologyId,payload.sourceIds,structureSnapshot)
    const dataset=await materializeGraph(connection,dependencies.sourceIds,ontologyId,structureSnapshot)
    const date=new Date().toISOString().slice(0,10).replaceAll('-','')
    const [counts]=await connection.query('SELECT COUNT(*) AS total FROM graph_versions WHERE id LIKE ?',[`GRAPH-${date}.%`])
    const id=`GRAPH-${date}.${Number(counts[0].total)+1}`
    const mappingVersion=dependencies.items.map((item)=>`${item.sourceId}:R${item.revision}`).join(' / ').slice(0,80)
    await connection.query("INSERT INTO graph_versions (id,graph_code,graph_name,graph_tag,structure_snapshot,ontology_id,ontology_version,mapping_version,data_range,entity_count,relation_count,event_count,blockers,warnings,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,0,0,0,'待发布')",[id,graphCode,graphName,graphTag,json(structureSnapshot),ontology.id,`${ontology.name} ${ontology.version}`,mappingVersion,range,dataset.nodes.length,dataset.relations.length])
    for(const item of dependencies.items){
      await connection.query('INSERT INTO graph_version_sources (graph_id,source_id) VALUES (?,?)',[id,item.sourceId])
      const [mappingRows]=await connection.query('SELECT id,source_id,ontology_id,mapping_type,source_field,transform_rule,target_code,confidence,status,updated_at FROM semantic_mappings WHERE source_id=? AND ontology_id=? ORDER BY mapping_type,id',[item.sourceId,ontologyId])
      await connection.query("INSERT INTO graph_version_mapping_snapshots (graph_id,source_id,ontology_id,mapping_revision,mapping_status,mapping_count,snapshot_json) VALUES (?,?,?,?,?,?,?)",[id,item.sourceId,ontologyId,item.revision,'已绑定',mappingRows.length,json(mappingRows)])
    }
    await saveGraphDataset(connection,id,dataset)
    for(const item of dataset.sourceStats)await connection.query("UPDATE data_sources SET last_success='刚刚' WHERE id=?",[item.sourceId])
    await connection.commit()
    return await getGraphVersion(pool,id)
  }catch(error){await connection.rollback();throw error}finally{connection.release()}
}
function graphDraftValues(payload,fallback={}){
  const date=new Date().toISOString().slice(0,10).replaceAll('-','')
  const graphCode=String(payload.graphCode??fallback.graph_code??`GRAPH-${date}`).trim().toUpperCase()||`GRAPH-${date}`
  const graphName=String(payload.graphName??fallback.graph_name??'').trim()||'未命名图谱'
  const ontologyId=String(payload.ontologyId??fallback.ontology_id??'').trim()
  const sourceIds=[...new Set((Array.isArray(payload.sourceIds)?payload.sourceIds:[]).map((item)=>String(item).trim()).filter(Boolean))]
  const structureSnapshot=normalizeStructureElements(Array.isArray(payload.structureElements)?payload.structureElements:parseJson(fallback.structure_snapshot,[]))
  return {graphCode,graphName,graphTag:normalizeGraphTag(payload.tag??fallback.graph_tag),ontologyId,ontologyVersion:ontologyId&&ontologyId===fallback.ontology_id?fallback.ontology_version||'':'',mappingVersion:ontologyId&&ontologyId===fallback.ontology_id?fallback.mapping_version||'':'',range:String(payload.range??fallback.data_range??'').trim(),sourceIds,structureSnapshot}
}
async function replaceGraphSources(connection,graphId,sourceIds){
  await connection.query('DELETE FROM graph_version_sources WHERE graph_id=?',[graphId])
  for(const sourceId of sourceIds)await connection.query('INSERT INTO graph_version_sources (graph_id,source_id) VALUES (?,?)',[graphId,sourceId])
}
async function createGraphDraft(pool,payload){
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction()
    const draft=graphDraftValues(payload)
    const date=new Date().toISOString().slice(0,10).replaceAll('-','')
    const [counts]=await connection.query('SELECT COUNT(*) AS total FROM graph_versions WHERE id LIKE ?',[`GRAPH-${date}.%`])
    const id=`GRAPH-${date}.${Number(counts[0].total)+1}`
    await connection.query("INSERT INTO graph_versions (id,graph_code,graph_name,graph_tag,structure_snapshot,ontology_id,ontology_version,mapping_version,data_range,entity_count,relation_count,event_count,blockers,warnings,status,published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)",[id,draft.graphCode,draft.graphName,draft.graphTag,json(draft.structureSnapshot),draft.ontologyId,draft.ontologyVersion,draft.mappingVersion,draft.range,0,0,0,0,0,'草稿'])
    await replaceGraphSources(connection,id,draft.sourceIds)
    await connection.commit()
    return await getGraphVersion(pool,id)
  }catch(error){await connection.rollback();throw error}finally{connection.release()}
}
async function saveGraphAsDraft(pool,id,payload){
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction()
    const [rows]=await connection.query('SELECT * FROM graph_versions WHERE id=? FOR UPDATE',[id])
    if(!rows.length)throw Object.assign(new Error('知识图谱生成结果不存在'),{status:404})
    const graph=rows[0]
    if(!['草稿','待发布'].includes(normalizeGraphStatus(graph.status)))throw Object.assign(new Error('已发布图谱需要先取消发布后才能保存草稿'),{status:409})
    const draft=graphDraftValues(payload,graph)
    await connection.query("UPDATE graph_versions SET graph_code=?,graph_name=?,graph_tag=?,structure_snapshot=?,ontology_id=?,ontology_version=?,mapping_version=?,data_range=?,entity_count=0,relation_count=0,event_count=0,blockers=0,warnings=0,status='草稿',published_at=NULL WHERE id=?",[draft.graphCode,draft.graphName,draft.graphTag,json(draft.structureSnapshot),draft.ontologyId,draft.ontologyVersion,draft.mappingVersion,draft.range,id])
    await connection.query('DELETE FROM graph_version_mapping_snapshots WHERE graph_id=?',[id])
    await connection.query('DELETE FROM graph_instance_datasets WHERE graph_id=?',[id])
    await replaceGraphSources(connection,id,draft.sourceIds)
    await connection.commit()
    return await getGraphVersion(pool,id)
  }catch(error){await connection.rollback();throw error}finally{connection.release()}
}
async function unpublishGraphVersion(pool,id){
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction()
    const [rows]=await connection.query('SELECT * FROM graph_versions WHERE id=? FOR UPDATE',[id])
    if(!rows.length)throw Object.assign(new Error('知识图谱生成结果不存在'),{status:404})
    if(rows[0].status!=='已发布')throw Object.assign(new Error('只有已发布知识图谱可以取消发布'),{status:409})
    await connection.query("UPDATE graph_versions SET status='待发布',published_at=NULL WHERE id=?",[id])
    await connection.commit()
    return await getGraphVersion(pool,id)
  }catch(error){await connection.rollback();throw error}finally{connection.release()}
}
async function updateGraphVersion(pool,id,payload){
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction()
  const [rows]=await connection.query('SELECT * FROM graph_versions WHERE id=? FOR UPDATE',[id])
    if(!rows.length)throw Object.assign(new Error('知识图谱生成结果不存在'),{status:404})
    const graph=rows[0]
    if(!['草稿','待发布'].includes(normalizeGraphStatus(graph.status)))throw Object.assign(new Error('当前版本不可直接覆盖，请通过编辑保存未发布修改'),{status:409})
    const graphCode=String(payload.graphCode??graph.graph_code).trim().toUpperCase();const graphName=String(payload.graphName??graph.graph_name).trim();const graphTag=normalizeGraphTag(payload.tag??graph.graph_tag);const ontologyId=String(payload.ontologyId??graph.ontology_id).trim();const range=String(payload.range??graph.data_range).trim()
    if(!/^[A-Z0-9_-]{3,64}$/.test(graphCode))throw Object.assign(new Error('图谱编码只能包含大写字母、数字、下划线或中划线'),{status:400});if(!graphName)throw Object.assign(new Error('图谱名称不能为空'),{status:400});if(!ontologyId)throw Object.assign(new Error('请选择启用状态的图谱结构'),{status:400})
    const structureSnapshot=normalizeStructureElements(Array.isArray(payload.structureElements)?payload.structureElements:parseJson(graph.structure_snapshot,[]))
    await ensureGraphEditDraft(connection,id,graph)
    let sourceIds=Array.isArray(payload.sourceIds)?payload.sourceIds:null
    if(!sourceIds){const [links]=await connection.query('SELECT source_id FROM graph_version_sources WHERE graph_id=? ORDER BY source_id',[id]);sourceIds=links.map((item)=>item.source_id)}
    const ontology=await getEnabledOntology(connection,ontologyId)
    const dependencies=await validateSelectedSources(connection,ontologyId,sourceIds,structureSnapshot,id)
    const dataset=await materializeGraph(connection,dependencies.sourceIds,ontologyId,structureSnapshot,id)
    const mappingVersion=dependencies.items.map((item)=>`${item.sourceId}:R${item.revision}`).join(' / ').slice(0,80)
    await connection.query("UPDATE graph_versions SET graph_code=?,graph_name=?,graph_tag=?,structure_snapshot=?,ontology_id=?,ontology_version=?,mapping_version=?,data_range=?,entity_count=?,relation_count=?,event_count=0,blockers=0,warnings=0,status='待发布',published_at=NULL WHERE id=?",[graphCode,graphName,graphTag,json(structureSnapshot),ontology.id,`${ontology.name} ${ontology.version}`,mappingVersion,range,dataset.nodes.length,dataset.relations.length,id])
    await connection.query('DELETE FROM graph_version_mapping_snapshots WHERE graph_id=?',[id])
    await connection.query('DELETE FROM graph_version_sources WHERE graph_id=?',[id])
    for(const item of dependencies.items){
      await connection.query('INSERT INTO graph_version_sources (graph_id,source_id) VALUES (?,?)',[id,item.sourceId])
      const mappingRows=draftMappingRows(await getGraphEditDraft(connection,id),item.sourceId,ontologyId)
      await connection.query("INSERT INTO graph_version_mapping_snapshots (graph_id,source_id,ontology_id,mapping_revision,mapping_status,mapping_count,snapshot_json) VALUES (?,?,?,?,?,?,?)",[id,item.sourceId,ontologyId,item.revision,'已绑定',mappingRows.length,json(mappingRows)])
    }
    await saveGraphDataset(connection,id,dataset)
    for(const item of dataset.sourceStats)await connection.query("UPDATE data_sources SET last_success='刚刚' WHERE id=?",[item.sourceId])
    await connection.query('DELETE FROM graph_edit_drafts WHERE graph_id=?',[id])
    await connection.commit();return await getGraphVersion(pool,id)
  }catch(error){await connection.rollback();throw error}finally{connection.release()}
}
async function publishGraphVersion(pool,id){const connection=await pool.getConnection();try{await connection.beginTransaction();const [rows]=await connection.query('SELECT * FROM graph_versions WHERE id=? FOR UPDATE',[id]);if(!rows.length)throw Object.assign(new Error('知识图谱生成结果不存在'),{status:404});const graph=rows[0];if(Number(graph.blockers)>0)throw Object.assign(new Error(`存在${graph.blockers}个阻断问题，不能发布`),{status:409});if(graph.status!=='待发布')throw Object.assign(new Error('只有待发布知识图谱可以发布'),{status:409});await validateGraphDependencies(connection,graph);await connection.query("UPDATE graph_versions SET status='已发布',published_at=NOW() WHERE id=?",[id]);await connection.commit();return await getGraphVersion(pool,id)}catch(error){await connection.rollback();throw error}finally{connection.release()}}
async function deleteSourceWithReferences(pool,id){const source=await getSource(pool,id);if(!source)throw Object.assign(new Error('数据源不存在'),{status:404});if(source.status==='启用')throw Object.assign(new Error('请先停用数据源，再执行删除'),{status:409});const [graphRefs]=await pool.query('SELECT COUNT(*) AS total FROM graph_version_sources WHERE source_id=?',[id]);if(Number(graphRefs[0].total))throw Object.assign(new Error('该数据源已被知识图谱引用，不能删除'),{status:409});return deleteSource(pool,id)}
async function syncSource(pool,id){const source=await getSource(pool,id);if(!source)throw Object.assign(new Error('数据源不存在'),{status:404});throw Object.assign(new Error('请在知识图谱中生成或更新数据'),{status:409})}
async function listSync(pool,sourceId=''){const params=[];let where='';if(sourceId){where='WHERE source_id=?';params.push(sourceId)}const [rows]=await pool.query(`SELECT * FROM sync_records ${where} ORDER BY started_at DESC LIMIT 30`,params);return rows.map(mapSync)}
async function listGraphs(pool,url){const status=String(url.searchParams.get('status')||'');const params=[];let where='';if(status){where=`WHERE ${graphStatusFilter(status,'status',params)}`}else{where='WHERE status<>?';params.push('已归档')}const [rows]=await pool.query(`SELECT * FROM graph_versions ${where} ORDER BY updated_at DESC,id DESC`,params);return rows.map(mapGraph)}
async function createGraph(pool,payload){const id=String(payload.id||`GRAPH-${new Date().toISOString().slice(0,10).replaceAll('-','')}.${Math.floor(Math.random()*9)+1}`).trim().toUpperCase();await pool.query('INSERT INTO graph_versions (id,ontology_id,ontology_version,mapping_version,graph_tag,data_range,entity_count,relation_count,event_count,blockers,warnings,status) VALUES (?,?,?,?,?,?,?,?,0,?,?,?)',[id,payload.ontologyId||'ONT-PROC',payload.ontologyVersion||'BASE V1 / PROC V3',payload.mappingVersion||'MAP v3.6',normalizeGraphTag(payload.tag),payload.range||'用于监管穿透分析的知识图谱。',Number(payload.entities||129000)+Number(payload.events||0),Number(payload.relations||311000),Number(payload.blockers||0),Number(payload.warnings||0),'待发布']);return mapGraph((await pool.query('SELECT * FROM graph_versions WHERE id=?',[id]))[0][0])}
async function publishGraph(pool,id){const connection=await pool.getConnection();try{await connection.beginTransaction();const [rows]=await connection.query('SELECT * FROM graph_versions WHERE id=? FOR UPDATE',[id]);if(!rows.length)throw Object.assign(new Error('知识图谱生成结果不存在'),{status:404});const graph=rows[0];if(Number(graph.blockers)>0)throw Object.assign(new Error(`存在${graph.blockers}个阻断问题，不能发布`),{status:409});if(graph.status!=='待发布')throw Object.assign(new Error('只有待发布知识图谱可以发布'),{status:409});await connection.query("UPDATE graph_versions SET status='已归档' WHERE status='已发布'");await connection.query("UPDATE graph_versions SET status='已发布',published_at=NOW() WHERE id=?",[id]);await connection.commit();return mapGraph((await pool.query('SELECT * FROM graph_versions WHERE id=?',[id]))[0][0])}catch(error){await connection.rollback();throw error}finally{connection.release()}}
async function resolveIssue(pool,graphId,issueId){await pool.query("UPDATE graph_quality_issues SET status='已处理' WHERE graph_id=? AND id=?",[graphId,issueId]);return{ok:true,message:'生成检查项已处理'}}
async function govern(pool,graphId,taskId,payload){if(!String(payload.reason||'').trim())throw Object.assign(new Error('处理原因不能为空'),{status:400});await pool.query("UPDATE graph_governance_tasks SET status='已处理',result=?,reason=? WHERE graph_id=? AND id=?",[payload.result||'合并',payload.reason,graphId,taskId]);return{ok:true,message:`实例${payload.result||'合并'}完成，影响记录已生成`}}

async function deleteSource(pool,id){
  const source=await getSource(pool,id)
  if(!source)throw Object.assign(new Error('数据源不存在'),{status:404})
  if(source.status==='启用')throw Object.assign(new Error('请先停用数据源，再执行删除'),{status:409})
  await pool.query('DELETE FROM data_sources WHERE id=?',[id])
  return{ok:true,message:'数据源已删除'}
}
async function deleteGraph(pool,id){
  const [rows]=await pool.query('SELECT * FROM graph_versions WHERE id=?',[id])
  if(!rows.length)throw Object.assign(new Error('知识图谱生成结果不存在'),{status:404})
  if(!['草稿','待发布'].includes(normalizeGraphStatus(rows[0].status)))throw Object.assign(new Error('已发布知识图谱不能删除'),{status:409})
  const [ruleRefs]=await pool.query('SELECT COUNT(*) AS total FROM rule_asset_versions WHERE graph_version=?',[id])
  const references=Number(ruleRefs[0].total)
  if(references>0)throw Object.assign(new Error(`该知识图谱仍被${references}个规则版本引用，不能删除`),{status:409})
  await pool.query('DELETE FROM graph_versions WHERE id=?',[id])
  return{ok:true,message:'未发布图谱任务已删除'}
}

export async function handleDataGraphApi(req,res,url,{pool,sendJson,readBody}){
  const scopedSourceItem=url.pathname.match(/^\/api\/data-sources\/([^/]+)$/)
  if(scopedSourceItem&&req.method==='DELETE'){sendJson(res,200,await deleteSourceWithReferences(pool,decodeURIComponent(scopedSourceItem[1])));return true}
  const mappingItem=url.pathname.match(/^\/api\/data-sources\/([^/]+)\/mappings\/([^/]+)$/)
  if(mappingItem&&req.method==='PUT'){const body=await readBody(req);sendJson(res,200,await updateMappingForOntology(pool,decodeURIComponent(mappingItem[1]),decodeURIComponent(mappingItem[2]),body,String(url.searchParams.get('graphId')||body.graphId||'')));return true}
  if(mappingItem&&req.method==='DELETE'){sendJson(res,200,await deleteMappingForOntology(pool,decodeURIComponent(mappingItem[1]),decodeURIComponent(mappingItem[2]),String(url.searchParams.get('ontologyId')||'ONT-PROC'),String(url.searchParams.get('graphId')||'')));return true}
  const scopedSourceAction=url.pathname.match(/^\/api\/data-sources\/([^/]+)\/(metadata\/parse|mappings\/validate|mappings)$/)
  if(scopedSourceAction){
    const id=decodeURIComponent(scopedSourceAction[1]);const action=scopedSourceAction[2];const ontologyId=String(url.searchParams.get('ontologyId')||'ONT-PROC')
    if(action==='mappings'&&req.method==='GET'){sendJson(res,200,await mappingsForOntology(pool,id,ontologyId,String(url.searchParams.get('type')||''),String(url.searchParams.get('graphId')||'')));return true}
    if(action==='mappings'&&req.method==='POST'){const body=await readBody(req);sendJson(res,201,await upsertMappingForOntology(pool,id,body,String(url.searchParams.get('graphId')||body.graphId||'')));return true}
    if(action==='metadata/parse'&&req.method==='POST'){const body=await readBody(req);sendJson(res,200,await parseMetadataForOntology(pool,id,String(body.ontologyId||ontologyId)));return true}
    if(action==='mappings/validate'&&req.method==='POST'){const body=await readBody(req);sendJson(res,200,await validateMappingsForOntology(pool,id,String(body.ontologyId||ontologyId),body.structureElements));return true}
  }
  if(url.pathname==='/api/graphs/dependencies/check'&&req.method==='POST'){sendJson(res,200,await checkGraphDependencies(pool,await readBody(req)));return true}
  if(url.pathname==='/api/graphs/mappings/auto/preview'&&req.method==='POST'){sendJson(res,200,await graphAutoMappingPreview(pool,await readBody(req)));return true}
  if(url.pathname==='/api/graphs/mappings/auto/apply'&&req.method==='POST'){sendJson(res,200,await applyGraphAutoMapping(pool,await readBody(req)));return true}
  if(url.pathname==='/api/graphs/draft'&&req.method==='POST'){sendJson(res,201,await createGraphDraft(pool,await readBody(req)));return true}
  if(url.pathname==='/api/graphs'&&req.method==='GET'){sendJson(res,200,await listGraphVersions(pool,url));return true}
  if(url.pathname==='/api/graphs'&&req.method==='POST'){sendJson(res,201,await createGraphVersion(pool,await readBody(req)));return true}
  const scopedPublish=url.pathname.match(/^\/api\/graphs\/([^/]+)\/publish$/)
  if(scopedPublish&&req.method==='POST'){sendJson(res,200,await publishGraphVersion(pool,decodeURIComponent(scopedPublish[1])));return true}
  const scopedUnpublish=url.pathname.match(/^\/api\/graphs\/([^/]+)\/unpublish$/)
  if(scopedUnpublish&&req.method==='POST'){sendJson(res,200,await unpublishGraphVersion(pool,decodeURIComponent(scopedUnpublish[1])));return true}
  const scopedSync=url.pathname.match(/^\/api\/graphs\/([^/]+)\/sync$/)
  if(scopedSync&&req.method==='POST'){sendJson(res,200,await syncGraphVersion(pool,decodeURIComponent(scopedSync[1])));return true}
  const scopedSyncRecords=url.pathname.match(/^\/api\/graphs\/([^/]+)\/sync-records$/)
  if(scopedSyncRecords&&req.method==='GET'){sendJson(res,200,await listGraphSyncRecords(pool,decodeURIComponent(scopedSyncRecords[1])));return true}
  if(url.pathname==='/api/data-sources'&&req.method==='GET'){sendJson(res,200,await listSources(pool));return true}
  if(url.pathname==='/api/data-sources'&&req.method==='POST'){sendJson(res,201,await createSource(pool,await readBody(req)));return true}
  if(url.pathname==='/api/data-sources/test-config'&&req.method==='POST'){sendJson(res,200,await testSourceConfig(pool,await readBody(req)));return true}
  const sourceFiles=url.pathname.match(/^\/api\/data-sources\/([^/]+)\/files(?:\/([^/]+))?$/)
  if(sourceFiles){const id=decodeURIComponent(sourceFiles[1]);if(!sourceFiles[2]&&req.method==='GET'){sendJson(res,200,await listSourceFiles(pool,id));return true}if(!sourceFiles[2]&&req.method==='POST'){sendJson(res,201,await uploadSourceFile(pool,id,req));return true}if(sourceFiles[2]&&req.method==='DELETE'){sendJson(res,200,await deleteSourceFile(pool,id,decodeURIComponent(sourceFiles[2])));return true}}
  const sourceItem=url.pathname.match(/^\/api\/data-sources\/([^/]+)$/)
  if(sourceItem&&req.method==='PUT'){sendJson(res,200,await updateSource(pool,decodeURIComponent(sourceItem[1]),await readBody(req)));return true}
  if(sourceItem&&req.method==='DELETE'){sendJson(res,200,await deleteSource(pool,decodeURIComponent(sourceItem[1])));return true}
  const sourceAction=url.pathname.match(/^\/api\/data-sources\/([^/]+)\/(test|toggle|metadata\/parse|metadata|mappings\/validate|mappings|sync)$/)
  if(sourceAction){const id=decodeURIComponent(sourceAction[1]);const action=sourceAction[2];if(action==='test'&&req.method==='POST'){sendJson(res,200,await testSource(pool,id));return true}if(action==='toggle'&&req.method==='POST'){sendJson(res,200,await toggleSource(pool,id,Boolean((await readBody(req)).enabled)));return true}if(action==='metadata/parse'&&req.method==='POST'){sendJson(res,200,await parseMetadata(pool,id));return true}if(action==='metadata'&&req.method==='GET'){sendJson(res,200,await metadata(pool,id));return true}if(action==='mappings'&&req.method==='GET'){sendJson(res,200,await mappings(pool,id,String(url.searchParams.get('type')||'')));return true}if(action==='mappings/validate'&&req.method==='POST'){sendJson(res,200,await validateMappings(pool,id));return true}if(action==='sync'&&req.method==='POST'){sendJson(res,201,await syncSource(pool,id));return true}}
  if(url.pathname==='/api/sync-records'&&req.method==='GET'){sendJson(res,200,await listSync(pool,String(url.searchParams.get('sourceId')||'')));return true}
  if(url.pathname==='/api/graphs'&&req.method==='GET'){sendJson(res,200,await listGraphs(pool,url));return true}
  if(url.pathname==='/api/graphs'&&req.method==='POST'){sendJson(res,201,await createGraph(pool,await readBody(req)));return true}
  const graphSnapshots=url.pathname.match(/^\/api\/graphs\/([^/]+)\/mapping-snapshots$/)
  if(graphSnapshots&&req.method==='GET'){sendJson(res,200,await listGraphMappingSnapshots(pool,decodeURIComponent(graphSnapshots[1])));return true}
  const graphItem=url.pathname.match(/^\/api\/graphs\/([^/]+)$/)
  const graphDraft=url.pathname.match(/^\/api\/graphs\/([^/]+)\/draft$/)
  if(graphDraft&&req.method==='PUT'){sendJson(res,200,await saveGraphAsDraft(pool,decodeURIComponent(graphDraft[1]),await readBody(req)));return true}
  if(graphItem&&req.method==='GET'){sendJson(res,200,await graphVersionDetail(pool,decodeURIComponent(graphItem[1])));return true}
  if(graphItem&&req.method==='PUT'){sendJson(res,200,await updateGraphVersion(pool,decodeURIComponent(graphItem[1]),await readBody(req)));return true}
  if(graphItem&&req.method==='DELETE'){sendJson(res,200,await deleteGraph(pool,decodeURIComponent(graphItem[1])));return true}
  const graphIssue=url.pathname.match(/^\/api\/graphs\/([^/]+)\/issues(?:\/([^/]+)\/resolve)?$/)
  if(graphIssue){const graphId=decodeURIComponent(graphIssue[1]);if(req.method==='GET'){const [rows]=await pool.query('SELECT * FROM graph_quality_issues WHERE graph_id=? ORDER BY status,id',[graphId]);sendJson(res,200,rows.map(mapIssue));return true}if(req.method==='POST'&&graphIssue[2]){sendJson(res,200,await resolveIssue(pool,graphId,decodeURIComponent(graphIssue[2])));return true}}
  const graphGovern=url.pathname.match(/^\/api\/graphs\/([^/]+)\/governance(?:\/([^/]+))?$/)
  if(graphGovern){const graphId=decodeURIComponent(graphGovern[1]);if(req.method==='GET'){const [rows]=await pool.query('SELECT * FROM graph_governance_tasks WHERE graph_id=? ORDER BY status,id',[graphId]);sendJson(res,200,rows.map(mapGovernance));return true}if(req.method==='POST'&&graphGovern[2]){sendJson(res,200,await govern(pool,graphId,decodeURIComponent(graphGovern[2]),await readBody(req)));return true}}
  const publish=url.pathname.match(/^\/api\/graphs\/([^/]+)\/publish$/)
  if(publish&&req.method==='POST'){sendJson(res,200,await publishGraph(pool,decodeURIComponent(publish[1])));return true}
  return false
}

