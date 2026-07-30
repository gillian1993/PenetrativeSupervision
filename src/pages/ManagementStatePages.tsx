import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAppStore } from '../store'
import type { AuditItem, DataSourceAccessConfig, DataSourceItem, OntologyItem, RoleItem, SceneItem, UserItem } from '../types'
import { dataGraphApi, type MappingItem, type SourceMetadataItem, type SyncRecordItem } from '../dataGraphApi'
import { ontologyApi } from '../ontologyApi'
import type { OntologyElement, OntologyRecord } from '../ontologyLocalStore'
import { Button, Drawer, EmptyState, Field, FilterGrid, Icon, KeyValue, Modal, PageHeader, Panel, RiskTag, StatusTag, Tabs } from '../ui'
import { ACTION_PERMISSION_CATALOG, MENU_PERMISSION_CATALOG, PERMISSION_LABEL_BY_CODE, normalizePermissionCodes } from '../permissions'
import { OntologyListPage as GraphStructureListPage } from './OntologyLocalPages'

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
    <PageHeader eyebrow="场景与规则 / 风险场景" title="风险场景" description="管理目标类、适用范围、等级、制度依据、证据要求和核查模板，发布后形成不可变版本。" actions={<><Button icon="refresh" onClick={() => setToast('场景列表已刷新')}>刷新</Button><Button variant="primary" icon="plus" onClick={() => setModal('new')}>新建场景</Button></>}/>
    <FilterGrid onReset={() => { const value = { keyword: '', status: '全部', domain: '全部' }; setDraft(value); setFilters(value) }} onSearch={() => { setFilters(draft); setToast(`已查询到 ${rows.length} 个场景`) }}>
      <Field label="关键词"><input value={draft.keyword} onChange={(event) => setDraft({ ...draft, keyword: event.target.value })} placeholder="场景名称、编码、对象或事件"/></Field>
      <Field label="监管领域"><select value={draft.domain} onChange={(event) => setDraft({ ...draft, domain: event.target.value })}><option>全部</option><option>采购</option><option>合同</option><option>财务</option><option>投资</option></select></Field>
      <Field label="状态"><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option>全部</option><option>草稿</option><option>待试跑</option><option>待发布</option><option>已发布</option><option>已停用</option></select></Field>
    </FilterGrid>
    <Panel title="场景列表" subtitle={`共 ${rows.length} 个场景，已发布版本不可直接编辑`}>
      {rows.length === 0 ? <EmptyState title="没有符合条件的场景" description="请调整筛选条件后重新查询。"/> : <div className="table-container"><table><thead><tr><th>场景名称 / 编码</th><th>监管领域</th><th>主对象 / 目标类</th><th>默认等级</th><th>规则</th><th>版本</th><th>状态</th><th>更新人 / 时间</th><th>操作</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td><button className="table-link title-cell" onClick={() => navigate(`/scenes/${item.id}`)}><strong>{item.name}</strong><span>{item.id}</span></button></td><td>{item.domain}</td><td>{item.object}<small className="cell-sub">{item.event}</small></td><td><RiskTag level={item.level}/></td><td><strong>{item.rules}</strong> 条</td><td>{item.version}</td><td><StatusTag>{item.status}</StatusTag></td><td>{item.updatedBy}<small className="cell-sub">{item.updatedAt}</small></td><td><div className="row-actions vertical"><button onClick={() => navigate(`/scenes/${item.id}`)}>{item.status === '已发布' ? '查看' : '编辑'}</button>{item.status === '已发布' ? <button onClick={() => { setTarget(item); setModal('stop') }}>停用</button> : <button onClick={() => { setTarget(item); setModal('publish') }}>发布</button>}</div></td></tr>)}</tbody></table></div>}
    </Panel>
    <Modal open={modal === 'new'} title="新建风险场景" description="创建后进入草稿编辑页。" confirmText="创建并编辑" onClose={() => setModal(null)} onConfirm={create}><div className="form-stack"><Field label="场景名称 *"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="请输入业务化场景名称"/></Field><Field label="监管领域"><select value={form.domain} onChange={(event) => setForm({ ...form, domain: event.target.value })}><option>采购</option><option>合同</option><option>财务</option><option>投资</option></select></Field><Field label="主对象"><select value={form.object} onChange={(event) => setForm({ ...form, object: event.target.value })}><option>供应商</option><option>合同</option><option>付款单</option><option>投资项目</option></select></Field><Field label="目标类"><input value={form.event} onChange={(event) => setForm({ ...form, event: event.target.value })}/></Field><Field label="默认等级"><select value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value as SceneItem['level'] })}><option>重大</option><option>高</option><option>中</option><option>低</option></select></Field></div></Modal>
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
    <Panel className="editor-panel"><Tabs value={tab} onChange={setTab} items={[{ key: 'basic', label: '基本信息' }, { key: 'rules', label: '规则配置', count: scene.rules }, { key: 'policies', label: '制度依据', count: 2 }, { key: 'evidence', label: '证据要求', count: 5 }, { key: 'scope', label: '适用范围' }, { key: 'versions', label: '版本记录' }]}/>
      {tab === 'basic' && <div className="form-section two-column"><Field label="场景名称"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} disabled={readonly}/></Field><Field label="场景编码"><input value={scene.id} disabled/></Field><Field label="监管领域"><select value={draft.domain} onChange={(event) => setDraft({ ...draft, domain: event.target.value })} disabled={readonly}><option>采购</option><option>合同</option><option>财务</option><option>投资</option></select></Field><Field label="默认风险等级"><select value={draft.level} onChange={(event) => setDraft({ ...draft, level: event.target.value as SceneItem['level'] })} disabled={readonly}><option>重大</option><option>高</option><option>中</option><option>低</option></select></Field><Field label="主对象"><select value={draft.object} onChange={(event) => setDraft({ ...draft, object: event.target.value })} disabled={readonly}><option>供应商</option><option>合同</option><option>付款单</option><option>投资项目</option></select></Field><Field label="目标类"><input value={draft.event} onChange={(event) => setDraft({ ...draft, event: event.target.value })} disabled={readonly}/></Field></div>}
      {tab === 'rules' && <div><div className="section-toolbar"><div><strong>{scene.rules} 条关联规则</strong><span>发布前至少需要一条启用规则</span></div><Button variant="primary" icon="plus" disabled={readonly} onClick={() => navigate('/rules/new')}>新建规则</Button></div><div className="table-container"><table><thead><tr><th>规则名称 / 编码</th><th>规则类型</th><th>等级</th><th>状态</th><th>操作</th></tr></thead><tbody>{scene.rules > 0 ? [['RULE-001','供应商与评审人员共同信息','关系路径','重大'],['RULE-002','实际控制人任职关联','关系路径','高']].slice(0, Math.min(scene.rules, 2)).map((row) => <tr key={row[0]}><td><strong>{row[1]}</strong><small className="cell-sub">{row[0]}</small></td><td>{row[2]}</td><td><RiskTag level={row[3] as SceneItem['level']}/></td><td><StatusTag>启用</StatusTag></td><td><button className="table-action" onClick={() => navigate(`/rules/${row[0]}`)}>{readonly ? '查看' : '编辑'}</button></td></tr>) : <tr><td colSpan={5}><EmptyState title="尚未配置规则" description="新增并启用至少一条规则后才可发布。"/></td></tr>}</tbody></table></div></div>}
      {tab === 'policies' && <div className="policy-editor-list"><Panel title="制度依据" subtitle="第一阶段由人工维护，可配置多条制度、版本和条款"><div className="policy-card"><Icon name="file"/><div><strong>采购评审管理办法 v3.2</strong><span>第十二条 · 评审人员回避要求</span><p>评审人员应主动回避利益关联主体。</p></div></div><div className="policy-card"><Icon name="file"/><div><strong>采购项目评审专家管理细则 v1.6</strong><span>第八条 · 利益冲突申报</span><p>专家与投标主体存在利益关系时，应申报并回避。</p></div></div><Button disabled={readonly} onClick={() => setToast('制度依据人工配置已打开')}>新增制度依据</Button></Panel></div>}
      {tab === 'evidence' && <div className="detail-grid"><Panel title="证据要求" subtitle="第一阶段由人工配置，运行后生成实际证据"><div className="evidence-requirement-list">{['业务来源记录','主体信息','审批记录','联系方式来源','规则运行明细'].map((item) => <article key={item} className="selected"><label><input type="checkbox" defaultChecked disabled={readonly}/><span><strong>{item}</strong><small>需保存来源系统、来源记录编号和取数批次</small></span></label><div><StatusTag>{item.includes('记录') ? '可预览' : '可追溯'}</StatusTag><button onClick={() => setToast(`${item}证据要求预览已打开`)}>预览</button></div></article>)}</div></Panel><Panel title="证据要求摘要" subtitle="对应统一预警中的实际证据"><p className="drawer-note">证据要求只定义必须固化哪些类型；实际附件和快照在统一预警生成后查看。</p></Panel></div>}
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
    <PageHeader eyebrow="知识图谱 / 图谱结构" title="图谱结构" description="维护基础图谱结构和领域图谱结构，统一类、属性和关系定义。" actions={<><Button icon="refresh" onClick={() => setToast('图谱结构列表已刷新')}>刷新</Button><Button variant="primary" icon="plus" onClick={() => setToast('请从已发布图谱结构复制草稿，以保留语义继承关系')}>新建图谱结构</Button></>}/>
    <FilterGrid onReset={() => setKeyword('')} onSearch={() => setToast(`查询完成，共${rows.length}个图谱结构`)}><Field label="关键词"><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="结构名称、编码或领域"/></Field><Field label="状态"><select><option>全部状态</option><option>草稿</option><option>待校验</option><option>已发布</option></select></Field></FilterGrid>
    <Panel title="图谱结构列表" subtitle="已发布版本只读，变更必须复制新版本"><div className="table-container"><table><thead><tr><th>结构名称 / 编码</th><th>范围 / 领域</th><th>版本</th><th>类 / 属性 / 关系</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td><button className="table-link title-cell" onClick={() => navigate(`/ontology/${item.id}`)}><strong>{item.name}</strong><span>{item.id}</span></button></td><td>{item.scope}<small className="cell-sub">{item.domain}</small></td><td>{item.version}</td><td><span className="metrics-inline"><b>{item.classes}</b>类（{Math.max(0, item.classes - item.events)}对象 / {item.events}事件） · <b>{item.properties}</b>属性 · <b>{item.relations}</b>关系</span></td><td><StatusTag>{item.status}</StatusTag></td><td>{item.updatedAt}</td><td><div className="row-actions"><button onClick={() => navigate(`/ontology/${item.id}`)}>{item.status === '已发布' ? '查看' : '编辑'}</button><button onClick={() => setTarget(item)}>{item.status === '已发布' ? '复制版本' : '发布'}</button></div></td></tr>)}</tbody></table></div></Panel>
    <Modal open={!!target} title={target?.status === '已发布' ? '复制图谱结构' : '发布图谱结构'} description={target ? `${target.name} ${target.version}` : ''} onClose={() => setTarget(null)} onConfirm={confirm}><PublishChecklist/></Modal>
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
  if (!item) return <EmptyState title="图谱结构版本不存在" description="请从图谱结构列表选择可访问版本。"/>
  const readonly = item.status === '已发布'
  const copy = () => { const result = copyOntology(item.id); setToast(result.message); if (result.ok && result.objectId) navigate(`/ontology/${result.objectId}`) }
  const publish = () => { const result = publishOntology(item.id); setToast(result.message) }
  return <>
    <div className="editor-header"><div><button className="back-button" onClick={() => navigate('/ontology')}>‹ 返回图谱结构列表</button><p className="eyebrow">图谱结构版本编辑 / {item.id}</p><h1>{item.name}</h1><div className="editor-meta"><StatusTag>{item.status}</StatusTag><span>版本 {item.version}</span><span>{item.scope}</span><span>最近保存：{item.updatedAt}</span></div></div><div className="page-actions">{readonly ? <Button variant="primary" onClick={copy}>复制新版本</Button> : <><Button onClick={() => setToast('图谱结构草稿已保存')}>保存草稿</Button><Button onClick={() => setToast('校验完成：0个阻断项')}>校验</Button><Button variant="primary" onClick={publish}>发布</Button></>}</div></div>
    <section className="ontology-editor-layout"><Panel title="类" subtitle={`${item.classes} 个类`} className="class-tree"><input placeholder="搜索名称或编码"/><div className="tree-list">{['组织','人员','主体','供应商','采购项目','合同','审批记录','资金记录','账户','文档/附件','预警','风险事件'].map((name) => <button key={name} className={selected === name ? 'active' : ''} onClick={() => setSelected(name)}><Icon name={name === '人员' ? 'user' : name === '预警' ? 'warning' : 'graph'} size={15}/><span>{name}</span><small>{name === '供应商' ? 'PROC.Supplier' : `BASE.${name}`}</small></button>)}</div><Button icon="plus" onClick={() => setDrawer(true)} disabled={readonly}>新增类</Button></Panel><Panel className="ontology-element-panel"><div className="selected-class-header"><div><p className="eyebrow">当前类</p><h2>{selected}</h2><span>主识别属性：统一社会信用代码 / 主体编码</span></div><Button icon="edit" onClick={() => setDrawer(true)} disabled={readonly}>编辑类定义</Button></div><Tabs value={tab} onChange={setTab} items={[{ key: 'class', label: '类定义' }, { key: 'property', label: '属性', count: 12 }, { key: 'relation', label: '关系', count: 8 }, { key: 'diff', label: '版本差异' }]}/>{tab === 'class' && <KeyValue items={[{ label: '类编码', value: 'PROC.Supplier' }, { label: '中文名称', value: selected }, { label: '别名', value: '供应商、服务商、投标主体' }, { label: '默认敏感等级', value: <StatusTag>内部</StatusTag> }, { label: '主识别属性', value: '统一社会信用代码、供应商编码' }]}/>} {tab === 'property' && <OntologyElements rows={['supplier_code|供应商编码|文本|主标识','credit_code|统一社会信用代码|文本|主标识','supplier_name|供应商名称|文本|必填','contact_phone|联系电话|文本|强敏感']}/>} {tab === 'relation' && <OntologyElements rows={['participate|参与|供应商 → 采购项目|多对多','sign|签订|供应商 → 合同|一对多','controlled_by|受控制于|供应商 → 主体|多对多']}/>} {tab === 'diff' && <VersionTimeline labels={['新增：共同联系方式关系','修改：主标识质量要求','修改：联系电话敏感等级']}/>}</Panel></section>
    <Drawer open={drawer} title={`${readonly ? '查看' : '编辑'}类：${selected}`} eyebrow="结构元素" onClose={() => setDrawer(false)} footer={<><Button onClick={() => setDrawer(false)}>取消</Button><Button variant="primary" disabled={readonly} onClick={() => { setDrawer(false); setToast('类定义已保存') }}>保存</Button></>}><div className="form-stack"><Field label="类编码"><input defaultValue="PROC.Supplier" disabled/></Field><Field label="中文名称"><input defaultValue={selected} disabled={readonly}/></Field><Field label="别名"><input defaultValue="供应商、服务商、投标主体" disabled={readonly}/></Field><Field label="默认敏感等级"><select defaultValue="内部" disabled={readonly}><option>普通</option><option>内部</option><option>敏感</option><option>强敏感</option></select></Field></div></Drawer>
  </>
}

