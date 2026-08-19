import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import mascot from '../assets/super-agent-mascot.png'
import { superAgentApi, type ReviewFinding, type ReviewRiskItem, type SuperAgentDocument, type SuperAgentReport, type SuperAgentReview, type SuperAgentReviewJob, type SuperAgentRule, type SuperAgentRuntime } from '../superAgentApi'
import '../superAgent.css'

type ChatMessageKind = 'chat' | 'review' | 'report' | 'rectification' | 'document'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  status?: 'thinking' | 'done' | 'error'
  elapsed?: string
  kind?: ChatMessageKind
}

type ConversationStatus = 'idle' | 'generating' | 'unread'
type AgentNavId = 'new' | 'agents' | 'skills' | 'knowledge' | 'automation'

type Conversation = {
  id: string
  title: string
  updatedAt: string
  status: ConversationStatus
  messages: ChatMessage[]
  document?: SuperAgentDocument | null
  documents?: SuperAgentDocument[] | null
  review?: SuperAgentReview | null
  reviewJob?: SuperAgentReviewJob | null
  report?: SuperAgentReport | null
}

type AgentNavItem = {
  id: AgentNavId
  label: string
  icon: AgentIconName
}

type AgentIconName = 'new' | 'agents' | 'skills' | 'knowledge' | 'automation' | 'search' | 'info' | 'think' | 'attach' | 'voice' | 'send' | 'down' | 'menu' | 'download' | 'trash'

const navItems: AgentNavItem[] = [
  { id: 'new', label: '新对话', icon: 'new' },
  { id: 'agents', label: '智能体', icon: 'agents' },
  { id: 'skills', label: '技能', icon: 'skills' },
  { id: 'knowledge', label: '规则', icon: 'knowledge' },
  { id: 'automation', label: '任务', icon: 'automation' },
]

const starterSuggestions = ['先总结这份文档的核心内容', '帮我进行文档审查', '基于当前审查结果生成检测报告']
const emptyConversations: Conversation[] = []
const conversationStorageKey = 'super-agent-conversations-v1'
const selectedConversationStorageKey = 'super-agent-selected-conversation-v1'

function loadStoredConversations(): Conversation[] {
  if (typeof window === 'undefined') return emptyConversations
  try {
    const parsed = JSON.parse(window.localStorage.getItem(conversationStorageKey) || '[]')
    if (!Array.isArray(parsed)) return emptyConversations
    return parsed.filter((item) => item && typeof item.id === 'string' && Array.isArray(item.messages)).slice(0, 30)
  } catch {
    return emptyConversations
  }
}

function loadStoredSelectedConversationId() {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(selectedConversationStorageKey) || ''
}

function persistConversations(items: Conversation[]) {
  if (typeof window === 'undefined') return
  const normalized = items.slice(0, 30).map((item) => ({ ...item, messages: item.messages.slice(-80) }))
  try {
    window.localStorage.setItem(conversationStorageKey, JSON.stringify(normalized))
  } catch {
    window.localStorage.setItem(conversationStorageKey, JSON.stringify(normalized.slice(0, 8).map((item) => ({ ...item, messages: item.messages.slice(-30), report: null }))))
  }
}

function conversationHistoryPayload(messages: ChatMessage[]) {
  return messages
    .filter((message) => message.status !== 'thinking' && message.content.trim())
    .slice(-16)
    .map((message) => ({ role: message.role, content: message.content, kind: modelMessageKind(message.kind), status: message.status }))
}

function modelMessageKind(kind: ChatMessage['kind']) {
  return kind === 'document' ? undefined : kind
}

function isDocumentContextMessage(message: ChatMessage) {
  return message.role === 'assistant' && (message.kind === 'document' || /^文档解析完成/.test(message.content.trim()))
}

function isReportContextMessage(message: ChatMessage) {
  return message.role === 'assistant' && message.kind === 'report' && message.status === 'done'
}

function lastMessageId(messages: ChatMessage[], predicate: (message: ChatMessage) => boolean) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (predicate(messages[index])) return messages[index].id
  }
  return ''
}

function nextId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function titleFromQuestion(value: string) {
  const text = value.trim().replace(/\s+/g, ' ')
  if (!text) return '新对话'
  return text.length > 18 ? `${text.slice(0, 18)}...` : text
}

function elapsedFrom(startedAt: number) {
  return `${((performance.now() - startedAt) / 1000).toFixed(1)}秒`
}
function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function isReviewJobFinished(job: SuperAgentReviewJob) {
  return job.status === 'completed' || job.status === 'partial' || job.status === 'failed'
}

function isReviewJobRunning(job?: SuperAgentReviewJob | null) {
  return Boolean(job && !isReviewJobFinished(job))
}

function formatReviewJobStatus(job: SuperAgentReviewJob) {
  if (job.status === 'queued') return '排队中'
  if (job.status === 'running' && job.stage === 'prechecking') return '问题线索预审中'
  if (job.status === 'running' && job.review) return '规则依据追溯中'
  if (job.status === 'running') return '风险识别中'
  if (job.status === 'partial') return '已完成，部分结果待补齐'
  if (job.status === 'completed') return '已完成'
  return '处理失败'
}

function formatReviewJobProgress(job: SuperAgentReviewJob) {
  const failed = job.failedBatches || 0
  const failedText = failed ? '\n部分结果暂未形成可靠结论，系统会保留已完成结果。' : ''
  const quickText = job.review ? '\n初步风险清单已生成，正在后台补充规则依据和报告附录。' : ''
  return `审查任务已进入后台执行：${formatReviewJobStatus(job)}\n审查进度：${job.progress || 0}%${quickText}\n已识别风险线索：高 ${job.highCount || 0} / 中 ${job.mediumCount || 0} / 低 ${job.lowCount || 0}；待补充材料 ${job.insufficientCount || 0} 项${failedText}\n当前会话审查中，暂不可继续输入；你可以切换到其他会话或新建对话。完成后我会自动给出最终结果和报告入口。`
}
function formatReviewJobDone(job: SuperAgentReviewJob) {
  const review = job.review
  if (!review) return job.errorMessage || '审查任务已结束，但未生成可用审查结果。'
  const partialText = job.status === 'partial' ? '部分结果未形成可靠结论，已先汇总成功审查结果，建议后续重试补齐。\n' : ''
  const documentLabel = review.documentCount && review.documentCount > 1 ? `${review.documentCount} 篇文档` : '当前文档'
  const stats = riskItemStats(fallbackRiskItems(review))
  return `${partialText}已完成${documentLabel}审查。综合评分 ${review.score} 分，结论：${review.conclusion}\n本次识别主要风险 ${stats.risks.length} 项，其中高风险 ${stats.high} 项、中风险 ${stats.medium} 项、低风险 ${stats.low} 项；另有 ${stats.gaps.length} 项材料需补充核验。\n你可以继续追问具体风险、要求生成整改清单，或生成正式检测报告。`
}
function isRiskFinding(finding: ReviewFinding) {
  return finding.status === 'risk' || (!finding.status && finding.passed === false)
}

