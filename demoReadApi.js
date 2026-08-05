const defaultBatchIds=['DEMO-20260720-PKG-V1','RULE-TEST-20260722-V1']
const batchIds=String(process.env.DEMO_BATCH_IDS||defaultBatchIds.join(','))
  .split(',').map((item)=>item.trim()).filter(Boolean)

const workflowResetDefaults=[
  ['WA-FT-CROSS-03','待复核','尹晨阳','王宁',3,'整改材料已提交，等待监管负责人复核'],
  ['WA-FT-CROSS-01','待整改','赵明','赵明',2,'已明确整改责任人，正在补充例外审批材料'],
  ['WA-DEMO-006','待复核','尹晨阳','王宁',-1,'保留一条逾期复核任务，用于验证催办和复核处置'],
  ['WA-DEMO-003','待整改','周航','周航',-2,'保留一条逾期整改任务，用于验证逾期处置'],
  ['WA-FT-R12-HIT','待复核','李华','王宁',2,'资金流向说明与凭证已提交，等待复核'],
  ['WA-FT-R04-HIT','待复核','尹晨阳','周航',3,'投标终端核查材料已提交，等待复核'],
  ['WA-FT-R06-BND','待整改','王宁','王宁',4,'正在核实实际控制关系和责任边界'],
  ['WA-FT-R08-HIT','待整改','赵明','赵明',5,'正在补充预算批复与公告时间说明'],
  ['WA-FT-R10-BND','待整改','周航','周航',6,'正在补充专家抽取记录和审批依据'],
  ['WA-FT-R02-BND','待整改','赵明','赵明',7,'正在补充非公开采购例外审批材料'],
]

const parseJson=(value,fallback={})=>{if(value===null||value===undefined||value==='')return fallback;if(typeof value==='object')return value;try{return JSON.parse(value)}catch{return fallback}}
const formatTime=(value)=>value instanceof Date?value.toLocaleString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'}).replaceAll('/','-'):String(value||'')
const statusMap={待研判:'待研判',待处理:'待研判',核查整改中:'待研判',核查中:'待研判',待复核:'待研判',持续观察:'待研判',已解除:'已解除',已升级:'已升级'}

function leadTime(generated,due){
  if(!(generated instanceof Date)||!(due instanceof Date))return '—'
  const hours=Math.round((due.getTime()-generated.getTime())/3600000)
  if(hours<0)return `已越过${Math.abs(hours)}小时`
  if(hours>=24)return `${Math.floor(hours/24)}天${hours%24}小时`
  return `${hours}小时`
}

function mapWarning(row,runSummary='',eventWorkflow=null,ruleLibrary=''){
  return {
    id:row.warning_code,
    caseId:row.case_id,
    title:row.title,
    stage:row.stage,
    status:statusMap[row.status]||'待研判',
    rawStatus:row.status,
    level:row.risk_level,
    scene:row.scene_name||row.scene_code,
    sceneCode:row.scene_code,
    sceneVersion:row.scene_version||row.scene_version_id,
    sceneVersionId:row.scene_version_id,
    ruleLibrary:ruleLibrary||'穿透式监管规则库',
    target:row.object_name,
    targetId:row.object_id,
    targetEvent:row.event_name||'规则运行',
    organization:row.organization_name,
    owner:row.owner_name,
    expectedAt:formatTime(row.due_at),
    leadTime:leadTime(row.generated_at,row.due_at),
    evidenceStatus:row.evidence_status,
    path:runSummary||`已固化${Number(row.evidence_count)}项有效证据`,
    generatedAt:formatTime(row.generated_at),
    updatedAt:formatTime(row.generated_at),
    riskScore:Number(row.risk_score),
    hitRuleCount:Number(row.hit_rule_count),
    evidenceCount:Number(row.evidence_count),
    graphVersion:row.graph_version,
    traceId:row.trace_id,
    riskEventStatus:eventWorkflow?.status||'',
    riskEventDueAt:formatTime(eventWorkflow?.due_at),
    riskEventOwner:eventWorkflow?.owner_name||'',
    riskEventRectificationOwner:eventWorkflow?.rectification_owner_name||'',
    databaseBacked:true,
  }
}

