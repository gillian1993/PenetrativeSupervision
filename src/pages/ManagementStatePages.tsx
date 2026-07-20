import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppStore } from '../store'
import type { AuditItem, DataSourceItem, GraphVersion, OntologyItem, RoleItem, SceneItem, UserItem } from '../types'
import { dataGraphApi, type GovernanceTaskItem, type GraphIssueItem, type MappingItem, type SourceMetadataItem, type SyncRecordItem } from '../dataGraphApi'
import { Button, Drawer, EmptyState, Field, FilterGrid, Icon, KeyValue, Modal, PageHeader, Panel, RiskTag, StatusTag, Tabs } from '../ui'

const sceneInitial = {
  name: '',
  domain: '采购',
  object: '供应商',
  event: '中标确认',
  level: '高' as SceneItem['level'],
}

export function SceneListPage() {
  const navigate = useNavigate()
  const scenes = useAppStore((state) => state.scenes)
  const createScene = useAppStore((state) => state.createScene)
  const publishScene = useAppStore((state) => state.publishScene)
  const stopScene = useAppStore((state) => state.stopScene)
  const setToast = useAppStore((state) => state.setToast)
  const [draft, setDraft] = useState({ keyword: '', status: '全部', domain: '全部' })
  const [filters, setFilters] = useState(draft)
  const [modal, setModal] = useState<'new' | 'publish' | 'stop' | null>(null)
  const [target, setTarget] = useState<SceneItem | null>(null)
  const [form, setForm] = useState(sceneInitial)
  const [stopReason, setStopReason] = useState('')

  const rows = useMemo(() => scenes.filter((item) => {
    if (filters.keyword && !`${item.name}${item.id}${item.object}${item.event}`.toLowerCase().includes(filters.keyword.toLowerCase())) return false
    if (filters.status !== '全部' && item.status !== filters.status) return false
    if (filters.domain !== '全部' && item.domain !== filters.domain) return false
    return true
  }), [scenes, filters])

  const create = () => {
    if (!form.name.trim()) { setToast('请输入场景名称'); return }
    const id = createScene(form)
    setModal(null)
    setForm(sceneInitial)
    setToast(`场景草稿 ${id} 已创建`)
    navigate(`/scenes/${id}`)
  }

  const confirmStatus = () => {
    if (!target || !modal) return
    const result = modal === 'stop' ? stopScene(target.id, stopReason) : publishScene(target.id)
    setToast(result.message)
    if (result.ok) { setModal(null); setTarget(null); setStopReason('') }
  }

  return <>
    <PageHeader eyebrow="场景与规则 / 风险场景" title="风险场景" description="管理目标事件、适用范围、等级、证据、制度依据和核查模板，发布后形成不可变版本。" actions={<><Button icon="refresh" onClick={() => setToast('场景列表已刷新')}>刷新</Button><Button variant="primary" icon="plus" onClick={() => setModal('new')}>新建场景</Button></>}/>
    <FilterGrid onReset={() => { const value = { keyword: '', status: '全部', domain: '全部' }; setDraft(value); setFilters(value) }} onSearch={() => { setFilters(draft); setToast(`已查询到 ${rows.length} 个场景`) }}>
      <Field label="关键词"><input value={draft.keyword} onChange={(event) => setDraft({ ...draft, keyword: event.target.value })} placeholder="场景名称、编码、对象或事件"/></Field>
      <Field label="监管领域"><select value={draft.domain} onChange={(event) => setDraft({ ...draft, domain: event.target.value })}><option>全部</option><option>采购</option><option>合同</option><option>财务</option><option>投资</option></select></Field>
      <Field label="状态"><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option>全部</option><option>草稿</option><option>待试跑</option><option>待发布</option><option>已发布</option><option>已停用</option></select></Field>
    </FilterGrid>
    <Panel title="场景列表" subtitle={`共 ${rows.length} 个场景，已发布版本不可直接编辑`}>
      {rows.length === 0 ? <EmptyState title="没有符合条件的场景" description="请调整筛选条件后重新查询。"/> : <div className="table-container"><table><thead><tr><th>场景名称 / 编码</th><th>监管领域</th><th>主对象 / 目标事件</th><th>默认等级</th><th>规则</th><th>版本</th><th>状态</th><th>更新人 / 时间</th><th>操作</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td><button className="table-link title-cell" onClick={() => navigate(`/scenes/${item.id}`)}><strong>{item.name}</strong><span>{item.id}</span></button></td><td>{item.domain}</td><td>{item.object}<small className="cell-sub">{item.event}</small></td><td><RiskTag level={item.level}/></td><td><strong>{item.rules}</strong> 条</td><td>{item.version}</td><td><StatusTag>{item.status}</StatusTag></td><td>{item.updatedBy}<small className="cell-sub">{item.updatedAt}</small></td><td><div className="row-actions vertical"><button onClick={() => navigate(`/scenes/${item.id}`)}>{item.status === '已发布' ? '查看' : '编辑'}</button>{item.status === '已发布' ? <button onClick={() => { setTarget(item); setModal('stop') }}>停用</button> : <button onClick={() => { setTarget(item); setModal('publish') }}>发布</button>}</div></td></tr>)}</tbody></table></div>}
    </Panel>
    <Modal open={modal === 'new'} title="新建风险场景" description="创建后进入草稿编辑页。" confirmText="创建并编辑" onClose={() => setModal(null)} onConfirm={create}><div className="form-stack"><Field label="场景名称 *"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="请输入业务化场景名称"/></Field><Field label="监管领域"><select value={form.domain} onChange={(event) => setForm({ ...form, domain: event.target.value })}><option>采购</option><option>合同</option><option>财务</option><option>投资</option></select></Field><Field label="主对象"><select value={form.object} onChange={(event) => setForm({ ...form, object: event.target.value })}><option>供应商</option><option>合同</option><option>付款单</option><option>投资项目</option></select></Field><Field label="目标事件"><input value={form.event} onChange={(event) => setForm({ ...form, event: event.target.value })}/></Field><Field label="默认等级"><select value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value as SceneItem['level'] })}><option>重大</option><option>高</option><option>中</option><option>低</option></select></Field></div></Modal>
    <Modal open={modal === 'publish' || modal === 'stop'} title={modal === 'stop' ? '停用场景版本' : '发布场景版本'} description={target ? `${target.name} ${target.version}` : ''} danger={modal === 'stop'} confirmText={modal === 'stop' ? '确认停用' : '确认发布'} onClose={() => setModal(null)} onConfirm={confirmStatus}><div className="form-stack"><div className={`alert-box ${modal === 'stop' ? 'danger' : ''}`}><Icon name="warning"/><span>{modal === 'stop' ? '停用只影响后续运行，历史预警继续引用原版本。' : '将校验至少一条启用规则，并记录发布审计。'}</span></div>{modal === 'stop' && <Field label="停用原因 *"><textarea value={stopReason} onChange={(event) => setStopReason(event.target.value)} placeholder="说明停用原因和影响范围"/></Field>}</div></Modal>
  </>
}