function isInsufficientFinding(finding: ReviewFinding) {
  return finding.status === 'insufficient'
}

function findingStatusText(finding: ReviewFinding) {
  if (finding.statusText) return finding.statusText
  if (isRiskFinding(finding)) return '命中风险'
  if (isInsufficientFinding(finding)) return '证据不足'
  return '通过'
}

function findingRiskCategory(finding: ReviewFinding) {
  const text = `${finding.category} ${finding.ruleName} ${finding.issue} ${finding.evidence} ${finding.reason}`
  if (/关联|股权|实际控制|交易对手|客户|供应商|空壳|资质/.test(text)) return '主体关联'
  if (/货权|物流|运输|仓储|仓单|入库|出库|过磅|化验|签收|交付|货物/.test(text)) return '货物流/货权'
  if (/资金|付款|收款|回款|银行|流水|账户|账期|逾期|预付|融资|保证金/.test(text)) return '资金流'
  if (/发票|税|票|专票|开票|进项|销项|税负|虚开/.test(text)) return '发票税务'
  if (/合同|订单|协议|签约|履约|结算|条款|价格|数量|标的/.test(text)) return '合同履约'
  if (/审批|内控|授权|决策|制度|流程|台账|留痕|尽调|准入/.test(text)) return '审批内控'
  if (/招标|投标|围标|串标|比价|竞价|中标/.test(text)) return '招投标'
  if (/商业实质|真实贸易|空转|走单|循环|融资性|通道|闭环|虚假/.test(text)) return '商业实质'
  return finding.category || '其他风险'
}

function fallbackRiskItems(review: SuperAgentReview | null): ReviewRiskItem[] {
  if (!review) return []
  if (review.riskItems?.length) return review.riskItems
  const source = [...review.findings.filter(isRiskFinding), ...review.findings.filter(isInsufficientFinding)]
  return source.slice(0, 16).map((finding, index) => ({
    id: `RISK-FALLBACK-${index + 1}`,
    type: isInsufficientFinding(finding) ? 'material_gap' : 'risk',
    title: isInsufficientFinding(finding) ? `${findingRiskCategory(finding)}材料需补充核验` : (finding.issue || finding.reason || finding.ruleName || '风险事项').replace(/^(问题|风险|异常|疑似)[:：\s]*/g, '').slice(0, 42),
    category: findingRiskCategory(finding),
    severity: finding.severity,
    statusText: isInsufficientFinding(finding) ? '需补充材料' : `${finding.severity}风险`,
    summary: finding.issue || finding.reason || '存在异常线索',
    evidence: finding.evidence || finding.reason || '未提供',
    suggestion: finding.suggestion || '补充材料并开展穿透复核。',
    findingIds: [finding.id],
    relatedRuleIds: [finding.ruleId],
    relatedRuleNames: [finding.ruleName],
    findingCount: 1,
  }))
}

function riskItemStats(items: ReviewRiskItem[]) {
  const risks = items.filter((item) => item.type !== 'material_gap')
  const gaps = items.filter((item) => item.type === 'material_gap')
  return {
    risks,
    gaps,
    high: risks.filter((item) => item.severity === '高').length,
    medium: risks.filter((item) => item.severity === '中').length,
    low: risks.filter((item) => item.severity === '低').length,
  }
}
function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '处理失败，请稍后重试'
  if (/CodingPlan subscription|subscription has expired|订阅|过期/i.test(message)) return '模型服务返回 CodingPlan 订阅无效或已过期，请在火山方舟控制台开通或续费 Coding Plan 后重试。当前文档解析结果已保留。'
  if (/API key|AK\/SK|missing or invalid|invalid/i.test(message)) return '模型服务返回 API Key 无效或未授权，请确认火山方舟 Plan / OpenAI 兼容协议使用的 key 是否正确。当前文档解析结果已保留。'
  if (/额度不足|insufficient|quota/i.test(message)) return '模型服务返回额度不足，请在 provider 侧充值或更换可用 API Key 后重试。当前文档解析结果已保留。'
  if (/not found|404/i.test(message)) return '模型接口返回 Not Found，请检查 Base URL、协议类型或模型 ID 是否匹配。当前文档解析结果已保留。'
  if (/timeout|超时/i.test(message)) return '模型服务调用超时，请稍后重试。当前文档解析结果已保留。'
  return message
}

function formatSize(value: number) {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${value} B`
}

function safeFileBase(name: string) {
  return (name || '检测报告').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || '检测报告'
}

function guessTurnIntent(value: string): 'chat' | 'review' | 'report' | 'rectification' {
  const text = value.trim().toLowerCase()
  if (/(生成|导出|出具|形成|制作|整理).{0,8}(检测报告|审查报告|正式报告|报告)|^(检测报告|审查报告|正式报告)$/.test(text)) return 'report'
  if (/整改清单|整改建议|整改计划|闭环清单|问题清单|整改动作|验收标准/.test(text)) return 'rectification'
  if (/审查|审核|检查|检测|核查|排查|筛查|扫描|识别|研判|评估|风控|风险|问题|合规|违规|异常贸易|虚假贸易|空转|走单|循环贸易|融资性贸易|围标|串标|围串标|三流|货权|资金流|交易对手|规则匹配|审一下|审一审|查一下|测一下|看一下|帮我看/.test(text)) return 'review'
  return 'chat'
}

function buildReportMarkdown(review: SuperAgentReview) {
  const riskItems = fallbackRiskItems(review)
  const stats = riskItemStats(riskItems)
  const lines = [
    '# 文档检测报告',
    '',
    `- 报告编号：${review.id}`,
    `- 文档名称：${review.documentName}`,
    `- 生成时间：${review.createdAt}`,
    `- 审查模型：${review.model}`,
    `- 综合评分：${review.score}`,
    `- 风险事项：${stats.risks.length} 项；待补充材料：${stats.gaps.length} 项`,
    '',
    '## 审查结论',
    '',
    review.conclusion,
    '',
    '## 总体摘要',
    '',
    review.summary || '无',
    '',
    '## 主要风险',
    '',
  ]
  if (stats.risks.length) {
    stats.risks.forEach((item, index) => {
      lines.push(
        `### ${index + 1}. [${item.statusText || item.severity}] ${item.title}`,
        '',
        `- 风险维度：${item.category}`,
        `- 风险说明：${item.summary || '无'}`,
        `- 关键依据：${item.evidence || '无'}`,
        `- 整改建议：${item.suggestion || '无'}`,
        '',
      )
    })
  } else {
    lines.push('当前上传材料未识别出明确风险事项。', '')
  }
  lines.push('## 材料缺口与待核验事项', '')
  if (stats.gaps.length) {
    stats.gaps.forEach((item, index) => {
      lines.push(
        `### ${index + 1}. ${item.title}`,
        '',
        `- 风险维度：${item.category}`,
        `- 缺口说明：${item.evidence || item.summary || '无'}`,
        `- 补充建议：${item.suggestion || '无'}`,
        '',
      )
    })
  } else {
    lines.push('当前审查未形成单独的材料缺口事项。', '')
  }
  lines.push('## 附录：内部规则匹配明细', '', '以下内容用于复核和审计留痕，用户主结论以风险事项为准。', '')
  review.findings.filter((finding) => isRiskFinding(finding) || isInsufficientFinding(finding)).slice(0, 30).forEach((finding, index) => {
    lines.push(
      `### ${index + 1}. [${findingStatusText(finding)}][${finding.severity}] ${finding.ruleName}`,
      '',
      `- 分类：${finding.category}`,
      `- 问题：${finding.issue || '无'}`,
      `- 依据：${finding.evidence || '无'}`,
      `- 建议：${finding.suggestion || '无'}`,
      '',
    )
  })
  return lines.join('\n')
}
function downloadText(fileName: string, text: string, mimeType: string) {
  const blob = new Blob([text], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 500)
}

