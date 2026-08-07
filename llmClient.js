const DEFAULT_OPENAI_BASE_URL = 'https://ark.cn-beijing.volces.com/api/plan/v3'
const DEFAULT_ANTHROPIC_BASE_URL = 'https://ark.cn-beijing.volces.com/api/plan'
const DEFAULT_MODEL = 'ark-code-latest'

function normalizeBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '')
}

function llmConfig() {
  const protocol = String(process.env.SUPER_AGENT_API_MODE || (process.env.ANTHROPIC_BASE_URL ? 'anthropic' : 'responses')).toLowerCase()
  const model = process.env.SUPER_AGENT_MODEL || process.env.ARK_MODEL || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL
  const apiKey = protocol === 'anthropic'
    ? process.env.ANTHROPIC_API_KEY || process.env.SUPER_AGENT_API_KEY || process.env.ARK_API_KEY || ''
    : process.env.SUPER_AGENT_API_KEY || process.env.ARK_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || ''
  const baseUrl = protocol === 'anthropic'
    ? normalizeBaseUrl(process.env.ANTHROPIC_BASE_URL || DEFAULT_ANTHROPIC_BASE_URL)
    : normalizeBaseUrl(process.env.SUPER_AGENT_API_BASE || process.env.ARK_BASE_URL || process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL)
  return { apiKey, baseUrl, model, protocol }
}

export function getSuperAgentModelName() {
  return llmConfig().model
}

function responseInputFromMessages(messages) {
  return messages.map((message) => ({
    role: message.role === 'assistant' ? 'assistant' : message.role === 'system' ? 'system' : 'user',
    content: String(message.content || ''),
  }))
}

function anthropicPayloadFromMessages(messages, model, temperature, maxTokens) {
  const system = messages.filter((message) => message.role === 'system').map((message) => String(message.content || '').trim()).filter(Boolean).join('\n\n')
  const dialogue = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({ role: message.role === 'assistant' ? 'assistant' : 'user', content: String(message.content || '') }))
    .filter((message) => message.content.trim())
  return {
    model,
    max_tokens: maxTokens,
    temperature,
    stream: false,
    ...(system ? { system } : {}),
    messages: dialogue.length ? dialogue : [{ role: 'user', content: '' }],
  }
}

function extractResponseText(data) {
  if (data?.output_text) return String(data.output_text)
  if (data?.choices?.[0]?.message?.content) return String(data.choices[0].message.content)
  if (data?.choices?.[0]?.text) return String(data.choices[0].text)
  const parts = []
  for (const item of data?.output || []) {
    if (item?.text) parts.push(item.text)
    if (typeof item?.content === 'string') parts.push(item.content)
    for (const content of item?.content || []) {
      if (typeof content === 'string') parts.push(content)
      else if (content?.text) parts.push(content.text)
      else if (content?.type === 'output_text' && content?.text) parts.push(content.text)
    }
  }
  return parts.join('\n')
}

function extractAnthropicText(data) {
  if (typeof data?.completion === 'string') return data.completion
  if (typeof data?.content === 'string') return data.content
  const parts = []
  for (const content of data?.content || []) {
    if (typeof content === 'string') parts.push(content)
    else if (content?.type === 'text' && content?.text) parts.push(content.text)
    else if (content?.type === 'output_text' && content?.text) parts.push(content.text)
    else if (content?.text && content?.type !== 'thinking') parts.push(content.text)
  }
  return parts.join('\n')
}

async function postJson(url, headers, body, signal) {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  })
  const text = await response.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch {}
  if (!response.ok) {
    const message = data?.error?.message || data?.message || text.slice(0, 500) || response.statusText
    throw Object.assign(new Error(message), { status: response.status, data })
  }
  if (!data) throw Object.assign(new Error('模型接口返回不是合法 JSON'), { status: 502 })
  return data
}

function openAiHeaders(apiKey) {
  return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
}

