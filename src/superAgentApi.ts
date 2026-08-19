export type ReviewSeverity = '高' | '中' | '低'
export type ReviewFindingStatus = 'passed' | 'risk' | 'insufficient'

export type SuperAgentDocument = {
  id: string
  fileName: string
  mimeType: string
  ext: string
  size: number
  characters: number
  chunks: number
  preview: string
  uploadedAt: string
  parser: string
}

export type SuperAgentRule = {
  id: string
  name: string
  category: string
  severity: ReviewSeverity
  description: string
}

export type ReviewFinding = {
  id: string
  ruleId: string
  ruleName: string
  category: string
  severity: ReviewSeverity
  status?: ReviewFindingStatus
  statusText?: string
  passed: boolean
  verified?: boolean
  verificationModel?: string
  issue: string
  evidence: string
  suggestion: string
  reason: string
}

export type ReviewRiskItem = {
  id: string
  type?: 'risk' | 'material_gap'
  title: string
  category: string
  severity: ReviewSeverity
  statusText?: string
  summary: string
  evidence: string
  suggestion: string
  findingIds?: string[]
  relatedRuleIds?: string[]
  relatedRuleNames?: string[]
  findingCount?: number
}
export type SuperAgentReview = {
  id: string
  documentId: string
  documentIds?: string[]
  documentName: string
  documentCount?: number
  sourceDocuments?: SuperAgentDocument[]
  createdAt: string
  model: string
  reviewMode?: 'quick-risk' | 'full-rules'
  isPreliminary?: boolean
  ruleCount: number
  checkedTextCharacters: number
  totalTextCharacters: number
  score: number
  conclusion: string
  summary: string
  highCount: number
  mediumCount: number
  lowCount: number
  riskCount?: number
  insufficientCount?: number
  passedCount?: number
  riskItems?: ReviewRiskItem[]
  riskItemCount?: number
  materialGapCount?: number
  highRiskItemCount?: number
  mediumRiskItemCount?: number
  lowRiskItemCount?: number
  findings: ReviewFinding[]
}
export type SuperAgentReviewJobStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed'

export type SuperAgentReviewJobBatch = {
  batch: number
  status: 'completed' | 'failed'
  ruleIds: string[]
  errorMessage?: string
  model?: string
  finishedAt?: string
}

export type SuperAgentReviewJob = {
  id: string
  conversationId?: string
  title?: string
  question?: string
  status: SuperAgentReviewJobStatus
  stage?: string
  documentIds: string[]
  documentName: string
  documentCount?: number
  totalCharacters?: number
  checkedTextCharacters?: number
  ruleCount: number
  totalBatches: number
  completedBatches: number
  failedBatches: number
  processedBatches: number
  findingsCount: number
  riskCount?: number
  insufficientCount?: number
  passedCount?: number
  precheckIssueCount?: number
  precheckErrorMessage?: string
  precheckModel?: string
  highCount: number
  mediumCount: number
  lowCount: number
  progress: number
  batchSize?: number
  batchConcurrency?: number
  currentBatch?: number
  reviewId?: string
  quickReviewId?: string
  fullReviewId?: string
  quickReviewCompletedAt?: string
  reportId?: string
  errorMessage?: string
  createdAt: string
  startedAt?: string
  updatedAt?: string
  completedAt?: string
  batchResults?: SuperAgentReviewJobBatch[]
  review?: SuperAgentReview
}

export type SuperAgentReport = {
  id: string
  reviewId: string
  documentId: string
  documentIds?: string[]
  documentName: string
  documentCount?: number
  sourceDocuments?: SuperAgentDocument[]
  createdAt: string
  title: string
  summary: string
  conclusion: string
  riskLevel: string
  sections?: string[]
  categoryStats?: Array<{
    category: string
    ruleCount?: string
    failedRules?: string
    riskItems?: string
    materialGaps?: string
    severityStats: string
    mainRisk: string
  }>
  evidenceCount?: number
  riskStats: {
    score: number
    ruleCount: number
    failedCount: number
    riskCount?: number
    riskItemCount?: number
    insufficientCount?: number
    materialGapCount?: number
    passedCount: number
    highCount: number
    mediumCount: number
    lowCount: number
  }
  riskItems?: ReviewRiskItem[]
  findings: ReviewFinding[]
  markdown: string
}

export type SuperAgentTurnType = 'chat' | 'review' | 'report' | 'rectification'