function splitMarkdownTableRow(line: string) {
  return line.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim())
}

function isMaterialScopeTable(headers: string[]) {
  return headers.join('|') === '序号|材料|解析情况|审查范围'
}

function renderReportTable(lines: string[], key: string) {
  const rows = lines
    .filter((line) => !/^\|\s*:?-{3,}/.test(line.trim()))
    .map(splitMarkdownTableRow)
    .filter((row) => row.some(Boolean))
  const [headers, ...bodyRows] = rows
  if (!headers) return null
  const materialScope = isMaterialScopeTable(headers)
  return <div key={key} className={materialScope ? 'super-agent-report-table-wrap is-material-scope' : 'super-agent-report-table-wrap'}>
    <table>
      {materialScope && <colgroup>
        <col className="col-index"/>
        <col className="col-material"/>
        <col className="col-parser"/>
        <col className="col-scope"/>
      </colgroup>}
      <thead><tr>{headers.map((cell, index) => <th key={`${key}-h-${index}`}>{cell}</th>)}</tr></thead>
      <tbody>{bodyRows.map((row, rowIndex) => <tr key={`${key}-r-${rowIndex}`}>{headers.map((_, cellIndex) => <td key={`${key}-c-${rowIndex}-${cellIndex}`}>{row[cellIndex] || ''}</td>)}</tr>)}</tbody>
    </table>
  </div>
}

