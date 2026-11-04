import type { OntologyElement, OntologyRecord } from './ontologyLocalStore'

export type OntologyCreatePayload = Pick<OntologyRecord, 'id' | 'name' | 'scope' | 'domain' | 'description'>
export type OntologyUpdatePayload = Partial<Pick<OntologyRecord, 'name' | 'scope' | 'domain' | 'description'>>
export type OntologyElementPayload = Omit<OntologyElement, 'id'>
export type OntologyDraftPayload = OntologyUpdatePayload & { elements: OntologyElement[]; groups: string[]; expected: OntologyRecord }

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || `请求失败：${response.status}`)
  return data as T
}

export const ontologyApi = {
  list: () => request<OntologyRecord[]>('/api/ontologies'),
  create: (payload: OntologyCreatePayload) => request<OntologyRecord>('/api/ontologies', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: OntologyUpdatePayload) => request<OntologyRecord>(`/api/ontologies/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }),
  saveDraft: (id: string, payload: OntologyDraftPayload) => request<OntologyRecord>(`/api/ontologies/${encodeURIComponent(id)}/draft`, { method: 'PUT', body: JSON.stringify(payload) }),
  delete: (id: string) => request<{ ok: boolean; message: string }>(`/api/ontologies/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  copy: (id: string) => request<OntologyRecord>(`/api/ontologies/${encodeURIComponent(id)}/copy`, { method: 'POST' }),
  enable: (id: string) => request<OntologyRecord>(`/api/ontologies/${encodeURIComponent(id)}/enable`, { method: 'POST' }),
  disable: (id: string) => request<OntologyRecord>(`/api/ontologies/${encodeURIComponent(id)}/disable`, { method: 'POST' }),
  addElement: (id: string, payload: OntologyElementPayload) => request<OntologyRecord>(`/api/ontologies/${encodeURIComponent(id)}/elements`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteElement: (id: string, elementId: string) => request<OntologyRecord>(`/api/ontologies/${encodeURIComponent(id)}/elements/${encodeURIComponent(elementId)}`, { method: 'DELETE' }),
  updateElement: (id: string, elementId: string, payload: Partial<OntologyElementPayload>) => request<OntologyRecord>(`/api/ontologies/${encodeURIComponent(id)}/elements/${encodeURIComponent(elementId)}`, { method: 'PUT', body: JSON.stringify(payload) }),
  createGroup: (id: string, name: string) => request<OntologyRecord>(`/api/ontologies/${encodeURIComponent(id)}/groups`, { method: 'POST', body: JSON.stringify({ name }) }),
  renameGroup: (id: string, currentName: string, name: string) => request<OntologyRecord>(`/api/ontologies/${encodeURIComponent(id)}/groups/${encodeURIComponent(currentName)}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  deleteGroup: (id: string, name: string) => request<OntologyRecord>(`/api/ontologies/${encodeURIComponent(id)}/groups/${encodeURIComponent(name)}`, { method: 'DELETE' }),
}
