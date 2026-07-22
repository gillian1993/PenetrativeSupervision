import fs from 'node:fs'
import path from 'node:path'
import mysql from 'mysql2/promise'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageDir = path.join(root, 'outputs', 'rule_function_test_data_20260722')
const batchId = 'RULE-TEST-20260722-V1'
const baseBatchId = 'DEMO-20260720-PKG-V1'
const graphId = 'GRAPH-PROC-DEMO-20260720.1'
const expected = {
  supervision_organizations: 7,
  rule_test_cases: 93,
  unique_test_scenarios: 88,
  rule_run_records: 93,
  risk_warnings: 32,
  risk_evidence: 96,
  risk_warning_org_links: 32,
  graph_entities: 176,
  graph_relations: 79,
  graph_events: 79,
}

function loadEnv(file) {
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 1) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnv(path.join(root, '.env.local'))
const database = process.env.MYSQL_DATABASE || ''
if (!/^[A-Za-z0-9_]+$/.test(database)) throw new Error('MYSQL_DATABASE包含不安全字符')

const target = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  database,
  user: process.env.MYSQL_USER || '',
}
const connection = await mysql.createConnection({
  ...target,
  password: process.env.MYSQL_PASSWORD || '',
  charset: 'utf8mb4',
  multipleStatements: true,
  dateStrings: true,
  connectTimeout: 15000,
})

