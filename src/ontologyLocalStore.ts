import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ontologies as initialOntologyItems } from './data'
import type { OntologyItem } from './types'

export type OntologyElementType = 'class' | 'property' | 'relation' | 'event'

export interface OntologyElement {
  id: string
  type: OntologyElementType
  code: string
  name: string
  ownerCode?: string
  targetCode?: string
  dataType: string
  constraint: string
  description: string
}

export interface OntologyValidationIssue {
  field: string
  tab: string
  message: string
}

export interface OntologyValidation { blockers: OntologyValidationIssue[]; warnings: OntologyValidationIssue[]; validatedAt: string }
export interface OntologyRecord extends OntologyItem {
  description: string
  elements: OntologyElement[]
  sourceVersionId?: string
  validation?: OntologyValidation
  publishedAt?: string
}

interface Result {
  ok: boolean
  message: string
  objectId?: string
}

interface OntologyState {
  ontologies: OntologyRecord[]
  createOntology: (payload: { id: string; name: string; scope: string; domain: string; description: string }) => Result
  updateOntology: (id: string, patch: Partial<Pick<OntologyRecord, 'name' | 'scope' | 'domain' | 'description'>>) => Result
  copyOntology: (id: string) => Result
  publishOntology: (id: string) => Result
  addElement: (id: string, payload: Omit<OntologyElement, 'id'>) => Result
  deleteElement: (id: string, elementId: string) => Result
  resetOntologies: () => void
}

const sampleElements: OntologyElement[] = [
  { id: 'EL-PROC-001', type: 'class', code: 'PROC.Supplier', name: '供应商', dataType: '本体类', constraint: '统一社会信用代码为主标识', description: '参与采购、合同或服务活动的业务主体。' },
  { id: 'EL-PROC-002', type: 'property', code: 'PROC.Supplier.credit_code', name: '统一社会信用代码', dataType: '文本', constraint: '主标识、必填', description: '供应商工商登记主标识。' },
  { id: 'EL-PROC-003', type: 'relation', code: 'PROC.participate', name: '参与采购', dataType: '供应商 → 采购项目', constraint: '多对多', description: '供应商报名或参与采购项目。' },
  { id: 'EL-PROC-004', type: 'event', code: 'PROC.BidConfirmed', name: '中标确认', dataType: '采购项目事件', constraint: '目标事件', description: '采购项目确认中标结果的业务事件。' },
]

const descriptions: Record<string, string> = {
  'ONT-BASE': '统一组织、人员、主体、账户、文档、预警和风险事件的基础语义。',
  'ONT-PROC': '覆盖供应商、采购项目、投标、评审和中标确认等采购监管对象。',
  'ONT-CONTRACT': '覆盖合同签订、履约、变更、验收和结算事件。',
  'ONT-FIN': '覆盖付款、账户、资金流水、融资和担保关系。',
}

const createInitial = (): OntologyRecord[] => initialOntologyItems.map((item) => ({
  ...item,
  description: descriptions[item.id] || '',
  elements: item.id === 'ONT-PROC' ? sampleElements : [],
}))

const countKey = { class: 'classes', property: 'properties', relation: 'relations', event: 'events' } as const

