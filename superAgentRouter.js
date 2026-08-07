import { answerSuperAgentQuestion, createSuperAgentDocument, deleteSuperAgentConversation, generateSuperAgentReport, getReport, getReview, getSuperAgentConversation, getSuperAgentDocument, getSuperAgentReviewJob, handleSuperAgentTurn, listSuperAgentConversations, listSuperAgentRules, retrySuperAgentReviewJob, runSuperAgentReview, startSuperAgentReviewJob, superAgentRuntimeInfo } from './superAgentService.js'
import { buildReportDocx } from './superAgentDocx.js'


function safeDownloadName(name) {
  return String(name || '检测报告').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 100) || '检测报告'
}

function sendDocx(res, report) {
  const buffer = buildReportDocx(report)
  const fileName = `${safeDownloadName(report.title || report.documentName)}.docx`
  res.writeHead(200, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'Content-Length': buffer.length,
    'Content-Disposition': `attachment; filename="report.docx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  })
  res.end(buffer)
}
async function readJsonBody(req, maxBytes = 25 * 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBytes) throw Object.assign(new Error('请求内容过大'), { status: 413 })
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : {}
}

export async function handleSuperAgentApi(req, res, url, { sendJson }) {
  if (!url.pathname.startsWith('/api/super-agent')) return false

  if (url.pathname === '/api/super-agent/runtime' && req.method === 'GET') {
    sendJson(res, 200, superAgentRuntimeInfo())
    return true
  }

  if (url.pathname === '/api/super-agent/rules' && req.method === 'GET') {
    sendJson(res, 200, listSuperAgentRules())
    return true
  }

  if (url.pathname === '/api/super-agent/conversations' && req.method === 'GET') {
    sendJson(res, 200, await listSuperAgentConversations())
    return true
  }

  const conversationMatch = url.pathname.match(/^\/api\/super-agent\/conversations\/([^/]+)$/)
  if (conversationMatch && req.method === 'GET') {
    const conversation = await getSuperAgentConversation(decodeURIComponent(conversationMatch[1]))
    sendJson(res, conversation ? 200 : 404, conversation || { message: '会话不存在' })
    return true
  }
  if (conversationMatch && req.method === 'DELETE') {
    await deleteSuperAgentConversation(decodeURIComponent(conversationMatch[1]))
    sendJson(res, 200, { ok: true })
    return true
  }
  if (url.pathname === '/api/super-agent/documents/upload' && req.method === 'POST') {
    const payload = await readJsonBody(req)
    sendJson(res, 201, await createSuperAgentDocument(payload))
    return true
  }

  const documentMatch = url.pathname.match(/^\/api\/super-agent\/documents\/([^/]+)$/)
  if (documentMatch && req.method === 'GET') {
    const document = await getSuperAgentDocument(decodeURIComponent(documentMatch[1]))
    sendJson(res, document ? 200 : 404, document || { message: '文档不存在' })
    return true
  }

  if (url.pathname === '/api/super-agent/review-jobs' && req.method === 'POST') {
    const payload = await readJsonBody(req)
    sendJson(res, 202, await startSuperAgentReviewJob(payload))
    return true
  }

  const reviewJobRetryMatch = url.pathname.match(/^\/api\/super-agent\/review-jobs\/([^/]+)\/retry$/)
  if (reviewJobRetryMatch && req.method === 'POST') {
    sendJson(res, 202, await retrySuperAgentReviewJob(decodeURIComponent(reviewJobRetryMatch[1])))
    return true
  }

  const reviewJobMatch = url.pathname.match(/^\/api\/super-agent\/review-jobs\/([^/]+)$/)
  if (reviewJobMatch && req.method === 'GET') {
    const job = await getSuperAgentReviewJob(decodeURIComponent(reviewJobMatch[1]))
    sendJson(res, job ? 200 : 404, job || { message: '审查任务不存在' })
    return true
  }
  if (url.pathname === '/api/super-agent/reviews' && req.method === 'POST') {
    const payload = await readJsonBody(req)
    sendJson(res, 201, await runSuperAgentReview(Array.isArray(payload.documentIds) && payload.documentIds.length ? payload.documentIds : payload.documentId))
    return true
  }

  const reviewMatch = url.pathname.match(/^\/api\/super-agent\/reviews\/([^/]+)$/)
  if (reviewMatch && req.method === 'GET') {
    const review = await getReview(decodeURIComponent(reviewMatch[1]))
    sendJson(res, review ? 200 : 404, review || { message: '审查报告不存在' })
    return true
  }

  if (url.pathname === '/api/super-agent/turn' && req.method === 'POST') {
    const payload = await readJsonBody(req)
    sendJson(res, 200, await handleSuperAgentTurn(payload))
    return true
  }

  if (url.pathname === '/api/super-agent/reports' && req.method === 'POST') {
    const payload = await readJsonBody(req)
    sendJson(res, 201, await generateSuperAgentReport(payload.reviewId))
    return true
  }

  const reportDocxMatch = url.pathname.match(/^\/api\/super-agent\/reports\/([^/]+)\/docx$/)
  if (reportDocxMatch && req.method === 'GET') {
    const report = await getReport(decodeURIComponent(reportDocxMatch[1]))
    if (!report) sendJson(res, 404, { message: '检测报告不存在' })
    else sendDocx(res, report)
    return true
  }
  const reportMatch = url.pathname.match(/^\/api\/super-agent\/reports\/([^/]+)$/)
  if (reportMatch && req.method === 'GET') {
    const report = await getReport(decodeURIComponent(reportMatch[1]))
    sendJson(res, report ? 200 : 404, report || { message: '检测报告不存在' })
    return true
  }

  if (url.pathname === '/api/super-agent/chat' && req.method === 'POST') {
    const payload = await readJsonBody(req)
    sendJson(res, 200, await answerSuperAgentQuestion(payload))
    return true
  }

  sendJson(res, 404, { message: '超级智能体接口不存在' })
  return true
}




