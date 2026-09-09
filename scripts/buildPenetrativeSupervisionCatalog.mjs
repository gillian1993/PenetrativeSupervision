import fs from 'node:fs/promises'
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool'

const root = new URL('..', import.meta.url)
const seedPath = new URL('../data/ruleCatalogSeed.json', import.meta.url)
const workbookPath = 'C:/Users/prophetcy/Documents/xwechat_files/wxid_t79kf9ctx11w21_4cf6/temp/RWTemp/2026-09/6a73395e7094dc7635d631244ca3b767/科研院所项目全流程_AI风险合规审计规则库_扩展版.xlsx'

const directoryDefs = [
  { letter: 'A', sheetIndex: 1, directory: '项目申报与立项', domain: '通用', stage: '事前', objectCode: 'PROC.PurchaseProject', objectName: '采购项目', eventCode: 'PROC.TenderPublished', eventName: '项目申报/立项提交' },
  { letter: 'B', sheetIndex: 2, directory: '预算与资金执行', domain: '财务', stage: '事前', objectCode: 'PROC.Payment', objectName: '资金记录', eventCode: 'PROC.PaymentExecuted', eventName: '资金支付执行' },
  { letter: 'C', sheetIndex: 3, directory: '采购计划与需求', domain: '采购', stage: '事前', objectCode: 'PROC.PurchaseProject', objectName: '采购项目', eventCode: 'PROC.ProcurementMethodChosen', eventName: '采购方式确定' },
  { letter: 'D', sheetIndex: 4, directory: '招投标与围串标', domain: '采购', stage: '事中', objectCode: 'PROC.Bid', objectName: '投标', eventCode: 'PROC.BidOpened', eventName: '开标' },
  { letter: 'E', sheetIndex: 5, directory: '合同变更与履约', domain: '合同', stage: '事中', objectCode: 'PROC.Contract', objectName: '合同', eventCode: 'PROC.ContractChanged', eventName: '合同变更' },
  { letter: 'F', sheetIndex: 6, directory: '项目执行与验收', domain: '通用', stage: '事中', objectCode: 'PROC.PurchaseOrder', objectName: '采购订单', eventCode: 'PROC.GoodsReceived', eventName: '项目交付/收货' },
  { letter: 'G', sheetIndex: 7, directory: '付款发票与结算', domain: '财务', stage: '事后', objectCode: 'PROC.Payment', objectName: '付款', eventCode: 'PROC.PaymentExecuted', eventName: '付款执行' },
  { letter: 'H', sheetIndex: 8, directory: '财务核算与税务', domain: '财务', stage: '事后', objectCode: 'PROC.Contract', objectName: '合同', eventCode: 'PROC.ContractSigned', eventName: '合同签订' },
  { letter: 'I', sheetIndex: 9, directory: '供应商工商与信用', domain: '采购', stage: '事前', objectCode: 'PROC.Supplier', objectName: '供应商', eventCode: 'PROC.BidSubmitted', eventName: '投标提交' },
  { letter: 'J', sheetIndex: 10, directory: '内控关联与舞弊', domain: '通用', stage: '事后', objectCode: 'PROC.Contract', objectName: '合同', eventCode: 'PROC.ContractChanged', eventName: '合同变更' },
]

// Excel 各明细页是按 100 行模板铺开，业务上的规则密度并不应被页面固定成完全相同。
// 保留 1000 条规则总量，按流程复杂度做非均匀分配，使目录数量更符合实际监管重点。
const directoryRuleTargets = [82, 76, 113, 138, 96, 123, 104, 88, 108, 72]
const ruleDirectoryAllocation = directoryDefs.flatMap((definition, index) => Array.from({ length: directoryRuleTargets[index] }, () => definition))

const typeMap = {
  '基础触发': { ruleType: '属性', stage: '事前' },
  '跨系统一致性': { ruleType: '字段比对', stage: '事中' },
  '历史聚合/频次': { ruleType: '聚合', stage: '事中' },
  '证据与附件完整性': { ruleType: '属性', stage: '事后' },
  '异常模型+人工放行': { ruleType: '高级表达式', stage: '事中' },
}

