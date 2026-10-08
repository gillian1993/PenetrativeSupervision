import type { DataSourceItem, GraphStructureElement, GraphVersion } from './types'

export interface SourceMetadataItem { id: string; sourceId: string; tableName: string; displayName: string; fieldCount: number; summary: string; fields?: string[] }
export interface SourceFileItem { id: string; sourceId: string; name: string; size: number; sheetCount: number; status: string; createdAt: string }
export interface MappingItem { id: string; sourceId: string; ontologyId: string; type: '实体类型' | '属性' | '关系'; sourceField: string; transform: string; targetCode: string; status: string; revision?: number; setStatus?: string; lastValidatedAt?: string }
export interface MappingDependencyItem { sourceId: string; sourceName: string; sourceStatus: string; status: 'ready' | 'missing' | 'pending' | 'invalid' | 'disabled'; revision: number; mappingCount: number; validCount: number; lastValidatedAt: string; message: string }
export interface GraphDependencyCheck { ready: boolean; ontologyId: string; items: MappingDependencyItem[]; issues: string[]; mappedEntityCount: number; mappedRelationCount: number }
export interface AutoMappingPreview {
  entities: { sourceId: string; sourceName: string; targetCode: string; tableName: string; keyField: string; properties: { targetCode: string; sourceField: string }[] }[]
  relations: { sourceId: string; targetCode: string; sourceField: string; transform: string }[]
  skippedEntities: number
  skippedRelations: number
}
export interface SyncRecordItem { id: string; sourceId: string; sourceName: string; mode: string; startedAt: string; processed: number; errors: number; duration: string; result: string }
export interface GraphIssueItem { id: string; graphId: string; title: string; level: string; description: string; sourceRef: string; status: string }
export interface GovernanceTaskItem { id: string; graphId: string; objectType: string; candidates: string[]; evidence: string; suggestion: string; level: string; status: string; result: string; reason: string }
export interface MappingSnapshotItem { graphId: string; sourceId: string; ontologyId: string; revision: number; status: string; mappingCount: number; createdAt: string; rows: MappingItem[] }

export interface CreateGraphPayload { graphCode: string; graphName: string; tag: string; ontologyId: string; sourceIds: string[]; range: string; structureElements?: GraphStructureElement[] }
export interface CreateSourcePayload {
  name: string
  mode: string
  range: string
  owner: string
  accessConfig?: DataSourceItem['accessConfig']
}
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: init?.body instanceof FormData ? init.headers : { 'Content-Type': 'application/json', ...(init?.headers || {}) } })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || `请求失败：${response.status}`)
  return data as T
}

