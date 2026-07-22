import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = path.join(root, 'outputs', 'rule_function_test_data_20260722')
const sqlFiles = ['01_test_source_cases.sql', '02_expected_runtime.sql']

for (const name of sqlFiles) {
  const file = path.join(outputDir, name)
  const original = fs.readFileSync(file, 'utf8')
  const fixed = original
    .replaceAll(/'''(?=[{[])/g, "'")
    .replaceAll(/(?<=[}\]])'''/g, "'")
  if (fixed.includes("'''{")) throw new Error(`${name} 仍存在重复JSON引号`)
  fs.writeFileSync(file, fixed, 'utf8')
}

const readmeFile = path.join(outputDir, 'README.md')
const readme = fs.readFileSync(readmeFile, 'utf8')
  .replace(
    '应用接口支持通过环境变量`DEMO_BATCH_IDS`读取多个批次。导入本包后可配置：\n\n`DEMO_BATCH_IDS=DEMO-20260720-PKG-V1,RULE-TEST-20260722-V1`\n\n未配置时，代码默认同时识别原演示批次和本测试批次。',
    '当前`demoReadApi.js`仍固定读取原演示批次。完成数据库导入后，如需让现有页面直接展示本测试批次，需要再将接口读取范围扩展为原演示批次和`RULE-TEST-20260722-V1`。在接口调整前，可先通过`03_validation.sql`和`test_case_matrix.csv`完成数据验收。',
  )
fs.writeFileSync(readmeFile, readme, 'utf8')

const manifestFile = path.join(outputDir, 'manifest.json')
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
manifest.finalizedAt = '2026-07-22T18:30:00+08:00'
manifest.sqlValidation = Object.fromEntries(
  ['00_test_schema.sql', '01_test_source_cases.sql', '02_expected_runtime.sql', '03_validation.sql', '04_rollback.sql'].map((name) => {
    const content = fs.readFileSync(path.join(outputDir, name), 'utf8')
    return [name, {
      bytes: Buffer.byteLength(content),
      containsUndefined: content.includes('undefined'),
      containsNaN: content.includes('NaN'),
      containsTripleJsonQuote: /'''(?=[{[])/.test(content),
      statementTerminators: (content.match(/;/g) || []).length,
    }]
  }),
)
fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

const validationFile = path.join(outputDir, 'offline_validation.json')
const validation = JSON.parse(fs.readFileSync(validationFile, 'utf8'))
validation.finalizationChecks = {
  jsonSqlQuotingValid: sqlFiles.every((name) => !/'''(?=[{[])/.test(fs.readFileSync(path.join(outputDir, name), 'utf8'))),
  readmeMatchesCurrentApi: fs.readFileSync(readmeFile, 'utf8').includes('仍固定读取原演示批次'),
}
validation.passed = validation.passed && Object.values(validation.finalizationChecks).every(Boolean)
fs.writeFileSync(validationFile, `${JSON.stringify(validation, null, 2)}\n`, 'utf8')

console.log(JSON.stringify({ outputDir, passed: validation.passed, finalizationChecks: validation.finalizationChecks }, null, 2))
