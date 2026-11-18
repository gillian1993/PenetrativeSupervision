import { create } from 'zustand'
import { ontologyApi, type OntologyCreatePayload, type OntologyDraftPayload, type OntologyElementPayload, type OntologyUpdatePayload } from './ontologyApi'
import type { OntologyElement, OntologyRecord } from './ontologyLocalStore'

export type { OntologyElement, OntologyElementType, OntologyRecord } from './ontologyLocalStore'

interface Result {
  ok: boolean
  message: string
  objectId?: string
}

interface OntologyState {
  ontologies: OntologyRecord[]
  loading: boolean
  loaded: boolean
  loadOntologies: () => Promise<Result>
  createOntology: (payload: OntologyCreatePayload) => Promise<Result>
  updateOntology: (id: string, patch: OntologyUpdatePayload) => Promise<Result>
  saveDraft: (id: string, payload: OntologyDraftPayload) => Promise<Result>
  deleteOntology: (id: string) => Promise<Result>
  copyOntology: (id: string) => Promise<Result>
  enableOntology: (id: string) => Promise<Result>
  disableOntology: (id: string) => Promise<Result>
  addElement: (id: string, payload: OntologyElementPayload) => Promise<Result>
  updateElement: (id: string, elementId: string, payload: Partial<OntologyElementPayload>) => Promise<Result>
  deleteElement: (id: string, elementId: string) => Promise<Result>
  createGroup: (id: string, name: string) => Promise<Result>
  renameGroup: (id: string, currentName: string, name: string) => Promise<Result>
  deleteGroup: (id: string, name: string) => Promise<Result>
  resetOntologies: () => void
}

const errorMessage = (error: unknown) => error instanceof Error ? error.message : '数据库服务请求失败'

const replaceOntology = (rows: OntologyRecord[], updated: OntologyRecord) => rows.some((row) => row.id === updated.id)
  ? rows.map((row) => row.id === updated.id ? updated : row)
  : [updated, ...rows]

export const useOntologyStore = create<OntologyState>((set, get) => ({
  ontologies: [],
  loading: false,
  loaded: false,
  loadOntologies: async () => {
    set({ loading: true })
    try {
      const ontologies = await ontologyApi.list()
      set({ ontologies, loading: false, loaded: true })
      return { ok: true, message: `已从MySQL加载${ontologies.length}个图谱结构` }
    } catch (error) {
      set({ loading: false })
      return { ok: false, message: errorMessage(error) }
    }
  },
  createOntology: async (payload) => {
    try {
      const ontology = await ontologyApi.create(payload)
      set((state) => ({ ontologies: replaceOntology(state.ontologies, ontology) }))
      return { ok: true, message: `图谱结构草稿 ${ontology.id} 已写入MySQL`, objectId: ontology.id }
    } catch (error) {
      return { ok: false, message: errorMessage(error) }
    }
  },
  updateOntology: async (id, patch) => {
    try {
      const ontology = await ontologyApi.update(id, patch)
      set((state) => ({ ontologies: replaceOntology(state.ontologies, ontology) }))
      return { ok: true, message: '图谱结构草稿已保存到MySQL' }
    } catch (error) {
      return { ok: false, message: errorMessage(error) }
    }
  },
  saveDraft: async (id, payload) => {
    try {
      const ontology = await ontologyApi.saveDraft(id, payload)
      set((state) => ({ ontologies: replaceOntology(state.ontologies, ontology) }))
      return { ok: true, message: '保存成功' }
    } catch (error) {
      return { ok: false, message: errorMessage(error) }
    }
  },
  deleteOntology: async (id) => {
    const ontology = get().ontologies.find((row) => row.id === id)
    try {
      const result = await ontologyApi.delete(id)
      set((state) => ({ ontologies: state.ontologies.filter((row) => row.id !== id) }))
      return { ok: true, message: result.message || `${ontology?.name || '图谱模型'}已删除，模型结构和历史审计已保留` }
    } catch (error) {
      return { ok: false, message: errorMessage(error) }
    }
  },
  copyOntology: async (id) => {
    try {
      const ontology = await ontologyApi.copy(id)
      set((state) => ({ ontologies: [ontology, ...state.ontologies] }))
      return { ok: true, message: '已复制为草稿，可继续编辑模型结构', objectId: ontology.id }
    } catch (error) {
      return { ok: false, message: errorMessage(error) }
    }
  },
  enableOntology: async (id) => {
    try {
      const ontology = await ontologyApi.enable(id)
      set((state) => ({ ontologies: replaceOntology(state.ontologies, ontology) }))
      return { ok: true, message: '图谱模型已启用' }
    } catch (error) {
      return { ok: false, message: errorMessage(error) }
    }
  },
  disableOntology: async (id) => {
    try {
      const ontology = await ontologyApi.disable(id)
      set((state) => ({ ontologies: replaceOntology(state.ontologies, ontology) }))
      return { ok: true, message: '图谱模型已停用，不再允许新业务引用' }
    } catch (error) {
      return { ok: false, message: errorMessage(error) }
    }
  },
  addElement: async (id, payload) => {
    try {
      const ontology = await ontologyApi.addElement(id, payload)
      set((state) => ({ ontologies: replaceOntology(state.ontologies, ontology) }))
      return { ok: true, message: `${payload.name}已写入MySQL` }
    } catch (error) {
      return { ok: false, message: errorMessage(error) }
    }
  },
  updateElement: async (id, elementId, payload) => {
    try {
      const ontology = await ontologyApi.updateElement(id, elementId, payload)
      set((state) => ({ ontologies: replaceOntology(state.ontologies, ontology) }))
      return { ok: true, message: `${payload.name || '结构定义项'}已更新到MySQL` }
    } catch (error) {
      return { ok: false, message: errorMessage(error) }
    }
  },
  deleteElement: async (id, elementId) => {
    const element: OntologyElement | undefined = get().ontologies.find((row) => row.id === id)?.elements.find((row) => row.id === elementId)
    try {
      const ontology = await ontologyApi.deleteElement(id, elementId)
      set((state) => ({ ontologies: replaceOntology(state.ontologies, ontology) }))
      return { ok: true, message: `${element?.name || '结构定义项'}已从MySQL删除` }
    } catch (error) {
      return { ok: false, message: errorMessage(error) }
    }
  },
  createGroup: async (id, name) => {
    try {
      const ontology = await ontologyApi.createGroup(id, name)
      set((state) => ({ ontologies: replaceOntology(state.ontologies, ontology) }))
      return { ok: true, message: `分组“${name.trim()}”已创建` }
    } catch (error) {
      return { ok: false, message: errorMessage(error) }
    }
  },
  renameGroup: async (id, currentName, name) => {
    try {
      const ontology = await ontologyApi.renameGroup(id, currentName, name)
      set((state) => ({ ontologies: replaceOntology(state.ontologies, ontology) }))
      return { ok: true, message: `分组已重命名为“${name.trim()}”` }
    } catch (error) {
      return { ok: false, message: errorMessage(error) }
    }
  },
  deleteGroup: async (id, name) => {
    try {
      const ontology = await ontologyApi.deleteGroup(id, name)
      set((state) => ({ ontologies: replaceOntology(state.ontologies, ontology) }))
      return { ok: true, message: `分组“${name}”已删除` }
    } catch (error) {
      return { ok: false, message: errorMessage(error) }
    }
  },
  resetOntologies: () => { void get().loadOntologies() },
}))