export function SceneEditorPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const scenes = useAppStore((state) => state.scenes)
  const updateScene = useAppStore((state) => state.updateScene)
  const copyScene = useAppStore((state) => state.copyScene)
  const publishScene = useAppStore((state) => state.publishScene)
  const setToast = useAppStore((state) => state.setToast)
  const scene = scenes.find((item) => item.id === id)
  const [tab, setTab] = useState('basic')
  const [publish, setPublish] = useState(false)
  const [draft, setDraft] = useState(sceneInitial)

  useEffect(() => {
    if (scene) setDraft({ name: scene.name, domain: scene.domain, object: scene.object, event: scene.event, level: scene.level })
  }, [scene])

  if (!scene) return <EmptyState title="场景不存在" description="该场景可能已被删除或当前账号无权访问。"/>
  const readonly = scene.status === '已发布'
  const save = () => { const result = updateScene(scene.id, draft); setToast(result.message) }
  const copy = () => { const result = copyScene(scene.id); setToast(result.message); if (result.ok && result.objectId) navigate(`/scenes/${result.objectId}`) }
  const confirmPublish = () => { const result = publishScene(scene.id); setToast(result.message); if (result.ok) setPublish(false) }

  return <>
    <div className="editor-header"><div><button className="back-button" onClick={() => navigate('/scenes')}>‹ 返回场景列表</button><p className="eyebrow">风险场景 / {scene.id}</p><h1>{scene.name}</h1><div className="editor-meta"><StatusTag>{scene.status}</StatusTag><span>版本 {scene.version}</span><span>{scene.domain}领域</span><span>最近保存：{scene.updatedAt}</span></div></div><div className="page-actions">{readonly ? <Button variant="primary" onClick={copy}>复制新版本</Button> : <><Button onClick={save}>保存草稿</Button><Button onClick={() => setToast(scene.rules ? '校验通过：0个阻断项，2个提示项' : '校验失败：至少配置一条启用规则')}>校验</Button><Button variant="primary" onClick={() => setPublish(true)}>发布</Button></>}</div></div>
    <Panel className="editor-panel"><Tabs value={tab} onChange={setTab} items={[{ key: 'basic', label: '基本信息' }, { key: 'rules', label: '规则配置', count: scene.rules }, { key: 'evidence', label: '证据与制度' }, { key: 'scope', label: '适用范围' }, { key: 'versions', label: '版本记录' }]}/>
      {tab === 'basic' && <div className="form-section two-column"><Field label="场景名称"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} disabled={readonly}/></Field><Field label="场景编码"><input value={scene.id} disabled/></Field><Field label="监管领域"><select value={draft.domain} onChange={(event) => setDraft({ ...draft, domain: event.target.value })} disabled={readonly}><option>采购</option><option>合同</option><option>财务</option><option>投资</option></select></Field><Field label="默认风险等级"><select value={draft.level} onChange={(event) => setDraft({ ...draft, level: event.target.value as SceneItem['level'] })} disabled={readonly}><option>重大</option><option>高</option><option>中</option><option>低</option></select></Field><Field label="主对象"><select value={draft.object} onChange={(event) => setDraft({ ...draft, object: event.target.value })} disabled={readonly}><option>供应商</option><option>合同</option><option>付款单</option><option>投资项目</option></select></Field><Field label="目标事件"><input value={draft.event} onChange={(event) => setDraft({ ...draft, event: event.target.value })} disabled={readonly}/></Field></div>}
      {tab === 'rules' && <div><div className="section-toolbar"><div><strong>{scene.rules} 条关联规则</strong><span>发布前至少需要一条启用规则</span></div><Button variant="primary" icon="plus" disabled={readonly} onClick={() => navigate('/rules/RULE-NEW')}>新建规则</Button></div><div className="table-container"><table><thead><tr><th>规则名称 / 编码</th><th>规则类型</th><th>等级</th><th>状态</th><th>操作</th></tr></thead><tbody>{scene.rules > 0 ? [['RULE-001','供应商与评审人员共同信息','关系路径','重大'],['RULE-002','实际控制人任职关联','关系路径','高']].slice(0, Math.min(scene.rules, 2)).map((row) => <tr key={row[0]}><td><strong>{row[1]}</strong><small className="cell-sub">{row[0]}</small></td><td>{row[2]}</td><td><RiskTag level={row[3] as SceneItem['level']}/></td><td><StatusTag>启用</StatusTag></td><td><button className="table-action" onClick={() => navigate(`/rules/${row[0]}`)}>{readonly ? '查看' : '编辑'}</button></td></tr>) : <tr><td colSpan={5}><EmptyState title="尚未配置规则" description="新增并启用至少一条规则后才可发布。"/></td></tr>}</tbody></table></div></div>}
      {tab === 'evidence' && <div className="detail-grid"><Panel title="必备证据"><div className="check-grid vertical">{['业务来源记录','主体信息','审批记录','联系方式来源','规则运行明细'].map((item) => <label key={item}><input type="checkbox" defaultChecked disabled={readonly}/><span>{item}</span></label>)}</div></Panel><Panel title="制度依据"><p className="drawer-note">《采购评审管理办法》v3.2 第十二条：评审人员应主动回避利益关联主体。</p><Button disabled={readonly} onClick={() => setToast('制度条款选择器已打开')}>选择制度条款</Button></Panel></div>}
      {tab === 'scope' && <div className="detail-grid"><Panel title="适用组织"><div className="check-grid vertical">{['中国电子云','集团采购中心','各事业部采购组织'].map((item) => <label key={item}><input type="checkbox" defaultChecked disabled={readonly}/><span>{item}</span></label>)}</div></Panel><Panel title="例外范围"><p className="drawer-note">已批准单一来源采购、集团内部关联交易可进入人工复核。</p></Panel></div>}
      {tab === 'versions' && <VersionTimeline labels={[`${scene.version} · ${scene.status} · ${scene.updatedBy}`, 'v2.2 · 阈值与证据调整', 'v1.0 · 首次发布']}/>} 
    </Panel>
    <Modal open={publish} title="发布风险场景版本" description={`${scene.name} ${scene.version}`} confirmText="确认发布" onClose={() => setPublish(false)} onConfirm={confirmPublish}><PublishChecklist/></Modal>
  </>
}

export function OntologyListPage() {
  const navigate = useNavigate()
  const ontologies = useAppStore((state) => state.ontologies)
  const copyOntology = useAppStore((state) => state.copyOntology)
  const publishOntology = useAppStore((state) => state.publishOntology)
  const setToast = useAppStore((state) => state.setToast)
  const [keyword, setKeyword] = useState('')
  const [target, setTarget] = useState<OntologyItem | null>(null)
  const rows = ontologies.filter((item) => !keyword || `${item.name}${item.id}${item.domain}`.toLowerCase().includes(keyword.toLowerCase()))
  const confirm = () => {
    if (!target) return
    const result = target.status === '已发布' ? copyOntology(target.id) : publishOntology(target.id)
    setToast(result.message)
    setTarget(null)
    if (result.ok && result.objectId) navigate(`/ontology/${result.objectId}`)
  }
  return <>
    <PageHeader eyebrow="本体与图谱 / 本体管理" title="本体管理" description="维护监管基础本体和领域扩展本体，统一类、属性、关系与事件语义。" actions={<><Button icon="refresh" onClick={() => setToast('本体列表已刷新')}>刷新</Button><Button variant="primary" icon="plus" onClick={() => setToast('请从已发布本体复制新版本，以保留语义继承关系')}>新建本体</Button></>}/>
    <FilterGrid onReset={() => setKeyword('')} onSearch={() => setToast(`查询完成，共${rows.length}个本体`)}><Field label="关键词"><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="本体名称、编码或领域"/></Field><Field label="状态"><select><option>全部状态</option><option>草稿</option><option>待校验</option><option>已发布</option></select></Field></FilterGrid>
    <Panel title="本体列表" subtitle="已发布版本只读，变更必须复制新版本"><div className="table-container"><table><thead><tr><th>本体名称 / 编码</th><th>范围 / 领域</th><th>版本</th><th>类 / 属性 / 关系 / 事件</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td><button className="table-link title-cell" onClick={() => navigate(`/ontology/${item.id}`)}><strong>{item.name}</strong><span>{item.id}</span></button></td><td>{item.scope}<small className="cell-sub">{item.domain}</small></td><td>{item.version}</td><td><span className="metrics-inline"><b>{item.classes}</b>类 · <b>{item.properties}</b>属性 · <b>{item.relations}</b>关系 · <b>{item.events}</b>事件</span></td><td><StatusTag>{item.status}</StatusTag></td><td>{item.updatedAt}</td><td><div className="row-actions"><button onClick={() => navigate(`/ontology/${item.id}`)}>{item.status === '已发布' ? '查看' : '编辑'}</button><button onClick={() => setTarget(item)}>{item.status === '已发布' ? '复制版本' : '发布'}</button></div></td></tr>)}</tbody></table></div></Panel>
    <Modal open={!!target} title={target?.status === '已发布' ? '复制本体新版本' : '发布本体版本'} description={target ? `${target.name} ${target.version}` : ''} onClose={() => setTarget(null)} onConfirm={confirm}><PublishChecklist/></Modal>
  </>
}

