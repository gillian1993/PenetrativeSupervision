const batchId='DEMO-20260720-PKG-V1'

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

function mapWarning(row,runSummary=''){
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
    databaseBacked:true,
  }
}

async function warningRows(pool,where='',params=[]){
  const [rows]=await pool.query(`SELECT w.*,sv.name AS scene_name,sv.version AS scene_version,sv.event_name
    FROM risk_warnings w LEFT JOIN scene_versions sv ON sv.id=w.scene_version_id
    WHERE w.batch_id=? ${where} ORDER BY w.risk_score DESC,w.generated_at DESC,w.warning_code`,[batchId,...params])
  const ids=rows.map((row)=>row.warning_code)
  const summaries=new Map()
  if(ids.length){
    const [runs]=await pool.query(`SELECT warning_code,GROUP_CONCAT(JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.actualValueSummary')) ORDER BY executed_at SEPARATOR '；') AS summary
      FROM rule_run_records WHERE warning_code IN (?) GROUP BY warning_code`,[ids])
    runs.forEach((row)=>summaries.set(row.warning_code,String(row.summary||'')))
  }
  return rows.map((row)=>mapWarning(row,summaries.get(row.warning_code)||''))
}

async function summary(pool){
  const [[counts]]=await pool.query(`SELECT
    (SELECT COUNT(*) FROM graph_entities WHERE batch_id=?) AS entities,
    (SELECT COUNT(*) FROM graph_relations WHERE batch_id=?) AS relations,
    (SELECT COUNT(*) FROM graph_events WHERE batch_id=?) AS events,
    (SELECT COUNT(*) FROM risk_warnings WHERE batch_id=?) AS warnings,
    (SELECT COUNT(*) FROM risk_evidence WHERE batch_id=?) AS evidence,
    (SELECT COUNT(*) FROM bid_evaluation_scores WHERE batch_id=?) AS bid_scores,
    (SELECT COUNT(*) FROM trade_cycle_records WHERE batch_id=?) AS trade_records`,[batchId,batchId,batchId,batchId,batchId,batchId,batchId])
  return Object.fromEntries(Object.entries(counts).map(([key,value])=>[key,Number(value)]))
}

async function warningDetail(pool,id){
  const warnings=await warningRows(pool,'AND w.warning_code=?',[id])
  if(!warnings.length)return null
  const warning=warnings[0]
  const [evidenceRows]=await pool.query('SELECT * FROM risk_evidence WHERE batch_id=? AND warning_code=? ORDER BY collected_at,evidence_id',[batchId,id])
  const [runRows]=await pool.query(`SELECT rr.id,rr.object_code,rr.object_name,rr.outcome,rr.executed_at,rr.evidence_json,rr.rule_version_id,rav.name AS rule_name,ra.code AS rule_code
    FROM rule_run_records rr LEFT JOIN rule_asset_versions rav ON rav.id=rr.rule_version_id LEFT JOIN rule_assets ra ON ra.id=rav.rule_id
    WHERE rr.warning_code=? ORDER BY rr.executed_at,rr.id`,[id])
  const [relations]=await pool.query('SELECT * FROM graph_relations WHERE batch_id=? AND graph_id=? AND case_id=? ORDER BY id',[batchId,warning.graphVersion,warning.caseId])
  const [events]=await pool.query('SELECT * FROM graph_events WHERE batch_id=? AND graph_id=? AND case_id=? ORDER BY event_time,id',[batchId,warning.graphVersion,warning.caseId])
  const referencedIds=[...new Set(relations.flatMap((row)=>[row.from_entity_id,row.to_entity_id]).concat(events.flatMap((row)=>[row.object_entity_id,row.actor_entity_id,row.organization_entity_id]).filter(Boolean)))]
  let nodes=[]
  if(referencedIds.length){
    const [nodeRows]=await pool.query('SELECT * FROM graph_entities WHERE batch_id=? AND graph_id=? AND id IN (?) ORDER BY class_code,id',[batchId,warning.graphVersion,referencedIds])
    nodes=nodeRows
  }
  const ontologyId=String(nodes[0]?.ontology_id||'')
  let ontology={id:ontologyId,name:'',version:'',elements:[]}
  if(ontologyId){
    const [ontologyRows]=await pool.query('SELECT id,name,version FROM ontologies WHERE id=?',[ontologyId])
    const [elementRows]=await pool.query('SELECT element_type,code,name,owner_code,target_code,data_type,constraint_desc,description FROM ontology_elements WHERE ontology_id=? ORDER BY element_type,element_id',[ontologyId])
    const ontologyRow=ontologyRows[0]||{}
    ontology={id:ontologyId,name:ontologyRow.name||ontologyId,version:ontologyRow.version||'',elements:elementRows.map((row)=>({type:row.element_type,code:row.code,name:row.name,ownerCode:row.owner_code||'',targetCode:row.target_code||'',dataType:row.data_type||'',constraint:row.constraint_desc||'',description:row.description||''}))}
  }
  const [bidRows]=await pool.query('SELECT * FROM bid_evaluation_scores WHERE batch_id=? AND case_id=? ORDER BY project_id,risk_score DESC,bid_id',[batchId,warning.caseId])
  const [tradeRows]=await pool.query('SELECT * FROM trade_cycle_records WHERE batch_id=? AND case_id=? ORDER BY business_time,business_id',[batchId,warning.caseId])
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
    bidEvaluations:bidRows.map((row)=>({evaluationId:row.evaluation_id,caseId:row.case_id,projectId:row.project_id,bidId:row.bid_id,supplierId:row.supplier_id,supplierName:row.supplier_name,technicalScore:Number(row.technical_score),commercialScore:Number(row.commercial_score),priceScore:Number(row.price_score),relationRiskDeduction:Number(row.relation_risk_deduction),totalScore:Number(row.total_score),riskScore:Number(row.risk_score),rating:row.rating,recommendation:row.recommendation})),
    tradeCycle:tradeRows.map((row)=>({businessId:row.business_id,caseId:row.case_id,businessType:row.business_type,internalOrgId:row.internal_org_id,counterpartyId:row.counterparty_id,itemName:row.item_name,specification:row.specification,quantity:Number(row.quantity),unitPrice:Number(row.unit_price),amount:Number(row.amount),direction:row.direction,businessTime:formatTime(row.business_time),sourceAccountId:row.source_account_id,targetAccountId:row.target_account_id,modeCodes:row.mode_codes,evidenceConclusion:row.evidence_conclusion})),
  }
}

