import type { DataSourceItem, GraphVersion } from './types'

export interface SourceMetadataItem { id: string; sourceId: string; tableName: string; displayName: string; fieldCount: number; summary: string; fields?: string[] }
export interface MappingItem { id: string; sourceId: string; ontologyId: string; type: '节点实例' | '关系'; sourceField: string; transform: string; targetCode: string; status: string; revision?: number; setStatus?: string; lastValidatedAt?: string }
export interface MappingDependencyItem { sourceId: string; sourceName: string; sourceStatus: string; status: 'ready' | 'missing' | 'pending' | 'invalid' | 'disabled'; revision: number; mappingCount: number; validCount: number; lastValidatedAt: string; message: string }
export interface GraphDependencyCheck { ready: boolean; ontologyId: string; items: MappingDependencyItem[] }
export interface SyncRecordItem { id: string; sourceId: string; sourceName: string; mode: string; startedAt: string; processed: number; errors: number; duration: string; result: string }
export interface GraphIssueItem { id: string; graphId: string; title: string; level: string; description: string; sourceRef: string; status: string }
export interface GovernanceTaskItem { id: string; graphId: string; objectType: string; candidates: string[]; evidence: string; suggestion: string; level: string; status: string; result: string; reason: string }

export interface CreateGraphPayload { graphCode: string; graphName: string; ontologyId: string; sourceIds: string[]; range: string }
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || `请求失败：${response.status}`)
  return data as T
}

export const dataGraphApi = {
  listSources: () => request<DataSourceItem[]>('/api/data-sources'),
  createSource: (payload: Omit<DataSourceItem, 'id' | 'lastSuccess' | 'status'>) => request<DataSourceItem>('/api/data-sources', { method: 'POST', body: JSON.stringify(payload) }),
  deleteSource: (id: string) => request<{ ok: boolean; message: string }>(`/api/data-sources/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  testSource: (id: string) => request<{ ok: boolean; message: string; source: DataSourceItem }>(`/api/data-sources/${encodeURIComponent(id)}/test`, { method: 'POST' }),
  toggleSource: (id: string, enabled: boolean) => request<DataSourceItem>(`/api/data-sources/${encodeURIComponent(id)}/toggle`, { method: 'POST', body: JSON.stringify({ enabled }) }),
  parseMetadata: (id: string, ontologyId = 'ONT-PROC') => request<SourceMetadataItem[]>(`/api/data-sources/${encodeURIComponent(id)}/metadata/parse`, { method: 'POST', body: JSON.stringify({ ontologyId }) }),
  metadata: (id: string) => request<SourceMetadataItem[]>(`/api/data-sources/${encodeURIComponent(id)}/metadata`),
  mappings: (id: string, type?: string, ontologyId = 'ONT-PROC') => request<MappingItem[]>(`/api/data-sources/${encodeURIComponent(id)}/mappings?ontologyId=${encodeURIComponent(ontologyId)}${type ? `&type=${encodeURIComponent(type)}` : ''}`),
  createMapping: (sourceId: string, payload: { ontologyId: string; targetCode: string; sourceField: string; transform?: string }) => request<MappingItem>(`/api/data-sources/${encodeURIComponent(sourceId)}/mappings`, { method: 'POST', body: JSON.stringify(payload) }),
  updateMapping: (sourceId: string, mappingId: string, payload: { ontologyId: string; targetCode: string; sourceField?: string; transform?: string }) => request<MappingItem>(`/api/data-sources/${encodeURIComponent(sourceId)}/mappings/${encodeURIComponent(mappingId)}`, { method: 'PUT', body: JSON.stringify(payload) }),
  validateMappings: (id: string, ontologyId = 'ONT-PROC') => request<{ ok: boolean; message: string }>(`/api/data-sources/${encodeURIComponent(id)}/mappings/validate`, { method: 'POST', body: JSON.stringify({ ontologyId }) }),
  syncSource: (id: string) => request<{ recordId: string; message: string }>(`/api/data-sources/${encodeURIComponent(id)}/sync`, { method: 'POST' }),
  syncRecords: (sourceId?: string) => request<SyncRecordItem[]>(`/api/sync-records${sourceId ? `?sourceId=${encodeURIComponent(sourceId)}` : ''}`),
  listGraphs: (status?: string) => request<GraphVersion[]>(`/api/graphs${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  checkGraphDependencies: (payload: { ontologyId: string; sourceIds: string[] }) => request<GraphDependencyCheck>('/api/graphs/dependencies/check', { method: 'POST', body: JSON.stringify(payload) }),
  createGraph: (payload: CreateGraphPayload) => request<GraphVersion>('/api/graphs', { method: 'POST', body: JSON.stringify(payload) }),
  updateGraph: (id: string, payload: CreateGraphPayload) => request<GraphVersion>(`/api/graphs/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteGraph: (id: string) => request<{ ok: boolean; message: string }>(`/api/graphs/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  publishGraph: (id: string) => request<GraphVersion>(`/api/graphs/${encodeURIComponent(id)}/publish`, { method: 'POST' }),
  issues: (graphId: string) => request<GraphIssueItem[]>(`/api/graphs/${encodeURIComponent(graphId)}/issues`),
  resolveIssue: (graphId: string, issueId: string) => request<{ ok: boolean; message: string }>(`/api/graphs/${encodeURIComponent(graphId)}/issues/${encodeURIComponent(issueId)}/resolve`, { method: 'POST' }),
  governance: (graphId: string) => request<GovernanceTaskItem[]>(`/api/graphs/${encodeURIComponent(graphId)}/governance`),
  govern: (graphId: string, taskId: string, payload: { result: string; reason: string }) => request<{ ok: boolean; message: string }>(`/api/graphs/${encodeURIComponent(graphId)}/governance/${encodeURIComponent(taskId)}`, { method: 'POST', body: JSON.stringify(payload) }),
}
