import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateRawSync, inflateSync } from 'node:zlib'
import { callSuperAgentModel, getSuperAgentModelName } from './llmClient.js'
import { publicRules, superAgentRules } from './superAgentRules.js'

const root = fileURLToPath(new URL('.', import.meta.url))
const dataRoot = resolve(root, '.super-agent-data')
const documentRoot = join(dataRoot, 'documents')
const reviewRoot = join(dataRoot, 'reviews')
const reportRoot = join(dataRoot, 'reports')
const conversationRoot = join(dataRoot, 'conversations')
const reviewJobRoot = join(dataRoot, 'review-jobs')
const maxUploadBytes = Number(process.env.SUPER_AGENT_MAX_UPLOAD_BYTES || 20 * 1024 * 1024)
const reviewTextLimit = Number(process.env.SUPER_AGENT_REVIEW_TEXT_LIMIT || 28000)
const quickReviewTextLimit = Math.max(6000, Math.min(reviewTextLimit, Number(process.env.SUPER_AGENT_QUICK_REVIEW_TEXT_LIMIT || 14000)))
const reviewRuleBatchSize = Math.min(superAgentRules.length || 1, Math.max(1, Math.floor(Number(process.env.SUPER_AGENT_RULE_BATCH_SIZE) || 8)))
const reviewRuleBatchConcurrency = Math.min(superAgentRules.length || 1, Math.max(1, Math.floor(Number(process.env.SUPER_AGENT_RULE_BATCH_CONCURRENCY) || 3)))
const reviewPrecheckIssueLimit = Math.max(0, Math.floor(Number(process.env.SUPER_AGENT_PRECHECK_ISSUE_LIMIT) || 18))
const reviewVerifyHighRiskDuringReview = /^(1|true|yes)$/i.test(String(process.env.SUPER_AGENT_VERIFY_HIGH_RISK_DURING_REVIEW || ''))
const runningReviewJobs = new Set()

async function ensureStorage() {
  await mkdir(documentRoot, { recursive: true })
  await mkdir(reviewRoot, { recursive: true })
  await mkdir(reportRoot, { recursive: true })
  await mkdir(conversationRoot, { recursive: true })
  await mkdir(reviewJobRoot, { recursive: true })
}

function nowText() {
  return new Date().toLocaleString('zh-CN', { hour12: false }).replaceAll('/', '-')
}

function sanitizeFileName(name) {
  return String(name || '未命名文档').replace(/[\\/:*?"<>|]/g, '_').slice(0, 160)
}

function fail(status, message) {
  throw Object.assign(new Error(message), { status })
}

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function stripXmlToText(xml) {
  return decodeXmlEntities(String(xml || '')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<\/w:tc>/g, '\t')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n'))
    .trim()
}

function readUInt32LE(buffer, offset) {
  return offset + 4 <= buffer.length ? buffer.readUInt32LE(offset) : 0
}

function readUInt16LE(buffer, offset) {
  return offset + 2 <= buffer.length ? buffer.readUInt16LE(offset) : 0
}

function getZipEntry(buffer, entryName) {
  let eocd = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 66000); i--) {
    if (readUInt32LE(buffer, i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) return null
  const total = readUInt16LE(buffer, eocd + 10)
  let cursor = readUInt32LE(buffer, eocd + 16)
  for (let index = 0; index < total && cursor + 46 <= buffer.length; index++) {
    if (readUInt32LE(buffer, cursor) !== 0x02014b50) break
    const method = readUInt16LE(buffer, cursor + 10)
    const compressedSize = readUInt32LE(buffer, cursor + 20)
    const nameLength = readUInt16LE(buffer, cursor + 28)
    const extraLength = readUInt16LE(buffer, cursor + 30)
    const commentLength = readUInt16LE(buffer, cursor + 32)
    const localOffset = readUInt32LE(buffer, cursor + 42)
    const name = buffer.slice(cursor + 46, cursor + 46 + nameLength).toString('utf8')
    if (name === entryName && readUInt32LE(buffer, localOffset) === 0x04034b50) {
      const localNameLength = readUInt16LE(buffer, localOffset + 26)
      const localExtraLength = readUInt16LE(buffer, localOffset + 28)
      const dataStart = localOffset + 30 + localNameLength + localExtraLength
      const compressed = buffer.slice(dataStart, dataStart + compressedSize)
      if (method === 0) return compressed
      if (method === 8) return inflateRawSync(compressed)
      return null
    }
    cursor += 46 + nameLength + extraLength + commentLength
  }
  return null
}

function extractDocxText(buffer) {
  const names = ['word/document.xml']
  for (let i = 1; i <= 12; i++) names.push(`word/header${i}.xml`, `word/footer${i}.xml`)
  names.push('word/footnotes.xml', 'word/endnotes.xml')
  const parts = []
  for (const name of names) {
    const entry = getZipEntry(buffer, name)
    if (entry) {
      const text = stripXmlToText(entry.toString('utf8'))
      if (text) parts.push(text)
    }
  }
  return parts.join('\n\n').trim()
}

function decodePdfLiteral(value) {
  return String(value || '')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
}

function extractPdfStrings(text) {
  const parts = []
  const literalPattern = /\((?:\\.|[^\\)]){2,}\)\s*Tj/g
  for (const match of text.matchAll(literalPattern)) parts.push(decodePdfLiteral(match[0].replace(/\)\s*Tj$/, '').slice(1)))
  const arrayPattern = /\[(.*?)\]\s*TJ/gs
  for (const match of text.matchAll(arrayPattern)) {
    const inner = match[1]
    const strings = [...inner.matchAll(/\((?:\\.|[^\\)])*\)/g)].map((item) => decodePdfLiteral(item[0].slice(1, -1)))
    if (strings.length) parts.push(strings.join(''))
  }
  return parts.join('\n')
}