function renderReportMarkdown(markdown: string) {
  const nodes: ReactNode[] = []
  let tableLines: string[] = []
  const flushTable = () => {
    if (!tableLines.length) return
    const table = renderReportTable(tableLines, `table-${nodes.length}`)
    if (table) nodes.push(table)
    tableLines = []
  }

  markdown.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim()
    if (!line) {
      flushTable()
      return
    }
    if (line.startsWith('|')) {
      tableLines.push(line)
      return
    }

    flushTable()
    if (line.startsWith('# ')) nodes.push(<h2 key={`h1-${index}`}>{line.replace(/^#\s+/, '')}</h2>)
    else if (line.startsWith('## ')) nodes.push(<h3 key={`h2-${index}`}>{line.replace(/^##\s+/, '')}</h3>)
    else if (line.startsWith('### ')) nodes.push(<h4 key={`h3-${index}`}>{line.replace(/^###\s+/, '')}</h4>)
    else if (line.startsWith('- ')) nodes.push(<p key={`li-${index}`} className="super-agent-report-list-item">{line.slice(2)}</p>)
    else nodes.push(<p key={`p-${index}`}>{line}</p>)
  })
  flushTable()
  return nodes
}
function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 500)
}
export function SuperAgentPage() {
  const [conversations, setConversations] = useState<Conversation[]>(loadStoredConversations)
  const [selectedConversationId, setSelectedConversationId] = useState<string>(loadStoredSelectedConversationId)
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState('')
  const [activeNav, setActiveNav] = useState<AgentNavId | ''>('new')
  const [activeDocuments, setActiveDocuments] = useState<SuperAgentDocument[]>([])
  const [activeReview, setActiveReview] = useState<SuperAgentReview | null>(null)
  const [activeReviewJob, setActiveReviewJob] = useState<SuperAgentReviewJob | null>(null)
  const [activeReport, setActiveReport] = useState<SuperAgentReport | null>(null)
  const [rules, setRules] = useState<SuperAgentRule[]>([])
  const [runtime, setRuntime] = useState<SuperAgentRuntime | null>(null)
  const [rulesLoading, setRulesLoading] = useState(false)
  const [rulesError, setRulesError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [generatingReport, setGeneratingReport] = useState(false)
  const messagesRef = useRef<HTMLElement | null>(null)
  const selectedConversationIdRef = useRef(selectedConversationId)

  useEffect(() => {
    let active = true
    setRulesLoading(true)
    Promise.all([superAgentApi.rules(), superAgentApi.runtime()])
      .then(([nextRules, nextRuntime]) => {
        if (!active) return
        setRules(nextRules)
        setRuntime(nextRuntime)
        setRulesError('')
      })
      .catch((error) => { if (active) setRulesError(errorMessage(error)) })
      .finally(() => { if (active) setRulesLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    persistConversations(conversations)
  }, [conversations])

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId
  }, [selectedConversationId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (selectedConversationId) window.localStorage.setItem(selectedConversationStorageKey, selectedConversationId)
    else window.localStorage.removeItem(selectedConversationStorageKey)
  }, [selectedConversationId])

  useEffect(() => {
    if (!selectedConversationId) return
    const conversation = conversations.find((item) => item.id === selectedConversationId)
    if (!conversation) {
      setSelectedConversationId('')
      return
    }
    setActiveDocuments(conversation.documents?.length ? conversation.documents : conversation.document ? [conversation.document] : [])
    setActiveReview(conversation.review || null)
    setActiveReviewJob(conversation.reviewJob || null)
    setActiveReport(conversation.report || null)
  }, [selectedConversationId])
  const selectedConversation = conversations.find((item) => item.id === selectedConversationId) || null
  const activeDocument = activeDocuments[0] || null
  const activeDocumentIds = activeDocuments.map((document) => document.id)
  const currentConversationLocked = isReviewJobRunning(activeReviewJob)
  const filteredConversations = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return conversations
    return conversations.filter((item) => item.title.toLowerCase().includes(keyword))
  }, [conversations, search])
  const panelVisible = Boolean(activeNav && activeNav !== 'new')
  const landingMode = !selectedConversation && !panelVisible

  const scrollMessagesBottom = (behavior: ScrollBehavior = 'smooth') => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const target = messagesRef.current
        if (!target) return
        target.scrollTo({ top: target.scrollHeight, behavior })
      })
    })
  }

  const lastMessage = selectedConversation?.messages[selectedConversation.messages.length - 1]

  useEffect(() => {
    if (landingMode) return
    scrollMessagesBottom('auto')
  }, [
    landingMode,
    selectedConversationId,
    selectedConversation?.messages.length,
    lastMessage?.id,
    lastMessage?.status,
    lastMessage?.content.length,
    activeDocumentIds.join(','),
    activeReview?.id,
    activeReport?.id,
    panelVisible,
  ])

  const appendMessages = (conversationId: string, title: string, messages: ChatMessage[], status: ConversationStatus = 'idle') => {
    setConversations((items) => {
      const existing = items.find((item) => item.id === conversationId)
      if (existing) return items.map((item) => item.id === conversationId ? { ...item, title: item.messages.length ? item.title : title, updatedAt: '刚刚', status, messages: [...item.messages, ...messages] } : item)
      return [{ id: conversationId, title, updatedAt: '刚刚', status, messages, document: activeDocument, documents: activeDocuments, review: activeReview, reviewJob: activeReviewJob, report: activeReport }, ...items]
    })
    selectedConversationIdRef.current = conversationId
    setSelectedConversationId(conversationId)
    setActiveNav('')
    scrollMessagesBottom()
  }

  const updateMessage = (conversationId: string, messageId: string, patch: Partial<ChatMessage>, status: ConversationStatus = 'idle') => {
    setConversations((items) => items.map((item) => item.id === conversationId ? { ...item, updatedAt: '刚刚', status, messages: item.messages.map((message) => message.id === messageId ? { ...message, ...patch } : message) } : item))
    scrollMessagesBottom()
  }

  const attachDocumentsToConversation = (conversationId: string, documents: SuperAgentDocument[]) => {
    setConversations((items) => items.map((item) => item.id === conversationId ? { ...item, document: documents[0] || null, documents, review: null, reviewJob: null, report: null } : item))
  }

  const attachReviewToConversation = (conversationId: string, review: SuperAgentReview) => {
    setConversations((items) => items.map((item) => item.id === conversationId ? { ...item, review, report: null } : item))
  }

  const attachReviewJobToConversation = (conversationId: string, reviewJob: SuperAgentReviewJob) => {
    setConversations((items) => items.map((item) => item.id === conversationId ? { ...item, reviewJob, review: reviewJob.review || item.review || null, report: reviewJob.review ? null : item.report || null } : item))
  }

  const attachReportToConversation = (conversationId: string, report: SuperAgentReport) => {
    setConversations((items) => items.map((item) => item.id === conversationId ? { ...item, report } : item))
  }

  const openNewChat = () => {
    selectedConversationIdRef.current = ''
    setSelectedConversationId('')
    setActiveNav('new')
    setDraft('')
    setActiveDocuments([])
    setActiveReview(null)
    setActiveReviewJob(null)
    setActiveReport(null)
  }

  const selectConversation = (id: string) => {
    const conversation = conversations.find((item) => item.id === id)
    selectedConversationIdRef.current = id
    setSelectedConversationId(id)
    setActiveNav('')
    setActiveDocuments(conversation?.documents?.length ? conversation.documents : conversation?.document ? [conversation.document] : [])
    setActiveReview(conversation?.review || null)
    setActiveReviewJob(conversation?.reviewJob || null)
    setActiveReport(conversation?.report || null)
    setConversations((items) => items.map((item) => item.id === id ? { ...item, status: item.status === 'unread' ? 'idle' : item.status } : item))
  }

  const deleteConversation = async (id: string) => {
    const target = conversations.find((item) => item.id === id)
    if (!target) return
    if (!window.confirm(`确定删除历史会话“${target.title}”吗？`)) return
    try {
      await superAgentApi.deleteConversation(id)
    } catch (error) {
      console.warn('删除服务端会话失败，已删除本地历史', error)
    }
    setConversations((items) => items.filter((item) => item.id !== id))
    if (selectedConversationId === id) {
      selectedConversationIdRef.current = ''
      setSelectedConversationId('')
      setActiveNav('new')
      setDraft('')
      setActiveDocuments([])
      setActiveReview(null)
      setActiveReviewJob(null)
      setActiveReport(null)
    }
  }

  const watchReviewJob = async (conversationId: string, messageId: string, initialJob: SuperAgentReviewJob, startedAt: number) => {
    let job = initialJob
    let pollErrors = 0
    const applyJob = (nextJob: SuperAgentReviewJob) => {
      job = nextJob
      attachReviewJobToConversation(conversationId, nextJob)
      if (selectedConversationIdRef.current === conversationId) {
        setActiveReviewJob(nextJob)
        if (nextJob.review) {
          setActiveReview(nextJob.review)
          setActiveReport(null)
        }
      }
    }

    applyJob(job)
    updateMessage(conversationId, messageId, { content: formatReviewJobProgress(job), status: 'thinking', elapsed: elapsedFrom(startedAt), kind: 'review' }, 'generating')

    while (!isReviewJobFinished(job)) {
      await wait(2500)
      try {
        applyJob(await superAgentApi.getReviewJob(job.id))
        pollErrors = 0
        updateMessage(conversationId, messageId, { content: formatReviewJobProgress(job), status: 'thinking', elapsed: elapsedFrom(startedAt), kind: 'review' }, 'generating')
      } catch (error) {
        pollErrors += 1
        if (pollErrors >= 3) throw error
      }
    }

    if ((job.status === 'completed' || job.status === 'partial') && job.review) {
      if (selectedConversationIdRef.current === conversationId) {
        setActiveReview(job.review)
        setActiveReviewJob(job)
        setActiveReport(null)
      }
      attachReviewToConversation(conversationId, job.review)
      updateMessage(conversationId, messageId, { content: formatReviewJobDone(job), status: 'done', elapsed: elapsedFrom(startedAt), kind: 'review' }, 'idle')
      return
    }

    updateMessage(conversationId, messageId, { content: job.errorMessage || '审查任务失败，当前文档解析结果已保留，请稍后重试。', status: 'error', elapsed: elapsedFrom(startedAt), kind: 'review' }, 'idle')
  }
  const sendAgentMessage = async (content: string) => {
    const text = content.trim()
    if (!text || currentConversationLocked) return

    const conversationId = selectedConversationId || nextId('conv')
    const existingMessages = selectedConversation?.messages || []
    const userMessage: ChatMessage = { id: nextId('msg'), role: 'user', content: text }
    const startedAt = performance.now()
    const guessedIntent = guessTurnIntent(text)
    const thinkingMessage: ChatMessage = { id: nextId('msg'), role: 'assistant', content: '', status: 'thinking', kind: guessedIntent }
    const shouldShowReviewing = guessedIntent === 'review' && activeDocuments.length > 0
    const shouldShowReport = guessedIntent === 'report' && Boolean(activeReview)

    appendMessages(conversationId, titleFromQuestion(text), [userMessage, thinkingMessage], 'generating')
    setDraft('')
    if (shouldShowReviewing) setReviewing(true)
    if (shouldShowReport) setGeneratingReport(true)


    if (shouldShowReviewing) {
      setActiveReview(null)
      setActiveReviewJob(null)
      setActiveReport(null)
      attachReviewJobToConversation(conversationId, {
        id: nextId('job'),
        status: 'queued',
        documentIds: activeDocumentIds,
        documentName: activeDocuments.length > 1 ? `${activeDocuments[0]?.fileName || '材料'} 等 ${activeDocuments.length} 篇材料` : activeDocument?.fileName || '当前材料',
        ruleCount: runtime?.rules || rules.length || 0,
        totalBatches: 0,
        completedBatches: 0,
        failedBatches: 0,
        processedBatches: 0,
        findingsCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        progress: 0,
        createdAt: new Date().toLocaleString('zh-CN', { hour12: false }).replaceAll('/', '-'),
      })
      try {
        const job = await superAgentApi.createReviewJob({
          message: text,
          conversationId,
          documentId: activeDocument?.id,
          documentIds: activeDocumentIds,
          reviewId: activeReview?.id,
          reportId: activeReport?.id,
          messages: conversationHistoryPayload(existingMessages),
        })
        await watchReviewJob(conversationId, thinkingMessage.id, job, startedAt)
      } catch (error) {
        updateMessage(conversationId, thinkingMessage.id, { content: errorMessage(error), status: 'error', elapsed: elapsedFrom(startedAt), kind: guessedIntent }, 'idle')
      } finally {
        setReviewing(false)
      }
      return
    }
    try {
      const result = await superAgentApi.turn({
        message: text,
        conversationId,
        documentId: activeDocument?.id,
        documentIds: activeDocumentIds,
        reviewId: activeReview?.id,
        reportId: activeReport?.id,
        messages: conversationHistoryPayload(existingMessages),
      })
      if (result.review) {
        setActiveReview(result.review)
        setActiveReport(null)
        attachReviewToConversation(conversationId, result.review)
      }
      if (result.report) {
        setActiveReport(result.report)
        attachReportToConversation(conversationId, result.report)
      }
      updateMessage(conversationId, thinkingMessage.id, { content: result.answer, status: 'done', elapsed: elapsedFrom(startedAt), kind: result.type })
    } catch (error) {
      updateMessage(conversationId, thinkingMessage.id, { content: errorMessage(error), status: 'error', elapsed: elapsedFrom(startedAt), kind: guessedIntent })
    } finally {
      if (shouldShowReviewing) setReviewing(false)
      if (shouldShowReport) setGeneratingReport(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (currentConversationLocked) return
    void sendAgentMessage(draft)
  }

  const uploadDocuments = async (files: File[]) => {
    if (!files.length || currentConversationLocked) return
    const conversationId = selectedConversationId || nextId('conv')
    const thinkingMessage: ChatMessage = { id: nextId('msg'), role: 'assistant', content: '', status: 'thinking', kind: 'document' }
    const startedAt = performance.now()
    const startsNewMaterialPackage = Boolean(activeReview || activeReviewJob || activeReport)
    const currentDocuments = startsNewMaterialPackage ? [] : activeDocuments
    setUploading(true)
    setActiveReview(null)
    setActiveReviewJob(null)
    setActiveReport(null)
    appendMessages(conversationId, titleFromQuestion(files.length > 1 ? `${files.length}篇材料上传` : files[0].name), [thinkingMessage], 'generating')
    try {
      const uploaded = await Promise.all(files.map((file) => superAgentApi.uploadDocument(file)))
      const nextDocuments = [...currentDocuments, ...uploaded].filter((document, index, items) => items.findIndex((item) => item.id === document.id) === index)
      setActiveDocuments(nextDocuments)
      attachDocumentsToConversation(conversationId, nextDocuments)
      const totalCharacters = nextDocuments.reduce((sum, document) => sum + document.characters, 0)
      const uploadedList = uploaded.map((document, index) => `${index + 1}. ${document.fileName}（${document.characters} 字）`).join('\n')
      updateMessage(conversationId, thinkingMessage.id, {
        status: 'done',
        elapsed: elapsedFrom(startedAt),
        content: `文档解析完成：本次新增 ${uploaded.length} 篇，当前共 ${nextDocuments.length} 篇材料，合计正文 ${totalCharacters} 字。\n${uploadedList}\n你可以继续提问、总结、抽取信息；需要审查时直接说明审查要求。`,
      })
    } catch (error) {
      updateMessage(conversationId, thinkingMessage.id, { status: 'error', elapsed: elapsedFrom(startedAt), content: errorMessage(error) })
    } finally {
      setUploading(false)
    }
  }

  const onFilesSelected = (files: FileList | null) => {
    if (currentConversationLocked) return
    const selectedFiles = Array.from(files || [])
    if (!selectedFiles.length) return
    void uploadDocuments(selectedFiles)
  }

  const exportReview = (format: 'markdown' | 'json') => {
    if (!activeReview) return
    const base = safeFileBase(activeReview.documentName)
    if (format === 'json') {
      downloadText(`${base}-检测报告.json`, JSON.stringify(activeReview, null, 2), 'application/json;charset=utf-8')
      return
    }
    downloadText(`${base}-检测报告.md`, buildReportMarkdown(activeReview), 'text/markdown;charset=utf-8')
  }

  const exportReport = () => {
    if (!activeReport) return
    const base = safeFileBase(activeReport.title || activeReport.documentName)
    downloadText(`${base}.md`, activeReport.markdown, 'text/markdown;charset=utf-8')
  }


  const exportReportWord = async () => {
    if (!activeReport) return
    try {
      const base = safeFileBase(activeReport.title || activeReport.documentName)
      const blob = await superAgentApi.downloadReportDocx(activeReport.id)
      downloadBlob(`${base}.docx`, blob)
    } catch (error) {
      window.alert(errorMessage(error))
    }
  }
  const generateReport = () => {
    if (!activeReview || generatingReport) return
    void sendAgentMessage('请基于当前审查结果生成正式检测报告。')
  }

  const requestRectificationList = () => {
    if (!activeReview) return
    void sendAgentMessage('请基于当前检测报告，按优先级生成整改清单，包含问题、整改动作、责任建议、完成时限和验收标准。')
  }

  const pageTitle = selectedConversation?.title || navItems.find((item) => item.id === activeNav)?.label || '新对话'
  const activeMessages = selectedConversation?.messages || []
  const documentPanelMessageId = lastMessageId(activeMessages, isDocumentContextMessage)
  const reportPanelMessageId = lastMessageId(activeMessages, isReportContextMessage)

  return <main className="super-agent-workspace" data-mode={landingMode ? 'home' : 'chat'}>
    <aside className="super-agent-sidebar" aria-label="超级智能体导航">
      <div className="super-agent-brand-row">
        <div className="super-agent-brand">
          <span className="super-agent-brand-mark" aria-hidden="true"><img src={mascot} alt=""/></span>
          <span>超级智能体</span>
        </div>
        <button className="super-agent-icon-button" type="button" aria-label="收起侧栏"><AgentIcon name="menu"/></button>
      </div>

      <div className="super-agent-search-wrap">
        <label className="super-agent-search-box">
          <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="搜索会话名称" aria-label="搜索会话名称"/>
          <AgentIcon name="search"/>
        </label>
      </div>

      <nav className="super-agent-nav" aria-label="主菜单">
        {navItems.map((item) => <button key={item.id} className={`super-agent-nav-item ${activeNav === item.id ? 'is-active' : ''}`} type="button" onClick={() => item.id === 'new' ? openNewChat() : setActiveNav(item.id)}>
          <span className="super-agent-nav-icon"><AgentIcon name={item.icon}/></span>
          <span className="super-agent-nav-label">{item.label}</span>
        </button>)}
      </nav>

      <section className="super-agent-history" aria-label="历史会话">
        <div className="super-agent-history-title">历史会话</div>
        {filteredConversations.length ? filteredConversations.map((item) => <div key={item.id} className={`super-agent-history-row ${selectedConversationId === item.id ? 'is-active' : ''}`}>
          <button className="super-agent-history-main" type="button" onClick={() => selectConversation(item.id)}>
            <span className="super-agent-history-name">{item.title}</span>
            <span className="super-agent-history-meta">{item.updatedAt}</span>
            {item.status === 'unread' && <span className="super-agent-unread-dot" aria-label="有未读更新"/>}
            {item.status === 'generating' && <span className="super-agent-generating-mark" aria-label="生成中"/>}
          </button>
          <button className="super-agent-history-delete" type="button" aria-label={`删除会话 ${item.title}`} title="删除会话" onClick={(event) => { event.stopPropagation(); void deleteConversation(item.id) }}><AgentIcon name="trash"/></button>
        </div>) : <div className="super-agent-history-empty">暂无会话</div>}
      </section>
    </aside>

    <section className="super-agent-main">
      <header className="super-agent-topbar">
        <div className="super-agent-page-title">{pageTitle}</div>
        <button className="super-agent-info-button" type="button" aria-label="查看说明"><AgentIcon name="info"/></button>
      </header>

      <div className="super-agent-chat-wrap">
        <div className="super-agent-chat-column">
          <section ref={messagesRef} className="super-agent-messages" aria-label="会话内容">
            {landingMode && <HomeHero onPickSuggestion={(value) => setDraft(value)}/>}
            {panelVisible && <AgentFeaturePanel type={activeNav as Exclude<AgentNavId, 'new'>} rules={rules} runtime={runtime} rulesLoading={rulesLoading} rulesError={rulesError} documents={activeDocuments} review={activeReview} report={activeReport}/>}
            {!landingMode && activeMessages.map((message) => <Fragment key={message.id}>
              <MessageView message={message}/>
              {message.id === documentPanelMessageId && !activeReport && <ReviewPanel documents={activeDocuments} review={activeReview} reviewJob={activeReviewJob} report={activeReport} uploading={uploading} generatingReport={generatingReport} onGenerateReport={generateReport} onExportReview={exportReview} onExportReport={exportReport} onExportReportWord={exportReportWord} onAskRectification={requestRectificationList}/>}
              {message.id === reportPanelMessageId && activeReport && <ReportPanel report={activeReport} onExportReport={exportReport} onExportReportWord={exportReportWord}/>}
            </Fragment>)}
            {!landingMode && activeDocuments.length > 0 && !activeReport && !documentPanelMessageId && <ReviewPanel documents={activeDocuments} review={activeReview} reviewJob={activeReviewJob} report={activeReport} uploading={uploading} generatingReport={generatingReport} onGenerateReport={generateReport} onExportReview={exportReview} onExportReport={exportReport} onExportReportWord={exportReportWord} onAskRectification={requestRectificationList}/>}
            {!landingMode && activeReport && !reportPanelMessageId && <ReportPanel report={activeReport} onExportReport={exportReport} onExportReportWord={exportReportWord}/>}
          </section>

          <div className="super-agent-bottom-zone">
            {!landingMode && <button className="super-agent-back-bottom" type="button" onClick={() => messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' })}>
              <AgentIcon name="down"/>
              回到底部
            </button>}
            <form className={`super-agent-composer ${currentConversationLocked ? 'is-locked' : ''}`} onSubmit={submit}>
              <textarea value={draft} disabled={currentConversationLocked} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
                if (!currentConversationLocked && event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  void sendAgentMessage(draft)
                }
              }} placeholder={currentConversationLocked ? '审查任务执行中，完成后可继续提问' : '上传文档或直接提问'} aria-label="输入问题"/>
              <div className="super-agent-composer-bottom">
                {currentConversationLocked && <div className="super-agent-composer-lock">审查任务执行中，当前会话暂不可输入。可新建对话或切换其他会话。</div>}
                <div className="super-agent-composer-actions">
                  <label className={`super-agent-icon-button super-agent-file-button ${currentConversationLocked ? 'is-disabled' : ''}`} aria-label="上传附件" aria-disabled={currentConversationLocked}>
                    <AgentIcon name="attach"/>
                    <input className="super-agent-hidden-input" type="file" multiple disabled={currentConversationLocked} accept=".txt,.md,.markdown,.docx,.pdf" aria-label="上传附件" onChange={(event) => { onFilesSelected(event.currentTarget.files); event.currentTarget.value = '' }}/>
                  </label>
                  <button className="super-agent-icon-button" type="button" aria-label="语音输入" disabled={currentConversationLocked}><AgentIcon name="voice"/></button>
                  <span className="super-agent-divider" aria-hidden="true"/>
                  <button className="super-agent-send" type="submit" aria-label="发送" disabled={!draft.trim() || currentConversationLocked}><AgentIcon name="send"/></button>
                </div>
              </div>
            </form>
            <div className="super-agent-disclaimer">内容由真实模型生成，仅供审查辅助</div>
          </div>
        </div>
      </div>
    </section>
  </main>
}