export function OntologyEditorPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const ontologies = useAppStore((state) => state.ontologies)
  const copyOntology = useAppStore((state) => state.copyOntology)
  const publishOntology = useAppStore((state) => state.publishOntology)
  const setToast = useAppStore((state) => state.setToast)
  const item = ontologies.find((row) => row.id === id)
  const [tab, setTab] = useState('class')
  const [selected, setSelected] = useState('供应商')
  const [drawer, setDrawer] = useState(false)
  if (!item) return <EmptyState title="本体版本不存在" description="请从本体列表选择可访问版本。"/>
  const readonly = item.status === '已发布'
  const copy = () => { const result = copyOntology(item.id); setToast(result.message); if (result.ok && result.objectId) navigate(`/ontology/${result.objectId}`) }
  const publish = () => { const result = publishOntology(item.id); setToast(result.message) }
  return <>
    <div className="editor-header"><div><button className="back-button" onClick={() => navigate('/ontology')}>‹ 返回本体列表</button><p className="eyebrow">本体版本编辑 / {item.id}</p><h1>{item.name}</h1><div className="editor-meta"><StatusTag>{item.status}</StatusTag><span>版本 {item.version}</span><span>{item.scope}</span><span>最近保存：{item.updatedAt}</span></div></div><div className="page-actions">{readonly ? <Button variant="primary" onClick={copy}>复制新版本</Button> : <><Button onClick={() => setToast('本体草稿已保存')}>保存草稿</Button><Button onClick={() => setToast('校验完成：0个阻断项')}>校验</Button><Button variant="primary" onClick={publish}>发布</Button></>}</div></div>
    <section className="ontology-editor-layout"><Panel title="本体类" subtitle={`${item.classes} 个类`} className="class-tree"><input placeholder="搜索名称或编码"/><div className="tree-list">{['组织','人员','主体','供应商','采购项目','合同','审批记录','资金记录','账户','文档/附件','预警','风险事件'].map((name) => <button key={name} className={selected === name ? 'active' : ''} onClick={() => setSelected(name)}><Icon name={name === '人员' ? 'user' : name === '预警' ? 'warning' : 'graph'} size={15}/><span>{name}</span><small>{name === '供应商' ? 'PROC.Supplier' : `BASE.${name}`}</small></button>)}</div><Button icon="plus" onClick={() => setDrawer(true)} disabled={readonly}>新增本体类</Button></Panel><Panel className="ontology-element-panel"><div className="selected-class-header"><div><p className="eyebrow">当前本体类</p><h2>{selected}</h2><span>主识别属性：统一社会信用代码 / 主体编码</span></div><Button icon="edit" onClick={() => setDrawer(true)} disabled={readonly}>编辑类定义</Button></div><Tabs value={tab} onChange={setTab} items={[{ key: 'class', label: '类定义' }, { key: 'property', label: '属性', count: 12 }, { key: 'relation', label: '关系', count: 8 }, { key: 'event', label: '事件', count: 6 }, { key: 'diff', label: '版本差异' }]}/>{tab === 'class' && <KeyValue items={[{ label: '类编码', value: 'PROC.Supplier' }, { label: '中文名称', value: selected }, { label: '别名', value: '供应商、服务商、投标主体' }, { label: '默认敏感等级', value: <StatusTag>内部</StatusTag> }, { label: '主识别属性', value: '统一社会信用代码、供应商编码' }]}/>} {tab === 'property' && <OntologyElements rows={['supplier_code|供应商编码|文本|主标识','credit_code|统一社会信用代码|文本|主标识','supplier_name|供应商名称|文本|必填','contact_phone|联系电话|文本|强敏感']}/>} {tab === 'relation' && <OntologyElements rows={['participate|参与|供应商 → 采购项目|多对多','sign|签订|供应商 → 合同|一对多','controlled_by|受控制于|供应商 → 主体|多对多']}/>} {tab === 'event' && <OntologyElements rows={['supplier_registered|供应商注册|供应商|非目标事件','bid_confirmed|中标确认|采购项目|目标事件','qualification_changed|资质变化|供应商|非目标事件']}/>} {tab === 'diff' && <VersionTimeline labels={['新增：共同联系方式关系','修改：主标识质量要求','修改：联系电话敏感等级']}/>}</Panel></section>
    <Drawer open={drawer} title={`${readonly ? '查看' : '编辑'}本体类：${selected}`} eyebrow="本体元素" onClose={() => setDrawer(false)} footer={<><Button onClick={() => setDrawer(false)}>取消</Button><Button variant="primary" disabled={readonly} onClick={() => { setDrawer(false); setToast('本体类定义已保存') }}>保存</Button></>}><div className="form-stack"><Field label="类编码"><input defaultValue="PROC.Supplier" disabled/></Field><Field label="中文名称"><input defaultValue={selected} disabled={readonly}/></Field><Field label="别名"><input defaultValue="供应商、服务商、投标主体" disabled={readonly}/></Field><Field label="默认敏感等级"><select defaultValue="内部" disabled={readonly}><option>普通</option><option>内部</option><option>敏感</option><option>强敏感</option></select></Field></div></Drawer>
  </>
}

function OntologyElements({ rows }: { rows: string[] }) {
  const setToast = useAppStore((state) => state.setToast)
  return <div className="table-container"><table><thead><tr><th>编码 / 名称</th><th>类型</th><th>约束</th><th>操作</th></tr></thead><tbody>{rows.map((value) => { const row = value.split('|'); return <tr key={row[0]}><td><strong>{row[1]}</strong><small className="cell-sub">{row[0]}</small></td><td>{row[2]}</td><td>{row[3]}</td><td><button className="table-action" onClick={() => setToast(`${row[1]}定义详情已打开`)}>查看</button></td></tr> })}</tbody></table></div>
}

const sourceInitial = { name: '', mode: '数据库视图', range: '', owner: '张海', syncMode: '增量' }