function extractPdfText(buffer) {
  const binary = buffer.toString('latin1')
  const parts = [extractPdfStrings(binary)]
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g
  for (const match of binary.matchAll(streamPattern)) {
    const start = Buffer.byteLength(binary.slice(0, match.index || 0), 'latin1') + Buffer.byteLength(match[0].slice(0, match[0].indexOf(match[1])), 'latin1')
    const raw = buffer.slice(start, start + Buffer.byteLength(match[1], 'latin1'))
    try { parts.push(extractPdfStrings(inflateSync(raw).toString('latin1'))) } catch {}
  }
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function normalizeText(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractDocumentText(buffer, ext) {
  const suffix = ext.toLowerCase()
  if (['.txt', '.md', '.markdown'].includes(suffix)) return normalizeText(buffer.toString('utf8'))
  if (suffix === '.docx') return normalizeText(extractDocxText(buffer))
  if (suffix === '.pdf') return normalizeText(extractPdfText(buffer))
  fail(400, '暂不支持该文件格式，请上传 txt、md、docx 或带文本层的 pdf')
}

function briefText(text, limit = 1200) {
  const value = normalizeText(text)
  return value.length > limit ? `${value.slice(0, limit)}...` : value
}

function chunkCount(text) {
  return Math.max(1, Math.ceil(String(text || '').length / 5000))
}

async function saveDocument(document, buffer, text) {
  const dir = join(documentRoot, document.id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, `original${document.ext}`), buffer)
  await writeFile(join(dir, 'text.txt'), text, 'utf8')
  await writeFile(join(dir, 'meta.json'), JSON.stringify({ ...document, text: undefined }, null, 2), 'utf8')
}

async function loadDocument(id) {
  const dir = join(documentRoot, String(id || ''))
  if (!existsSync(join(dir, 'meta.json'))) return null
  const meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8'))
  const text = await readFile(join(dir, 'text.txt'), 'utf8')
  return { ...meta, text }
}

function publicDocumentInfo(document) {
  const { text, ...publicDocument } = document
  return publicDocument
}

function normalizeDocumentIds(input) {
  const values = Array.isArray(input) ? input : input ? [input] : []
  const seen = new Set()
  return values
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .filter((id) => {
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
}

function documentIdsFromPayload(payload) {
  if (Array.isArray(payload?.documentIds) && payload.documentIds.length) return normalizeDocumentIds(payload.documentIds)
  return normalizeDocumentIds(payload?.documentId)
}

async function loadDocuments(ids, required = false) {
  const normalizedIds = normalizeDocumentIds(ids)
  if (required && !normalizedIds.length) fail(400, '请先上传需要处理的文档')
  const documents = []
  for (const id of normalizedIds) {
    const document = await loadDocument(id)
    if (!document && required) fail(404, '文档不存在，请重新上传')
    if (document) documents.push(document)
  }
  if (required && !documents.length) fail(404, '文档不存在，请重新上传')
  return documents
}

function bundleDocuments(documents) {
  if (!documents.length) return null
  if (documents.length === 1) {
    const document = documents[0]
    return {
      ...document,
      documentIds: [document.id],
      sourceDocuments: [publicDocumentInfo(document)],
    }
  }
  const text = documents.map((document, index) => `【文档${index + 1}：${document.fileName}】\n${document.text}`).join('\n\n')
  const sourceDocuments = documents.map(publicDocumentInfo)
  return {
    id: documents.map((document) => document.id).join(','),
    documentIds: documents.map((document) => document.id),
    sourceDocuments,
    fileName: `${baseDocumentName(documents[0].fileName)}等${documents.length}篇材料`,
    mimeType: 'multi-document',
    ext: '.bundle',
    size: documents.reduce((sum, document) => sum + Number(document.size || 0), 0),
    characters: text.length,
    chunks: chunkCount(text),
    preview: briefText(text),
    uploadedAt: documents.map((document) => document.uploadedAt).filter(Boolean).slice(-1)[0] || nowText(),
    parser: 'multi-document-bundle',
    text,
  }
}

async function loadDocumentBundle(ids, options = {}) {
  const documents = await loadDocuments(ids, Boolean(options.required))
  return bundleDocuments(documents)
}

function reviewDocumentIds(review) {
  return normalizeDocumentIds(Array.isArray(review?.documentIds) && review.documentIds.length ? review.documentIds : review?.documentId)
}

function sameDocumentSet(review, ids) {
  const left = reviewDocumentIds(review)
  const right = normalizeDocumentIds(ids)
  return left.length === right.length && left.every((id, index) => id === right[index])
}
async function saveReview(review) {
  await ensureStorage()
  await writeFile(join(reviewRoot, `${review.id}.json`), JSON.stringify(review, null, 2), 'utf8')
}

export async function getReview(id) {
  const file = join(reviewRoot, `${String(id || '')}.json`)
  if (!existsSync(file)) return null
  return JSON.parse(await readFile(file, 'utf8'))
}

async function saveReport(report) {
  await ensureStorage()
  await writeFile(join(reportRoot, `${report.id}.json`), JSON.stringify(report, null, 2), 'utf8')
}

export async function getReport(id) {
  const file = join(reportRoot, `${String(id || '')}.json`)
  if (!existsSync(file)) return null
  return JSON.parse(await readFile(file, 'utf8'))
}

function normalizeConversationId(value) {
  const id = String(value || '').trim()
  return id && /^[A-Za-z0-9_.:-]{3,120}$/.test(id) ? id : `CONV-${randomUUID()}`
}

function conversationFile(id) {
  return join(conversationRoot, `${normalizeConversationId(id)}.json`)
}

function normalizeConversationMessages(messages, limit = 40) {
  const list = Array.isArray(messages) ? messages : []
  return list
    .filter((item) => ['user', 'assistant'].includes(item?.role) && String(item?.content || '').trim())
    .map((item) => ({
      id: String(item.id || `MSG-${randomUUID()}`),
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: String(item.content || '').slice(0, 6000),
      kind: ['chat', 'review', 'report', 'rectification'].includes(item.kind) ? item.kind : 'chat',
      status: ['done', 'error'].includes(item.status) ? item.status : 'done',
      createdAt: item.createdAt || nowText(),
    }))
    .slice(-limit)
}

function mergeDialogueHistory(storedMessages, payloadMessages) {
  const stored = normalizeConversationMessages(storedMessages, 30)
  const payload = normalizeConversationMessages(payloadMessages, 30)
  const preferred = payload.length > stored.length ? payload : stored
  return preferred.map((item) => ({ role: item.role, content: item.content }))
}

function conversationTitle(question, fallback = '新对话') {
  const text = String(question || fallback || '新对话').replace(/\s+/g, ' ').trim()
  return text.length > 24 ? `${text.slice(0, 24)}...` : text || '新对话'
}

async function saveSuperAgentConversation(record) {
  await ensureStorage()
  const id = normalizeConversationId(record.id)
  const next = {
    id,
    title: conversationTitle(record.title || record.lastUserMessage || '', '新对话'),
    updatedAt: nowText(),
    documentIds: normalizeDocumentIds(record.documentIds),
    reviewId: record.reviewId || '',
    reportId: record.reportId || '',
    lastIntent: record.lastIntent || 'chat',
    messages: normalizeConversationMessages(record.messages, 60),
  }
  await writeFile(conversationFile(id), JSON.stringify(next, null, 2), 'utf8')
  return next
}

export async function getSuperAgentConversation(id) {
  await ensureStorage()
  const safeId = normalizeConversationId(id)
  const file = join(conversationRoot, `${safeId}.json`)
  if (!existsSync(file)) return null
  return JSON.parse(await readFile(file, 'utf8'))
}

export async function listSuperAgentConversations() {
  await ensureStorage()
  const { readdir } = await import('node:fs/promises')
  const files = await readdir(conversationRoot).catch(() => [])
  const conversations = []
  for (const file of files.filter((name) => name.endsWith('.json'))) {
    try {
      const item = JSON.parse(await readFile(join(conversationRoot, file), 'utf8'))
      conversations.push(item)
    } catch {}
  }
  return conversations.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
}

export async function deleteSuperAgentConversation(id) {
  await ensureStorage()
  const safeId = normalizeConversationId(id)
  const file = join(conversationRoot, `${safeId}.json`)
  if (!existsSync(file)) return false
  await unlink(file)
  return true
}
function normalizeReviewJobId(value) {
  const id = String(value || '').trim()
  return id && /^[A-Za-z0-9_.:-]{3,120}$/.test(id) ? id : `JOB-${randomUUID()}`
}

function reviewJobFile(id) {
  return join(reviewJobRoot, `${normalizeReviewJobId(id)}.json`)
}

function reviewJobDoneStatus(status) {
  return ['completed', 'partial', 'failed'].includes(String(status || ''))
}

function safeModelErrorMessage(error) {
  return String(error?.message || '模型服务调用失败').replace(/^模型接口调用失败：/, '').slice(0, 240)
}

async function loadReviewJob(id) {
  await ensureStorage()
  const file = reviewJobFile(id)
  if (!existsSync(file)) return null
  return JSON.parse(await readFile(file, 'utf8'))
}

async function saveReviewJob(job) {
  await ensureStorage()
  const id = normalizeReviewJobId(job?.id)
  const next = { ...job, id, updatedAt: nowText() }
  await writeFile(reviewJobFile(id), JSON.stringify(next, null, 2), 'utf8')
  return next
}

function sortedBatchResults(job) {
  return (Array.isArray(job?.batchResults) ? job.batchResults : []).slice().sort((a, b) => Number(a.batch || 0) - Number(b.batch || 0))
}

function recomputeReviewJobStats(job) {
  const results = sortedBatchResults(job)
  const resultFindings = results.flatMap((item) => Array.isArray(item.findings) ? item.findings : [])
  const findings = results.length ? resultFindings : Array.isArray(job.findings) ? job.findings : []
  const riskItems = Array.isArray(job.riskItems) && job.riskItems.length ? job.riskItems : aggregateReviewRiskItems(findings)
  const itemStats = riskItemStats(riskItems)
  const failedFindings = findings.filter(isRiskFinding)
  const insufficientFindings = findings.filter(isInsufficientFinding)
  job.batchResults = results
  job.findings = findings
  if (riskItems.length) job.riskItems = riskItems
  job.completedBatches = results.filter((item) => item.status === 'completed').length
  job.failedBatches = results.filter((item) => item.status === 'failed').length
  job.processedBatches = job.completedBatches + job.failedBatches
  job.findingsCount = itemStats.riskItemCount || failedFindings.length
  job.riskCount = itemStats.riskItemCount || failedFindings.length
  job.insufficientCount = itemStats.materialGapCount || insufficientFindings.length
  job.passedCount = Math.max(0, findings.length - failedFindings.length - insufficientFindings.length)
  job.highCount = itemStats.highRiskItemCount || failedFindings.filter((item) => item.severity === '高').length
  job.mediumCount = itemStats.mediumRiskItemCount || failedFindings.filter((item) => item.severity === '中').length
  job.lowCount = itemStats.lowRiskItemCount || failedFindings.filter((item) => item.severity === '低').length
  const batchProgress = job.totalBatches ? Math.min(100, Math.round((job.processedBatches / job.totalBatches) * 100)) : 0
  const quickProgress = job.quickReviewId && !reviewJobDoneStatus(job.status) ? 15 : job.stage === 'prechecking' ? 5 : 0
  job.progress = Math.max(batchProgress, quickProgress)
  return job
}
function upsertBatchResult(job, result) {
  const results = Array.isArray(job.batchResults) ? job.batchResults.slice() : []
  const index = results.findIndex((item) => Number(item.batch) === Number(result.batch))
  if (index >= 0) results[index] = { ...results[index], ...result }
  else results.push(result)
  job.batchResults = results
  return recomputeReviewJobStats(job)
}

function failedFindingsForBatch(batchRules, batchIndex, error) {
  const message = safeModelErrorMessage(error)
  return batchRules.map((rule, index) => ({
    id: `FIND-${String(batchIndex * reviewRuleBatchSize + index + 1).padStart(3, '0')}`,
    ruleId: rule.id,
    ruleName: rule.name,
    category: rule.category || '综合',
    severity: rule.severity || '中',
    status: 'insufficient',
    statusText: '证据不足',
    passed: true,
    issue: '',
    evidence: '',
    suggestion: '该规则组未形成可靠模型结论，建议稍后重试该审查任务或降低单次文档数量后复核。',
    reason: `该规则组调用失败，未纳入风险命中统计：${message}`,
  }))
}

function publicReviewJobPayload(job, review = null) {
  if (!job) return null
  const { findings, batchResults, ...publicJob } = job
  const batches = sortedBatchResults(job).map((item) => ({
    batch: item.batch,
    status: item.status,
    ruleIds: item.ruleIds || [],
    errorMessage: item.errorMessage || '',
    model: item.model || '',
    finishedAt: item.finishedAt || '',
  }))
  return { ...publicJob, batchResults: batches, review: review || undefined }
}

async function publicReviewJob(job) {
  const review = job?.reviewId ? await getReview(job.reviewId) : null
  return publicReviewJobPayload(job, review)
}

function reviewJobProgressText(job) {
  const failed = Number(job.failedBatches || 0)
  const riskText = `已识别风险线索：高 ${job.highCount || 0} / 中 ${job.mediumCount || 0} / 低 ${job.lowCount || 0}；待补充材料 ${job.insufficientCount || 0} 项`
  const retryText = failed ? '。部分审查分组暂未形成可靠结论，系统会保留已完成结果' : ''
  return `审查任务 ${job.id} 正在后台执行。审查进度：${job.progress || 0}%。${riskText}${retryText}。当前会话审查中，暂不可继续输入；你可以切换到其他会话或新建对话。完成后我会给出风险清单和报告入口。`
}
function completedReviewJobAnswer(job, review) {
  if (!review) return `审查任务 ${job.id} 已结束，但未生成可用审查结果。请稍后重试。`
  const partialText = job.status === 'partial' ? '部分审查分组未形成可靠结论，已先汇总成功结果，建议后续重试补齐。\n' : ''
  const documentLabel = review.documentCount && review.documentCount > 1 ? `${review.documentCount} 篇文档` : '当前文档'
  const stats = riskItemStats(reviewRiskItems(review))
  return `${partialText}已完成${documentLabel}审查。综合评分 ${review.score} 分，结论：${review.conclusion}\n本次识别主要风险 ${stats.riskItemCount} 项，其中高风险 ${stats.highRiskItemCount} 项、中风险 ${stats.mediumRiskItemCount} 项、低风险 ${stats.lowRiskItemCount} 项；另有 ${stats.materialGapCount} 项材料需补充核验。\n你可以继续追问具体风险、要求生成整改清单，或生成正式检测报告。`
}
async function appendReviewJobConversation(job, answer, status = 'done') {
  if (!job?.conversationId || !answer) return
  const conversation = await getSuperAgentConversation(job.conversationId)
  if (!conversation) return
  const assistantEntry = { id: `MSG-${randomUUID()}`, role: 'assistant', content: answer, kind: 'review', status, createdAt: nowText() }
  await saveSuperAgentConversation({
    id: job.conversationId,
    title: conversation.title || job.title || '文档审查',
    documentIds: job.documentIds,
    reviewId: job.reviewId || conversation.reviewId || '',
    reportId: conversation.reportId || '',
    lastIntent: 'review',
    messages: [...normalizeConversationMessages(conversation.messages, 58), assistantEntry],
  })
}

function scheduleReviewJob(id) {
  const safeId = normalizeReviewJobId(id)
  if (runningReviewJobs.has(safeId)) return
  runningReviewJobs.add(safeId)
  setTimeout(() => {
    runReviewJob(safeId)
      .catch((error) => console.error('超级智能体审查任务失败', safeId, error))
      .finally(() => runningReviewJobs.delete(safeId))
  }, 0)
}

export async function getSuperAgentReviewJob(id) {
  const job = await loadReviewJob(id)
  if (!job) return null
  if ((job.status === 'queued' || job.status === 'running') && !runningReviewJobs.has(job.id)) scheduleReviewJob(job.id)
  return publicReviewJob(job)
}

export async function startSuperAgentReviewJob(payload = {}) {
  await ensureStorage()
  const question = String(payload.message || '帮我进行文档审查').trim()
  const documentIds = documentIdsFromPayload(payload)
  if (!documentIds.length) fail(400, '请先上传需要审查的一篇或多篇文档')
  const document = await loadDocumentBundle(documentIds, { required: true })
  if (!document) fail(404, '文档不存在，请重新上传')
  const conversationId = normalizeConversationId(payload.conversationId)
  const storedConversation = await getSuperAgentConversation(conversationId)
  const currentReviewId = payload.reviewId ? String(payload.reviewId) : String(storedConversation?.reviewId || '')
  const currentReview = currentReviewId ? await getReview(currentReviewId) : null
  const batches = chunkArray(superAgentRules, reviewRuleBatchSize)
  const sourceDocuments = document.sourceDocuments || [publicDocumentInfo(document)]
  const baseMessages = normalizeConversationMessages(storedConversation?.messages?.length ? storedConversation.messages : payload.messages, 50)
  const userEntry = { id: `MSG-${randomUUID()}`, role: 'user', content: question, kind: 'review', status: 'done', createdAt: nowText() }

  if (currentReview && sameDocumentSet(currentReview, documentIds) && !shouldRerunReview(question)) {
    const job = recomputeReviewJobStats({
      id: `JOB-${randomUUID()}`,
      conversationId,
      title: conversationTitle(question),
      question,
      status: 'completed',
      stage: 'completed',
      documentIds,
      documentName: currentReview.documentName,
      documentCount: currentReview.documentCount || sourceDocuments.length || 1,
      totalCharacters: currentReview.totalTextCharacters || document.characters,
      checkedTextCharacters: currentReview.checkedTextCharacters || document.text.length,
      ruleCount: superAgentRules.length,
      totalBatches: batches.length,
      batchSize: reviewRuleBatchSize,
      batchConcurrency: reviewRuleBatchConcurrency,
      batchResults: [],
      findings: currentReview.findings || [],
      reviewId: currentReview.id,
      reportId: '',
      createdAt: nowText(),
      startedAt: nowText(),
      completedAt: nowText(),
      progress: 100,
    })
    job.completedBatches = job.totalBatches
    job.processedBatches = job.totalBatches
    job.progress = 100
    await saveReviewJob(job)
    const answer = completedReviewJobAnswer(job, currentReview)
    const assistantEntry = { id: `MSG-${randomUUID()}`, role: 'assistant', content: answer, kind: 'review', status: 'done', createdAt: nowText() }
    await saveSuperAgentConversation({
      id: conversationId,
      title: storedConversation?.title || conversationTitle(question),
      documentIds,
      reviewId: currentReview.id,
      reportId: '',
      lastIntent: 'review',
      messages: [...baseMessages, userEntry, assistantEntry],
    })
    return publicReviewJobPayload(job, currentReview)
  }

  const job = recomputeReviewJobStats({
    id: `JOB-${randomUUID()}`,
    conversationId,
    title: conversationTitle(question),
    question,
    status: 'queued',
    stage: 'queued',
    documentIds,
    documentName: document.fileName,
    documentCount: sourceDocuments.length || 1,
    totalCharacters: document.characters,
    checkedTextCharacters: document.text.length,
    ruleCount: superAgentRules.length,
    totalBatches: batches.length,
    batchSize: reviewRuleBatchSize,
    batchConcurrency: reviewRuleBatchConcurrency,
    batchResults: [],
    findings: [],
    reviewId: '',
    reportId: '',
    errorMessage: '',
    createdAt: nowText(),
    startedAt: '',
    completedAt: '',
  })
  const saved = await saveReviewJob(job)
  const assistantEntry = { id: `MSG-${randomUUID()}`, role: 'assistant', content: reviewJobProgressText(saved), kind: 'review', status: 'done', createdAt: nowText() }
  await saveSuperAgentConversation({
    id: conversationId,
    title: storedConversation?.title || conversationTitle(question),
    documentIds,
    reviewId: '',
    reportId: '',
    lastIntent: 'review',
    messages: [...baseMessages, userEntry, assistantEntry],
  })
  scheduleReviewJob(saved.id)
  return publicReviewJob(saved)
}

export async function retrySuperAgentReviewJob(id) {
  const source = await loadReviewJob(id)
  if (!source) fail(404, '审查任务不存在')
  if (!['failed', 'partial'].includes(source.status)) return publicReviewJob(source)
  const completedBatches = sortedBatchResults(source).filter((item) => item.status === 'completed')
  const retryJob = recomputeReviewJobStats({
    ...source,
    id: `JOB-${randomUUID()}`,
    status: 'queued',
    stage: 'queued',
    batchResults: completedBatches,
    reviewId: '',
    reportId: '',
    errorMessage: '',
    createdAt: nowText(),
    startedAt: '',
    completedAt: '',
  })
  const saved = await saveReviewJob(retryJob)
  scheduleReviewJob(saved.id)
  return publicReviewJob(saved)
}

async function runReviewJob(id) {
  let job = await loadReviewJob(id)
  if (!job || reviewJobDoneStatus(job.status)) return
  try {
    const document = await loadDocumentBundle(job.documentIds, { required: true })
    if (!document) fail(404, '文档不存在，请重新上传')
    const text = document.text
    const batches = chunkArray(superAgentRules, reviewRuleBatchSize)
    job.status = 'running'
    job.stage = 'running'
    job.startedAt = job.startedAt || nowText()
    job.totalBatches = batches.length
    job.ruleCount = superAgentRules.length
    job.batchSize = reviewRuleBatchSize
    job.batchConcurrency = reviewRuleBatchConcurrency
    job = await saveReviewJob(recomputeReviewJobStats(job))

    job.stage = 'prechecking'
    job = await saveReviewJob(recomputeReviewJobStats(job))
    const precheck = await extractGlobalIssueHints(document)
    const issueHints = precheck.issues || []
    job.precheckIssueCount = issueHints.length
    job.precheckErrorMessage = precheck.errorMessage || ''
    job.precheckModel = precheck.model || ''
    if (issueHints.length || !precheck.errorMessage) {
      const quickReview = normalizeQuickRiskReview(precheck, document, {
        jobId: job.id,
        precheck: {
          issueCount: issueHints.length,
          model: precheck.model || '',
          errorMessage: precheck.errorMessage || '',
        },
      })
      await saveReview(quickReview)
      job.quickReviewId = quickReview.id
      job.quickReviewCompletedAt = nowText()
      job.reviewId = quickReview.id
      job.riskItems = quickReview.riskItems || []
      job.stage = 'quick-risk-ready'
    }
    job = await saveReviewJob(recomputeReviewJobStats(job))

    const completedBatchNumbers = new Set(sortedBatchResults(job).filter((item) => item.status === 'completed').map((item) => Number(item.batch)))
    const pending = batches.map((batchRules, batchIndex) => ({ batchRules, batchIndex })).filter((item) => !completedBatchNumbers.has(item.batchIndex + 1))
    let nextIndex = 0
    const workers = Array.from({ length: Math.min(reviewRuleBatchConcurrency, pending.length || 1) }, async () => {
      while (nextIndex < pending.length) {
        const currentIndex = nextIndex
        nextIndex += 1
        const { batchRules, batchIndex } = pending[currentIndex]
        job.currentBatch = batchIndex + 1
        job.stage = `reviewing-batch-${batchIndex + 1}`
        await saveReviewJob(recomputeReviewJobStats(job))
        try {
          const output = await reviewRuleBatch(document, text, batchRules, batchIndex, batches.length, issueHints)
          upsertBatchResult(job, {
            ...output.batchResult,
            status: 'completed',
            findings: output.findings,
            finishedAt: nowText(),
          })
        } catch (error) {
          upsertBatchResult(job, {
            batch: batchIndex + 1,
            ruleIds: batchRules.map((rule) => rule.id),
            status: 'failed',
            errorMessage: safeModelErrorMessage(error),
            findings: failedFindingsForBatch(batchRules, batchIndex, error),
            finishedAt: nowText(),
          })
        }
        await saveReviewJob(recomputeReviewJobStats(job))
      }
    })
    await Promise.all(workers)

    const results = sortedBatchResults(job)
    const successful = results.filter((item) => item.status === 'completed')
    const failed = results.filter((item) => item.status === 'failed')
    if (!successful.length) {
      job.status = job.quickReviewId ? 'partial' : 'failed'
      job.stage = job.status
      job.completedAt = nowText()
      job.errorMessage = failed.map((item) => item.errorMessage).filter(Boolean).slice(0, 2).join('；') || '全部规则组审查失败'
      job = await saveReviewJob(recomputeReviewJobStats(job))
      if (job.quickReviewId) {
        const quickReview = await getReview(job.quickReviewId)
        await appendReviewJobConversation(job, `${completedReviewJobAnswer(job, quickReview)}
后台规则追溯未能完整完成：${job.errorMessage}。`, 'done')
      } else {
        await appendReviewJobConversation(job, `审查任务 ${job.id} 未能完成：${job.errorMessage}。当前文档解析结果已保留，请稍后重试。`, 'error')
      }
      return
    }

    const findings = results.flatMap((item) => Array.isArray(item.findings) ? item.findings : [])
    const usage = {
      mode: 'review-job',
      jobId: job.id,
      batchSize: reviewRuleBatchSize,
      batchConcurrency: reviewRuleBatchConcurrency,
      batchCount: batches.length,
      failedBatches: failed.map((item) => item.batch),
      quickReviewId: job.quickReviewId || '',
      precheck: {
        issueCount: issueHints.length,
        model: precheck.model || '',
        errorMessage: precheck.errorMessage || '',
      },
      batches: results.map(({ batch, ruleIds, status, usage, issueHintCount }) => ({ batch, ruleIds, status, usage, issueHintCount })),
    }
    const model = successful.map((item) => item.model).find(Boolean) || getSuperAgentModelName()
    const review = normalizeReview(buildBatchedReviewRaw(findings, batches.length, job.riskItems || []), document, model, usage)
    await saveReview(review)
    job.reviewId = review.id
    job.fullReviewId = review.id
    job.riskItems = review.riskItems || []
    job.status = failed.length ? 'partial' : 'completed'
    job.stage = job.status
    job.completedAt = nowText()
    job.errorMessage = failed.length ? '部分规则未形成可靠结论' : ''
    job = await saveReviewJob(recomputeReviewJobStats(job))
    await appendReviewJobConversation(job, completedReviewJobAnswer(job, review), 'done')
  } catch (error) {
    job = job || { id: normalizeReviewJobId(id) }
    job.status = 'failed'
    job.stage = 'failed'
    job.completedAt = nowText()
    job.errorMessage = safeModelErrorMessage(error)
    await saveReviewJob(recomputeReviewJobStats(job))
    await appendReviewJobConversation(job, `审查任务 ${job.id} 未能完成：${job.errorMessage}。当前文档解析结果已保留，请稍后重试。`, 'error')
  }
}

export async function createSuperAgentDocument(payload) {
  await ensureStorage()
  const fileName = sanitizeFileName(payload.fileName)
  const ext = extname(fileName).toLowerCase()
  if (!ext) fail(400, '无法识别文件类型')
  const base64 = String(payload.base64 || '').replace(/^data:[^,]+,/, '')
  if (!base64) fail(400, '上传内容为空')
  const buffer = Buffer.from(base64, 'base64')
  if (!buffer.length) fail(400, '上传文件为空')
  if (buffer.length > maxUploadBytes) fail(413, `上传文件超过限制，最大 ${Math.round(maxUploadBytes / 1024 / 1024)}MB`)
  const text = extractDocumentText(buffer, ext)
  if (!text || text.length < 20) fail(422, '文档解析结果过短，请确认文件包含可复制文本')
  const document = {
    id: `DOC-${randomUUID()}`,
    fileName,
    mimeType: String(payload.mimeType || ''),
    ext,
    size: buffer.length,
    characters: text.length,
    chunks: chunkCount(text),
    preview: briefText(text),
    uploadedAt: nowText(),
    parser: ext === '.pdf' ? 'pdf-text-layer' : ext === '.docx' ? 'docx-openxml' : 'plain-text',
  }
  await saveDocument(document, buffer, text)
  return document
}

function normalizeJsonCandidate(value) {
  return String(value || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .replace(/,\s*([}\]])/g, '$1')
    .trim()
}

function parseJsonCandidate(value) {
  const candidates = [normalizeJsonCandidate(value)]
  const smartQuoteNormalized = candidates[0].replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
  if (smartQuoteNormalized !== candidates[0]) candidates.push(smartQuoteNormalized)
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      const parsed = JSON.parse(candidate)
      if (typeof parsed === 'string') return JSON.parse(parsed)
      if (parsed && typeof parsed === 'object') return Array.isArray(parsed) ? { findings: parsed } : parsed
    } catch {}
  }
  return null
}

