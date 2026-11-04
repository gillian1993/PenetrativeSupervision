import { createHash } from 'node:crypto'

const syncLockName = (id) => `graph-sync:${createHash('sha256').update(id).digest('hex').slice(0, 48)}`
const syncTime = (value) => value instanceof Date ? value.toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }) : String(value || '')

export async function initializeGraphSyncHistory(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS graph_sync_records (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    graph_id VARCHAR(64) NOT NULL,
    result_graph_id VARCHAR(64) NULL,
    lock_name VARCHAR(64) NOT NULL,
    status VARCHAR(24) NOT NULL,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME NULL,
    duration_ms BIGINT UNSIGNED NULL,
    entity_count INT NULL,
    relation_count INT NULL,
    error_message VARCHAR(1000) NOT NULL DEFAULT '',
    KEY idx_graph_sync_history (graph_id, id),
    KEY idx_graph_sync_result (result_graph_id, id),
    KEY idx_graph_sync_status (status),
    CONSTRAINT fk_graph_sync_origin FOREIGN KEY (graph_id) REFERENCES graph_versions(id) ON DELETE CASCADE,
    CONSTRAINT fk_graph_sync_result FOREIGN KEY (result_graph_id) REFERENCES graph_versions(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
}

export function mapGraphSyncRecord(row) {
  return {
    id: String(row.id), graphId: row.graph_id, resultGraphId: row.result_graph_id || null,
    status: row.status, startedAt: syncTime(row.started_at), finishedAt: syncTime(row.finished_at),
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    entities: row.entity_count == null ? null : Number(row.entity_count),
    relations: row.relation_count == null ? null : Number(row.relation_count),
    errorMessage: row.error_message || '',
  }
}

export async function recoverInterruptedGraphSyncs(pool) {
  // A lost database session releases its named lock, including after a server restart.
  const [rows] = await pool.query("SELECT id FROM graph_sync_records WHERE status='同步中' AND IS_USED_LOCK(lock_name) IS NULL")
  for (const row of rows) {
    await pool.query("UPDATE graph_sync_records SET status='失败',finished_at=NOW(),duration_ms=GREATEST(0,TIMESTAMPDIFF(SECOND,started_at,NOW())*1000),error_message='同步已中断，请重试' WHERE id=? AND status='同步中' AND IS_USED_LOCK(lock_name) IS NULL", [row.id])
  }
}

export async function withGraphSyncMetadata(pool, graphs) {
  if (!graphs.length) return graphs
  await recoverInterruptedGraphSyncs(pool)
  const [rows] = await pool.query(`SELECT g.id AS owner_id,d.synced_at AS data_synced_at,r.*
    FROM graph_versions g LEFT JOIN graph_instance_datasets d ON d.graph_id=g.id
    LEFT JOIN graph_sync_records r ON r.id=(SELECT MAX(s.id) FROM graph_sync_records s WHERE s.graph_id=g.id OR s.result_graph_id=g.id)
    WHERE g.id IN (${graphs.map(() => '?').join(',')})`, graphs.map((graph) => graph.id))
  const metadata = new Map(rows.map((row) => [row.owner_id, row]))
  return graphs.map((graph) => {
    const row = metadata.get(graph.id)
    return { ...graph, syncedAt: row?.data_synced_at ? syncTime(row.data_synced_at) : graph.syncedAt, latestSync: row?.id ? mapGraphSyncRecord(row) : null }
  })
}

export async function listGraphSyncRecords(pool, graphId) {
  const [graphs] = await pool.query('SELECT id FROM graph_versions WHERE id=?', [graphId])
  if (!graphs.length) throw Object.assign(new Error('知识图谱不存在'), { status: 404 })
  await recoverInterruptedGraphSyncs(pool)
  const [rows] = await pool.query('SELECT * FROM graph_sync_records WHERE graph_id=? OR result_graph_id=? ORDER BY id DESC LIMIT 100', [graphId, graphId])
  return rows.map(mapGraphSyncRecord)
}

export async function runTrackedGraphSync(pool, graphId, materialize) {
  await recoverInterruptedGraphSyncs(pool)
  const connection = await pool.getConnection()
  const lockName = syncLockName(graphId)
  const started = Date.now()
  let locked = false
  let recordId = null
  let transaction = false
  try {
    const [locks] = await connection.query('SELECT GET_LOCK(?,0) AS acquired', [lockName])
    locked = Number(locks[0].acquired) === 1
    if (!locked) throw Object.assign(new Error('该图谱正在同步，请勿重复提交'), { status: 409 })
    const [graphs] = await connection.query('SELECT status FROM graph_versions WHERE id=?', [graphId])
    if (!graphs.length) throw Object.assign(new Error('知识图谱不存在'), { status: 404 })
    if (!['待发布', '已发布'].includes(graphs[0].status)) throw Object.assign(new Error('请先完成图谱配置和数据映射，再同步数据'), { status: 409 })
    // Persist the running record before the dataset transaction so failures remain visible.
    const [record] = await connection.query("INSERT INTO graph_sync_records (graph_id,lock_name,status) VALUES (?,?,'同步中')", [graphId, lockName])
    recordId = record.insertId
    await connection.beginTransaction()
    transaction = true
    const result = await materialize(connection)
    await connection.query("UPDATE graph_sync_records SET status='成功',result_graph_id=?,finished_at=NOW(),duration_ms=?,entity_count=?,relation_count=? WHERE id=?", [result.id, Date.now() - started, result.entities, result.relations, recordId])
    await connection.commit()
    transaction = false
    return result
  } catch (error) {
    if (transaction) await connection.rollback()
    if (recordId) {
      const reason = error?.status ? String(error.message).slice(0, 1000) : '同步失败，请稍后重试'
      await connection.query("UPDATE graph_sync_records SET status='失败',finished_at=NOW(),duration_ms=?,error_message=? WHERE id=? AND status='同步中'", [Date.now() - started, reason, recordId])
    }
    throw error
  } finally {
    if (locked) await connection.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => undefined)
    connection.release()
  }
}