async function warningRows(pool,where='',params=[]){
  const [rows]=await pool.query(`SELECT w.*,sv.name AS scene_name,sv.version AS scene_version,sv.event_name
    FROM risk_warnings w LEFT JOIN scene_versions sv ON sv.id=w.scene_version_id
    WHERE w.batch_id IN (?) ${where} ORDER BY w.risk_score DESC,w.generated_at DESC,w.warning_code`,[batchIds,...params])
  const ids=rows.map((row)=>row.warning_code)
  const summaries=new Map()
  const libraries=new Map()
  const workflows=new Map()
  if(ids.length){
    const [runs]=await pool.query(`SELECT rr.warning_code,GROUP_CONCAT(JSON_UNQUOTE(JSON_EXTRACT(rr.evidence_json,'$.actualValueSummary')) ORDER BY rr.executed_at SEPARATOR '；') AS summary,
      GROUP_CONCAT(DISTINCT COALESCE(rav.library_name,'穿透式监管规则库') ORDER BY rav.library_name SEPARATOR '、') AS rule_library
      FROM rule_run_records rr LEFT JOIN rule_asset_versions rav ON rav.id=rr.rule_version_id WHERE rr.warning_code IN (?) GROUP BY rr.warning_code`,[ids])
    runs.forEach((row)=>{summaries.set(row.warning_code,String(row.summary||''));libraries.set(row.warning_code,String(row.rule_library||'穿透式监管规则库'))})
    try{
      const [eventRows]=await pool.query(`SELECT warning_code,status,owner_name,rectification_owner_name,due_at,updated_at
        FROM risk_event_workflow_snapshots WHERE warning_code IN (?)`,[ids])
      eventRows.forEach((row)=>workflows.set(row.warning_code,row))
    }catch(error){
      if(error?.code!=='ER_NO_SUCH_TABLE')throw error
    }
  }
  return rows.map((row)=>mapWarning(row,summaries.get(row.warning_code)||'',workflows.get(row.warning_code)||null,libraries.get(row.warning_code)||''))
}