function balancedJsonObjects(text) {
  const value = String(text || '')
  const objects = []
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = 0; index < value.length; index++) {
    const char = value[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') {
      if (depth === 0) start = index
      depth += 1
      continue
    }
    if (char === '}') {
      if (depth > 0) depth -= 1
      if (depth === 0 && start >= 0) {
        objects.push(value.slice(start, index + 1))
        start = -1
      }
    }
  }
  return objects.sort((a, b) => b.length - a.length)
}

function tryExtractJsonFromModel(content) {
  const text = String(content || '').trim()
  const candidates = [text]
  for (const match of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) candidates.unshift(match[1])
  for (const match of text.matchAll(/<json[^>]*>([\s\S]*?)<\/json>/gi)) candidates.unshift(match[1])
  candidates.push(...balancedJsonObjects(text))
  for (const candidate of candidates) {
    const parsed = parseJsonCandidate(candidate)
    if (parsed && typeof parsed === 'object') return parsed
  }
  return null
}

function extractJsonFromModel(content) {
  const parsed = tryExtractJsonFromModel(content)
  if (parsed) return parsed
  fail(502, '模型未按要求返回可解析的审查 JSON')
}

function chunkArray(items, size) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}

function extractRulePromptValue(prompt, startLabel, endLabel) {
  const text = String(prompt || '')
  const start = text.indexOf(startLabel)
  if (start < 0) return ''
  const valueStart = start + startLabel.length
  const end = text.indexOf(endLabel, valueStart)
  return (end >= 0 ? text.slice(valueStart, end) : text.slice(valueStart)).replace(/。+$/g, '').trim()
}

function compactRuleForPrompt(rule) {
  const checkPrompt = String(rule.checkPrompt || '')
  return {
    ruleId: rule.id,
    ruleName: rule.name,
    category: rule.category || '综合',
    severity: rule.severity || '中',
    checkPoint: rule.description || rule.name,
    regulation: extractRulePromptValue(checkPrompt, '监管映射：', '。建议证据来源'),
    evidenceSources: extractRulePromptValue(checkPrompt, '建议证据来源：', '。如命中'),
  }
}

function normalizeKeyword(value) {
  return String(value || '').replace(/\s+/g, '').toLowerCase()
}

const domainEvidenceKeywords = [
  '合同', '订单', '采购', '销售', '供应商', '客户', '交易对手', '关联', '股权', '法人', '高管', '投标', '比价', '围标', '串标',
  '煤炭', '标的', '规格', '数量', '单价', '金额', '价差', '毛利', '账期', '预付', '回款', '付款', '收款', '资金', '融资',
  '物流', '运输', '交付', '货权', '仓单', '仓储', '入库', '出库', '过磅', '磅单', '化验', '验收', '签收',
  '发票', '专票', '开票', '税率', '进项', '销项', '税负', '真实贸易', '商业实质', '循环贸易', '空转', '走单', '虚假贸易'
]

const globalRiskSignalKeywords = [
  '问题', '异常', '风险', '疑似', '涉嫌', '不符合', '不一致', '不匹配', '不完整', '缺少', '缺失', '未提供', '未见', '无法证明', '证据不足',
  '审计发现', '检查发现', '整改事项', '整改建议', '风险提示', '重大缺陷', '内控缺陷', '违规', '规避', '拆单', '补签', '倒签', '先履行后审批', '先发货后签约',
  '无商业实质', '交易必要性不足', '客户真实需求不足', '盈利逻辑不足', '固定收益', '保底收益', '差额补足', '兜底承诺', '到期返还', '回购', '通道', '托盘', '手续费', '资金占用费',
  '低毛利', '零毛利', '价差异常', '长账期', '垫资', '预付款异常', '资金回流', '闭环', '回流', '循环', '自买自卖', '空转', '走单', '虚增营收',
  '无物流', '无货权', '无仓储', '无入库', '无出库', '无过磅', '无磅单', '无化验', '无签收', '四流不一致', '三流不一致', '货权未转移', '未实际交付',
  '关联方', '实控人', '同一控制', '交叉持股', '集中托管', '空壳', '新成立', '失信', '经营异常', '涉诉', '黑名单', '围标', '串标', '陪标'
]
function ruleKeywords(rules) {
  const seed = rules.map((rule) => `${rule.id} ${rule.name} ${rule.category || ''} ${rule.severity || ''} ${rule.description || ''} ${rule.checkPrompt || ''}`).join(' ')
  const compactSeed = normalizeKeyword(seed)
  const words = domainEvidenceKeywords.filter((word) => compactSeed.includes(normalizeKeyword(word)))
  for (const match of seed.matchAll(/[\u4e00-\u9fa5A-Za-z0-9.%％]{2,18}/g)) {
    const word = match[0]
    if (/^(围绕|核查|智能|自动|识别|检测|风险|规则|监管|映射|建议|证据|来源|如果|如命中|未命中|说明|文档|内部|外部|数据)$/.test(word)) continue
    if (/^[0-9]+$/.test(word)) continue
    words.push(word)
  }
  return [...new Set(words.map(normalizeKeyword).filter((word) => word.length >= 2))].slice(0, 80)
}

function sourceTextSections(document) {
  const fullText = String(document?.text || '')
  const markers = [...fullText.matchAll(/【文档(\d+)：([^】]+)】\n/g)]
  if (!markers.length) return [{ index: 1, fileName: document?.fileName || '当前文档', text: fullText }]
  return markers.map((marker, index) => {
    const start = (marker.index || 0) + marker[0].length
    const end = index + 1 < markers.length ? markers[index + 1].index || fullText.length : fullText.length
    return { index: Number(marker[1]) || index + 1, fileName: marker[2] || `文档${index + 1}`, text: fullText.slice(start, end).trim() }
  })
}

function clippedText(value, limit) {
  const text = normalizeText(value)
  return text.length > limit ? `${text.slice(0, limit)}...` : text
}

function collectKeywordSnippets(text, keywords, limit = 8) {
  const source = String(text || '')
  const compact = normalizeKeyword(source)
  const snippets = []
  const seen = new Set()
  for (const keyword of keywords) {
    if (!keyword) continue
    let searchFrom = 0
    let found = 0
    while (found < 2) {
      const compactPos = compact.indexOf(keyword, searchFrom)
      if (compactPos < 0) break
      const ratio = compact.length ? compactPos / compact.length : 0
      const approx = Math.max(0, Math.min(source.length - 1, Math.floor(source.length * ratio)))
      const start = Math.max(0, approx - 260)
      const end = Math.min(source.length, approx + 460)
      const key = `${Math.floor(start / 120)}-${Math.floor(end / 120)}`
      if (!seen.has(key)) {
        snippets.push(clippedText(source.slice(start, end), 760))
        seen.add(key)
      }
      found += 1
      searchFrom = compactPos + keyword.length
      if (snippets.length >= limit) return snippets
    }
  }
  return snippets
}

