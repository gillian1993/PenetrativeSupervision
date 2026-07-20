import { randomUUID } from 'node:crypto'

export async function handleEffectSampleApi(req,res,url,{pool,sendJson,readBody}){
  if(url.pathname!=='/api/effect-samples'||req.method!=='POST')return false
  const payload=await readBody(req)
  const objectId=String(payload.objectId||'').trim()
  const conclusion=String(payload.conclusion||payload.action||'').trim()
  if(!objectId||!conclusion){sendJson(res,400,{message:'业务对象和处置结论不能为空'});return true}
  const effectLabel=conclusion.includes('解除')||conclusion.includes('不成立')?'无效命中':conclusion.includes('升级')||conclusion.includes('关闭')?'有效命中':'待复核'
  const id=`EFFECT-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0,6).toUpperCase()}`
  await pool.query('INSERT INTO rule_effect_samples (id,run_record_id,conclusion,effect_label,feedback_json) VALUES (?,?,?,?,?)',[id,objectId,conclusion,effectLabel,JSON.stringify({objectType:payload.objectType||'预警',summary:payload.summary||'',operator:payload.operator||'赵明',source:'风险处置闭环'})])
  sendJson(res,201,{id,effectLabel})
  return true
}