export const dataGraphApi = {
  listSources: () => request<DataSourceItem[]>('/api/data-sources'),
  createSource: (payload: CreateSourcePayload) => request<DataSourceItem>('/api/data-sources', { method: 'POST', body: JSON.stringify(payload) }),
  updateSource: (id: string, payload: CreateSourcePayload) => request<DataSourceItem>(`/api/data-sources/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }),
  sourceFiles: (id: string) => request<SourceFileItem[]>(`/api/data-sources/${encodeURIComponent(id)}/files`),
  uploadSourceFile: (id: string, file: File) => { const body = new FormData(); body.append('file', file); return request<SourceFileItem>(`/api/data-sources/${encodeURIComponent(id)}/files`, { method: 'POST', body }) },
  deleteSourceFile: (id: string, fileId: string) => request<{ ok: boolean; message: string }>(`/api/data-sources/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' }),
  deleteSource: (id: string) => request<{ ok: boolean; message: string }>(`/api/data-sources/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  testSource: (id: string) => request<{ ok: boolean; message: string; source: DataSourceItem }>(`/api/data-sources/${encodeURIComponent(id)}/test`, { method: 'POST' }),
  testSourceConfig: (payload: { mode: string; accessConfig?: DataSourceItem['accessConfig'] }) => request<{ ok: boolean; message: string }>('/api/data-sources/test-config', { method: 'POST', body: JSON.stringify(payload) }),
  toggleSource: (id: string, enabled: boolean) => request<DataSourceItem>(`/api/data-sources/${encodeURIComponent(id)}/toggle`, { method: 'POST', body: JSON.stringify({ enabled }) }),
  parseMetadata: (id: string, ontologyId = 'ONT-PROC') => request<SourceMetadataItem[]>(`/api/data-sources/${encodeURIComponent(id)}/metadata/parse`, { method: 'POST', body: JSON.stringify({ ontologyId }) }),
  metadata: (id: string) => request<SourceMetadataItem[]>(`/api/data-sources/${encodeURIComponent(id)}/metadata`),
  mappings: (id: string, type?: string, ontologyId = 'ONT-PROC', graphId?: string) => request<MappingItem[]>(`/api/data-sources/${encodeURIComponent(id)}/mappings?ontologyId=${encodeURIComponent(ontologyId)}${type ? `&type=${encodeURIComponent(type)}` : ''}${graphId ? `&graphId=${encodeURIComponent(graphId)}` : ''}`),
  createMapping: (sourceId: string, payload: { ontologyId: string; targetCode: string; targetType?: GraphStructureElement['type']; sourceField: string; transform?: string; type?: MappingItem['type'] }, graphId?: string) => request<MappingItem>(`/api/data-sources/${encodeURIComponent(sourceId)}/mappings${graphId ? `?graphId=${encodeURIComponent(graphId)}` : ''}`, { method: 'POST', body: JSON.stringify(payload) }),
  updateMapping: (sourceId: string, mappingId: string, payload: { ontologyId: string; targetCode: string; targetType?: GraphStructureElement['type']; sourceField?: string; transform?: string }, graphId?: string) => request<MappingItem>(`/api/data-sources/${encodeURIComponent(sourceId)}/mappings/${encodeURIComponent(mappingId)}${graphId ? `?graphId=${encodeURIComponent(graphId)}` : ''}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteMapping: (sourceId: string, mappingId: string, ontologyId = 'ONT-PROC', graphId?: string) => request<{ ok: boolean; message: string }>(`/api/data-sources/${encodeURIComponent(sourceId)}/mappings/${encodeURIComponent(mappingId)}?ontologyId=${encodeURIComponent(ontologyId)}${graphId ? `&graphId=${encodeURIComponent(graphId)}` : ''}`, { method: 'DELETE' }),
  validateMappings: (id: string, ontologyId = 'ONT-PROC') => request<{ ok: boolean; message: string }>(`/api/data-sources/${encodeURIComponent(id)}/mappings/validate`, { method: 'POST', body: JSON.stringify({ ontologyId }) }),
  syncSource: (id: string) => request<{ recordId: string; message: string }>(`/api/data-sources/${encodeURIComponent(id)}/sync`, { method: 'POST' }),
  syncRecords: (sourceId?: string) => request<SyncRecordItem[]>(`/api/sync-records${sourceId ? `?sourceId=${encodeURIComponent(sourceId)}` : ''}`),
  listGraphs: (status?: string) => request<GraphVersion[]>(`/api/graphs${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  graph: (id: string) => request<GraphVersion>(`/api/graphs/${encodeURIComponent(id)}`),
  mappingSnapshots: (id: string) => request<MappingSnapshotItem[]>(`/api/graphs/${encodeURIComponent(id)}/mapping-snapshots`),
  checkGraphDependencies: (payload: { ontologyId: string; sourceIds: string[]; structureElements?: GraphStructureElement[]; graphId?: string }) => request<GraphDependencyCheck>('/api/graphs/dependencies/check', { method: 'POST', body: JSON.stringify(payload) }),
  previewAutoMapping: (payload: { ontologyId: string; sourceIds: string[]; structureElements: GraphStructureElement[]; graphId?: string }) => request<AutoMappingPreview>('/api/graphs/mappings/auto/preview', { method: 'POST', body: JSON.stringify(payload) }),
  applyAutoMapping: (payload: { ontologyId: string; sourceIds: string[]; structureElements: GraphStructureElement[]; graphId?: string }) => request<{ entities: number; relations: number; skippedEntities: number; skippedRelations: number }>('/api/graphs/mappings/auto/apply', { method: 'POST', body: JSON.stringify(payload) }),
  createGraphDraft: (payload: CreateGraphPayload) => request<GraphVersion>('/api/graphs/draft', { method: 'POST', body: JSON.stringify(payload) }),
  createGraph: (payload: CreateGraphPayload) => request<GraphVersion>('/api/graphs', { method: 'POST', body: JSON.stringify(payload) }),
  updateGraph: (id: string, payload: CreateGraphPayload) => request<GraphVersion>(`/api/graphs/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }),
  saveGraphDraft: (id: string, payload: CreateGraphPayload) => request<GraphVersion>(`/api/graphs/${encodeURIComponent(id)}/draft`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteGraph: (id: string) => request<{ ok: boolean; message: string }>(`/api/graphs/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  unpublishGraph: (id: string) => request<GraphVersion>(`/api/graphs/${encodeURIComponent(id)}/unpublish`, { method: 'POST' }),
  publishGraph: (id: string) => request<GraphVersion>(`/api/graphs/${encodeURIComponent(id)}/publish`, { method: 'POST' }),
  syncGraph: (id: string) => request<GraphVersion>(`/api/graphs/${encodeURIComponent(id)}/sync`, { method: 'POST' }),
  issues: (graphId: string) => request<GraphIssueItem[]>(`/api/graphs/${encodeURIComponent(graphId)}/issues`),
  resolveIssue: (graphId: string, issueId: string) => request<{ ok: boolean; message: string }>(`/api/graphs/${encodeURIComponent(graphId)}/issues/${encodeURIComponent(issueId)}/resolve`, { method: 'POST' }),
  governance: (graphId: string) => request<GovernanceTaskItem[]>(`/api/graphs/${encodeURIComponent(graphId)}/governance`),
  govern: (graphId: string, taskId: string, payload: { result: string; reason: string }) => request<{ ok: boolean; message: string }>(`/api/graphs/${encodeURIComponent(graphId)}/governance/${encodeURIComponent(taskId)}`, { method: 'POST', body: JSON.stringify(payload) }),
}