function collectRiskSignalSnippets(text, limit = 8) {
  const source = String(text || '')
  if (!source) return []
  const compact = normalizeKeyword(source)
  const signals = globalRiskSignalKeywords.map(normalizeKeyword).filter((word) => word.length >= 2)
  const scored = []
  const seen = new Set()
  for (const keyword of signals) {
    let searchFrom = 0
    let found = 0
    while (found < 3) {
      const compactPos = compact.indexOf(keyword, searchFrom)
      if (compactPos < 0) break
      const ratio = compact.length ? compactPos / compact.length : 0
      const approx = Math.max(0, Math.min(source.length - 1, Math.floor(source.length * ratio)))
      const start = Math.max(0, approx - 380)
      const end = Math.min(source.length, approx + 680)
      const key = `${Math.floor(start / 180)}-${Math.floor(end / 180)}`
      if (!seen.has(key)) {
        const snippet = clippedText(source.slice(start, end), 980)
        const hitText = normalizeKeyword(snippet)
        const score = signals.reduce((sum, word) => sum + (hitText.includes(word) ? 1 : 0), 0)
        scored.push({ snippet, score, start })
        seen.add(key)
      }
      found += 1
      searchFrom = compactPos + keyword.length
    }
  }
  return scored
    .sort((a, b) => b.score - a.score || a.start - b.start)
    .slice(0, limit)
    .map((item) => item.snippet)
}
function fallbackDocumentSnippets(text, limit = 3) {
  const source = String(text || '')
  if (!source) return []
  const segments = [source.slice(0, 800)]
  if (source.length > 2200) segments.push(source.slice(Math.max(0, Math.floor(source.length / 2) - 400), Math.floor(source.length / 2) + 400))
  if (source.length > 1400) segments.push(source.slice(Math.max(0, source.length - 800)))
  return segments.map((item) => clippedText(item, 820)).filter(Boolean).slice(0, limit)
}

function buildEvidenceTextForRules(document, rules, limit = reviewTextLimit) {
  const sections = sourceTextSections(document)
  const keywords = ruleKeywords(rules)
  const materialList = (document.sourceDocuments || [document]).map((item, index) => `${index + 1}. ${item.fileName}，正文 ${item.characters} 字，解析器 ${item.parser}`).join('\n')
  const header = [
    '【材料清单】',
    materialList,
    '',
    '【证据抽取说明】以下片段由系统从每篇材料全文中按本组规则关键词和全局异常线索检索抽取，并补充各材料首尾/中部兜底片段；未出现的外部数据或底账不得臆测。',
  ].join('\n')
  const budget = Math.max(6000, Number(limit) || reviewTextLimit)
  const perDocumentBudget = Math.max(1200, Math.floor((budget - header.length) / Math.max(1, sections.length)))
  const parts = [header]
  for (const section of sections) {
    const keywordSnippets = collectKeywordSnippets(section.text, keywords, Math.max(4, Math.floor(perDocumentBudget / 1100)))
    const signalSnippets = collectRiskSignalSnippets(section.text, Math.max(3, Math.floor(perDocumentBudget / 1400)))
    const fallback = fallbackDocumentSnippets(section.text, keywordSnippets.length || signalSnippets.length ? 1 : 3)
    const unique = [...new Set([...signalSnippets, ...keywordSnippets, ...fallback])]
    const body = unique.map((snippet, index) => `片段${index + 1}：\n${snippet}`).join('\n\n') || '未抽取到可用文本片段。'
    parts.push(`\n【文档${section.index}：${section.fileName}】\n${clippedText(body, perDocumentBudget)}`)
  }
  const result = parts.join('\n')
  return result.length > budget ? `${result.slice(0, budget)}\n\n[系统提示：证据片段较长，已按规则相关性截取。]` : result
}

function buildPrecheckEvidenceText(document, limit = reviewTextLimit) {
  const sections = sourceTextSections(document)
  const materialList = (document.sourceDocuments || [document]).map((item, index) => `${index + 1}. ${item.fileName}，正文 ${item.characters} 字，解析器 ${item.parser}`).join('\n')
  const header = [
    '【材料清单】',
    materialList,
    '',
    '【预审说明】以下片段按全文异常线索抽取，用于先发现文档中明写的问题，再反向匹配内置规则；不得依据未提供的外部底账臆测。',
  ].join('\n')
  const budget = Math.max(7000, Number(limit) || reviewTextLimit)
  const perDocumentBudget = Math.max(1600, Math.floor((budget - header.length) / Math.max(1, sections.length)))
  const parts = [header]
  for (const section of sections) {
    const signalSnippets = collectRiskSignalSnippets(section.text, Math.max(6, Math.floor(perDocumentBudget / 1200)))
    const fallback = fallbackDocumentSnippets(section.text, signalSnippets.length ? 1 : 3)
    const unique = [...new Set([...signalSnippets, ...fallback])]
    const body = unique.map((snippet, index) => `预审片段${index + 1}：\n${snippet}`).join('\n\n') || '未抽取到可用文本片段。'
    parts.push(`\n【文档${section.index}：${section.fileName}】\n${clippedText(body, perDocumentBudget)}`)
  }
  const result = parts.join('\n')
  return result.length > budget ? `${result.slice(0, budget)}\n\n[系统提示：预审片段较长，已按异常线索相关性截取。]` : result
}

function issueArrayFromRaw(raw) {
  if (Array.isArray(raw)) return raw
  if (Array.isArray(raw?.issues)) return raw.issues
  if (Array.isArray(raw?.findings)) return raw.findings
  if (Array.isArray(raw?.risks)) return raw.risks
  return []
}

function normalizeIssueKeywords(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8)
  return String(value || '').split(/[、,，;；\s]+/).map((item) => item.trim()).filter(Boolean).slice(0, 8)
}

function normalizePrecheckIssue(item, index) {
  const title = String(item?.title || item?.issue || item?.name || item?.riskPoint || `疑似问题${index + 1}`).trim()
  const evidence = String(item?.evidence || item?.quote || item?.basis || '').trim()
  const reason = String(item?.reason || item?.analysis || item?.description || '').trim()
  const suggestion = String(item?.suggestion || item?.advice || '结合内置规则进一步复核。').trim()
  const keywords = normalizeIssueKeywords(item?.keywords || item?.tags || `${title} ${reason}`)
  return {
    id: item?.id || `ISSUE-${String(index + 1).padStart(3, '0')}`,
    title: title.slice(0, 80),
    category: String(item?.category || item?.type || '综合').trim().slice(0, 40),
    severity: normalizeSeverity(item?.severity, /重大|严重|高危|违规|涉嫌/.test(`${title} ${reason}`) ? '高' : '中'),
    evidence: evidence.slice(0, 220),
    reason: reason.slice(0, 180),
    suggestion: suggestion.slice(0, 160),
    sourceDocument: String(item?.sourceDocument || item?.document || '').trim().slice(0, 80),
    keywords,
  }
}

function compactIssueHint(issue, index) {
  const keywords = Array.isArray(issue.keywords) && issue.keywords.length ? `；关键词：${issue.keywords.slice(0, 6).join('、')}` : ''
  const source = issue.sourceDocument ? `；来源：${issue.sourceDocument}` : ''
  return `${index + 1}. [${issue.severity}] ${issue.title}${source}${keywords}\n证据：${issue.evidence || '未提供'}\n理由：${issue.reason || '未提供'}\n建议：${issue.suggestion || '结合对应规则复核。'}`
}

function issueRuleMatchScore(issue, rules) {
  const ruleSeed = normalizeKeyword(rules.map((rule) => `${rule.name} ${rule.category || ''} ${rule.description || ''} ${rule.checkPrompt || ''}`).join(' '))
  const issueTerms = [issue.title, issue.category, issue.reason, issue.evidence, ...(issue.keywords || [])].map(normalizeKeyword).filter((word) => word.length >= 2)
  return issueTerms.reduce((score, term) => score + (ruleSeed.includes(term) ? Math.min(5, term.length) : 0), 0)
}

