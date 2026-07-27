import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const sourcePath = path.join(root, 'outputs', '穿透式监管产品PRD-v11.10-功能架构图重绘版.md')
const targetPath = path.join(root, 'outputs', '穿透式监管产品PRD-v11.11-功能架构分层优化版.md')

let content = fs.readFileSync(sourcePath, 'utf8')

content = content
  .replace('# 穿透式监管智能应用平台 PRD（v11.10 功能架构图重绘版）', '# 穿透式监管智能应用平台 PRD（v11.11 功能架构分层优化版）')
  .replace('| 当前版本 | v11.10 功能架构图重绘版 |', '| 当前版本 | v11.11 功能架构分层优化版 |')
  .replace('| 2026-07-27 | 重新绘制产品功能架构图，补充统一入口、采购应用、Skill管理、知识图谱新入口及当前路由关系 | 对齐当前工程导航、页面路由和图谱/场景规则最新能力边界 | [TODO] | [TODO] | v11.10 |',
    '| 2026-07-27 | 重新绘制产品功能架构图，按入口层、监管业务层、能力配置层、知识图谱底座层和治理支撑层重新划分 | 提升产品功能分层清晰度，避免工程菜单与产品能力混排导致理解成本过高 | [TODO] | [TODO] | v11.11 |\n| 2026-07-27 | 重新绘制产品功能架构图，补充统一入口、采购应用、Skill管理、知识图谱新入口及当前路由关系 | 对齐当前工程导航、页面路由和图谱/场景规则最新能力边界 | [TODO] | [TODO] | v11.10 |')
  .replace('![功能架构图](./assets/penetrative-supervision-functional-architecture-v11.10.svg)',
    '![功能架构图](./assets/penetrative-supervision-functional-architecture-v11.11.svg)')
  .replace('> 图10-3 功能架构图。按当前工程重绘统一入口、采购应用、穿透式监管、知识图谱和系统管理，并补充场景与规则下的Skill管理入口。',
    '> 图10-3 功能架构图。按产品职责重新分层：用户与入口层、监管业务应用层、监管能力配置层、知识图谱底座层和治理支撑层；采购应用作为业务协同和监管数据来源侧表达。')

fs.writeFileSync(targetPath, content, 'utf8')
console.log(targetPath)
