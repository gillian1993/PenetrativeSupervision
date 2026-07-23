import type { SceneItem, SkillItem, ValidationResult } from './sceneRuleTypes'

async function request<T>(url:string,options?:RequestInit):Promise<T>{
  const response=await fetch(url,{headers:{'Content-Type':'application/json',...(options?.headers||{})},...options})
  const data=await response.json().catch(()=>({message:'服务返回格式错误'}))
  if(!response.ok)throw new Error(data.message||`请求失败：${response.status}`)
  return data as T
}

export interface SkillGenerationRequest{name:string;domain:string;level:string;reviewDemand:string}
export type SkillGenerationResult=Pick<SkillItem,'type'|'description'|'reviewDemand'|'reviewContent'|'reviewRequirement'|'expectedOutput'|'instruction'|'threshold'|'inputs'|'outputs'|'evidenceRequirements'|'policies'|'failureStrategy'|'generatedAt'>

export const skillAssetApi={
  list:(keyword='')=>request<SkillItem[]>(`/api/skills${keyword?`?keyword=${encodeURIComponent(keyword)}`:''}`),
  get:(id:string)=>request<SkillItem>(`/api/skills/${encodeURIComponent(id)}`),
  generate:(payload:SkillGenerationRequest)=>request<SkillGenerationResult>('/api/skills/generate',{method:'POST',body:JSON.stringify(payload)}),
  create:(payload:Partial<SkillItem>&{name:string})=>request<SkillItem>('/api/skills',{method:'POST',body:JSON.stringify(payload)}),
  update:(id:string,payload:Partial<SkillItem>&{lockVersion:number})=>request<SkillItem>(`/api/skills/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(payload)}),
  remove:(id:string)=>request<{ok:boolean;message:string}>(`/api/skills/${encodeURIComponent(id)}`,{method:'DELETE'}),
  validate:(id:string)=>request<ValidationResult>(`/api/skills/${encodeURIComponent(id)}/validate`,{method:'POST'}),
  library:(sceneId:string)=>request<SkillItem[]>(`/api/skill-library?sceneId=${encodeURIComponent(sceneId)}`),
  select:(sceneId:string,skillVersionIds:string[])=>request<SceneItem>(`/api/scenes/${encodeURIComponent(sceneId)}/skills/select`,{method:'POST',body:JSON.stringify({skillVersionIds})}),
  unbind:(sceneId:string,skillVersionId:string)=>request<SceneItem>(`/api/scenes/${encodeURIComponent(sceneId)}/skills/${encodeURIComponent(skillVersionId)}`,{method:'DELETE'}),
}
