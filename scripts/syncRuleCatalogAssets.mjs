import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import { initializeDataGraphDatabase } from '../dataGraphApi.js'
import { initializeRuleCatalogDatabase, loadRuleCatalogSeed } from '../ruleCatalogService.js'
import { initializeSceneRuleDatabase } from '../sceneRuleService.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

function loadEnv() {
  const file = join(root, '.env.local')
  if (!existsSync(file)) return
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const index = line.indexOf('=')
    if (index < 1) continue
    const key = line.slice(0, index).trim()
    const value = line.slice(index + 1).trim().replace(/^[ '"]|[ '"]$/g, '').trim()
    if (process.env[key] === undefined) process.env[key] = value
  }
}

const json = (value) => JSON.stringify(value ?? null)
const marks = (items) => items.map(() => '?').join(',')
const ruleVersionId = (code) => `RAV-${code}-V01`

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
}

function sameJson(left, right) {
  return JSON.stringify(stable(parseJson(left, null))) === JSON.stringify(stable(right ?? null))
}

function sameText(left, right) {
  return String(left ?? '') === String(right ?? '')
}

function getCodeFilter() {
  const raw = process.argv.find((item) => item.startsWith('--codes='))
  if (!raw) return null
  const codes = raw.slice('--codes='.length).split(',').map((item) => item.trim().toUpperCase()).filter(Boolean)
  return codes.length ? new Set(codes) : null
}

function desiredRuleFields(rule) {
  return {
    name: rule.name,
    domain: rule.domain,
    object_code: rule.objectCode,
    object_name: rule.objectName,
    event_code: rule.eventCode,
    event_name: rule.eventName,
    ontology_id: rule.ontologyId,
    graph_version: rule.graphVersion,
    rule_type: rule.ruleType,
    risk_level: rule.level,
    condition_json: rule.conditionJson,
    path_json: rule.pathJson,
    time_json: rule.timeJson,
    aggregate_json: rule.aggregateJson,
    exception_json: rule.exceptionJson,
    output_json: rule.outputJson,
    evidence_json: rule.evidenceJson,
    policy_json: rule.policyJson,
    failure_strategy: rule.failureStrategy,
    summary: rule.summary,
  }
}

function ruleInsertValues(rule) {
  const desired = desiredRuleFields(rule)
  return [
    ruleVersionId(rule.code),
    rule.code,
    'v0.1',
    desired.name,
    desired.domain,
    desired.object_code,
    desired.object_name,
    desired.event_code,
    desired.event_name,
    desired.ontology_id,
    desired.graph_version,
    desired.rule_type,
    desired.risk_level,
    '草稿',
    json(desired.condition_json),
    json(desired.path_json),
    json(desired.time_json),
    json(desired.aggregate_json),
    json(desired.exception_json),
    json(desired.output_json),
    json(desired.evidence_json),
    json(desired.policy_json),
    desired.failure_strategy,
    desired.summary,
  ]
}

const scalarColumns = [
  'name',
  'domain',
  'object_code',
  'object_name',
  'event_code',
  'event_name',
  'ontology_id',
  'graph_version',
  'rule_type',
  'risk_level',
  'failure_strategy',
  'summary',
]

const jsonColumns = [
  'condition_json',
  'path_json',
  'time_json',
  'aggregate_json',
  'exception_json',
  'output_json',
  'evidence_json',
  'policy_json',
]

function changedColumns(row, desired) {
  const changes = []
  for (const column of scalarColumns) if (!sameText(row[column], desired[column])) changes.push(column)
  for (const column of jsonColumns) if (!sameJson(row[column], desired[column])) changes.push(column)
  return changes
}

