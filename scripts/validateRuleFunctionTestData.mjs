import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = path.join(root, 'outputs', 'rule_function_test_data_20260722')
const manifest = JSON.parse(fs.readFileSync(path.join(outputDir, 'manifest.json'), 'utf8'))
const sqlNames = ['00_test_schema.sql', '01_test_source_cases.sql', '02_expected_runtime.sql', '03_validation.sql', '04_rollback.sql']

function quotedValues(sql) {
  const values = []
  for (let index = 0; index < sql.length; index += 1) {
    if (sql[index] !== "'") continue
    let value = ''
    index += 1
    while (index < sql.length) {
      if (sql[index] === "'" && sql[index + 1] === "'") {
        value += "'"
        index += 2
        continue
      }
      if (sql[index] === "'") break
      value += sql[index]
      index += 1
    }
    values.push(value)
  }
  return values
}

function statements(sql) {
  const result = []
  let value = ''
  let quoted = false
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]
    value += char
    if (char === "'") {
      if (quoted && sql[index + 1] === "'") {
        value += sql[index + 1]
        index += 1
      } else {
        quoted = !quoted
      }
    }
    if (char === ';' && !quoted) {
      result.push(value.trim())
      value = ''
    }
  }
  if (value.trim()) result.push(value.trim())
  return result
}

const fileChecks = {}
let parsedJsonValues = 0
for (const name of sqlNames) {
  const content = fs.readFileSync(path.join(outputDir, name), 'utf8')
  const jsonValues = quotedValues(content).filter((value) => value.trim().startsWith('{') || value.trim().startsWith('['))
  for (const value of jsonValues) JSON.parse(value)
  parsedJsonValues += jsonValues.length
  const parsedStatements = statements(content)
  fileChecks[name] = {
    noUndefined: !content.includes('undefined'),
    noNaN: !content.includes('NaN'),
    noTripleJsonQuote: !/'''(?=[{[])/.test(content),
    quotesBalanced: (content.match(/'/g) || []).length % 2 === 0,
    statements: parsedStatements.length,
    transactionBalanced: parsedStatements.filter((item) => /START TRANSACTION/i.test(item)).length === parsedStatements.filter((item) => /^COMMIT/i.test(item)).length,
    jsonValues: jsonValues.length,
  }
}

const csv = fs.readFileSync(path.join(outputDir, 'test_case_matrix.csv'), 'utf8').replace(/^\uFEFF/, '')
const csvDataRows = csv.trim().split(/\r?\n/).length - 1
const checks = {
  ...Object.fromEntries(Object.entries(fileChecks).flatMap(([name, values]) => Object.entries(values).filter(([, value]) => typeof value === 'boolean').map(([key, value]) => [`${name}:${key}`, value]))),
  csvRowsMatchManifest: csvDataRows === manifest.counts.ruleTestRows,
  manifestCountsExpected: manifest.counts.ruleTestRows === 93 && manifest.counts.uniqueTestScenarios === 88 && manifest.counts.warnings === 32,
  allFourteenRulesCovered: manifest.coverage.publishedRules === 14,
  sixBaseVariantsCovered: manifest.coverage.baseVariantsPerRule === 6,
  fourCompositeScenariosCovered: manifest.coverage.multiRuleScenarios === 4,
  enoughJsonPayloadsParsed: parsedJsonValues >= 300,
}

const failed = Object.entries(checks).filter(([, value]) => !value)
const result = { passed: failed.length === 0, failed, parsedJsonValues, csvDataRows, fileChecks, counts: manifest.counts }
console.log(JSON.stringify(result, null, 2))
if (failed.length) process.exitCode = 1
