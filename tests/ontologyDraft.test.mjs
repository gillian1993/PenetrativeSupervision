import assert from 'node:assert/strict'
import test from 'node:test'
import { saveOntologyDraft } from '../ontologyDraft.js'

const element = (id, type, code, extra = {}) => ({ id, type, code, name: code, groupName: type === 'class' ? '未分组' : '', ownerCode: '', targetCode: '', dataType: type === 'class' ? '实体类型' : '文本', constraint: '', description: '', ...extra })

function fixture() {
  const original = { id: 'ONT-TEST', name: '模型', scope: '领域图谱模型', domain: '通用', description: '', status: '草稿', groups: ['未分组'], elements: [element('1', 'class', 'A'), element('2', 'class', 'B'), element('3', 'property', 'A.id', { ownerCode: 'A' }), element('4', 'relation', 'A_to_B', { ownerCode: 'A', targetCode: 'B' })] }
  const state = { record: structuredClone(original), audits: [], released: 0, writes: 0, failCode: '' }
  let snapshot
  const connection = {
    async beginTransaction() { snapshot = structuredClone({ record: state.record, audits: state.audits }) },
    async commit() { snapshot = null },
    async rollback() { state.record = snapshot.record; state.audits = snapshot.audits },
    release() { state.released++ },
    async query(sql, args) {
      if (sql.startsWith('SELECT status')) return [[{ status: state.record.status }]]
      state.writes++
      if (sql.startsWith('DELETE FROM ontology_elements')) state.record.elements = []
      else if (sql.startsWith('DELETE FROM ontology_entity_groups')) state.record.groups = []
      else if (sql.startsWith('INSERT INTO ontology_entity_groups')) state.record.groups.push(args[1])
      else if (sql.startsWith('INSERT INTO ontology_elements')) {
        if (args[3] === state.failCode) throw new Error('模拟数据库写入失败')
        const [id, , type, code, name, groupName, ownerCode, targetCode, dataType, constraint, description] = args
        state.record.elements.push({ id: id || String(100 + state.record.elements.length), type, code, name, groupName, ownerCode, targetCode, dataType, constraint, description })
      } else if (sql.startsWith('UPDATE ontologies')) {
        const [name, scope, domain, description, classes, properties, relations] = args
        Object.assign(state.record, { name, scope, domain, description, classes, properties, relations, events: 0, validation: null })
      } else if (sql.startsWith('INSERT INTO ontology_audits')) state.audits.push(args)
      else assert.fail(`Unexpected query: ${sql}`)
      return [{}]
    },
  }
  const payload = { ...structuredClone(original), expected: structuredClone(original) }
  const save = (draft = payload) => saveOntologyDraft({ getConnection: async () => connection }, original.id, draft, async () => structuredClone(state.record))
  return { state, original, payload, save }
}

test('one save commits basic information, groups and all structure edits together while retaining existing IDs', async () => {
  const { state, payload, save } = fixture()
  payload.name = '修改后的模型'
  payload.groups.push('主数据')
  payload.elements[0].name = '实体A'
  payload.elements[0].groupName = '主数据'
  payload.elements = payload.elements.filter((row) => row.id !== '4')
  payload.elements.push(element('draft-new', 'property', 'B.name', { ownerCode: 'B' }))
  const result = await save()
  assert.equal(result.name, '修改后的模型')
  assert.deepEqual(result.groups, ['未分组', '主数据'])
  assert.equal(result.elements.find((row) => row.id === '1').name, '实体A')
  assert.ok(result.elements.some((row) => row.code === 'B.name' && !row.id.startsWith('draft-')))
  assert.ok(!result.elements.some((row) => row.id === '4'))
  assert.deepEqual([result.classes, result.properties, result.relations], [2, 2, 0])
  assert.equal(state.audits.length, 1)
  assert.equal(state.released, 1)
})

test('a failure after partial writes rolls back the entire model and audit', async () => {
  const { state, original, payload, save } = fixture()
  payload.name = '不会保存的名称'
  payload.groups.push('不会保存的分组')
  state.failCode = 'A.id'
  await assert.rejects(save(), /模拟数据库写入失败/)
  assert.ok(state.writes > 3)
  assert.deepEqual(state.record, original)
  assert.equal(state.audits.length, 0)
  assert.equal(state.released, 1)
  state.failCode = ''
  assert.equal((await save()).name, payload.name)
})

test('stale editor snapshots cannot overwrite a newer model', async () => {
  const { state, payload, save } = fixture()
  state.record.elements[0].name = '另一窗口的修改'
  payload.name = '本窗口的修改'
  await assert.rejects(save(), (error) => error.status === 409 && /其他操作更新/.test(error.message))
  assert.equal(state.writes, 0)
  assert.equal(state.record.elements[0].name, '另一窗口的修改')
})

for (const status of ['启用', '停用', '已删除']) test(`${status} models cannot be saved through the draft endpoint`, async () => {
  const { state, save } = fixture()
  state.record.status = status
  await assert.rejects(save(), (error) => [404, 409].includes(error.status))
  assert.equal(state.writes, 0)
})

test('duplicate structure codes and group names are rejected before writing', async () => {
  const { state, payload, save } = fixture()
  payload.elements.push(element('draft-duplicate', 'class', 'A'))
  await assert.rejects(save(), /编码已存在/)
  assert.equal(state.writes, 0)
  payload.elements.pop()
  payload.groups.push('未分组')
  await assert.rejects(save(), /分组名称不能重复/)
  assert.equal(state.writes, 0)
})

test('removing or renaming a referenced class cannot leave dangling properties or relations', async () => {
  const { state, payload, save } = fixture()
  payload.elements = payload.elements.filter((row) => row.id !== '1')
  await assert.rejects(save(), /实体类型不存在/)
  assert.equal(state.writes, 0)
})

test('new properties and relations must refer to classes in the saved draft', async () => {
  const { state, payload, save } = fixture()
  payload.elements.push(element('draft-invalid', 'relation', 'invalid', { ownerCode: 'A', targetCode: 'missing' }))
  await assert.rejects(save(), /终点实体类型不存在/)
  assert.equal(state.writes, 0)
})

test('unchanged incomplete legacy definitions can remain in a draft', async () => {
  const { state, payload, save } = fixture()
  state.record.elements[3].targetCode = ''
  payload.elements[3].targetCode = ''
  payload.expected.elements[3].targetCode = ''
  payload.description = '更新基本信息'
  assert.equal((await save()).description, payload.description)
})