export type SuperAgentServerConversation = {
  id: string
  title: string
  updatedAt: string
  documentIds?: string[]
  reviewId?: string
  quickReviewId?: string
  fullReviewId?: string
  quickReviewCompletedAt?: string
  reportId?: string
  lastIntent?: SuperAgentTurnType
  messages?: Array<{ role: 'user' | 'assistant'; content: string; kind?: SuperAgentTurnType; status?: string; createdAt?: string }>
}
export type SuperAgentTurnResponse = {
  type: SuperAgentTurnType
  intent: SuperAgentTurnType
  answer: string
  model?: string
  answeredAt: string
  conversationId?: string
  conversation?: SuperAgentServerConversation
  review?: SuperAgentReview
  report?: SuperAgentReport
}

export type SuperAgentChatResponse = {
  answer: string
  model: string
  answeredAt: string
}

export type SuperAgentRuntime = {
  model: string
  rules: number
  maxUploadBytes: number
  reviewTextLimit: number
  quickReviewTextLimit?: number
  reviewRuleBatchSize?: number
  reviewRuleBatchConcurrency?: number
  reviewPrecheckIssueLimit?: number
  reviewVerifyHighRiskDuringReview?: boolean
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const text = await response.text()
  let data: unknown = null
  if (text) {
    try { data = JSON.parse(text) } catch { data = { message: text } }
  }
  if (!response.ok) {
    const message = typeof data === 'object' && data && 'message' in data ? String((data as { message?: unknown }).message) : `请求失败：${response.status}`
    throw new Error(message)
  }
  return data as T
}

async function requestBlob(url: string): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) {
    const text = await response.text()
    let data: unknown = null
    try { data = text ? JSON.parse(text) : null } catch { data = { message: text } }
    const message = typeof data === 'object' && data && 'message' in data ? String((data as { message?: unknown }).message) : `请求失败：${response.status}`
    throw new Error(message)
  }
  return response.blob()
}
function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '')
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

export const superAgentApi = {
  runtime: () => request<SuperAgentRuntime>('/api/super-agent/runtime'),
  rules: () => request<SuperAgentRule[]>('/api/super-agent/rules'),
  uploadDocument: async (file: File) => request<SuperAgentDocument>('/api/super-agent/documents/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, mimeType: file.type, size: file.size, base64: await fileToBase64(file) }),
  }),
  createReview: (documentIds: string | string[]) => request<SuperAgentReview>('/api/super-agent/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Array.isArray(documentIds) ? { documentIds } : { documentId: documentIds }),
  }),
  createReviewJob: (payload: { message: string; conversationId?: string; documentId?: string; documentIds?: string[]; reviewId?: string; reportId?: string; messages?: Array<{ role: 'user' | 'assistant'; content: string; kind?: SuperAgentTurnType; status?: string }> }) => request<SuperAgentReviewJob>('/api/super-agent/review-jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  getReviewJob: (jobId: string) => request<SuperAgentReviewJob>('/api/super-agent/review-jobs/' + encodeURIComponent(jobId)),
  retryReviewJob: (jobId: string) => request<SuperAgentReviewJob>('/api/super-agent/review-jobs/' + encodeURIComponent(jobId) + '/retry', { method: 'POST' }),
  turn: (payload: { message: string; conversationId?: string; documentId?: string; documentIds?: string[]; reviewId?: string; reportId?: string; messages?: Array<{ role: 'user' | 'assistant'; content: string; kind?: SuperAgentTurnType; status?: string }> }) => request<SuperAgentTurnResponse>('/api/super-agent/turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  generateReport: (reviewId: string) => request<SuperAgentReport>('/api/super-agent/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewId }),
  }),
  downloadReportDocx: (reportId: string) => requestBlob(`/api/super-agent/reports/${encodeURIComponent(reportId)}/docx`),
  deleteConversation: (conversationId: string) => request<Record<'ok', boolean>>('/api/super-agent/conversations/' + encodeURIComponent(conversationId), { method: 'DELETE' }),
  chat: (payload: { message: string; conversationId?: string; documentId?: string; documentIds?: string[]; reviewId?: string; reportId?: string; messages?: Array<{ role: 'user' | 'assistant'; content: string; kind?: SuperAgentTurnType; status?: string }> }) => request<SuperAgentChatResponse>('/api/super-agent/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
}