function OntologyElements({ rows }: { rows: string[] }) {
  const setToast = useAppStore((state) => state.setToast)
  return <div className="table-container"><table><thead><tr><th>编码 / 名称</th><th>类型</th><th>约束</th><th>操作</th></tr></thead><tbody>{rows.map((value) => { const row = value.split('|'); return <tr key={row[0]}><td><strong>{row[1]}</strong><small className="cell-sub">{row[0]}</small></td><td>{row[2]}</td><td>{row[3]}</td><td><button className="table-action" onClick={() => setToast(`${row[1]}定义详情已打开`)}>查看</button></td></tr> })}</tbody></table></div>
}

const databaseDefaultPorts: Record<string, string> = { MySQL: '3306', Oracle: '1521', PostgreSQL: '5432', 'SQL Server': '1433' }
const sourceModeOptions = ['数据库接入', '接口接入', '文件导入']
const defaultAccessConfig = (mode = '数据库接入'): DataSourceAccessConfig => {
  if (mode === '接口接入') return { apiUrl: '', method: 'GET', authType: 'Token', token: '' }
  if (mode === '文件导入') return { fileName: '' }
  return { databaseType: 'MySQL', host: '', port: '3306', databaseName: '', username: '', password: '' }
}
const sourceInitial = { name: '', mode: '数据库接入', range: '', owner: '张海', ontologyIds: [] as string[], accessConfig: defaultAccessConfig('数据库接入') }

function validateSourceAccessConfig(mode: string, config: DataSourceAccessConfig) {
  if (mode === '数据库接入') {
    if (!config.host?.trim()) return '请填写数据库地址/IP'
    if (!config.port?.trim()) return '请填写数据库端口'
    if (!config.databaseName?.trim()) return '请填写数据库名/Schema'
    if (!config.username?.trim()) return '请填写数据库用户名'
    if (!config.password?.trim()) return '请填写数据库密码'
  }
  if (mode === '接口接入') {
    if (!config.apiUrl?.trim()) return '请填写接口地址'
    if (!config.method?.trim()) return '请选择请求方式'
    if (!config.authType?.trim()) return '请选择认证方式'
    if (config.authType !== '无认证' && !config.token?.trim()) return '请填写 Token/密钥'
  }
  if (mode === '文件导入' && !config.fileName?.trim()) return '请上传数据文件'
  return ''
}

function AccessConfigFields({ mode, config, onChange, readonly = false }: { mode: string; config: DataSourceAccessConfig; onChange: (patch: DataSourceAccessConfig) => void; readonly?: boolean }) {
  if (mode === '接口接入') return <Panel title="接口接入配置" subtitle="填写接口地址和认证信息；Token/密钥保存后不明文回显。">
    <div className="form-section two-column">
      <Field label="接口地址 *"><input value={config.apiUrl || ''} disabled={readonly} onChange={(event) => onChange({ apiUrl: event.target.value })} placeholder="例如 https://api.example.com/orders"/></Field>
      <Field label="请求方式 *"><select value={config.method || 'GET'} disabled={readonly} onChange={(event) => onChange({ method: event.target.value })}><option>GET</option><option>POST</option></select></Field>
      <Field label="认证方式 *"><select value={config.authType || 'Token'} disabled={readonly} onChange={(event) => onChange({ authType: event.target.value })}><option>Token</option><option>API Key</option><option>Basic Auth</option><option>无认证</option></select></Field>
      <Field label="Token/密钥"><input type="password" value={config.token || ''} disabled={readonly} onChange={(event) => onChange({ token: event.target.value })} placeholder={config.authType === '无认证' ? '无认证时可不填' : config.tokenConfigured ? '已配置（不明文回显）' : '请输入 Token 或密钥'}/></Field>
    </div>
  </Panel>
  if (mode === '文件导入') return <Panel title="文件导入配置" subtitle="P0 只需要上传文件，文件结构在字段映射前解析。">
    <div className="form-section two-column">
      <Field label="上传文件 *"><input type="file" disabled={readonly} onChange={(event) => onChange({ fileName: event.target.files?.[0]?.name || '' })}/></Field>
      <Field label="已选择文件"><input value={config.fileName || '尚未选择文件'} disabled/></Field>
    </div>
  </Panel>
  return <Panel title="数据库接入配置" subtitle="填写数据库连接信息；密码保存后不明文回显，表/视图由后续解析来源结构自动读取。">
    <div className="form-section two-column">
      <Field label="数据库类型 *"><select value={config.databaseType || 'MySQL'} disabled={readonly} onChange={(event) => onChange({ databaseType: event.target.value, port: databaseDefaultPorts[event.target.value] || config.port })}>{Object.keys(databaseDefaultPorts).map((item) => <option key={item}>{item}</option>)}</select></Field>
      <Field label="数据库地址/IP *"><input value={config.host || ''} disabled={readonly} onChange={(event) => onChange({ host: event.target.value })} placeholder="例如 10.10.1.12"/></Field>
      <Field label="端口 *"><input value={config.port || ''} disabled={readonly} onChange={(event) => onChange({ port: event.target.value })} placeholder="例如 3306"/></Field>
      <Field label="数据库名/Schema *"><input value={config.databaseName || ''} disabled={readonly} onChange={(event) => onChange({ databaseName: event.target.value })} placeholder="例如 erp_procurement"/></Field>
      <Field label="用户名 *"><input value={config.username || ''} disabled={readonly} onChange={(event) => onChange({ username: event.target.value })} placeholder="例如 readonly_user"/></Field>
      <Field label="密码 *"><input type="password" value={config.password || ''} disabled={readonly} onChange={(event) => onChange({ password: event.target.value })} placeholder={config.passwordConfigured ? '已配置（不明文回显）' : '请输入数据库密码'}/></Field>
    </div>
  </Panel>
}
function sourceAccessConfigItems(source: DataSourceItem) {
  const config = source.accessConfig || {}
  if (source.mode === '接口接入') return [
    { label: '接口地址', value: config.apiUrl || '未配置' },
    { label: '请求方式', value: config.method || '未配置' },
    { label: '认证方式', value: config.authType || '未配置' },
    { label: 'Token/密钥', value: config.tokenConfigured ? '已配置' : '未配置' },
  ]
  if (source.mode === '文件导入') return [
    { label: '上传文件', value: config.fileName || '未配置' },
  ]
  return [
    { label: '数据库类型', value: config.databaseType || '未配置' },
    { label: '数据库地址/IP', value: config.host || '未配置' },
    { label: '端口', value: config.port || '未配置' },
    { label: '数据库名/Schema', value: config.databaseName || '未配置' },
    { label: '用户名', value: config.username || '未配置' },
    { label: '密码', value: config.passwordConfigured ? '已配置' : '未配置' },
  ]
}

