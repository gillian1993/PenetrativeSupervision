import { useEffect, useRef } from 'react'
import LegacyApp from './App'
import { useAppStore } from './store'
import './ruleClosure.css'
import './simpleRuleFlow.css'

export default function AppRoot(){
  return <><DatabaseWorkflowBridge/><EffectSampleBridge/><LegacyApp/></>
}


function DatabaseWorkflowBridge(){
  const warningSource=useAppStore((state)=>state.warningSource)
  const loadWarningsFromDatabase=useAppStore((state)=>state.loadWarningsFromDatabase)
  const refreshed=useRef(false)
  useEffect(()=>{if(warningSource!=='database'||refreshed.current)return;refreshed.current=true;void loadWarningsFromDatabase()},[warningSource,loadWarningsFromDatabase])
  return null
}

function EffectSampleBridge(){
  const audits=useAppStore((state)=>state.audits);const lastSeen=useRef(audits[0]?.id)
  useEffect(()=>{const latest=audits[0];if(!latest||latest.id===lastSeen.current)return;lastSeen.current=latest.id;if(!['解除预警','升级风险事件','复核关闭','不成立关闭'].some((action)=>latest.action.includes(action)))return;void fetch('/api/effect-samples',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({objectId:latest.objectId,objectType:latest.objectType,action:latest.action,conclusion:latest.action,summary:latest.summary,operator:latest.operator})})},[audits])
  return null
}