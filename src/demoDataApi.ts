import type { Warning } from './types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.message || `请求失败（${response.status}）`)
  return payload as T
}

export interface DemoWarning extends Warning {
  caseId: string
  rawStatus: string
  sceneCode: string
  sceneVersionId: string
  targetId: string
  riskScore: number
  hitRuleCount: number
  evidenceCount: number
  graphVersion: string
  traceId: string
  databaseBacked: true
}

export interface DemoEvidence {
  id: string
  warningId: string
  caseId: string
  type: string
  sourceSystem: string
  sourceRecord: string
  fieldOrRelation: string
  value: string
  collectedAt: string
  validity: string
  hash: string
  description: string
}

export interface DemoRun {
  id: string
  ruleVersionId: string
  ruleCode: string
  ruleName: string
  objectId: string
  objectName: string
  outcome: string
  executedAt: string
  actualValueSummary: string
  riskLevel: string
  evidenceStatus: string
}

export interface DemoOntologyElement {
  type: 'class' | 'property' | 'relation'
  code: string
  name: string
  ownerCode: string
  targetCode: string
  dataType: string
  constraint: string
  description: string
}

export interface DemoOntologySnapshot {
  id: string
  name: string
  version: string
  elements: DemoOntologyElement[]
}

export interface DemoGraphNode {
  id: string
  classCode: string
  name: string
  caseId: string
  organizationId: string | null
  sourceSystem: string
  sourceRecord: string
  status: string
  properties: Record<string, unknown>
}

export interface DemoGraphRelation {
  id: string
  relationCode: string
  fromId: string
  toId: string
  evidenceId: string | null
  confidence: number
  sourceSystem: string
  properties: Record<string, unknown>
}

export interface DemoGraphEvent {
  id: string
  eventCode: string
  name: string
  objectId: string
  actorId: string | null
  organizationId: string | null
  eventTime: string
  amount: number | null
  status: string
  sourceSystem: string
  properties: Record<string, unknown>
}

export interface DemoTradeRecord {
  businessId: string
  caseId: string
  businessType: string
  internalOrgId: string
  counterpartyId: string
  itemName: string
  specification: string
  quantity: number
  unitPrice: number
  amount: number
  direction: string
  businessTime: string
  sourceAccountId: string | null
  targetAccountId: string | null
  modeCodes: string
  evidenceConclusion: string
}

export interface DemoWarningDetail {
  ontology: DemoOntologySnapshot
  warning: DemoWarning
  evidence: DemoEvidence[]
  runs: DemoRun[]
  graph: { id: string; nodes: DemoGraphNode[]; relations: DemoGraphRelation[]; events: DemoGraphEvent[] }
  tradeCycle: DemoTradeRecord[]
}

export interface DemoSummary {
  entities: number
  relations: number
  events: number
  warnings: number
  evidence: number
  bid_scores: number
  trade_records: number
}

export const demoDataApi = {
  summary: () => request<DemoSummary>('/api/demo/summary'),
  listWarnings: () => request<DemoWarning[]>('/api/demo/warnings'),
  warningDetail: (id: string) => request<DemoWarningDetail>(`/api/demo/warnings/${encodeURIComponent(id)}`),
  resetWorkflow: () => request<{ ok: boolean; message: string; counts: { rectification: number; review: number; overdue: number } }>('/api/demo/workflow/reset', { method: 'POST' }),
}