export function DataAccessPage() {
  const setToast = useAppStore((state) => state.setToast)
  const [dataSources, setDataSources] = useState<DataSourceItem[]>([])
  const [metadata, setMetadata] = useState<SourceMetadataItem[]>([])
  const [mappings, setMappings] = useState<MappingItem[]>([])
  const [records, setRecords] = useState<SyncRecordItem[]>([])
  const [tab, setTab] = useState('sources')
  const [selectedId, setSelectedId] = useState('')
  const [drawer, setDrawer] = useState(false)
  const [form, setForm] = useState(sourceInitial)
  const selected = dataSources.find((item) => item.id === selectedId) || dataSources[0]
  const loadSources = async () => { try { const rows = await dataGraphApi.listSources(); setDataSources(rows); if (!selectedId && rows[0]) setSelectedId(rows[0].id) } catch (error) { setToast(error instanceof Error ? error.message : '数据源加载失败') } }
  const loadSelected = async (sourceId = selected?.id) => { if (!sourceId) return; try { const [meta, recordRows] = await Promise.all([dataGraphApi.metadata(sourceId), dataGraphApi.syncRecords()]); setMetadata(meta); setRecords(recordRows); if (['mapping','relation','event'].includes(tab)) setMappings(await dataGraphApi.mappings(sourceId, tab === 'mapping' ? '属性' : tab === 'relation' ? '关系' : '事件')) } catch (error) { setToast(error instanceof Error ? error.message : '数据接入数据加载失败') } }
  useEffect(() => { void loadSources() }, [])
  useEffect(() => { void loadSelected() }, [selectedId, tab])
  const create = async () => {
    if (!form.name.trim() || !form.range.trim()) { setToast('请填写数据源名称和数据范围'); return }
    try { const source = await dataGraphApi.createSource(form); setDataSources((rows) => [source, ...rows]); setSelectedId(source.id); setDrawer(false); setForm(sourceInitial); setToast(`数据源草稿 ${source.id} 已创建`) } catch (error) { setToast(error instanceof Error ? error.message : '数据源创建失败') }
  }
  const test = async (item: DataSourceItem) => { try { const result = await dataGraphApi.testSource(item.id); setToast(result.message); await loadSources() } catch (error) { setToast(error instanceof Error ? error.message : '连接测试失败') } }
  const toggle = async (item: DataSourceItem) => { try { await dataGraphApi.toggleSource(item.id, item.status !== '启用'); setToast(item.status === '启用' ? '数据源已停用' : '数据源已启用'); await loadSources() } catch (error) { setToast(error instanceof Error ? error.message : '状态切换失败') } }
  const parse = async () => { if (!selected) return; try { setMetadata(await dataGraphApi.parseMetadata(selected.id)); setToast('元数据解析完成') } catch (error) { setToast(error instanceof Error ? error.message : '元数据解析失败') } }
  const validate = async () => { if (!selected) return; try { const result = await dataGraphApi.validateMappings(selected.id); setToast(result.message); setMappings(await dataGraphApi.mappings(selected.id, tab === 'relation' ? '关系' : tab === 'event' ? '事件' : '属性')) } catch (error) { setToast(error instanceof Error ? error.message : '语义映射校验失败') } }
  return <>
    <PageHeader eyebrow="本体与图谱 / 数据接入" title="数据接入与语义映射" description="登记来源系统，将来源实体、字段、关系与事件映射为标准本体事实。" actions={<><Button icon="refresh" onClick={() => void loadSources()}>刷新</Button><Button variant="primary" icon="plus" onClick={() => setDrawer(true)}>新建数据源</Button></>}/>
    <section className="stats-grid four"><article className="mini-stat"><span>启用数据源</span><strong>{dataSources.filter((item) => item.status === '启用').length}</strong><small>{dataSources.filter((item) => item.status === '异常').length}个异常</small></article><article className="mini-stat"><span>今日接收事件</span><strong>{records.reduce((sum, item) => sum + item.processed, 0).toLocaleString()}</strong><small>来自同步记录</small></article><article className="mini-stat"><span>有效映射</span><strong>{mappings.filter((item) => item.status === '有效').length}</strong><small>当前数据源</small></article><article className="mini-stat"><span>数据源总数</span><strong>{dataSources.length}</strong><small>含草稿与停用</small></article></section>
    <Panel className="data-access-panel"><Tabs value={tab} onChange={setTab} items={[{ key: 'sources', label: '数据源列表', count: dataSources.length }, { key: 'metadata', label: '元数据', count: metadata.length }, { key: 'mapping', label: '类属性映射' }, { key: 'relation', label: '关系映射' }, { key: 'event', label: '事件映射' }, { key: 'records', label: '同步记录', count: records.length }]}/>
      {tab === 'sources' && <SourceTable data={dataSources} selected={selectedId} onSelect={(item) => { setSelectedId(item.id); setTab('metadata') }} onTest={test} onToggle={toggle}/>} 
      {tab === 'metadata' && selected && <SourceMetadata source={selected} rows={metadata} onTest={() => void test(selected)} onParse={() => void parse()} onMapping={() => setTab('mapping')}/>} 
      {['mapping','relation','event'].includes(tab) && selected && <SourceMapping type={tab === 'mapping' ? '属性' : tab === 'relation' ? '关系' : '事件'} source={selected} rows={mappings} onSubmit={() => void validate()}/>} 
      {tab === 'records' && <SyncRecords rows={records}/>} 
    </Panel>
    <Drawer open={drawer} title="新建数据源" eyebrow="数据源向导" onClose={() => setDrawer(false)} footer={<><Button onClick={() => setDrawer(false)}>取消</Button><Button variant="primary" onClick={create}>保存并继续</Button></>}><div className="step-indicator"><span className="active">1 基本配置</span><span>2 连接测试</span><span>3 元数据解析</span></div><div className="form-stack"><Field label="来源系统名称 *"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/></Field><Field label="来源方式"><select value={form.mode} onChange={(event) => setForm({ ...form, mode: event.target.value })}><option>数据库视图</option><option>API</option><option>消息</option><option>批量文件</option></select></Field><Field label="责任人"><select value={form.owner} onChange={(event) => setForm({ ...form, owner: event.target.value })}><option>张海</option><option>陈洁</option></select></Field><Field label="同步方式"><select value={form.syncMode} onChange={(event) => setForm({ ...form, syncMode: event.target.value })}><option>全量</option><option>增量</option><option>事件</option></select></Field><Field label="数据范围 *"><textarea value={form.range} onChange={(event) => setForm({ ...form, range: event.target.value })} placeholder="说明对象、时间和组织范围"/></Field></div></Drawer>
  </>
}
function SourceTable({ data, selected, onSelect, onTest, onToggle }: { data: DataSourceItem[]; selected: string; onSelect: (item: DataSourceItem) => void; onTest: (item: DataSourceItem) => void; onToggle: (item: DataSourceItem) => void }) {
  return <div className="table-container"><table><thead><tr><th>来源名称 / 编码</th><th>来源方式</th><th>数据范围</th><th>责任人</th><th>同步方式</th><th>最近成功</th><th>状态</th><th>操作</th></tr></thead><tbody>{data.map((item) => <tr key={item.id} className={selected === item.id ? 'selected-row' : ''}><td><button className="table-link title-cell" onClick={() => onSelect(item)}><strong>{item.name}</strong><span>{item.id}</span></button></td><td>{item.mode}</td><td>{item.range}</td><td>{item.owner}</td><td>{item.syncMode}</td><td>{item.lastSuccess}</td><td><StatusTag>{item.status}</StatusTag></td><td><div className="row-actions"><button onClick={() => onSelect(item)}>详情</button><button onClick={() => onTest(item)}>测试</button><button onClick={() => onToggle(item)}>{item.status === '启用' ? '停用' : '启用'}</button></div></td></tr>)}</tbody></table></div>
}

