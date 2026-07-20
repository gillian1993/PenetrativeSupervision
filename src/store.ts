import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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
  setScope: (scope: string) => void
  setCurrentRole: (role: string) => void
  markMessageRead: (id: string) => void
  markMessageUnread: (id: string) => void
  markAllMessagesRead: () => void
  transferTodo: (id: string, owner: string, reason: string) => OperationResult
  assignWarning: (id: string, owner: string, dueAt: string, requirement: string) => OperationResult
  observeWarning: (id: string, reason: string, followAt: string) => OperationResult
  releaseWarning: (id: string, reason: string, evidence: string) => OperationResult
  submitVerification: (id: string, conclusion: string, facts: string, materials: string[]) => OperationResult
  reviewWarning: (id: string, result: '退回补充' | '持续观察' | '解除预警' | '升级风险事件', reason: string) => OperationResult
  escalateWarning: (id: string, reason?: string) => string
  assignRiskEvent: (id: string, owner: string, dueAt: string, requirement: string) => OperationResult
  transferRiskEvent: (id: string, owner: string, reason: string) => OperationResult
  submitRectification: (id: string, result: string, measures: string, materials: string[]) => OperationResult
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
  createDataSource: (payload: Pick<DataSourceItem, 'name' | 'mode' | 'range' | 'owner' | 'syncMode'>) => string
  testDataSource: (id: string) => OperationResult
  toggleDataSource: (id: string, enabled: boolean) => OperationResult
  publishGraph: (id: string) => OperationResult
  governEntity: (taskId: string, result: '合并' | '保持独立' | '拆分', reason: string) => OperationResult
  updateUser: (id: string, patch: Partial<UserItem>) => OperationResult
  createUser: (payload: Pick<UserItem, 'name' | 'account' | 'organization' | 'position' | 'roles' | 'status'>) => OperationResult
  transferUserTodos: (id: string, owner: string, reason: string) => OperationResult
  updateRole: (id: string, permissions: string[]) => OperationResult
  createRole: (payload: Pick<RoleItem, 'id' | 'name' | 'scope'> & { permissions?: string[] }) => OperationResult
  addAudit: (entry: Omit<AuditItem, 'id' | 'time' | 'traceId'>) => void
  resetDemo: () => void
}

