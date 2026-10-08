import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ontologies as initialOntologyItems } from './data'
import type { OntologyItem } from './types'

export type OntologyElementType = 'class' | 'property' | 'relation'

export interface OntologyElement {
  id: string
  type: OntologyElementType
  code: string
  name: string
  groupName?: string
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
  groups?: string[]
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
  enableOntology: (id: string) => Result
  addElement: (id: string, payload: Omit<OntologyElement, 'id'>) => Result
  deleteElement: (id: string, elementId: string) => Result
  resetOntologies: () => void
}

const sampleElements: OntologyElement[] = [
  { id: 'EL-PROC-001', type: 'class', code: 'PROC.Supplier', name: '供应商', dataType: '实体类型', constraint: '统一社会信用代码为主标识', description: '参与采购、合同或服务活动的业务主体。' },
  { id: 'EL-PROC-002', type: 'property', code: 'PROC.Supplier.credit_code', name: '统一社会信用代码', dataType: '文本', constraint: '主标识、必填', description: '供应商工商登记主标识。' },
  { id: 'EL-PROC-003', type: 'relation', code: 'PROC.participate', name: '参与采购', dataType: '供应商 → 采购项目', constraint: '多对多', description: '供应商报名或参与采购项目。' },
  { id: 'EL-PROC-004', type: 'class', code: 'PROC.BidConfirmed', name: '中标确认', dataType: '实体类型', constraint: '发生时间必填', description: '采购项目确认中标结果的业务记录。' },
]

const descriptions: Record<string, string> = {
  'ONT-BASE': '统一组织、人员、主体、账户、文档、预警和风险事件的基础语义。',
  'ONT-PROC': '覆盖采购与供应链主数据、寻源、订单、到货入库、库存、质量、结算付款、风险与来源追溯。',
  'ONT-CONTRACT': '覆盖合同主档、版本条款、审批签署、履约交付、验收结算、变更续签、风险争议和文档血缘。',
  'ONT-FIN': '覆盖付款、账户、资金流水、融资和担保关系。',
}

const normalizeLocalOntologyStatus = (status: OntologyItem['status']): OntologyItem['status'] => {
  if (status === '已启用' || status === '已发布') return '启用'
  if (status === '已停用' || status === '已下架') return '停用'
  return status
}

const createInitial = (): OntologyRecord[] => initialOntologyItems.map((item) => ({
  ...item,
  status: normalizeLocalOntologyStatus(item.status),
  description: descriptions[item.id] || '',
  elements: item.id === 'ONT-PROC' ? sampleElements : [],
}))

const countKey = { class: 'classes', property: 'properties', relation: 'relations' } as const
const baseOntologyId = (id = '') => id.replace(/-DRAFT-[A-Z0-9]+$/, '')
const officialVersionNumber = (version = '') => {
  const text = version.trim()
  const match = text.match(/^V(\d+)$/i) || text.match(/^v(\d+)(?:\.\d+)?$/i)
  if (!match) return 0
  const number = Number(match[1])
  return number > 0 ? number : 1
}
const officialVersionLabel = (version = '') => {
  const number = officialVersionNumber(version)
  return number ? `V${number}` : ''
}
const nextPublishedVersion = (items: OntologyRecord[], current: OntologyRecord) => {
  const base = baseOntologyId(current.sourceVersionId || current.id)
  const maxOfficial = items
    .filter((item) => item.id === base || item.id.startsWith(`${base}-DRAFT-`))
    .reduce((max, item) => Math.max(max, officialVersionNumber(item.version)), 0)
  return `V${Math.max(maxOfficial + 1, 1)}`
}

