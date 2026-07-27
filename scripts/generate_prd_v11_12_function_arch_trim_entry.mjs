import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const svgSource = path.join(root, 'outputs', 'assets', 'penetrative-supervision-functional-architecture-v11.11.svg')
const svgTarget = path.join(root, 'outputs', 'assets', 'penetrative-supervision-functional-architecture-v11.12.svg')
const prdSource = path.join(root, 'outputs', '穿透式监管产品PRD-v11.11-功能架构分层优化版.md')
const prdTarget = path.join(root, 'outputs', '穿透式监管产品PRD-v11.12-功能架构去入口节点版.md')

let svg = fs.readFileSync(svgSource, 'utf8')

svg = svg
  .replace('width="1800" height="1280" viewBox="0 0 1800 1280"', 'width="1800" height="1180" viewBox="0 0 1800 1180"')
  .replace('按产品职责分层展示穿透式监管产品功能：入口、监管业务、能力配置、知识图谱底座和治理支撑。', '按职责分层展示穿透式监管产品主功能：监管业务、能力配置、知识图谱底座和治理支撑。')
  .replace('按产品职责分层，而不是简单按菜单平铺：监管业务在上，场景/规则/Skill承接能力配置，知识图谱提供语义和事实底座，系统管理横向约束权限与审计。',
    '按产品职责分层，而不是简单按菜单平铺：监管业务在上，场景/规则/Skill承接能力配置，知识图谱提供语义和事实底座，系统管理横向约束权限与审计。')

const entryBlock = /  <g transform="translate\(64 122\)">[\s\S]*?  <\/g>\r?\n\r?\n/
if (!entryBlock.test(svg)) throw new Error('未找到用户与入口层节点块')
svg = svg.replace(entryBlock, '')

const replacements = [
  ['translate(64 236)', 'translate(64 132)'],
  ['translate(382 236)', 'translate(382 132)'],
  ['translate(382 500)', 'translate(382 396)'],
  ['translate(382 788)', 'translate(382 684)'],
  ['translate(1468 236)', 'translate(1468 132)'],
  ['translate(64 1040)', 'translate(64 936)'],
  ['translate(64 1218)', 'translate(64 1114)'],
  ['M908 788 L908 748', 'M908 684 L908 644'],
  ['M666 788 C666 768 640 758 532 748', 'M666 684 C666 664 640 654 532 644'],
  ['M1036 788 C1036 766 1084 758 1238 748', 'M1036 684 C1036 662 1084 654 1238 644'],
  ['M898 500 L898 460', 'M898 396 L898 356'],
  ['M1068 500 C960 478 858 466 748 460', 'M1068 396 C960 374 858 362 748 356'],
  ['M328 612 C350 612 360 612 382 612', 'M328 508 C350 508 360 508 382 508'],
  ['M328 608 C350 782 358 860 382 889', 'M328 504 C350 678 358 756 382 785'],
  ['M1414 348 C1436 348 1448 348 1468 348', 'M1414 244 C1436 244 1448 244 1468 244'],
  ['M1414 624 C1436 624 1448 624 1468 624', 'M1414 520 C1436 520 1448 520 1468 520'],
  ['M1414 888 C1436 888 1448 888 1468 888', 'M1414 784 C1436 784 1448 784 1468 784'],
]

for (const [from, to] of replacements) {
  if (!svg.includes(from)) throw new Error(`未匹配SVG替换内容: ${from}`)
  svg = svg.replaceAll(from, to)
}

fs.writeFileSync(svgTarget, svg, 'utf8')

let prd = fs.readFileSync(prdSource, 'utf8')
prd = prd
  .replace('# 穿透式监管智能应用平台 PRD（v11.11 功能架构分层优化版）', '# 穿透式监管智能应用平台 PRD（v11.12 功能架构去入口节点版）')
  .replace('| 当前版本 | v11.11 功能架构分层优化版 |', '| 当前版本 | v11.12 功能架构去入口节点版 |')
  .replace('| 2026-07-27 | 重新绘制产品功能架构图，按入口层、监管业务层、能力配置层、知识图谱底座层和治理支撑层重新划分 | 提升产品功能分层清晰度，避免工程菜单与产品能力混排导致理解成本过高 | [TODO] | [TODO] | v11.11 |',
    '| 2026-07-27 | 去除功能架构图顶部入口节点，并将主体架构上移，保留监管业务、能力配置、知识图谱和治理支撑主链路 | 减少图面遮挡和低价值入口信息，提升架构图阅读清晰度 | [TODO] | [TODO] | v11.12 |\n| 2026-07-27 | 重新绘制产品功能架构图，按入口层、监管业务层、能力配置层、知识图谱底座层和治理支撑层重新划分 | 提升产品功能分层清晰度，避免工程菜单与产品能力混排导致理解成本过高 | [TODO] | [TODO] | v11.11 |')
  .replace('![功能架构图](./assets/penetrative-supervision-functional-architecture-v11.11.svg)', '![功能架构图](./assets/penetrative-supervision-functional-architecture-v11.12.svg)')
  .replace('> 图10-3 功能架构图。按产品职责重新分层：用户与入口层、监管业务应用层、监管能力配置层、知识图谱底座层和治理支撑层；采购应用作为业务协同和监管数据来源侧表达。',
    '> 图10-3 功能架构图。按产品职责重新分层：监管业务应用层、监管能力配置层、知识图谱底座层和治理支撑层；采购应用作为业务协同和监管数据来源侧表达，入口类辅助能力不在图中展开。')

fs.writeFileSync(prdTarget, prd, 'utf8')
console.log(JSON.stringify({ svg: svgTarget, prd: prdTarget }, null, 2))

