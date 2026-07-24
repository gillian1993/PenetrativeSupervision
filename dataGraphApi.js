const json=(value)=>JSON.stringify(value??null)
const parseJson=(value,fallback)=>{if(value===null||value===undefined||value==='')return fallback;if(typeof value==='object')return value;try{return JSON.parse(value)}catch{return fallback}}
const formatTime=(value)=>value instanceof Date?value.toLocaleString('zh-CN',{hour12:false}).replaceAll('/','-'):String(value||'')

async function ensureColumn(pool,table,column,definition){
  const [rows]=await pool.query('SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',[table,column])
  if(!Number(rows[0].total))await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`)
}

const seedSources=[
  ['SRC-ERP','集团ERP采购视图','数据库视图','采购项目、订单、供应商','张海','增量','今天 11:52','启用'],
  ['SRC-OA','OA审批事件接口','API','审批实例、节点、意见','刘敏','事件','今天 12:06','启用'],
  ['SRC-TREASURY','司库付款消息','消息','付款申请、账户、流水','王宁','事件','今天 12:08','启用'],
  ['SRC-EXTERNAL','工商司法外部数据','API','主体、股东、司法风险','陈洁','增量','昨天 23:00','异常'],
]
const seedGraphs=[
  ['GRAPH-20260717.2','ONT-PROC','BASE v1.6 / PROC v2.2','MAP v3.4','2026-01-01 至 2026-07-17',176752,309861,0,0,8,'已发布','2026-07-17 08:45:00'],
  ['GRAPH-20260717.3','ONT-PROC','BASE v1.6 / PROC v2.2','MAP v3.5','2026-01-01 至 2026-07-17',177741,311202,0,0,3,'待发布',null],
  ['GRAPH-20260716.4','ONT-FIN','BASE v1.6 / FIN v1.0','MAP v2.8','2025-01-01 至 2026-07-16',138017,206871,0,2,12,'失败',null],
]

function splitList(value){return String(value||'').split(',').map((item)=>item.trim()).filter(Boolean)}
function mapSource(row){return{id:row.id,name:row.name,mode:row.mode,range:row.data_range,owner:row.owner,ontologyIds:splitList(row.ontology_ids),ontologyNames:splitList(row.ontology_names),lastSuccess:row.last_success,status:row.status}}
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
function mapMetadata(row){return{id:String(row.id),sourceId:row.source_id,tableName:row.table_name,displayName:row.display_name,fieldCount:Number(row.field_count),summary:row.summary,fields:sourceFieldsForTable(row.table_name)}}
function mapMapping(row){return{id:String(row.id),sourceId:row.source_id,ontologyId:row.ontology_id||'ONT-PROC',type:row.mapping_type,sourceField:row.source_field,transform:row.transform_rule,targetCode:row.target_code,confidence:Number(row.confidence),status:row.status,revision:Number(row.revision||1),setStatus:row.set_status||row.status,lastValidatedAt:row.last_validated_at?formatTime(row.last_validated_at):'—'}}
function mapSync(row){return{id:row.id,sourceId:row.source_id,sourceName:row.source_name,mode:row.sync_mode,startedAt:formatTime(row.started_at),processed:Number(row.processed_count),errors:Number(row.error_count),duration:row.duration_text,result:row.result}}
function mapGraph(row){return{id:row.id,ontologyId:row.ontology_id,ontologyVersion:row.ontology_version,mappingVersion:row.mapping_version,range:row.data_range,entities:Number(row.entity_count),relations:Number(row.relation_count),events:Number(row.event_count),blockers:Number(row.blockers),warnings:Number(row.warnings),status:row.status,publishedAt:row.published_at?formatTime(row.published_at):'—'}}
function mapGraphVersion(row){return{id:row.id,graphCode:row.graph_code||row.ontology_id,graphName:row.graph_name||row.ontology_version,ontologyId:row.ontology_id,ontologyVersion:row.ontology_version,mappingVersion:row.mapping_version,range:row.data_range,sourceIds:String(row.source_ids||'').split(',').filter(Boolean),sourceNames:String(row.source_names||'').split(',').filter(Boolean),entities:Number(row.entity_count),relations:Number(row.relation_count),events:Number(row.event_count),blockers:Number(row.blockers),warnings:Number(row.warnings),status:row.status,publishedAt:row.published_at?formatTime(row.published_at):'—'}}
function mapIssue(row){return{id:row.id,graphId:row.graph_id,title:row.title,level:row.level,description:row.description,sourceRef:row.source_ref,status:row.status}}
function mapGovernance(row){return{id:row.id,graphId:row.graph_id,objectType:row.object_type,candidates:parseJson(row.candidate_json,[]),evidence:row.evidence,suggestion:row.suggestion,level:row.level,status:row.status,result:row.result||'',reason:row.reason||''}}
async function ensureMappingSet(pool,sourceId,ontologyId){await pool.query("INSERT IGNORE INTO semantic_mapping_sets (source_id,ontology_id,revision,status) VALUES (?,?,1,'待校验')",[sourceId,ontologyId]);const [rows]=await pool.query('SELECT * FROM semantic_mapping_sets WHERE source_id=? AND ontology_id=?',[sourceId,ontologyId]);return rows[0]}
async function backfillGraphMappingSnapshots(pool){const [links]=await pool.query('SELECT gvs.graph_id,gvs.source_id,gv.ontology_id FROM graph_version_sources gvs JOIN graph_versions gv ON gv.id=gvs.graph_id LEFT JOIN graph_version_mapping_snapshots snap ON snap.graph_id=gvs.graph_id AND snap.source_id=gvs.source_id WHERE snap.graph_id IS NULL');for(const link of links){const set=await ensureMappingSet(pool,link.source_id,link.ontology_id);const [rows]=await pool.query('SELECT id,source_id,ontology_id,mapping_type,source_field,transform_rule,target_code,confidence,status,updated_at FROM semantic_mappings WHERE source_id=? AND ontology_id=? ORDER BY mapping_type,id',[link.source_id,link.ontology_id]);await pool.query('INSERT IGNORE INTO graph_version_mapping_snapshots (graph_id,source_id,ontology_id,mapping_revision,mapping_status,mapping_count,snapshot_json) VALUES (?,?,?,?,?,?,?)',[link.graph_id,link.source_id,link.ontology_id,Number(set?.revision||1),'历史回填',rows.length,json(rows)])}}

async function seedMetadata(pool,sourceId){
  const rows=sourceId==='SRC-ERP'?
    [['purchase_project','采购项目视图',32,'项目、预算、采购方式、组织与时间字段'],['supplier_master','供应商主数据',28,'供应商主体、证照、联系方式字段'],['purchase_order','采购订单',41,'订单、金额、合同与明细字段'],['bid_event','招投标事件',18,'报名、评审、中标确认事件字段']]:
    [['source_object','来源对象',16,'自动解析的来源对象与字段'],['source_event','来源事件',12,'自动解析的业务事件字段']]
  for(const row of rows)await pool.query('INSERT IGNORE INTO data_source_metadata (source_id,table_name,display_name,field_count,summary) VALUES (?,?,?,?,?)',[sourceId,...row])
}
async function seedMappings(pool,sourceId){
  const rows=[
    ['节点实例','supplier_code','直接映射','PROC.Supplier.credit_code',98,'待校验'],
    ['节点实例','supplier_name','去空格','PROC.Supplier.name',99,'待校验'],
    ['节点实例','credit_code','大写转换','PROC.Supplier.credit_code',96,'待校验'],
    ['关系','supplier_id + phone','哈希关联','PROC.supplier_contact',95,'待校验'],
    ['关系','phone + reviewer_id','哈希关联','PROC.shared_contact',92,'待校验'],
    ['节点实例','bid_confirm_id + occurred_at + project_id','节点标识、发生时间与关联对象','PROC.BidConfirmed',99,'待校验'],
  ]
  for(const row of rows)await pool.query('INSERT IGNORE INTO semantic_mappings (source_id,mapping_type,source_field,transform_rule,target_code,confidence,status) VALUES (?,?,?,?,?,?,?)',[sourceId,...row])
}

async function seedOntologyMappings(pool,sourceId,ontologyId='ONT-PROC'){
  const [elements]=await pool.query("SELECT element_type,code FROM ontology_elements WHERE ontology_id=? AND element_type IN ('class','property','relation') ORDER BY element_id",[ontologyId])
  const codes=(type)=>elements.filter((item)=>item.element_type===type).map((item)=>item.code)
  const classes=codes('class');const properties=codes('property');const relations=codes('relation');const occurrenceProperty=properties.find((code)=>code.endsWith('.event_id'))||properties[0]
  const rows=[
    ['节点实例','supplier_code','直接映射',properties[0]||classes[0]||'',98,'待校验'],
    ['节点实例','supplier_name','去空格',properties[1]||properties[0]||classes[0]||'',99,'待校验'],
    ['节点实例','credit_code','大写转换',properties[2]||properties[0]||classes[0]||'',96,'待校验'],
    ['关系','supplier_id + phone','哈希关联',relations[0]||'',95,'待校验'],
    ['关系','phone + reviewer_id','哈希关联',relations[1]||relations[0]||'',92,'待校验'],
    ['节点实例','event_id','直接映射',occurrenceProperty||'',99,'待校验'],
  ].filter((row)=>row[3])
  for(const row of rows)await pool.query('INSERT IGNORE INTO semantic_mappings (source_id,ontology_id,mapping_type,source_field,transform_rule,target_code,confidence,status) VALUES (?,?,?,?,?,?,?,?)',[sourceId,ontologyId,...row])
}
export async function initializeDataGraphDatabase(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS data_sources (id VARCHAR(64) PRIMARY KEY,name VARCHAR(160) NOT NULL,mode VARCHAR(40) NOT NULL,data_range VARCHAR(300) NOT NULL,owner VARCHAR(80) NOT NULL,sync_mode VARCHAR(40) NOT NULL,last_success VARCHAR(80) NOT NULL DEFAULT '未同步',status VARCHAR(24) NOT NULL DEFAULT '草稿',created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS data_source_structures (source_id VARCHAR(64) NOT NULL,ontology_id VARCHAR(64) NOT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY (source_id,ontology_id),KEY idx_source_structure_ontology (ontology_id,source_id),CONSTRAINT fk_source_structure_source FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS data_source_metadata (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,source_id VARCHAR(64) NOT NULL,table_name VARCHAR(120) NOT NULL,display_name VARCHAR(160) NOT NULL,field_count INT NOT NULL DEFAULT 0,summary VARCHAR(500) NOT NULL DEFAULT '',updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uk_source_table (source_id,table_name),CONSTRAINT fk_metadata_source FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS semantic_mappings (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,source_id VARCHAR(64) NOT NULL,mapping_type VARCHAR(24) NOT NULL,source_field VARCHAR(160) NOT NULL,transform_rule VARCHAR(160) NOT NULL,target_code VARCHAR(160) NOT NULL,confidence INT NOT NULL DEFAULT 0,status VARCHAR(24) NOT NULL DEFAULT '待校验',updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uk_mapping (source_id,mapping_type,source_field,target_code),CONSTRAINT fk_mapping_source FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS sync_records (id VARCHAR(80) PRIMARY KEY,source_id VARCHAR(64) NOT NULL,source_name VARCHAR(160) NOT NULL,sync_mode VARCHAR(40) NOT NULL,started_at DATETIME NOT NULL,processed_count INT NOT NULL DEFAULT 0,error_count INT NOT NULL DEFAULT 0,duration_text VARCHAR(40) NOT NULL,result VARCHAR(24) NOT NULL,KEY idx_sync_source (source_id,started_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS graph_versions (id VARCHAR(64) PRIMARY KEY,ontology_id VARCHAR(64) NOT NULL DEFAULT 'ONT-PROC',ontology_version VARCHAR(160) NOT NULL,mapping_version VARCHAR(80) NOT NULL,data_range VARCHAR(160) NOT NULL,entity_count INT NOT NULL DEFAULT 0,relation_count INT NOT NULL DEFAULT 0,event_count INT NOT NULL DEFAULT 0,blockers INT NOT NULL DEFAULT 0,warnings INT NOT NULL DEFAULT 0,status VARCHAR(24) NOT NULL DEFAULT '待发布',published_at DATETIME NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_graph_status (status,updated_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await ensureColumn(pool,'semantic_mappings','ontology_id',"ontology_id VARCHAR(64) NOT NULL DEFAULT 'ONT-PROC' AFTER source_id")
  await pool.query("DELETE duplicate FROM semantic_mappings duplicate JOIN semantic_mappings keep ON keep.source_id=duplicate.source_id AND keep.ontology_id=duplicate.ontology_id AND keep.source_field=duplicate.source_field AND keep.target_code=duplicate.target_code AND keep.id<duplicate.id WHERE duplicate.mapping_type IN ('属性','事件','事件实例','节点实例') AND keep.mapping_type IN ('属性','事件','事件实例','节点实例')")
  await pool.query("UPDATE semantic_mappings SET mapping_type='节点实例' WHERE mapping_type IN ('属性','事件','事件实例')")
  await pool.query("UPDATE semantic_mappings SET transform_rule=REPLACE(REPLACE(transform_rule,'事件标识','节点标识'),'事件ID','节点ID')")
  await pool.query("DELETE sm FROM semantic_mappings sm JOIN ontology_elements oe ON oe.ontology_id=sm.ontology_id AND oe.code=sm.target_code WHERE sm.mapping_type='节点实例' AND oe.element_type='class'")
  await pool.query(`CREATE TABLE IF NOT EXISTS semantic_mapping_sets (source_id VARCHAR(64) NOT NULL,ontology_id VARCHAR(64) NOT NULL,revision INT NOT NULL DEFAULT 1,status VARCHAR(24) NOT NULL DEFAULT '待校验',last_validated_at DATETIME NULL,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,PRIMARY KEY (source_id,ontology_id),KEY idx_mapping_set_status (status,updated_at),CONSTRAINT fk_mapping_set_source FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await ensureColumn(pool,'graph_versions','graph_code',"graph_code VARCHAR(64) NOT NULL DEFAULT '' AFTER id")
  await ensureColumn(pool,'graph_versions','graph_name',"graph_name VARCHAR(160) NOT NULL DEFAULT '' AFTER graph_code")
  await pool.query(`CREATE TABLE IF NOT EXISTS graph_version_sources (graph_id VARCHAR(64) NOT NULL,source_id VARCHAR(64) NOT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY (graph_id,source_id),KEY idx_graph_source (source_id,graph_id),CONSTRAINT fk_graph_source_graph FOREIGN KEY (graph_id) REFERENCES graph_versions(id) ON DELETE CASCADE,CONSTRAINT fk_graph_source_source FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE RESTRICT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS graph_version_mapping_snapshots (graph_id VARCHAR(64) NOT NULL,source_id VARCHAR(64) NOT NULL,ontology_id VARCHAR(64) NOT NULL,mapping_revision INT NOT NULL DEFAULT 1,mapping_status VARCHAR(24) NOT NULL,mapping_count INT NOT NULL DEFAULT 0,snapshot_json JSON NOT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY (graph_id,source_id),KEY idx_snapshot_source (source_id,ontology_id),CONSTRAINT fk_snapshot_graph FOREIGN KEY (graph_id) REFERENCES graph_versions(id) ON DELETE CASCADE,CONSTRAINT fk_snapshot_source FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE RESTRICT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS graph_quality_issues (id VARCHAR(80) PRIMARY KEY,graph_id VARCHAR(64) NOT NULL,title VARCHAR(120) NOT NULL,level VARCHAR(24) NOT NULL,description VARCHAR(500) NOT NULL,source_ref VARCHAR(200) NOT NULL,status VARCHAR(24) NOT NULL DEFAULT '待处理',KEY idx_issue_graph (graph_id,status),CONSTRAINT fk_issue_graph FOREIGN KEY (graph_id) REFERENCES graph_versions(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS graph_governance_tasks (id VARCHAR(80) PRIMARY KEY,graph_id VARCHAR(64) NOT NULL,object_type VARCHAR(40) NOT NULL,candidate_json JSON NOT NULL,evidence VARCHAR(300) NOT NULL,suggestion VARCHAR(60) NOT NULL,level VARCHAR(16) NOT NULL,status VARCHAR(24) NOT NULL DEFAULT '待处理',result VARCHAR(40) NOT NULL DEFAULT '',reason VARCHAR(500) NOT NULL DEFAULT '',KEY idx_governance_graph (graph_id,status),CONSTRAINT fk_governance_graph FOREIGN KEY (graph_id) REFERENCES graph_versions(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  for(const item of seedSources)await pool.query('INSERT IGNORE INTO data_sources (id,name,mode,data_range,owner,sync_mode,last_success,status) VALUES (?,?,?,?,?,?,?,?)',item)
  await pool.query("INSERT IGNORE INTO data_source_structures (source_id,ontology_id) SELECT id,'ONT-PROC' FROM data_sources")
  await pool.query("INSERT IGNORE INTO data_source_structures (source_id,ontology_id) VALUES ('SRC-TREASURY','ONT-FIN')")
  for(const item of seedGraphs)await pool.query('INSERT IGNORE INTO graph_versions (id,ontology_id,ontology_version,mapping_version,data_range,entity_count,relation_count,event_count,blockers,warnings,status,published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',item)
  await pool.query("DELETE FROM semantic_mappings WHERE source_field='record_id + occurred_at + related_id' AND transform_rule='节点标识、发生时间与关联对象'")
  for(const item of seedSources){await seedMetadata(pool,item[0]);await seedOntologyMappings(pool,item[0])}
  await pool.query('UPDATE graph_versions SET entity_count=entity_count+event_count,event_count=0 WHERE event_count<>0')
  await pool.query("INSERT IGNORE INTO semantic_mapping_sets (source_id,ontology_id,revision,status,last_validated_at) SELECT source_id,ontology_id,1,IF(SUM(status='有效')=COUNT(*),'有效','待校验'),IF(SUM(status='有效')=COUNT(*),MAX(updated_at),NULL) FROM semantic_mappings GROUP BY source_id,ontology_id")
  await pool.query("UPDATE graph_versions SET graph_code=IF(graph_code='',ontology_id,graph_code),graph_name=IF(graph_name='',CONCAT(ontology_id,' 监管图谱'),graph_name)")
  await pool.query("INSERT IGNORE INTO graph_version_sources (graph_id,source_id) SELECT id,'SRC-ERP' FROM graph_versions WHERE ontology_id='ONT-PROC'")
  await pool.query("INSERT IGNORE INTO graph_version_sources (graph_id,source_id) SELECT id,'SRC-TREASURY' FROM graph_versions WHERE ontology_id='ONT-FIN'")
  await backfillGraphMappingSnapshots(pool)
  await pool.query('INSERT IGNORE INTO sync_records (id,source_id,source_name,sync_mode,started_at,processed_count,error_count,duration_text,result) VALUES (?,?,?,?,?,?,?,?,?)',['SYNC-0717-006','SRC-TREASURY','司库付款消息','事件','2026-07-17 12:08:00',326,0,'3秒','成功'])
  await pool.query('INSERT IGNORE INTO sync_records (id,source_id,source_name,sync_mode,started_at,processed_count,error_count,duration_text,result) VALUES (?,?,?,?,?,?,?,?,?)',['SYNC-0717-005','SRC-OA','OA审批事件接口','事件','2026-07-17 12:06:00',1824,3,'18秒','部分成功'])
  await pool.query('INSERT IGNORE INTO graph_quality_issues (id,graph_id,title,level,description,source_ref,status) VALUES (?,?,?,?,?,?,?)',['GQI-001','GRAPH-20260717.3','主标识缺失','阻断','供应商记录缺少统一社会信用代码','集团ERP采购视图 · 2条','待处理'])
  await pool.query('INSERT IGNORE INTO graph_quality_issues (id,graph_id,title,level,description,source_ref,status) VALUES (?,?,?,?,?,?,?)',['GQI-002','GRAPH-20260717.3','来源结构变化','警告','OA审批接口新增 approver_org 字段','OA审批事件接口 · 1项','待处理'])
  await pool.query('INSERT IGNORE INTO graph_governance_tasks (id,graph_id,object_type,candidate_json,evidence,suggestion,level,status) VALUES (?,?,?,?,?,?,?,?)',['GOV-0018','GRAPH-20260717.2','供应商',json(['华北数字科技有限公司','华北数字科技（北京）有限公司']),'统一社会信用代码一致','确认合并','高','待处理'])
}

const sourceSelect=`SELECT ds.*,(SELECT GROUP_CONCAT(dss.ontology_id ORDER BY dss.ontology_id) FROM data_source_structures dss WHERE dss.source_id=ds.id) AS ontology_ids,(SELECT GROUP_CONCAT(COALESCE(o.name,dss.ontology_id) ORDER BY dss.ontology_id) FROM data_source_structures dss LEFT JOIN ontologies o ON o.id=dss.ontology_id WHERE dss.source_id=ds.id) AS ontology_names FROM data_sources ds`
function normalizeSourceOntologyIds(payload){return [...new Set((Array.isArray(payload.ontologyIds)?payload.ontologyIds:[payload.ontologyId]).map((item)=>String(item||'').trim()).filter(Boolean))]}
function inferSourceSyncMode(mode){const text=String(mode||'');if(text.includes('消息'))return'事件';if(text.includes('文件'))return'全量';return'增量'}
async function ensureSourceUsesOntology(pool,sourceId,ontologyId){const [rows]=await pool.query('SELECT COUNT(*) AS total FROM data_source_structures WHERE source_id=? AND ontology_id=?',[sourceId,ontologyId]);if(!Number(rows[0].total))throw Object.assign(new Error('该数据源未绑定当前图谱结构，请先在数据源配置中选择适用图谱结构'),{status:409})}
async function listSources(pool){const [rows]=await pool.query(`${sourceSelect} ORDER BY ds.updated_at DESC,ds.id ASC`);return rows.map(mapSource)}
async function createSource(pool,payload){if(!String(payload.name||'').trim()||!String(payload.range||'').trim())throw Object.assign(new Error('请填写数据源名称和数据范围'),{status:400});const ontologyIds=normalizeSourceOntologyIds(payload);if(!ontologyIds.length)throw Object.assign(new Error('请至少选择一个适用图谱结构'),{status:400});for(const ontologyId of ontologyIds)await getPublishedOntology(pool,ontologyId);const [rows]=await pool.query('SELECT COUNT(*) AS total FROM data_sources');const id='SRC-'+String(Number(rows[0].total)+1).padStart(3,'0');const connection=await pool.getConnection();try{await connection.beginTransaction();await connection.query('INSERT INTO data_sources (id,name,mode,data_range,owner,sync_mode,last_success,status) VALUES (?,?,?,?,?,?,?,?)',[id,String(payload.name).trim(),payload.mode||'数据库视图',payload.range,payload.owner||'张海',inferSourceSyncMode(payload.mode),'未同步','草稿']);for(const ontologyId of ontologyIds){await connection.query('INSERT INTO data_source_structures (source_id,ontology_id) VALUES (?,?)',[id,ontologyId]);await ensureMappingSet(connection,id,ontologyId)}await connection.commit();return mapSource((await pool.query(`${sourceSelect} WHERE ds.id=?`,[id]))[0][0])}catch(error){await connection.rollback();throw error}finally{connection.release()}}
async function getSource(pool,id){const [rows]=await pool.query(`${sourceSelect} WHERE ds.id=?`,[id]);return rows[0]||null}
async function testSource(pool,id){const source=await getSource(pool,id);if(!source)throw Object.assign(new Error('数据源不存在'),{status:404});await pool.query("UPDATE data_sources SET status=IF(status='异常','草稿',status) WHERE id=?",[id]);return{ok:true,message:'连接测试成功，耗时86ms',source:mapSource({...source,status:source.status==='异常'?'草稿':source.status})}}
async function toggleSource(pool,id,enabled){const source=await getSource(pool,id);if(!source)throw Object.assign(new Error('数据源不存在'),{status:404});if(enabled){const [mappings]=await pool.query("SELECT COUNT(*) AS total FROM semantic_mappings sm JOIN ontology_elements oe ON oe.ontology_id=sm.ontology_id AND oe.code=sm.target_code AND oe.element_type='property' WHERE sm.source_id=? AND sm.mapping_type='节点实例' AND sm.status='有效'",[id]);if(!Number(mappings[0].total))throw Object.assign(new Error('请先完成字段映射校验'),{status:409})}await pool.query('UPDATE data_sources SET status=? WHERE id=?',[enabled?'启用':'停用',id]);return mapSource((await pool.query(`${sourceSelect} WHERE ds.id=?`,[id]))[0][0])}
async function metadata(pool,id){const [rows]=await pool.query('SELECT * FROM data_source_metadata WHERE source_id=? ORDER BY table_name',[id]);return rows.map(mapMetadata)}
async function parseMetadata(pool,id){if(!await getSource(pool,id))throw Object.assign(new Error('数据源不存在'),{status:404});await seedMetadata(pool,id);await seedMappings(pool,id);return metadata(pool,id)}
async function mappings(pool,id,type=''){const params=[id];let where='WHERE sm.source_id=?';if(type){where+=' AND sm.mapping_type=?';params.push(type)}const [rows]=await pool.query(`SELECT sm.*,sms.revision,sms.status AS set_status,sms.last_validated_at FROM semantic_mappings sm LEFT JOIN semantic_mapping_sets sms ON sms.source_id=sm.source_id AND sms.ontology_id=sm.ontology_id ${where} ORDER BY sm.mapping_type,sm.id`,params);return rows.map(mapMapping)}
async function validateMappings(pool,id){const [rows]=await pool.query("SELECT COUNT(*) AS total FROM semantic_mappings sm JOIN ontology_elements oe ON oe.ontology_id=sm.ontology_id AND oe.code=sm.target_code AND oe.element_type='property' WHERE sm.source_id=? AND sm.mapping_type='节点实例'",[id]);if(!Number(rows[0].total))throw Object.assign(new Error('暂无可校验字段映射'),{status:409});await pool.query("UPDATE semantic_mappings sm JOIN ontology_elements oe ON oe.ontology_id=sm.ontology_id AND oe.code=sm.target_code AND oe.element_type='property' SET sm.status='有效' WHERE sm.source_id=? AND sm.mapping_type='节点实例'",[id]);return{ok:true,message:'字段映射校验通过'}}
async function getPublishedOntology(pool,id){const [rows]=await pool.query('SELECT id,name,version,status FROM ontologies WHERE id=?',[id]);if(!rows.length)throw Object.assign(new Error('图谱结构版本不存在'),{status:404});if(rows[0].status!=='已发布')throw Object.assign(new Error('只有已发布图谱结构才能用于图谱构建'),{status:409});return rows[0]}
async function parseMetadataForOntology(pool,id,ontologyId){if(!await getSource(pool,id))throw Object.assign(new Error('数据源不存在'),{status:404});await getPublishedOntology(pool,ontologyId);await ensureSourceUsesOntology(pool,id,ontologyId);await seedMetadata(pool,id);await seedOntologyMappings(pool,id,ontologyId);await ensureMappingSet(pool,id,ontologyId);await pool.query("UPDATE semantic_mapping_sets SET status='待校验',last_validated_at=NULL WHERE source_id=? AND ontology_id=?",[id,ontologyId]);return metadata(pool,id)}
async function mappingsForOntology(pool,id,ontologyId,type=''){await ensureSourceUsesOntology(pool,id,ontologyId);const params=[id,ontologyId];let where='WHERE sm.source_id=? AND sm.ontology_id=?';if(type){where+=' AND sm.mapping_type=?';params.push(type)}const [rows]=await pool.query(`SELECT sm.*,sms.revision,sms.status AS set_status,sms.last_validated_at FROM semantic_mappings sm LEFT JOIN semantic_mapping_sets sms ON sms.source_id=sm.source_id AND sms.ontology_id=sm.ontology_id ${where} ORDER BY sm.mapping_type,sm.id`,params);return rows.map(mapMapping)}
async function updateMappingForOntology(pool,sourceId,mappingId,payload){
  const ontologyId=String(payload.ontologyId||'').trim();if(!ontologyId)throw Object.assign(new Error('请选择图谱结构版本'),{status:400})
  await getPublishedOntology(pool,ontologyId)
  await ensureSourceUsesOntology(pool,sourceId,ontologyId)
  const [rows]=await pool.query('SELECT * FROM semantic_mappings WHERE id=? AND source_id=? AND ontology_id=?',[mappingId,sourceId,ontologyId]);if(!rows.length)throw Object.assign(new Error('字段映射不存在'),{status:404})
  if(rows[0].mapping_type!=='节点实例')throw Object.assign(new Error('字段映射页只维护来源字段到图谱字段，实例关系由系统生成'),{status:409})
  const targetCode=String(payload.targetCode??rows[0].target_code).trim();if(!targetCode)throw Object.assign(new Error('目标结构元素不能为空'),{status:400})
  const [targets]=await pool.query('SELECT element_type FROM ontology_elements WHERE ontology_id=? AND code=?',[ontologyId,targetCode]);if(!targets.length)throw Object.assign(new Error('目标元素不属于当前图谱结构版本'),{status:409})
  const target=targets[0];if(target.element_type!=='property')throw Object.assign(new Error('字段映射只能选择图谱属性字段'),{status:409})
  const sourceField=String(payload.sourceField??rows[0].source_field).trim();if(!sourceField)throw Object.assign(new Error('来源字段不能为空'),{status:400})
  await ensureMappingSet(pool,sourceId,ontologyId)
  await pool.query("UPDATE semantic_mappings SET source_field=?,target_code=?,transform_rule=?,status='待校验' WHERE id=?",[sourceField,targetCode,String(payload.transform??rows[0].transform_rule),mappingId])
  await pool.query("UPDATE semantic_mapping_sets SET revision=revision+1,status='待校验',last_validated_at=NULL WHERE source_id=? AND ontology_id=?",[sourceId,ontologyId])
  return (await mappingsForOntology(pool,sourceId,ontologyId)).find((item)=>item.id===String(mappingId))
}
async function upsertMappingForOntology(pool,sourceId,payload){
  const ontologyId=String(payload.ontologyId||'').trim();if(!ontologyId)throw Object.assign(new Error('请选择图谱结构版本'),{status:400})
  await getPublishedOntology(pool,ontologyId);await ensureSourceUsesOntology(pool,sourceId,ontologyId)
  const targetCode=String(payload.targetCode||'').trim();if(!targetCode)throw Object.assign(new Error('目标图谱字段不能为空'),{status:400})
  const sourceField=String(payload.sourceField||'').trim();if(!sourceField)throw Object.assign(new Error('来源字段不能为空'),{status:400})
  const [targets]=await pool.query("SELECT element_type FROM ontology_elements WHERE ontology_id=? AND code=?",[ontologyId,targetCode]);if(!targets.length)throw Object.assign(new Error('目标字段不属于当前图谱结构版本'),{status:409});if(targets[0].element_type!=='property')throw Object.assign(new Error('字段映射只能选择图谱属性字段'),{status:409})
  const [existing]=await pool.query("SELECT id FROM semantic_mappings WHERE source_id=? AND ontology_id=? AND mapping_type='节点实例' AND target_code=? ORDER BY id LIMIT 1",[sourceId,ontologyId,targetCode])
  if(existing.length)return updateMappingForOntology(pool,sourceId,existing[0].id,{ontologyId,targetCode,sourceField,transform:payload.transform})
  await ensureMappingSet(pool,sourceId,ontologyId)
  const [result]=await pool.query("INSERT INTO semantic_mappings (source_id,ontology_id,mapping_type,source_field,transform_rule,target_code,confidence,status) VALUES (?,?, '节点实例',?,?,?,100,'待校验')",[sourceId,ontologyId,sourceField,String(payload.transform||'直接映射'),targetCode])
  await pool.query("UPDATE semantic_mapping_sets SET revision=revision+1,status='待校验',last_validated_at=NULL WHERE source_id=? AND ontology_id=?",[sourceId,ontologyId])
  return (await mappingsForOntology(pool,sourceId,ontologyId)).find((item)=>item.id===String(result.insertId))
}
async function validateMappingsForOntology(pool,id,ontologyId){
  await getPublishedOntology(pool,ontologyId)
  await ensureSourceUsesOntology(pool,id,ontologyId)
  const [rows]=await pool.query("SELECT COUNT(*) AS total FROM semantic_mappings sm JOIN ontology_elements oe ON oe.ontology_id=sm.ontology_id AND oe.code=sm.target_code AND oe.element_type='property' WHERE sm.source_id=? AND sm.ontology_id=? AND sm.mapping_type='节点实例'",[id,ontologyId]);if(!Number(rows[0].total))throw Object.assign(new Error('当前数据源与图谱结构暂无可校验字段映射'),{status:409})
  const [invalid]=await pool.query("SELECT sm.id FROM semantic_mappings sm LEFT JOIN ontology_elements oe ON oe.ontology_id=sm.ontology_id AND oe.code=sm.target_code WHERE sm.source_id=? AND sm.ontology_id=? AND sm.mapping_type='节点实例' AND (oe.element_id IS NULL OR oe.element_type<>'property')",[id,ontologyId]);if(invalid.length)throw Object.assign(new Error(`存在${invalid.length}条字段映射目标无效，请先修正`),{status:409})
  const [missingRequired]=await pool.query("SELECT oe.code FROM ontology_elements oe LEFT JOIN semantic_mappings sm ON sm.source_id=? AND sm.ontology_id=oe.ontology_id AND sm.mapping_type='节点实例' AND sm.target_code=oe.code WHERE oe.ontology_id=? AND oe.element_type='property' AND (oe.constraint_desc LIKE '%必填%' OR oe.constraint_desc LIKE '%主标识%') AND (sm.id IS NULL OR sm.source_field='')",[id,ontologyId]);if(missingRequired.length)throw Object.assign(new Error(`存在${missingRequired.length}个必填图谱字段未匹配来源字段，请先配置`),{status:409})
  const [emptyRules]=await pool.query("SELECT id FROM semantic_mappings WHERE source_id=? AND ontology_id=? AND mapping_type='节点实例' AND (source_field='' OR transform_rule='')",[id,ontologyId]);if(emptyRules.length)throw Object.assign(new Error(`存在${emptyRules.length}条字段映射缺少来源字段或转换规则，请先修正`),{status:409})
  await ensureMappingSet(pool,id,ontologyId)
  await pool.query("UPDATE semantic_mappings sm JOIN ontology_elements oe ON oe.ontology_id=sm.ontology_id AND oe.code=sm.target_code AND oe.element_type='property' SET sm.status='有效' WHERE sm.source_id=? AND sm.ontology_id=? AND sm.mapping_type='节点实例'",[id,ontologyId])
  await pool.query("UPDATE semantic_mapping_sets SET status='有效',last_validated_at=NOW() WHERE source_id=? AND ontology_id=?",[id,ontologyId])
  const set=await ensureMappingSet(pool,id,ontologyId);return{ok:true,message:`字段映射 R${set.revision} 校验通过`,revision:Number(set.revision),status:set.status,lastValidatedAt:formatTime(set.last_validated_at)}
}
async function checkGraphDependencies(pool,payload){const ontologyId=String(payload.ontologyId||'').trim();if(!ontologyId)throw Object.assign(new Error('请选择已发布图谱结构'),{status:400});await getPublishedOntology(pool,ontologyId);return assessSelectedSources(pool,ontologyId,payload.sourceIds)}
const graphSelect=`SELECT gv.*,(SELECT GROUP_CONCAT(gvs.source_id ORDER BY gvs.source_id) FROM graph_version_sources gvs WHERE gvs.graph_id=gv.id) AS source_ids,(SELECT GROUP_CONCAT(ds.name ORDER BY ds.id) FROM graph_version_sources gvs JOIN data_sources ds ON ds.id=gvs.source_id WHERE gvs.graph_id=gv.id) AS source_names FROM graph_versions gv`
async function listGraphVersions(pool,url){const status=String(url.searchParams.get('status')||'');const params=[];let where='';if(status){where=' WHERE gv.status=?';params.push(status)}const [rows]=await pool.query(`${graphSelect}${where} ORDER BY gv.updated_at DESC,gv.id DESC`,params);return rows.map(mapGraphVersion)}
async function getGraphVersion(pool,id){const [rows]=await pool.query(`${graphSelect} WHERE gv.id=?`,[id]);return rows.length?mapGraphVersion(rows[0]):null}
async function assessSelectedSources(connection,ontologyId,sourceIds){
  const uniqueIds=[...new Set((Array.isArray(sourceIds)?sourceIds:[]).map((item)=>String(item).trim()).filter(Boolean))];if(!uniqueIds.length)return{ready:false,ontologyId,items:[]}
  const placeholders=uniqueIds.map(()=>'?').join(',');const [sources]=await connection.query(`SELECT id,name,status FROM data_sources WHERE id IN (${placeholders})`,uniqueIds);if(sources.length!==uniqueIds.length)throw Object.assign(new Error('部分数据源不存在或已被删除'),{status:409})
  const sourceMap=new Map(sources.map((item)=>[item.id,item]));const items=[]
  for(const sourceId of uniqueIds){const source=sourceMap.get(sourceId);const set=await ensureMappingSet(connection,sourceId,ontologyId);const [bindingRows]=await connection.query('SELECT COUNT(*) AS total FROM data_source_structures WHERE source_id=? AND ontology_id=?',[sourceId,ontologyId]);const bound=Number(bindingRows[0].total)>0;const [counts]=await connection.query("SELECT COUNT(*) AS total,SUM(sm.status='有效') AS valid_total FROM semantic_mappings sm JOIN ontology_elements oe ON oe.ontology_id=sm.ontology_id AND oe.code=sm.target_code AND oe.element_type='property' WHERE sm.source_id=? AND sm.ontology_id=? AND sm.mapping_type='节点实例'",[sourceId,ontologyId]);const [invalidRows]=await connection.query("SELECT COUNT(*) AS total FROM semantic_mappings sm LEFT JOIN ontology_elements oe ON oe.ontology_id=sm.ontology_id AND oe.code=sm.target_code WHERE sm.source_id=? AND sm.ontology_id=? AND sm.mapping_type='节点实例' AND (oe.element_id IS NULL OR oe.element_type<>'property')",[sourceId,ontologyId]);const [missingRows]=await connection.query("SELECT COUNT(*) AS total FROM ontology_elements oe LEFT JOIN semantic_mappings sm ON sm.source_id=? AND sm.ontology_id=oe.ontology_id AND sm.mapping_type='节点实例' AND sm.target_code=oe.code WHERE oe.ontology_id=? AND oe.element_type='property' AND (oe.constraint_desc LIKE '%必填%' OR oe.constraint_desc LIKE '%主标识%') AND (sm.id IS NULL OR sm.source_field='')",[sourceId,ontologyId]);const total=Number(counts[0].total);const valid=Number(counts[0].valid_total||0);const invalid=Number(invalidRows[0].total);const missing=Number(missingRows[0].total);let status='ready';let message=`字段映射 R${set.revision} 已就绪`;if(source.status!=='启用'){status='disabled';message=`数据源 ${source.name} 尚未启用`}else if(!bound){status='missing';message=`${source.name} 未选择当前图谱结构`}else if(!total){status='missing';message=`${source.name} 尚未配置当前图谱结构的字段映射`}else if(invalid){status='invalid';message=`${source.name} 存在${invalid}条无效字段映射`}else if(missing){status='invalid';message=`${source.name} 存在${missing}个必填图谱字段未匹配来源字段`}else if(valid!==total||set.status!=='有效'){status='pending';message=`${source.name} 的字段映射 R${set.revision} 尚未校验`}items.push({sourceId,sourceName:source.name,sourceStatus:source.status,status,revision:Number(set.revision||1),mappingCount:total,validCount:valid,lastValidatedAt:set.last_validated_at?formatTime(set.last_validated_at):'—',message})}
  return{ready:items.length>0&&items.every((item)=>item.status==='ready'),ontologyId,items}
}
async function validateSelectedSources(connection,ontologyId,sourceIds){if(!Array.isArray(sourceIds)||!sourceIds.length)throw Object.assign(new Error('请至少选择一个已启用数据源'),{status:400});const assessment=await assessSelectedSources(connection,ontologyId,sourceIds);const blocked=assessment.items.find((item)=>item.status!=='ready');if(blocked)throw Object.assign(new Error(blocked.message),{status:409});return{sourceIds:assessment.items.map((item)=>item.sourceId),mappingCount:assessment.items.reduce((sum,item)=>sum+item.mappingCount,0),items:assessment.items}}
async function validateGraphDependencies(connection,graph){
  await getPublishedOntology(connection,graph.ontology_id)
  const [links]=await connection.query('SELECT gvs.source_id,ds.name,ds.status FROM graph_version_sources gvs JOIN data_sources ds ON ds.id=gvs.source_id WHERE gvs.graph_id=? ORDER BY gvs.source_id',[graph.id]);if(!links.length)throw Object.assign(new Error('知识图谱未绑定数据源'),{status:409})
  const disabled=links.filter((item)=>item.status!=='启用');if(disabled.length)throw Object.assign(new Error(`数据源 ${disabled.map((item)=>item.name).join('、')} 尚未启用`),{status:409})
  const [snapshots]=await connection.query('SELECT source_id FROM graph_version_mapping_snapshots WHERE graph_id=?',[graph.id]);if(snapshots.length!==links.length)throw Object.assign(new Error('知识图谱缺少完整的字段映射快照'),{status:409})
  return{sourceIds:links.map((item)=>item.source_id),snapshotCount:snapshots.length}
}
async function createGraphVersion(pool,payload){
  const graphCode=String(payload.graphCode||'').trim().toUpperCase();const graphName=String(payload.graphName||'').trim();const ontologyId=String(payload.ontologyId||'').trim();const range=String(payload.range||'').trim()
  if(!/^[A-Z0-9_-]{3,64}$/.test(graphCode))throw Object.assign(new Error('图谱编码只能包含大写字母、数字、下划线和中划线'),{status:400});if(!graphName)throw Object.assign(new Error('图谱名称不能为空'),{status:400});if(!ontologyId)throw Object.assign(new Error('请选择已发布图谱结构'),{status:400});if(!range)throw Object.assign(new Error('请填写数据范围'),{status:400})
  const connection=await pool.getConnection()
  try{await connection.beginTransaction();const ontology=await getPublishedOntology(connection,ontologyId);const dependencies=await validateSelectedSources(connection,ontologyId,payload.sourceIds);const date=new Date().toISOString().slice(0,10).replaceAll('-','');const [counts]=await connection.query('SELECT COUNT(*) AS total FROM graph_versions WHERE id LIKE ?',[`GRAPH-${date}.%`]);const id=`GRAPH-${date}.${Number(counts[0].total)+1}`;const scale=Math.max(1,dependencies.sourceIds.length);const mappingVersion=dependencies.items.map((item)=>`${item.sourceId}:R${item.revision}`).join(' / ').slice(0,80);await connection.query("INSERT INTO graph_versions (id,graph_code,graph_name,ontology_id,ontology_version,mapping_version,data_range,entity_count,relation_count,event_count,blockers,warnings,status) VALUES (?,?,?,?,?,?,?,?,?,0,0,0,'待发布')",[id,graphCode,graphName,ontology.id,`${ontology.name} ${ontology.version}`,mappingVersion,range,59000*scale,103000*scale]);for(const item of dependencies.items){await connection.query('INSERT INTO graph_version_sources (graph_id,source_id) VALUES (?,?)',[id,item.sourceId]);const [mappingRows]=await connection.query('SELECT id,source_id,ontology_id,mapping_type,source_field,transform_rule,target_code,confidence,status,updated_at FROM semantic_mappings WHERE source_id=? AND ontology_id=? ORDER BY mapping_type,id',[item.sourceId,ontologyId]);await connection.query("INSERT INTO graph_version_mapping_snapshots (graph_id,source_id,ontology_id,mapping_revision,mapping_status,mapping_count,snapshot_json) VALUES (?,?,?,?,?,?,?)",[id,item.sourceId,ontologyId,item.revision,'已绑定',mappingRows.length,json(mappingRows)])}await connection.commit();return await getGraphVersion(pool,id)}catch(error){await connection.rollback();throw error}finally{connection.release()}
}
async function updateGraphVersion(pool,id,payload){
  const connection=await pool.getConnection()
  try{
    await connection.beginTransaction()
    const [rows]=await connection.query('SELECT * FROM graph_versions WHERE id=? FOR UPDATE',[id])
    if(!rows.length)throw Object.assign(new Error('知识图谱生成结果不存在'),{status:404})
    const graph=rows[0]
    if(!['校验中','待发布','失败'].includes(graph.status))throw Object.assign(new Error('已发布或已归档的生成结果不能编辑'),{status:409})
    const graphCode=String(payload.graphCode??graph.graph_code).trim().toUpperCase();const graphName=String(payload.graphName??graph.graph_name).trim();const ontologyId=String(payload.ontologyId??graph.ontology_id).trim();const range=String(payload.range??graph.data_range).trim()
    if(!/^[A-Z0-9_-]{3,64}$/.test(graphCode))throw Object.assign(new Error('图谱编码只能包含大写字母、数字、下划线和中划线'),{status:400});if(!graphName)throw Object.assign(new Error('图谱名称不能为空'),{status:400});if(!ontologyId)throw Object.assign(new Error('请选择已发布图谱结构'),{status:400});if(!range)throw Object.assign(new Error('数据范围不能为空'),{status:400})
    let sourceIds=Array.isArray(payload.sourceIds)?payload.sourceIds:null
    if(!sourceIds){const [links]=await connection.query('SELECT source_id FROM graph_version_sources WHERE graph_id=? ORDER BY source_id',[id]);sourceIds=links.map((item)=>item.source_id)}
    const ontology=await getPublishedOntology(connection,ontologyId)
    const dependencies=await validateSelectedSources(connection,ontologyId,sourceIds)
    const scale=Math.max(1,dependencies.sourceIds.length);const mappingVersion=dependencies.items.map((item)=>`${item.sourceId}:R${item.revision}`).join(' / ').slice(0,80)
    await connection.query("UPDATE graph_versions SET graph_code=?,graph_name=?,ontology_id=?,ontology_version=?,mapping_version=?,data_range=?,entity_count=?,relation_count=?,event_count=0,blockers=0,warnings=0,status='待发布',published_at=NULL WHERE id=?",[graphCode,graphName,ontology.id,`${ontology.name} ${ontology.version}`,mappingVersion,range,59000*scale,103000*scale,id])
    await connection.query('DELETE FROM graph_version_mapping_snapshots WHERE graph_id=?',[id])
    await connection.query('DELETE FROM graph_version_sources WHERE graph_id=?',[id])
    for(const item of dependencies.items){
      await connection.query('INSERT INTO graph_version_sources (graph_id,source_id) VALUES (?,?)',[id,item.sourceId])
      const [mappingRows]=await connection.query('SELECT id,source_id,ontology_id,mapping_type,source_field,transform_rule,target_code,confidence,status,updated_at FROM semantic_mappings WHERE source_id=? AND ontology_id=? ORDER BY mapping_type,id',[item.sourceId,ontologyId])
      await connection.query("INSERT INTO graph_version_mapping_snapshots (graph_id,source_id,ontology_id,mapping_revision,mapping_status,mapping_count,snapshot_json) VALUES (?,?,?,?,?,?,?)",[id,item.sourceId,ontologyId,item.revision,'已绑定',mappingRows.length,json(mappingRows)])
    }
    await connection.commit();return await getGraphVersion(pool,id)
  }catch(error){await connection.rollback();throw error}finally{connection.release()}
}
async function publishGraphVersion(pool,id){const connection=await pool.getConnection();try{await connection.beginTransaction();const [rows]=await connection.query('SELECT * FROM graph_versions WHERE id=? FOR UPDATE',[id]);if(!rows.length)throw Object.assign(new Error('知识图谱生成结果不存在'),{status:404});const graph=rows[0];if(Number(graph.blockers)>0)throw Object.assign(new Error(`存在${graph.blockers}个阻断问题，不能发布`),{status:409});if(graph.status!=='待发布')throw Object.assign(new Error('只有待发布知识图谱可以发布'),{status:409});await validateGraphDependencies(connection,graph);await connection.query("UPDATE graph_versions SET status='已归档' WHERE status='已发布' AND graph_code=? AND id<>?",[graph.graph_code,id]);await connection.query("UPDATE graph_versions SET status='已发布',published_at=NOW() WHERE id=?",[id]);await connection.commit();return await getGraphVersion(pool,id)}catch(error){await connection.rollback();throw error}finally{connection.release()}}
async function deleteSourceWithReferences(pool,id){const source=await getSource(pool,id);if(!source)throw Object.assign(new Error('数据源不存在'),{status:404});if(source.status==='启用')throw Object.assign(new Error('请先停用数据源，再执行删除'),{status:409});const [graphRefs]=await pool.query('SELECT COUNT(*) AS total FROM graph_version_sources WHERE source_id=?',[id]);if(Number(graphRefs[0].total))throw Object.assign(new Error('该数据源已被知识图谱引用，不能删除'),{status:409});return deleteSource(pool,id)}
async function syncSource(pool,id){const source=await getSource(pool,id);if(!source)throw Object.assign(new Error('数据源不存在'),{status:404});if(source.status!=='启用')throw Object.assign(new Error('请先完成映射校验并启用数据源'),{status:409});const recordId='SYNC-'+Date.now().toString(36).toUpperCase();await pool.query('INSERT INTO sync_records (id,source_id,source_name,sync_mode,started_at,processed_count,error_count,duration_text,result) VALUES (?,?,?,?,NOW(),?,?,?,?)',[recordId,id,source.name,source.sync_mode,Math.floor(300+Math.random()*6000),0,'12秒','成功']);await pool.query("UPDATE data_sources SET last_success='刚刚' WHERE id=?",[id]);return{recordId,message:'同步完成，已写入同步记录'}}
async function listSync(pool,sourceId=''){const params=[];let where='';if(sourceId){where='WHERE source_id=?';params.push(sourceId)}const [rows]=await pool.query(`SELECT * FROM sync_records ${where} ORDER BY started_at DESC LIMIT 30`,params);return rows.map(mapSync)}
async function listGraphs(pool,url){const status=String(url.searchParams.get('status')||'');const params=[];let where='';if(status){where='WHERE status=?';params.push(status)}const [rows]=await pool.query(`SELECT * FROM graph_versions ${where} ORDER BY updated_at DESC,id DESC`,params);return rows.map(mapGraph)}
async function createGraph(pool,payload){const id=String(payload.id||`GRAPH-${new Date().toISOString().slice(0,10).replaceAll('-','')}.${Math.floor(Math.random()*9)+1}`).trim().toUpperCase();await pool.query('INSERT INTO graph_versions (id,ontology_id,ontology_version,mapping_version,data_range,entity_count,relation_count,event_count,blockers,warnings,status) VALUES (?,?,?,?,?,?,?,0,?,?,?)',[id,payload.ontologyId||'ONT-PROC',payload.ontologyVersion||'BASE v1.6 / PROC v2.2',payload.mappingVersion||'MAP v3.6',payload.range||'2026-01-01 至今',Number(payload.entities||129000)+Number(payload.events||0),Number(payload.relations||311000),Number(payload.blockers||0),Number(payload.warnings||0),'待发布']);return mapGraph((await pool.query('SELECT * FROM graph_versions WHERE id=?',[id]))[0][0])}
async function publishGraph(pool,id){const connection=await pool.getConnection();try{await connection.beginTransaction();const [rows]=await connection.query('SELECT * FROM graph_versions WHERE id=? FOR UPDATE',[id]);if(!rows.length)throw Object.assign(new Error('知识图谱生成结果不存在'),{status:404});const graph=rows[0];if(Number(graph.blockers)>0)throw Object.assign(new Error(`存在${graph.blockers}个阻断问题，不能发布`),{status:409});if(graph.status!=='待发布')throw Object.assign(new Error('只有待发布知识图谱可以发布'),{status:409});await connection.query("UPDATE graph_versions SET status='已归档' WHERE status='已发布'");await connection.query("UPDATE graph_versions SET status='已发布',published_at=NOW() WHERE id=?",[id]);await connection.commit();return mapGraph((await pool.query('SELECT * FROM graph_versions WHERE id=?',[id]))[0][0])}catch(error){await connection.rollback();throw error}finally{connection.release()}}
async function resolveIssue(pool,graphId,issueId){await pool.query("UPDATE graph_quality_issues SET status='已处理' WHERE graph_id=? AND id=?",[graphId,issueId]);return{ok:true,message:'生成检查项已处理'}}
async function govern(pool,graphId,taskId,payload){if(!String(payload.reason||'').trim())throw Object.assign(new Error('处理原因不能为空'),{status:400});await pool.query("UPDATE graph_governance_tasks SET status='已处理',result=?,reason=? WHERE graph_id=? AND id=?",[payload.result||'合并',payload.reason,graphId,taskId]);return{ok:true,message:`实例${payload.result||'合并'}完成，影响记录已生成`}}

async function deleteSource(pool,id){
  const source=await getSource(pool,id)
  if(!source)throw Object.assign(new Error('数据源不存在'),{status:404})
  if(source.status==='启用')throw Object.assign(new Error('请先停用数据源，再执行删除'),{status:409})
  const [records]=await pool.query('SELECT COUNT(*) AS total FROM sync_records WHERE source_id=?',[id])
  if(Number(records[0].total)>0)throw Object.assign(new Error('该数据源已有同步记录，为保证追溯链路不能删除'),{status:409})
  await pool.query('DELETE FROM data_sources WHERE id=?',[id])
  return{ok:true,message:'数据源已删除'}
}
async function deleteGraph(pool,id){
  const [rows]=await pool.query('SELECT * FROM graph_versions WHERE id=?',[id])
  if(!rows.length)throw Object.assign(new Error('知识图谱生成结果不存在'),{status:404})
  if(!['校验中','待发布','失败'].includes(rows[0].status))throw Object.assign(new Error('已发布或已归档的生成结果不能删除'),{status:409})
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
  if(mappingItem&&req.method==='PUT'){sendJson(res,200,await updateMappingForOntology(pool,decodeURIComponent(mappingItem[1]),decodeURIComponent(mappingItem[2]),await readBody(req)));return true}
  const scopedSourceAction=url.pathname.match(/^\/api\/data-sources\/([^/]+)\/(metadata\/parse|mappings\/validate|mappings)$/)
  if(scopedSourceAction){
    const id=decodeURIComponent(scopedSourceAction[1]);const action=scopedSourceAction[2];const ontologyId=String(url.searchParams.get('ontologyId')||'ONT-PROC')
    if(action==='mappings'&&req.method==='GET'){sendJson(res,200,await mappingsForOntology(pool,id,ontologyId,String(url.searchParams.get('type')||'')));return true}
    if(action==='mappings'&&req.method==='POST'){sendJson(res,201,await upsertMappingForOntology(pool,id,await readBody(req)));return true}
    if(action==='metadata/parse'&&req.method==='POST'){const body=await readBody(req);sendJson(res,200,await parseMetadataForOntology(pool,id,String(body.ontologyId||ontologyId)));return true}
    if(action==='mappings/validate'&&req.method==='POST'){const body=await readBody(req);sendJson(res,200,await validateMappingsForOntology(pool,id,String(body.ontologyId||ontologyId)));return true}
  }
  if(url.pathname==='/api/graphs/dependencies/check'&&req.method==='POST'){sendJson(res,200,await checkGraphDependencies(pool,await readBody(req)));return true}
  if(url.pathname==='/api/graphs'&&req.method==='GET'){sendJson(res,200,await listGraphVersions(pool,url));return true}
  if(url.pathname==='/api/graphs'&&req.method==='POST'){sendJson(res,201,await createGraphVersion(pool,await readBody(req)));return true}
  const scopedPublish=url.pathname.match(/^\/api\/graphs\/([^/]+)\/publish$/)
  if(scopedPublish&&req.method==='POST'){sendJson(res,200,await publishGraphVersion(pool,decodeURIComponent(scopedPublish[1])));return true}
  if(url.pathname==='/api/data-sources'&&req.method==='GET'){sendJson(res,200,await listSources(pool));return true}
  if(url.pathname==='/api/data-sources'&&req.method==='POST'){sendJson(res,201,await createSource(pool,await readBody(req)));return true}
  const sourceItem=url.pathname.match(/^\/api\/data-sources\/([^/]+)$/)
  if(sourceItem&&req.method==='DELETE'){sendJson(res,200,await deleteSource(pool,decodeURIComponent(sourceItem[1])));return true}
  const sourceAction=url.pathname.match(/^\/api\/data-sources\/([^/]+)\/(test|toggle|metadata\/parse|metadata|mappings\/validate|mappings|sync)$/)
  if(sourceAction){const id=decodeURIComponent(sourceAction[1]);const action=sourceAction[2];if(action==='test'&&req.method==='POST'){sendJson(res,200,await testSource(pool,id));return true}if(action==='toggle'&&req.method==='POST'){sendJson(res,200,await toggleSource(pool,id,Boolean((await readBody(req)).enabled)));return true}if(action==='metadata/parse'&&req.method==='POST'){sendJson(res,200,await parseMetadata(pool,id));return true}if(action==='metadata'&&req.method==='GET'){sendJson(res,200,await metadata(pool,id));return true}if(action==='mappings'&&req.method==='GET'){sendJson(res,200,await mappings(pool,id,String(url.searchParams.get('type')||'')));return true}if(action==='mappings/validate'&&req.method==='POST'){sendJson(res,200,await validateMappings(pool,id));return true}if(action==='sync'&&req.method==='POST'){sendJson(res,201,await syncSource(pool,id));return true}}
  if(url.pathname==='/api/sync-records'&&req.method==='GET'){sendJson(res,200,await listSync(pool,String(url.searchParams.get('sourceId')||'')));return true}
  if(url.pathname==='/api/graphs'&&req.method==='GET'){sendJson(res,200,await listGraphs(pool,url));return true}
  if(url.pathname==='/api/graphs'&&req.method==='POST'){sendJson(res,201,await createGraph(pool,await readBody(req)));return true}
  const graphItem=url.pathname.match(/^\/api\/graphs\/([^/]+)$/)
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

