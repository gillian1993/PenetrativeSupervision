import fs from 'node:fs'
import path from 'node:path'
import mysql from 'mysql2/promise'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = path.join(root, 'outputs', 'rule_function_test_data_20260722')
const warningCodes = [
  'WA-FT-CROSS-03',
  'WA-FT-CROSS-01',
  'WA-DEMO-006',
  'WA-DEMO-003',
  'WA-FT-R12-HIT',
  'WA-FT-R04-HIT',
  'WA-FT-R06-BND',
  'WA-FT-R08-HIT',
  'WA-FT-R10-BND',
  'WA-FT-R02-BND',
]

const workflow = new Map([
  ['WA-FT-CROSS-03', { status: '待复核', owner: '尹晨阳', rectificationOwner: '王宁', dueAt: '2026-07-25 18:00:00', updatedAt: '2026-07-22 11:40:00', note: '整改材料已提交，等待监管负责人复核' }],
  ['WA-FT-CROSS-01', { status: '待整改', owner: '赵明', rectificationOwner: '赵明', dueAt: '2026-07-24 18:00:00', updatedAt: '2026-07-22 10:20:00', note: '已明确整改责任人，正在补充例外审批材料' }],
  ['WA-DEMO-006', { status: '待复核', owner: '尹晨阳', rectificationOwner: '王宁', dueAt: '2026-07-21 18:00:00', updatedAt: '2026-07-22 09:30:00', note: '保留一条逾期复核任务，用于验证催办和复核处置' }],
  ['WA-DEMO-003', { status: '待整改', owner: '周航', rectificationOwner: '周航', dueAt: '2026-07-20 18:00:00', updatedAt: '2026-07-22 08:50:00', note: '保留一条逾期整改任务，用于验证逾期处置' }],
  ['WA-FT-R12-HIT', { status: '待复核', owner: '李华', rectificationOwner: '王宁', dueAt: '2026-07-24 18:00:00', updatedAt: '2026-07-22 11:10:00', note: '资金流向说明与凭证已提交，等待复核' }],
  ['WA-FT-R04-HIT', { status: '待复核', owner: '尹晨阳', rectificationOwner: '周航', dueAt: '2026-07-25 18:00:00', updatedAt: '2026-07-22 10:45:00', note: '投标终端核查材料已提交，等待复核' }],
  ['WA-FT-R06-BND', { status: '待整改', owner: '王宁', rectificationOwner: '王宁', dueAt: '2026-07-26 18:00:00', updatedAt: '2026-07-22 10:05:00', note: '正在核实实际控制关系和责任边界' }],
  ['WA-FT-R08-HIT', { status: '待整改', owner: '赵明', rectificationOwner: '赵明', dueAt: '2026-07-27 18:00:00', updatedAt: '2026-07-22 09:55:00', note: '正在补充预算批复与公告时间说明' }],
  ['WA-FT-R10-BND', { status: '待整改', owner: '周航', rectificationOwner: '周航', dueAt: '2026-07-28 18:00:00', updatedAt: '2026-07-22 09:40:00', note: '正在补充专家抽取记录和审批依据' }],
  ['WA-FT-R02-BND', { status: '待整改', owner: '赵明', rectificationOwner: '赵明', dueAt: '2026-07-29 18:00:00', updatedAt: '2026-07-22 09:25:00', note: '正在补充非公开采购例外审批材料' }],
])

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
  await connection.query(`CREATE TABLE IF NOT EXISTS risk_event_workflow_snapshots (
    event_id VARCHAR(100) PRIMARY KEY,
    warning_code VARCHAR(80) NOT NULL UNIQUE,
    status VARCHAR(24) NOT NULL,
    owner_name VARCHAR(80) NOT NULL,
    rectification_owner_name VARCHAR(80) NULL,
    due_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    workflow_note VARCHAR(500) NOT NULL DEFAULT '',
    batch_id VARCHAR(80) NOT NULL,
    KEY idx_event_workflow_status (status, due_at),
    KEY idx_event_workflow_batch (batch_id),
    CONSTRAINT fk_event_workflow_warning FOREIGN KEY (warning_code) REFERENCES risk_warnings(warning_code) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  const [warnings] = await connection.query(
    'SELECT warning_code,batch_id,owner_name FROM risk_warnings WHERE warning_code IN (?) ORDER BY warning_code',
    [warningCodes],
  )
  if (warnings.length !== warningCodes.length) {
    const found = new Set(warnings.map((row) => row.warning_code))
    throw new Error(`缺少待调整预警：${warningCodes.filter((code) => !found.has(code)).join(', ')}`)
  }

  await connection.beginTransaction()
  try {
    const sql = `INSERT INTO risk_event_workflow_snapshots
      (event_id,warning_code,status,owner_name,rectification_owner_name,due_at,updated_at,workflow_note,batch_id)
      VALUES (?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE status=VALUES(status),owner_name=VALUES(owner_name),
        rectification_owner_name=VALUES(rectification_owner_name),due_at=VALUES(due_at),
        updated_at=VALUES(updated_at),workflow_note=VALUES(workflow_note),batch_id=VALUES(batch_id)`
    for (const warning of warnings) {
      const item = workflow.get(warning.warning_code)
      if (!item) throw new Error(`未配置工作流：${warning.warning_code}`)
      const eventId = `RE-${warning.warning_code.replace(/^WA-/, '')}`
      await connection.query(sql, [eventId, warning.warning_code, item.status, item.owner, item.rectificationOwner, item.dueAt, item.updatedAt, item.note, warning.batch_id])
    }
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  }

  const [statusCounts] = await connection.query(
    `SELECT status,COUNT(*) AS count,
      SUM(CASE WHEN status<>'已关闭' AND due_at<NOW() THEN 1 ELSE 0 END) AS overdue_count
      FROM risk_event_workflow_snapshots WHERE warning_code IN (?) GROUP BY status ORDER BY status`,
    [warningCodes],
  )
  const [rows] = await connection.query(
    `SELECT event_id,warning_code,status,owner_name,rectification_owner_name,due_at,updated_at,
      CASE WHEN status<>'已关闭' AND due_at<NOW() THEN 1 ELSE 0 END AS overdue
      FROM risk_event_workflow_snapshots WHERE warning_code IN (?) ORDER BY status,due_at,event_id`,
    [warningCodes],
  )
  const result = {
    adjustedAt: new Date().toISOString(),
    target,
    total: rows.length,
    statusCounts: statusCounts.map((row) => ({ status: row.status, count: Number(row.count), overdueCount: Number(row.overdue_count) })),
    totalOverdueEvents: rows.filter((row) => Number(row.overdue) === 1).length,
    rows,
  }
  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(path.join(outputDir, 'remote_workbench_workflow_adjustment_20260722.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(result, null, 2))
} finally {
  await connection.end()
}