function SourceMetadata({ source, rows, onTest, onParse, onMapping }: { source: DataSourceItem; rows: SourceMetadataItem[]; onTest: () => void; onParse: () => void; onMapping: () => void }) {
  return <div className="detail-grid"><Panel title="来源基本信息"><KeyValue items={[{ label: '来源名称', value: source.name }, { label: '来源编码', value: source.id }, { label: '来源方式', value: source.mode }, { label: '同步方式', value: source.syncMode }, { label: '责任人', value: source.owner }, { label: '最近成功时间', value: source.lastSuccess }, { label: '状态', value: <StatusTag>{source.status}</StatusTag> }]}/><div className="panel-actions bottom"><Button onClick={onTest}>测试连接</Button><Button variant="primary" onClick={onParse}>重新解析元数据</Button></div></Panel><Panel title="已解析元数据"><div className="metadata-list">{rows.map((item) => <button key={item.id}>{item.tableName} · {item.displayName} · {item.fieldCount}字段<Icon name="chevron" size={14}/></button>)}</div><Button variant="primary" onClick={onMapping}>进入语义映射</Button></Panel></div>
}
function SourceMapping({ type, source, rows, onSubmit }: { type: '属性' | '关系' | '事件'; source: DataSourceItem; rows: MappingItem[]; onSubmit: () => void }) {
  const visible = rows.filter((row) => row.type === type)
  return <><div className="mapping-header"><div><span>当前来源</span><strong>{source.name}</strong><small>{source.id}</small></div><Button variant="primary" onClick={onSubmit}>提交校验</Button></div><div className="mapping-canvas"><aside><h3>来源字段 / 关联键</h3>{visible.map((row) => <button key={row.id}>{row.sourceField}<small>{row.status}</small></button>)}</aside><main><h3>转换与识别规则</h3>{visible.map((row) => <div key={row.id}><span>{row.transform}</span><Icon name="chevron"/></div>)}</main><aside><h3>目标本体{type}</h3>{visible.map((row) => <button key={row.id}>{row.targetCode}<small>置信度 {row.confidence}%</small></button>)}</aside></div></>
}
function SyncRecords({ rows }: { rows: SyncRecordItem[] }) {
  return <div className="table-container"><table><thead><tr><th>批次号</th><th>数据源</th><th>方式</th><th>开始时间</th><th>处理数量</th><th>异常</th><th>耗时</th><th>结果</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.id}</td><td>{row.sourceName}</td><td>{row.mode}</td><td>{row.startedAt}</td><td>{row.processed.toLocaleString()}</td><td>{row.errors}</td><td>{row.duration}</td><td><StatusTag>{row.result}</StatusTag></td></tr>)}</tbody></table></div>
}

export function GraphManagementPage() {
  const setToast = useAppStore((state) => state.setToast)
  const [graphs, setGraphs] = useState<GraphVersion[]>([])
  const [issues, setIssues] = useState<GraphIssueItem[]>([])
  const [governance, setGovernance] = useState<GovernanceTaskItem[]>([])
  const [tab, setTab] = useState('versions')
  const [target, setTarget] = useState<GraphVersion | null>(null)
  const [governTarget, setGovernTarget] = useState<GovernanceTaskItem | null>(null)
  const [governResult, setGovernResult] = useState<'合并' | '保持独立' | '拆分'>('合并')
  const [governReason, setGovernReason] = useState('')
  const production = graphs.find((item) => item.status === '已发布') || graphs[0]
  const loadGraphs = async () => { try { const rows = await dataGraphApi.listGraphs(); setGraphs(rows); const current = rows.find((item) => item.status === '已发布') || rows[0]; if (current) { setIssues(await dataGraphApi.issues(current.id)); setGovernance(await dataGraphApi.governance(current.id)) } } catch (error) { setToast(error instanceof Error ? error.message : '图谱版本加载失败') } }
  useEffect(() => { void loadGraphs() }, [])
  const createTask = async () => { try { const graph = await dataGraphApi.createGraph(); setToast(`图谱构建任务 ${graph.id} 已创建`); await loadGraphs(); setTarget(graph) } catch (error) { setToast(error instanceof Error ? error.message : '图谱构建任务创建失败') } }
  const confirmPublish = async () => { if (!target) return; try { await dataGraphApi.publishGraph(target.id); setToast('图谱版本发布成功，原生产版本已归档'); setTarget(null); await loadGraphs() } catch (error) { setToast(error instanceof Error ? error.message : '图谱发布失败') } }
  const resolve = async (issue: GraphIssueItem) => { try { const graphId = production?.id || issue.graphId; const result = await dataGraphApi.resolveIssue(graphId, issue.id); setToast(result.message); setIssues(await dataGraphApi.issues(graphId)) } catch (error) { setToast(error instanceof Error ? error.message : '质量问题处理失败') } }
  const confirmGovern = async () => { if (!governTarget || !production) return; try { const result = await dataGraphApi.govern(production.id, governTarget.id, { result: governResult, reason: governReason }); setToast(result.message); setGovernTarget(null); setGovernReason(''); setGovernance(await dataGraphApi.governance(production.id)) } catch (error) { setToast(error instanceof Error ? error.message : '实体治理失败') } }
  return <>
    <PageHeader eyebrow="本体与图谱 / 图谱管理" title="图谱管理" description="构建并发布可追溯的图谱版本，处理实体识别和数据质量问题。" actions={<Button variant="primary" icon="plus" onClick={() => void createTask()}>新建发布任务</Button>}/>
    {production && <section className="graph-overview"><div><span>当前生产版本</span><strong>{production.id}</strong><small>发布于{production.publishedAt}</small></div><div><span>实体 / 关系 / 事件</span><strong>{production.entities.toLocaleString()} / {production.relations.toLocaleString()} / {production.events.toLocaleString()}</strong><small>完整版本快照</small></div><div><span>质量摘要</span><strong className={production.blockers ? 'danger-text' : 'success-text'}>{production.blockers} 阻断</strong><small>{production.warnings}个警告</small></div><div><span>待治理实体</span><strong>{governance.filter((item) => item.status !== '已处理').length}</strong><small>来自治理任务</small></div></section>}
    <Panel><Tabs value={tab} onChange={setTab} items={[{ key: 'versions', label: '图谱版本', count: graphs.length }, { key: 'governance', label: '实体治理', count: governance.length }, { key: 'quality', label: '质量问题', count: issues.length }, { key: 'publish', label: '发布记录' }]}/>{tab === 'versions' && <GraphTable data={graphs} onPublish={setTarget} onProblem={() => setTab('quality')}/>} {tab === 'governance' && <GovernanceTable data={governance} onOpen={setGovernTarget}/>} {tab === 'quality' && <QualityView data={issues} onResolve={(issue) => void resolve(issue)}/>} {tab === 'publish' && <VersionTimeline labels={graphs.filter((item) => ['已发布','已归档'].includes(item.status)).map((item) => `${item.id} · ${item.publishedAt} · ${item.status}`)}/>}</Panel>
    <Modal open={!!target} title="发布图谱版本" description={target ? `${target.id} · ${target.ontologyVersion}` : ''} onClose={() => setTarget(null)} onConfirm={confirmPublish}><PublishChecklist/>{target && target.blockers > 0 && <div className="alert-box danger"><Icon name="warning"/><span>存在{target.blockers}个阻断问题，需治理完成后再发布。</span></div>}</Modal>
    <Drawer open={!!governTarget} title={governTarget?.id || '候选实体对比'} eyebrow="实体治理" onClose={() => setGovernTarget(null)} footer={<><Button onClick={() => setGovernTarget(null)}>取消</Button><Button variant="danger" onClick={confirmGovern}>确认治理</Button></>}><div className="entity-compare"><article><StatusTag>候选A</StatusTag><h3>{governTarget?.candidates[0] || '候选实体A'}</h3><KeyValue items={[{ label: '对象类型', value: governTarget?.objectType }, { label: '识别依据', value: governTarget?.evidence }, { label: '建议结果', value: governTarget?.suggestion }]}/></article><div className="compare-score"><strong>96%</strong><span>{governTarget?.suggestion || '建议确认'}</span><small>强标识一致</small></div><article><StatusTag>候选B</StatusTag><h3>{governTarget?.candidates[1] || '候选实体B'}</h3><KeyValue items={[{ label: '图谱版本', value: governTarget?.graphId }, { label: '任务状态', value: <StatusTag>{governTarget?.status}</StatusTag> }, { label: '风险等级', value: governTarget?.level }]}/></article></div><div className="form-stack"><Field label="治理结果"><select value={governResult} onChange={(event) => setGovernResult(event.target.value as typeof governResult)}><option>合并</option><option>保持独立</option><option>拆分</option></select></Field><Field label="治理原因 *"><textarea value={governReason} onChange={(event) => setGovernReason(event.target.value)} placeholder="说明标识一致性、来源可信度和影响范围"/></Field></div></Drawer>
  </>
}
function GraphTable({ data, onPublish, onProblem }: { data: GraphVersion[]; onPublish: (item: GraphVersion) => void; onProblem: () => void }) {
  return <div className="table-container"><table><thead><tr><th>图谱版本号</th><th>本体 / 映射版本</th><th>数据范围</th><th>实体 / 关系 / 事件</th><th>质量摘要</th><th>状态</th><th>发布时间</th><th>操作</th></tr></thead><tbody>{data.map((item) => <tr key={item.id}><td><strong>{item.id}</strong></td><td>{item.ontologyVersion}<small className="cell-sub">{item.mappingVersion}</small></td><td>{item.range}</td><td>{item.entities.toLocaleString()}<small className="cell-sub">{item.relations.toLocaleString()} / {item.events.toLocaleString()}</small></td><td><span className={item.blockers ? 'danger-text' : 'success-text'}>{item.blockers} 阻断</span><small className="cell-sub">{item.warnings} 警告</small></td><td><StatusTag>{item.status}</StatusTag></td><td>{item.publishedAt}</td><td><div className="row-actions">{item.status === '待发布' && <button onClick={() => onPublish(item)}>发布</button>}<button onClick={onProblem}>问题</button></div></td></tr>)}</tbody></table></div>
}