function formatIssueHintsForPrompt(issueHints, rules, limit = 12) {
  const hints = Array.isArray(issueHints) ? issueHints : []
  if (!hints.length) return '未抽取到全局预审问题线索。'
  return hints
    .map((issue, index) => ({ issue, index, score: issueRuleMatchScore(issue, rules) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((item, index) => compactIssueHint(item.issue, index))
    .join('\n\n')
}

async function extractGlobalIssueHints(document) {
  if (!reviewPrecheckIssueLimit) return { issues: [], model: '', usage: null, errorMessage: '' }
  const evidenceText = buildPrecheckEvidenceText(document, quickReviewTextLimit)
  try {
    const result = await callSuperAgentModel({
      temperature: 0,
      maxTokens: Math.min(5200, Math.max(2600, reviewPrecheckIssueLimit * 280)),
      messages: [
        { role: 'system', content: '你是中文贸易合规预审专家。你只输出合法 JSON，不输出 Markdown、解释、前后缀或思考过程。' },
        { role: 'user', content: `请先不套用具体规则，直接从材料片段中抽取“文档明写或可直接推导”的疑似问题线索，用于后续反向匹配规则。\n\n要求：\n1. 只返回 JSON 对象，第一个字符是 {，最后一个字符是 }。\n2. 最多输出 ${reviewPrecheckIssueLimit} 条 issues。\n3. 只有材料中有明确证据的事项才输出；如果只是缺少外部工商、资金流水、物流、发票等底账，也可以输出为“证据不足线索”。\n4. 不要编造主体、金额、日期、底账或外部事实。\n5. evidence 必须引用材料片段中的关键原文或高度贴近原文的表述。\n\nJSON 结构：\n{\n  "issues": [\n    {"title":"问题标题","category":"主体关联|商业实质|资金流|物流货权|发票税务|审批内控|价格账期|招投标|其他","severity":"高|中|低","evidence":"原文依据","reason":"为什么构成疑似问题或证据不足","suggestion":"后续复核建议","sourceDocument":"文档名或文档序号","keywords":["关键词1","关键词2"]}\n  ]\n}\n\n材料预审片段：\n${evidenceText}` },
      ],
    })
    const raw = tryExtractJsonFromModel(result.content)
    if (!raw) return { issues: [], model: result.model, usage: result.usage || null, errorMessage: '预审 JSON 不可解析' }
    const issues = issueArrayFromRaw(raw).map(normalizePrecheckIssue).filter((item) => item.title && (item.evidence || item.reason)).slice(0, reviewPrecheckIssueLimit)
    return { issues, model: result.model, usage: result.usage || null, errorMessage: '' }
  } catch (error) {
    return { issues: [], model: getSuperAgentModelName(), usage: null, errorMessage: safeModelErrorMessage(error) }
  }
}
function reviewBatchMaxTokens(rules) {
  return Math.min(9000, Math.max(3200, rules.length * 560))
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

function buildReviewPrompt(document, text, retry = false, rules = superAgentRules, batchIndex = 0, batchCount = 1, issueHints = []) {
  const sourceDocuments = document.sourceDocuments || [document]
  const materialList = sourceDocuments.map((item, index) => `${index + 1}. ${item.fileName}，正文 ${item.characters} 字，解析器 ${item.parser}`).join('\n')
  const batchLabel = batchCount > 1 ? `第 ${batchIndex + 1}/${batchCount} 组规则` : '全部规则'
  const ruleScope = batchCount > 1 ? `本组 ${rules.length} 条规则（全量共 ${superAgentRules.length} 条）` : `全部 ${rules.length} 条规则`
  const issueHintText = formatIssueHintsForPrompt(issueHints, rules)
  return `${retry ? '上一次输出无法解析为 JSON，请重新审查并修正输出格式。\n\n' : ''}请基于以下${ruleScope}审查用户上传的真实文档。必须只根据材料证据片段和全局预审问题线索判断，不要编造不存在的证据。若当前证据片段不足以支持命中风险，必须判为“证据不足”或“通过”，不得为了覆盖规则而臆测风险。\n\n硬性输出要求：\n1. 只返回一个可被 JSON.parse 直接解析的 JSON 对象。\n2. 第一个字符必须是 {，最后一个字符必须是 }。\n3. 禁止输出 Markdown、代码块、解释说明、思考过程、XML 标签或 JSON 以外的任何文字。\n4. findings 必须覆盖${ruleScope}，每条规则一个结果，且不得输出本组以外的规则。\n5. issue、evidence、suggestion、reason 每个字段尽量控制在 120 个中文字符以内，避免输出过长导致截断。\n6. 如果证据来自某一篇材料，请在 evidence 中尽量写明对应文档名或“文档1/文档2”。\n7. status 必须三选一：通过、命中风险、证据不足。\n8. 只有存在明确原文证据或可由原文直接推导的异常，才允许 status=命中风险；仅缺少外部工商、资金流水、物流底账、发票底账等材料时，应输出 status=证据不足，不得输出命中风险。\n9. passed 字段用于兼容旧结构：status=命中风险 时 passed=false；status=通过 或 证据不足 时 passed=true。\n10. 必须先阅读“全局预审问题线索”；如果线索与本组任一规则的监管含义相符，即使材料未出现规则名称，也要按原文证据判断该规则“命中风险/证据不足/通过”。\n\nJSON 结构如下：\n{\n  "findings": [\n    {"ruleId":"规则ID","ruleName":"规则名称","category":"分类","severity":"高","status":"命中风险","passed":false,"issue":"问题说明；通过时可为空","evidence":"来自文档的原文依据；证据不足时写缺少哪些材料","suggestion":"整改或补证建议；通过时可为空","reason":"判断理由"}\n  ]\n}\n\n当前审查范围：${batchLabel}\n\n内置规则：\n${JSON.stringify(rules.map(compactRuleForPrompt), null, 2)}\n\n文档信息：${document.fileName}，共 ${sourceDocuments.length} 篇材料，合计正文 ${document.characters} 字。\n\n材料清单：\n${materialList}\n\n全局预审问题线索：\n${issueHintText}\n\n材料证据片段：\n${text}`
}

async function repairReviewJson(document, text, invalidContent, rules = superAgentRules, batchIndex = 0, batchCount = 1, issueHints = []) {
  const result = await callSuperAgentModel({
    temperature: 0,
    maxTokens: reviewBatchMaxTokens(rules),
    messages: [
      { role: 'system', content: '你是只输出合法 JSON 的审查报告生成器。不要输出 Markdown、解释、前后缀或思考过程。' },
      { role: 'user', content: `${buildReviewPrompt(document, text, true, rules, batchIndex, batchCount, issueHints)}\n\n上一次不可解析输出摘录，仅用于避免重复格式错误：\n${String(invalidContent || '').slice(0, 3000)}` },
    ],
  })
  return { raw: extractJsonFromModel(result.content), result }
}

async function verifyHighRiskFindings(document, evidenceText, findings, rules, batchIndex, batchCount) {
  const candidates = findings.filter((finding) => isRiskFinding(finding) && finding.severity === '高').slice(0, 6)
  if (!candidates.length) return findings
  const candidateRules = candidates.map((finding) => rules.find((rule) => rule.id === finding.ruleId)).filter(Boolean)
  if (!candidateRules.length) return findings
  try {
    const result = await callSuperAgentModel({
      temperature: 0,
      maxTokens: Math.min(5200, Math.max(2400, candidates.length * 720)),
      messages: [
        { role: 'system', content: '你是中文合规审查复核专家。你只输出合法 JSON，不输出 Markdown、解释、前后缀或思考过程。' },
        { role: 'user', content: `请对以下高风险命中项进行二次复核。复核原则：\n1. 只有证据片段中存在明确原文依据或可直接推导的异常，才保留“命中风险”。\n2. 如果只是缺少外部工商、资金流水、物流、发票等佐证材料，改为“证据不足”。\n3. 如果原判断依据不足或误读材料，改为“通过”或“证据不足”。\n4. 必须覆盖待复核规则，只输出 JSON。\n\nJSON 结构：{"findings":[{"ruleId":"规则ID","status":"通过|命中风险|证据不足","passed":true,"issue":"","evidence":"","suggestion":"","reason":""}]}\n\n待复核规则：\n${JSON.stringify(candidateRules.map(compactRuleForPrompt), null, 2)}\n\n第一轮命中结果：\n${JSON.stringify(candidates, null, 2)}\n\n材料证据片段：\n${evidenceText}` },
      ],
    })
    const raw = tryExtractJsonFromModel(result.content)
    if (!raw) return findings
    const reviewed = normalizeFindingsForRules(candidateRules, findingsFromRaw(raw), 0)
    const reviewedByRule = new Map(reviewed.map((item) => [item.ruleId, item]))
    return findings.map((finding) => {
      const next = reviewedByRule.get(finding.ruleId)
      if (!next) return finding
      return { ...finding, ...next, id: finding.id, verified: true, verificationModel: result.model }
    })
  } catch {
    return findings
  }
}

async function reviewRuleBatch(document, text, batchRules, batchIndex, batchCount, issueHints = []) {
  const evidenceText = buildEvidenceTextForRules(document, batchRules, reviewTextLimit)
  let result = await callSuperAgentModel({
    temperature: 0,
    maxTokens: reviewBatchMaxTokens(batchRules),
    messages: [
      { role: 'system', content: '你是严谨的中文文档审查专家。你必须只输出一个合法 JSON 对象，不输出 Markdown、解释、前后缀或思考过程。' },
      { role: 'user', content: buildReviewPrompt(document, evidenceText, false, batchRules, batchIndex, batchCount, issueHints) },
    ],
  })
  let raw = tryExtractJsonFromModel(result.content)
  if (!raw) {
    const repaired = await repairReviewJson(document, evidenceText, result.content, batchRules, batchIndex, batchCount, issueHints)
    raw = repaired.raw
    result = repaired.result
  }
  const normalizedFindings = normalizeFindingsForRules(batchRules, findingsFromRaw(raw), batchIndex * reviewRuleBatchSize)
  const findings = reviewVerifyHighRiskDuringReview ? await verifyHighRiskFindings(document, evidenceText, normalizedFindings, batchRules, batchIndex, batchCount) : normalizedFindings
  return {
    findings,
    batchResult: {
      batch: batchIndex + 1,
      ruleIds: batchRules.map((rule) => rule.id),
      model: result.model,
      usage: result.usage || null,
      evidenceMode: 'rule-keyword-and-global-risk-snippets',
      issueHintCount: Array.isArray(issueHints) ? issueHints.length : 0,
    },
  }
}

function normalizeSeverity(value, fallback = '中') {
  return ['高', '中', '低'].includes(value) ? value : fallback
}

function normalizePassed(value, hasItem) {
  if (!hasItem) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const text = String(value ?? '').trim().toLowerCase()
  if (['false', '0', 'no', 'fail', 'failed', '否', '不通过', '未通过', '命中'].includes(text)) return false
  if (['true', '1', 'yes', 'pass', 'passed', '是', '通过', '未命中', '无风险'].includes(text)) return true
  return Boolean(value)
}

function normalizeFindingStatus(item, hasItem) {
  if (!hasItem) return 'insufficient'
  const explicit = String(item?.status || item?.result || item?.judgement || item?.conclusion || '').trim()
  if (/证据不足|材料不足|依据不足|待补|待补证|无法判断|不能判断|无法确认|缺少|缺失|未提供|未披露|insufficient|unknown/i.test(explicit)) return 'insufficient'
  if (/命中风险|命中|高风险|中风险|低风险|异常|违规|不通过|未通过|risk|failed/i.test(explicit)) return 'risk'
  if (/通过|未命中|无风险|正常|pass|passed/i.test(explicit)) return 'passed'

  const combined = `${item?.issue || ''} ${item?.evidence || ''} ${item?.reason || ''} ${item?.suggestion || ''}`
  if (typeof item?.passed !== 'undefined') {
    const passed = normalizePassed(item.passed, true)
    if (!passed && /缺少|缺失|未提供|证据不足|材料不足|待补|无法判断|未披露/.test(combined) && !String(item?.evidence || '').trim()) return 'insufficient'
    return passed ? 'passed' : 'risk'
  }
  if (/命中|异常|违规|不一致|回流|空转|循环|融资性|虚假|围标|串标/.test(combined) && String(item?.evidence || '').trim()) return 'risk'
  if (/缺少|缺失|未提供|证据不足|材料不足|待补|无法判断|未披露/.test(combined)) return 'insufficient'
  return String(item?.evidence || item?.issue || item?.reason || '').trim() ? 'risk' : 'passed'
}

function findingStatusLabel(status) {
  if (status === 'risk') return '命中风险'
  if (status === 'insufficient') return '证据不足'
  return '通过'
}

function isRiskFinding(item) {
  return item?.status === 'risk' || (!item?.status && item?.passed === false)
}

function isInsufficientFinding(item) {
  return item?.status === 'insufficient'
}

function normalizeFindingForRule(rule, item, index) {
  const hasItem = Boolean(item)
  const status = normalizeFindingStatus(item, hasItem)
  const defaultIssue = status === 'insufficient' ? '当前材料未提供足够证据支持该规则判断' : hasItem ? '' : '模型未返回该规则的结构化审查结果'
  const defaultSuggestion = status === 'insufficient' ? '补充对应合同、订单、资金流水、物流/货权、发票或外部工商等佐证材料后复核。' : hasItem ? '' : '请重新审查或补充该规则判断'
  return {
    id: item?.id || `FIND-${String(index + 1).padStart(3, '0')}`,
    ruleId: String(item?.ruleId || rule.id),
    ruleName: String(item?.ruleName || rule.name),
    category: String(item?.category || rule.category || '综合'),
    severity: normalizeSeverity(item?.severity, rule.severity || '中'),
    status,
    statusText: findingStatusLabel(status),
    passed: status !== 'risk',
    issue: String(item?.issue || defaultIssue).trim(),
    evidence: String(item?.evidence || '').trim(),
    suggestion: String(item?.suggestion || defaultSuggestion).trim(),
    reason: String(item?.reason || (hasItem ? '' : '结构化结果缺失')).trim(),
  }
}

function findingsFromRaw(raw) {
  if (Array.isArray(raw)) return raw
  return Array.isArray(raw?.findings) ? raw.findings : []
}

function normalizeFindingsForRules(rules, sourceFindings, startIndex = 0) {
  const used = new Set()
  return rules.map((rule, index) => {
    let sourceIndex = sourceFindings.findIndex((item, candidateIndex) => !used.has(candidateIndex) && String(item?.ruleId || '') === rule.id)
    if (sourceIndex < 0) sourceIndex = sourceFindings.findIndex((item, candidateIndex) => !used.has(candidateIndex) && String(item?.ruleName || '') === rule.name)
    if (sourceIndex < 0 && sourceFindings[index] && !used.has(index)) sourceIndex = index
    const item = sourceIndex >= 0 ? sourceFindings[sourceIndex] : null
    if (sourceIndex >= 0) used.add(sourceIndex)
    return normalizeFindingForRule(rule, item, startIndex + index)
  })
}

function severityRank(value) {
  return ({ 高: 1, 中: 2, 低: 3 }[value] || 9)
}

function highestSeverity(items) {
  return (items || []).map((item) => normalizeSeverity(item.severity, '中')).sort((a, b) => severityRank(a) - severityRank(b))[0] || '中'
}

function uniqueText(values, limit = 4, textLimit = 180) {
  const seen = new Set()
  const result = []
  for (const value of values) {
    const text = briefText(String(value || '').replace(/\s+/g, ' ').trim(), textLimit)
    if (!text || seen.has(text)) continue
    seen.add(text)
    result.push(text)
    if (result.length >= limit) break
  }
  return result
}

function riskThemeForFinding(finding) {
  const text = `${finding?.category || ''} ${finding?.ruleName || ''} ${finding?.issue || ''} ${finding?.evidence || ''} ${finding?.reason || ''}`
  const themes = [
    ['主体关联', /关联|股权|实际控制|受益|同一|交易对手|空壳|资质|客户|供应商|上下游|特定利益/],
    ['商业实质', /商业实质|真实贸易|空转|走单|循环|融资性|通道|无实物|背靠背|闭环|虚假|贸易背景/],
    ['货物流/货权', /货权|物流|运输|仓储|仓单|入库|出库|过磅|化验|签收|交付|提货|流转|煤炭|货物/],
    ['资金流', /资金|付款|收款|回款|银行|流水|账户|账期|逾期|预付|保证金|垫资|占用|融资|闭环资金/],
    ['发票税务', /发票|税|票|专票|开票|进项|销项|税负|虚开/],
    ['合同履约', /合同|订单|协议|签约|履约|验收|结算|条款|价格|数量|标的|违约|交割/],
    ['审批内控', /审批|内控|授权|决策|制度|流程|台账|留痕|风控|尽调|准入|评审/],
    ['招投标', /招标|投标|围标|串标|比价|竞价|采购方式|中标/],
  ]
  return themes.find(([, regex]) => regex.test(text))?.[0] || finding?.category || '其他风险'
}

function cleanRiskTitle(value) {
  const text = briefText(String(value || '').replace(/^(问题|风险|异常|疑似)[:：\s]*/g, '').replace(/\s+/g, ' ').trim(), 42)
  return text.replace(/[。；;，,]+$/g, '')
}

function userRiskTitle(theme, findings, type) {
  if (type === 'material_gap') return `${theme}材料需补充核验`
  const candidate = findings.map((item) => cleanRiskTitle(item.issue || item.reason)).find((text) => text && text.length >= 6 && !/未提供|无|证据不足|材料不足/.test(text))
  if (candidate) return candidate
  return `${theme}风险`
}

function aggregateReviewRiskItems(findings = []) {
  const groups = new Map()
  const add = (finding, type) => {
    const category = riskThemeForFinding(finding)
    const key = `${type}:${category}`
    if (!groups.has(key)) groups.set(key, { type, category, findings: [] })
    groups.get(key).findings.push(finding)
  }
  findings.filter(isRiskFinding).forEach((finding) => add(finding, 'risk'))
  findings.filter(isInsufficientFinding).forEach((finding) => add(finding, 'material_gap'))

  const items = Array.from(groups.values()).map((group, index) => {
    const source = group.findings
    const evidenceParts = uniqueText(source.map((item) => item.evidence || item.reason || item.issue), 3, 180)
    const issueParts = uniqueText(source.map((item) => item.issue || item.reason || item.ruleName), 3, 130)
    const suggestionParts = uniqueText(source.map((item) => item.suggestion), 3, 150)
    const severity = group.type === 'material_gap' ? highestSeverity(source) : highestSeverity(source)
    return {
      id: `RISK-${String(index + 1).padStart(3, '0')}`,
      type: group.type,
      title: userRiskTitle(group.category, source, group.type),
      category: group.category,
      severity,
      statusText: group.type === 'risk' ? `${severity}风险` : '需补充材料',
      summary: issueParts.join('；') || (group.type === 'risk' ? `${group.category}存在异常线索。` : `${group.category}关键材料不足，需补充后核验。`),
      evidence: evidenceParts.join('；') || (group.type === 'risk' ? '当前风险事项未形成稳定证据摘录，请查看内部规则明细。' : '当前材料未提供足够证据支持完整判断。'),
      suggestion: suggestionParts.join('；') || (group.type === 'risk' ? '补充底层材料并开展穿透复核，明确责任主体、整改动作和完成时限。' : '补充合同、订单、资金流水、物流/货权、发票及外部工商等佐证材料后复核。'),
      findingIds: source.map((item) => item.id).filter(Boolean),
      relatedRuleIds: uniqueText(source.map((item) => item.ruleId), 20, 80),
      relatedRuleNames: uniqueText(source.map((item) => item.ruleName), 8, 120),
      findingCount: source.length,
    }
  })

  return items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'risk' ? -1 : 1
    return severityRank(a.severity) - severityRank(b.severity) || b.findingCount - a.findingCount || a.category.localeCompare(b.category, 'zh-CN')
  }).map((item, index) => ({ ...item, id: `RISK-${String(index + 1).padStart(3, '0')}` }))
}

function riskItemDedupeKey(item) {
  const title = normalizeKeyword(item?.title || item?.summary || '').slice(0, 28)
  return `${item?.type || 'risk'}:${item?.category || '综合'}:${title}`
}

function mergeRiskItems(items = []) {
  const byKey = new Map()
  for (const item of items.filter(Boolean)) {
    const key = riskItemDedupeKey(item)
    if (!byKey.has(key)) {
      byKey.set(key, { ...item })
      continue
    }
    const current = byKey.get(key)
    byKey.set(key, {
      ...current,
      severity: severityRank(item.severity) < severityRank(current.severity) ? item.severity : current.severity,
      statusText: current.statusText || item.statusText,
      summary: current.summary || item.summary,
      evidence: uniqueText([current.evidence, item.evidence], 2, 220).join('；'),
      suggestion: uniqueText([current.suggestion, item.suggestion], 2, 180).join('；'),
      findingIds: [...new Set([...(current.findingIds || []), ...(item.findingIds || [])])],
      relatedRuleIds: [...new Set([...(current.relatedRuleIds || []), ...(item.relatedRuleIds || [])])],
      relatedRuleNames: [...new Set([...(current.relatedRuleNames || []), ...(item.relatedRuleNames || [])])].slice(0, 8),
      findingCount: Number(current.findingCount || 0) + Number(item.findingCount || 0),
    })
  }
  return Array.from(byKey.values())
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'risk' ? -1 : 1
      return severityRank(a.severity) - severityRank(b.severity) || Number(b.findingCount || 0) - Number(a.findingCount || 0)
    })
    .map((item, index) => ({ ...item, id: `RISK-${String(index + 1).padStart(3, '0')}` }))
}
function reviewRiskItems(review) {
  if (Array.isArray(review?.riskItems) && review.riskItems.length) return review.riskItems
  return aggregateReviewRiskItems(review?.findings || [])
}

