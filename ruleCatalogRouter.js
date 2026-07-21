import { getRiskPattern, getRuleCatalogSummary, importRuleCatalog, listRiskPatterns, previewRuleCatalogImport } from './ruleCatalogService.js'

export async function handleRuleCatalogApi(req,res,url,{pool,sendJson,readBody}){
  if(req.method==='GET'&&url.pathname==='/api/rule-catalog/preview'){sendJson(res,200,await previewRuleCatalogImport(pool));return true}
  if(req.method==='GET'&&url.pathname==='/api/rule-catalog/summary'){sendJson(res,200,await getRuleCatalogSummary(pool));return true}
  if(req.method==='POST'&&url.pathname==='/api/rule-catalog/import'){
    const payload=await readBody(req)
    if(payload.confirm!=='IMPORT_DRAFTS')throw Object.assign(new Error('请传入 confirm=IMPORT_DRAFTS 确认以禁用草稿方式导入'),{status:400})
    sendJson(res,201,await importRuleCatalog(pool,{operator:String(payload.operator||'尹晨阳')}));return true
  }
  if(req.method==='GET'&&url.pathname==='/api/risk-patterns'){sendJson(res,200,await listRiskPatterns(pool,url));return true}
  const match=url.pathname.match(/^\/api\/risk-patterns\/([^/]+)$/)
  if(req.method==='GET'&&match){const item=await getRiskPattern(pool,decodeURIComponent(match[1]));if(!item)throw Object.assign(new Error('风险模式不存在'),{status:404});sendJson(res,200,item);return true}
  return false
}