const normalizedLevel = (value) => ['重大', '高', '中', '低'].includes(String(value).trim()) ? String(value).trim() : '高'
const detectionTypeOf = (text) => {
  const value = String(text || '')
  return Object.keys(typeMap).find((item) => value.endsWith(item)) || '基础触发'
}
const clean = (value) => String(value ?? '').trim()
const codeSafe = (value) => clean(value).replace(/[^A-Z0-9_-]/gi, '-').toUpperCase()
const stageForDirectory = (stage, detectionType) => typeMap[detectionType]?.stage || stage

function evidenceFrom(source, dataDescription, detailText) {
  return [{
    id: 'evidence-1',
    name: '业务来源记录与审计证据',
    source: source || '按规则依赖数据取数',
    sourceField: '记录编号、业务主键、取数批次',
    attachmentRequirement: '按实际风险等级留存',
    completeness: '必须保存来源系统、记录编号、取数批次、规则版本和执行时间',
    description: `${dataDescription || ''}${detailText ? `；判断说明：${detailText}` : ''}`,
  }]
}

function toRule({ detail, summary, definition, modeCode, ruleIndex }) {
  const [sequence, sourceCode, primaryItem, riskName, detailText, dsl, variables, dataDescription, dataSource, levelText, sourceBasis, sourceUrl] = detail
  const riskNameText = clean(riskName) || `${clean(primaryItem)}-${ruleIndex}`
  const detectionType = detectionTypeOf(riskNameText)
  const type = typeMap[detectionType] || typeMap['基础触发']
  const sourceRuleCode = codeSafe(sourceCode) || `ROW-${ruleIndex}`
  const code = `SUP-${definition.letter}-${sourceRuleCode}`
  const expression = clean(dsl) || `WHEN source_rule_code == "${sourceRuleCode}" THEN RISK("${riskNameText}")`
  const dataSourceText = clean(dataSource) || clean(dataDescription)
  const basisName = clean(sourceBasis) || '科研院所项目全流程 AI 风险合规审计规则库（扩展版）'
  const summaryText = clean(detailText) || `${riskNameText}按${detectionType}方式进行识别。`
  const windowValue = detectionType === '历史聚合/频次' ? 180 : detectionType === '异常模型+人工放行' ? 90 : 30
  return {
    primaryModeCode: modeCode,
    code,
    sourceRuleCode,
    name: riskNameText,
    sourceType: detectionType,
    ruleType: type.ruleType,
    stage: stageForDirectory(definition.stage, detectionType),
    level: normalizedLevel(levelText),
    logicDescription: summaryText,
    thresholdDescription: `按“${detectionType}”检测形态执行；阈值、比例、时间窗和相似度参数以规则变量/参数配置为准。`,
    dataSource: dataSourceText,
    evidenceDescription: clean(dataDescription) || '留存来源单据、审批记录、系统日志及规则运行明细。',
    buildStatus: '已从扩展版规则库导入，待本体字段映射与样本试跑',
    currentMapping: '',
    sharedModeCodes: [],
    domain: definition.domain,
    libraryName: '穿透式监管规则库',
    directoryName: definition.directory,
    objectCode: definition.objectCode,
    objectName: definition.objectName,
    eventCode: definition.eventCode,
    eventName: definition.eventName,
    ontologyId: 'ONT-PROC-DEMO',
    graphVersion: 'GRAPH-PROC-DEMO-20260720.1',
    conditionJson: {
      id: 'group-root',
      logic: 'AND',
      items: [],
      expression,
      expressionLanguage: 'DSL',
      sourceVariables: clean(variables),
    },
    pathJson: { hops: [], logic: 'AND', constraints: [] },
    timeJson: { baseline: 'event', logic: 'AND', conditions: [], eventCode: definition.eventCode, windowValue, windowUnit: '天', direction: '之前' },
    aggregateJson: detectionType === '历史聚合/频次'
      ? { logic: 'AND', metrics: [], function: 'COUNT', fieldCode: '', groupBy: '', operator: '大于等于', threshold: 1 }
      : { logic: 'AND', metrics: [], function: 'COUNT', fieldCode: '', groupBy: '', operator: '大于等于', threshold: 0 },
    exceptionJson: { enabled: true, description: '经批准的紧急事项、涉密事项或其他制度例外转人工复核。', whitelist: [] },
    outputJson: ['主体名称与编码', '命中条件及实际值', '来源记录与版本', '规则执行时间', '关系路径'],
    evidenceJson: evidenceFrom(dataSourceText, clean(dataDescription), summaryText),
    policyJson: [{ id: '', name: basisName, version: '扩展版', clause: sourceUrl ? `${clean(sourceUrl).slice(0, 300)}` : '以导入工作簿来源依据为准', text: '' }],
    sourceBasis,
    sourceUrl,
    sourceSequence: clean(sequence),
    failureStrategy: '进入异常队列',
    summary: summaryText,
    description: `${summaryText}${clean(dataDescription) ? ` 依赖数据：${clean(dataDescription)}` : ''}`,
    enabled: false,
  }
}