const timestamp = () => new Date().toLocaleString('zh-CN', { hour12: false }).replaceAll('/', '-')
const traceId = () => `trace-${Math.random().toString(16).slice(2, 10)}`
const todayCode = () => new Date().toISOString().slice(0, 10).replaceAll('-', '')

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
        setScope: (currentScope) => {
          set({ currentScope })
          appendAudit({ operator: '赵明', organization: '集团监管部', action: '切换监管范围', objectType: '组织', objectId: currentScope, summary: `切换监管范围为${currentScope}`, result: '成功', risk: '普通' })
        },
        setCurrentRole: (currentRole) => {
          set({ currentRole })
          appendAudit({ operator: '赵明', organization: '集团监管部', action: '切换当前角色', objectType: '角色', objectId: currentRole, summary: `切换当前角色为${currentRole}`, result: '成功', risk: '敏感访问' })
        },
        markMessageRead: (id) => set((state) => ({ messages: state.messages.map((item) => item.id === id ? { ...item, unread: false } : item) })),
        markMessageUnread: (id) => set((state) => ({ messages: state.messages.map((item) => item.id === id ? { ...item, unread: true } : item) })),
        markAllMessagesRead: () => set((state) => ({ messages: state.messages.map((item) => ({ ...item, unread: false })) })),
        transferTodo: (id, owner, reason) => {
          if (!owner || !reason.trim()) return { ok: false, message: '请选择新处理人并填写转派原因' }
          const todo = get().todos.find((item) => item.id === id)
          if (!todo) return { ok: false, message: '待办已被他人处理，请刷新后重试' }
          const oldOwner = todo.owner
          set((state) => ({ todos: state.todos.map((item) => item.id === id ? { ...item, owner } : item) }))
          notify('派发', `${todo.title}已转派给${owner}`, id, todo.route)
          appendAudit({ operator: '赵明', organization: '集团监管部', action: '转派待办', objectType: todo.type, objectId: id, summary: `${oldOwner} → ${owner}；原因：${reason}`, result: '成功', risk: '高危' })
          return { ok: true, message: `待办已转派给${owner}` }
        },
        assignWarning: (id, owner, dueAt, requirement) => {
          if (!owner || !dueAt || requirement.trim().length < 8) return { ok: false, message: '责任人、完成时限和明确核查要求均为必填项' }
          const warning = get().warnings.find((item) => item.id === id)
          if (!warning || ['已解除', '已升级'].includes(warning.status)) return { ok: false, message: '预警状态已变化，当前不能派发核查' }
          set((state) => ({
            warnings: state.warnings.map((item) => item.id === id ? { ...item, status: '核查中', owner, updatedAt: '刚刚' } : item),
            todos: [{ id: `TODO-${Date.now()}`, title: `核查：${warning.title}`, type: '核查任务', level: warning.level, stage: '核查中', dueAt, owner, timeState: '正常', route: `/risk/warnings/${id}` }, ...state.todos.filter((todo) => !todo.route.endsWith(id))],
          }))
          notify('派发', `收到预警核查任务：${warning.title}`, id, `/risk/warnings/${id}`)
          appendAudit({ operator: '赵明', organization: '集团监管部', action: '派发核查', objectType: '预警', objectId: id, summary: `责任人：${owner}；要求：${requirement}`, result: '成功', risk: '高危' })
          return { ok: true, message: `核查任务已派发给${owner}` }
        },
        observeWarning: (id, reason, followAt) => {
          if (!reason.trim() || !followAt) return { ok: false, message: '观察原因和下次关注时间不能为空' }
          set((state) => ({ warnings: state.warnings.map((item) => item.id === id ? { ...item, status: '持续观察', updatedAt: '刚刚' } : item) }))
          closeTodos(id)
          notify('预警', `预警已转入持续观察，下次关注：${followAt}`, id, `/risk/warnings/${id}`)
          appendAudit({ operator: '赵明', organization: '集团监管部', action: '持续观察', objectType: '预警', objectId: id, summary: `${reason}；下次关注：${followAt}`, result: '成功', risk: '高危' })
          return { ok: true, message: '预警已转入持续观察' }
        },
        releaseWarning: (id, reason, evidence) => {
          const warning = get().warnings.find((item) => item.id === id)
          if (!warning) return { ok: false, message: '预警不存在' }
          if (['重大', '高'].includes(warning.level) && get().currentRole !== '监管负责人') return { ok: false, message: '重大和高风险预警仅监管负责人可以解除' }
          if (!reason.trim() || !evidence.trim()) return { ok: false, message: '解除原因和引用证据均为必填项' }
          set((state) => ({ warnings: state.warnings.map((item) => item.id === id ? { ...item, status: '已解除', updatedAt: '刚刚' } : item) }))
          closeTodos(id)
          notify('复核', `预警已解除：${warning.title}`, id, `/risk/warnings/${id}`)
          appendAudit({ operator: '赵明', organization: '集团监管部', action: '解除预警', objectType: '预警', objectId: id, summary: `${reason}；证据：${evidence}`, result: '成功', risk: '高危' })
          return { ok: true, message: '预警已解除，规则效果样本已生成' }
        },
        submitVerification: (id, conclusion, facts, materials) => {
          if (!conclusion || facts.trim().length < 10) return { ok: false, message: '请选择核查结论并填写完整事实说明' }
          if ((conclusion === '风险不存在' || conclusion === '暂无法判断') && materials.length === 0) return { ok: false, message: '当前结论至少需要一项补充材料' }
          const warning = get().warnings.find((item) => item.id === id)
          if (!warning || warning.status !== '核查中') return { ok: false, message: '核查任务状态已变化，请刷新页面' }
          set((state) => ({
            warnings: state.warnings.map((item) => item.id === id ? { ...item, status: '待复核', updatedAt: '刚刚' } : item),
            todos: [{ id: `TODO-${Date.now()}`, title: `复核：${warning.title}`, type: '整改复核', level: warning.level, stage: '待复核', dueAt: '明天 18:00', owner: '赵明', timeState: '正常', route: `/risk/warnings/${id}` }, ...state.todos.filter((todo) => !todo.route.endsWith(id))],
          }))
          notify('整改', `${warning.owner}已提交核查反馈，等待监管复核`, id, `/risk/warnings/${id}`)
          appendAudit({ operator: warning.owner, organization: warning.organization, action: '提交核查反馈', objectType: '核查任务', objectId: id, summary: `${conclusion}；材料${materials.length}项`, result: '成功', risk: '普通' })
          return { ok: true, message: '核查反馈已提交，预警进入待复核' }
        },
        reviewWarning: (id, result, reason) => {
          if (!reason.trim()) return { ok: false, message: '复核说明不能为空' }
          const warning = get().warnings.find((item) => item.id === id)
          if (!warning || warning.status !== '待复核') return { ok: false, message: '预警不是待复核状态' }
          if (result === '退回补充') {
            set((state) => ({ warnings: state.warnings.map((item) => item.id === id ? { ...item, status: '核查中', updatedAt: '刚刚' } : item), todos: [{ id: `TODO-${Date.now()}`, title: `补充核查：${warning.title}`, type: '核查任务', level: warning.level, stage: '核查中', dueAt: '明天 18:00', owner: warning.owner, timeState: '正常', route: `/risk/warnings/${id}` }, ...state.todos.filter((todo) => !todo.route.endsWith(id))] }))
            notify('退回', `核查反馈被退回补充：${reason}`, id, `/risk/warnings/${id}`)
          } else if (result === '持续观察') {
            get().observeWarning(id, reason, '三天后 09:00')
          } else if (result === '解除预警') {
            return get().releaseWarning(id, reason, '核查反馈及补充材料')
          } else {
            const eventId = get().escalateWarning(id, reason)
            return { ok: true, message: `已升级为风险事件${eventId}`, objectId: eventId }
          }
          appendAudit({ operator: '赵明', organization: '集团监管部', action: result, objectType: '预警', objectId: id, summary: reason, result: '成功', risk: '高危' })
          return { ok: true, message: result === '退回补充' ? '已退回原责任人补充' : '复核完成' }
        },
        escalateWarning: (id, reason = '经监管研判确认风险') => {
          const warning = get().warnings.find((item) => item.id === id)
          if (!warning) return ''
          const existing = get().riskEvents.find((item) => item.warningId === id)
          if (existing) return existing.id
          const eventId = `RE-${todayCode()}-${String(get().riskEvents.length + 10).padStart(3, '0')}`
          const event: RiskEvent = { id: eventId, warningId: warning.id, title: warning.title, level: warning.level, scene: warning.scene, target: warning.target, organization: warning.organization, owner: '', status: '待派发', dueAt: '2026-07-24 18:00', overdue: false, updatedAt: '刚刚' }
          set((state) => ({ warnings: state.warnings.map((item) => item.id === id ? { ...item, status: '已升级', updatedAt: '刚刚' } : item), riskEvents: [event, ...state.riskEvents], todos: [{ id: `TODO-${Date.now()}`, title: `派发风险事件：${event.title}`, type: '风险事件', level: event.level, stage: '待处理', dueAt: '今天 18:00', owner: '赵明', timeState: '正常', route: `/risk/events/${eventId}` }, ...state.todos.filter((todo) => !todo.route.endsWith(id))] }))
          notify('预警', `预警已升级为风险事件${eventId}`, id, `/risk/events/${eventId}`)
          appendAudit({ operator: '赵明', organization: '集团监管部', action: '升级风险事件', objectType: '预警', objectId: id, summary: reason, result: '成功', risk: '高危' })
          return eventId
        },
        assignRiskEvent: (id, owner, dueAt, requirement) => {
          if (!owner || !dueAt || requirement.trim().length < 8) return { ok: false, message: '责任人、时限和整改要求均为必填项' }
          const event = get().riskEvents.find((item) => item.id === id)
          if (!event || event.status !== '待派发') return { ok: false, message: '风险事件状态已变化' }
          set((state) => ({ riskEvents: state.riskEvents.map((item) => item.id === id ? { ...item, status: '核查整改中', owner, dueAt, updatedAt: '刚刚' } : item), todos: [{ id: `TODO-${Date.now()}`, title: `整改：${event.title}`, type: '风险事件', level: event.level, stage: '核查整改中', dueAt, owner, timeState: '正常', route: `/risk/events/${id}` }, ...state.todos.filter((todo) => !todo.route.endsWith(id))] }))
          notify('派发', `收到风险事件整改任务：${event.title}`, id, `/risk/events/${id}`)
          appendAudit({ operator: '赵明', organization: '集团监管部', action: '派发风险事件', objectType: '风险事件', objectId: id, summary: `${owner}；${requirement}`, result: '成功', risk: '高危' })
          return { ok: true, message: `风险事件已派发给${owner}` }
        },
        transferRiskEvent: (id, owner, reason) => {
          if (!owner || !reason.trim()) return { ok: false, message: '请选择新责任人并填写转派原因' }
          const event = get().riskEvents.find((item) => item.id === id)
          if (!event || event.status !== '核查整改中') return { ok: false, message: '当前状态不能转派' }
          const oldOwner = event.owner
          set((state) => ({ riskEvents: state.riskEvents.map((item) => item.id === id ? { ...item, owner, updatedAt: '刚刚' } : item), todos: state.todos.map((todo) => todo.route.endsWith(id) ? { ...todo, owner } : todo) }))
          notify('派发', `${event.title}已转派给${owner}`, id, `/risk/events/${id}`)
          appendAudit({ operator: '赵明', organization: '集团监管部', action: '转派风险事件', objectType: '风险事件', objectId: id, summary: `${oldOwner} → ${owner}；${reason}`, result: '成功', risk: '高危' })
          return { ok: true, message: '风险事件转派成功' }
        },
        submitRectification: (id, result, measures, materials) => {
          if (!result || measures.trim().length < 10) return { ok: false, message: '整改结果和整改措施不能为空' }
          if (['已完成', '部分完成'].includes(result) && materials.length === 0) return { ok: false, message: '整改完成或部分完成时至少需要一项证明材料' }
          const event = get().riskEvents.find((item) => item.id === id)
          if (!event || event.status !== '核查整改中') return { ok: false, message: '风险事件状态已变化' }
          set((state) => ({ riskEvents: state.riskEvents.map((item) => item.id === id ? { ...item, status: '待复核', updatedAt: '刚刚' } : item), todos: [{ id: `TODO-${Date.now()}`, title: `复核整改：${event.title}`, type: '整改复核', level: event.level, stage: '待复核', dueAt: '明天 18:00', owner: '赵明', timeState: '正常', route: `/risk/events/${id}` }, ...state.todos.filter((todo) => !todo.route.endsWith(id))] }))
          notify('整改', `${event.owner}已提交整改结果，等待复核`, id, `/risk/events/${id}`)
          appendAudit({ operator: event.owner, organization: event.organization, action: '提交整改', objectType: '风险事件', objectId: id, summary: `${result}；材料${materials.length}项`, result: '成功', risk: '普通' })
          return { ok: true, message: '整改结果已提交，进入待复核' }
        },
        reviewRiskEvent: (id, result, reason, evidence) => {
          if (!reason.trim()) return { ok: false, message: '复核说明不能为空' }
          if ((result === '通过' || result === '不成立关闭') && !evidence.trim()) return { ok: false, message: '关闭风险事件必须引用至少一项证据' }
          const event = get().riskEvents.find((item) => item.id === id)
          if (!event || !['待复核', '待派发'].includes(event.status)) return { ok: false, message: '风险事件状态已变化' }
          const nextStatus = result === '退回整改' ? '核查整改中' : '已关闭'
          set((state) => ({ riskEvents: state.riskEvents.map((item) => item.id === id ? { ...item, status: nextStatus, updatedAt: '刚刚' } : item), todos: result === '退回整改' ? [{ id: `TODO-${Date.now()}`, title: `补充整改：${event.title}`, type: '风险事件', level: event.level, stage: '核查整改中', dueAt: '明天 18:00', owner: event.owner, timeState: '正常', route: `/risk/events/${id}` }, ...state.todos.filter((todo) => !todo.route.endsWith(id))] : state.todos.filter((todo) => !todo.route.endsWith(id)) }))
          notify(result === '退回整改' ? '退回' : '复核', `${event.title}：${result}`, id, `/risk/events/${id}`)
          appendAudit({ operator: '赵明', organization: '集团监管部', action: result === '退回整改' ? '退回整改' : '复核关闭', objectType: '风险事件', objectId: id, summary: `${reason}；证据：${evidence || '—'}`, result: '成功', risk: '高危' })
          return { ok: true, message: result === '退回整改' ? '已退回原责任人整改' : '风险事件已关闭，效果样本已生成' }
        },
        updateWarning: (id, status, owner) => set((state) => ({ warnings: state.warnings.map((item) => item.id === id ? { ...item, status, owner: owner || item.owner, updatedAt: '刚刚' } : item) })),
        updateRiskEvent: (id, status, owner) => set((state) => ({ riskEvents: state.riskEvents.map((item) => item.id === id ? { ...item, status, owner: owner || item.owner, updatedAt: '刚刚' } : item) })),
        createScene: (payload) => {
          const id = `SCENE-${String(get().scenes.length + 1).padStart(3, '0')}`
          const scene: SceneItem = { id, ...payload, rules: 0, version: 'v0.1', status: '草稿', updatedBy: '赵明', updatedAt: '刚刚' }
          set((state) => ({ scenes: [scene, ...state.scenes] }))
          appendAudit({ operator: '赵明', organization: '集团监管部', action: '新建风险场景', objectType: '风险场景', objectId: id, summary: payload.name, result: '成功', risk: '普通' })
          return id
        },
        updateScene: (id, patch) => {
          const scene = get().scenes.find((item) => item.id === id)
          if (!scene || scene.status === '已发布') return { ok: false, message: '已发布场景不可直接编辑，请复制新版本' }
          set((state) => ({ scenes: state.scenes.map((item) => item.id === id ? { ...item, ...patch, updatedBy: '赵明', updatedAt: '刚刚' } : item) }))
          appendAudit({ operator: '赵明', organization: '集团监管部', action: '保存场景草稿', objectType: '风险场景', objectId: id, summary: `修改字段：${Object.keys(patch).join('、')}`, result: '成功', risk: '普通' })
          return { ok: true, message: '场景草稿已保存' }
        },
        copyScene: (id) => {
          const scene = get().scenes.find((item) => item.id === id)
          if (!scene) return { ok: false, message: '场景不存在' }
          const next = { ...scene, id: `${scene.id}-DRAFT`, version: `v${Number(scene.version.slice(1).split('.')[0]) + 1}.0`, status: '草稿' as const, updatedBy: '赵明', updatedAt: '刚刚' }
          set((state) => ({ scenes: [next, ...state.scenes.filter((item) => item.id !== next.id)] }))
          return { ok: true, message: `已复制为${next.version}草稿`, objectId: next.id }
        },
        publishScene: (id) => {
          const scene = get().scenes.find((item) => item.id === id)
          if (!scene || scene.rules < 1) return { ok: false, message: '场景至少需要一条启用规则才能发布' }
          set((state) => ({ scenes: state.scenes.map((item) => item.id === id ? { ...item, status: '已发布', updatedBy: '赵明', updatedAt: '刚刚' } : item) }))
          appendAudit({ operator: '赵明', organization: '集团监管部', action: '发布场景版本', objectType: '风险场景', objectId: id, summary: `${scene.name} ${scene.version}`, result: '成功', risk: '高危' })
          return { ok: true, message: '场景版本已发布' }
        },
        stopScene: (id, reason) => {
          if (!reason.trim()) return { ok: false, message: '停用原因不能为空' }
          set((state) => ({ scenes: state.scenes.map((item) => item.id === id ? { ...item, status: '已停用', updatedAt: '刚刚' } : item) }))
          appendAudit({ operator: '赵明', organization: '集团监管部', action: '停用场景', objectType: '风险场景', objectId: id, summary: reason, result: '成功', risk: '高危' })
          return { ok: true, message: '场景已停用，历史引用继续保留' }
        },
        copyOntology: (id) => {
          const item = get().ontologies.find((row) => row.id === id)
          if (!item) return { ok: false, message: '本体不存在' }
          const next = { ...item, id: `${id}-DRAFT`, version: `v${Number(item.version.slice(1).split('.')[0]) + 1}.0`, status: '草稿' as const, updatedAt: '刚刚' }
          set((state) => ({ ontologies: [next, ...state.ontologies.filter((row) => row.id !== next.id)] }))
          return { ok: true, message: '本体新草稿版本已创建', objectId: next.id }
        },
        publishOntology: (id) => {
          set((state) => ({ ontologies: state.ontologies.map((row) => row.id === id ? { ...row, status: '已发布', updatedAt: '刚刚' } : row) }))
          appendAudit({ operator: '陈洁', organization: '数据管理部', action: '发布本体版本', objectType: '本体', objectId: id, summary: '类、属性、关系和事件校验通过', result: '成功', risk: '高危' })
          return { ok: true, message: '本体版本已发布' }
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
          appendAudit({ operator: '陈洁', organization: '数据管理部', action: '发布图谱版本', objectType: '图谱版本', objectId: id, summary: '质量校验通过', result: '成功', risk: '高危' })
          return { ok: true, message: '图谱版本发布成功' }
        },
        governEntity: (taskId, result, reason) => {
          if (!reason.trim()) return { ok: false, message: '治理原因不能为空' }
          appendAudit({ operator: '陈洁', organization: '数据管理部', action: `实体${result}`, objectType: '实体治理任务', objectId: taskId, summary: reason, result: '成功', risk: '高危' })
          return { ok: true, message: `实体${result}完成，影响记录已生成` }
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
        transferUserTodos: (id, owner, reason) => {
          const user = get().users.find((item) => item.id === id)
          if (!user || !owner || !reason.trim()) return { ok: false, message: '请选择接收人并填写转派原因' }
          set((state) => ({ users: state.users.map((item) => item.id === id ? { ...item, todos: 0 } : item), todos: state.todos.map((todo) => todo.owner === user.name ? { ...todo, owner } : todo) }))
          appendAudit({ operator: '安全管理员', organization: '信息化部', action: '批量转派用户待办', objectType: '用户', objectId: id, summary: `${user.name} → ${owner}；${reason}`, result: '成功', risk: '高危' })
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
        addAudit: appendAudit,
        resetDemo: () => set({ warnings: initialWarnings, riskEvents: initialRiskEvents, messages: initialMessages, todos: initialTodos, scenes: initialScenes, ontologies: initialOntologies, dataSources: initialDataSources, graphVersions: initialGraphVersions, users: initialUsers, roles: initialRoles, audits: initialAudits, currentScope: '中国电子云集团', currentRole: '监管负责人' }),
      }
    },
    {
      name: 'penetrative-supervision-demo-v2',
      partialize: ({ toast: _toast, ...state }) => state,
    },
  ),
)