async function main() {
  loadEnv()
  const apply = process.argv.includes('--apply')
  const codeFilter = getCodeFilter()
  const database = process.env.MYSQL_DATABASE || 'penetrative_supervision'
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database,
    waitForConnections: true,
    connectionLimit: 4,
    charset: 'utf8mb4',
  })
  try {
    await initializeSceneRuleDatabase(pool)
    await initializeDataGraphDatabase(pool)
    await initializeRuleCatalogDatabase(pool)
    const seed = await loadRuleCatalogSeed()
    const rules = seed.rules
      .filter((rule) => rule.ruleType !== '智能服务')
      .filter((rule) => !codeFilter || codeFilter.has(String(rule.code).toUpperCase()))
    const codes = rules.map((rule) => rule.code)
    const [rows] = codes.length
      ? await pool.query(
        `SELECT ra.id AS asset_id,ra.code,ra.status AS asset_status,rav.* FROM rule_assets ra JOIN rule_asset_versions rav ON rav.id=ra.current_version_id WHERE ra.code IN (${marks(codes)})`,
        codes,
      )
      : [[]]
    const currentByCode = new Map(rows.map((row) => [row.code, row]))
    const modes = new Map(seed.modes.map((item) => [item.code, item]))
    const rulesByCode = new Map(rules.map((item) => [item.code, item]))
    const modeCodesByRule = new Map()
    for (const binding of seed.bindings) {
      if (!rulesByCode.has(binding.ruleCode)) continue
      if (!modeCodesByRule.has(binding.ruleCode)) modeCodesByRule.set(binding.ruleCode, [])
      modeCodesByRule.get(binding.ruleCode).push(binding.modeCode)
    }
    const sceneCodes = [...new Set(seed.modes.map((item) => item.primarySceneCode).filter(Boolean))]
    const [sceneRows] = sceneCodes.length
      ? await pool.query(`SELECT code,current_version_id FROM risk_scenes WHERE code IN (${marks(sceneCodes)})`, sceneCodes)
      : [[]]
    const sceneVersionByCode = new Map(sceneRows.map((row) => [row.code, row.current_version_id]))
    const missing = []
    const created = []
    const changed = []
    for (const rule of rules) {
      const row = currentByCode.get(rule.code)
      if (!row) {
        missing.push(rule.code)
        if (apply) {
          const values = ruleInsertValues(rule)
          await pool.query("INSERT INTO rule_assets (id,code,current_version_id,status,created_by) VALUES (?,?,?,'草稿',?)", [rule.code, rule.code, ruleVersionId(rule.code), process.env.RULE_CATALOG_OPERATOR || '尹晨阳'])
          await pool.query(
            `INSERT INTO rule_asset_versions (id,rule_id,version,name,domain,object_code,object_name,event_code,event_name,ontology_id,graph_version,rule_type,risk_level,status,condition_json,path_json,time_json,aggregate_json,exception_json,output_json,evidence_json,policy_json,failure_strategy,summary) VALUES (${values.map(() => '?').join(',')})`,
            values,
          )
          const modeCodes = modeCodesByRule.get(rule.code) || []
          for (const modeCode of modeCodes) {
            await pool.query(
              'INSERT INTO pattern_rule_bindings (pattern_id,rule_version_id,binding_type,source_catalog) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE binding_type=VALUES(binding_type),source_catalog=VALUES(source_catalog)',
              [modeCode, ruleVersionId(rule.code), '主绑定', seed.metadata?.catalogCode || 'PROC-SC-RULE-CATALOG-20260721'],
            )
          }
          const relatedSceneCodes = [...new Set(modeCodes.map((modeCode) => modes.get(modeCode)?.primarySceneCode).filter(Boolean))]
          for (const sceneCode of relatedSceneCodes) {
            const sceneVersionId = sceneVersionByCode.get(sceneCode)
            if (!sceneVersionId) continue
            await pool.query(
              'INSERT INTO scene_rule_bindings (scene_version_id,rule_version_id,enabled,risk_level_override,parameters_json,priority) VALUES (?,?,0,NULL,?,100) ON DUPLICATE KEY UPDATE enabled=0,parameters_json=VALUES(parameters_json)',
              [sceneVersionId, ruleVersionId(rule.code), json({ syncSource: 'rule-catalog-assets', catalogCode: seed.metadata?.catalogCode || '', patternCodes: modeCodes, buildStatus: rule.buildStatus || '', sourceRuleCode: rule.currentMapping || '' })],
            )
          }
          created.push({ code: rule.code, name: rule.name, versionId: ruleVersionId(rule.code), status: '草稿', type: rule.ruleType })
        }
        continue
      }
      const desired = desiredRuleFields(rule)
      const columns = changedColumns(row, desired)
      if (!columns.length) continue
      changed.push({
        code: rule.code,
        name: rule.name,
        versionId: row.id,
        status: row.status,
        fromType: row.rule_type,
        toType: rule.ruleType,
        columns,
      })
      if (!apply) continue
      await pool.query(
        `UPDATE rule_asset_versions SET name=?,domain=?,object_code=?,object_name=?,event_code=?,event_name=?,ontology_id=?,graph_version=?,rule_type=?,risk_level=?,condition_json=?,path_json=?,time_json=?,aggregate_json=?,exception_json=?,output_json=?,evidence_json=?,policy_json=?,failure_strategy=?,summary=?,lock_version=lock_version+1 WHERE id=?`,
        [
          desired.name,
          desired.domain,
          desired.object_code,
          desired.object_name,
          desired.event_code,
          desired.event_name,
          desired.ontology_id,
          desired.graph_version,
          desired.rule_type,
          desired.risk_level,
          json(desired.condition_json),
          json(desired.path_json),
          json(desired.time_json),
          json(desired.aggregate_json),
          json(desired.exception_json),
          json(desired.output_json),
          json(desired.evidence_json),
          json(desired.policy_json),
          desired.failure_strategy,
          desired.summary,
          row.id,
        ],
      )
    }
    console.log(JSON.stringify({
      mode: apply ? 'apply' : 'dry-run',
      catalog: seed.metadata?.catalogCode || '',
      checked: rules.length,
      changed: changed.length,
      missing: missing.length,
      missingCodes: missing,
      created: created.length,
      createdRules: created,
      samples: changed.slice(0, 12),
    }, null, 2))
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})