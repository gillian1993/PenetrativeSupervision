import fs from 'node:fs'
const args = process.argv.slice(2)
const base = args.includes('--base-url') ? args[args.indexOf('--base-url') + 1] : 'http://127.0.0.1:4173'
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw new Error('仅支持本机演示服务地址')
const apply = args.includes('--apply') || args.includes('--reset')
const endpoint = `${base}/api/knowledge-graph-demo/${apply ? 'prepare' : 'status'}`
console.log(apply ? '正在恢复并构建独立批次演示资产；外部引用检查通过后才会恢复本批次。' : '只读预览；使用 --apply 准备样例，--reset 恢复初始样例。')
const response = await fetch(endpoint, apply ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(240000) } : undefined)
const result = await response.json()
if (!response.ok) throw new Error(result.message || '准备失败')
console.log(JSON.stringify(result, null, 2))
if (apply) {
  fs.mkdirSync('outputs/knowledge-graph-demo-plan', { recursive: true })
  fs.writeFileSync('outputs/knowledge-graph-demo-plan/已安装演示批次.json', `${JSON.stringify(result, null, 2)}\n`)
}