function GovernanceTable({ data, onOpen }: { data: GovernanceTaskItem[]; onOpen: (item: GovernanceTaskItem) => void }) {
  return <div className="table-container"><table><thead><tr><th>治理任务</th><th>对象类型</th><th>候选实体</th><th>识别依据</th><th>建议结果</th><th>等级</th><th>操作</th></tr></thead><tbody>{data.map((row) => <tr key={row.id}><td>{row.id}</td><td>{row.objectType}</td><td>{row.candidates.join(' / ')}</td><td>{row.evidence}</td><td><StatusTag>{row.status === '已处理' ? row.result : row.suggestion}</StatusTag></td><td><RiskTag level={row.level as SceneItem['level']}/></td><td><button className="table-action" disabled={row.status === '已处理'} onClick={() => onOpen(row)}>{row.status === '已处理' ? '已处理' : '对比治理'}</button></td></tr>)}</tbody></table></div>
}
function QualityView({ data, onResolve }: { data: GraphIssueItem[]; onResolve: (item: GraphIssueItem) => void }) {
  return <div className="quality-grid">{data.map((item) => <article key={item.id}><StatusTag>{item.level}</StatusTag><h3>{item.title}</h3><p>{item.description}</p><span>{item.sourceRef} · {item.status}</span><Button onClick={() => onResolve(item)}>{item.status === '已处理' ? '已处理' : '标记处理'}</Button></article>)}</div>
}

export function UsersPage() {
  const users = useAppStore((state) => state.users)
  const roles = useAppStore((state) => state.roles)
  const createUser = useAppStore((state) => state.createUser)
  const updateUser = useAppStore((state) => state.updateUser)
  const transferUserTodos = useAppStore((state) => state.transferUserTodos)
  const setToast = useAppStore((state) => state.setToast)
  const [org, setOrg] = useState('中国电子云')
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('全部')
  const [selected, setSelected] = useState<UserItem | null>(null)
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [selectedStatus, setSelectedStatus] = useState<UserItem['status']>('启用')
  const [createUserOpen, setCreateUserOpen] = useState(false)
  const [userForm, setUserForm] = useState({ name: '', account: '', organization: '集团监管部', position: '', role: '业务责任人', status: '启用' as UserItem['status'] })
  const [transferTarget, setTransferTarget] = useState<UserItem | null>(null)
  const [transfer, setTransfer] = useState({ owner: '李华', reason: '' })
  const rows = users.filter((item) => (org === '中国电子云' || item.organization === org) && (!keyword || `${item.name}${item.account}${item.id}`.includes(keyword)) && (status === '全部' || item.status === status))
  const openUser = (item: UserItem) => { setSelected(item); setSelectedRoles(item.roles); setSelectedStatus(item.status) }
  const save = () => { if (!selected) return; const result = updateUser(selected.id, { roles: selectedRoles, status: selectedStatus }); setToast(result.message); if (result.ok) setSelected(null) }
  const submitUser = () => {
    const result = createUser({ name: userForm.name, account: userForm.account, organization: userForm.organization, position: userForm.position, roles: userForm.role ? [userForm.role] : [], status: userForm.status })
    setToast(result.message)
    if (result.ok) {
      setCreateUserOpen(false)
      setUserForm({ name: '', account: '', organization: '集团监管部', position: '', role: '业务责任人', status: '启用' })
    }
  }
  const submitTransfer = () => { if (!transferTarget) return; const result = transferUserTodos(transferTarget.id, transfer.owner, transfer.reason); setToast(result.message); if (result.ok) { setTransferTarget(null); setTransfer({ owner: '李华', reason: '' }) } }
  return <>
    <PageHeader eyebrow="系统管理 / 用户与组织" title="用户与组织" description="同步或维护组织、用户、岗位和账号状态，停用前完成未办任务转派。" actions={<><Button onClick={() => setToast('组织用户同步任务已创建')}>同步组织用户</Button><Button variant="primary" icon="plus" onClick={() => setCreateUserOpen(true)}>新建用户</Button></>}/>
    <section className="users-layout"><Panel title="组织树" className="organization-panel"><input placeholder="搜索组织"/><div className="org-tree">{['中国电子云','集团监管部','采购管理部','财务共享中心','数据管理部','审计纪检部'].map((name, index) => <button key={name} className={`${org === name ? 'active' : ''} ${index ? 'child' : ''}`} onClick={() => setOrg(name)}><Icon name={index ? 'graph' : 'home'} size={15}/><span>{name}</span><small>{index ? users.filter((user) => user.organization === name).length : users.length}</small></button>)}</div></Panel><Panel title={org} subtitle={`${rows.length} 名用户`} className="user-list-panel"><FilterGrid onReset={() => { setKeyword(''); setStatus('全部') }} onSearch={() => setToast(`查询到${rows.length}名用户`)}><Field label="关键词"><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="姓名、账号或人员编码"/></Field><Field label="账号状态"><select value={status} onChange={(event) => setStatus(event.target.value)}><option>全部</option><option>启用</option><option>锁定</option><option>停用</option></select></Field></FilterGrid><div className="table-container"><table><thead><tr><th>姓名 / 账号</th><th>所属组织 / 岗位</th><th>当前角色</th><th>状态</th><th>未完成待办</th><th>最后登录</th><th>操作</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td><button className="table-link title-cell" onClick={() => openUser(item)}><strong>{item.name}</strong><span>{item.account} · {item.id}</span></button></td><td>{item.organization}<small className="cell-sub">{item.position}</small></td><td>{item.roles.map((role) => <StatusTag key={role}>{role}</StatusTag>)}</td><td><StatusTag>{item.status}</StatusTag></td><td><button className={item.todos ? 'count-link' : ''} onClick={() => item.todos && setTransferTarget(item)}>{item.todos}</button></td><td>{item.lastLogin}</td><td><div className="row-actions"><button onClick={() => openUser(item)}>查看</button><button disabled={!item.todos} onClick={() => setTransferTarget(item)}>转派</button></div></td></tr>)}</tbody></table></div></Panel></section>
    <Drawer open={!!selected} title={selected?.name || ''} eyebrow="用户详情" onClose={() => setSelected(null)} footer={<><Button onClick={() => setSelected(null)}>关闭</Button><Button variant="primary" onClick={save}>保存</Button></>}><KeyValue items={[{ label: '账号', value: selected?.account }, { label: '人员编码', value: selected?.id }, { label: '所属组织', value: selected?.organization }, { label: '岗位', value: selected?.position }, { label: '未完成待办', value: `${selected?.todos || 0} 项` }, { label: '最后登录', value: selected?.lastLogin }]}/><Panel title="账号状态" className="drawer-section"><Field label="状态"><select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value as UserItem['status'])}><option>启用</option><option>锁定</option><option>停用</option></select></Field></Panel><Panel title="角色分配" className="drawer-section"><div className="check-grid vertical">{['监管负责人','领域监管专员','业务责任人','本体管理员','数据管理员'].map((role) => <label key={role}><input type="checkbox" checked={selectedRoles.includes(role)} onChange={() => setSelectedRoles((value) => value.includes(role) ? value.filter((item) => item !== role) : [...value, role])}/><span>{role}</span></label>)}</div></Panel>{selected && selected.todos > 0 && selectedStatus === '停用' && <div className="alert-box danger"><Icon name="warning"/><span>该用户存在{selected.todos}项未完成待办，停用前必须完成转派。</span></div>}</Drawer>
    <Modal open={!!transferTarget} title="批量转派未完成待办" description={transferTarget ? `${transferTarget.name} · ${transferTarget.todos}项待办` : ''} confirmText="确认转派" danger onClose={() => setTransferTarget(null)} onConfirm={submitTransfer}><div className="form-stack"><Field label="接收人 *"><select value={transfer.owner} onChange={(event) => setTransfer({ ...transfer, owner: event.target.value })}><option>李华</option><option>王宁</option><option>周航</option><option>孙凯</option></select></Field><Field label="转派原因 *"><textarea value={transfer.reason} onChange={(event) => setTransfer({ ...transfer, reason: event.target.value })} placeholder="说明离岗、调岗或职责调整原因"/></Field></div></Modal>
    <Modal open={createUserOpen} title="新建用户" description="创建本地用户后，可在用户详情中继续调整角色和账号状态。" confirmText="确认创建" onClose={() => setCreateUserOpen(false)} onConfirm={submitUser}><div className="form-stack"><div className="form-section two-column"><Field label="姓名 *"><input value={userForm.name} onChange={(event) => setUserForm({ ...userForm, name: event.target.value })} placeholder="请输入用户姓名"/></Field><Field label="登录账号 *"><input value={userForm.account} onChange={(event) => setUserForm({ ...userForm, account: event.target.value })} placeholder="例如 zhangsan"/></Field><Field label="所属组织 *"><select value={userForm.organization} onChange={(event) => setUserForm({ ...userForm, organization: event.target.value })}>{['集团监管部','采购管理部','财务共享中心','数据管理部','审计纪检部'].map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="岗位"><input value={userForm.position} onChange={(event) => setUserForm({ ...userForm, position: event.target.value })} placeholder="例如 采购监管专员"/></Field><Field label="初始角色"><select value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value })}><option value="">暂不分配</option>{roles.map((item) => <option value={item.name} key={item.id}>{item.name}</option>)}</select></Field><Field label="账号状态"><select value={userForm.status} onChange={(event) => setUserForm({ ...userForm, status: event.target.value as UserItem['status'] })}><option>启用</option><option>锁定</option><option>停用</option></select></Field></div></div></Modal>
  </>
}