export function DataSourceCreatePage() {
  const navigate = useNavigate()
  const setToast = useAppStore((state) => state.setToast)
  const [ontologies, setOntologies] = useState<OntologyItem[]>([])
  const [form, setForm] = useState(sourceInitial)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const publishedOntologies = useMemo(() => ontologies.filter((item) => item.status === '已发布'), [ontologies])
  const updateAccessConfig = (patch: DataSourceAccessConfig) => setForm({ ...form, accessConfig: { ...form.accessConfig, ...patch } })
  const changeMode = (mode: string) => setForm({ ...form, mode, accessConfig: defaultAccessConfig(mode) })

  useEffect(() => {
    let active = true
    setLoading(true)
    void ontologyApi.list().then((rows) => {
      if (active) setOntologies(rows)
    }).catch((error) => {
      setToast(error instanceof Error ? error.message : '图谱结构加载失败')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [setToast])

  const create = async () => {
    if (saving) return
    if (!form.ontologyIds.length) { setToast('请至少选择一个适用图谱结构'); return }
    if (!form.name.trim()) { setToast('请填写数据源名称'); return }
    const configError = validateSourceAccessConfig(form.mode, form.accessConfig)
    if (configError) { setToast(configError); return }
    setSaving(true)
    try {
      const source = await dataGraphApi.createSource(form)
      setToast(`数据源草稿 ${source.id} 已创建，请继续维护字段映射`)
      navigate(`/graphs/sources/${source.id}?tab=mapping`)
    } catch (error) {
      setToast(error instanceof Error ? error.message : '数据源创建失败')
    } finally {
      setSaving(false)
    }
  }

  return <>
    <PageHeader eyebrow="知识图谱 / 数据源" title="新建数据源" description="填写数据源基本配置和接入配置，保存后进入字段映射。" actions={<><Button onClick={() => navigate('/graphs/sources')}>取消</Button><Button variant="primary" disabled={loading || saving || !publishedOntologies.length} onClick={() => void create()}>{saving ? '保存中…' : '保存并继续'}</Button></>}/>
    <Panel className="data-access-panel" title="数据源配置" subtitle="P0 流程：基本配置 → 字段映射">
      <div className="step-indicator"><span className="active">1 基本配置</span><span>2 字段映射</span></div>
      {loading ? <div className="loading-state"><i/><span>正在加载图谱结构…</span></div> : <div className="form-stack">
        <Field label="适用图谱结构 *">{publishedOntologies.length ? <select value={form.ontologyIds[0] || ''} onChange={(event) => setForm({ ...form, ontologyIds: event.target.value ? [event.target.value] : [] })}><option value="">请选择适用图谱结构</option>{publishedOntologies.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.version}</option>)}</select> : <div className="alert-box danger"><Icon name="warning"/><span>暂无已发布图谱结构，请先发布图谱结构后再新建数据源。</span></div>}</Field>
        <div className="form-section two-column">
          <Field label="来源系统名称 *"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="请输入数据源名称"/></Field>
          <Field label="来源方式"><select value={form.mode} onChange={(event) => changeMode(event.target.value)}>{sourceModeOptions.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="责任人"><select value={form.owner} onChange={(event) => setForm({ ...form, owner: event.target.value })}><option>张海</option><option>陈洁</option></select></Field>
          <Field label="数据范围"><input value={form.range} onChange={(event) => setForm({ ...form, range: event.target.value })} placeholder="可选，说明对象、时间和组织范围"/></Field>
        </div>
        <AccessConfigFields mode={form.mode} config={form.accessConfig} onChange={updateAccessConfig}/>
      </div>}
    </Panel>
  </>
}
export function DataAccessPage() {
  const navigate = useNavigate()
  const setToast = useAppStore((state) => state.setToast)
  const [dataSources, setDataSources] = useState<DataSourceItem[]>([])
  const [records, setRecords] = useState<SyncRecordItem[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<DataSourceItem | null>(null)
  const [searchDraft, setSearchDraft] = useState({ keyword: '', status: '全部' })
  const [filters, setFilters] = useState({ keyword: '', status: '全部' })
  const filteredSources = useMemo(() => { const keyword = filters.keyword.trim().toLowerCase(); return dataSources.filter((item) => { const matchesKeyword = !keyword || [item.name, item.id, item.mode, item.range, item.owner, item.status, ...(item.ontologyIds || []), ...(item.ontologyNames || [])].join(' ').toLowerCase().includes(keyword); const matchesStatus = filters.status === '全部' || item.status === filters.status; return matchesKeyword && matchesStatus }) }, [dataSources, filters])
  const load = async () => {
    setLoading(true)
    try {
      const [sources, syncRows] = await Promise.all([dataGraphApi.listSources(), dataGraphApi.syncRecords()])
      setDataSources(sources)
      setRecords(syncRows)
    } catch (error) {
      setToast(error instanceof Error ? error.message : '数据源加载失败')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])
  const test = async (item: DataSourceItem) => { try { const result = await dataGraphApi.testSource(item.id); setToast(result.message); await load() } catch (error) { setToast(error instanceof Error ? error.message : '连接测试失败') } }
  const toggle = async (item: DataSourceItem) => { try { await dataGraphApi.toggleSource(item.id, item.status !== '启用'); setToast(item.status === '启用' ? '数据源已停用' : '数据源已启用'); await load() } catch (error) { setToast(error instanceof Error ? error.message : '状态切换失败') } }
  const remove = async () => { if (!deleteTarget) return; try { const result = await dataGraphApi.deleteSource(deleteTarget.id); setDeleteTarget(null); setToast(result.message); await load() } catch (error) { setToast(error instanceof Error ? error.message : '数据源删除失败') } }
  return <>
    <FilterGrid onReset={() => { const value = { keyword: '', status: '全部' }; setSearchDraft(value); setFilters(value) }} onSearch={() => setFilters(searchDraft)} actions={<Button variant="primary" icon="plus" onClick={() => navigate('/graphs/sources/new')}>新建数据源</Button>}><Field label="关键词"><input value={searchDraft.keyword} onChange={(event) => setSearchDraft({ ...searchDraft, keyword: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') setFilters(searchDraft) }} placeholder="数据源名称、编码、方式或责任人"/></Field><Field label="状态"><select value={searchDraft.status} onChange={(event) => setSearchDraft({ ...searchDraft, status: event.target.value })}><option>全部</option><option>草稿</option><option>启用</option><option>停用</option><option>异常</option></select></Field></FilterGrid>
    <section className="stats-grid four"><article className="mini-stat"><span>数据源总数</span><strong>{dataSources.length}</strong><small>含草稿、启用和停用</small></article><article className="mini-stat"><span>启用数据源</span><strong>{dataSources.filter((item) => item.status === '启用').length}</strong><small>正常参与数据同步</small></article><article className="mini-stat"><span>异常数据源</span><strong>{dataSources.filter((item) => item.status === '异常').length}</strong><small>需要检查连接或结构</small></article><article className="mini-stat"><span>近期处理数据</span><strong>{records.reduce((sum, item) => sum + item.processed, 0).toLocaleString()}</strong><small>全部数据源同步记录</small></article></section>
    <Panel className="data-access-panel" title="数据源列表" subtitle="数据源可被多个图谱复用，进入详情维护接入配置和字段映射">{loading ? <div className="loading-state"><i/><span>正在加载数据源…</span></div> : filteredSources.length ? <SourceTable data={filteredSources} onSelect={(item) => navigate(`/graphs/sources/${item.id}`)} onTest={test} onToggle={toggle} onDelete={setDeleteTarget}/> : <EmptyState title={dataSources.length ? '未找到数据源' : '暂无数据源'} description={dataSources.length ? '请调整关键词或状态条件。' : '点击“新建数据源”开始配置数据接入。'}/>}</Panel>
    <Modal open={!!deleteTarget} title="删除数据源" description={deleteTarget ? `${deleteTarget.name} · ${deleteTarget.id}` : ''} confirmText="确认删除" danger onClose={() => setDeleteTarget(null)} onConfirm={() => void remove()}><div className="alert-box danger"><Icon name="warning"/><span>仅未启用且没有同步记录的数据源可以删除，元数据和映射草稿将一并清理。</span></div></Modal>
  </>
}

export function DataSourceDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const setToast = useAppStore((state) => state.setToast)
  const [source, setSource] = useState<DataSourceItem | null>(null)
  const [metadata, setMetadata] = useState<SourceMetadataItem[]>([])
  const [mappings, setMappings] = useState<MappingItem[]>([])
  const [ontologyElements, setOntologyElements] = useState<OntologyElement[]>([])
  const [ontologies, setOntologies] = useState<OntologyRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestedTab = searchParams.get('tab') || 'basic'
  const tab = requestedTab === 'mapping' ? 'mapping' : 'basic'
  const requestedOntologyId = searchParams.get('ontologyId') || ''
  const sourceOntologyIds = source?.ontologyIds || []
  const currentOntologyId = requestedOntologyId && sourceOntologyIds.includes(requestedOntologyId) ? requestedOntologyId : sourceOntologyIds[0] || mappings.find((item) => item.type === '节点实例')?.ontologyId || mappings[0]?.ontologyId || 'ONT-PROC'
  const currentOntologyIndex = sourceOntologyIds.indexOf(currentOntologyId)
  const currentOntologyName = ontologies.find((item) => item.id === currentOntologyId)?.name || source?.ontologyNames?.[currentOntologyIndex] || currentOntologyId

  const changeTab = (nextTab: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', nextTab)
    if (nextTab !== 'mapping') next.delete('type')
    setSearchParams(next, { replace: true })
  }
  const load = async () => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      const [sources, ontologyRows] = await Promise.all([dataGraphApi.listSources(), ontologyApi.list()])
      const current = sources.find((item) => item.id === id)
      if (!current) throw new Error('数据源不存在或已被删除')
      const currentOntologyIds = current.ontologyIds || []
      const fallbackOntologyId = currentOntologyIds[0] || ontologyRows.find((item) => item.status === '已发布')?.id || ontologyRows[0]?.id || 'ONT-PROC'
      const ontologyId = requestedOntologyId && currentOntologyIds.includes(requestedOntologyId) ? requestedOntologyId : fallbackOntologyId
      setSource(current)
      setOntologyElements(ontologyRows.find((item) => item.id === ontologyId)?.elements || [])
      setOntologies(ontologyRows)
      const [metadataResult, mappingResult] = await Promise.allSettled([
        dataGraphApi.metadata(id),
        dataGraphApi.mappings(id, undefined, ontologyId),
      ])
      setMetadata(metadataResult.status === 'fulfilled' ? metadataResult.value : [])
      setMappings(mappingResult.status === 'fulfilled' ? mappingResult.value : [])
      const detailErrors = [metadataResult, mappingResult].filter((item) => item.status === 'rejected') as PromiseRejectedResult[]
      if (detailErrors.length) setToast(detailErrors[0].reason instanceof Error ? detailErrors[0].reason.message : '数据源详情部分信息加载失败')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '数据源详情加载失败')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [id, requestedOntologyId])

  const test = async () => {
    if (!source) return
    try { const result = await dataGraphApi.testSource(source.id); setSource(result.source); setToast(result.message) } catch (actionError) { setToast(actionError instanceof Error ? actionError.message : '连接测试失败') }
  }
  const parse = async () => {
    if (!source) return
    try {
      const metadataRows = await dataGraphApi.parseMetadata(source.id, currentOntologyId)
      const mappingRows = await dataGraphApi.mappings(source.id, undefined, currentOntologyId)
      setMetadata(metadataRows)
      setMappings(mappingRows)
      setToast(`元数据解析完成，已生成 ${mappingRows.filter((item) => item.type === '节点实例').length} 条字段映射建议`)
    } catch (actionError) { setToast(actionError instanceof Error ? actionError.message : '元数据解析失败') }
  }
  const validate = async () => {
    if (!source) return false
    try {
      const result = await dataGraphApi.validateMappings(source.id, currentOntologyId)
      setMappings(await dataGraphApi.mappings(source.id, undefined, currentOntologyId))
      setToast(result.message)
      return result.ok
    } catch (actionError) {
      setToast(actionError instanceof Error ? actionError.message : '字段映射校验失败')
      return false
    }
  }
  const completeMapping = async () => {
    if (!source) return
    if (!metadata.length) { setToast('请先解析来源结构并生成字段映射'); return }
    const ok = await validate()
    if (ok) navigate('/graphs/sources')
  }
  const updateMapping = async (row: MappingItem | null, payload: { targetCode: string; sourceField: string; transform: string }) => {
    if (!source) return
    if (row) await dataGraphApi.updateMapping(source.id, row.id, { ontologyId: row.ontologyId, ...payload })
    else await dataGraphApi.createMapping(source.id, { ontologyId: currentOntologyId, ...payload })
    setMappings(await dataGraphApi.mappings(source.id, undefined, row?.ontologyId || currentOntologyId))
    setToast('字段映射已保存，状态已变更为待校验')
  }
  const toggle = async () => {
    if (!source) return
    try { const updated = await dataGraphApi.toggleSource(source.id, source.status !== '启用'); setSource(updated); setToast(updated.status === '启用' ? '数据源已启用' : '数据源已停用') } catch (actionError) { setToast(actionError instanceof Error ? actionError.message : '状态切换失败') }
  }

  if (loading) return <div className="loading-state page-loading"><i/><span>正在加载数据源详情…</span></div>
  if (!source) return <><button className="back-button" onClick={() => navigate('/graphs/sources')}>‹ 返回数据源列表</button><EmptyState title="数据源不可访问" description={error || '请返回数据源列表重新选择。'}/></>

  const targetFields = ontologyElements.filter((item) => item.type === 'property')
  const targetCodes = new Set(targetFields.map((item) => item.code))
  const fieldMappings = mappings.filter((item) => item.type === '节点实例' && targetCodes.has(item.targetCode))
  const validMappings = fieldMappings.filter((item) => item.status === '有效').length
  return <>
    <div className="data-source-detail-header"><div><button className="back-button" onClick={() => navigate('/graphs/sources')}>‹ 返回数据源列表</button><p className="eyebrow">知识图谱 / 数据源详情 / {source.id}</p><h1>{source.name}</h1><div className="editor-meta"><StatusTag>{source.status}</StatusTag><span>{source.mode}</span><span>适用结构：{source.ontologyNames?.join('、') || source.ontologyIds?.join('、') || currentOntologyId}</span><span>责任人：{source.owner}</span><span>最近成功：{source.lastSuccess}</span></div></div><div className="page-actions"><Button onClick={() => void test()}>测试连接</Button><Button variant={source.status === '启用' ? 'danger' : 'primary'} disabled={source.status !== '启用' && validMappings === 0} title={source.status !== '启用' && validMappings === 0 ? '请先解析元数据并完成映射校验' : undefined} onClick={() => void toggle()}>{source.status === '启用' ? '停用数据源' : '启用数据源'}</Button></div></div>
    <Panel className="data-source-detail-panel"><Tabs value={tab} onChange={changeTab} items={[{ key: 'basic', label: '基本配置' }, { key: 'mapping', label: '字段映射', count: fieldMappings.length }]}/>
      {tab === 'basic' && <SourceBasicConfig source={source} currentOntologyId={currentOntologyId} currentOntologyName={currentOntologyName} onMapping={() => changeTab('mapping')}/>}
      {tab === 'mapping' && <div className="semantic-mapping-view"><div className="semantic-mapping-toolbar"><div><strong>字段映射</strong><span>以当前图谱结构字段为主线，匹配数据源解析出的来源字段；实例关系由系统在生成知识图谱时自动构建。</span></div><div className="semantic-mapping-controls"><div className="mapping-structure-readonly"><span>当前图谱结构</span><strong title={currentOntologyName}>{currentOntologyName}</strong><small title={currentOntologyId}>{currentOntologyId}</small></div><Button icon="refresh" onClick={() => void parse()}>{metadata.length ? '重新解析来源结构' : '解析来源结构'}</Button><Button onClick={() => void validate()}>校验字段映射</Button><Button onClick={() => navigate('/graphs/sources')}>取消</Button><Button variant="primary" onClick={() => void completeMapping()}>完成</Button></div></div><SourceMapping source={source} currentOntologyId={currentOntologyId} metadata={metadata} rows={mappings} ontologyElements={ontologyElements} onParse={() => void parse()} onSave={updateMapping}/></div>}
    </Panel>
  </>
}

function SourceBasicConfig({ source, currentOntologyId, currentOntologyName, onMapping }: { source: DataSourceItem; currentOntologyId: string; currentOntologyName: string; onMapping: () => void }) {
  const structureOptions = source.ontologyIds?.length
    ? source.ontologyIds.map((ontologyId, index) => ({ id: ontologyId, name: source.ontologyNames?.[index] || ontologyId }))
    : [{ id: currentOntologyId, name: currentOntologyName }]
  if (!structureOptions.some((item) => item.id === currentOntologyId)) structureOptions.unshift({ id: currentOntologyId, name: currentOntologyName })
  const noop = () => undefined
  return <>
    <div className="step-indicator"><span className="active">1 基本配置</span><span>2 字段映射</span></div>
    <div className="source-basic-navigation"><div><strong>下一步：维护字段映射</strong><span>基本配置保存后，进入字段映射维护来源字段与图谱字段的对应关系。</span></div><Button variant="primary" onClick={onMapping}>进入字段映射</Button></div>
    <div className="form-stack">
      <Field label="适用图谱结构 *"><select value={currentOntologyId} disabled>{structureOptions.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>
      <div className="form-section two-column">
        <Field label="来源系统名称 *"><input value={source.name} disabled placeholder="请输入数据源名称"/></Field>
        <Field label="来源方式"><select value={source.mode} disabled>{sourceModeOptions.map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="责任人"><select value={source.owner} disabled>{[source.owner, '张海', '陈洁'].filter((item, index, rows) => item && rows.indexOf(item) === index).map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="数据范围"><input value={source.range || ''} disabled placeholder="可选，说明对象、时间和组织范围"/></Field>
      </div>
      <AccessConfigFields mode={source.mode} config={source.accessConfig || defaultAccessConfig(source.mode)} readonly onChange={noop}/>
    </div>
  </>
}
function SourceTable({ data, onSelect, onTest, onToggle, onDelete }: { data: DataSourceItem[]; onSelect: (item: DataSourceItem) => void; onTest: (item: DataSourceItem) => void; onToggle: (item: DataSourceItem) => void; onDelete: (item: DataSourceItem) => void }) {
  return <div className="table-container"><table><thead><tr><th>来源名称 / 编码</th><th>适用图谱结构</th><th>来源方式</th><th>责任人</th><th>最近成功</th><th>状态</th><th>操作</th></tr></thead><tbody>{data.map((item) => <tr key={item.id}><td><button className="table-link title-cell" onClick={() => onSelect(item)}><strong>{item.name}</strong><span>{item.id}</span></button></td><td>{item.ontologyNames?.join('、') || item.ontologyIds?.join('、') || '未配置'}</td><td>{item.mode}</td><td>{item.owner}</td><td>{item.lastSuccess}</td><td><StatusTag>{item.status}</StatusTag></td><td><div className="row-actions"><button onClick={() => onSelect(item)}>进入详情</button><button onClick={() => onTest(item)}>测试</button><button onClick={() => onToggle(item)}>{item.status === '启用' ? '停用' : '启用'}</button>{item.status !== '启用' && <button className="danger-link" onClick={() => onDelete(item)}>删除</button>}</div></td></tr>)}</tbody></table></div>
}

function SourceMapping({ source, currentOntologyId, metadata, rows, ontologyElements, onParse, onSave }: { source: DataSourceItem; currentOntologyId: string; metadata: SourceMetadataItem[]; rows: MappingItem[]; ontologyElements: OntologyElement[]; onParse: () => void; onSave: (row: MappingItem | null, payload: { targetCode: string; sourceField: string; transform: string }) => Promise<void> }) {
  const setToast = useAppStore((state) => state.setToast)
  const [editing, setEditing] = useState<{ field: OntologyElement; mapping: MappingItem | null } | null>(null)
  const [draft, setDraft] = useState({ sourceField: '', transform: '' })
  const [saving, setSaving] = useState(false)
  const targetFields = ontologyElements.filter((item) => item.type === 'property')
  const sourceFields = [...new Set(metadata.flatMap((item) => item.fields?.length ? item.fields : [`${item.tableName}.id`, `${item.tableName}.name`, `${item.tableName}.code`]))]
  const fieldMappings = rows.filter((row) => row.type === '节点实例')
  const mappingByTarget = new Map(fieldMappings.map((row) => [row.targetCode, row]))
  const mappedCount = targetFields.filter((field) => mappingByTarget.has(field.code)).length
  const validCount = targetFields.filter((field) => mappingByTarget.get(field.code)?.status === '有效').length
  const requiredCount = targetFields.filter((field) => /必填|主标识/.test(field.constraint || '')).length
  const openEditor = (field: OntologyElement, mapping: MappingItem | null) => {
    setEditing({ field, mapping })
    setDraft({ sourceField: mapping?.sourceField || sourceFields[0] || '', transform: mapping?.transform || '直接映射' })
  }
  const save = async () => {
    if (!editing) return
    if (!draft.sourceField) { setToast('请选择来源字段'); return }
    if (!draft.transform.trim()) { setToast('请输入转换与识别规则'); return }
    setSaving(true)
    try {
      await onSave(editing.mapping, { targetCode: editing.field.code, sourceField: draft.sourceField, transform: draft.transform.trim() })
      setEditing(null)
    } catch (error) {
      setToast(error instanceof Error ? error.message : '映射保存失败')
    } finally {
      setSaving(false)
    }
  }
  if (!targetFields.length) return <EmptyState title="暂无图谱字段" description="当前图谱结构还没有属性字段，请先在图谱结构中维护字段后再配置数据源映射。"/>
  if (!metadata.length) return <EmptyState title="尚未解析来源结构" description="请先解析来源结构，系统会读取来源字段并生成字段映射建议。" action={<Button variant="primary" icon="refresh" onClick={onParse}>解析来源结构并生成字段映射</Button>}/>
  return <>
    <div className="mapping-header"><div><span>当前字段映射</span><strong>{source.name}</strong><small>{source.id} + {currentOntologyId} · 图谱字段匹配来源字段</small></div><div className="mapping-status-summary"><span>字段覆盖</span><strong>{mappedCount}/{targetFields.length} · 有效 {validCount}</strong><small>必填字段 {requiredCount} 个 · 最近校验 {fieldMappings[0]?.lastValidatedAt || '—'}</small></div></div>
    <div className="alert-box"><Icon name="graph"/><span>字段映射只处理来源字段到图谱字段的对应关系；实例之间的关系会在生成知识图谱时根据图谱结构和业务键自动构建。</span></div>
    <Panel className="mapping-detail-panel" title="映射明细" subtitle="逐条修改转换规则和目标图谱字段；保存后需要重新校验字段映射">
      <div className="table-container mapping-detail-table"><table><thead><tr><th>图谱字段</th><th>字段要求</th><th>来源字段</th><th>转换规则</th><th>状态</th><th>操作</th></tr></thead><tbody>{targetFields.map((field) => { const mapping = mappingByTarget.get(field.code) || null; const required = /必填|主标识/.test(field.constraint || ''); return <tr key={field.id}><td><strong>{field.name}</strong><small className="cell-sub">{field.code}</small></td><td>{field.dataType}<small className="cell-sub">{field.constraint || (required ? '必填' : '可选')}</small></td><td>{mapping?.sourceField || <span className="muted-text">未匹配</span>}</td><td>{mapping?.transform || <span className="muted-text">—</span>}</td><td><StatusTag>{mapping?.status || (required ? '待配置' : '可选')}</StatusTag></td><td><div className="row-actions"><button onClick={() => openEditor(field, mapping)}>{mapping ? '编辑' : '配置'}</button></div></td></tr> })}</tbody></table></div>
    </Panel>
    <Drawer open={!!editing} title="编辑字段映射" eyebrow="字段映射" onClose={() => { if (!saving) setEditing(null) }} footer={<><Button disabled={saving} onClick={() => setEditing(null)}>取消</Button><Button variant="primary" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存映射'}</Button></>}>
      {editing && <div className="form-stack mapping-edit-form"><KeyValue items={[{ label: '图谱字段', value: `${editing.field.name} · ${editing.field.code}` }, { label: '字段要求', value: `${editing.field.dataType}${editing.field.constraint ? ` · ${editing.field.constraint}` : ''}` }, { label: '所属图谱结构', value: currentOntologyId }, { label: '当前状态', value: <StatusTag>{editing.mapping?.status || '待配置'}</StatusTag> }]}/><Field label="来源字段 *"><select value={draft.sourceField} onChange={(event) => setDraft({ ...draft, sourceField: event.target.value })}><option value="">请选择来源字段</option>{sourceFields.map((field) => <option key={field} value={field}>{field}</option>)}</select></Field><Field label="转换与识别规则 *"><textarea value={draft.transform} onChange={(event) => setDraft({ ...draft, transform: event.target.value })} placeholder="例如：trim + uppercase"/></Field><div className="alert-box"><Icon name="warning"/><span>修改字段映射会影响后续使用该数据源生成的知识图谱；保存后状态将变为“待校验”。</span></div></div>}
    </Drawer>
  </>
}

export function GraphManagementPage() {
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const pathTab = location.pathname.startsWith('/graphs/sources') ? 'sources' : location.pathname.startsWith('/graphs/structures') ? 'structures' : ''
  const requestedTab = pathTab || searchParams.get('tab') || 'structures'
  const tab = ['structures', 'sources'].includes(requestedTab) ? requestedTab : 'structures'
  const isSources = tab === 'sources'

  return <>
    <PageHeader eyebrow={`知识图谱 / ${isSources ? '数据源' : '图谱结构'}`} title={isSources ? '数据源' : '图谱结构'} description={isSources ? '维护数据源接入、来源结构解析和字段映射模板。' : '维护知识图谱中的类、属性和关系定义。'}/>
    <Panel className="graph-management-panel">{isSources ? <div className="embedded-data-access"><DataAccessPage/></div> : <div className="embedded-graph-structure"><GraphStructureListPage embedded/></div>}</Panel>
  </>
}


export function UsersPage() {
  const users = useAppStore((state) => state.users)
  const roles = useAppStore((state) => state.roles)
  const createUser = useAppStore((state) => state.createUser)
  const updateUser = useAppStore((state) => state.updateUser)
  const deleteUser = useAppStore((state) => state.deleteUser)
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
  const [deleteTarget, setDeleteTarget] = useState<UserItem | null>(null)
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
  const removeUser = () => { if (!deleteTarget) return; const result = deleteUser(deleteTarget.id); setToast(result.message); if (result.ok) setDeleteTarget(null) }
  return <>
    <PageHeader eyebrow="系统管理 / 用户与组织" title="用户与组织" description="同步或维护组织、用户、岗位和账号状态，停用前完成未办任务转派。" actions={<><Button onClick={() => setToast('组织用户同步任务已创建')}>同步组织用户</Button><Button variant="primary" icon="plus" onClick={() => setCreateUserOpen(true)}>新建用户</Button></>}/>
    <section className="users-layout"><Panel title="组织树" className="organization-panel"><input placeholder="搜索组织"/><div className="org-tree">{['中国电子云','集团监管部','采购管理部','财务共享中心','数据管理部','审计纪检部'].map((name, index) => <button key={name} className={`${org === name ? 'active' : ''} ${index ? 'child' : ''}`} onClick={() => setOrg(name)}><Icon name={index ? 'graph' : 'home'} size={15}/><span>{name}</span><small>{index ? users.filter((user) => user.organization === name).length : users.length}</small></button>)}</div></Panel><Panel title={org} subtitle={`${rows.length} 名用户`} className="user-list-panel"><FilterGrid onReset={() => { setKeyword(''); setStatus('全部') }} onSearch={() => setToast(`查询到${rows.length}名用户`)}><Field label="关键词"><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="姓名、账号或人员编码"/></Field><Field label="账号状态"><select value={status} onChange={(event) => setStatus(event.target.value)}><option>全部</option><option>启用</option><option>锁定</option><option>停用</option></select></Field></FilterGrid><div className="table-container"><table><thead><tr><th>姓名 / 账号</th><th>所属组织 / 岗位</th><th>当前角色</th><th>状态</th><th>未完成待办</th><th>最后登录</th><th>操作</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td><button className="table-link title-cell" onClick={() => openUser(item)}><strong>{item.name}</strong><span>{item.account} · {item.id}</span></button></td><td>{item.organization}<small className="cell-sub">{item.position}</small></td><td>{item.roles.map((role) => <StatusTag key={role}>{role}</StatusTag>)}</td><td><StatusTag>{item.status}</StatusTag></td><td><button className={item.todos ? 'count-link' : ''} onClick={() => item.todos && setTransferTarget(item)}>{item.todos}</button></td><td>{item.lastLogin}</td><td><div className="row-actions"><button onClick={() => openUser(item)}>查看</button><button disabled={!item.todos} onClick={() => setTransferTarget(item)}>转派</button>{item.lastLogin === '从未登录' && item.todos === 0 && <button className="danger-link" onClick={() => setDeleteTarget(item)}>删除</button>}</div></td></tr>)}</tbody></table></div></Panel></section>
    <Drawer open={!!selected} title={selected?.name || ''} eyebrow="用户详情" onClose={() => setSelected(null)} footer={<><Button onClick={() => setSelected(null)}>关闭</Button><Button variant="primary" onClick={save}>保存</Button></>}><KeyValue items={[{ label: '账号', value: selected?.account }, { label: '人员编码', value: selected?.id }, { label: '所属组织', value: selected?.organization }, { label: '岗位', value: selected?.position }, { label: '未完成待办', value: `${selected?.todos || 0} 项` }, { label: '最后登录', value: selected?.lastLogin }]}/><Panel title="账号状态" className="drawer-section"><Field label="状态"><select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value as UserItem['status'])}><option>启用</option><option>锁定</option><option>停用</option></select></Field></Panel><Panel title="角色分配" className="drawer-section"><div className="check-grid vertical">{['监管负责人','领域监管专员','业务责任人','图谱结构管理员','数据管理员'].map((role) => <label key={role}><input type="checkbox" checked={selectedRoles.includes(role)} onChange={() => setSelectedRoles((value) => value.includes(role) ? value.filter((item) => item !== role) : [...value, role])}/><span>{role}</span></label>)}</div></Panel>{selected && selected.todos > 0 && selectedStatus === '停用' && <div className="alert-box danger"><Icon name="warning"/><span>该用户存在{selected.todos}项未完成待办，停用前必须完成转派。</span></div>}</Drawer>
    <Modal open={!!transferTarget} title="批量转派未完成待办" description={transferTarget ? `${transferTarget.name} · ${transferTarget.todos}项待办` : ''} confirmText="确认转派" danger onClose={() => setTransferTarget(null)} onConfirm={submitTransfer}><div className="form-stack"><Field label="接收人 *"><select value={transfer.owner} onChange={(event) => setTransfer({ ...transfer, owner: event.target.value })}><option>李华</option><option>王宁</option><option>周航</option><option>孙凯</option></select></Field><Field label="转派原因"><textarea value={transfer.reason} onChange={(event) => setTransfer({ ...transfer, reason: event.target.value })} placeholder="可选，说明离岗、调岗或职责调整原因"/></Field></div></Modal>
    <Modal open={createUserOpen} title="新建用户" description="创建本地用户后，可在用户详情中继续调整角色和账号状态。" confirmText="确认创建" onClose={() => setCreateUserOpen(false)} onConfirm={submitUser}><div className="form-stack"><div className="form-section two-column"><Field label="姓名 *"><input value={userForm.name} onChange={(event) => setUserForm({ ...userForm, name: event.target.value })} placeholder="请输入用户姓名"/></Field><Field label="登录账号 *"><input value={userForm.account} onChange={(event) => setUserForm({ ...userForm, account: event.target.value })} placeholder="例如 zhangsan"/></Field><Field label="所属组织 *"><select value={userForm.organization} onChange={(event) => setUserForm({ ...userForm, organization: event.target.value })}>{['集团监管部','采购管理部','财务共享中心','数据管理部','审计纪检部'].map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="岗位"><input value={userForm.position} onChange={(event) => setUserForm({ ...userForm, position: event.target.value })} placeholder="例如 采购监管专员"/></Field><Field label="初始角色"><select value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value })}><option value="">暂不分配</option>{roles.map((item) => <option value={item.name} key={item.id}>{item.name}</option>)}</select></Field><Field label="账号状态"><select value={userForm.status} onChange={(event) => setUserForm({ ...userForm, status: event.target.value as UserItem['status'] })}><option>启用</option><option>锁定</option><option>停用</option></select></Field></div></div></Modal>
    <Modal open={!!deleteTarget} title="删除未登录用户" description={deleteTarget ? `${deleteTarget.name} · ${deleteTarget.account}` : ''} confirmText="确认删除" danger onClose={() => setDeleteTarget(null)} onConfirm={removeUser}><div className="alert-box danger"><Icon name="warning"/><span>仅从未登录且没有未完成待办的新增用户可以删除；已有活动记录的账号请使用停用。</span></div></Modal>
  </>
}


export function RolesPage() {
  const roles = useAppStore((state) => state.roles)
  const createRole = useAppStore((state) => state.createRole)
  const updateRole = useAppStore((state) => state.updateRole)
  const deleteRole = useAppStore((state) => state.deleteRole)
  const setToast = useAppStore((state) => state.setToast)
  const [selectedId, setSelectedId] = useState(roles[0]?.id || '')
  const selected = roles.find((item) => item.id === selectedId) || roles[0]
  const [permissions, setPermissions] = useState<string[]>(normalizePermissionCodes(selected?.permissions || []))
  const [tab, setTab] = useState('menu')
  const [confirm, setConfirm] = useState(false)
  const [createRoleOpen, setCreateRoleOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [roleForm, setRoleForm] = useState({ name: '', id: '', scope: '当前组织' })
  const selectRole = (item: RoleItem) => { setSelectedId(item.id); setPermissions(normalizePermissionCodes(item.permissions)) }
  const toggle = (permission: string) => setPermissions((value) => value.includes(permission) ? value.filter((item) => item !== permission) : [...value, permission])
  const save = () => { if (!selected) return; const result = updateRole(selected.id, permissions); setToast(result.message); if (result.ok) setConfirm(false) }
  const removeRole = () => {
    if (!selected) return
    const result = deleteRole(selected.id)
    setToast(result.message)
    if (!result.ok) return
    const next = roles.find((item) => item.id !== selected.id)
    setSelectedId(next?.id || '')
    setPermissions(normalizePermissionCodes(next?.permissions || []))
    setDeleteOpen(false)
  }
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
    <section className="role-layout"><Panel title="角色列表" className="role-list"><input placeholder="搜索角色名称或编码"/>{roles.map((item) => <button key={item.id} className={selected.id === item.id ? 'active' : ''} onClick={() => selectRole(item)}><div><strong>{item.name}</strong><span>{item.id} · {item.type}</span></div><small>{item.users}人</small><StatusTag>{item.status}</StatusTag></button>)}</Panel><Panel className="permission-panel"><div className="selected-role-header"><div><p className="eyebrow">当前角色</p><h2>{selected.name}</h2><span>{selected.id} · {selected.type}角色 · {selected.users}名用户</span></div><div><Button onClick={() => setToast(`当前调整${permissions.length}项权限，原配置${normalizePermissionCodes(selected.permissions).length}项`)}>查看变更</Button>{selected.type === '自定义' && selected.users === 0 && <Button variant="danger" onClick={() => setDeleteOpen(true)}>删除角色</Button>}<Button variant="primary" onClick={() => setConfirm(true)}>保存权限</Button></div></div><Tabs value={tab} onChange={setTab} items={[{ key: 'menu', label: '菜单与按钮' }, { key: 'org', label: '组织数据' }, { key: 'field', label: '字段属性' }, { key: 'relation', label: '关系权限' }, { key: 'evidence', label: '证据权限' }, { key: 'danger', label: '高危操作' }]}/><PermissionEditor tab={tab} role={selected} permissions={permissions} onToggle={toggle}/></Panel></section>
    <Modal open={confirm} title="保存角色权限" description={`${selected.name} · 权限调整将立即影响 ${selected.users} 名用户`} confirmText="确认保存" danger onClose={() => setConfirm(false)} onConfirm={save}><div className="alert-box danger"><Icon name="warning"/><span>服务端将重新计算菜单、按钮、字段、关系和证据权限，当前在线用户可能需要刷新页面。</span></div></Modal>
    <Modal open={createRoleOpen} title="新建角色" description="先创建角色草稿，再为其配置菜单、数据和高危操作权限。" confirmText="创建并配置权限" onClose={() => setCreateRoleOpen(false)} onConfirm={submitRole}><div className="form-stack"><Field label="角色名称 *"><input value={roleForm.name} onChange={(event) => setRoleForm({ ...roleForm, name: event.target.value })} placeholder="例如 合同监管专员"/></Field><Field label="角色编码 *"><input value={roleForm.id} onChange={(event) => setRoleForm({ ...roleForm, id: event.target.value.toUpperCase() })} placeholder="例如 ROLE_CONTRACT_AUDITOR"/></Field><Field label="数据范围"><select value={roleForm.scope} onChange={(event) => setRoleForm({ ...roleForm, scope: event.target.value })}><option>当前组织</option><option>当前组织及授权下级</option><option>全部组织</option></select></Field></div></Modal>
    <Modal open={deleteOpen} title="删除自定义角色" description={`${selected.name} · ${selected.id}`} confirmText="确认删除" danger onClose={() => setDeleteOpen(false)} onConfirm={removeRole}><div className="alert-box danger"><Icon name="warning"/><span>仅无人使用的自定义角色可以删除；预置角色和已分配用户的角色必须保留。</span></div></Modal>
  </>
}

function PermissionEditor({ tab, role, permissions, onToggle }: { tab: string; role: RoleItem; permissions: string[]; onToggle: (value: string) => void }) {
  const normalized = new Set(normalizePermissionCodes(permissions))
  if (tab === 'org') return <div className="detail-grid"><Panel title="数据范围"><div className="radio-list"><label><input type="radio" name="scope" defaultChecked/>当前组织</label><label><input type="radio" name="scope"/>当前组织及授权下级</label><label><input type="radio" name="scope"/>自定义组织节点</label></div></Panel><Panel title="授权摘要"><KeyValue items={[{ label: '当前范围', value: role.scope }, { label: '组织节点', value: '12个' }, { label: '监管领域', value: '采购、合同、财务' }]}/></Panel></div>
  if (tab === 'field') return <div className="table-container"><table><thead><tr><th>图谱结构类 / 字段</th><th>敏感等级</th><th>明文</th><th>脱敏</th><th>隐藏</th></tr></thead><tbody>{[['人员','证件号码','强敏感'],['账户','银行账号','强敏感'],['合同','合同金额','敏感'],['供应商','联系电话','敏感']].map((row, index) => <tr key={row[1]}><td><strong>{row[0]}</strong><small className="cell-sub">{row[1]}</small></td><td><StatusTag>{row[2]}</StatusTag></td><td><input type="radio" name={`field-${index}`}/></td><td><input type="radio" name={`field-${index}`} defaultChecked/></td><td><input type="radio" name={`field-${index}`}/></td></tr>)}</tbody></table></div>
  if (tab === 'menu') return <div className="permission-tree">{MENU_PERMISSION_CATALOG.map((item) => <div key={item.code}><label><input type="checkbox" checked={normalized.has(item.code)} onChange={() => onToggle(item.code)}/><span>{item.label}</span></label><div className="permission-buttons"><label><input type="checkbox" checked={normalized.has(item.code)} onChange={() => onToggle(item.code)}/>查看</label><small>{item.group}</small></div></div>)}</div>
  const visible = tab === 'danger'
    ? ACTION_PERMISSION_CATALOG
    : tab === 'relation'
      ? [...MENU_PERMISSION_CATALOG.filter((item) => item.code.includes('risk') || item.code.includes('ontology')), ACTION_PERMISSION_CATALOG.find((item) => item.code === 'action.graph.entity_govern')!]
      : [...MENU_PERMISSION_CATALOG.filter((item) => item.code.includes('risk') || item.code === 'menu.system.audit')]
  return <div className={tab === 'danger' ? 'danger-permissions' : 'check-grid permission-cards'}>{visible.map((item) => <label key={item.code}><div><Icon name={tab === 'danger' ? 'lock' : 'shield'}/><span>{PERMISSION_LABEL_BY_CODE[item.code] || item.label}</span></div><input type="checkbox" checked={normalized.has(item.code)} onChange={() => onToggle(item.code)}/></label>)}</div>
}
type ModelItem = {
  id: string
  name: string
  domain: string
  source: '平台预置' | '客户自有'
  provider: string
  capability: string
  description: string
  tags: string[]
  sceneBindings: string[]
  status: '启用' | '待接入' | '停用'
  calls: number
  owner: string
  updatedAt: string
  endpoint?: string
}

type TrialMessage = { role: 'assistant' | 'user'; text: string }

const modelCatalogSeed: ModelItem[] = [
  { id: 'VM-PRE-001', name: '招投标专家模型', domain: '招投标', source: '平台预置', provider: '中国电子云预置', capability: '标书撰写、资格审查、围串标线索识别', description: '面向招标文件生成、投标文件结构化审查和评标辅助问答，适合在招投标应用与风险研判中调用。', tags: ['标书生成', '资格审查', '围串标识别'], sceneBindings: ['供应商与评审人员关系异常', '投标文件雷同异常', '资格条件异常放宽'], status: '启用', calls: 42, owner: '采购应用中心', updatedAt: '今天 09:20' },
  { id: 'VM-PRE-002', name: '合同审查模型', domain: '合同', source: '平台预置', provider: '中国电子云预置', capability: '合同条款抽取、差异对比、风险条款提示', description: '用于合同智能审查、条款比对、归档抽取，可在合同金额异常、条款缺失等场景中复用。', tags: ['条款抽取', '合同对比', '风险提示'], sceneBindings: ['合同关键条款缺失', '合同金额与中标结果不一致'], status: '启用', calls: 35, owner: '合同应用组', updatedAt: '今天 08:50' },
  { id: 'VM-PRE-003', name: '采购制度问答模型', domain: '制度合规', source: '平台预置', provider: '中国电子云预置', capability: '制度问答、条款定位、依据引用', description: '帮助业务人员查询采购制度、流程要求和审批口径，默认作为全局知识助手。', tags: ['制度问答', '条款定位', '依据引用'], sceneBindings: ['采购方式选择不合规'], status: '启用', calls: 28, owner: '制度运营组', updatedAt: '昨天 18:10' },
  { id: 'VM-PRE-004', name: '供应商风险模型', domain: '供应商', source: '平台预置', provider: '中国电子云预置', capability: '供应商画像、关联关系、异常行为解释', description: '面向供应商准入、评价、黑白名单和关系穿透，适合在供应商类风险场景中调用。', tags: ['供应商画像', '关系穿透', '异常解释'], sceneBindings: ['供应商与评审人员关系异常', '供应商频繁陪标', '供应商资质异常'], status: '启用', calls: 31, owner: '供应商管理组', updatedAt: '今天 10:05' },
  { id: 'VM-PRE-005', name: '履约验收模型', domain: '履约验收', source: '平台预置', provider: '中国电子云预置', capability: '验收材料核验、进度偏差解释、交付风险提示', description: '用于采购履约、到货验收、服务验收和整改跟踪，可增强事件研判说明。', tags: ['验收核验', '进度偏差', '交付风险'], sceneBindings: ['验收时间异常提前', '履约进度长期滞后'], status: '启用', calls: 24, owner: '履约管理组', updatedAt: '昨天 16:30' },
  { id: 'VM-PRE-006', name: '财务付款模型', domain: '财务付款', source: '平台预置', provider: '中国电子云预置', capability: '付款节点核对、票据一致性、支付风险说明', description: '支撑付款前审查、合同付款条件匹配和票据要素核验，适合与付款异常场景绑定。', tags: ['付款核对', '票据一致性', '支付风险'], sceneBindings: ['未验收先付款', '付款金额超合同约定'], status: '启用', calls: 26, owner: '财务共享中心', updatedAt: '今天 07:45' },
  { id: 'VM-PRE-007', name: '审计纪检模型', domain: '审计纪检', source: '平台预置', provider: '中国电子云预置', capability: '线索摘要、审计问答、处置建议生成', description: '面向审计纪检线索归纳、证据摘要和处置建议，支持按审计专题调用。', tags: ['线索摘要', '审计问答', '处置建议'], sceneBindings: ['重大风险处置复核'], status: '启用', calls: 18, owner: '审计纪检部', updatedAt: '07-26 17:10' },
  { id: 'VM-PRE-008', name: '数据治理模型', domain: '数据治理', source: '平台预置', provider: '中国电子云预置', capability: '字段含义解释、映射建议、质量问题归因', description: '服务数据接入、图谱映射和字段治理，更适合作为平台管理助手。', tags: ['字段解释', '映射建议', '质量归因'], sceneBindings: ['数据源质量异常'], status: '启用', calls: 17, owner: '数据管理部', updatedAt: '07-26 11:40' },
  { id: 'VM-PRE-009', name: '法务合规模型', domain: '法务合规', source: '平台预置', provider: '中国电子云预置', capability: '法规适配、合规风险提示、争议条款解释', description: '用于采购、合同和招投标中的法律合规辅助判断，可服务高风险合同审查。', tags: ['法规适配', '合规提示', '争议解释'], sceneBindings: ['高风险合同条款审查'], status: '启用', calls: 14, owner: '法务合规组', updatedAt: '07-25 15:18' },
  { id: 'VM-PRE-010', name: '项目管理模型', domain: '项目管理', source: '平台预置', provider: '中国电子云预置', capability: '计划拆解、里程碑跟踪、延期原因分析', description: '辅助采购项目计划、里程碑和交付进度管理，适合项目延期、履约异常类场景。', tags: ['计划拆解', '里程碑', '延期分析'], sceneBindings: ['采购项目进度异常'], status: '启用', calls: 13, owner: '项目管理组', updatedAt: '07-25 09:55' },
  { id: 'VM-CUS-001', name: '集团预算测算模型', domain: '预算', source: '客户自有', provider: '集团财务模型服务', capability: '预算测算、价格区间解释、历史项目对标', description: '客户已有模型，可通过 API 接入后在采购预算、方案编制和价格审查中调用。', tags: ['预算测算', '价格对标', 'API接入'], sceneBindings: ['预算价格明显偏离历史区间'], status: '启用', calls: 20, owner: '财务共享中心', updatedAt: '今天 10:30', endpoint: 'https://model.example.com/budget' },
  { id: 'VM-CUS-002', name: '供应商画像私有模型', domain: '供应商', source: '客户自有', provider: '供应商主数据平台', capability: '画像标签、历史合作摘要、履约评分说明', description: '对接客户供应商主数据标签，当前处于安全评估和字段脱敏配置阶段。', tags: ['私有画像', '脱敏字段', '接入评估'], sceneBindings: [], status: '待接入', calls: 12, owner: '供应商管理组', updatedAt: '今天 09:05', endpoint: 'https://model.example.com/supplier-profile' },
  { id: 'VM-CUS-003', name: '地方政策问答模型', domain: '政策', source: '客户自有', provider: '区域政策知识库', capability: '地方采购政策问答、区域差异解释', description: '用于补充地方政策口径，适合先作为通用问答模型接入。', tags: ['地方政策', '区域差异', '知识库接入'], sceneBindings: [], status: '待接入', calls: 6, owner: '制度运营组', updatedAt: '07-24 14:22', endpoint: 'https://model.example.com/policy' },
]

const defaultModelForm = { name: '', domain: '采购', provider: '', capability: '', endpoint: '', owner: '采购应用中心', tags: '客户自有,API接入' }
const fallbackSceneOptions = ['供应商与评审人员关系异常', '投标文件雷同异常', '合同关键条款缺失', '未验收先付款', '采购方式选择不合规', '预算价格明显偏离历史区间']

function buildModelAnswer(model: ModelItem, question: string) {
  const bindingText = model.sceneBindings.length ? `当前已绑定${model.sceneBindings.length}个场景：${model.sceneBindings.slice(0, 3).join('、')}。` : '当前未绑定风险场景，可作为通用能力调用。'
  if (/绑定|场景|风险/.test(question)) return `${model.name}适用于${model.domain}领域，${bindingText}如果用于风险研判，建议在场景中明确输入字段、输出结论和证据引用口径。`
  if (/能力|能做|支持/.test(question)) return `${model.name}的核心能力是：${model.capability}。当前状态为${model.status}，调用方可以按权限在采购应用或监管页面中发起测试。`
  if (/接入|接口|API|api/.test(question)) return `${model.name}由${model.provider}提供，接入状态为${model.status}。正式接入时需要校验鉴权、输入输出Schema、超时回退和调用审计。`
  return `${model.name}已收到测试：“${question}”。基于当前模型目录，它属于${model.domain}领域，建议优先用于“${model.tags.slice(0, 2).join('、')}”相关任务。${bindingText}`
}

export function ModelManagementPage() {
  const scenes = useAppStore((state) => state.scenes)
  const setToast = useAppStore((state) => state.setToast)
  const [models, setModels] = useState<ModelItem[]>(modelCatalogSeed)
  const [filters, setFilters] = useState({ keyword: '', source: '全部', status: '全部', binding: '全部' })
  const [selectedId, setSelectedId] = useState('')
  const [bindingTargetId, setBindingTargetId] = useState('')
  const [bindingDraft, setBindingDraft] = useState<string[]>([])
  const [sceneSearch, setSceneSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState(defaultModelForm)
  const [trialModelId, setTrialModelId] = useState('')
  const [trialInput, setTrialInput] = useState('')
  const [trialMessages, setTrialMessages] = useState<TrialMessage[]>([])
  const [syncedAt, setSyncedAt] = useState('今天 10:40')
  const sceneOptions = useMemo(() => Array.from(new Set([...scenes.map((item) => item.name), ...models.flatMap((item) => item.sceneBindings), ...fallbackSceneOptions])), [scenes, models])
  const filteredSceneOptions = useMemo(() => {
    const keyword = sceneSearch.trim().toLowerCase()
    return keyword ? sceneOptions.filter((scene) => scene.toLowerCase().includes(keyword)) : sceneOptions
  }, [sceneOptions, sceneSearch])
  const selectedFilteredSceneCount = filteredSceneOptions.filter((scene) => bindingDraft.includes(scene)).length
  const rows = useMemo(() => models.filter((item) => {
    if (filters.keyword && !`${item.name}${item.domain}${item.capability}${item.tags.join('')}`.toLowerCase().includes(filters.keyword.toLowerCase())) return false
    if (filters.source !== '全部' && item.source !== filters.source) return false
    if (filters.status !== '全部' && item.status !== filters.status) return false
    if (filters.binding === '已绑定' && item.sceneBindings.length === 0) return false
    if (filters.binding === '未绑定' && item.sceneBindings.length > 0) return false
    return true
  }), [models, filters])
  const selected = models.find((item) => item.id === selectedId) || null
  const bindingTarget = models.find((item) => item.id === bindingTargetId) || null
  const trialModel = models.find((item) => item.id === trialModelId) || null
  const presetCount = models.filter((item) => item.source === '平台预置').length
  const customerCount = models.filter((item) => item.source === '客户自有').length
  const runningCount = models.filter((item) => item.status === '启用').length
  const bindingCount = models.reduce((sum, item) => sum + item.sceneBindings.length, 0)
  const callCount = models.reduce((sum, item) => sum + item.calls, 0)
  const reset = () => setFilters({ keyword: '', source: '全部', status: '全部', binding: '全部' })
  const syncModels = () => {
    setModels((items) => items.map((item) => item.status === '待接入' ? { ...item, status: '启用', updatedAt: '刚刚' } : { ...item, updatedAt: item.source === '平台预置' ? '刚刚' : item.updatedAt }))
    setSyncedAt('刚刚')
    setToast('模型目录已同步，待接入模型已启用')
  }
  const openBinding = (model: ModelItem) => {
    setSelectedId('')
    setBindingTargetId(model.id)
    setBindingDraft(model.sceneBindings)
    setSceneSearch('')
  }
  const toggleBindingScene = (scene: string) => setBindingDraft((items) => items.includes(scene) ? items.filter((item) => item !== scene) : [...items, scene])
  const selectFilteredScenes = () => {
    if (filteredSceneOptions.length === 0) return
    setBindingDraft((items) => Array.from(new Set([...items, ...filteredSceneOptions])))
  }
  const clearFilteredScenes = () => {
    if (filteredSceneOptions.length === 0) return
    setBindingDraft((items) => items.filter((item) => !filteredSceneOptions.includes(item)))
  }
  const saveBinding = () => {
    if (!bindingTarget) return
    setModels((items) => items.map((item) => item.id === bindingTarget.id ? { ...item, sceneBindings: bindingDraft, updatedAt: '刚刚' } : item))
    setBindingTargetId('')
    setSceneSearch('')
    setToast(bindingDraft.length ? `${bindingTarget.name} 已绑定 ${bindingDraft.length} 个场景` : `${bindingTarget.name} 已取消场景绑定`)
  }
  const openTrial = (model: ModelItem) => {
    setSelectedId('')
    setTrialModelId(model.id)
    setTrialInput('')
    setTrialMessages([{ role: 'assistant', text: `已连接${model.name}，可以测试能力、接入状态或场景绑定。` }])
  }
  const sendTrialQuestion = () => {
    if (!trialModel) return
    const question = trialInput.trim()
    if (!question) { setToast('请输入测试内容'); return }
    const answer = buildModelAnswer(trialModel, question)
    setTrialMessages((items) => [...items, { role: 'user', text: question }, { role: 'assistant', text: answer }])
    setModels((items) => items.map((item) => item.id === trialModel.id ? { ...item, calls: item.calls + 1, updatedAt: '刚刚' } : item))
    setTrialInput('')
  }
  const toggleModelStatus = (model: ModelItem) => {
    const nextStatus: ModelItem['status'] = model.status === '停用' || model.status === '待接入' ? '启用' : '停用'
    setModels((items) => items.map((item) => item.id === model.id ? { ...item, status: nextStatus, updatedAt: '刚刚' } : item))
    setToast(`${model.name} 已${nextStatus === '停用' ? '停用' : '启用'}`)
  }
  const submitModel = () => {
    if (!createForm.name.trim() || !createForm.provider.trim() || !createForm.capability.trim()) { setToast('请填写模型名称、提供方和核心能力'); return }
    const tags = createForm.tags.split(/[、,，\s]+/).map((item) => item.trim()).filter(Boolean).slice(0, 5)
    let index = models.filter((item) => item.source === '客户自有').length + 1
    let id = `VM-CUS-${String(index).padStart(3, '0')}`
    while (models.some((item) => item.id === id)) { index += 1; id = `VM-CUS-${String(index).padStart(3, '0')}` }
    const nextModel: ModelItem = { id, name: createForm.name.trim(), domain: createForm.domain, source: '客户自有', provider: createForm.provider.trim(), capability: createForm.capability.trim(), description: `${createForm.provider.trim()}接入的客户自有模型，已纳入模型目录，待完成接入校验、授权和场景绑定。`, tags: tags.length ? tags : ['客户自有'], sceneBindings: [], status: '待接入', calls: 0, owner: createForm.owner.trim() || '采购应用中心', updatedAt: '刚刚', endpoint: createForm.endpoint.trim() || undefined }
    setModels((items) => [nextModel, ...items])
    setCreateOpen(false)
    setCreateForm(defaultModelForm)
    setFilters({ keyword: nextModel.name, source: '全部', status: '全部', binding: '全部' })
    setSelectedId(nextModel.id)
    setToast(`${nextModel.name} 已加入模型目录`)
  }

  return <>
    <PageHeader eyebrow="系统管理 / 模型管理" title="模型管理" description="统一管理10大领域预置模型与客户自有模型接入，维护启停、能力标签、适用范围、权限边界和场景绑定。" actions={<><span className="updated-time">最近同步：{syncedAt}</span><Button icon="refresh" onClick={syncModels}>同步模型目录</Button><Button variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>接入自有模型</Button></>}/>
    <section className="html-grid four model-summary">
      {[{ label: '预置模型', value: presetCount, helper: '覆盖采购、合同、供应商等10大领域', width: 100 }, { label: '客户自有模型', value: customerCount, helper: '可通过API或私有知识库接入', width: 62 }, { label: '启用模型', value: runningCount, helper: '已开放给授权应用和场景调用', width: 82 }, { label: '今日调用', value: callCount, helper: `已绑定 ${bindingCount} 个风险场景`, width: 86 }].map((item) => <article className="html-stat-card" key={item.label}><span>{item.label}</span><strong>{item.value}</strong><p>{item.helper}</p><div className="html-stat-bar"><i style={{ width: `${item.width}%` }}/></div></article>)}
    </section>
    <Panel title="模型目录" subtitle={`当前条件共 ${rows.length} 个模型`} className="model-catalog">
      <FilterGrid onReset={reset} onSearch={() => setToast(`已筛选到 ${rows.length} 个模型`)}>
        <Field label="关键词"><input value={filters.keyword} onChange={(event) => setFilters({ ...filters, keyword: event.target.value })} placeholder="模型名称、领域、能力或标签"/></Field>
        <Field label="模型来源"><select value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })}><option>全部</option><option>平台预置</option><option>客户自有</option></select></Field>
        <Field label="运行状态"><select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option>全部</option><option>启用</option><option>待接入</option><option>停用</option></select></Field>
        <Field label="场景绑定"><select value={filters.binding} onChange={(event) => setFilters({ ...filters, binding: event.target.value })}><option>全部</option><option>已绑定</option><option>未绑定</option></select></Field>
      </FilterGrid>
      {rows.length === 0 ? <EmptyState title="没有符合条件的模型" description="请调整筛选条件，或通过接入向导添加客户自有模型。"/> : <div className="model-card-grid">{rows.map((model) => <article className="model-card" key={model.id}>
        <div className="model-card-head"><div><span className={`model-source ${model.source === '客户自有' ? 'customer' : ''}`}>{model.source}</span><h3>{model.name}</h3><small>{model.id} · {model.domain} · 更新 {model.updatedAt}</small></div><StatusTag>{model.status}</StatusTag></div>
        <p>{model.description}</p>
        <div className="model-tags">{model.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
        <div className="model-metrics"><span><b>{model.calls}</b> 今日调用</span><span><b>{model.sceneBindings.length}</b> 绑定场景</span><span>{model.sceneBindings.length ? '已绑定' : '未绑定'}</span></div>
        <div className="model-bindings">{model.sceneBindings.length ? model.sceneBindings.slice(0, 3).map((scene) => <em key={scene}>{scene}</em>) : <em className="empty">尚未绑定风险场景</em>}</div>
        <footer className="model-actions"><button onClick={() => setSelectedId(model.id)}>详情</button><button onClick={() => openTrial(model)}>测试</button><button onClick={() => openBinding(model)}>绑定场景</button><button className={model.status === '启用' ? 'danger' : ''} onClick={() => toggleModelStatus(model)}>{model.status === '启用' ? '停用' : '启用'}</button></footer>
      </article>)}</div>}
    </Panel>
    <Drawer open={!!selected} title={selected?.name || ''} eyebrow="模型详情" onClose={() => setSelectedId('')} footer={selected && <><Button onClick={() => openTrial(selected)}>测试</Button><Button icon="link" onClick={() => openBinding(selected)}>绑定场景</Button><Button variant={selected.status === '停用' ? 'primary' : 'default'} onClick={() => toggleModelStatus(selected)}>{selected.status === '启用' ? '停用模型' : '启用模型'}</Button></>}>
      {selected && <><KeyValue items={[{ label: '模型编码', value: selected.id }, { label: '模型来源', value: selected.source }, { label: '提供方', value: selected.provider }, { label: '适用领域', value: selected.domain }, { label: '调用地址', value: selected.endpoint || '平台托管' }, { label: '今日调用', value: `${selected.calls} 次` }, { label: '负责人', value: selected.owner }, { label: '更新时间', value: selected.updatedAt }]}/><Panel title="核心能力" className="drawer-section"><p className="drawer-note">{selected.capability}</p><div className="model-tags drawer-tags">{selected.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></Panel><Panel title="场景绑定" className="drawer-section"><div className="model-binding-list">{selected.sceneBindings.length ? selected.sceneBindings.map((scene) => <div key={scene}><Icon name="link"/><span>{scene}</span><StatusTag>已绑定</StatusTag></div>) : <div><Icon name="warning"/><span>当前未绑定风险场景，可作为采购应用通用能力使用。</span><StatusTag>未绑定</StatusTag></div>}</div></Panel></>}
    </Drawer>
    <Drawer open={!!bindingTarget} title={bindingTarget?.name || ''} eyebrow="绑定场景" onClose={() => { setBindingTargetId(''); setSceneSearch('') }} footer={<><Button onClick={() => { setBindingTargetId(''); setSceneSearch('') }}>取消</Button><Button variant="primary" icon="link" onClick={saveBinding}>保存绑定</Button></>}>
      {bindingTarget && <div className="form-stack"><Panel title="选择风险场景" subtitle="支持按名称搜索；不选择则表示暂不绑定风险场景。" className="drawer-section"><div className="model-scene-toolbar"><input value={sceneSearch} onChange={(event) => setSceneSearch(event.target.value)} placeholder="搜索风险场景名称"/><div className="model-scene-bulk"><span>已选 {bindingDraft.length} 个；当前结果 {filteredSceneOptions.length} 个，已选 {selectedFilteredSceneCount} 个</span><div><button type="button" onClick={selectFilteredScenes} disabled={filteredSceneOptions.length === 0 || selectedFilteredSceneCount === filteredSceneOptions.length}>全选当前结果</button><button type="button" onClick={clearFilteredScenes} disabled={selectedFilteredSceneCount === 0}>清空当前结果</button></div></div></div>{filteredSceneOptions.length ? <div className="model-scene-grid">{filteredSceneOptions.map((scene) => <label key={scene} className={bindingDraft.includes(scene) ? 'checked' : ''}><input type="checkbox" checked={bindingDraft.includes(scene)} onChange={() => toggleBindingScene(scene)}/><span>{scene}</span></label>)}</div> : <EmptyState title="没有匹配的风险场景" description="请调整搜索关键词后再试。"/>}</Panel></div>}
    </Drawer>
    <Modal open={createOpen} title="接入自有模型" description="保存后模型会进入目录，状态为待接入；点击同步模型目录或卡片启用按钮后即可启用。" confirmText="保存模型" onClose={() => setCreateOpen(false)} onConfirm={submitModel}><div className="form-stack"><div className="form-section two-column"><Field label="模型名称 *"><input value={createForm.name} onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })} placeholder="例如 价格预测私有模型"/></Field><Field label="适用领域"><select value={createForm.domain} onChange={(event) => setCreateForm({ ...createForm, domain: event.target.value })}>{['采购','招投标','合同','审查','供应商','预算','政策','项目管理'].map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="提供方 *"><input value={createForm.provider} onChange={(event) => setCreateForm({ ...createForm, provider: event.target.value })} placeholder="例如 集团算法平台"/></Field><Field label="负责人"><input value={createForm.owner} onChange={(event) => setCreateForm({ ...createForm, owner: event.target.value })}/></Field><Field label="调用地址"><input value={createForm.endpoint} onChange={(event) => setCreateForm({ ...createForm, endpoint: event.target.value })} placeholder="https:// 或内网服务地址"/></Field><Field label="能力标签"><input value={createForm.tags} onChange={(event) => setCreateForm({ ...createForm, tags: event.target.value })} placeholder="逗号分隔，如 预算测算,价格预测"/></Field><Field label="核心能力 *" wide><textarea value={createForm.capability} onChange={(event) => setCreateForm({ ...createForm, capability: event.target.value })} placeholder="说明该模型可解决的问题、输入输出和适用边界"/></Field></div><div className="model-form-note"><Icon name="check"/><span>闭环路径：保存模型 → 目录出现新卡片 → 完成接入校验并启用 → 绑定场景或测试验证效果。</span></div></div></Modal>
    <Modal open={!!trialModel} title={trialModel ? `测试：${trialModel.name}` : '模型测试'} description={trialModel ? `${trialModel.domain} · ${trialModel.status}` : ''} confirmText="发送问题" onClose={() => setTrialModelId('')} onConfirm={sendTrialQuestion}><div className="model-trial-dialog"><div className="model-trial-messages">{trialMessages.map((message, index) => <div key={`${message.role}-${index}`} className={`model-trial-message ${message.role}`}><strong>{message.role === 'assistant' ? '模型' : '我'}</strong><p>{message.text}</p></div>)}</div><Field label="测试内容"><textarea rows={3} value={trialInput} onChange={(event) => setTrialInput(event.target.value)} placeholder="例如：这个模型适合绑定哪些风险场景？"/></Field></div></Modal>
  </>
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
  return <div className="publish-checklist">{['基本信息与编码校验','图谱结构和图谱依赖有效','事件与证据要求配置完整','权限范围校验通过','试跑或质量校验通过'].map((item) => <div key={item}><Icon name="check"/><span>{item}</span><StatusTag>通过</StatusTag></div>)}</div>
}
