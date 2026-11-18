import assert from 'node:assert/strict'
import test from 'node:test'
import ExcelJS from 'exceljs'
import { createDemoData, demoMappings } from '../knowledgeGraphDemoData.js'
import { buildGraphDataset } from '../graphDataSync.js'
import { parseSourceWorkbook } from '../dataGraphApi.js'
import { inspectGraphDataset, mergeGraphCandidates } from '../graphQuality.js'
import { suggestGraphMappings } from '../graphAutoMapping.js'

async function dataset(version = 1, quality = false) {
  const data = createDemoData(version, quality)
  const book = new ExcelJS.Workbook()
  const names = {}
  book.addWorksheet('空白说明')
  for (const table of data.tables) {
    const sheet = book.addWorksheet(table.name.slice(0,31))
    sheet.addRow(table.fields)
    for (const row of table.rows) sheet.addRow(table.fields.map(field => row[field]))
    names[table.name] = `file_1_sheet_${book.worksheets.length}`
  }
  const content = Buffer.from(await book.xlsx.writeBuffer())
  const pool = { query: async (_sql, parameters) => [[...data.tables].filter(table => parameters.slice(1).includes(names[table.name])).map(table => ({table_name:names[table.name],file_id:1,file_name:'demo.xlsx',content}))] }
  return { data, value: await buildGraphDataset(pool,[{id:'TEST',name:'虚构样例',mode:'文件导入',status:'启用'}],new Map([['TEST',demoMappings(data.tables,data.elements,'TEST','MODEL',names)]]),data.elements) }
}

test('complete business fixture generates exact totals and every relation has valid endpoints', async () => {
  const {data,value}=await dataset()
  assert.equal(data.elements.filter(e=>e.type==='class').length,12)
  assert.equal(data.elements.filter(e=>e.type==='property').length,60)
  assert.equal(value.nodes.length,394)
  assert.equal(value.relations.length,426)
  const nodes=new Set(value.nodes.map(node=>node.id))
  assert.ok(value.relations.every(edge=>nodes.has(edge.sourceId)&&nodes.has(edge.targetId)))
  const check=inspectGraphDataset(value,data.elements)
  assert.equal(check.issues.filter(issue=>issue.level==='阻断').length,0)
  assert.equal(check.candidates.length,1)
})

test('quality error is detected from real data and repair clears it',async()=>{
  const broken=await dataset(1,true)
  assert.equal(inspectGraphDataset(broken.value,broken.data.elements).issues.filter(x=>x.level==='阻断').length,1)
  const repaired=await dataset()
  assert.equal(inspectGraphDataset(repaired.value,repaired.data.elements).issues.filter(x=>x.level==='阻断').length,0)
})

test('governance actually removes a duplicate node and reconnects its edges without dangling references',async()=>{
  const {data,value}=await dataset()
  const candidate=inspectGraphDataset(value,data.elements).candidates[0]
  const after=mergeGraphCandidates(value,candidate.nodes.map(node=>node.id))
  assert.equal(after.nodes.length,393)
  assert.ok(after.relations.every(edge=>after.nodes.some(node=>node.id===edge.sourceId)&&after.nodes.some(node=>node.id===edge.targetId)))
  assert.equal(inspectGraphDataset(after,data.elements).candidates.length,0)
  assert.equal(value.nodes.length,394)
  assert.throws(()=>mergeGraphCandidates(value,[value.nodes[0].id,value.nodes[1].id]),/同类|已变化|相同/)
})

test('V2 changes are reproducible and preserve old fixture',async()=>{
  const before=await dataset(),after=await dataset(2)
  assert.equal(after.value.nodes.length,395)
  const amount=(result)=>result.value.nodes.find(node=>node.typeCode==='DEMO.Contract'&&node.identifier==='Contract-001').properties.find(p=>p.label==='金额').value
  assert.equal(Number(amount(after))-Number(amount(before)),5000)
})

test('workbook metadata preserves original sheet index when the first worksheet is empty',async()=>{
  const book=new ExcelJS.Workbook();book.addWorksheet('空白');book.addWorksheet('供应商').addRows([['id','name'],['S1','演示供应商']])
  const parsed=await parseSourceWorkbook('demo.xlsx',Buffer.from(await book.xlsx.writeBuffer()))
  assert.equal(parsed.length,1);assert.equal(parsed[0].index,2)
})

test('actual demo schemas can automatically map all entities and explicitly named relation tables',()=>{
  const {elements,tables}=createDemoData()
  const sources=['erp','oa','treasury','external','file'].map(id=>({id,name:id}))
  const metadata=new Map(sources.map(source=>[source.id,tables.filter(table=>table.source===source.id).map(table=>({tableName:table.name,displayName:table.label,fields:table.fields}))]))
  const proposal=suggestGraphMappings(elements,sources,metadata,new Map())
  assert.equal(proposal.entities.length,12)
  assert.equal(proposal.relations.length,14)
})
