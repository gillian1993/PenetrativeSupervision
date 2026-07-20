import { sceneRuleApi } from './sceneRuleApi'
import type { RuleItem, SceneItem } from './sceneRuleTypes'

async function request<T>(url:string,options?:RequestInit):Promise<T>{
  const response=await fetch(url,{headers:{'Content-Type':'application/json',...(options?.headers||{})},...options})
  const data=await response.json().catch(()=>({message:'服务返回格式错误'}))
  if(!response.ok)throw new Error(data.message||`请求失败：${response.status}`)
  return data as T
}

export const ruleClosureApi={
  listRules:sceneRuleApi.listRules,
  listScenes:sceneRuleApi.listScenes,
  createRule:sceneRuleApi.createRule,
  deleteRule:sceneRuleApi.deleteRule,
  listLibrary:(sceneId:string)=>request<RuleItem[]>(`/api/rule-library?sceneId=${encodeURIComponent(sceneId)}`),
  selectRules:(sceneId:string,ruleVersionIds:string[])=>request<SceneItem>(`/api/scenes/${encodeURIComponent(sceneId)}/rules/select`,{method:'POST',body:JSON.stringify({ruleVersionIds})}),
  unbindRule:sceneRuleApi.unbindRule,
}
