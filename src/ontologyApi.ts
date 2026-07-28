import type { OntologyElement, OntologyRecord, OntologyValidation } from './ontologyLocalStore'

export type OntologyCreatePayload = Pick<OntologyRecord, 'id' | 'name' | 'scope' | 'domain' | 'description'>
export type OntologyUpdatePayload = Partial<Pick<OntologyRecord, 'name' | 'scope' | 'domain' | 'description'>>
export type OntologyElementPayload = Omit<OntologyElement, 'id'>

export type OntologyValidateResponse = { ontology: OntologyRecord; validation: OntologyValidation }
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
  delete: (id: string) => request<{ ok: boolean; message: string }>(`/api/ontologies/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  copy: (id: string) => request<OntologyRecord>(`/api/ontologies/${encodeURIComponent(id)}/copy`, { method: 'POST' }),
  publish: (id: string) => request<OntologyRecord>(`/api/ontologies/${encodeURIComponent(id)}/publish`, { method: 'POST' }),
  retire: (id: string) => request<OntologyRecord>(`/api/ontologies/${encodeURIComponent(id)}/retire`, { method: 'POST' }),
  validate: (id: string) => request<OntologyValidateResponse>(`/api/ontologies/${encodeURIComponent(id)}/validate`, { method: 'POST' }),
  addElement: (id: string, payload: OntologyElementPayload) => request<OntologyRecord>(`/api/ontologies/${encodeURIComponent(id)}/elements`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteElement: (id: string, elementId: string) => request<OntologyRecord>(`/api/ontologies/${encodeURIComponent(id)}/elements/${encodeURIComponent(elementId)}`, { method: 'DELETE' }),
  updateElement: (id: string, elementId: string, payload: Partial<OntologyElementPayload>) => request<OntologyRecord>(`/api/ontologies/${encodeURIComponent(id)}/elements/${encodeURIComponent(elementId)}`, { method: 'PUT', body: JSON.stringify(payload) }),
}
