import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { skillAssetApi } from '../skillAssetApi'
import type { SkillItem } from '../sceneRuleTypes'
import type { RiskLevel } from '../types'
import { useAppStore } from '../store'
import { Button, EmptyState, Field, FilterGrid, Icon, PageHeader, Panel, RiskTag, StatusTag } from '../ui'

const domains=['采购','财务','工程','投资','合同','通用']
const levels:RiskLevel[]=['重大','高','中','低']
const messageOf=(error:unknown)=>error instanceof Error?error.message:'操作失败，请稍后重试'
const dateText=(value:unknown)=>value?new Date(String(value)).toLocaleString('zh-CN',{hour12:false}):'—'
const routeParams=()=>new URLSearchParams(window.location.hash.split('?')[1]||window.location.search)

export function SkillAssetManagementPage(){
  const navigate=useNavigate()
  const setToast=useAppStore((state)=>state.setToast)
  const [keyword,setKeyword]=useState('')
  const [rows,setRows]=useState<SkillItem[]>([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const load=async(nextKeyword=keyword)=>{setLoading(true);setError('');try{setRows(await skillAssetApi.list(nextKeyword))}catch(err){setError(messageOf(err))}finally{setLoading(false)}}
  useEffect(()=>{void load('')},[])
  const remove=async(skill:SkillItem)=>{
    if((skill.bindingCount||0)>0){setToast('该Skill仍被风险场景引用，请先解除关联');return}
    if(!window.confirm(`确认删除Skill草稿“${skill.name}”？`))return
    try{await skillAssetApi.remove(skill.versionId);setToast('Skill草稿已删除');await load()}catch(err){setToast(messageOf(err))}
  }
  return <>
    <PageHeader eyebrow="能力中心 / 规则管理 / Skill管理" title="Skill管理" description="填写基本信息和审查需求，由系统生成可编辑的审查内容、审查要求和输出结果。" actions={<><Button icon="refresh" onClick={()=>void load()}>刷新</Button><Button variant="primary" icon="plus" onClick={()=>navigate('/skills/new')}>新增Skill</Button></>}/>
    <FilterGrid onReset={()=>{setKeyword('');void load('')}} onSearch={()=>void load()}><Field label="关键词"><input value={keyword} onChange={(event)=>setKeyword(event.target.value)} placeholder="Skill名称、编码或领域"/></Field></FilterGrid>
    <Panel title="Skill资产列表" subtitle="Skill由审查需求生成，可被多个风险场景引用">
      {loading?<div className="loading-state"><i/><span>正在加载Skill库…</span></div>:error?<div className="error-state"><Icon name="warning"/><div><strong>Skill加载失败</strong><span>{error}</span></div><Button onClick={()=>void load()}>重试</Button></div>:rows.length===0?<EmptyState title="暂无Skill资产" description="点击“新增Skill”，填写审查需求并生成第一项智能审查能力。"/>:<div className="table-container"><table><thead><tr><th>Skill名称 / 编码</th><th>能力范围</th><th>风险等级</th><th>审查需求</th><th>输出结果</th><th>场景引用</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead><tbody>{rows.map((skill)=>{const readonly=['已发布','已停用'].includes(skill.status);const canDelete=!readonly&&(skill.bindingCount||0)===0;const deleteReason=readonly?'已发布或已停用Skill不可删除':(skill.bindingCount||0)>0?`已被 ${skill.bindingCount} 个场景版本引用，请先解除关联`:'删除Skill';return <tr key={skill.versionId}><td><strong>{skill.name}</strong><small className="cell-sub">{skill.code} · {skill.version}</small></td><td>{skill.type||'智能审查'}<small className="cell-sub">{skill.domain||'通用'}领域</small></td><td><RiskTag level={skill.level}/></td><td><span className="table-text-ellipsis">{skill.reviewDemand||'—'}</span></td><td><span className="table-text-ellipsis">{skill.expectedOutput||'—'}</span></td><td><strong>{skill.bindingCount||0} 个场景版本</strong><small className="cell-sub">{skill.sceneNames?.join('、')||'尚未被场景引用'}</small></td><td><StatusTag>{skill.status}</StatusTag></td><td>{dateText(skill.updatedAt)}</td><td><div className="row-actions"><button onClick={()=>navigate('/skills/'+skill.versionId)}>{readonly?'查看':'编辑'}</button><span className="disabled-action-tip" title={deleteReason}><button className="danger-link" disabled={!canDelete} aria-label={`删除 ${skill.name}`} onClick={()=>void remove(skill)}>删除</button></span></div></td></tr>})}</tbody></table></div>}
    </Panel>
  </>
}

type SkillStep='basic'|'generate'
interface SkillDraft{
  name:string;code:string;domain:string;level:RiskLevel;type:string;
  reviewDemand:string;reviewContent:string;reviewRequirement:string;expectedOutput:string;generatedAt:string
}
const emptyDraft=():SkillDraft=>({name:'',code:'',domain:'采购',level:'高',type:'',reviewDemand:'',reviewContent:'',reviewRequirement:'',expectedOutput:'',generatedAt:''})
const skillToDraft=(skill:SkillItem):SkillDraft=>({name:skill.name,code:skill.code,domain:skill.domain||'采购',level:skill.level,type:skill.type||'',reviewDemand:skill.reviewDemand||'',reviewContent:skill.reviewContent||skill.description||'',reviewRequirement:skill.reviewRequirement||skill.instruction||'',expectedOutput:skill.expectedOutput||skill.outputs.map((item)=>item.name).join('、'),generatedAt:skill.generatedAt||''})

export function SkillAssetEditorPage(){
  const {id=''}=useParams()
  const navigate=useNavigate()
  const setToast=useAppStore((state)=>state.setToast)
  const isNew=id==='new'
  const sceneId=routeParams().get('sceneId')||''
  const returnPath=sceneId?`/scenes/${encodeURIComponent(sceneId)}?tab=skills`:'/skills'
  const [skill,setSkill]=useState<SkillItem|null>(null)
  const [draft,setDraft]=useState<SkillDraft>(emptyDraft)
  const [loading,setLoading]=useState(!isNew)
  const [error,setError]=useState('')
  const [dirty,setDirty]=useState(false)
  const [step,setStep]=useState<SkillStep>('basic')
  const [generating,setGenerating]=useState(false)
  const [finishing,setFinishing]=useState(false)
  const [generatedKey,setGeneratedKey]=useState('')
  const readonly=!!skill&&['已发布','已停用'].includes(skill.status)
  useEffect(()=>{
    if(isNew){setSkill(null);setDraft(emptyDraft());setGeneratedKey('');setLoading(false);return}
    setLoading(true);setError('')
    void skillAssetApi.get(id).then((current)=>{const next=skillToDraft(current);setSkill(current);setDraft(next);setGeneratedKey(`${next.domain}::${next.reviewDemand}`);setDirty(false)}).catch((err)=>setError(messageOf(err))).finally(()=>setLoading(false))
  },[id,isNew])
  useEffect(()=>{const handler=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue=''}};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler)},[dirty])
  const patch=(next:Partial<SkillDraft>)=>{setDraft((current)=>({...current,...next}));setDirty(true)}
  const cancel=()=>{if(dirty&&!window.confirm('当前内容尚未完成，确认放弃并返回？'))return;navigate(returnPath)}
  const basicDone=Boolean(draft.name.trim()&&draft.domain&&draft.level&&(!draft.code||/^[A-Z0-9_-]{3,64}$/.test(draft.code)))
  const generatedDone=Boolean(draft.reviewContent.trim()&&draft.reviewRequirement.trim()&&draft.expectedOutput.trim())
  const currentGenerationKey=`${draft.domain}::${draft.reviewDemand.trim()}`
  const generationStale=generatedDone&&generatedKey!==currentGenerationKey
  const generateDone=Boolean(draft.reviewDemand.trim()&&generatedDone&&!generationStale)
  const steps:Array<{key:SkillStep;label:string;description:string;done:boolean}>=[
    {key:'basic',label:'基本信息',description:'名称、编码、风险等级与监管领域',done:basicDone},
    {key:'generate',label:'需求与生成',description:'填写审查需求并生成Skill',done:generateDone},
  ]
  const switchStep=(target:SkillStep)=>{if(target==='generate'&&!basicDone){setToast('请先填写完整的Skill基本信息');return}setStep(target)}
  const goNext=()=>{if(!draft.name.trim()){setToast('请填写Skill名称');return}if(draft.code&&!/^[A-Z0-9_-]{3,64}$/.test(draft.code)){setToast('Skill编码只能包含大写字母、数字、下划线和中划线');return}if(!draft.domain||!draft.level){setToast('请选择风险等级和监管领域');return}setStep('generate')}
  const generate=async()=>{
    if(!draft.reviewDemand.trim()){setToast('请先填写审查需求');return}
    if(generatedDone&&!window.confirm('重新生成将覆盖当前审查内容、审查要求和输出结果，是否继续？'))return
    setGenerating(true)
    try{
      const result=await skillAssetApi.generate({name:draft.name,domain:draft.domain,level:draft.level,reviewDemand:draft.reviewDemand})
      setDraft((current)=>({...current,...result}));setGeneratedKey(currentGenerationKey);setDirty(true);setToast(generatedDone?'Skill已重新生成':'Skill生成完成，可继续修改生成结果')
    }catch(err){setToast(messageOf(err))}finally{setGenerating(false)}
  }
  const complete=async()=>{
    if(!draft.reviewDemand.trim()){setToast('请填写审查需求');return}
    if(!generatedDone){setToast('请先生成审查内容、审查要求和输出结果');return}
    if(generationStale){setToast('审查需求或监管领域已经修改，请重新生成Skill');return}
    setFinishing(true)
    try{
      if(isNew){
        const created=await skillAssetApi.create({...draft,description:draft.reviewContent,instruction:draft.reviewRequirement})
        if(sceneId)await skillAssetApi.select(sceneId,[created.versionId])
        setDirty(false);setToast(sceneId?'Skill已生成并关联当前风险场景':'Skill条目已生成')
      }else if(skill){
        const saved=await skillAssetApi.update(skill.versionId,{...draft,description:draft.reviewContent,instruction:draft.reviewRequirement,lockVersion:skill.lockVersion})
        const result=await skillAssetApi.validate(saved.versionId)
        if(result.blockers.length){setToast(result.blockers[0].message);return}
        setSkill(saved);setDirty(false);setToast('Skill修改已完成')
      }
      navigate(returnPath)
    }catch(err){setToast(messageOf(err))}finally{setFinishing(false)}
  }
  if(loading)return <div className="loading-state page-loading"><i/><span>正在加载Skill…</span></div>
  if(error)return <div className="error-state page-error"><Icon name="warning"/><div><strong>Skill加载失败</strong><span>{error}</span></div><Button onClick={()=>navigate('/skills')}>返回Skill管理</Button></div>
  return <>
    <div className="simple-rule-header"><div><button className="back-button" onClick={cancel}>‹ {sceneId?'返回风险场景':'返回Skill管理'}</button><p className="eyebrow">智能Skill / {isNew?'新建':`${draft.code} / ${skill?.version||''}`}</p><h1>{isNew?'新建智能Skill':draft.name}</h1><div className="editor-meta"><StatusTag>{isNew?'待生成':skill?.status||'草稿'}</StatusTag><span>{draft.type||'能力类型由系统生成'}</span>{!isNew&&<span>被 {skill?.bindingCount||0} 个场景版本引用</span>}<span>{dirty?'存在未完成修改':isNew?'完成后生成Skill条目':'最近保存：'+dateText(skill?.updatedAt)}</span></div></div></div>
    <nav className="rule-editor-tabs skill-two-step-tabs" aria-label="Skill创建步骤">{steps.map((item,index)=><button type="button" className={[step===item.key?'active':'',item.done?'done':''].filter(Boolean).join(' ')} onClick={()=>switchStep(item.key)} key={item.key}><i>{item.done?'✓':index+1}</i><span><strong>{item.label}</strong><small>{item.description}</small></span></button>)}</nav>
    <main className="rule-step-content">
      {step==='basic'&&<Panel title="1. 基本信息" subtitle="填写Skill资产的基础信息，能力类型将根据审查需求自动生成"><div className="form-section two-column">
        <Field label="Skill名称 *"><input value={draft.name} disabled={readonly} onChange={(event)=>patch({name:event.target.value})} placeholder="例如：投标文件异常相似审查"/></Field>
        <Field label="Skill编码"><input value={draft.code} disabled={readonly||!isNew} onChange={(event)=>patch({code:event.target.value.toUpperCase()})} placeholder="留空自动生成"/></Field>
        <Field label="风险等级 *"><select value={draft.level} disabled={readonly} onChange={(event)=>patch({level:event.target.value as RiskLevel})}>{levels.map((item)=><option key={item}>{item}</option>)}</select></Field>
        <Field label="监管领域 *"><select value={draft.domain} disabled={readonly} onChange={(event)=>patch({domain:event.target.value})}>{domains.map((item)=><option key={item}>{item}</option>)}</select></Field>
      </div><div className="rule-basic-summary"><div><span>当前状态</span><strong>{isNew?'待生成':skill?.status}</strong></div><div><span>引用场景</span><strong>{skill?.bindingCount||0} 个版本</strong></div><div><span>生成方式</span><strong>根据审查需求自动生成</strong></div></div></Panel>}
      {step==='generate'&&<Panel title="2. 需求与生成" subtitle="填写一段审查需求，系统生成可编辑的审查内容、审查要求和输出结果">
        <section className="rule-editor-section skill-demand-section"><header><div><strong>审查需求</strong><span>说明希望Skill审查什么问题，以及需要达到什么业务目标</span></div>{!readonly&&<Button variant="primary" icon="agent" disabled={generating} onClick={()=>void generate()}>{generating?'正在生成…':generatedDone?'重新生成Skill':'生成Skill'}</Button>}</header><Field label="审查需求 *" wide><textarea value={draft.reviewDemand} disabled={readonly} onChange={(event)=>patch({reviewDemand:event.target.value})} placeholder="例如：对同一项目下不同供应商的投标文件进行对比，识别异常相似内容，并给出原文及页码。"/></Field></section>
        {generationStale&&<div className="alert-box danger"><Icon name="warning"/><span>审查需求或监管领域已经修改，请重新生成Skill后再完成创建。</span></div>}
        {generatedDone?<section className="rule-editor-section skill-generated-section"><header><div><strong>生成结果</strong><span>以下内容可以直接修改；重新生成时会覆盖这些修改</span></div><em className={generationStale?'pending':'complete'}>{generationStale?'待重新生成':'已生成'}</em></header><div className="form-stack"><Field label="审查内容 *" wide><textarea value={draft.reviewContent} disabled={readonly} onChange={(event)=>patch({reviewContent:event.target.value})} placeholder="说明Skill实际审查的数据、材料和附件"/></Field><Field label="审查要求 *" wide><textarea value={draft.reviewRequirement} disabled={readonly} onChange={(event)=>patch({reviewRequirement:event.target.value})} placeholder="说明Skill如何判断以及需要遵循的审查原则"/></Field><Field label="输出结果 *" wide><textarea value={draft.expectedOutput} disabled={readonly} onChange={(event)=>patch({expectedOutput:event.target.value})} placeholder="说明Skill需要输出的结论、评分和实际证据"/></Field></div><div className="next-action-card"><Icon name="check"/><div><strong>{draft.type||'智能审查Skill'}</strong><span>系统将在运行时自动获取场景业务上下文和关联附件，不需要配置字段或附件映射。</span></div></div></section>:<div className="skill-generation-empty"><EmptyState title="尚未生成Skill" description="填写审查需求后点击“生成Skill”，系统将生成三个可编辑结果。"/></div>}
      </Panel>}
    </main>
    {!readonly&&<footer className="editor-action-bar"><div><span className={dirty?'dirty-dot':''}/><strong>{dirty?'内容尚未完成':isNew?'等待填写':'Skill草稿已保存'}</strong><small>{isNew?'完成后才会生成Skill条目':'完成修改后更新当前Skill草稿'}</small></div><div><Button onClick={cancel}>取消</Button>{step==='generate'&&<Button onClick={()=>setStep('basic')}>上一步</Button>}{step==='basic'?<Button variant="primary" onClick={goNext}>下一步</Button>:<Button variant="primary" disabled={finishing} onClick={()=>void complete()}>{finishing?'正在完成…':isNew?'完成创建':'完成修改'}</Button>}</div></footer>}
  </>
}