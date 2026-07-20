import { useEffect, useRef } from 'react'
import LegacyApp from './App'
import { useAppStore } from './store'
import './ruleClosure.css'
import './simpleRuleFlow.css'

export default function AppRoot(){
  return <><EffectSampleBridge/><LegacyApp/></>
}

function EffectSampleBridge(){
  const audits=useAppStore((state)=>state.audits);const lastSeen=useRef(audits[0]?.id)
  useEffect(()=>{const latest=audits[0];if(!latest||latest.id===lastSeen.current)return;lastSeen.current=latest.id;if(!['解除预警','升级风险事件','复核关闭','不成立关闭'].some((action)=>latest.action.includes(action)))return;void fetch('/api/effect-samples',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({objectId:latest.objectId,objectType:latest.objectType,action:latest.action,conclusion:latest.action,summary:latest.summary,operator:latest.operator})})},[audits])
  return null
}