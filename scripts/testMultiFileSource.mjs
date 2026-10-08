import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ExcelJS from 'exceljs'

const base = process.env.APP_BASE || 'http://127.0.0.1:4173'

async function request(path, init) {
  const response = await fetch(`${base}${path}`, init)
  const body = await response.json()
  if (!response.ok) throw new Error(`${response.status}: ${body.message || path}`)
  return body
}

async function upload(id, name, content, type) {
  const body = new FormData()
  body.append('file', new Blob([content], { type }), name)
  return request(`/api/data-sources/${id}/files`, { method: 'POST', body })
}

let sourceId = ''
try {
  const source = await request('/api/data-sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `多文件导入测试 ${Date.now()}`, mode: '文件导入', range: '', owner: '张海', accessConfig: {} }),
  })
  sourceId = source.id
  await assert.rejects(request(`/api/data-sources/${sourceId}/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: true }),
  }), /请先上传并解析至少一份数据文件/)
  await upload(sourceId, '供应商.csv', await readFile(new URL('./fixtures/suppliers.csv', import.meta.url)), 'text/csv')
  await upload(sourceId, '订单.csv', await readFile(new URL('./fixtures/orders.csv', import.meta.url)), 'text/csv')
  await assert.rejects(upload(sourceId, '订单.csv', 'order_id,amount\nA002,300\n', 'text/csv'), /同名文件已存在/)

  const workbook = new ExcelJS.Workbook()
  workbook.addWorksheet('采购订单').addRows([['order_id', 'supplier_id'], ['A001', '1']])
  workbook.addWorksheet('付款记录').addRows([['payment_id', 'amount'], ['P001', 200]])
  await upload(sourceId, '采购数据.xlsx', Buffer.from(await workbook.xlsx.writeBuffer()), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

  const files = await request(`/api/data-sources/${sourceId}/files`)
  assert.equal(files.length, 3)
  assert.equal(files.find((file) => file.name === '采购数据.xlsx')?.sheetCount, 2)

  const metadata = await request(`/api/data-sources/${sourceId}/metadata`)
  assert.equal(metadata.length, 4)
  assert.deepEqual(metadata.find((item) => item.displayName === '供应商.csv')?.fields, ['supplier_id', 'supplier_name'])
  assert.deepEqual(metadata.find((item) => item.displayName === '采购数据.xlsx · 付款记录')?.fields, ['payment_id', 'amount'])

  const list = await request('/api/data-sources')
  assert.equal(list.find((item) => item.id === sourceId)?.fileCount, 3)

  await request(`/api/data-sources/${sourceId}/files/${files.find((file) => file.name === '订单.csv').id}`, { method: 'DELETE' })
  assert.equal((await request(`/api/data-sources/${sourceId}/files`)).length, 2)
  console.log('Multi-file source upload, parse, list, and removal passed')
} finally {
  if (sourceId) await request(`/api/data-sources/${sourceId}`, { method: 'DELETE' })
}
