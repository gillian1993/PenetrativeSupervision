import type { DataSourceItem, GraphVersion } from './types'

export interface SourceMetadataItem { id: string; sourceId: string; tableName: string; displayName: string; fieldCount: number; summary: string }
export interface MappingItem { id: string; sourceId: string; type: '属性' | '关系' | '事件'; sourceField: string; transform: string; targetCode: string; confidence: number; status: string }
export interface SyncRecordItem { id: string; sourceId: string; sourceName: string; mode: string; startedAt: string; processed: number; errors: number; duration: string; result: string }
export interface GraphIssueItem { id: string; graphId: string; title: string; level: string; description: string; sourceRef: string; status: string }
export interface GovernanceTaskItem { id: string; graphId: string; objectType: string; candidates: string[]; evidence: string; suggestion: string; level: string; status: string; result: string; reason: string }

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || `请求失败：${response.status}`)
  return data as T
}

export const dataGraphApi = {
  listSources: () => request<DataSourceItem[]>('/api/data-sources'),
  createSource: (payload: Omit<DataSourceItem, 'id' | 'lastSuccess' | 'status'>) => request<DataSourceItem>('/api/data-sources', { method: 'POST', body: JSON.stringify(payload) }),
  testSource: (id: string) => request<{ ok: boolean; message: string; source: DataSourceItem }>(`/api/data-sources/${encodeURIComponent(id)}/test`, { method: 'POST' }),
  toggleSource: (id: string, enabled: boolean) => request<DataSourceItem>(`/api/data-sources/${encodeURIComponent(id)}/toggle`, { method: 'POST', body: JSON.stringify({ enabled }) }),
  parseMetadata: (id: string) => request<SourceMetadataItem[]>(`/api/data-sources/${encodeURIComponent(id)}/metadata/parse`, { method: 'POST' }),
  metadata: (id: string) => request<SourceMetadataItem[]>(`/api/data-sources/${encodeURIComponent(id)}/metadata`),
  mappings: (id: string, type?: string) => request<MappingItem[]>(`/api/data-sources/${encodeURIComponent(id)}/mappings${type ? `?type=${encodeURIComponent(type)}` : ''}`),
  validateMappings: (id: string) => request<{ ok: boolean; message: string }>(`/api/data-sources/${encodeURIComponent(id)}/mappings/validate`, { method: 'POST' }),
  syncSource: (id: string) => request<{ recordId: string; message: string }>(`/api/data-sources/${encodeURIComponent(id)}/sync`, { method: 'POST' }),
  syncRecords: () => request<SyncRecordItem[]>('/api/sync-records'),
  listGraphs: (status?: string) => request<GraphVersion[]>(`/api/graphs${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  createGraph: (payload = {}) => request<GraphVersion>('/api/graphs', { method: 'POST', body: JSON.stringify(payload) }),
  publishGraph: (id: string) => request<GraphVersion>(`/api/graphs/${encodeURIComponent(id)}/publish`, { method: 'POST' }),
  issues: (graphId: string) => request<GraphIssueItem[]>(`/api/graphs/${encodeURIComponent(graphId)}/issues`),
  resolveIssue: (graphId: string, issueId: string) => request<{ ok: boolean; message: string }>(`/api/graphs/${encodeURIComponent(graphId)}/issues/${encodeURIComponent(issueId)}/resolve`, { method: 'POST' }),
  governance: (graphId: string) => request<GovernanceTaskItem[]>(`/api/graphs/${encodeURIComponent(graphId)}/governance`),
  govern: (graphId: string, taskId: string, payload: { result: string; reason: string }) => request<{ ok: boolean; message: string }>(`/api/graphs/${encodeURIComponent(graphId)}/governance/${encodeURIComponent(taskId)}`, { method: 'POST', body: JSON.stringify(payload) }),
}
