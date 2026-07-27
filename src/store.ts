import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { demoDataApi } from './demoDataApi'
import {
  audits as initialAudits,
  dataSources as initialDataSources,
  graphVersions as initialGraphVersions,
  initialMessages,
  initialRiskEvents,
  initialWarnings,
  ontologies as initialOntologies,
  roles as initialRoles,
  scenes as initialScenes,
  todos as initialTodos,
  users as initialUsers,
} from './data'
import type {
  AuditItem,
  DataSourceItem,
  GraphVersion,
  OntologyItem,
  RiskEvent,
  RoleItem,
  SceneItem,
  TodoItem,
  UserItem,
  Warning,
  WarningStatus,
  WorkMessage,
} from './types'

export interface OperationResult {
  ok: boolean
  message: string
  objectId?: string
}

interface AppState {
  warnings: Warning[]
  warningSource: 'local' | 'database' | 'fallback'
  riskEvents: RiskEvent[]
  messages: WorkMessage[]
  todos: TodoItem[]
  scenes: SceneItem[]
  ontologies: OntologyItem[]
  dataSources: DataSourceItem[]
  graphVersions: GraphVersion[]
  users: UserItem[]
  roles: RoleItem[]
  audits: AuditItem[]
  currentScope: string
  currentRole: string
  toast: string
  setToast: (message: string) => void
  loadWarningsFromDatabase: () => Promise<OperationResult>
  setScope: (scope: string) => void
  setCurrentRole: (role: string) => void
  markMessageRead: (id: string) => void
  markMessageUnread: (id: string) => void
  markAllMessagesRead: () => void
  transferTodo: (id: string, owner: string, reason?: string) => OperationResult
  transferWarning: (id: string, owner: string, reason?: string) => OperationResult
  releaseWarning: (id: string, reason: string, evidence: string) => OperationResult
  escalateWarning: (id: string, owner: string, dueAt: string, requirement: string, reason?: string) => OperationResult
  transferRiskEvent: (id: string, owner: string, reason?: string) => OperationResult
  submitRectification: (id: string, result: string, measures?: string, materials?: string[]) => OperationResult
  reviewRiskEvent: (id: string, result: '通过' | '退回整改' | '不成立关闭', reason: string, evidence: string) => OperationResult
  updateWarning: (id: string, status: WarningStatus, owner?: string) => void
  updateRiskEvent: (id: string, status: RiskEvent['status'], owner?: string) => void
  createScene: (payload: Pick<SceneItem, 'name' | 'domain' | 'object' | 'event' | 'level'>) => string
  updateScene: (id: string, patch: Partial<SceneItem>) => OperationResult
  copyScene: (id: string) => OperationResult
  publishScene: (id: string) => OperationResult
  stopScene: (id: string, reason: string) => OperationResult
  copyOntology: (id: string) => OperationResult
  publishOntology: (id: string) => OperationResult
  createDataSource: (payload: Pick<DataSourceItem, 'name' | 'mode' | 'range' | 'owner' | 'ontologyIds'> & Pick<Partial<DataSourceItem>, 'ontologyNames'>) => string
  testDataSource: (id: string) => OperationResult
  toggleDataSource: (id: string, enabled: boolean) => OperationResult
  publishGraph: (id: string) => OperationResult
  governEntity: (taskId: string, result: '合并' | '保持独立' | '拆分', reason: string) => OperationResult
  updateUser: (id: string, patch: Partial<UserItem>) => OperationResult
  deleteUser: (id: string) => OperationResult
  createUser: (payload: Pick<UserItem, 'name' | 'account' | 'organization' | 'position' | 'roles' | 'status'>) => OperationResult
  transferUserTodos: (id: string, owner: string, reason?: string) => OperationResult
  updateRole: (id: string, permissions: string[]) => OperationResult
  deleteRole: (id: string) => OperationResult
  createRole: (payload: Pick<RoleItem, 'id' | 'name' | 'scope'> & { permissions?: string[] }) => OperationResult
  addAudit: (entry: Omit<AuditItem, 'id' | 'time' | 'traceId'>) => void
  resetWorkflow: () => void
}

const timestamp = () => new Date().toLocaleString('zh-CN', { hour12: false }).replaceAll('/', '-')
const traceId = () => `trace-${Math.random().toString(16).slice(2, 10)}`
const todayCode = () => new Date().toISOString().slice(0, 10).replaceAll('-', '')

type LegacyTodoItem = Omit<TodoItem, 'objectType' | 'status'> & {
  objectType?: TodoItem['objectType']
  status?: string
  taskType?: '研判' | '核查' | '整改' | '复核'
  stage?: string
  type?: '预警' | '核查任务' | '风险事件' | '整改复核'
}

const todoStatuses: TodoItem['status'][] = ['待研判', '待整改', '待复核']

const normalizeTodo = (todo: LegacyTodoItem): TodoItem => {
  const legacyType = todo.type
  const objectType: TodoItem['objectType'] = todo.objectType === '事件' || todo.objectType === '预警'
    ? todo.objectType
    : todo.route.includes('/risk/events/') || legacyType === '风险事件' ? '事件' : '预警'
  const rawStatus = todo.status || todo.stage || ''
  const status: TodoItem['status'] = objectType === '事件'
    ? rawStatus === '待复核' || todo.taskType === '复核' || legacyType === '整改复核' ? '待复核' : '待整改'
    : '待研判'
  const { type: _legacyType, taskType: _legacyTaskType, stage: _legacyStage, status: _legacyStatus, ...current } = todo
  return { ...current, objectType, status: todoStatuses.includes(status) ? status : objectType === '事件' ? '待整改' : '待研判' }
}


