import fs from 'node:fs/promises'

const seedPath = new URL('../data/ruleCatalogSeed.json', import.meta.url)
const frontendPath = new URL('../src/penetrativeSupervisionRules.ts', import.meta.url)
const libraryName = '穿透式监管规则库'
const directoryTargets = [
  ['项目申报与立项', 82],
  ['预算与资金执行', 76],
  ['采购计划与需求', 113],
  ['招投标与围串标', 138],
  ['合同变更与履约', 96],
  ['项目执行与验收', 123],
  ['付款发票与结算', 104],
  ['财务核算与税务', 88],
  ['供应商工商与信用', 108],
  ['内控关联与舞弊', 72],
]
const allocation = directoryTargets.flatMap(([directory, count]) => Array.from({ length: count }, () => directory))

function rebalance(rules) {
  const targetRules = rules.filter((rule) => rule.libraryName === libraryName)
  if (targetRules.length !== allocation.length) throw new Error(`穿透式监管规则数量应为 ${allocation.length} 条，实际为 ${targetRules.length} 条`)
  targetRules.forEach((rule, index) => { rule.directoryName = allocation[index] })
  return Object.fromEntries(directoryTargets.map(([directory]) => [directory, targetRules.filter((rule) => rule.directoryName === directory).length]))
}

const seed = JSON.parse(await fs.readFile(seedPath, 'utf8'))
const counts = rebalance(seed.rules)
await fs.writeFile(seedPath, `${JSON.stringify(seed, null, 2)}\n`, 'utf8')

const frontendText = await fs.readFile(frontendPath, 'utf8')
const marker = 'export const penetrativeSupervisionRules: RuleItem[] = '
const frontendRows = JSON.parse(frontendText.slice(frontendText.indexOf(marker) + marker.length).trim())
rebalance(frontendRows)
await fs.writeFile(frontendPath, `import type { RuleItem } from './sceneRuleTypes'\n\n${marker}${JSON.stringify(frontendRows, null, 2)}\n`, 'utf8')

console.log(JSON.stringify({ counts, total: Object.values(counts).reduce((sum, count) => sum + count, 0) }, null, 2))