function riskItemStats(items = []) {
  const riskItems = items.filter((item) => item.type !== 'material_gap')
  const materialGaps = items.filter((item) => item.type === 'material_gap')
  return {
    riskItemCount: riskItems.length,
    materialGapCount: materialGaps.length,
    highRiskItemCount: riskItems.filter((item) => item.severity === '高').length,
    mediumRiskItemCount: riskItems.filter((item) => item.severity === '中').length,
    lowRiskItemCount: riskItems.filter((item) => item.severity === '低').length,
  }
}

function riskTypeFromIssue(issue) {
  const text = `${issue?.title || ''} ${issue?.reason || ''} ${issue?.evidence || ''} ${issue?.suggestion || ''}`
  return /证据不足|材料不足|缺少|缺失|未提供|未见|无法确认|无法证明|待补|补充/.test(text) && !/明确|发现|存在|异常|违规|涉嫌/.test(text) ? 'material_gap' : 'risk'
}

function riskItemFromPrecheckIssue(issue, index) {
  const type = riskTypeFromIssue(issue)
  const category = String(issue?.category || '综合').trim() || '综合'
  const severity = normalizeSeverity(issue?.severity, type === 'material_gap' ? '中' : '中')
  return {
    id: `RISK-${String(index + 1).padStart(3, '0')}`,
    type,
    title: cleanRiskTitle(issue?.title || issue?.reason || (type === 'material_gap' ? `${category}材料需补充核验` : `${category}风险`)) || (type === 'material_gap' ? `${category}材料需补充核验` : `${category}风险`),
    category,
    severity,
    statusText: type === 'material_gap' ? '需补充材料' : `${severity}风险`,
    summary: briefText(issue?.reason || issue?.title || '存在异常线索', 160),
    evidence: briefText(issue?.evidence || issue?.reason || '未提供', 220),
    suggestion: briefText(issue?.suggestion || (type === 'material_gap' ? '补充底层材料后复核。' : '补充证据并开展穿透复核。'), 180),
    findingIds: [],
    relatedRuleIds: [],
    relatedRuleNames: [],
    findingCount: 0,
  }
}

function riskItemsFromPrecheckIssues(issues = []) {
  return (Array.isArray(issues) ? issues : [])
    .map(riskItemFromPrecheckIssue)
    .filter((item) => item.title && (item.evidence || item.summary))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'risk' ? -1 : 1
      return severityRank(a.severity) - severityRank(b.severity)
    })
    .map((item, index) => ({ ...item, id: `RISK-${String(index + 1).padStart(3, '0')}` }))
}

function normalizeQuickRiskReview(precheck, document, usage = {}) {
  const riskItems = riskItemsFromPrecheckIssues(precheck?.issues || [])
  const stats = riskItemStats(riskItems)
  const documentIds = normalizeDocumentIds(document.documentIds || document.id)
  const sourceDocuments = document.sourceDocuments || [publicDocumentInfo(document)]
  const score = Math.max(0, 100 - stats.highRiskItemCount * 16 - stats.mediumRiskItemCount * 9 - stats.lowRiskItemCount * 4 - Math.min(8, stats.materialGapCount))
  return {
    id: `REV-${randomUUID()}`,
    documentId: documentIds[0] || document.id,
    documentIds,
    documentName: document.fileName,
    documentCount: sourceDocuments.length,
    sourceDocuments,
    createdAt: nowText(),
    model: precheck?.model || getSuperAgentModelName(),
    usage: { mode: 'quick-risk', ...(usage || {}) },
    reviewMode: 'quick-risk',
    isPreliminary: true,
    ruleCount: superAgentRules.length,
    checkedTextCharacters: Math.min(document.text.length, quickReviewTextLimit),
    totalTextCharacters: document.text.length,
    score,
    conclusion: defaultRiskConclusionFromItems(riskItems),
    summary: riskSummaryFromItems(riskItems),
    highCount: stats.highRiskItemCount,
    mediumCount: stats.mediumRiskItemCount,
    lowCount: stats.lowRiskItemCount,
    riskCount: stats.riskItemCount,
    insufficientCount: stats.materialGapCount,
    passedCount: 0,
    riskItems,
    riskItemCount: stats.riskItemCount,
    materialGapCount: stats.materialGapCount,
    highRiskItemCount: stats.highRiskItemCount,
    mediumRiskItemCount: stats.mediumRiskItemCount,
    lowRiskItemCount: stats.lowRiskItemCount,
    findings: [],
  }
}
function defaultRiskConclusionFromItems(items = []) {
  const stats = riskItemStats(items)
  if (stats.highRiskItemCount) return '发现高风险事项，建议暂停相关业务并补充证据后复核'
  if (stats.riskItemCount) return '发现一般风险事项，建议补充完善并开展穿透复核'
  if (stats.materialGapCount) return '未发现明确风险事项，但存在材料缺口，建议补证后复核'
  return '未发现明显风险事项'
}

function riskSummaryFromItems(items = []) {
  const stats = riskItemStats(items)
  const risks = items.filter((item) => item.type !== 'material_gap')
  const gaps = items.filter((item) => item.type === 'material_gap')
  if (risks.length) {
    const themes = uniqueText(risks.map((item) => item.category), 6, 40).join('、')
    return `本次识别出 ${stats.riskItemCount} 项主要风险，集中在${themes || '相关业务'}等方面；其中高风险 ${stats.highRiskItemCount} 项，中风险 ${stats.mediumRiskItemCount} 项，低风险 ${stats.lowRiskItemCount} 项。${stats.materialGapCount ? `另有 ${stats.materialGapCount} 项材料需补充核验。` : ''}`
  }
  if (gaps.length) return `本次未识别出明确风险事项，但有 ${stats.materialGapCount} 项材料需补充核验，建议补齐底层证据后复核。`
  return '本次未识别出明确风险事项，建议保留审查过程并结合底层业务材料归档。'
}
function defaultReviewConclusion(highCount, riskCount, insufficientCount) {
  if (highCount) return '发现高风险事项，建议暂停相关业务并补充证据后复核'
  if (riskCount) return '发现一般风险事项，建议补充完善并开展穿透复核'
  if (insufficientCount) return '未发现明确风险事项，但存在材料缺口，建议补证后复核'
  return '未发现明显风险事项'
}

function normalizeReview(raw, document, model, usage) {
  const findings = normalizeFindingsForRules(superAgentRules, findingsFromRaw(raw))
  const failed = findings.filter(isRiskFinding)
  const insufficient = findings.filter(isInsufficientFinding)
  const passed = findings.filter((item) => !isRiskFinding(item) && !isInsufficientFinding(item))
  const riskItems = mergeRiskItems([...(Array.isArray(raw?.riskItems) ? raw.riskItems : []), ...aggregateReviewRiskItems(findings)])
  const itemStats = riskItemStats(riskItems)
  const score = Math.max(0, 100 - itemStats.highRiskItemCount * 16 - itemStats.mediumRiskItemCount * 9 - itemStats.lowRiskItemCount * 4 - Math.min(8, itemStats.materialGapCount))
  const documentIds = normalizeDocumentIds(document.documentIds || document.id)
  const sourceDocuments = document.sourceDocuments || [publicDocumentInfo(document)]
  const summary = String(raw?.summary || riskSummaryFromItems(riskItems)).trim()
  return {
    id: `REV-${randomUUID()}`,
    documentId: documentIds[0] || document.id,
    documentIds,
    documentName: document.fileName,
    documentCount: sourceDocuments.length,
    sourceDocuments,
    createdAt: nowText(),
    model,
    usage,
    reviewMode: 'full-rules',
    isPreliminary: false,
    ruleCount: superAgentRules.length,
    checkedTextCharacters: document.text.length,
    totalTextCharacters: document.text.length,
    score,
    conclusion: String(raw?.conclusion || defaultRiskConclusionFromItems(riskItems)).trim(),
    summary,
    highCount: itemStats.highRiskItemCount,
    mediumCount: itemStats.mediumRiskItemCount,
    lowCount: itemStats.lowRiskItemCount,
    riskCount: itemStats.riskItemCount,
    insufficientCount: itemStats.materialGapCount,
    passedCount: passed.length,
    riskItems,
    riskItemCount: itemStats.riskItemCount,
    materialGapCount: itemStats.materialGapCount,
    highRiskItemCount: itemStats.highRiskItemCount,
    mediumRiskItemCount: itemStats.mediumRiskItemCount,
    lowRiskItemCount: itemStats.lowRiskItemCount,
    internalRuleRiskCount: failed.length,
    internalRuleInsufficientCount: insufficient.length,
    findings,
  }
}

function buildBatchedReviewRaw(findings, batchCount, seedRiskItems = []) {
  const failed = findings.filter(isRiskFinding)
  const insufficient = findings.filter(isInsufficientFinding)
  const highCount = failed.filter((item) => item.severity === '高').length
  const riskItems = mergeRiskItems([...(Array.isArray(seedRiskItems) ? seedRiskItems : []), ...aggregateReviewRiskItems(findings)])
  return {
    findings,
    riskItems,
    conclusion: defaultRiskConclusionFromItems(riskItems) || defaultReviewConclusion(highCount, failed.length, insufficient.length),
    summary: riskSummaryFromItems(riskItems),
  }
}

export async function runSuperAgentReview(documentInput) {
  await ensureStorage()
  const documentIds = normalizeDocumentIds(documentInput)
  const document = await loadDocumentBundle(documentIds, { required: true })
  if (!document) fail(404, '文档不存在，请重新上传')
  const text = document.text
  const batches = chunkArray(superAgentRules, reviewRuleBatchSize)
  const precheck = await extractGlobalIssueHints(document)
  const issueHints = precheck.issues || []
  const seedRiskItems = riskItemsFromPrecheckIssues(issueHints)
  const batchOutputs = await mapWithConcurrency(batches, reviewRuleBatchConcurrency, async (batchRules, batchIndex) => reviewRuleBatch(document, text, batchRules, batchIndex, batches.length, issueHints))
  const findings = batchOutputs.flatMap((item) => item.findings)
  const batchResults = batchOutputs.map((item) => item.batchResult)
  const usage = {
    mode: 'batched-parallel',
    batchSize: reviewRuleBatchSize,
    batchConcurrency: reviewRuleBatchConcurrency,
    batchCount: batchResults.length,
    precheck: {
      issueCount: issueHints.length,
      model: precheck.model || '',
      errorMessage: precheck.errorMessage || '',
    },
    batches: batchResults.map(({ batch, ruleIds, usage, issueHintCount }) => ({ batch, ruleIds, usage, issueHintCount })),
  }
  const model = batchResults.map((item) => item.model).find(Boolean) || getSuperAgentModelName()
  const review = normalizeReview(buildBatchedReviewRaw(findings, batches.length, seedRiskItems), document, model, usage)
  await saveReview(review)
  return review
}
function riskLevel(review) {
  const stats = riskItemStats(reviewRiskItems(review))
  if (stats.highRiskItemCount > 0) return '高风险'
  if (stats.mediumRiskItemCount > 0) return '中风险'
  if (stats.lowRiskItemCount > 0) return '低风险'
  if (stats.materialGapCount > 0) return '待补证核验'
  return '未发现明显风险'
}
function baseDocumentName(name) {
  return String(name || '待审查文档').replace(/\.[^.]+$/, '') || '待审查文档'
}

function reportTitle(review) {
  return `${baseDocumentName(review.documentName)}虚假贸易风险专项审查报告`
}

function cleanReportCell(value, limit = 140) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  const clipped = text.length > limit ? `${text.slice(0, limit)}...` : text
  return clipped.replace(/\|/g, '｜') || '无'
}

