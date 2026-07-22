import type { RuleItem, SceneItem, SceneReferences, TrialTask, ValidationResult } from './sceneRuleTypes'

function normalizeRuleText(value:string){
  return value
    .replaceAll('重大负面舆情置信度≥配置阈值','重大负面舆情核验状态=已核实')
    .replaceAll('地址/电话/联系人任一高置信重合','地址、电话或联系人任一字段标准化后完全重合')
    .replaceAll('至少2项高置信元数据相同','至少2项元数据完全相同')
    .replaceAll('任一高置信字段重合','联系人、手机、邮箱或办公地址任一字段完全重合')
    .replaceAll('12个月项目数≥3且轮换规律置信度≥阈值','12个月项目数≥3且连续轮换中标次数≥2')
    .replaceAll('保证金来源同一且报价规律置信度≥阈值','保证金来源同一且报价呈等差或稳定梯度')
    .replaceAll('生成低置信线索','生成待核查线索')
    .replaceAll('低置信','待核查')
    .replaceAll('高置信','已核验')
    .replaceAll('置信度','核验状态')
    .replaceAll('可信度','核验状态')
}

function normalizeRuleResponse<T>(value:T):T{
  if(typeof value==='string')return normalizeRuleText(value) as T
  if(Array.isArray(value))return value.map((item)=>normalizeRuleResponse(item)) as T
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,normalizeRuleResponse(item)])) as T
  return value
}

async function request<T>(url:string,options?:RequestInit):Promise<T>{
  const response=await fetch(url,{headers:{'Content-Type':'application/json',...(options?.headers||{})},...options})
  const data=await response.json().catch(()=>({message:'服务返回格式错误'}))
  if(!response.ok)throw new Error(data.message||`请求失败：${response.status}`)
  return normalizeRuleResponse(data) as T
}

export const sceneRuleApi={
  listScenes:(filters?:{keyword?:string;status?:string;domain?:string})=>{
    const params=new URLSearchParams();if(filters?.keyword)params.set('keyword',filters.keyword);if(filters?.status&&filters.status!=='全部')params.set('status',filters.status);if(filters?.domain&&filters.domain!=='全部')params.set('domain',filters.domain)
    return request<SceneItem[]>(`/api/scenes${params.size?`?${params}`:''}`)
  },
  getScene:(id:string)=>request<SceneItem>(`/api/scenes/${encodeURIComponent(id)}`),
  createScene:(payload:Partial<SceneItem>&{code:string;name:string})=>request<SceneItem>('/api/scenes',{method:'POST',body:JSON.stringify(payload)}),
  updateScene:(id:string,payload:Partial<SceneItem>&{lockVersion:number})=>request<SceneItem>(`/api/scenes/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(payload)}),
  deleteScene:(id:string)=>request<{ok:boolean;message:string}>(`/api/scenes/${encodeURIComponent(id)}`,{method:'DELETE'}),
  validateScene:(id:string)=>request<{scene:SceneItem;validation:ValidationResult}>(`/api/scenes/${encodeURIComponent(id)}/validate`,{method:'POST'}),
  copyScene:(id:string)=>request<SceneItem>(`/api/scenes/${encodeURIComponent(id)}/copy`,{method:'POST'}),
  publishScene:(id:string,payload:{reason:string;versionNote:string})=>request<SceneItem>(`/api/scenes/${encodeURIComponent(id)}/publish`,{method:'POST',body:JSON.stringify(payload)}),
  stopScene:(id:string,reason:string)=>request<SceneItem>(`/api/scenes/${encodeURIComponent(id)}/stop`,{method:'POST',body:JSON.stringify({reason})}),
  references:(id:string)=>request<SceneReferences>(`/api/scenes/${encodeURIComponent(id)}/references`),
  listRules:(keyword='')=>request<RuleItem[]>(`/api/rules${keyword?`?keyword=${encodeURIComponent(keyword)}`:''}`),
  getRule:(id:string)=>request<RuleItem>(`/api/rules/${encodeURIComponent(id)}`),
  createRule:(payload:{name:string;code?:string;type?:string;level?:string;domain?:string;objectCode?:string;objectName?:string;eventCode?:string;eventName?:string;ontologyId?:string;graphVersion?:string})=>request<RuleItem>('/api/rules',{method:'POST',body:JSON.stringify(payload)}),
  createRuleForScene:(sceneId:string,payload:{name:string;code?:string;type?:string;level?:string})=>request<RuleItem>(`/api/scenes/${encodeURIComponent(sceneId)}/rules`,{method:'POST',body:JSON.stringify(payload)}),
  updateRule:(id:string,payload:Omit<Partial<RuleItem>,'level'>&{level?:string;lockVersion:number})=>request<RuleItem>(`/api/rules/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(payload)}),
  deleteRule:(id:string)=>request<{ok:boolean}>(`/api/rules/${encodeURIComponent(id)}`,{method:'DELETE'}),
  unbindRule:(sceneId:string,ruleVersionId:string)=>request<SceneItem>(`/api/scenes/${encodeURIComponent(sceneId)}/rules/${encodeURIComponent(ruleVersionId)}`,{method:'DELETE'}),
  validateRule:(id:string)=>request<ValidationResult>(`/api/rules/${encodeURIComponent(id)}/validate`,{method:'POST'}),
  createTrial:(sceneId:string,payload:{ruleVersionId?:string;graphVersion?:string;sampleDays:number;organizationScope:string;maxSamples:number;timeoutSeconds:number})=>request<TrialTask>(`/api/scenes/${encodeURIComponent(sceneId)}/trials`,{method:'POST',body:JSON.stringify(payload)}),
  getTrial:(id:string)=>request<TrialTask>(`/api/trials/${encodeURIComponent(id)}`),
}