async function graphDetail(pool,id,url){
  const caseId=String(url.searchParams.get('caseId')||'')
  const [nodes]=await pool.query(`SELECT * FROM graph_entities WHERE batch_id=? AND graph_id=?${caseId?' AND case_id=?':''} ORDER BY class_code,id`,caseId?[batchId,id,caseId]:[batchId,id])
  const [relations]=await pool.query(`SELECT * FROM graph_relations WHERE batch_id=? AND graph_id=?${caseId?' AND case_id=?':''} ORDER BY id`,caseId?[batchId,id,caseId]:[batchId,id])
  const [events]=await pool.query(`SELECT * FROM graph_events WHERE batch_id=? AND graph_id=?${caseId?' AND case_id=?':''} ORDER BY event_time,id`,caseId?[batchId,id,caseId]:[batchId,id])
  return {id,caseId,nodes,relations,events}
}

export async function handleDemoReadApi(req,res,url,{pool,sendJson}){
  if(req.method!=='GET'||!url.pathname.startsWith('/api/demo/'))return false
  if(url.pathname==='/api/demo/summary'){sendJson(res,200,await summary(pool));return true}
  if(url.pathname==='/api/demo/warnings'){sendJson(res,200,await warningRows(pool));return true}
  const warningMatch=url.pathname.match(/^\/api\/demo\/warnings\/([^/]+)$/)
  if(warningMatch){const detail=await warningDetail(pool,decodeURIComponent(warningMatch[1]));sendJson(res,detail?200:404,detail||{message:'演示预警不存在'});return true}
  const graphMatch=url.pathname.match(/^\/api\/demo\/graphs\/([^/]+)$/)
  if(graphMatch){sendJson(res,200,await graphDetail(pool,decodeURIComponent(graphMatch[1]),url));return true}
  if(url.pathname==='/api/demo/bid-evaluations'){
    const caseId=String(url.searchParams.get('caseId')||'');const projectId=String(url.searchParams.get('projectId')||'');const params=[batchId];let where='WHERE batch_id=?';if(caseId){where+=' AND case_id=?';params.push(caseId)}if(projectId){where+=' AND project_id=?';params.push(projectId)}const [rows]=await pool.query(`SELECT * FROM bid_evaluation_scores ${where} ORDER BY project_id,risk_score DESC,bid_id`,params);sendJson(res,200,rows);return true
  }
  if(url.pathname==='/api/demo/trade-cycle'){
    const caseId=String(url.searchParams.get('caseId')||'CASE-006');const [rows]=await pool.query('SELECT * FROM trade_cycle_records WHERE batch_id=? AND case_id=? ORDER BY business_time,business_id',[batchId,caseId]);sendJson(res,200,rows);return true
  }
  return false
}