function markdownTable(headers, rows) {
  if (!rows.length) return '无。'
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => cleanReportCell(cell)).join(' | ')} |`),
  ].join('\n')
}

function failedFindings(review) {
  return (review.findings || []).filter(isRiskFinding)
}

function insufficientFindings(review) {
  return (review.findings || []).filter(isInsufficientFinding)
}

function passedFindings(review) {
  return (review.findings || []).filter((item) => !isRiskFinding(item) && !isInsufficientFinding(item))
}

function groupByCategory(findings) {
  return findings.reduce((groups, item) => {
    const category = item.category || '未分类'
    if (!groups[category]) groups[category] = []
    groups[category].push(item)
    return groups
  }, {})
}

function categoryRows(review) {
  return Object.entries(groupByCategory(reviewRiskItems(review))).map(([category, items]) => {
    const risks = items.filter((item) => item.type !== 'material_gap')
    const gaps = items.filter((item) => item.type === 'material_gap')
    const high = risks.filter((item) => item.severity === '高').length
    const medium = risks.filter((item) => item.severity === '中').length
    const low = risks.filter((item) => item.severity === '低').length
    const mainRisk = risks.slice(0, 2).map((item) => item.title).join('；') || (gaps.length ? `待核验：${gaps.slice(0, 2).map((item) => item.title).join('；')}` : '未见明显问题')
    return [category, `${risks.length} 项`, `${gaps.length} 项`, `高 ${high} / 中 ${medium} / 低 ${low}`, mainRisk]
  })
}
function extractRuleMeta(ruleId) {
  const rule = superAgentRules.find((item) => item.id === ruleId)
  const prompt = String(rule?.checkPrompt || '')
  const regulation = prompt.match(/监管映射：(.+?)。建议证据来源/)?.[1] || ''
  const dataSource = prompt.match(/建议证据来源：(.+?)。如命中/)?.[1] || ''
  return { regulation, dataSource, description: rule?.description || '' }
}

function findingNarrative(finding) {
  const issue = finding.issue || finding.reason || '未提供问题说明'
  const evidence = finding.evidence || '未提供原文依据'
  const suggestion = finding.suggestion || '建议补充对应材料并由业务、财务、法务联合复核。'
  return [
    `### ${finding.ruleName} ——【${finding.severity}风险 / ${finding.statusText || (finding.passed ? '未命中' : '命中')}】`,
    '',
    `- 风险判断：${issue}`,
    `- 关键依据：${evidence}`,
    `- 整改建议：${suggestion}`,
  ].join('\n')
}

function importantFindings(review, limit = 10) {
  const failed = failedFindings(review)
  const order = { 高: 1, 中: 2, 低: 3 }
  return failed.sort((a, b) => (order[a.severity] || 9) - (order[b.severity] || 9)).slice(0, limit)
}

function extractDocumentSignals(document) {
  const text = String(document?.text || '')
  const companyPattern = /[\u4e00-\u9fa5A-Za-z0-9（）()]{2,40}(?:有限公司|有限责任公司|集团|公司|煤场|电厂|供应链)/g
  const amountPattern = /(?:人民币)?[0-9０-９,.，]+\s*(?:万元|万|亿元|元|%|％|吨|天|日|月|年|亩|卡)/g
  const datePattern = /\d{4}\s*年\s*\d{1,2}\s*月\s*\d{0,2}\s*日?|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/g
  const uniq = (arr, limit) => [...new Set(arr.map((item) => String(item || '').replace(/\s+/g, '').trim()).filter(Boolean))].slice(0, limit)
  return {
    companies: uniq(text.match(companyPattern) || [], 12),
    amounts: uniq(text.match(amountPattern) || [], 12),
    dates: uniq(text.match(datePattern) || [], 10),
    preview: briefText(text, 900),
  }
}

function documentMaterialRows(review, document) {
  const sourceDocuments = document?.sourceDocuments?.length ? document.sourceDocuments : Array.isArray(review.sourceDocuments) ? review.sourceDocuments : []
  if (sourceDocuments.length) {
    return sourceDocuments.map((item, index) => [
      `材料${index + 1}`,
      item.fileName,
      `${item.characters || 0} 字，解析器 ${item.parser || 'unknown'}`,
      '合同文本、主体信息、交易条款、证据描述、金额日期、交付和结算安排',
    ])
  }
  return [['材料1', review.documentName, `${review.totalTextCharacters} 字，已纳入 ${review.checkedTextCharacters} 字进行规则审查`, '合同文本、主体信息、交易条款、证据描述、金额日期、交付和结算安排']]
}
function dimensionRiskRows(review) {
  const failed = failedFindings(review)
  const dims = [
    ['合同流', /合同|订单|签约|主体|标的|条款|模板|比价|投标|围标|串标/],
    ['货物流/货权流', /货权|物流|交付|入库|仓单|仓储|过磅|化验|签收|标的|数量|流转/],
    ['资金流', /资金|收款|付款|应收|预付|回款|账期|逾期|账户|占用|垫资|融资|保证金/],
    ['发票流/税务流', /发票|税|票|专票|开票|进项|销项|税负/],
  ]
  return dims.map(([label, regex]) => {
    const hits = failed.filter((item) => regex.test(`${item.ruleName} ${item.issue} ${item.evidence} ${item.reason}`))
    const high = hits.filter((item) => item.severity === '高').length
    const level = high ? '高' : hits.length ? '中高' : '待补证'
    return [label, level, hits.slice(0, 2).map((item) => item.issue || item.ruleName).join('；') || '当前文档未提供足够证据，需要结合合同、发票、支付、物流材料交叉核验。']
  })
}

function quantifiedRows(review, signals) {
  const regex = /毛利|净利|价差|价格|金额|账期|逾期|税负|预付|占用|比例|%|％|天|万元|元|吨|数量/
  const rows = failedFindings(review)
    .filter((item) => regex.test(`${item.ruleName} ${item.issue} ${item.evidence} ${item.reason}`))
    .slice(0, 8)
    .map((item) => [item.ruleName, item.severity, item.evidence || item.issue || item.reason, item.suggestion || '补充底层交易数据并复核测算口径。'])
  if (!rows.length && signals.amounts.length) rows.push(['文档量化信息', '待研判', signals.amounts.join('；'), '需结合交易明细、合同价款、账期、毛利率和税负率进行复核。'])
  return rows
}

function taxRiskRows(review) {
  const rows = failedFindings(review)
    .filter((item) => /发票|税|票|专票|税负|开票|进项|销项|虚开/.test(`${item.ruleName} ${item.issue} ${item.evidence} ${item.reason}`))
    .slice(0, 8)
    .map((item) => [item.ruleName, item.severity, item.issue || item.reason, item.evidence || '未提供'])
  return rows.length ? rows : [['发票流/税务资料完整性', '待补证', '当前审查结果未形成明确税务风险命中项。', '建议补充发票、进销项、税负率和资金流水后复核。']]
}

function regulationRows(review) {
  const rows = importantFindings(review, 12).map((item) => {
    const meta = extractRuleMeta(item.ruleId)
    return [meta.regulation || item.category, item.ruleName, item.severity, item.issue || item.reason, item.evidence || '未提供']
  })
  return rows.length ? rows : [['监管条款', '未命中重大异常', '低', '当前规则未发现明确风险命中项。', '无']]
}

function evidenceRows(review) {
  const rows = importantFindings(review, 18)
  const items = rows.length ? rows : insufficientFindings(review).slice(0, 18)
  return items.map((item, index) => {
    const meta = extractRuleMeta(item.ruleId)
    return [`E-${String(index + 1).padStart(2, '0')}`, meta.dataSource || item.category, item.evidence || item.issue || item.reason, item.ruleName]
  })
}

function rectificationRows(review) {
  const rows = importantFindings(review, 12).map((item, index) => {
    const priority = item.severity === '高' ? '立即整改' : item.severity === '中' ? '限期整改' : '持续完善'
    const owner = /发票|税/.test(`${item.ruleName} ${item.issue}`) ? '财务/税务' : /合同|条款|主体|围标|串标/.test(`${item.ruleName} ${item.issue}`) ? '业务/法务' : '业务/风控'
    return [String(index + 1), priority, item.ruleName, item.suggestion || '补充材料并开展穿透核查。', owner, item.severity === '高' ? '3 个工作日内形成处置意见' : '10 个工作日内完成复核']
  })
  return rows.length ? rows : [['1', '持续完善', '审查留痕', '归档本次审查材料和模型输出。', '业务/风控', '按项目节奏完成']]
}


function riskItemsByType(review, type) {
  const items = reviewRiskItems(review)
  return type === 'material_gap' ? items.filter((item) => item.type === 'material_gap') : items.filter((item) => item.type !== 'material_gap')
}

function riskOverviewRows(review) {
  return riskItemsByType(review, 'risk').map((item, index) => [
    String(index + 1),
    item.title,
    item.category,
    item.statusText || item.severity,
    item.summary,
  ])
}

function materialGapRows(review) {
  return riskItemsByType(review, 'material_gap').map((item, index) => [
    String(index + 1),
    item.title,
    item.category,
    item.evidence || item.summary,
    item.suggestion,
  ])
}

function riskItemNarrative(item, index) {
  return [
    `### ${index + 1}. ${item.title} ——【${item.statusText || item.severity}】`,
    '',
    `- 风险维度：${item.category}`,
    `- 风险说明：${item.summary || '未提供'}`,
    `- 关键证据：${item.evidence || '未提供'}`,
    `- 处置建议：${item.suggestion || '补充材料并开展穿透复核。'}`,
  ].join('\n')
}

function riskRectificationRows(review) {
  const risks = riskItemsByType(review, 'risk')
  const gaps = riskItemsByType(review, 'material_gap')
  const source = risks.length ? risks : gaps
  const rows = source.slice(0, 12).map((item, index) => {
    const priority = item.type === 'material_gap' ? '补证核验' : item.severity === '高' ? '立即整改' : item.severity === '中' ? '限期整改' : '持续完善'
    const owner = /发票|税/.test(`${item.title} ${item.category}`) ? '财务/税务' : /合同|主体|招投标|审批|内控/.test(`${item.title} ${item.category}`) ? '业务/法务' : '业务/风控'
    const due = item.severity === '高' ? '3 个工作日内形成处置意见' : item.type === 'material_gap' ? '补齐材料后重新核验' : '10 个工作日内完成复核'
    return [String(index + 1), priority, item.title, item.suggestion || '补充材料并开展穿透核查。', owner, due]
  })
  return rows.length ? rows : [['1', '持续完善', '审查留痕', '归档本次审查材料和模型输出。', '业务/风控', '按项目节奏完成']]
}

function riskEvidenceRows(review) {
  const items = reviewRiskItems(review).slice(0, 24)
  return items.map((item, index) => [`E-${String(index + 1).padStart(2, '0')}`, item.category, item.evidence || item.summary || '未提供', item.title])
}

function ruleAppendixRows(review) {
  const riskItems = reviewRiskItems(review)
  const relatedTitleByRule = new Map()
  for (const item of riskItems) {
    for (const ruleId of item.relatedRuleIds || []) relatedTitleByRule.set(ruleId, item.title)
  }
  return [...failedFindings(review), ...insufficientFindings(review)].slice(0, 30).map((item) => [
    item.ruleId,
    item.ruleName,
    item.statusText || findingStatusLabel(item.status),
    relatedTitleByRule.get(item.ruleId) || item.category,
    item.evidence || item.issue || item.reason || '未提供',
  ])
}

function buildReportMarkdown(review, reportId, createdAt, document = null) {
  const riskItems = reviewRiskItems(review)
  const stats = riskItemStats(riskItems)
  const risks = riskItemsByType(review, 'risk')
  const gaps = riskItemsByType(review, 'material_gap')
  const signals = extractDocumentSignals(document)
  const title = reportTitle(review)
  const documentCount = review.documentCount || review.sourceDocuments?.length || document?.sourceDocuments?.length || 1
  return [
    `# ${title}`,
    '',
    `——基于${review.documentName}的合规分析`,
    '',
    `- 审查对象：${review.documentName}`,
    `- 审查材料：${documentCount} 篇`,
    `- 报告编号：${reportId}`,
    `- 关联审查：${review.id}`,
    `- 报告日期：${createdAt}`,
    `- 审查模型：${review.model}`,
    `- 审查文本：${review.checkedTextCharacters}/${review.totalTextCharacters} 字`,
    '',
    '## 报告结构',
    '',
    '一、审查结论',
    '二、主要风险概览',
    '三、重点风险明细',
    '四、材料缺口与待核验事项',
    '五、处置与整改建议',
    '六、证据索引',
    '附录、内部规则匹配明细',
    '',
    '## 一、审查结论',
    '',
    `综合评分：${review.score} 分；风险等级：${riskLevel(review)}。`,
    '',
    review.conclusion || defaultRiskConclusionFromItems(riskItems),
    '',
    review.summary || riskSummaryFromItems(riskItems),
    '',
    `本次面向用户汇总为 ${stats.riskItemCount} 项主要风险、${stats.materialGapCount} 项待补充材料事项。内部规则命中明细仅作为附录留痕，不作为用户主结论。`,
    '',
    '## 二、主要风险概览',
    '',
    riskOverviewRows(review).length ? markdownTable(['序号', '风险事项', '风险维度', '等级', '风险摘要'], riskOverviewRows(review)) : '当前上传材料未识别出明确风险事项。',
    '',
    '### 交易主体及关键线索',
    '',
    signals.companies.length ? signals.companies.map((name) => `- ${name}`).join('\n') : '当前文本未能稳定抽取交易主体名称，建议补充合同首页、签章页、供应商/客户清单及工商穿透信息。',
    '',
    markdownTable(['类型', '抽取线索'], [
      ['金额/比例/数量', signals.amounts.join('；') || '未稳定抽取'],
      ['日期/周期', signals.dates.join('；') || '未稳定抽取'],
    ]),
    '',
    '## 三、重点风险明细',
    '',
    risks.length ? risks.map(riskItemNarrative).join('\n\n') : '当前上传材料未识别出明确风险事项。',
    '',
    '## 四、材料缺口与待核验事项',
    '',
    gaps.length ? markdownTable(['序号', '待核验事项', '风险维度', '缺口说明', '补充建议'], materialGapRows(review)) : '当前审查未形成单独的材料缺口事项。',
    '',
    '## 五、处置与整改建议',
    '',
    markdownTable(['序号', '优先级', '风险事项', '整改动作', '建议责任部门', '完成要求'], riskRectificationRows(review)),
    '',
    '### 建议处置路径',
    '',
    '- 对高风险事项，建议暂停新增同类业务或暂缓合同签署，先完成商业实质论证。',
    '- 对主体、关联关系、资金流、货权流不清晰的事项，开展股权穿透、受益所有人识别和银行流水核验。',
    '- 对发票和税务风险事项，联动财务、税务、法务复核进销项、税负率、开票依据和真实交付证据。',
    '- 对确需继续开展的供应链贸易，补强真实货权控制、独立质检、物流留痕和合理商业利润机制。',
    '',
    '## 六、证据索引',
    '',
    markdownTable(['编号', '证据来源/数据来源', '关键内容', '对应风险'], riskEvidenceRows(review)),
    '',
    '## 附录：内部规则匹配明细',
    '',
    '以下内容为系统内部审查依据，用于审计留痕、复核和规则追溯。用户主结论以“风险事项”和“材料缺口”为准。',
    '',
    ruleAppendixRows(review).length ? markdownTable(['规则编号', '内部规则', '结果', '关联风险事项', '依据说明'], ruleAppendixRows(review)) : '无明确风险或材料缺口对应的内部规则明细。',
    '',
    '## 报告性质声明',
    '',
    '本报告系依据用户上传材料、系统内置虚假贸易审查规则及模型分析结果形成的合规风险识别报告。结论受限于上传材料的完整性、真实性、时效性及可解析程度。涉及外部工商股权、银行流水、物流轨迹、过磅化验单据、发票底账等佐证材料未纳入或未完整纳入本次审查的，最终定性应结合相关原始证据由具备相应权限和资质的人员综合判断。本报告仅供内部审查、整改和穿透核查辅助使用，不构成法律意见、审计结论或税务鉴证意见。',
  ].join('\n')
}

