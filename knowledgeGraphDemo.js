import ExcelJS from 'exceljs'
import { createDemoData, demoMappings } from './knowledgeGraphDemoData.js'
import { batchId, registerDemoAsset } from './knowledgeGraphDemoRegistry.js'
import { createGraphVersion, createGraphDraft, publishGraphVersion, syncGraphVersion, toggleSource, testSource, parseMetadataForOntology } from './dataGraphApi.js'

const json = value => JSON.stringify(value)
const ids = { proc: 'KG-DEMO-M-PROC', contract: 'KG-DEMO-M-CONTRACT', base: 'KG-DEMO-M-BASE' }
const sourceId = kind => `KG-DEMO-S-${kind.toUpperCase()}`
const settingsDefault = { ready: false, version: 1, failure: false, qualityError: true, delayMs: 0 }
async function settings(pool) { const [rows] = await pool.query('SELECT value_json FROM knowledge_graph_demo_settings WHERE id=?', [batchId]); return rows.length ? { ...settingsDefault, ...(typeof rows[0].value_json === 'object' ? rows[0].value_json : JSON.parse(rows[0].value_json)) } : { ...settingsDefault } }
async function saveSettings(pool, value) { await pool.query('INSERT INTO knowledge_graph_demo_settings (id,value_json) VALUES (?,?) ON DUPLICATE KEY UPDATE value_json=VALUES(value_json)', [batchId, json(value)]) }

export async function demoStatus(pool, { includeDeleted = false } = {}) {
  const [rows] = await pool.query('SELECT asset_type,asset_id FROM knowledge_graph_demo_assets WHERE batch_id=?', [batchId])
  const assets = { model: [], source: [], graph: [] }
  for (const row of rows) if (assets[row.asset_type]) assets[row.asset_type].push(row.asset_id)
  for (const [type,table] of [['model','ontologies'],['source','data_sources'],['graph','graph_versions']]) {
    if(!assets[type].length)continue
    const [existing]=await pool.query(`SELECT id FROM ?? WHERE id IN (?)${type==='model'&&!includeDeleted?" AND status<>'已删除'":''}`,[table,assets[type]])
    const found=new Set(existing.map(row=>row.id));assets[type]=assets[type].filter(id=>found.has(id))
  }
  return { batchId, ...await settings(pool), assets }
}

const internalTables = new Set(['ontologies','ontology_elements','ontology_entity_groups','ontology_audits','data_sources','data_source_metadata','data_source_structures','data_source_files','semantic_mappings','semantic_mapping_sets','graph_versions','graph_version_sources','graph_version_mapping_snapshots','graph_edit_drafts','graph_instance_datasets','graph_quality_issues','graph_governance_tasks','graph_governance_history','graph_sync_records'])
async function assertRestorable(db, assets) {
  const [columns] = await db.query("SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND COLUMN_NAME IN ('ontology_id','source_id','graph_id','graph_version')")
  const issues = []
  for (const column of columns) {
    if (internalTables.has(column.TABLE_NAME)) continue
    const values = column.COLUMN_NAME === 'ontology_id' ? assets.model : column.COLUMN_NAME === 'source_id' ? assets.source : assets.graph
    if (!values.length) continue
    const [refs] = await db.query('SELECT COUNT(*) total FROM ?? WHERE ?? IN (?)', [column.TABLE_NAME, column.COLUMN_NAME, values])
    if (Number(refs[0].total)) issues.push(`${column.TABLE_NAME} 有 ${refs[0].total} 条引用`)
  }
  if (assets.model.length) {
    const [refs] = await db.query('SELECT id FROM graph_versions WHERE ontology_id IN (?)', [assets.model])
    if (refs.some(row => !assets.graph.includes(row.id))) issues.push('演示模型被非演示图谱引用')
  }
  if (assets.source.length) {
    const [refs] = await db.query('SELECT graph_id FROM graph_version_sources WHERE source_id IN (?)', [assets.source])
    if (refs.some(row => !assets.graph.includes(row.graph_id))) issues.push('演示来源被非演示图谱引用')
    const [mappings]=await db.query('SELECT DISTINCT ontology_id FROM semantic_mappings WHERE source_id IN (?)',[assets.source])
    if(mappings.some(row=>!assets.model.includes(row.ontology_id)))issues.push('演示来源被非演示模型的映射引用')
  }
  const [drafts]=await db.query('SELECT graph_id,ontology_id,source_ids_json FROM graph_edit_drafts')
  for(const draft of drafts.filter(row=>!assets.graph.includes(row.graph_id))){
    const sourceIds=typeof draft.source_ids_json==='string'?JSON.parse(draft.source_ids_json):draft.source_ids_json||[]
    if(assets.model.includes(draft.ontology_id)||sourceIds.some(id=>assets.source.includes(id)))issues.push(`非演示图谱 ${draft.graph_id} 的编辑草稿存在引用`)
  }
  if (issues.length) throw Object.assign(new Error(`无法恢复演示样例：${issues.join('；')}。请先处理外部引用，原数据已保留。`), { status: 409 })
  const [running] = await db.query("SELECT graph_id FROM graph_sync_records WHERE status='同步中'")
  if (running.some(row => assets.graph.includes(row.graph_id))) throw Object.assign(new Error('演示图谱正在同步，请完成后再恢复样例'), { status: 409 })
}