const permissionOptions = ['查看工作台','查看监管态势','查看统一预警','查看风险事件','派发核查','监管复核','解除重大预警','升级风险事件','复核关闭风险事件','编辑场景规则','发布场景规则','发布本体版本','发布图谱版本','实体合并与拆分','管理用户','调整角色权限','查看审计日志']

export function RolesPage() {
  const roles = useAppStore((state) => state.roles)
  const createRole = useAppStore((state) => state.createRole)
  const updateRole = useAppStore((state) => state.updateRole)
  const setToast = useAppStore((state) => state.setToast)
  const [selectedId, setSelectedId] = useState(roles[0]?.id || '')
  const selected = roles.find((item) => item.id === selectedId) || roles[0]
  const [permissions, setPermissions] = useState<string[]>(selected?.permissions || [])
  const [tab, setTab] = useState('menu')
  const [confirm, setConfirm] = useState(false)
  const [createRoleOpen, setCreateRoleOpen] = useState(false)
  const [roleForm, setRoleForm] = useState({ name: '', id: '', scope: '当前组织' })
  const selectRole = (item: RoleItem) => { setSelectedId(item.id); setPermissions(item.permissions) }
  const toggle = (permission: string) => setPermissions((value) => value.includes(permission) ? value.filter((item) => item !== permission) : [...value, permission])
  const save = () => { if (!selected) return; const result = updateRole(selected.id, permissions); setToast(result.message); if (result.ok) setConfirm(false) }
  const submitRole = () => {
    const result = createRole(roleForm)
    setToast(result.message)
    if (result.ok && result.objectId) {
      setSelectedId(result.objectId)
      setPermissions([])
      setCreateRoleOpen(false)
      setRoleForm({ name: '', id: '', scope: '当前组织' })
    }
  }
  if (!selected) return <EmptyState title="暂无角色" description="请先同步或创建角色。"/>
  return <>
    <PageHeader eyebrow="系统管理 / 角色与权限" title="角色与权限" description="配置菜单、按钮、组织、字段、关系、证据和高危操作权限，权限变更即时生效。" actions={<Button variant="primary" icon="plus" onClick={() => setCreateRoleOpen(true)}>新建角色</Button>}/>
    <section className="role-layout"><Panel title="角色列表" className="role-list"><input placeholder="搜索角色名称或编码"/>{roles.map((item) => <button key={item.id} className={selected.id === item.id ? 'active' : ''} onClick={() => selectRole(item)}><div><strong>{item.name}</strong><span>{item.id} · {item.type}</span></div><small>{item.users}人</small><StatusTag>{item.status}</StatusTag></button>)}</Panel><Panel className="permission-panel"><div className="selected-role-header"><div><p className="eyebrow">当前角色</p><h2>{selected.name}</h2><span>{selected.id} · {selected.type}角色 · {selected.users}名用户</span></div><div><Button onClick={() => setToast(`当前调整${permissions.length}项权限，原配置${selected.permissions.length}项`)}>查看变更</Button><Button variant="primary" onClick={() => setConfirm(true)}>保存权限</Button></div></div><Tabs value={tab} onChange={setTab} items={[{ key: 'menu', label: '菜单与按钮' }, { key: 'org', label: '组织数据' }, { key: 'field', label: '字段属性' }, { key: 'relation', label: '关系权限' }, { key: 'evidence', label: '证据权限' }, { key: 'danger', label: '高危操作' }]}/><PermissionEditor tab={tab} role={selected} permissions={permissions} onToggle={toggle}/></Panel></section>
    <Modal open={confirm} title="保存角色权限" description={`${selected.name} · 权限调整将立即影响 ${selected.users} 名用户`} confirmText="确认保存" danger onClose={() => setConfirm(false)} onConfirm={save}><div className="alert-box danger"><Icon name="warning"/><span>服务端将重新计算菜单、按钮、字段、关系和证据权限，当前在线用户可能需要刷新页面。</span></div></Modal>
    <Modal open={createRoleOpen} title="新建角色" description="先创建角色草稿，再为其配置菜单、数据和高危操作权限。" confirmText="创建并配置权限" onClose={() => setCreateRoleOpen(false)} onConfirm={submitRole}><div className="form-stack"><Field label="角色名称 *"><input value={roleForm.name} onChange={(event) => setRoleForm({ ...roleForm, name: event.target.value })} placeholder="例如 合同监管专员"/></Field><Field label="角色编码 *"><input value={roleForm.id} onChange={(event) => setRoleForm({ ...roleForm, id: event.target.value.toUpperCase() })} placeholder="例如 ROLE_CONTRACT_AUDITOR"/></Field><Field label="数据范围"><select value={roleForm.scope} onChange={(event) => setRoleForm({ ...roleForm, scope: event.target.value })}><option>当前组织</option><option>当前组织及授权下级</option><option>全部组织</option></select></Field></div></Modal>
  </>
}