const workbookBlob = await FileBlob.load(workbookPath)
const workbook = await SpreadsheetFile.importXlsx(workbookBlob)
const seed = JSON.parse(await fs.readFile(seedPath, 'utf8'))
const summaryRows = workbook.worksheets.getItemAt(0).getRange('A7:L206').values
const newScenes = []
const newModes = []
const newRules = []
const newBindings = []
const modeByCategoryAndItem = new Map()

for (const definition of directoryDefs) {
  const sceneCode = `SCENE-SUP-${definition.letter}`
  newScenes.push({
    code: sceneCode,
    name: definition.directory,
    domain: definition.domain,
    stage: definition.stage,
    description: `来自科研院所项目全流程 AI 风险合规审计规则库扩展版，覆盖${definition.directory}阶段的穿透式监管。`,
    modeCodes: [],
    level: '高',
    objectCode: definition.objectCode,
    objectName: definition.objectName,
    eventCode: definition.eventCode,
    eventName: definition.eventName,
    observationValue: 180,
    observationUnit: '天',
    ontologyId: 'ONT-PROC-DEMO',
    graphVersion: 'GRAPH-PROC-DEMO-20260720.1',
  })
}

for (const row of summaryRows) {
  const [sequence, riskCategory, sceneNode, riskItem, examples, inputSystems, reportDescription, keyFields, detectionTypes, level, sourceBasis, sourceUrl] = row
  const categoryText = clean(riskCategory)
  const letter = categoryText.slice(0, 1)
  const definition = directoryDefs.find((item) => item.letter === letter)
  if (!definition || !clean(riskItem)) continue
  const key = `${definition.letter}|${clean(riskItem)}`
  if (modeByCategoryAndItem.has(key)) continue
  const index = newModes.filter((item) => item.primarySceneCode === `SCENE-SUP-${definition.letter}`).length + 1
  const modeCode = `SUP-${definition.letter}-${String(index).padStart(3, '0')}`
  modeByCategoryAndItem.set(key, { modeCode, definition, summary: { examples, inputSystems, reportDescription, keyFields, detectionTypes, sourceBasis, sourceUrl, sceneNode, sequence, level } })
  const scene = newScenes.find((item) => item.code === `SCENE-SUP-${definition.letter}`)
  scene.modeCodes.push(modeCode)
  newModes.push({
    category: categoryText,
    code: modeCode,
    name: clean(riskItem),
    description: `场景节点：${clean(sceneNode)}；典型风险：${clean(examples)}；主要数据源：${clean(inputSystems)}。`,
    source: '科研院所项目全流程_AI风险合规审计规则库_扩展版.xlsx',
    isUserCode: false,
    primarySceneCode: scene.code,
    primarySceneName: definition.directory,
    stage: definition.stage,
    level: normalizedLevel(level),
    coverageStatus: '已导入，待样本试跑',
    modeKind: '风险模式',
    directoryName: definition.directory,
    sourceBasis: clean(sourceBasis),
    sourceUrl: clean(sourceUrl),
  })
}

for (const definition of directoryDefs) {
  const rows = workbook.worksheets.getItemAt(definition.sheetIndex).getRange('A7:L106').values
  let ruleIndex = 0
  for (const detail of rows) {
    if (!clean(detail[1]) || !clean(detail[2])) continue
    const parent = modeByCategoryAndItem.get(`${definition.letter}|${clean(detail[2])}`)
    if (!parent) continue
    ruleIndex += 1
    const rule = toRule({ detail, summary: parent.summary, definition, modeCode: parent.modeCode, ruleIndex })
    const assignedDirectory = ruleDirectoryAllocation[newRules.length]
    if (!assignedDirectory) throw new Error(`规则目录分配不足：第 ${newRules.length + 1} 条规则没有目标目录`)
    rule.directoryName = assignedDirectory.directory
    newRules.push(rule)
    newBindings.push({ modeCode: parent.modeCode, ruleCode: rule.code, bindingType: '主绑定' })
  }
}