async function ensureWorkflowTable(connection){
  await connection.query(`CREATE TABLE IF NOT EXISTS risk_event_workflow_snapshots (
    event_id VARCHAR(100) PRIMARY KEY,
    warning_code VARCHAR(80) NOT NULL UNIQUE,
    status VARCHAR(24) NOT NULL,
    owner_name VARCHAR(80) NOT NULL,
    rectification_owner_name VARCHAR(80) NULL,
    due_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    workflow_note VARCHAR(500) NOT NULL DEFAULT '',
    batch_id VARCHAR(80) NOT NULL,
    KEY idx_event_workflow_status (status,due_at),
    KEY idx_event_workflow_batch (batch_id),
    CONSTRAINT fk_event_workflow_warning FOREIGN KEY (warning_code) REFERENCES risk_warnings(warning_code) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
}

function resetDueAt(offsetDays){
  const value=new Date()
  value.setDate(value.getDate()+offsetDays)
  value.setHours(18,0,0,0)
  return value
}

async function resetWorkflow(pool){
  const connection=await pool.getConnection()
  try{
    await ensureWorkflowTable(connection)
    const warningCodes=workflowResetDefaults.map((item)=>item[0])
    const [warningRows]=await connection.query('SELECT warning_code FROM risk_warnings WHERE warning_code IN (?)',[warningCodes])
    const found=new Set(warningRows.map((row)=>row.warning_code))
    const missing=warningCodes.filter((code)=>!found.has(code))
    if(missing.length)throw new Error(`缺少演示预警：${missing.join('、')}`)
    await connection.beginTransaction()
    try{
      const sql=`INSERT INTO risk_event_workflow_snapshots
        (event_id,warning_code,status,owner_name,rectification_owner_name,due_at,updated_at,workflow_note,batch_id)
        SELECT ?,w.warning_code,?,?,?,?,NOW(),?,w.batch_id FROM risk_warnings w WHERE w.warning_code=?
        ON DUPLICATE KEY UPDATE status=VALUES(status),owner_name=VALUES(owner_name),
          rectification_owner_name=VALUES(rectification_owner_name),due_at=VALUES(due_at),
          updated_at=VALUES(updated_at),workflow_note=VALUES(workflow_note),batch_id=VALUES(batch_id)`
      for(const [warningCode,status,owner,rectificationOwner,offsetDays,note] of workflowResetDefaults){
        const eventId=`RE-${warningCode.replace(/^WA-/,'')}`
        await connection.query(sql,[eventId,status,owner,rectificationOwner,resetDueAt(offsetDays),note,warningCode])
      }
      await connection.commit()
    }catch(error){
      await connection.rollback()
      throw error
    }
    const [rows]=await connection.query(`SELECT status,COUNT(*) AS total,
      SUM(CASE WHEN status<>'已关闭' AND due_at<NOW() THEN 1 ELSE 0 END) AS overdue
      FROM risk_event_workflow_snapshots WHERE warning_code IN (?) GROUP BY status`,[warningCodes])
    const counts={rectification:0,review:0,overdue:0}
    rows.forEach((row)=>{if(row.status==='待整改')counts.rectification=Number(row.total);if(row.status==='待复核')counts.review=Number(row.total);counts.overdue+=Number(row.overdue)})
    return {ok:true,message:`演示工作流已重置：${counts.rectification}个待整改、${counts.review}个待复核、${counts.overdue}个事件逾期`,counts}
  }finally{
    connection.release()
  }
}

async function summary(pool){
  const [[counts]]=await pool.query(`SELECT
    (SELECT COUNT(*) FROM graph_entities WHERE batch_id IN (?)) AS entities,
    (SELECT COUNT(*) FROM graph_relations WHERE batch_id IN (?)) AS relations,
    (SELECT COUNT(*) FROM graph_events WHERE batch_id IN (?)) AS events,
    (SELECT COUNT(*) FROM risk_warnings WHERE batch_id IN (?)) AS warnings,
    (SELECT COUNT(*) FROM risk_evidence WHERE batch_id IN (?)) AS evidence,
    (SELECT COUNT(*) FROM bid_evaluation_scores WHERE batch_id IN (?)) AS bid_scores,
    (SELECT COUNT(*) FROM trade_cycle_records WHERE batch_id IN (?)) AS trade_records`,[batchIds,batchIds,batchIds,batchIds,batchIds,batchIds,batchIds])
  return Object.fromEntries(Object.entries(counts).map(([key,value])=>[key,Number(value)]))
}

async function warningDetail(pool,id){
  const warnings=await warningRows(pool,'AND w.warning_code=?',[id])
  if(!warnings.length)return null
  const warning=warnings[0]
  const [evidenceRows]=await pool.query('SELECT * FROM risk_evidence WHERE batch_id IN (?) AND warning_code=? ORDER BY collected_at,evidence_id',[batchIds,id])
  const [runRows]=await pool.query(`SELECT rr.id,rr.object_code,rr.object_name,rr.outcome,rr.executed_at,rr.evidence_json,rr.rule_version_id,rav.name AS rule_name,ra.code AS rule_code
    FROM rule_run_records rr LEFT JOIN rule_asset_versions rav ON rav.id=rr.rule_version_id LEFT JOIN rule_assets ra ON ra.id=rav.rule_id
    WHERE rr.warning_code=? ORDER BY rr.executed_at,rr.id`,[id])
  const [relations]=await pool.query('SELECT * FROM graph_relations WHERE batch_id IN (?) AND graph_id=? AND case_id=? ORDER BY id',[batchIds,warning.graphVersion,warning.caseId])
  const [events]=await pool.query('SELECT * FROM graph_events WHERE batch_id IN (?) AND graph_id=? AND case_id=? ORDER BY event_time,id',[batchIds,warning.graphVersion,warning.caseId])
  const referencedIds=[...new Set(relations.flatMap((row)=>[row.from_entity_id,row.to_entity_id]).concat(events.flatMap((row)=>[row.object_entity_id,row.actor_entity_id,row.organization_entity_id]).filter(Boolean)))]
  let nodes=[]
  if(referencedIds.length){
    const [nodeRows]=await pool.query('SELECT * FROM graph_entities WHERE batch_id IN (?) AND graph_id=? AND id IN (?) ORDER BY class_code,id',[batchIds,warning.graphVersion,referencedIds])
    nodes=nodeRows
  }
  const ontologyId=String(nodes[0]?.ontology_id||'')
  let ontology={id:ontologyId,name:'',version:'',elements:[]}
  if(ontologyId){
    const [ontologyRows]=await pool.query('SELECT id,name,version FROM ontologies WHERE id=?',[ontologyId])
    const [elementRows]=await pool.query('SELECT element_type,code,name,owner_code,target_code,data_type,constraint_desc,description FROM ontology_elements WHERE ontology_id=? ORDER BY element_type,element_id',[ontologyId])
    const ontologyRow=ontologyRows[0]||{}
    ontology={id:ontologyId,name:ontologyRow.name||ontologyId,version:ontologyRow.version||'',elements:elementRows.map((row)=>({type:row.element_type,code:row.code,name:row.name,ownerCode:row.owner_code||'',targetCode:row.target_code||'',dataType:row.element_type==='class'?'本体类':(row.data_type||''),constraint:row.constraint_desc||'',description:row.description||''}))}
  }
  const [tradeRows]=await pool.query('SELECT * FROM trade_cycle_records WHERE batch_id IN (?) AND case_id=? ORDER BY business_time,business_id',[batchIds,warning.caseId])
  return {
    ontology,
    warning,
    evidence:evidenceRows.map((row)=>({id:row.evidence_id,warningId:row.warning_code,caseId:row.case_id,type:row.evidence_type,sourceSystem:row.source_system,sourceRecord:row.source_record,fieldOrRelation:row.field_or_relation,value:row.evidence_value,collectedAt:formatTime(row.collected_at),validity:row.validity,hash:row.evidence_hash,description:row.description})),
    runs:runRows.map((row)=>{const detail=parseJson(row.evidence_json,{});return{id:row.id,ruleVersionId:row.rule_version_id,ruleCode:row.rule_code||row.rule_version_id,ruleName:row.rule_name||'风险规则',objectId:row.object_code,objectName:row.object_name,outcome:row.outcome,executedAt:formatTime(row.executed_at),actualValueSummary:detail.actualValueSummary||'',riskLevel:detail.riskLevel||warning.level,evidenceStatus:detail.evidenceStatus||warning.evidenceStatus}}),
    graph:{
      id:warning.graphVersion,
      nodes:nodes.map((row)=>({id:row.id,classCode:row.class_code,name:row.name,caseId:row.case_id,organizationId:row.organization_id,sourceSystem:row.source_system,sourceRecord:row.source_record,status:row.status,properties:parseJson(row.properties_json,{})})),
      relations:relations.map((row)=>({id:row.id,relationCode:row.relation_code,fromId:row.from_entity_id,toId:row.to_entity_id,evidenceId:row.evidence_id,confidence:Number(row.confidence),sourceSystem:row.source_system,properties:parseJson(row.properties_json,{})})),
      events:events.map((row)=>({id:row.id,eventCode:row.event_code,name:row.name,objectId:row.object_entity_id,actorId:row.actor_entity_id,organizationId:row.organization_entity_id,eventTime:formatTime(row.event_time),amount:row.amount===null?null:Number(row.amount),status:row.status,sourceSystem:row.source_system,properties:parseJson(row.properties_json,{})})),
    },
    tradeCycle:tradeRows.map((row)=>({businessId:row.business_id,caseId:row.case_id,businessType:row.business_type,internalOrgId:row.internal_org_id,counterpartyId:row.counterparty_id,itemName:row.item_name,specification:row.specification,quantity:Number(row.quantity),unitPrice:Number(row.unit_price),amount:Number(row.amount),direction:row.direction,businessTime:formatTime(row.business_time),sourceAccountId:row.source_account_id,targetAccountId:row.target_account_id,modeCodes:row.mode_codes,evidenceConclusion:row.evidence_conclusion})),
  }
}

async function graphDetail(pool,id,url){
  const caseId=String(url.searchParams.get('caseId')||'')
  const [nodes]=await pool.query(`SELECT * FROM graph_entities WHERE batch_id IN (?) AND graph_id=?${caseId?' AND case_id=?':''} ORDER BY class_code,id`,caseId?[batchIds,id,caseId]:[batchIds,id])
  const [relations]=await pool.query(`SELECT * FROM graph_relations WHERE batch_id IN (?) AND graph_id=?${caseId?' AND case_id=?':''} ORDER BY id`,caseId?[batchIds,id,caseId]:[batchIds,id])
  const [events]=await pool.query(`SELECT * FROM graph_events WHERE batch_id IN (?) AND graph_id=?${caseId?' AND case_id=?':''} ORDER BY event_time,id`,caseId?[batchIds,id,caseId]:[batchIds,id])
  return {id,caseId,nodes,relations,events}
}

export async function handleDemoReadApi(req,res,url,{pool,sendJson}){
  if(!url.pathname.startsWith('/api/demo/'))return false
  if(url.pathname==='/api/demo/workflow/reset'&&req.method==='POST'){sendJson(res,200,await resetWorkflow(pool));return true}
  if(req.method!=='GET')return false
  if(url.pathname==='/api/demo/summary'){sendJson(res,200,await summary(pool));return true}
  if(url.pathname==='/api/demo/warnings'){sendJson(res,200,await warningRows(pool));return true}
  const warningMatch=url.pathname.match(/^\/api\/demo\/warnings\/([^/]+)$/)
  if(warningMatch){const detail=await warningDetail(pool,decodeURIComponent(warningMatch[1]));sendJson(res,detail?200:404,detail||{message:'演示预警不存在'});return true}
  const graphMatch=url.pathname.match(/^\/api\/demo\/graphs\/([^/]+)$/)
  if(graphMatch){sendJson(res,200,await graphDetail(pool,decodeURIComponent(graphMatch[1]),url));return true}
  if(url.pathname==='/api/demo/bid-evaluations'){
    const caseId=String(url.searchParams.get('caseId')||'');const projectId=String(url.searchParams.get('projectId')||'');const params=[batchIds];let where='WHERE batch_id IN (?)';if(caseId){where+=' AND case_id=?';params.push(caseId)}if(projectId){where+=' AND project_id=?';params.push(projectId)}const [rows]=await pool.query(`SELECT * FROM bid_evaluation_scores ${where} ORDER BY project_id,risk_score DESC,bid_id`,params);sendJson(res,200,rows);return true
  }
  if(url.pathname==='/api/demo/trade-cycle'){
    const caseId=String(url.searchParams.get('caseId')||'CASE-006');const [rows]=await pool.query('SELECT * FROM trade_cycle_records WHERE batch_id IN (?) AND case_id=? ORDER BY business_time,business_id',[batchIds,caseId]);sendJson(res,200,rows);return true
  }
  return false
}