function PermissionEditor({ tab, role, permissions, onToggle }: { tab: string; role: RoleItem; permissions: string[]; onToggle: (value: string) => void }) {
  if (tab === 'org') return <div className="detail-grid"><Panel title="数据范围"><div className="radio-list"><label><input type="radio" name="scope" defaultChecked/>当前组织</label><label><input type="radio" name="scope"/>当前组织及授权下级</label><label><input type="radio" name="scope"/>自定义组织节点</label></div></Panel><Panel title="授权摘要"><KeyValue items={[{ label: '当前范围', value: role.scope }, { label: '组织节点', value: '12个' }, { label: '监管领域', value: '采购、合同、财务' }]}/></Panel></div>
  if (tab === 'field') return <div className="table-container"><table><thead><tr><th>本体类 / 字段</th><th>敏感等级</th><th>明文</th><th>脱敏</th><th>隐藏</th></tr></thead><tbody>{[['人员','证件号码','强敏感'],['账户','银行账号','强敏感'],['合同','合同金额','敏感'],['供应商','联系电话','敏感']].map((row, index) => <tr key={row[1]}><td><strong>{row[0]}</strong><small className="cell-sub">{row[1]}</small></td><td><StatusTag>{row[2]}</StatusTag></td><td><input type="radio" name={`field-${index}`}/></td><td><input type="radio" name={`field-${index}`} defaultChecked/></td><td><input type="radio" name={`field-${index}`}/></td></tr>)}</tbody></table></div>
  const visible = tab === 'menu' ? permissionOptions.filter((item) => item.startsWith('查看') || ['派发核查','监管复核'].includes(item)) : tab === 'danger' ? permissionOptions.filter((item) => ['解除重大预警','升级风险事件','复核关闭风险事件','发布场景规则','发布本体版本','发布图谱版本','实体合并与拆分','调整角色权限'].includes(item)) : tab === 'relation' ? ['查看统一预警','查看风险事件','实体合并与拆分'] : ['查看统一预警','查看风险事件','查看审计日志']
  return <div className={tab === 'danger' ? 'danger-permissions' : 'check-grid permission-cards'}>{visible.map((item) => <label key={item}><div><Icon name={tab === 'danger' ? 'lock' : 'shield'}/><span>{item}</span></div><input type="checkbox" checked={permissions.includes(item)} onChange={() => onToggle(item)}/></label>)}</div>
}

export function AuditPage() {
  const audits = useAppStore((state) => state.audits)
  const setToast = useAppStore((state) => state.setToast)
  const [selected, setSelected] = useState<AuditItem | null>(null)
  const [draft, setDraft] = useState({ keyword: '', risk: '全部', result: '全部' })
  const [filters, setFilters] = useState(draft)
  const rows = audits.filter((item) => (!filters.keyword || `${item.operator}${item.action}${item.objectId}${item.traceId}`.toLowerCase().includes(filters.keyword.toLowerCase())) && (filters.risk === '全部' || item.risk === filters.risk) && (filters.result === '全部' || item.result === filters.result))
  return <>
    <PageHeader eyebrow="系统管理 / 审计日志" title="审计日志" description="查询高危操作、敏感数据访问和业务处置链路；记录只读、不可删除和物理覆盖。" actions={<><span className="updated-time">动态记录 {audits.length} 条</span><Button icon="refresh" onClick={() => setToast('审计索引已刷新')}>刷新</Button></>}/>
    <FilterGrid onReset={() => { const value = { keyword: '', risk: '全部', result: '全部' }; setDraft(value); setFilters(value) }} onSearch={() => { setFilters(draft); setToast(`已查询到 ${rows.length} 条审计记录`) }}><Field label="关键词"><input value={draft.keyword} onChange={(event) => setDraft({ ...draft, keyword: event.target.value })} placeholder="操作人、动作、对象或trace_id"/></Field><Field label="操作结果"><select value={draft.result} onChange={(event) => setDraft({ ...draft, result: event.target.value })}><option>全部</option><option>成功</option><option>失败</option><option>部分成功</option></select></Field><Field label="风险级别"><select value={draft.risk} onChange={(event) => setDraft({ ...draft, risk: event.target.value })}><option>全部</option><option>普通</option><option>高危</option><option>敏感访问</option></select></Field></FilterGrid>
    <Panel title="审计记录" subtitle={`当前条件共 ${rows.length} 条，默认按操作时间倒序`}><div className="table-container"><table><thead><tr><th>操作时间</th><th>操作人 / 组织</th><th>操作类型</th><th>对象类型 / 编号</th><th>操作摘要</th><th>结果</th><th>风险级别</th><th>trace_id</th><th>操作</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td>{item.time}</td><td>{item.operator}<small className="cell-sub">{item.organization}</small></td><td>{item.action}</td><td>{item.objectType}<small className="cell-sub">{item.objectId}</small></td><td>{item.summary}</td><td><StatusTag>{item.result}</StatusTag></td><td><StatusTag>{item.risk}</StatusTag></td><td><button className="trace-link" onClick={() => setSelected(item)}>{item.traceId}</button></td><td><button className="table-action" onClick={() => setSelected(item)}>详情</button></td></tr>)}</tbody></table></div></Panel>
    <Drawer open={!!selected} title={selected?.traceId || ''} eyebrow="审计日志详情" onClose={() => setSelected(null)} footer={<Button onClick={() => { navigator.clipboard?.writeText(selected?.traceId || ''); setToast('trace_id 已复制') }}>复制 trace_id</Button>}><KeyValue items={[{ label: '操作时间', value: selected?.time }, { label: '操作人', value: `${selected?.operator} / ${selected?.organization}` }, { label: '操作类型', value: selected?.action }, { label: '对象', value: `${selected?.objectType} / ${selected?.objectId}` }, { label: '操作结果', value: <StatusTag>{selected?.result}</StatusTag> }, { label: '风险级别', value: <StatusTag>{selected?.risk}</StatusTag> }, { label: 'IP地址', value: '10.20.18.***' }]}/><Panel title="操作原因" className="drawer-section"><p className="drawer-note">{selected?.summary}</p></Panel><Panel title="链路信息" className="drawer-section"><div className="trace-chain"><span>网关接入</span><i/><span>权限校验</span><i/><span>业务服务</span><i/><span>审计落库</span></div></Panel></Drawer>
  </>
}

function VersionTimeline({ labels }: { labels: string[] }) {
  return <div className="version-timeline">{labels.map((label, index) => <article key={label}><i/><div><strong>{label}</strong><span>{index === 0 ? '当前记录' : `${index + 1}个历史版本前`}</span></div></article>)}</div>
}

function PublishChecklist() {
  return <div className="publish-checklist">{['基本信息与编码校验','本体和图谱依赖有效','事件与证据配置完整','权限范围校验通过','试跑或质量校验通过'].map((item) => <div key={item}><Icon name="check"/><span>{item}</span><StatusTag>通过</StatusTag></div>)}</div>
}
