import { handleEffectSampleApi } from './effectSampleApi.js'
import { handleRuleAssetApi } from './ruleAssetApi.js'
import { handleSkillAssetApi } from './skillAssetApi.js'
import { handleSimpleRuleClosureApi } from './simpleRuleClosureApi.js'
import { handleSceneCrudApi } from './sceneCrudApi.js'
import { handleRuleWorkflowApi } from './ruleWorkflowApi.js'

export async function handleSceneRuleApi(req,res,url,context){
  if(await handleRuleAssetApi(req,res,url,context))return true
  if(await handleSkillAssetApi(req,res,url,context))return true
  if(await handleEffectSampleApi(req,res,url,context))return true
  if(await handleSimpleRuleClosureApi(req,res,url,context))return true
  if(await handleSceneCrudApi(req,res,url,context))return true
  return await handleRuleWorkflowApi(req,res,url,context)
}