export async function generateSuperAgentReport(reviewId) {
  await ensureStorage()
  const review = await getReview(reviewId)
  if (!review) fail(404, '审查结果不存在，请先完成文档审查')
  const id = `RPT-${randomUUID()}`
  const createdAt = nowText()
  const documentIds = reviewDocumentIds(review)
  const document = documentIds.length ? await loadDocumentBundle(documentIds, { required: false }) : null
  const sourceDocuments = document?.sourceDocuments || review.sourceDocuments || []
  const riskItems = reviewRiskItems(review)
  const itemStats = riskItemStats(riskItems)
  const failedCount = itemStats.riskItemCount
  const insufficientCount = itemStats.materialGapCount
  const passedCount = passedFindings(review).length
  const sections = [
    '审查概述',
    '主要风险概览',
    '重点风险明细',
    '材料缺口与待核验事项',
    '处置与整改建议',
    '证据索引',
    '内部规则匹配明细',

  ]
  const report = {
    id,
    reviewId: review.id,
    documentId: review.documentId,
    documentIds,
    documentName: review.documentName,
    documentCount: sourceDocuments.length || review.documentCount || 1,
    sourceDocuments,
    createdAt,
    title: reportTitle(review),
    summary: review.summary,
    conclusion: review.conclusion,
    riskLevel: riskLevel(review),
    sections,
    riskStats: {
      score: review.score,
      ruleCount: review.ruleCount,
      failedCount,
      riskCount: failedCount,
      riskItemCount: itemStats.riskItemCount,
      insufficientCount,
      materialGapCount: itemStats.materialGapCount,
      passedCount,
      highCount: itemStats.highRiskItemCount,
      mediumCount: itemStats.mediumRiskItemCount,
      lowCount: itemStats.lowRiskItemCount,
    },
    categoryStats: categoryRows(review).map(([category, riskItemsCount, materialGapCount, severityStats, mainRisk]) => ({
      category,
      riskItems: riskItemsCount,
      materialGaps: materialGapCount,
      severityStats,
      mainRisk,
    })),
    evidenceCount: riskEvidenceRows(review).length,
    riskItems,
    findings: review.findings,
    markdown: buildReportMarkdown(review, id, createdAt, document),
  }
  await saveReport(report)
  return report
}

function detectTurnIntent(message) {
  const text = String(message || '').trim().toLowerCase()
  if (!text) return 'chat'
  if (/(生成|导出|出具|形成|制作|整理).{0,8}(检测报告|审查报告|正式报告|报告)|^(检测报告|审查报告|正式报告)$/i.test(text)) return 'report'
  if (/整改清单|整改建议|整改计划|闭环清单|问题清单|整改动作|验收标准/.test(text)) return 'rectification'
  if (/审查|审核|检查|检测|核查|排查|筛查|扫描|识别|研判|评估|风控|风险|问题|合规|违规|异常贸易|虚假贸易|空转|走单|循环贸易|融资性贸易|围标|串标|围串标|三流|货权|资金流|交易对手|规则匹配|审一下|审一审|查一下|测一下|看一下|帮我看/.test(text)) return 'review'
  return 'chat'
}

function shouldRerunReview(message) {
  return /重新|再次|重跑|再审|重新审查|重新检测/.test(String(message || ''))
}

function reviewDoneAnswerText(review, documentLabel) {
  const stats = riskItemStats(reviewRiskItems(review))
  return `已完成${documentLabel}审查。综合评分 ${review.score} 分，结论：${review.conclusion}
本次识别主要风险 ${stats.riskItemCount} 项，其中高风险 ${stats.highRiskItemCount} 项、中风险 ${stats.mediumRiskItemCount} 项、低风险 ${stats.lowRiskItemCount} 项；另有 ${stats.materialGapCount} 项材料需补充核验。
你可以继续追问具体风险、要求生成整改清单，或生成正式检测报告。`
}
function rectificationAnswer(review) {
  const risks = riskItemsByType(review, 'risk')
  if (!risks.length) {
    const gaps = riskItemsByType(review, 'material_gap')
    if (gaps.length) return `当前检测报告综合评分 ${review.score} 分，未识别出明确风险事项，但有 ${gaps.length} 项材料需补充核验。建议补充对应合同、订单、资金流水、物流、货权、发票等材料后复核。`
    return `当前检测报告综合评分 ${review.score} 分，未识别出明确风险事项。建议保留本次审查记录，并按项目流程完成归档。`
  }
  const lines = risks.map((item, index) => `${index + 1}. [${item.severity}] ${item.title}\n风险说明：${item.summary || '未提供'}\n整改动作：${item.suggestion || '补充事实依据、责任主体、时间要求和验收标准。'}\n验收标准：能够补充形成对应证据、责任边界和闭环处置记录。`)
  return `已基于当前检测报告生成整改清单，共 ${risks.length} 项主要风险：\n\n${lines.join('\n\n')}`
}

export async function handleSuperAgentTurn(payload) {
  await ensureStorage()
  const question = String(payload.message || '').trim()
  if (!question) fail(400, '请输入问题')
  const intent = detectTurnIntent(question)
  const conversationId = normalizeConversationId(payload.conversationId)
  const storedConversation = await getSuperAgentConversation(conversationId)
  const payloadDocumentIds = documentIdsFromPayload(payload)
  const storedDocumentIds = normalizeDocumentIds(storedConversation?.documentIds)
  const documentIds = payloadDocumentIds.length ? payloadDocumentIds : storedDocumentIds
  const reviewId = payload.reviewId ? String(payload.reviewId) : String(storedConversation?.reviewId || '')
  const reportId = payload.reportId ? String(payload.reportId) : String(storedConversation?.reportId || '')
  const baseMessages = normalizeConversationMessages(storedConversation?.messages?.length ? storedConversation.messages : payload.messages, 50)
  const documentLabel = documentIds.length > 1 ? `${documentIds.length} 篇文档` : '当前文档'

  const completeTurn = async (response, statePatch = {}) => {
    const userEntry = { id: `MSG-${randomUUID()}`, role: 'user', content: question, kind: intent, status: 'done', createdAt: nowText() }
    const assistantEntry = { id: `MSG-${randomUUID()}`, role: 'assistant', content: response.answer || '', kind: response.type || intent, status: 'done', createdAt: response.answeredAt || nowText() }
    const saved = await saveSuperAgentConversation({
      id: conversationId,
      title: storedConversation?.title || conversationTitle(question),
      documentIds: statePatch.documentIds || documentIds,
      reviewId: statePatch.reviewId ?? reviewId,
      reportId: statePatch.reportId ?? reportId,
      lastIntent: response.type || intent,
      messages: [...baseMessages, userEntry, assistantEntry],
    })
    return { ...response, conversationId, conversation: saved }
  }

  const turnPayload = {
    ...payload,
    conversationId,
    documentIds,
    reviewId,
    reportId,
    messages: mergeDialogueHistory(storedConversation?.messages, payload.messages),
  }

  if (intent === 'review') {
    if (!documentIds.length) {
      return completeTurn({ type: 'review', intent, answer: '可以审查。请先上传需要审查的一篇或多篇文档，然后说明审查要求。', answeredAt: nowText() })
    }
    const currentReview = reviewId ? await getReview(reviewId) : null
    if (currentReview && sameDocumentSet(currentReview, documentIds) && !shouldRerunReview(question)) {
      return completeTurn({
        type: 'review',
        intent,
        answer: `${reviewDoneAnswerText(currentReview, documentLabel)}
如需正式检测报告，请点击“生成报告”或输入“生成正式检测报告”。`,
        review: currentReview,
        answeredAt: nowText(),
      }, { documentIds, reviewId: currentReview.id, reportId: '' })
    }
    const review = await runSuperAgentReview(documentIds)
    return completeTurn({
      type: 'review',
      intent,
      answer: reviewDoneAnswerText(review, documentLabel),
      review,
      answeredAt: nowText(),
    }, { documentIds, reviewId: review.id, reportId: '' })
  }

  if (intent === 'report') {
    if (!reviewId) {
      return completeTurn({ type: 'report', intent, answer: '生成正式检测报告需要先完成文档审查。请先上传文档并说明审查要求，审查完成后我会生成报告。', answeredAt: nowText() })
    }
    const report = await generateSuperAgentReport(reviewId)
    return completeTurn({
      type: 'report',
      intent,
      answer: `正式检测报告已生成：${report.title}\n报告编号：${report.id}\n风险等级：${report.riskLevel}，综合评分 ${report.riskStats.score} 分。你可以继续让我解释报告结论、补充整改清单，或导出 Word 版本。`,
      report,
      answeredAt: nowText(),
    }, { documentIds: report.documentIds || documentIds, reviewId: report.reviewId, reportId: report.id })
  }

  if (intent === 'rectification') {
    const review = reviewId ? await getReview(reviewId) : null
    if (!review) {
      return completeTurn({ type: 'rectification', intent, answer: '生成整改清单需要先完成文档审查。请先上传文档并说明审查要求。', answeredAt: nowText() })
    }
    return completeTurn({ type: 'rectification', intent, answer: rectificationAnswer(review), answeredAt: nowText() }, { documentIds, reviewId: review.id, reportId })
  }

  const result = await answerSuperAgentQuestion(turnPayload)
  return completeTurn({ type: 'chat', intent, ...result }, { documentIds, reviewId, reportId })
}

function reviewContext(review) {
  if (!review) return ''
  const risks = riskItemsByType(review, 'risk').slice(0, 12).map((item, index) => `${index + 1}. [${item.severity}] ${item.title}: ${item.summary || '存在异常线索'}\n依据：${item.evidence || '未提供'}\n建议：${item.suggestion || '未提供'}`).join('\n')
  const gaps = riskItemsByType(review, 'material_gap').slice(0, 6).map((item, index) => `${index + 1}. ${item.title}: ${item.evidence || item.summary || '材料不足'}\n建议：${item.suggestion || '补充材料后复核'}`).join('\n')
  return `当前审查报告：${review.documentName}\n得分：${review.score}\n结论：${review.conclusion}\n摘要：${review.summary}\n主要风险：\n${risks || '未识别出明确风险事项'}\n\n待补充材料：\n${gaps || '无单独材料缺口事项'}`
}

export async function answerSuperAgentQuestion(payload) {
  const question = String(payload.message || '').trim()
  if (!question) fail(400, '请输入问题')
  const documentIds = documentIdsFromPayload(payload)
  const document = documentIds.length ? await loadDocumentBundle(documentIds, { required: false }) : null
  const review = payload.reviewId ? await getReview(payload.reviewId) : null
  const conversation = payload.conversationId ? await getSuperAgentConversation(payload.conversationId) : null
  const contextParts = []
  if (document) {
    const sourceDocuments = document.sourceDocuments || [document]
    const materialList = sourceDocuments.map((item, index) => `${index + 1}. ${item.fileName}，正文 ${item.characters} 字`).join('\n')
    contextParts.push(`当前材料包：${document.fileName}\n材料数量：${sourceDocuments.length}\n材料清单：\n${materialList}\n文档摘录：\n${briefText(document.text, 5000)}`)
  }
  if (review) contextParts.push(reviewContext(review))
  const rawHistory = Array.isArray(payload.messages) && payload.messages.length ? payload.messages : conversation?.messages
  const history = Array.isArray(rawHistory) ? rawHistory.slice(-12).filter((item) => ['user', 'assistant'].includes(item.role) && item.content).map((item) => ({ role: item.role, content: String(item.content).slice(0, 2500) })) : []
  const messages = [
    { role: 'system', content: '你是超级智能体，负责真实回答用户问题，并在有文档或审查报告上下文时优先基于上下文回答。不要声称已经执行未执行的操作。' },
    ...(contextParts.length ? [{ role: 'system', content: contextParts.join('\n\n---\n\n') }] : []),
    ...history,
    { role: 'user', content: question },
  ]
  const result = await callSuperAgentModel({ messages, temperature: 0.3, maxTokens: 2200 })
  return { answer: result.content.trim(), model: result.model, usage: result.usage, answeredAt: nowText() }
}

export async function getSuperAgentDocument(id) {
  const document = await loadDocument(id)
  if (!document) return null
  const { text, ...publicDocument } = document
  return publicDocument
}

export function listSuperAgentRules() {
  return publicRules()
}

export function superAgentRuntimeInfo() {
  return { model: getSuperAgentModelName(), rules: publicRules().length, maxUploadBytes, reviewTextLimit, quickReviewTextLimit, reviewRuleBatchSize, reviewRuleBatchConcurrency, reviewPrecheckIssueLimit, reviewVerifyHighRiskDuringReview }
}