function HomeHero({ onPickSuggestion }: { onPickSuggestion: (value: string) => void }) {
  return <div className="super-agent-home-hero">
    <div className="super-agent-home-mascot" aria-hidden="true"><img src={mascot} alt=""/></div>
    <h1 className="super-agent-home-title">我们今天要做些什么，尹晨阳？</h1>
    <div className="super-agent-suggestion-row">
      {starterSuggestions.map((item) => <button key={item} className="super-agent-suggestion-chip" type="button" onClick={() => onPickSuggestion(item)}>{item}</button>)}
    </div>
  </div>
}

function AgentFeaturePanel({ type, rules, runtime, rulesLoading, rulesError, documents, review, report }: { type: Exclude<AgentNavId, 'new'>; rules: SuperAgentRule[]; runtime: SuperAgentRuntime | null; rulesLoading: boolean; rulesError: string; documents: SuperAgentDocument[]; review: SuperAgentReview | null; report: SuperAgentReport | null }) {
  const documentCount = documents.length
  const primaryDocument = documents[0] || null
  const totalCharacters = documents.reduce((sum, document) => sum + document.characters, 0)
  const parserText = [...new Set(documents.map((document) => document.parser))].join(' / ')
  const documentLabel = documentCount ? documentCount === 1 ? primaryDocument?.fileName || '1 篇材料' : `${documentCount} 篇材料` : '未绑定'

  if (type === 'knowledge') return <article className="super-agent-feature-panel">
    <header><div><span>规则库</span><strong>内置文档审查规则</strong></div><small>{runtime?.rules || rules.length || 0} 条</small></header>
    {rulesError && <div className="super-agent-panel-error">{rulesError}</div>}
    {rulesLoading && !rules.length ? <div className="super-agent-panel-empty">规则加载中...</div> : <div className="super-agent-rule-list">
      {rules.map((rule) => <section key={rule.id} className={`super-agent-rule-item severity-${rule.severity}`}>
        <header><span>{rule.severity}</span><strong>{rule.name}</strong><em>{rule.category}</em></header>
        <p>{rule.description}</p>
        <small>{rule.id}</small>
      </section>)}
    </div>}
  </article>

  if (type === 'automation') return <article className="super-agent-feature-panel">
    <header><div><span>任务</span><strong>当前会话状态</strong></div><small>{report ? '报告已生成' : review ? '已完成审查' : documentCount ? '文档已绑定' : '待上传'}</small></header>
    <div className="super-agent-task-list">
      <StatusRow label="文档" value={documentLabel} state={documentCount ? 'ready' : 'empty'}/>
      <StatusRow label="解析" value={documentCount ? `${totalCharacters} 字 / ${parserText}` : '待处理'} state={documentCount ? 'ready' : 'empty'}/>
      <StatusRow label="审查" value={review ? `${review.score} 分 / ${review.conclusion}` : documentCount ? '待触发' : '待上传'} state={review ? 'ready' : 'empty'}/>
      <StatusRow label="报告" value={report ? `${report.riskLevel} / ${report.createdAt}` : '未生成'} state={report ? 'ready' : 'empty'}/>
    </div>
  </article>

  const rows = type === 'agents'
    ? [
      ['模型问答', runtime?.model || '服务端配置'],
      ['文档上下文', documentLabel],
      ['审查上下文', review ? `${review.score} 分` : '未生成'],
      ['正式报告', report ? '已生成' : '未生成'],
    ]
    : [
      ['文档解析', 'txt / md / docx / pdf'],
      ['风险识别', `主体 / 资金 / 物流 / 发票${runtime?.reviewPrecheckIssueLimit ? ` · 预审线索${runtime.reviewPrecheckIssueLimit}条` : ''}`],
      ['报告生成', report ? 'Markdown 已生成' : '待审查后生成'],
    ]

  return <article className="super-agent-feature-panel">
    <header><div><span>{type === 'agents' ? '智能体' : '技能'}</span><strong>{type === 'agents' ? '当前运行能力' : '审查工具链'}</strong></div><small>{runtime?.model || '服务端配置'}</small></header>
    <div className="super-agent-capability-grid">
      {rows.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
    </div>
  </article>
}

function StatusRow({ label, value, state }: { label: string; value: string; state: 'ready' | 'empty' }) {
  return <div className={`super-agent-status-row is-${state}`}><span>{label}</span><strong>{value}</strong></div>
}

function MessageView({ message }: { message: ChatMessage }) {
  if (message.role === 'user') return <div className="super-agent-message super-agent-message-user"><div className="super-agent-user-bubble">{message.content}</div></div>
  const thinking = message.status === 'thinking'
  const failed = message.status === 'error'
  return <div className={`super-agent-message super-agent-assistant-block ${failed ? 'is-error' : ''}`}>
    <div className="super-agent-think-row">
      <AgentIcon name="think"/>
      <span>{thinking ? (message.kind === 'review' ? '并行审查中...' : message.kind === 'report' ? '报告生成中...' : '思考中...') : failed ? `处理失败，用时${message.elapsed || ''}` : `思考完成，用时${message.elapsed || ''}`}</span>
    </div>
    {thinking ? <>
      <div className="super-agent-thinking-line"><i/><i/><i/></div>
      {message.content && <div className="super-agent-answer is-progress"><p>{message.content}</p></div>}
    </> : <div className="super-agent-answer"><p>{message.content}</p></div>}
  </div>
}

function ReviewPanel({ documents, review, reviewJob, report, uploading, generatingReport, onGenerateReport, onExportReview, onExportReport, onExportReportWord, onAskRectification }: { documents: SuperAgentDocument[]; review: SuperAgentReview | null; reviewJob: SuperAgentReviewJob | null; report: SuperAgentReport | null; uploading: boolean; generatingReport: boolean; onGenerateReport: () => void; onExportReview: (format: 'markdown' | 'json') => void; onExportReport: () => void; onExportReportWord: () => void; onAskRectification: () => void }) {
  if (!documents.length) return null
  const riskItems = fallbackRiskItems(review)
  const stats = riskItemStats(riskItems)
  const topRiskItems = stats.risks.length ? stats.risks.slice(0, 8) : stats.gaps.length ? stats.gaps.slice(0, 6) : []
  const totalSize = documents.reduce((sum, document) => sum + document.size, 0)
  const totalCharacters = documents.reduce((sum, document) => sum + document.characters, 0)
  const primaryDocument = documents[0]
  const materialTitle = documents.length === 1 ? primaryDocument.fileName : `${primaryDocument.fileName} 等 ${documents.length} 篇材料`
  const uploadedAt = documents.map((document) => document.uploadedAt).filter(Boolean).slice(-1)[0] || primaryDocument.uploadedAt

  return <article className="super-agent-review-card">
    <header className="super-agent-review-head">
      <div>
        <span>当前材料包</span>
        <strong>{materialTitle}</strong>
        <small>{formatSize(totalSize)} · 共 {totalCharacters} 字 · {uploadedAt}</small>
      </div>
      {review && <div className="super-agent-review-actions">
        <button type="button" onClick={onGenerateReport} disabled={uploading || generatingReport}>{generatingReport ? '生成中' : report ? '重新生成报告' : '生成报告'}</button>
        <button className="is-secondary" type="button" onClick={onAskRectification}>整改清单</button>
        <button className="is-secondary" type="button" onClick={() => onExportReview('markdown')}><AgentIcon name="download"/>审查MD</button>
        <button className="is-secondary" type="button" onClick={() => onExportReview('json')}><AgentIcon name="download"/>JSON</button>
        {report && <button className="is-secondary" type="button" onClick={onExportReport}><AgentIcon name="download"/>报告MD</button>}
        {report && <button className="is-secondary" type="button" onClick={onExportReportWord}><AgentIcon name="download"/>报告Word</button>}
      </div>}
    </header>
    <div className="super-agent-document-list">
      {documents.map((document, index) => <section key={document.id} className="super-agent-document-item">
        <header><span>材料{index + 1}</span><strong>{document.fileName}</strong><em>{document.parser}</em></header>
        <small>{formatSize(document.size)} · 正文 {document.characters} 字</small>
        {!review && <p>{document.preview}</p>}
      </section>)}
    </div>
    {reviewJob && !review && <div className="super-agent-review-job">
      <div className="super-agent-review-job-head"><span>{formatReviewJobStatus(reviewJob)}</span><strong>{reviewJob.progress || 0}%</strong></div>
      <div className="super-agent-review-job-track"><i style={{ width: `${Math.max(3, reviewJob.progress || 0)}%` }}/></div>
      <div className="super-agent-review-job-meta">
        <span>进度 {reviewJob.progress || 0}%</span>
        <span>风险线索 高 {reviewJob.highCount || 0} / 中 {reviewJob.mediumCount || 0} / 低 {reviewJob.lowCount || 0}；待补充材料 {reviewJob.insufficientCount || 0}</span>
        {Boolean(reviewJob.failedBatches) && <span>部分结果待补齐</span>}
      </div>
    </div>}
    {reviewJob && review && !isReviewJobFinished(reviewJob) && <div className="super-agent-review-job is-partial">初步风险清单已生成，规则依据和报告附录正在后台补充中：{reviewJob.progress || 0}%</div>}
    {reviewJob && review && reviewJob.status === 'partial' && <div className="super-agent-review-job is-partial">部分结果未形成可靠结论，已先展示成功审查结果。</div>}
    {review && <>
      <div className="super-agent-report-summary">
        <div><span>综合评分</span><strong>{review.score}</strong></div>
        <div><span>风险事项</span><strong>{stats.risks.length}</strong></div>
        <div><span>高风险</span><strong>{stats.high}</strong></div>
        <div><span>待核验</span><strong>{stats.gaps.length}</strong></div>
      </div>
      <div className="super-agent-report-conclusion"><strong>{review.conclusion}</strong><p>{review.summary}</p><small>{review.model} · {review.createdAt}</small></div>
      <div className="super-agent-finding-list">
        {topRiskItems.length ? topRiskItems.map((item) => <RiskItemCard key={item.id} item={item}/>) : <div className="super-agent-finding-empty">未识别出明确风险事项</div>}
      </div>
    </>}
  </article>
}
function ReportPanel({ report, onExportReport, onExportReportWord }: { report: SuperAgentReport; onExportReport: () => void; onExportReportWord: () => void }) {
  const riskCount = report.riskStats.riskItemCount ?? report.riskStats.failedCount ?? 0
  const materialGapCount = report.riskStats.materialGapCount ?? report.riskStats.insufficientCount ?? 0
  return <article className="super-agent-formal-report-card">
    <header className="super-agent-formal-report-head">
      <div>
        <span>正式检测报告</span>
        <strong>{report.title}</strong>
        <small>{report.id} · {report.createdAt}</small>
      </div>
      <div className="super-agent-formal-report-actions"><button type="button" onClick={onExportReport}><AgentIcon name="download"/>导出MD</button><button type="button" onClick={onExportReportWord}><AgentIcon name="download"/>导出Word</button></div>
    </header>
    <div className="super-agent-formal-report-stats">
      <div><span>风险等级</span><strong>{report.riskLevel}</strong></div>
      <div><span>综合评分</span><strong>{report.riskStats.score}</strong></div>
      <div><span>风险事项</span><strong>{riskCount}</strong></div>
      <div><span>待核验</span><strong>{materialGapCount}</strong></div>
    </div>
    <div className="super-agent-formal-report-body">
      <div className="super-agent-report-abstract">
        <strong>{report.conclusion}</strong>
        <p>{report.summary || '无'}</p>
      </div>
      <section className="super-agent-markdown-report" aria-label="正式报告正文">
        {renderReportMarkdown(report.markdown)}
      </section>
    </div>
  </article>
}
function RiskItemCard({ item }: { item: ReviewRiskItem }) {
  return <section className={`super-agent-finding severity-${item.severity} ${item.type === 'material_gap' ? 'is-gap' : ''}`}>
    <header><span>{item.severity}</span><strong>{item.title}</strong><em>{item.statusText || (item.type === 'material_gap' ? '需补充材料' : `${item.severity}风险`)}</em></header>
    {item.summary && <p>{item.summary}</p>}
    {item.evidence && <blockquote>{item.evidence}</blockquote>}
    {item.suggestion && <small>{item.suggestion}</small>}
  </section>
}

function FindingItem({ finding }: { finding: ReviewFinding }) {
  return <section className={`super-agent-finding severity-${finding.severity}`}>
    <header><span>{finding.severity}</span><strong>{finding.ruleName}</strong><em>{findingStatusText(finding)}</em></header>
    {finding.issue && <p>{finding.issue}</p>}
    {finding.evidence && <blockquote>{finding.evidence}</blockquote>}
    {finding.suggestion && <small>{finding.suggestion}</small>}
  </section>
}
function AgentIcon({ name }: { name: AgentIconName }) {
  const paths: Record<AgentIconName, ReactNode> = {
    new: <><path d="M12 5v4l3-3"/><path d="M20 12a8 8 0 0 1-14.6 4.5M4 12A8 8 0 0 1 18.6 7.5"/></>,
    agents: <><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/></>,
    skills: <><path d="M7 4h10a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M7 18h12M8 8h7M8 12h6"/></>,
    knowledge: <><path d="M9 7h6M7 12h10M9 17h6"/><path d="M5 3h14v18H5z"/></>,
    automation: <><path d="M12 6v6l4 2"/><path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"/></>,
    search: <><path d="m21 21-4.35-4.35"/><path d="M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z"/></>,
    info: <><path d="M12 17v-6M12 8h.01"/><path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"/></>,
    think: <><path d="M9 4 4 9l5 5 5-5-5-5Z"/><path d="m15 10 5 5-5 5-5-5 5-5Z"/></>,
    attach: <path d="m21.4 11.2-8.8 8.8a5 5 0 0 1-7.1-7.1l9.4-9.4a3.2 3.2 0 0 1 4.5 4.5l-9.5 9.5a1.4 1.4 0 0 1-2-2l8.6-8.6"/>,
    voice: <><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z"/><path d="M19 11a7 7 0 0 1-14 0M12 18v4M8 22h8"/></>,
    send: <><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></>,
    down: <><path d="M12 5v14"/><path d="m7 14 5 5 5-5"/></>,
    menu: <path d="M4 7h16M4 12h12M4 17h16"/>,
    download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>,
    trash: <><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 14h10l1-14"/><path d="M9 7V4h6v3"/></>,
  }
  return <svg className="super-agent-svg" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}















