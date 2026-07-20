import { create } from 'zustand'
import { ontologyApi, type OntologyCreatePayload, type OntologyElementPayload, type OntologyUpdatePayload } from './ontologyApi'
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
  copyOntology: (id: string) => Promise<Result>
  publishOntology: (id: string) => Promise<Result>
  validateOntology: (id: string) => Promise<Result>
  addElement: (id: string, payload: OntologyElementPayload) => Promise<Result>
  updateElement: (id: string, elementId: string, payload: Partial<OntologyElementPayload>) => Promise<Result>
  deleteElement: (id: string, elementId: string) => Promise<Result>
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
      return { ok: true, message: `已从MySQL加载${ontologies.length}个本体` }
    } catch (error) {
      set({ loading: false })
      return { ok: false, message: errorMessage(error) }
    }
  },
  createOntology: async (payload) => {
    try {
      const ontology = await ontologyApi.create(payload)
      set((state) => ({ ontologies: replaceOntology(state.ontologies, ontology) }))
      return { ok: true, message: `本体草稿 ${ontology.id} 已写入MySQL`, objectId: ontology.id }
    } catch (error) {
      return { ok: false, message: errorMessage(error) }
    }
  },
  updateOntology: async (id, patch) => {
    try {
      const ontology = await ontologyApi.update(id, patch)
      set((state) => ({ ontologies: replaceOntology(state.ontologies, ontology) }))
      return { ok: true, message: '本体草稿已保存到MySQL' }
    } catch (error) {
      return { ok: false, message: errorMessage(error) }
    }
  },
  copyOntology: async (id) => {
    try {
      const ontology = await ontologyApi.copy(id)
      set((state) => ({ ontologies: [ontology, ...state.ontologies] }))
      return { ok: true, message: '本体新草稿版本已复制到MySQL', objectId: ontology.id }
    } catch (error) {
      return { ok: false, message: errorMessage(error) }
    }
  },
  publishOntology: async (id) => {
    try {
      const ontology = await ontologyApi.publish(id)
      set((state) => ({ ontologies: replaceOntology(state.ontologies, ontology) }))
      return { ok: true, message: '本体版本已发布并写入MySQL' }
    } catch (error) {
      return { ok: false, message: errorMessage(error) }
    }
  },
  validateOntology: async (id) => {
    try {
      const result = await ontologyApi.validate(id)
      set((state) => ({ ontologies: replaceOntology(state.ontologies, result.ontology) }))
      return { ok: result.validation.blockers.length === 0, message: result.validation.blockers.length ? `本体校验发现${result.validation.blockers.length}个阻断项` : '本体校验通过，已进入待校验状态' }
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
      return { ok: true, message: `${payload.name || '本体元素'}已更新到MySQL` }
    } catch (error) {
      return { ok: false, message: errorMessage(error) }
    }
  },
  deleteElement: async (id, elementId) => {
    const element: OntologyElement | undefined = get().ontologies.find((row) => row.id === id)?.elements.find((row) => row.id === elementId)
    try {
      const ontology = await ontologyApi.deleteElement(id, elementId)
      set((state) => ({ ontologies: replaceOntology(state.ontologies, ontology) }))
      return { ok: true, message: `${element?.name || '本体元素'}已从MySQL删除` }
    } catch (error) {
      return { ok: false, message: errorMessage(error) }
    }
  },
  resetOntologies: () => { void get().loadOntologies() },
}))