function anthropicHeaders(apiKey) {
  return { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }
}

async function callChatCompletions(config, messages, temperature, maxTokens, signal) {
  const data = await postJson(`${config.baseUrl}/chat/completions`, openAiHeaders(config.apiKey), {
    model: config.model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: false,
  }, signal)
  const content = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || extractResponseText(data)
  return { content: String(content), usage: data?.usage || null }
}

async function callResponses(config, messages, temperature, maxTokens, signal) {
  const data = await postJson(`${config.baseUrl}/responses`, openAiHeaders(config.apiKey), {
    model: config.model,
    input: responseInputFromMessages(messages),
    temperature,
    max_output_tokens: maxTokens,
    stream: false,
  }, signal)
  return { content: extractResponseText(data), usage: data?.usage || null }
}

async function callAnthropicMessages(config, messages, temperature, maxTokens, signal) {
  const body = anthropicPayloadFromMessages(messages, config.model, temperature, maxTokens)
  const data = await postJson(`${config.baseUrl}/v1/messages`, anthropicHeaders(config.apiKey), body, signal)
  return { content: extractAnthropicText(data), usage: data?.usage || null }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function emptyContentError() {
  return Object.assign(new Error('模型接口未返回有效内容'), { status: 502, retryable: true })
}

function isEmptyContentError(error) {
  return /模型接口未返回有效内容|empty content|no content/i.test(String(error?.message || ''))
}

function shouldTryFallback(error) {
  return error?.status === 404 || error?.status === 405 || isEmptyContentError(error) || /not found|unknown request url/i.test(String(error?.message || ''))
}

function shouldRetryModelCall(error) {
  const status = Number(error?.status) || 0
  return Boolean(error?.retryable) || status === 429 || status === 502 || status === 503 || status === 504 || /rate|limit|busy|overload|timeout|超时|未返回有效内容/i.test(String(error?.message || ''))
}
export async function callSuperAgentModel({ messages, temperature = 0.2, maxTokens = 3000 }) {
  const config = llmConfig()
  if (!config.apiKey) {
    throw Object.assign(new Error('超级智能体模型 API Key 未配置，请在 .env.local 中配置 ANTHROPIC_API_KEY、SUPER_AGENT_API_KEY 或 ARK_API_KEY'), { status: 500 })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Number(process.env.SUPER_AGENT_TIMEOUT_MS || 180000))
  const retryCount = Math.max(0, Math.min(3, Math.floor(Number(process.env.SUPER_AGENT_MODEL_RETRIES) || 1)))
  const attempts = config.protocol === 'anthropic'
    ? [callAnthropicMessages]
    : (process.env.SUPER_AGENT_API_MODE === 'responses' || /\/api\/plan\/v3$/i.test(config.baseUrl)) ? [callResponses, callChatCompletions] : [callChatCompletions, callResponses]
  let lastError
  try {
    for (const attempt of attempts) {
      for (let retryIndex = 0; retryIndex <= retryCount; retryIndex += 1) {
        try {
          const result = await attempt(config, messages, temperature, maxTokens, controller.signal)
          if (!String(result.content || '').trim()) throw emptyContentError()
          return { content: String(result.content), model: config.model, usage: result.usage }
        } catch (error) {
          lastError = error
          if (error?.name === 'AbortError') throw error
          if (shouldRetryModelCall(error) && retryIndex < retryCount) {
            await sleep(700 * (retryIndex + 1))
            continue
          }
          break
        }
      }
      if (!shouldTryFallback(lastError)) throw lastError
    }
    throw lastError
  } catch (error) {
    if (error?.name === 'AbortError') throw Object.assign(new Error('模型接口调用超时'), { status: 504 })
    throw Object.assign(new Error(`模型接口调用失败：${error?.message || '服务处理失败'}`), { status: Number(error?.status) || 502 })
  } finally {
    clearTimeout(timeout)
  }
}