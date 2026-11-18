export const batchId = 'KG-DEMO-20261116-V1'

export async function initializeDemoRegistry(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS knowledge_graph_demo_assets (batch_id VARCHAR(64) NOT NULL,asset_type VARCHAR(16) NOT NULL,asset_id VARCHAR(64) NOT NULL,PRIMARY KEY(batch_id,asset_type,asset_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS knowledge_graph_demo_settings (id VARCHAR(64) PRIMARY KEY,value_json JSON NOT NULL,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
}
export async function registerDemoAsset(pool, type, id, batch) {
  if (batch !== batchId) return
  await pool.query('INSERT IGNORE INTO knowledge_graph_demo_assets (batch_id,asset_type,asset_id) VALUES (?,?,?)', [batchId, type, id])
}
export async function inheritDemoAsset(pool, type, from, to) {
  const [rows] = await pool.query('SELECT batch_id FROM knowledge_graph_demo_assets WHERE asset_type=? AND asset_id=? AND batch_id=?', [type, from, batchId])
  if (rows.length) await registerDemoAsset(pool, type, to, batchId)
}
