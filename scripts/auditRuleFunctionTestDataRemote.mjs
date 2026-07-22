import fs from 'node:fs'
import path from 'node:path'
import mysql from 'mysql2/promise'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = path.join(root, 'outputs', 'rule_function_test_data_20260722')
const batchId = 'RULE-TEST-20260722-V1'

for (const rawLine of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const line = rawLine.trim()
  if (!line || line.startsWith('#')) continue
  const separator = line.indexOf('=')
  if (separator < 1) continue
  const key = line.slice(0, separator).trim()
  if (!process.env[key]) process.env[key] = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
}

const database = process.env.MYSQL_DATABASE || ''
if (!/^[A-Za-z0-9_]+$/.test(database)) throw new Error('MYSQL_DATABASE包含不安全字符')
const target = { host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), database, user: process.env.MYSQL_USER }
const connection = await mysql.createConnection({ ...target, password: process.env.MYSQL_PASSWORD || '', charset: 'utf8mb4', dateStrings: true, connectTimeout: 15000 })

try {
  const [server] = await connection.query('SELECT CONNECTION_ID() AS connectionId, VERSION() AS version, NOW() AS serverTime, DATABASE() AS currentDatabase')
  const [counts] = await connection.query(`SELECT
    (SELECT COUNT(*) FROM rule_test_cases WHERE batch_id=?) AS testCaseRows,
    (SELECT COUNT(DISTINCT test_case_id) FROM rule_test_cases WHERE batch_id=?) AS testScenarios,
    (SELECT COUNT(*) FROM rule_run_records WHERE JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.importBatch'))=?) AS ruleRuns,
    (SELECT COUNT(*) FROM risk_warnings WHERE batch_id=?) AS warnings,
    (SELECT COUNT(*) FROM risk_evidence WHERE batch_id=?) AS evidence,
    (SELECT COUNT(*) FROM graph_entities WHERE batch_id=?) AS entities,
    (SELECT COUNT(*) FROM graph_relations WHERE batch_id=?) AS relations,
    (SELECT COUNT(*) FROM graph_events WHERE batch_id=?) AS events,
    (SELECT COUNT(*) FROM risk_warning_org_links WHERE batch_id=?) AS organizationLinks`, Array(9).fill(batchId))
  const [outcomes] = await connection.query(`SELECT outcome,COUNT(*) AS count FROM rule_run_records WHERE JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.importBatch'))=? GROUP BY outcome ORDER BY outcome`, [batchId])
  const [warnings] = await connection.query(`SELECT warning_code,title,risk_level,status,organization_name,risk_score,hit_rule_count FROM risk_warnings WHERE batch_id=? ORDER BY risk_score DESC,warning_code LIMIT 8`, [batchId])
  const [rank] = await connection.query(`SELECT l.organization_id,l.organization_name_snapshot,COUNT(*) AS warning_count,ROUND(SUM(w.risk_score),2) AS total_risk_score FROM risk_warnings w JOIN risk_warning_org_links l ON l.warning_code=w.warning_code WHERE w.batch_id=? GROUP BY l.organization_id,l.organization_name_snapshot ORDER BY total_risk_score DESC`, [batchId])
  const expected = { testCaseRows: 93, testScenarios: 88, ruleRuns: 93, warnings: 32, evidence: 96, entities: 176, relations: 79, events: 79, organizationLinks: 32 }
  const actual = Object.fromEntries(Object.entries(counts[0]).map(([key, value]) => [key, Number(value)]))
  const passed = Object.entries(expected).every(([key, value]) => actual[key] === value)
  const audit = { auditedAt: new Date().toISOString(), target, server: server[0], batchId, expected, actual, outcomes, warnings, organizationRiskRank: rank, passed }
  fs.writeFileSync(path.join(outputDir, 'remote_rule_test_readback_20260722.json'), `${JSON.stringify(audit, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(audit, null, 2))
  if (!passed) process.exitCode = 1
} finally {
  await connection.end()
}