async function resetOwnedAssets(pool) {
  const status = await demoStatus(pool, { includeDeleted: true })
  const db = await pool.getConnection()
  try {
    await db.beginTransaction()
    await assertRestorable(db, status.assets)
    for (const [type, table] of [['graph','graph_versions'],['source','data_sources'],['model','ontologies']]) {
      if (status.assets[type].length) await db.query('DELETE FROM ?? WHERE id IN (?)', [table, status.assets[type]])
    }
    await db.query('DELETE FROM knowledge_graph_demo_assets WHERE batch_id=?', [batchId])
    await saveSettings(db, settingsDefault)
    await db.commit()
  } catch (error) { await db.rollback(); throw error } finally { db.release() }
}

function subset(elements, kinds) {
  const codes = new Set(kinds.map(kind => `DEMO.${kind}`))
  return elements.filter(e => e.type === 'class' ? codes.has(e.code) : e.type === 'property' ? codes.has(e.ownerCode) : codes.has(e.ownerCode) && codes.has(e.targetCode))
}

async function workbookFor(tables, blankFirst = false) {
  const book = new ExcelJS.Workbook()
  if (blankFirst) book.addWorksheet('说明空表')
  for (const table of tables) {
    const sheet = book.addWorksheet(table.name.slice(0, 31))
    sheet.addRow(table.fields)
    for (const row of table.rows) sheet.addRow(table.fields.map(field => row[field] ?? ''))
  }
  return Buffer.from(await book.xlsx.writeBuffer())
}

