import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const sourcePath = path.join(root, 'outputs', '穿透式监管产品PRD-v11.9-场景规则Skill功能对齐版.md')
const targetPath = path.join(root, 'outputs', '穿透式监管产品PRD-v11.10-功能架构图重绘版.md')

const read = (file) => fs.readFileSync(file, 'utf8')
const write = (file, content) => fs.writeFileSync(file, content, 'utf8')

let content = read(sourcePath)

content = content
  .replace('# 穿透式监管智能应用平台 PRD（v11.9 场景规则Skill功能对齐版）', '# 穿透式监管智能应用平台 PRD（v11.10 功能架构图重绘版）')
  .replace('| 当前版本 | v11.9 场景规则Skill功能对齐版 |', '| 当前版本 | v11.10 功能架构图重绘版 |')

const changeLogHeader = '| --- | --- | --- | --- | --- | --- |\n'
const changeLogRow = '| 2026-07-27 | 重新绘制产品功能架构图，补充统一入口、采购应用、Skill管理、知识图谱新入口及当前路由关系 | 对齐当前工程导航、页面路由和图谱/场景规则最新能力边界 | [TODO] | [TODO] | v11.10 |\n'
content = content.replace(changeLogHeader, changeLogHeader + changeLogRow)

const oldSection = `![功能架构图](./assets/penetrative-supervision-functional-architecture.svg)

> 图10-3 功能架构图。六个一级模块、页面和路由均与当前工程保持一致。

| 一级菜单 | 二级菜单 | 页面 | 路由 | 当前成熟度 |
| --- | --- | --- | --- | --- |
| 监管工作台 | — | 工作台首页 | \`/workbench\` | L2 |
| 监管态势 | — | 监管态势 | \`/situation\` | L2 |
| 风险监管 | 统一预警 | 预警列表、预警详情 | \`/risk/warnings...\` | L2 |
| 风险监管 | 风险事件 | 事件列表、事件详情 | \`/risk/events...\` | L2 |
| 场景与规则 | 风险场景 | 场景列表、场景编辑 | \`/scenes...\` | L3 |
| 场景与规则 | 规则管理 | 规则资产列表、规则编辑器 | \`/rules...\` | L3 |
| 本体与图谱 | 本体管理 | 本体列表、本体编辑 | \`/ontology...\` | L3 |
| 本体与图谱 | 数据接入 | 数据源与语义映射 | \`/data-access...\` | L3 |
| 本体与图谱 | 图谱管理 | 图谱列表、新建和编辑 | \`/graphs...\` | L3 |
| 系统管理 | 用户与组织 | 用户页 | \`/system/users\` | L2 |
| 系统管理 | 角色与权限 | 角色页 | \`/system/roles\` | L2 |
| 系统管理 | 审计日志 | 审计页 | \`/system/audit\` | L2 |`

const newSection = `![功能架构图](./assets/penetrative-supervision-functional-architecture-v11.10.svg)

> 图10-3 功能架构图。按当前工程重绘统一入口、采购应用、穿透式监管、知识图谱和系统管理，并补充场景与规则下的Skill管理入口。

| 一级菜单 | 二级菜单 | 页面 | 路由 | 当前成熟度 |
| --- | --- | --- | --- | --- |
| 统一入口 | 首页 | 统一首页 | \`/home\` | L2 |
| 统一入口 | 超级智能体 | 智能体入口 | \`/super-agent\` | L2 |
| 采购应用 | 采购应用总览 | 采购应用首页 | \`/procurement\` | L2 |
| 采购应用 | 招投标 | 招投标书撰写、供应商资格审查、围串标识别、智能评标 | \`/procurement/tender...\` | L2 |
| 采购应用 | 合同 | 合同撰写、合同抽取、合同归档、合同对比、智能审查 | \`/procurement/contract...\` | L2 |
| 采购应用 | 审查 | 文档审查、单据审查 | \`/procurement/review...\` | L2 |
| 采购应用 | 采购 | 采购方案撰写、智能预算、采购单撰写 | \`/procurement/purchase...\` | L2 |
| 穿透式监管 | 监管工作台 | 工作台首页 | \`/workbench\` | L2 |
| 穿透式监管 | 监管态势 | 监管态势 | \`/situation\` | L2 |
| 穿透式监管 | 风险监管 / 统一预警 | 预警列表、预警详情 | \`/risk/warnings...\` | L2 |
| 穿透式监管 | 风险监管 / 风险事件 | 事件列表、事件详情 | \`/risk/events...\` | L2 |
| 穿透式监管 | 场景与规则 / 风险场景 | 场景列表、场景编辑 | \`/scenes...\` | L3 |
| 穿透式监管 | 场景与规则 / 规则管理 | 规则资产列表、规则编辑器 | \`/rules...\` | L3 |
| 穿透式监管 | 场景与规则 / Skill管理 | Skill资产列表、Skill生成编辑器 | \`/skills...\` | L3 |
| 穿透式监管 | 知识图谱 / 图谱结构 | 图谱结构列表、结构编辑器 | \`/graphs/structures\`、\`/ontology...\` | L3 |
| 穿透式监管 | 知识图谱 / 数据源 | 数据源列表、数据源详情、元数据和映射 | \`/graphs/sources...\` | L3 |
| 穿透式监管 | 知识图谱 / 知识图谱生成 | 图谱生成向导、重新生成 | \`/graphs/new\`、\`/graphs/:id/edit\` | L3 |
| 系统管理 | 用户与组织 | 用户页 | \`/system/users\` | L2 |
| 系统管理 | 角色与权限 | 角色页 | \`/system/roles\` | L2 |
| 系统管理 | 审计日志 | 审计页 | \`/system/audit\` | L2 |`

if (!content.includes(oldSection)) {
  throw new Error('10.2 功能清单内容未匹配，未生成新版本')
}

content = content.replace(oldSection, newSection)
write(targetPath, content)
console.log(targetPath)