if (newRules.length !== directoryRuleTargets.reduce((sum, count) => sum + count, 0)) {
  throw new Error(`规则目录分配数量不一致：实际 ${newRules.length} 条`)
}

const oldSceneCodes = new Set(newScenes.map((item) => item.code))
const oldModeCodes = new Set(newModes.map((item) => item.code))
const oldRuleCodes = new Set(newRules.map((item) => item.code))
seed.scenes = [...seed.scenes.filter((item) => !oldSceneCodes.has(item.code)), ...newScenes]
seed.modes = [...seed.modes.filter((item) => !oldModeCodes.has(item.code)), ...newModes]
seed.rules = [...seed.rules.filter((item) => !oldRuleCodes.has(item.code)), ...newRules]
const newBindingKeys = new Set(newBindings.map((item) => `${item.modeCode}|${item.ruleCode}`))
seed.bindings = [...seed.bindings.filter((item) => !newBindingKeys.has(`${item.modeCode}|${item.ruleCode}`)), ...newBindings]
seed.metadata = {
  ...seed.metadata,
  catalogCode: 'PROC-SUP-RULE-CATALOG-20260909',
  name: '采购与科研院所项目全流程穿透式监管原子规则融合台账',
  version: 'v0.2',
  generatedAt: '2026-09-09 00:00:00',
  sourceWorkbook: '科研院所项目全流程_AI风险合规审计规则库_扩展版.xlsx',
  counts: { scenes: seed.scenes.length, modes: seed.modes.length, rules: seed.rules.length, bindings: seed.bindings.length },
}

await fs.writeFile(seedPath, `${JSON.stringify(seed, null, 2)}\n`, 'utf8')
const frontendRows = newRules.map((rule) => ({
  id: `SEED-${rule.code}`,
  versionId: `SEED-${rule.code}-V01`,
  sceneId: `SCENE-${rule.primaryModeCode}`,
  sceneVersionId: `SV-${rule.primaryModeCode}-V01`,
  code: rule.code,
  name: rule.name,
  version: 'v0.1',
  type: rule.ruleType,
  stage: rule.stage,
  level: rule.level,
  defaultLevel: rule.level,
  enabled: false,
  status: '草稿',
  conditions: { id: 'group-root', logic: 'AND', items: [], expression: rule.conditionJson.expression, expressionLanguage: 'DSL', detectionText: rule.logicDescription },
  pathConfig: rule.pathJson,
  timeConfig: rule.timeJson,
  aggregateConfig: rule.aggregateJson,
  exceptions: rule.exceptionJson,
  outputs: rule.outputJson,
  evidence: rule.evidenceJson.map((item) => item.name),
  policy: { name: rule.policyJson[0]?.name || '来源依据', version: rule.policyJson[0]?.version || '扩展版', clause: rule.policyJson[0]?.clause || '以导入工作簿来源依据为准' },
  policies: rule.policyJson,
  evidenceRequirements: rule.evidenceJson.map((item, index) => ({ id: item.id || `evidence-${index + 1}`, name: item.name, source: item.source, sourceField: item.sourceField, description: item.description || item.completeness || '' })),
  failureStrategy: rule.failureStrategy,
  summary: rule.summary,
  description: rule.description,
  lockVersion: 1,
  updatedAt: '2026-09-09 00:00:00',
  domain: rule.domain,
  libraryName: rule.libraryName,
  directoryName: rule.directoryName,
  objectCode: rule.objectCode,
  objectName: rule.objectName,
  eventCode: rule.eventCode,
  eventName: rule.eventName,
  ontologyId: rule.ontologyId,
  graphVersion: rule.graphVersion,
  bindingCount: 0,
  catalogBindingCount: 1,
}))
const frontendPath = new URL('../src/penetrativeSupervisionRules.ts', import.meta.url)
await fs.writeFile(frontendPath, `import type { RuleItem } from './sceneRuleTypes'\n\nexport const penetrativeSupervisionRules: RuleItem[] = ${JSON.stringify(frontendRows, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ added: { directories: directoryDefs.length, scenes: newScenes.length, modes: newModes.length, rules: newRules.length, bindings: newBindings.length }, totals: seed.metadata.counts }, null, 2))