async function seedDemoTables(pool, tables) {
  // This reserved namespace is owned only after its table comment matches this batch.
  for (const table of tables.filter(table => table.source === 'erp')) {
    const [existing] = await pool.query('SELECT TABLE_COMMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', [table.name])
    if (existing.length && existing[0].TABLE_COMMENT !== batchId) throw new Error(`演示表名称冲突：${table.name}，没有覆盖已有表`)
    const columns = table.fields.map(field => `\`${field}\` VARCHAR(255) NOT NULL DEFAULT ''`).join(',')
    await pool.query(`CREATE TABLE IF NOT EXISTS \`${table.name}\` (${columns}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='${batchId}'`)
  }
  const db=await pool.getConnection()
  try{
    await db.beginTransaction()
    for(const table of tables.filter(table=>table.source==='erp')){
      await db.query(`DELETE FROM \`${table.name}\``)
      if(table.rows.length)await db.query(`INSERT INTO \`${table.name}\` (${table.fields.map(field=>`\`${field}\``).join(',')}) VALUES ?`,[table.rows.map(row=>table.fields.map(field=>row[field]))])
    }
    await db.commit()
  }catch(error){await db.rollback();throw error}finally{db.release()}
}

export async function prepareKnowledgeGraphDemo(pool, baseUrl) {
  const lock = await pool.getConnection()
  const [locks] = await lock.query("SELECT GET_LOCK('knowledge-graph-demo-prepare',0) acquired")
  if (!Number(locks[0].acquired)) { lock.release(); throw Object.assign(new Error('正在准备演示样例，请稍候'), { status: 409 }) }
  try {
    await resetOwnedAssets(pool)
    const data = createDemoData()
    await seedDemoTables(pool, data.tables)
    const contract = subset(data.elements, ['Supplier','Contract','Approval','Invoice','Payment'])
    const basic = subset(data.elements, ['Organization','Person','Contact'])
    const models = [
      [ids.proc,'采购全流程监管模型','采购与供应链','启用',data.elements],
      [ids.contract,'合同履约监管模型','合同','启用',contract],
      [ids.base,'组织人员基础模型','通用','启用',basic],
      ['KG-DEMO-M-EXTEND','采购模型扩展草稿','采购与供应链','草稿',data.elements],
      ['KG-DEMO-M-INCOMPLETE','结构待完善模型','采购','草稿',[]],
      ['KG-DEMO-M-PRACTICE','临时建模练习','通用','草稿',[]],
      ['KG-DEMO-M-FINANCE','财务资金监管模型','财务','停用',subset(data.elements,['Contract','Invoice','Payment'])],
      ['KG-DEMO-M-HISTORY','采购历史模型','采购','停用',data.elements],
    ]
    for (const [id,name,domain,status,elements] of models) {
      await pool.query('INSERT INTO ontologies (id,name,scope,domain,version,status,description,class_count,property_count,relation_count,event_count) VALUES (?,?,?,?,?,?,?,?,?,?,0)', [id,name,domain==='通用'?'基础图谱模型':'领域图谱模型',domain,status==='草稿'?'待启用':'V1',status,'客户演示专用虚构数据；独立批次，可恢复初始样例',elements.filter(e=>e.type==='class').length,elements.filter(e=>e.type==='property').length,elements.filter(e=>e.type==='relation').length])
      await registerDemoAsset(pool,'model',id,batchId)
      if(elements.length)await pool.query('INSERT INTO ontology_elements (ontology_id,element_type,code,name,group_name,owner_code,target_code,data_type,constraint_desc,description) VALUES ?', [elements.map(e=>[id,e.type,e.code,e.name,e.groupName||'',e.ownerCode||'',e.targetCode||'',e.dataType||'',e.constraint||'',e.description||''])])
      for (const [i, group] of ['主数据','采购执行','履约结算'].entries()) await pool.query('INSERT INTO ontology_entity_groups (ontology_id,name,sort_order) VALUES (?,?,?)',[id,group,i])
    }
    const databaseConfig = { databaseType:'MySQL',host:process.env.MYSQL_HOST||'127.0.0.1',port:String(process.env.MYSQL_PORT||3306),databaseName:process.env.MYSQL_DATABASE||'penetrative_supervision',username:process.env.MYSQL_USER||'root',password:process.env.MYSQL_PASSWORD||'',tables:data.tables.filter(t=>t.source==='erp').map(t=>t.name) }
    const apiConfig = kind => ({apiUrl:`${baseUrl}/api/knowledge-graph-demo/data/${kind}`,method:'GET',authType:'无认证'})
    const sources = [
      ['erp','演示 ERP 采购库','数据库接入','启用',databaseConfig],['oa','演示 OA 审批服务','接口接入','启用',apiConfig('oa')],
      ['treasury','演示司库结算服务','接口接入','启用',apiConfig('treasury')],['external','演示工商联系服务','接口接入','启用',apiConfig('external')],
      ['file','演示验收入库台账','文件导入','启用',{}],['draft-api','待配置采购接口','接口接入','草稿',apiConfig('oa')],
      ['draft-file','待上传供应商台账','文件导入','草稿',{}],['backup','备用采购库','数据库接入','停用',databaseConfig],
      ['practice','临时导入练习源','文件导入','停用',{}],['fault','质量与连接异常样例','接口接入','启用',apiConfig('all')],
    ]
    for (const [kind,name,mode,,config] of sources) {
      await pool.query("INSERT INTO data_sources (id,name,mode,data_range,owner,sync_mode,access_config,last_success,status,connection_status) VALUES (?,?,?,?,?,'手动全量快照',?,'未同步','草稿','未测试')",[sourceId(kind),name,mode,'客户演示：虚构业务数据','陈洁',json(config)])
      await registerDemoAsset(pool,'source',sourceId(kind),batchId)
    }
    const upload = async (kind, name, tables, blankFirst = false) => {
      const content = await workbookFor(tables,blankFirst)
      const form = new FormData(); form.append('file',new Blob([content]),name)
      const response = await fetch(`${baseUrl}/api/data-sources/${sourceId(kind)}/files`,{method:'POST',body:form})
      if(!response.ok)throw new Error((await response.json()).message)
    }
    await upload('file','验收入库演示台账.xlsx',data.tables.filter(t=>t.source==='file'),true)
    await upload('practice','供应商导入练习.xlsx',[data.tables.find(t=>t.kind==='Supplier')])
    for (const [kind,,,status] of sources) {
      if (status==='启用') await toggleSource(pool,sourceId(kind),true)
      else if(status==='停用') { if(kind!=='practice')await testSource(pool,sourceId(kind));await toggleSource(pool,sourceId(kind),false) }
      if(!['draft-file','draft-api','practice'].includes(kind)) await parseMetadataForOntology(pool,sourceId(kind),ids.proc)
    }
    const [fileMeta] = await pool.query('SELECT table_name,display_name FROM data_source_metadata WHERE source_id=?',[sourceId('file')])
    const fileNames = Object.fromEntries(data.tables.filter(t=>t.source==='file').map(t=>[t.name,fileMeta.find(m=>m.display_name.endsWith(t.name))?.table_name]))
    for (const [ontologyId,,,status,elements] of models.filter(m=>m[4].length)) {
      if(status!=='启用')continue
      for (const kind of ['erp','oa','treasury','external','file','fault']) {
        const tables = data.tables.filter(t=>kind==='fault'||t.source===kind)
        const mappings = demoMappings(tables,elements,sourceId(kind),ontologyId,kind==='file'?fileNames:{})
        if(!mappings.length)continue
        await pool.query('INSERT INTO semantic_mappings (source_id,ontology_id,mapping_type,source_field,target_code,transform_rule,status,confidence) VALUES ?',[mappings.map(m=>[m.source_id,m.ontology_id,m.mapping_type,m.source_field,m.target_code,m.transform_rule,m.status,m.confidence])])
        await pool.query("INSERT INTO semantic_mapping_sets (source_id,ontology_id,revision,status,last_validated_at) VALUES (?,?,1,'有效',NOW()) ON DUPLICATE KEY UPDATE status='有效',last_validated_at=NOW()",[sourceId(kind),ontologyId])
      }
    }
    const mainSources=['erp','oa','treasury','external','file'].map(sourceId)
    const make = (name, ontologyId=ids.proc, elements=data.elements, sourceIds=mainSources) => createGraphVersion(pool,{graphName:name,graphCode:`KG-DEMO-${name.includes('合同')?'CONTRACT':'PROC'}`,tag:name.includes('合同')?'合同监管':'采购监管',ontologyId,structureElements:elements,sourceIds,range:'虚构演示数据 · 2026年11月 · 金额单位元',demoBatch:batchId})
    const main=await make('采购全流程监管图谱');await publishGraphVersion(pool,main.id)
    const contractGraph=await make('合同履约监管图谱',ids.contract,contract,mainSources.filter(id=>id!==sourceId('file')&&id!==sourceId('external')));await publishGraphVersion(pool,contractGraph.id)
    const updated=await syncGraphVersion(pool,main.id)
    await pool.query("UPDATE graph_versions SET graph_name='采购监管图谱更新版' WHERE id=?",[updated.id])
    await make('供应商联系分析图谱',ids.proc,subset(data.elements,['Supplier','Person','Contact']),['erp','oa','external'].map(sourceId))
    await make('质量检查待完善图谱',ids.proc,data.elements,[sourceId('fault')])
    for (const name of ['采购图谱配置草稿','生成失败恢复样例','临时图谱练习']) {
      const graph=await createGraphDraft(pool,{graphName:name,graphCode:'KG-DEMO-PRACTICE',ontologyId:ids.proc,structureElements:data.elements,sourceIds:mainSources,range:'演示练习，可编辑或删除',demoBatch:batchId})
      if(name==='生成失败恢复样例') {
        // Produce a real failed synchronization, then return the object to an editable draft.
        await pool.query("UPDATE graph_versions SET status='待发布' WHERE id=?",[graph.id])
        try{await syncGraphVersion(pool,graph.id)}catch{}
        await pool.query("UPDATE graph_versions SET status='生成失败',entity_count=0,relation_count=0 WHERE id=?",[graph.id])
      }
    }
    await saveSettings(pool,{...settingsDefault,ready:true,failure:true})
    try{await testSource(pool,sourceId('fault'))}catch{}
    return demoStatus(pool)
  } finally { await lock.query("SELECT RELEASE_LOCK('knowledge-graph-demo-prepare')").catch(()=>{});lock.release() }
}

export async function handleKnowledgeGraphDemoApi(req,res,url,{pool,sendJson,readBody}) {
  const root='/api/knowledge-graph-demo'
  if(!url.pathname.startsWith(root))return false
  if(url.pathname===`${root}/status`&&req.method==='GET'){sendJson(res,200,await demoStatus(pool));return true}
  if(url.pathname===`${root}/prepare`&&req.method==='POST'){sendJson(res,200,await prepareKnowledgeGraphDemo(pool,`http://127.0.0.1:${process.env.APP_PORT||4173}`));return true}
  if(url.pathname===`${root}/control`&&req.method==='POST'){
    const body=await readBody(req),current=await settings(pool)
    if(!current.ready)throw Object.assign(new Error('请先准备演示样例'),{status:409})
    const next={...current,...(body.version!==undefined?{version:body.version===2?2:1}:{}),...(body.failure!==undefined?{failure:Boolean(body.failure)}:{}),...(body.qualityError!==undefined?{qualityError:Boolean(body.qualityError)}:{}),...(body.delayMs!==undefined?{delayMs:Math.max(0,Math.min(5000,Number(body.delayMs)||0))}:{})}
    if(next.version!==current.version)await seedDemoTables(pool,createDemoData(next.version).tables)
    await saveSettings(pool,next)
    if(body.failure!==undefined)try{await testSource(pool,sourceId('fault'))}catch{}
    sendJson(res,200,await demoStatus(pool));return true
  }
  const dataRoute=url.pathname.match(/^\/api\/knowledge-graph-demo\/data\/(oa|treasury|external|all)$/)
  if(dataRoute&&req.method==='GET'){
    const state=await settings(pool)
    if(dataRoute[1]==='all'&&state.failure){sendJson(res,503,{message:'专用演示接口暂时不可用，请恢复异常样例后重新测试'});return true}
    if(state.delayMs)await new Promise(resolve=>setTimeout(resolve,state.delayMs))
    const tables=createDemoData(state.version,dataRoute[1]==='all'&&state.qualityError).tables.filter(t=>dataRoute[1]==='all'||t.source===dataRoute[1])
    sendJson(res,200,{...Object.fromEntries(tables.map(t=>[t.name,t.rows])),_schema:Object.fromEntries(tables.map(t=>[t.name,t.fields]))});return true
  }
  if(url.pathname===`${root}/files`&&req.method==='GET'){
    const kind=url.searchParams.get('kind')||'workbook',data=createDemoData()
    const table=data.tables.find(t=>t.kind==='Supplier')
    if(kind==='csv'||kind==='invalid'){
      const rows=table.rows.map((r,i)=>({...r,id:kind==='invalid'&&i===0?'':r.id}))
      const content='\uFEFF'+[table.fields.join(','),...rows.map(row=>table.fields.map(field=>String(row[field])).join(','))].join('\r\n')
      res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${kind==='invalid'?'missing-id':'supplier-demo'}.csv"`});res.end(content)
    }else{const content=await workbookFor(data.tables,true);res.writeHead(200,{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="knowledge-graph-demo.xlsx"'});res.end(content)}
    return true
  }
  sendJson(res,404,{message:'演示接口不存在'});return true
}