const output = (name, value) => fs.writeFileSync(path.join(packageDir, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
const scalar = async (sql, params = []) => {
  const [rows] = await connection.query(sql, params)
  return Number(Object.values(rows[0] || {})[0] || 0)
}
const rows = async (sql, params = []) => (await connection.query(sql, params))[0]
const tableExists = async (name) => await scalar('SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema=? AND table_name=?', [database, name]) === 1
const loadSql = (name) => fs.readFileSync(path.join(packageDir, name), 'utf8').replaceAll(/USE\s+`penetrative_supervision_demo`\s*;/gi, `USE \`${database}\`;`)

async function batchCounts(id) {
  const result = {}
  for (const table of ['graph_entities','graph_relations','graph_events','risk_warnings','risk_evidence']) {
    result[table] = await tableExists(table) ? await scalar(`SELECT COUNT(*) AS count FROM \`${table}\` WHERE batch_id=?`, [id]) : 0
  }
  result.rule_run_records = await tableExists('rule_run_records')
    ? await scalar("SELECT COUNT(*) AS count FROM rule_run_records WHERE JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.importBatch'))=?", [id])
    : 0
  for (const table of ['supervision_organizations','rule_test_cases','risk_warning_org_links']) {
    result[table] = await tableExists(table) ? await scalar(`SELECT COUNT(*) AS count FROM \`${table}\` WHERE batch_id=?`, [id]) : 0
  }
  return result
}

async function snapshotExistingBatch() {
  const snapshots = {}
  const specs = [
    ['supervision_organizations', 'batch_id=?'],
    ['rule_test_cases', 'batch_id=?'],
    ['graph_entities', 'batch_id=?'],
    ['graph_relations', 'batch_id=?'],
    ['graph_events', 'batch_id=?'],
    ['risk_warnings', 'batch_id=?'],
    ['risk_evidence', 'batch_id=?'],
    ['risk_warning_org_links', 'batch_id=?'],
  ]
  for (const [table, where] of specs) {
    if (await tableExists(table)) snapshots[table] = await rows(`SELECT * FROM \`${table}\` WHERE ${where}`, [batchId])
  }
  if (await tableExists('rule_run_records')) snapshots.rule_run_records = await rows("SELECT * FROM rule_run_records WHERE JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.importBatch'))=?", [batchId])
  return snapshots
}

async function rollbackNewBatch() {
  const deleteSpecs = [
    ['risk_warning_org_links', 'batch_id=?'],
    ['risk_evidence', 'batch_id=?'],
    ['risk_warnings', 'batch_id=?'],
    ['rule_run_records', "JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.importBatch'))=?"],
    ['graph_events', 'batch_id=?'],
    ['graph_relations', 'batch_id=?'],
    ['graph_entities', 'batch_id=?'],
    ['rule_test_cases', 'batch_id=?'],
    ['supervision_organizations', 'batch_id=?'],
    ['demo_import_batches', 'batch_id=?'],
  ]
  for (const [table, where] of deleteSpecs) {
    if (await tableExists(table)) await connection.query(`DELETE FROM \`${table}\` WHERE ${where}`, [batchId])
  }
}

const startedAt = new Date().toISOString()
let preflight
let existingTestCounts
let baseCountsBefore
let hadExistingTestData = false
let stage = { preflight: false, schema: false, source: false, runtime: false, validated: false, rollback: false }

try {
  const [serverRows] = await connection.query('SELECT VERSION() AS version, @@hostname AS hostname, NOW() AS serverTime, DATABASE() AS currentDatabase')
  const requiredTables = ['rule_asset_versions','scene_versions','graph_versions','graph_entities','graph_relations','graph_events','risk_warnings','risk_evidence','rule_run_records','demo_import_batches']
  const missingTables = []
  for (const table of requiredTables) if (!await tableExists(table)) missingTables.push(table)
  const ruleIds = Array.from({ length: 14 }, (_, index) => `RAV-RULE-DEMO-${String(index + 1).padStart(3, '0')}-V10`)
  const publishedRuleCount = missingTables.length ? 0 : await scalar('SELECT COUNT(*) AS count FROM rule_asset_versions WHERE id IN (?) AND status=?', [ruleIds, '已发布'])
  const graphVersionCount = missingTables.length ? 0 : await scalar('SELECT COUNT(*) AS count FROM graph_versions WHERE id=?', [graphId])
  existingTestCounts = await batchCounts(batchId)
  baseCountsBefore = await batchCounts(baseBatchId)
  hadExistingTestData = Object.values(existingTestCounts).some((value) => value > 0)
  preflight = {
    checkedAt: new Date().toISOString(),
    target,
    server: serverRows[0],
    requiredTables,
    missingTables,
    publishedRuleCount,
    graphVersionCount,
    existingTestCounts,
    baseCountsBefore,
    existingTestSnapshot: hadExistingTestData ? await snapshotExistingBatch() : {},
  }
  output('remote_rule_test_preimport_20260722.json', preflight)
  if (missingTables.length) throw new Error(`远程库缺少基础表：${missingTables.join(', ')}`)
  if (publishedRuleCount !== 14) throw new Error(`远程已发布演示规则应为14条，实际${publishedRuleCount}条`)
  if (graphVersionCount !== 1) throw new Error(`远程图谱版本${graphId}不存在`)
  stage.preflight = true

  await connection.query(loadSql('00_test_schema.sql'))
  stage.schema = true
  await connection.query(loadSql('01_test_source_cases.sql'))
  stage.source = true
  await connection.query(loadSql('02_expected_runtime.sql'))
  stage.runtime = true

  const actual = await batchCounts(batchId)
  actual.unique_test_scenarios = await scalar('SELECT COUNT(DISTINCT test_case_id) AS count FROM rule_test_cases WHERE batch_id=?', [batchId])
  const countChecks = Object.fromEntries(Object.entries(expected).map(([name, count]) => [name, { expected: count, actual: actual[name], passed: actual[name] === count }]))
  const anomalies = {
    outcomeMismatch: await scalar(`SELECT COUNT(*) AS count FROM rule_test_cases tc LEFT JOIN rule_run_records rr ON rr.rule_version_id=tc.rule_version_id AND JSON_UNQUOTE(JSON_EXTRACT(rr.evidence_json,'$.testCaseId'))=tc.test_case_id WHERE tc.batch_id=? AND (rr.id IS NULL OR rr.outcome<>tc.expected_outcome)`, [batchId]),
    expectedWarningMissing: await scalar(`SELECT COUNT(*) AS count FROM rule_test_cases tc LEFT JOIN risk_warnings w ON w.warning_code=tc.expected_warning_code WHERE tc.batch_id=? AND tc.expected_warning=1 AND w.warning_code IS NULL`, [batchId]),
    unexpectedWarning: await scalar(`SELECT COUNT(*) AS count FROM risk_warnings w LEFT JOIN rule_test_cases tc ON tc.batch_id=w.batch_id AND tc.expected_warning=1 AND tc.expected_warning_code=w.warning_code WHERE w.batch_id=? AND tc.test_case_id IS NULL`, [batchId]),
    evidenceCountMismatch: await scalar(`SELECT COUNT(*) AS count FROM risk_warnings w LEFT JOIN (SELECT warning_code,COUNT(*) AS actual_count FROM risk_evidence WHERE batch_id=? GROUP BY warning_code) e ON e.warning_code=w.warning_code WHERE w.batch_id=? AND w.evidence_count<>COALESCE(e.actual_count,0)`, [batchId, batchId]),
    organizationLinkMismatch: await scalar(`SELECT COUNT(*) AS count FROM risk_warnings w LEFT JOIN risk_warning_org_links l ON l.warning_code=w.warning_code LEFT JOIN supervision_organizations o ON o.id=l.organization_id WHERE w.batch_id=? AND (l.warning_code IS NULL OR o.id IS NULL OR w.organization_name<>l.organization_name_snapshot)`, [batchId]),
    relationEndpointMissing: await scalar(`SELECT COUNT(*) AS count FROM graph_relations r LEFT JOIN graph_entities f ON f.graph_id=r.graph_id AND f.id=r.from_entity_id LEFT JOIN graph_entities t ON t.graph_id=r.graph_id AND t.id=r.to_entity_id WHERE r.batch_id=? AND (f.id IS NULL OR t.id IS NULL)`, [batchId]),
    eventObjectMissing: await scalar(`SELECT COUNT(*) AS count FROM graph_events e LEFT JOIN graph_entities n ON n.graph_id=e.graph_id AND n.id=e.object_entity_id WHERE e.batch_id=? AND n.id IS NULL`, [batchId]),
    baseVariantCoverageMismatch: await scalar(`SELECT COUNT(*) AS count FROM (SELECT rule_code,COUNT(DISTINCT variant_code) AS variants FROM rule_test_cases WHERE batch_id=? AND variant_code<>'CROSS' GROUP BY rule_code HAVING variants<>6) x`, [batchId]),
  }
  const baseCountsAfter = await batchCounts(baseBatchId)
  const baseBatchPreserved = Object.keys(baseCountsBefore).every((key) => baseCountsBefore[key] === baseCountsAfter[key])
  const organizationRiskRank = await rows(`SELECT l.organization_id,l.organization_name_snapshot,COUNT(*) AS warning_count,ROUND(SUM(w.risk_score),2) AS total_risk_score FROM risk_warnings w JOIN risk_warning_org_links l ON l.warning_code=w.warning_code WHERE w.batch_id=? GROUP BY l.organization_id,l.organization_name_snapshot ORDER BY total_risk_score DESC,warning_count DESC`, [batchId])
  const sampleWarnings = await rows(`SELECT warning_code,title,risk_level,status,organization_name,risk_score,hit_rule_count FROM risk_warnings WHERE batch_id=? ORDER BY risk_score DESC,warning_code LIMIT 10`, [batchId])
  const passed = Object.values(countChecks).every((item) => item.passed) && Object.values(anomalies).every((value) => value === 0) && baseBatchPreserved
  const validation = { validatedAt: new Date().toISOString(), target, batchId, actual, countChecks, anomalies, baseCountsBefore, baseCountsAfter, baseBatchPreserved, organizationRiskRank, sampleWarnings, passed }
  output('remote_rule_test_postimport_validation_20260722.json', validation)
  if (!passed) throw new Error('远程导入后验收未通过')
  stage.validated = true
  const result = { startedAt, finishedAt: new Date().toISOString(), target, batchId, hadExistingTestData, stage, validationFile: 'remote_rule_test_postimport_validation_20260722.json', passed: true }
  output('remote_rule_test_import_result_20260722.json', result)
  console.log(JSON.stringify({ ...result, counts: actual, anomalies, baseBatchPreserved, organizationRiskRank }, null, 2))
} catch (error) {
  try { await connection.query('ROLLBACK') } catch {}
  if (!hadExistingTestData) {
    try {
      await rollbackNewBatch()
      stage.rollback = true
    } catch (rollbackError) {
      stage.rollbackError = rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
    }
  }
  const failure = { startedAt, failedAt: new Date().toISOString(), target, batchId, hadExistingTestData, stage, error: error instanceof Error ? error.message : String(error), passed: false }
  output('remote_rule_test_import_result_20260722.json', failure)
  console.error(JSON.stringify(failure, null, 2))
  process.exitCode = 1
} finally {
  await connection.end()
}