export const useOntologyStore = create<OntologyState>()(
  persist(
    (set, get) => ({
      ontologies: createInitial(),
      createOntology: (payload) => {
        const id = payload.id.trim().toUpperCase()
        if (!/^[A-Z0-9_-]{3,64}$/.test(id)) return { ok: false, message: '本体编码只能包含大写字母、数字、下划线和中划线' }
        if (!payload.name.trim()) return { ok: false, message: '本体名称不能为空' }
        if (get().ontologies.some((item) => item.id === id)) return { ok: false, message: `本体编码 ${id} 已存在` }
        const ontology: OntologyRecord = {
          id,
          name: payload.name.trim(),
          scope: payload.scope,
          domain: payload.domain,
          version: 'v0.1',
          classes: 0,
          properties: 0,
          relations: 0,
          events: 0,
          status: '草稿',
          updatedAt: '刚刚',
          description: payload.description.trim(),
          elements: [],
        }
        set((state) => ({ ontologies: [ontology, ...state.ontologies] }))
        return { ok: true, message: `本体草稿 ${id} 已创建`, objectId: id }
      },
      updateOntology: (id, patch) => {
        const item = get().ontologies.find((row) => row.id === id)
        if (!item) return { ok: false, message: '本体不存在' }
        if (item.status === '已发布') return { ok: false, message: '已发布本体不可直接修改，请复制新版本' }
        if (patch.name !== undefined && !patch.name.trim()) return { ok: false, message: '本体名称不能为空' }
        set((state) => ({ ontologies: state.ontologies.map((row) => row.id === id ? { ...row, ...patch, updatedAt: '刚刚' } : row) }))
        return { ok: true, message: '本体草稿已保存' }
      },
      copyOntology: (id) => {
        const item = get().ontologies.find((row) => row.id === id)
        if (!item) return { ok: false, message: '本体不存在' }
        const major = Number(item.version.replace(/^v/, '').split('.')[0]) || 0
        const objectId = `${id.replace(/-DRAFT-[A-Z0-9]+$/, '')}-DRAFT-${Date.now().toString(36).toUpperCase()}`
        const next: OntologyRecord = { ...item, id: objectId, version: `v${major + 1}.0`, status: '草稿', updatedAt: '刚刚', elements: item.elements.map((element) => ({ ...element, id: `${element.id}-${Date.now().toString(36)}` })) }
        set((state) => ({ ontologies: [next, ...state.ontologies] }))
        return { ok: true, message: '本体新草稿版本已创建', objectId }
      },
      publishOntology: (id) => {
        const item = get().ontologies.find((row) => row.id === id)
        if (!item) return { ok: false, message: '本体不存在' }
        if (item.classes < 1) return { ok: false, message: '本体至少需要一个本体类才能发布' }
        set((state) => ({ ontologies: state.ontologies.map((row) => row.id === id ? { ...row, status: '已发布', updatedAt: '刚刚' } : row) }))
        return { ok: true, message: '本体版本已发布' }
      },
      addElement: (id, payload) => {
        const item = get().ontologies.find((row) => row.id === id)
        if (!item) return { ok: false, message: '本体不存在' }
        if (item.status === '已发布') return { ok: false, message: '已发布本体不可新增元素' }
        if (!payload.code.trim() || !payload.name.trim()) return { ok: false, message: '元素编码和名称不能为空' }
        if (item.elements.some((element) => element.type === payload.type && element.code === payload.code.trim())) return { ok: false, message: '同类型元素编码已存在' }
        const key = countKey[payload.type]
        const element: OntologyElement = { ...payload, id: `EL-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, code: payload.code.trim(), name: payload.name.trim() }
        set((state) => ({ ontologies: state.ontologies.map((row) => row.id === id ? { ...row, [key]: row[key] + 1, elements: [...row.elements, element], updatedAt: '刚刚' } : row) }))
        return { ok: true, message: `${payload.name}已添加到本体` }
      },
      deleteElement: (id, elementId) => {
        const item = get().ontologies.find((row) => row.id === id)
        if (!item) return { ok: false, message: '本体不存在' }
        if (item.status === '已发布') return { ok: false, message: '已发布本体不可删除元素' }
        const element = item.elements.find((row) => row.id === elementId)
        if (!element) return { ok: false, message: '本体元素不存在' }
        const key = countKey[element.type]
        set((state) => ({ ontologies: state.ontologies.map((row) => row.id === id ? { ...row, [key]: Math.max(0, row[key] - 1), elements: row.elements.filter((value) => value.id !== elementId), updatedAt: '刚刚' } : row) }))
        return { ok: true, message: `${element.name}已删除` }
      },
      resetOntologies: () => set({ ontologies: createInitial() }),
    }),
    { name: 'penetrative-supervision-ontology-v1' },
  ),
)
