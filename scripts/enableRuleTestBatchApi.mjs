import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const apiFile = path.join(root, 'demoReadApi.js')
let source = fs.readFileSync(apiFile, 'utf8')

const replacements = [
  [
    "const batchId='DEMO-20260720-PKG-V1'",
    "const defaultBatchIds=['DEMO-20260720-PKG-V1','RULE-TEST-20260722-V1']\nconst batchIds=String(process.env.DEMO_BATCH_IDS||defaultBatchIds.join(','))\n  .split(',').map((item)=>item.trim()).filter(Boolean)",
  ],
  [
    'WHERE w.batch_id=? ${where} ORDER BY w.risk_score DESC,w.generated_at DESC,w.warning_code`,[batchId,...params])',
    'WHERE w.batch_id IN (?) ${where} ORDER BY w.risk_score DESC,w.generated_at DESC,w.warning_code`,[batchIds,...params])',
  ],
  ['(SELECT COUNT(*) FROM graph_entities WHERE batch_id=?) AS entities,', '(SELECT COUNT(*) FROM graph_entities WHERE batch_id IN (?)) AS entities,'],
  ['(SELECT COUNT(*) FROM graph_relations WHERE batch_id=?) AS relations,', '(SELECT COUNT(*) FROM graph_relations WHERE batch_id IN (?)) AS relations,'],
  ['(SELECT COUNT(*) FROM graph_events WHERE batch_id=?) AS events,', '(SELECT COUNT(*) FROM graph_events WHERE batch_id IN (?)) AS events,'],
  ['(SELECT COUNT(*) FROM risk_warnings WHERE batch_id=?) AS warnings,', '(SELECT COUNT(*) FROM risk_warnings WHERE batch_id IN (?)) AS warnings,'],
  ['(SELECT COUNT(*) FROM risk_evidence WHERE batch_id=?) AS evidence,', '(SELECT COUNT(*) FROM risk_evidence WHERE batch_id IN (?)) AS evidence,'],
  ['(SELECT COUNT(*) FROM bid_evaluation_scores WHERE batch_id=?) AS bid_scores,', '(SELECT COUNT(*) FROM bid_evaluation_scores WHERE batch_id IN (?)) AS bid_scores,'],
  [
    '(SELECT COUNT(*) FROM trade_cycle_records WHERE batch_id=?) AS trade_records`,[batchId,batchId,batchId,batchId,batchId,batchId,batchId])',
    '(SELECT COUNT(*) FROM trade_cycle_records WHERE batch_id IN (?)) AS trade_records`,[batchIds,batchIds,batchIds,batchIds,batchIds,batchIds,batchIds])',
  ],
  [
    "pool.query('SELECT * FROM risk_evidence WHERE batch_id=? AND warning_code=? ORDER BY collected_at,evidence_id',[batchId,id])",
    "pool.query('SELECT * FROM risk_evidence WHERE batch_id IN (?) AND warning_code=? ORDER BY collected_at,evidence_id',[batchIds,id])",
  ],
  [
    "pool.query('SELECT * FROM graph_relations WHERE batch_id=? AND graph_id=? AND case_id=? ORDER BY id',[batchId,warning.graphVersion,warning.caseId])",
    "pool.query('SELECT * FROM graph_relations WHERE batch_id IN (?) AND graph_id=? AND case_id=? ORDER BY id',[batchIds,warning.graphVersion,warning.caseId])",
  ],
  [
    "pool.query('SELECT * FROM graph_events WHERE batch_id=? AND graph_id=? AND case_id=? ORDER BY event_time,id',[batchId,warning.graphVersion,warning.caseId])",
    "pool.query('SELECT * FROM graph_events WHERE batch_id IN (?) AND graph_id=? AND case_id=? ORDER BY event_time,id',[batchIds,warning.graphVersion,warning.caseId])",
  ],
  [
    "pool.query('SELECT * FROM graph_entities WHERE batch_id=? AND graph_id=? AND id IN (?) ORDER BY class_code,id',[batchId,warning.graphVersion,referencedIds])",
    "pool.query('SELECT * FROM graph_entities WHERE batch_id IN (?) AND graph_id=? AND id IN (?) ORDER BY class_code,id',[batchIds,warning.graphVersion,referencedIds])",
  ],
  [
    "pool.query('SELECT * FROM trade_cycle_records WHERE batch_id=? AND case_id=? ORDER BY business_time,business_id',[batchId,warning.caseId])",
    "pool.query('SELECT * FROM trade_cycle_records WHERE batch_id IN (?) AND case_id=? ORDER BY business_time,business_id',[batchIds,warning.caseId])",
  ],
  [
    "`SELECT * FROM graph_entities WHERE batch_id=? AND graph_id=?${caseId?' AND case_id=?':''} ORDER BY class_code,id`,caseId?[batchId,id,caseId]:[batchId,id]",
    "`SELECT * FROM graph_entities WHERE batch_id IN (?) AND graph_id=?${caseId?' AND case_id=?':''} ORDER BY class_code,id`,caseId?[batchIds,id,caseId]:[batchIds,id]",
  ],
  [
    "`SELECT * FROM graph_relations WHERE batch_id=? AND graph_id=?${caseId?' AND case_id=?':''} ORDER BY id`,caseId?[batchId,id,caseId]:[batchId,id]",
    "`SELECT * FROM graph_relations WHERE batch_id IN (?) AND graph_id=?${caseId?' AND case_id=?':''} ORDER BY id`,caseId?[batchIds,id,caseId]:[batchIds,id]",
  ],
  [
    "`SELECT * FROM graph_events WHERE batch_id=? AND graph_id=?${caseId?' AND case_id=?':''} ORDER BY event_time,id`,caseId?[batchId,id,caseId]:[batchId,id]",
    "`SELECT * FROM graph_events WHERE batch_id IN (?) AND graph_id=?${caseId?' AND case_id=?':''} ORDER BY event_time,id`,caseId?[batchIds,id,caseId]:[batchIds,id]",
  ],
  [
    "const params=[batchId];let where='WHERE batch_id=?'",
    "const params=[batchIds];let where='WHERE batch_id IN (?)'",
  ],
  [
    "pool.query('SELECT * FROM trade_cycle_records WHERE batch_id=? AND case_id=? ORDER BY business_time,business_id',[batchId,caseId])",
    "pool.query('SELECT * FROM trade_cycle_records WHERE batch_id IN (?) AND case_id=? ORDER BY business_time,business_id',[batchIds,caseId])",
  ],
]

let applied = 0
for (const [before, after] of replacements) {
  if (source.includes(after)) continue
  if (!source.includes(before)) throw new Error(`未找到待替换接口片段：${before.slice(0, 90)}`)
  source = source.replace(before, after)
  applied += 1
}

if (/\bbatchId\b/.test(source)) throw new Error('接口中仍存在单批次变量batchId')
const backup = `${apiFile}.before-rule-test-batch`
if (!fs.existsSync(backup)) fs.writeFileSync(backup, fs.readFileSync(apiFile, 'utf8'), 'utf8')
fs.writeFileSync(apiFile, source, 'utf8')

const envExampleFile = path.join(root, '.env.example')
let envExample = fs.readFileSync(envExampleFile, 'utf8')
if (!envExample.includes('DEMO_BATCH_IDS=')) {
  envExample = `${envExample.trimEnd()}\nDEMO_BATCH_IDS=DEMO-20260720-PKG-V1,RULE-TEST-20260722-V1\n`
  fs.writeFileSync(envExampleFile, envExample, 'utf8')
}

console.log(JSON.stringify({ apiFile, backup, applied, configuredBatches: ['DEMO-20260720-PKG-V1','RULE-TEST-20260722-V1'] }, null, 2))