const createRiskEventFromWarning = (warning: Warning): RiskEvent => {
  const status = warning.riskEventStatus || '待整改'
  const dueAt = warning.riskEventDueAt || warning.expectedAt || '待确定'
  const owner = warning.riskEventOwner || warning.owner || '尹晨阳'
  return {
    id: `RE-${warning.id.replace(/^WA-/, '')}`,
    warningId: warning.id,
    title: warning.title,
    level: warning.level,
    scene: warning.scene,
    target: warning.target,
    organization: warning.organization,
    owner,
    rectificationOwner: warning.riskEventRectificationOwner || warning.owner || owner,
    status,
    dueAt,
    overdue: status !== '已关闭' && isPastDue(dueAt),
    updatedAt: warning.updatedAt,
  }
}

const isPastDue = (value: string) => {
  const timestamp = Date.parse(value.replaceAll('-', '/'))
  return Number.isFinite(timestamp) && timestamp < Date.now()
}

const normalizeDatabaseWarningStatus = (status: unknown): Warning['status'] => {
  if (status === '已解除' || status === '已升级') return status
  return '待研判'
}

const riskLevels: Warning['level'][] = ['重大', '高', '中', '低']

const ensureWarningLevelCoverage = (warnings: Warning[]) => {
  const existingIds = new Set(warnings.map((item) => item.id))
  const coveredLevels = new Set(warnings.map((item) => item.level))
  const supplements = riskLevels.flatMap((level) => coveredLevels.has(level)
    ? []
    : initialWarnings.filter((item) => item.level === level && !existingIds.has(item.id)).slice(0, 1))
  return supplements.length ? [...warnings, ...supplements] : warnings
}

