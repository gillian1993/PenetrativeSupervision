// Serialize changes to a source while its saved configuration is being tested.
export async function withSourceOperation(pool, id, getSource, action) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.query('SELECT id FROM data_sources WHERE id=? FOR UPDATE', [id])
    if (!rows.length) throw Object.assign(new Error('数据源不存在'), { status: 404 })
    const source = await getSource(connection, id)
    const error = await action(connection, source)
    const updated = await getSource(connection, id)
    await connection.commit()
    return { source: updated, error }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}