export const useOntologyStore = create<OntologyState>()(
  persist(
    (set, get) => ({
      ontologies: createInitial(),
      createOntology: (payload) => {
        const id = payload.id.trim()
        if (!id) return { ok: false, message: '结构编码不能为空' }
        if (!payload.name.trim()) return { ok: false, message: '结构名称不能为空' }
        if (get().ontologies.some((item) => item.id === id)) return { ok: false, message: `结构编码 ${id} 已存在` }
        const ontology: OntologyRecord = {
          id,
          name: payload.name.trim(),
          scope: payload.scope,
          domain: payload.domain,
          version: '待启用',
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
        return { ok: true, message: `图谱结构草稿 ${id} 已创建`, objectId: id }
      },
      updateOntology: (id, patch) => {
        const item = get().ontologies.find((row) => row.id === id)
        if (!item) return { ok: false, message: '图谱结构不存在' }
        if (item.status === '停用' || item.status === '已删除') return { ok: false, message: `${item.status}图谱模型不可直接修改，请先启用` }
        if (patch.name !== undefined && !patch.name.trim()) return { ok: false, message: '结构名称不能为空' }
        set((state) => ({ ontologies: state.ontologies.map((row) => row.id === id ? { ...row, ...patch, updatedAt: '刚刚' } : row) }))
        return { ok: true, message: '图谱结构草稿已保存' }
      },
      copyOntology: (id) => {
        const item = get().ontologies.find((row) => row.id === id)
        if (!item) return { ok: false, message: '图谱结构不存在' }
        const objectId = `${id.replace(/-DRAFT-[A-Z0-9]+$/, '')}-DRAFT-${Date.now().toString(36).toUpperCase()}`
        const next: OntologyRecord = { ...item, id: objectId, version: '待启用', sourceVersionId: id, status: '草稿', updatedAt: '刚刚', elements: item.elements.map((element) => ({ ...element, id: `${element.id}-${Date.now().toString(36)}` })) }
        set((state) => ({ ontologies: [next, ...state.ontologies] }))
        return { ok: true, message: '图谱结构新版本已创建，当前待启用', objectId }
      },
      enableOntology: (id) => {
        const item = get().ontologies.find((row) => row.id === id)
        if (!item) return { ok: false, message: '图谱结构不存在' }
        if (item.classes < 1) return { ok: false, message: '图谱结构至少需要一个实体类型才能启用' }
        set((state) => ({ ontologies: state.ontologies.map((row) => row.id === id ? { ...row, version: nextPublishedVersion(state.ontologies, item), status: '启用', updatedAt: '刚刚' } : row) }))
        return { ok: true, message: '图谱模型已启用' }
      },
      addElement: (id, payload) => {
        const item = get().ontologies.find((row) => row.id === id)
        if (!item) return { ok: false, message: '图谱结构不存在' }
        if (item.status === '停用' || item.status === '已删除') return { ok: false, message: `${item.status}图谱模型不可新增结构定义项` }
        if (!payload.code.trim() || !payload.name.trim()) return { ok: false, message: '结构定义项编码和名称不能为空' }
        if (item.elements.some((element) => element.type === payload.type && element.code === payload.code.trim())) return { ok: false, message: '同类型结构定义项编码已存在' }
        const key = countKey[payload.type]
        const element: OntologyElement = { ...payload, id: `EL-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, code: payload.code.trim(), name: payload.name.trim() }
        set((state) => ({ ontologies: state.ontologies.map((row) => row.id === id ? { ...row, [key]: row[key] + 1, events: 0, elements: [...row.elements, element], updatedAt: '刚刚' } : row) }))
        return { ok: true, message: `${payload.name}已添加到图谱结构` }
      },
      deleteElement: (id, elementId) => {
        const item = get().ontologies.find((row) => row.id === id)
        if (!item) return { ok: false, message: '图谱结构不存在' }
        if (item.status === '启用' || item.status === '停用') return { ok: false, message: `${item.status}图谱结构不可删除结构定义项` }
        const element = item.elements.find((row) => row.id === elementId)
        if (!element) return { ok: false, message: '结构定义项不存在' }
        const key = countKey[element.type]
        set((state) => ({ ontologies: state.ontologies.map((row) => row.id === id ? { ...row, [key]: Math.max(0, row[key] - 1), events: 0, elements: row.elements.filter((value) => value.id !== elementId), updatedAt: '刚刚' } : row) }))
        return { ok: true, message: `${element.name}已删除` }
      },
      resetOntologies: () => set({ ontologies: createInitial() }),
    }),
    {
      name: 'penetrative-supervision-ontology-v1',
      merge: (persistedState, currentState) => {
        const stored = persistedState as Partial<OntologyState>
        return {
          ...currentState,
          ...stored,
          ontologies: (stored.ontologies ?? currentState.ontologies).map((item) => ({
            ...item,
            status: normalizeLocalOntologyStatus(item.status),
          })),
        }
      },
    },
  ),
)