const ensureWorkbenchUnreadMessages = (messages: WorkMessage[], warnings: Warning[] = []) => {
  const normalizedMessages = messages.length ? messages : initialMessages
  const routes = new Set(normalizedMessages.map((item) => item.route))
  const warningMessages = warnings
    .filter((item) => item.status === '待研判')
    .filter((item) => !routes.has(`/risk/warnings/${item.id}`))
    .slice(0, 4)
    .map((item, index): WorkMessage => ({
      id: `MSG-${item.id}`,
      type: '预警',
      title: `${item.level}风险预警待研判：${item.title}`,
      source: item.id,
      time: item.updatedAt || item.generatedAt,
      unread: index < 3,
      route: `/risk/warnings/${item.id}`,
    }))
  const combined = [...normalizedMessages, ...warningMessages]
  if (combined.some((item) => item.unread)) return combined
  const unreadIds = new Set(combined.slice(0, Math.min(3, combined.length)).map((item) => item.id))
  return combined.map((item) => unreadIds.has(item.id) ? { ...item, unread: true } : item)
}
const synchronizeRiskEvents = (warnings: Warning[], existingEvents: RiskEvent[]) => {
  const existingByWarning = new Map(existingEvents.map((item) => [item.warningId, item]))
  return warnings.filter((warning) => warning.status === '已升级').map((warning) => {
    const existing = existingByWarning.get(warning.id)
    if (!existing) return createRiskEventFromWarning(warning)
    const status = warning.riskEventStatus || existing.status
    const dueAt = warning.riskEventDueAt || existing.dueAt || warning.expectedAt || '待确定'
    return {
      ...existing,
      warningId: warning.id,
      title: warning.title,
      level: warning.level,
      scene: warning.scene,
      target: warning.target,
      organization: warning.organization,
      owner: warning.riskEventOwner || existing.owner,
      rectificationOwner: warning.riskEventRectificationOwner || existing.rectificationOwner,
      status,
      dueAt,
      overdue: status !== '已关闭' && isPastDue(dueAt),
      updatedAt: warning.updatedAt || existing.updatedAt,
    }
  })
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      const appendAudit = (entry: Omit<AuditItem, 'id' | 'time' | 'traceId'>) => {
        const audit: AuditItem = {
          ...entry,
          id: `AUD-${Date.now()}`,
          time: timestamp(),
          traceId: traceId(),
        }
        set((state) => ({ audits: [audit, ...state.audits] }))
      }
      const notify = (type: string, title: string, source: string, route: string) => {
        const message: WorkMessage = {
          id: `MSG-${Date.now()}-${Math.random().toString(16).slice(2, 5)}`,
          type,
          title,
          source,
          time: '刚刚',
          unread: true,
          route,
        }
        set((state) => ({ messages: [message, ...state.messages] }))
      }
      const closeTodos = (routePart: string) => set((state) => ({ todos: state.todos.filter((todo) => !todo.route.includes(routePart)) }))
      return {
        warnings: initialWarnings,
        warningSource: 'local',
        riskEvents: initialRiskEvents,
        messages: initialMessages,
        todos: initialTodos,
        scenes: initialScenes,
        ontologies: initialOntologies,
        dataSources: initialDataSources,
        graphVersions: initialGraphVersions,
        users: initialUsers,
        roles: initialRoles,
        audits: initialAudits,
        currentScope: '中国电子云集团',
        currentRole: '监管负责人',
        toast: '',
        setToast: (toast) => set({ toast }),
        loadWarningsFromDatabase: async () => {
          try {
            const databaseWarnings = await demoDataApi.listWarnings()
            const currentState = get()
            const previousWarnings = new Map(currentState.warnings.map((item) => [item.id, item]))
            const existingEventByWarning = new Map(currentState.riskEvents.map((item) => [item.warningId, item]))
            const warnings: Warning[] = ensureWarningLevelCoverage(databaseWarnings.map((item) => {
              const previous = previousWarnings.get(item.id)
              const existingEvent = existingEventByWarning.get(item.id)
              const databaseStatus = normalizeDatabaseWarningStatus(item.status)
              const status: Warning['status'] = existingEvent || previous?.status === '已升级'
                ? '已升级'
                : previous?.status === '已解除'
                  ? '已解除'
                  : databaseStatus
              return {
                ...item,
                status,
                owner: previous?.owner || item.owner,
                updatedAt: previous?.updatedAt || item.updatedAt,
              }
            }))
            const riskEvents = synchronizeRiskEvents(warnings, currentState.riskEvents)
            const previousTodos = new Map(currentState.todos.map((item) => [item.route, item]))
            const warningTodos: TodoItem[] = warnings.filter((item) => item.status === '待研判').map((item) => {
              const route = `/risk/warnings/${item.id}`
              const previous = previousTodos.get(route)
              return { id: previous?.id || `TODO-${item.id}`, title: `研判：${item.title}`, objectType: '预警', level: item.level, status: '待研判', dueAt: item.expectedAt || '待确定', owner: item.owner || '尹晨阳', timeState: isPastDue(item.expectedAt) ? '已逾期' : '正常', route }
            })
            const eventTodos: TodoItem[] = riskEvents.filter((item) => item.status !== '已关闭').map((item) => {
              const route = `/risk/events/${item.id}`
              const previous = previousTodos.get(route)
              return { id: previous?.id || `TODO-${item.id}`, title: `${item.status === '待复核' ? '复核' : '整改'}：${item.title}`, objectType: '事件', level: item.level, status: item.status === '待复核' ? '待复核' : '待整改', dueAt: item.dueAt, owner: item.owner, timeState: item.overdue ? '已逾期' : '正常', route }
            })
            const validRoutes = new Set([...warnings.map((item) => `/risk/warnings/${item.id}`), ...riskEvents.map((item) => `/risk/events/${item.id}`)])
            const retainedMessages = currentState.messages.filter((item) => validRoutes.has(item.route))
            const messageRoutes = new Set(retainedMessages.map((item) => item.route))
            const eventMessages: WorkMessage[] = riskEvents.filter((item) => !messageRoutes.has(`/risk/events/${item.id}`)).map((item) => ({
              id: `MSG-DB-${item.id}`,
              type: '升级',
              title: `预警已升级为风险事件，当前状态：${item.status}`,
              source: item.id,
              time: item.updatedAt,
              unread: false,
              route: `/risk/events/${item.id}`,
            }))
            const messages = ensureWorkbenchUnreadMessages([...retainedMessages, ...eventMessages], warnings)
            set({ warnings, riskEvents, todos: [...warningTodos, ...eventTodos], messages, warningSource: 'database' })
            return { ok: true, message: `已从MySQL加载${warnings.length}条预警、同步${riskEvents.length}条风险事件及工作台信息` }
          } catch (error) {
            set({ warningSource: 'fallback' })
            return { ok: false, message: error instanceof Error ? error.message : 'MySQL演示预警加载失败' }
          }
        },
        setScope: (currentScope) => {
          set({ currentScope })
          appendAudit({ operator: '尹晨阳', organization: '集团监管部', action: '切换监管范围', objectType: '组织', objectId: currentScope, summary: `切换监管范围为${currentScope}`, result: '成功', risk: '普通' })
        },
        setCurrentRole: (currentRole) => {
          set({ currentRole })
          appendAudit({ operator: '尹晨阳', organization: '集团监管部', action: '切换当前角色', objectType: '角色', objectId: currentRole, summary: `切换当前角色为${currentRole}`, result: '成功', risk: '敏感访问' })
        },
        markMessageRead: (id) => set((state) => ({ messages: state.messages.map((item) => item.id === id ? { ...item, unread: false } : item) })),
        markMessageUnread: (id) => set((state) => ({ messages: state.messages.map((item) => item.id === id ? { ...item, unread: true } : item) })),
        markAllMessagesRead: () => set((state) => ({ messages: state.messages.map((item) => ({ ...item, unread: false })) })),
        transferTodo: (id, owner, reason = '') => {
          if (!owner) return { ok: false, message: '请选择新处理人' }
          const transferReason = reason.trim() || '未填写'
          const todo = get().todos.find((item) => item.id === id)
          if (!todo) return { ok: false, message: '待办已被处理，请刷新后重试' }
          if (todo.owner === owner) return { ok: false, message: '新处理人不能与当前处理人相同' }
          const oldOwner = todo.owner
          const objectId = todo.route.split('/').filter(Boolean).pop() || id
          set((state) => ({
            todos: state.todos.map((item) => item.id === id ? { ...item, owner } : item),
            warnings: todo.objectType === '预警' ? state.warnings.map((item) => item.id === objectId ? { ...item, owner, updatedAt: '刚刚' } : item) : state.warnings,
            riskEvents: todo.objectType === '事件' ? state.riskEvents.map((item) => item.id === objectId ? { ...item, owner, rectificationOwner: item.status === '待整改' ? owner : item.rectificationOwner, updatedAt: '刚刚' } : item) : state.riskEvents,
          }))
          notify('转派', `${todo.title}已由${oldOwner}转派给${owner}`, objectId, todo.route)
          appendAudit({ operator: '尹晨阳', organization: '集团监管部', action: '转派待办', objectType: todo.objectType === '事件' ? '风险事件' : '预警', objectId, summary: `${oldOwner} → ${owner}；原因：${transferReason}`, result: '成功', risk: '高危' })
          return { ok: true, message: `待办已转派给${owner}` }
        },
        transferWarning: (id, owner, reason = '') => {
          if (!owner) return { ok: false, message: '请选择新处理人' }
          const transferReason = reason.trim() || '未填写'
          const warning = get().warnings.find((item) => item.id === id)
          if (!warning || warning.status !== '待研判') return { ok: false, message: '当前预警状态不能转派' }
          if (warning.owner === owner) return { ok: false, message: '新处理人不能与当前处理人相同' }
          const oldOwner = warning.owner
          set((state) => ({
            warnings: state.warnings.map((item) => item.id === id ? { ...item, owner, updatedAt: '刚刚' } : item),
            todos: state.todos.map((item) => item.route.endsWith(id) ? { ...item, owner } : item),
          }))
          notify('转派', `预警已由${oldOwner}转派给${owner}：${warning.title}`, id, `/risk/warnings/${id}`)
          appendAudit({ operator: '尹晨阳', organization: '集团监管部', action: '转派预警', objectType: '预警', objectId: id, summary: `${oldOwner} → ${owner}；原因：${transferReason}`, result: '成功', risk: '高危' })
          return { ok: true, message: `预警已转派给${owner}` }
        },
        releaseWarning: (id, reason, evidence) => {
          const warning = get().warnings.find((item) => item.id === id)
          if (!warning) return { ok: false, message: '预警不存在' }
          if (warning.status !== '待研判') return { ok: false, message: '当前预警已完成处置，不能重复解除' }
          if (['重大', '高'].includes(warning.level) && get().currentRole !== '监管负责人') return { ok: false, message: '重大和高风险预警仅监管负责人可以解除' }
          if (!reason.trim() || !evidence.trim()) return { ok: false, message: '解除原因和引用证据均为必填项' }
          set((state) => ({
            warnings: state.warnings.map((item) => item.id === id ? { ...item, status: '已解除', updatedAt: '刚刚' } : item),
            todos: state.todos.filter((todo) => !todo.route.endsWith(id)),
          }))
          notify('解除', `预警已解除：${warning.title}`, id, `/risk/warnings/${id}`)
          appendAudit({ operator: '尹晨阳', organization: '集团监管部', action: '解除预警', objectType: '预警', objectId: id, summary: `${reason}；证据：${evidence}`, result: '成功', risk: '高危' })
          return { ok: true, message: '预警已解除，相关待办已关闭' }
        },
        escalateWarning: (id, owner, dueAt, requirement, reason = '') => {
          const warning = get().warnings.find((item) => item.id === id)
          if (!warning) return { ok: false, message: '预警不存在' }
          const existing = get().riskEvents.find((item) => item.warningId === id)
          if (existing) return { ok: true, message: `该预警已升级为风险事件${existing.id}`, objectId: existing.id }
          if (warning.status !== '待研判') return { ok: false, message: '当前预警已完成处置，不能重复升级' }
          if (!owner || !dueAt || requirement.trim().length < 8) return { ok: false, message: '请选择整改责任人，并填写完成时限和明确整改要求' }
          const riskReason = reason.trim() || '未填写'
          const eventId = `RE-${todayCode()}-${String(get().riskEvents.length + 10).padStart(3, '0')}`
          const event: RiskEvent = { id: eventId, warningId: warning.id, title: warning.title, level: warning.level, scene: warning.scene, target: warning.target, organization: warning.organization, owner, rectificationOwner: owner, status: '待整改', dueAt, overdue: false, updatedAt: '刚刚' }
          set((state) => ({
            warnings: state.warnings.map((item) => item.id === id ? { ...item, status: '已升级', updatedAt: '刚刚' } : item),
            riskEvents: [event, ...state.riskEvents],
            todos: [{ id: `TODO-${eventId}`, title: `整改：${event.title}`, objectType: '事件', level: event.level, status: '待整改', dueAt, owner, timeState: '正常', route: `/risk/events/${eventId}` }, ...state.todos.filter((todo) => !todo.route.endsWith(id))],
          }))
          notify('升级', `预警已升级为风险事件${eventId}，等待${owner}整改`, eventId, `/risk/events/${eventId}`)
          appendAudit({ operator: '尹晨阳', organization: '集团监管部', action: '升级风险事件', objectType: '预警', objectId: id, summary: `生成${eventId}；整改责任人：${owner}；完成时限：${dueAt}；整改要求：${requirement}；风险确认：${riskReason}`, result: '成功', risk: '高危' })
          return { ok: true, message: `已升级为风险事件${eventId}，进入待整改`, objectId: eventId }
        },
        transferRiskEvent: (id, owner, reason = '') => {
          if (!owner) return { ok: false, message: '请选择新处理人' }
          const transferReason = reason.trim() || '未填写'
          const event = get().riskEvents.find((item) => item.id === id)
          if (!event || event.status === '已关闭') return { ok: false, message: '当前风险事件不能转派' }
          if (event.owner === owner) return { ok: false, message: '新处理人不能与当前处理人相同' }
          const oldOwner = event.owner
          set((state) => ({
            riskEvents: state.riskEvents.map((item) => item.id === id ? { ...item, owner, rectificationOwner: item.status === '待整改' ? owner : item.rectificationOwner, updatedAt: '刚刚' } : item),
            todos: state.todos.map((todo) => todo.route.endsWith(id) ? { ...todo, owner } : todo),
          }))
          notify('转派', `风险事件已由${oldOwner}转派给${owner}：${event.title}`, id, `/risk/events/${id}`)
          appendAudit({ operator: '尹晨阳', organization: '集团监管部', action: '转派风险事件', objectType: '风险事件', objectId: id, summary: `${oldOwner} → ${owner}；原因：${transferReason}`, result: '成功', risk: '高危' })
          return { ok: true, message: `风险事件已转派给${owner}` }
        },
        submitRectification: (id, result, measures = '', materials = []) => {
          if (!result) return { ok: false, message: '请选择整改结果' }
          const rectificationMeasures = measures.trim() || '未填写'
          if (['已完成', '部分完成'].includes(result) && materials.length === 0) return { ok: false, message: '整改完成或部分完成时至少需要一项证明材料' }
          const event = get().riskEvents.find((item) => item.id === id)
          if (!event || event.status !== '待整改') return { ok: false, message: '当前事件不在待整改状态' }
          const reviewer = '尹晨阳'
          set((state) => ({
            riskEvents: state.riskEvents.map((item) => item.id === id ? { ...item, status: '待复核', rectificationOwner: event.owner, owner: reviewer, updatedAt: '刚刚' } : item),
            todos: [{ id: `TODO-${id}-REVIEW`, title: `复核：${event.title}`, objectType: '事件', level: event.level, status: '待复核', dueAt: '明天 18:00', owner: reviewer, timeState: '正常', route: `/risk/events/${id}` }, ...state.todos.filter((todo) => !todo.route.endsWith(id))],
          }))
          notify('整改', `${event.owner}已提交整改结果，等待${reviewer}复核`, id, `/risk/events/${id}`)
          appendAudit({ operator: event.owner, organization: event.organization, action: '提交整改', objectType: '风险事件', objectId: id, summary: `${result}；材料${materials.length}项；措施：${rectificationMeasures}`, result: '成功', risk: '普通' })
          return { ok: true, message: '整改结果已提交，事件进入待复核' }
        },
        reviewRiskEvent: (id, result, reason, evidence) => {
          if (!reason.trim()) return { ok: false, message: '复核说明不能为空' }
          if ((result === '通过' || result === '不成立关闭') && !evidence.trim()) return { ok: false, message: '关闭风险事件必须引用至少一项证据' }
          const event = get().riskEvents.find((item) => item.id === id)
          if (!event || event.status !== '待复核') return { ok: false, message: '当前事件不在待复核状态' }
          const returnedOwner = event.rectificationOwner || event.owner
          const nextStatus = result === '退回整改' ? '待整改' : '已关闭'
          set((state) => ({
            riskEvents: state.riskEvents.map((item) => item.id === id ? { ...item, status: nextStatus, owner: result === '退回整改' ? returnedOwner : item.owner, updatedAt: '刚刚' } : item),
            todos: result === '退回整改'
              ? [{ id: `TODO-${id}-RECTIFY`, title: `整改：${event.title}`, objectType: '事件', level: event.level, status: '待整改', dueAt: '明天 18:00', owner: returnedOwner, timeState: '正常', route: `/risk/events/${id}` }, ...state.todos.filter((todo) => !todo.route.endsWith(id))]
              : state.todos.filter((todo) => !todo.route.endsWith(id)),
          }))
          notify(result === '退回整改' ? '退回' : '复核', result === '退回整改' ? `${event.title}已退回${returnedOwner}继续整改` : `${event.title}复核完成，事件已关闭`, id, `/risk/events/${id}`)
          appendAudit({ operator: event.owner, organization: '集团监管部', action: result === '退回整改' ? '退回整改' : '复核关闭', objectType: '风险事件', objectId: id, summary: `${reason}；证据：${evidence || '—'}`, result: '成功', risk: '高危' })
          return { ok: true, message: result === '退回整改' ? '已退回责任人继续整改' : '风险事件已关闭，闭环完成' }
        },
        updateWarning: (id, status, owner) => set((state) => ({ warnings: state.warnings.map((item) => item.id === id ? { ...item, status, owner: owner || item.owner, updatedAt: '刚刚' } : item) })),
        updateRiskEvent: (id, status, owner) => set((state) => ({ riskEvents: state.riskEvents.map((item) => item.id === id ? { ...item, status, owner: owner || item.owner, updatedAt: '刚刚' } : item) })),
        createScene: (payload) => {
          const id = `SCENE-${String(get().scenes.length + 1).padStart(3, '0')}`
          const scene: SceneItem = { id, ...payload, rules: 0, version: 'v0.1', status: '草稿', updatedBy: '尹晨阳', updatedAt: '刚刚' }
          set((state) => ({ scenes: [scene, ...state.scenes] }))
          appendAudit({ operator: '尹晨阳', organization: '集团监管部', action: '新建风险场景', objectType: '风险场景', objectId: id, summary: payload.name, result: '成功', risk: '普通' })
          return id
        },
        updateScene: (id, patch) => {
          const scene = get().scenes.find((item) => item.id === id)
          if (!scene || scene.status === '已发布') return { ok: false, message: '已发布场景不可直接编辑，请复制新版本' }
          set((state) => ({ scenes: state.scenes.map((item) => item.id === id ? { ...item, ...patch, updatedBy: '尹晨阳', updatedAt: '刚刚' } : item) }))
          appendAudit({ operator: '尹晨阳', organization: '集团监管部', action: '保存场景草稿', objectType: '风险场景', objectId: id, summary: `修改字段：${Object.keys(patch).join('、')}`, result: '成功', risk: '普通' })
          return { ok: true, message: '场景草稿已保存' }
        },
        copyScene: (id) => {
          const scene = get().scenes.find((item) => item.id === id)
          if (!scene) return { ok: false, message: '场景不存在' }
          const next = { ...scene, id: `${scene.id}-DRAFT`, version: `v${Number(scene.version.slice(1).split('.')[0]) + 1}.0`, status: '草稿' as const, updatedBy: '尹晨阳', updatedAt: '刚刚' }
          set((state) => ({ scenes: [next, ...state.scenes.filter((item) => item.id !== next.id)] }))
          return { ok: true, message: `已复制为${next.version}草稿`, objectId: next.id }
        },
        publishScene: (id) => {
          const scene = get().scenes.find((item) => item.id === id)
          if (!scene || scene.rules < 1) return { ok: false, message: '场景至少需要一条启用规则才能发布' }
          set((state) => ({ scenes: state.scenes.map((item) => item.id === id ? { ...item, status: '已发布', updatedBy: '尹晨阳', updatedAt: '刚刚' } : item) }))
          appendAudit({ operator: '尹晨阳', organization: '集团监管部', action: '发布场景版本', objectType: '风险场景', objectId: id, summary: `${scene.name} ${scene.version}`, result: '成功', risk: '高危' })
          return { ok: true, message: '场景版本已发布' }
        },
        stopScene: (id, reason) => {
          if (!reason.trim()) return { ok: false, message: '停用原因不能为空' }
          set((state) => ({ scenes: state.scenes.map((item) => item.id === id ? { ...item, status: '已停用', updatedAt: '刚刚' } : item) }))
          appendAudit({ operator: '尹晨阳', organization: '集团监管部', action: '停用场景', objectType: '风险场景', objectId: id, summary: reason, result: '成功', risk: '高危' })
          return { ok: true, message: '场景已停用，历史引用继续保留' }
        },
        copyOntology: (id) => {
          const item = get().ontologies.find((row) => row.id === id)
          if (!item) return { ok: false, message: '图谱结构不存在' }
          const next = { ...item, id: `${id}-DRAFT`, version: `v${Number(item.version.slice(1).split('.')[0]) + 1}.0`, status: '草稿' as const, updatedAt: '刚刚' }
          set((state) => ({ ontologies: [next, ...state.ontologies.filter((row) => row.id !== next.id)] }))
          return { ok: true, message: '图谱结构新草稿版本已创建', objectId: next.id }
        },
        publishOntology: (id) => {
          set((state) => ({ ontologies: state.ontologies.map((row) => row.id === id ? { ...row, status: '已发布', updatedAt: '刚刚' } : row) }))
          appendAudit({ operator: '陈洁', organization: '数据管理部', action: '发布图谱结构版本', objectType: '图谱结构', objectId: id, summary: '类、属性、关系和事件校验通过', result: '成功', risk: '高危' })
          return { ok: true, message: '图谱结构版本已发布' }
        },
        createDataSource: (payload) => {
          const id = `SRC-${String(get().dataSources.length + 1).padStart(3, '0')}`
          set((state) => ({ dataSources: [{ id, ...payload, lastSuccess: '未同步', status: '草稿' }, ...state.dataSources] }))
          appendAudit({ operator: '陈洁', organization: '数据管理部', action: '新建数据源', objectType: '数据源', objectId: id, summary: payload.name, result: '成功', risk: '普通' })
          return id
        },
        testDataSource: (id) => {
          const source = get().dataSources.find((item) => item.id === id)
          if (!source) return { ok: false, message: '数据源不存在' }
          set((state) => ({ dataSources: state.dataSources.map((item) => item.id === id ? { ...item, status: item.status === '异常' ? '草稿' : item.status } : item) }))
          appendAudit({ operator: '陈洁', organization: '数据管理部', action: '测试数据源连接', objectType: '数据源', objectId: id, summary: '连接成功，耗时86ms', result: '成功', risk: '普通' })
          return { ok: true, message: '连接测试成功，耗时86ms' }
        },
        toggleDataSource: (id, enabled) => {
          set((state) => ({ dataSources: state.dataSources.map((item) => item.id === id ? { ...item, status: enabled ? '启用' : '停用' } : item) }))
          appendAudit({ operator: '陈洁', organization: '数据管理部', action: enabled ? '启用数据源' : '停用数据源', objectType: '数据源', objectId: id, summary: enabled ? '映射校验通过' : '已确认影响范围', result: '成功', risk: '高危' })
          return { ok: true, message: enabled ? '数据源已启用' : '数据源已停用' }
        },
        publishGraph: (id) => {
          const graph = get().graphVersions.find((item) => item.id === id)
          if (!graph || graph.blockers > 0) return { ok: false, message: `存在${graph?.blockers || 0}个阻断问题，不能发布` }
          set((state) => ({ graphVersions: state.graphVersions.map((item) => item.id === id ? { ...item, status: '已发布', publishedAt: '刚刚' } : item) }))
          appendAudit({ operator: '陈洁', organization: '数据管理部', action: '发布知识图谱', objectType: '知识图谱', objectId: id, summary: '质量校验通过', result: '成功', risk: '高危' })
          return { ok: true, message: '知识图谱发布成功' }
        },
        governEntity: (taskId, result, reason) => {
          if (!reason.trim()) return { ok: false, message: '处理原因不能为空' }
          appendAudit({ operator: '陈洁', organization: '数据管理部', action: `实例${result}`, objectType: '实例处理任务', objectId: taskId, summary: reason, result: '成功', risk: '高危' })
          return { ok: true, message: `实例${result}完成，影响记录已生成` }
        },
        createUser: (payload) => {
          if (!payload.name.trim() || !payload.account.trim() || !payload.organization.trim()) return { ok: false, message: '请填写姓名、账号和所属组织' }
          if (get().users.some((item) => item.account.toLowerCase() === payload.account.trim().toLowerCase())) return { ok: false, message: '用户账号已存在' }
          const id = 'U-' + Date.now().toString(36).toUpperCase()
          const user: UserItem = { ...payload, id, name: payload.name.trim(), account: payload.account.trim(), position: payload.position.trim() || '普通员工', todos: 0, lastLogin: '从未登录' }
          set((state) => ({ users: [user, ...state.users] }))
          appendAudit({ operator: '安全管理员', organization: '信息化部', action: '新建用户', objectType: '用户', objectId: id, summary: user.name + ' / ' + user.account + ' / ' + user.organization, result: '成功', risk: '高危' })
          return { ok: true, message: '用户已创建，可继续分配角色和账号状态', objectId: id }
        },
        updateUser: (id, patch) => {
          const user = get().users.find((item) => item.id === id)
          if (!user) return { ok: false, message: '用户不存在' }
          if (patch.status === '停用' && user.todos > 0) return { ok: false, message: `该用户存在${user.todos}项未完成待办，请先转派` }
          set((state) => ({ users: state.users.map((item) => item.id === id ? { ...item, ...patch } : item) }))
          appendAudit({ operator: '安全管理员', organization: '信息化部', action: '更新用户', objectType: '用户', objectId: id, summary: `修改：${Object.keys(patch).join('、')}`, result: '成功', risk: '高危' })
          return { ok: true, message: '用户信息已保存' }
        },
        deleteUser: (id) => {
          const user = get().users.find((item) => item.id === id)
          if (!user) return { ok: false, message: '用户不存在' }
          if (user.todos > 0) return { ok: false, message: '该用户仍有未完成待办，请先完成转派' }
          if (user.lastLogin !== '从未登录') return { ok: false, message: '已产生登录与操作记录的用户不能删除，请改为停用账号' }
          set((state) => ({ users: state.users.filter((item) => item.id !== id) }))
          appendAudit({ operator: '安全管理员', organization: '信息化部', action: '删除未启用用户', objectType: '用户', objectId: id, summary: `${user.name} / ${user.account}`, result: '成功', risk: '高危' })
          return { ok: true, message: '未登录用户已删除' }
        },
        transferUserTodos: (id, owner, reason = '') => {
          const user = get().users.find((item) => item.id === id)
          if (!user || !owner) return { ok: false, message: '请选择接收人' }
          const transferReason = reason.trim() || '未填写'
          set((state) => ({ users: state.users.map((item) => item.id === id ? { ...item, todos: 0 } : item), todos: state.todos.map((todo) => todo.owner === user.name ? { ...todo, owner } : todo) }))
          appendAudit({ operator: '安全管理员', organization: '信息化部', action: '批量转派用户待办', objectType: '用户', objectId: id, summary: `${user.name} → ${owner}；原因：${transferReason}`, result: '成功', risk: '高危' })
          return { ok: true, message: `${user.todos}项待办已转派给${owner}` }
        },
        createRole: (payload) => {
          const id = payload.id.trim().toUpperCase()
          if (!payload.name.trim() || !id) return { ok: false, message: '请填写角色名称和角色编码' }
          if (!/^[A-Z0-9_-]{3,40}$/.test(id)) return { ok: false, message: '角色编码只能包含大写字母、数字、下划线和中划线' }
          if (get().roles.some((item) => item.id === id || item.name === payload.name.trim())) return { ok: false, message: '角色名称或编码已存在' }
          const role: RoleItem = { id, name: payload.name.trim(), type: '自定义', users: 0, scope: payload.scope || '当前组织', status: '草稿', permissions: payload.permissions || [], updatedAt: '刚刚' }
          set((state) => ({ roles: [role, ...state.roles] }))
          appendAudit({ operator: '安全管理员', organization: '信息化部', action: '新建角色', objectType: '角色', objectId: id, summary: role.name + ' / ' + role.scope, result: '成功', risk: '高危' })
          return { ok: true, message: '角色草稿已创建，请继续配置权限', objectId: id }
        },
        updateRole: (id, permissions) => {
          set((state) => ({ roles: state.roles.map((item) => item.id === id ? { ...item, permissions, updatedAt: '刚刚' } : item) }))
          appendAudit({ operator: '安全管理员', organization: '信息化部', action: '调整角色权限', objectType: '角色', objectId: id, summary: `权限项：${permissions.join('、')}`, result: '成功', risk: '高危' })
          return { ok: true, message: '角色权限已保存并即时生效' }
        },
        deleteRole: (id) => {
          const role = get().roles.find((item) => item.id === id)
          if (!role) return { ok: false, message: '角色不存在' }
          if (role.type !== '自定义') return { ok: false, message: '预置角色不能删除' }
          if (role.users > 0) return { ok: false, message: `该角色仍分配给${role.users}名用户，请先解除角色分配` }
          if (get().currentRole === role.name) return { ok: false, message: '当前正在使用该角色，请先切换到其他角色' }
          set((state) => ({ roles: state.roles.filter((item) => item.id !== id) }))
          appendAudit({ operator: '安全管理员', organization: '信息化部', action: '删除自定义角色', objectType: '角色', objectId: id, summary: role.name, result: '成功', risk: '高危' })
          return { ok: true, message: '自定义角色已删除' }
        },
        addAudit: appendAudit,
        resetWorkflow: () => set({ warnings: [], warningSource: 'local', riskEvents: [], messages: [], todos: [] }),
      }
    },
    {
      name: 'penetrative-supervision-demo-v2',
      version: 10,
      migrate: (persistedState) => {
        const state = persistedState as { warnings?: Warning[]; riskEvents?: RiskEvent[]; todos?: LegacyTodoItem[]; messages?: WorkMessage[]; roles?: RoleItem[] } & Record<string, unknown>
        const warnings = ensureWarningLevelCoverage((state.warnings || initialWarnings).map((item) => ({ ...item, status: ['已解除', '已升级'].includes(item.status) ? item.status : '待研判' as Warning['status'] })))
        const riskEvents = (state.riskEvents || initialRiskEvents).map((item) => {
          const status: RiskEvent['status'] = item.status === '待复核' || item.status === '已关闭' ? item.status : '待整改'
          const missingRectificationOwner = status === '待复核' && !item.rectificationOwner
          return {
            ...item,
            status,
            owner: missingRectificationOwner ? '尹晨阳' : item.owner,
            rectificationOwner: item.rectificationOwner || item.owner,
          }
        })
        const normalizedMessages = (state.messages || initialMessages).map((item) => {
          if (item.route.includes('/risk/warnings/')) {
            return {
              ...item,
              type: item.type === '退回' ? '转派' : item.type,
              title: item.title
                .replace('核查材料被退回补充', '预警已转派，请继续研判')
                .replace('复核任务', '研判任务')
                .replace('核查任务', '研判任务'),
            }
          }
          return { ...item, title: item.title.replace('核查整改', '整改').replace('核查材料', '整改材料') }
        })
        const messages = ensureWorkbenchUnreadMessages(normalizedMessages, warnings)
        const roles = (state.roles || initialRoles).map((role) => {
          const permissions = (role.permissions || []).map((permission) => permission === 'menu.system.vertical_models' ? 'menu.system.models' : permission)
          const shouldAddModelMenu = (
            role.name === '监管负责人' && permissions.includes('menu.system.users') && permissions.includes('menu.system.roles') && permissions.includes('menu.system.audit')
          ) || (
            role.name === '采购应用管理员' && permissions.includes('menu.procurement.overview') && permissions.includes('menu.system.audit')
          )
          return shouldAddModelMenu && !permissions.includes('menu.system.models')
            ? { ...role, permissions: [...permissions, 'menu.system.models'] }
            : { ...role, permissions }
        })
        const previousTodos = new Map((state.todos || initialTodos).map(normalizeTodo).map((item) => [item.route, item]))
        const warningTodos: TodoItem[] = warnings.filter((item) => item.status === '待研判').map((item) => {
          const route = `/risk/warnings/${item.id}`
          const previous = previousTodos.get(route)
          return { id: previous?.id || `TODO-${item.id}`, title: `研判：${item.title}`, objectType: '预警', level: item.level, status: '待研判', dueAt: item.expectedAt, owner: item.owner, timeState: isPastDue(item.expectedAt) ? '已逾期' : '正常', route }
        })
        const eventTodos: TodoItem[] = riskEvents.filter((item) => item.status !== '已关闭').map((item) => {
          const route = `/risk/events/${item.id}`
          const previous = previousTodos.get(route)
          return { id: previous?.id || `TODO-${item.id}`, title: `${item.status === '待复核' ? '复核' : '整改'}：${item.title}`, objectType: '事件', level: item.level, status: item.status === '待复核' ? '待复核' : '待整改', dueAt: item.dueAt, owner: item.owner, timeState: item.overdue ? '已逾期' : '正常', route }
        })
        return { ...state, warnings, riskEvents, messages, todos: [...warningTodos, ...eventTodos], roles } as unknown as AppState
      },
      partialize: ({ toast: _toast, ...state }) => state,
    },
  ),
)

