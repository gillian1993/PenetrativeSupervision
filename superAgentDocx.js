const encoder = new TextEncoder()

const PAGE = {
  width: 11906,
  height: 16838,
  marginTop: 1276,
  marginRight: 1134,
  marginBottom: 1276,
  marginLeft: 1134,
}
const USABLE_WIDTH = PAGE.width - PAGE.marginLeft - PAGE.marginRight

function crc32(buffer) {
  const table = crc32.table || (crc32.table = Array.from({ length: 256 }, (_, index) => {
    let value = index
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    return value >>> 0
  }))
  let crc = 0xffffffff
  for (const byte of buffer) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function asBuffer(data) {
  if (Buffer.isBuffer(data)) return data
  return Buffer.from(encoder.encode(String(data)))
}

function zipStore(files) {
  const localParts = []
  const centralParts = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const data = asBuffer(file.data)
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    localParts.push(local, name, data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, name)
    offset += local.length + name.length + data.length
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...localParts, ...centralParts, end])
}

function cleanXmlText(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/\r/g, '')
}

function xmlEscape(value) {
  return cleanXmlText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function riskTone(value) {
  const text = String(value || '')
  if (/高|重大|严重/.test(text)) return { fill: 'FCE4D6', color: '9C0006' }
  if (/中|证据不足|待补证/.test(text)) return { fill: 'FFF2CC', color: '9C6500' }
  if (/低|通过|正常|未命中/.test(text)) return { fill: 'E2F0D9', color: '375623' }
  return { fill: 'EEF2F7', color: '334155' }
}

function isRiskFinding(item) {
  return item?.status === 'risk' || (!item?.status && item?.passed === false)
}

function isInsufficientFinding(item) {
  return item?.status === 'insufficient'
}

function run(text, options = {}) {
  const props = []
  if (options.bold) props.push('<w:b/>')
  if (options.color) props.push(`<w:color w:val="${options.color}"/>`)
  if (options.size) props.push(`<w:sz w:val="${options.size}"/><w:szCs w:val="${options.size}"/>`)
  if (options.font) props.push(`<w:rFonts w:ascii="${options.font}" w:hAnsi="${options.font}" w:eastAsia="${options.font}"/>`)
  const pr = props.length ? `<w:rPr>${props.join('')}</w:rPr>` : ''
  return `<w:r>${pr}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`
}

function inlineRuns(text, options = {}) {
  const source = cleanXmlText(text).replace(/`([^`]+)`/g, '$1').replace(/\n+/g, ' ')
  if (!source) return run('', options)
  const parts = []
  let last = 0
  const pattern = /\*\*(.+?)\*\*/g
  let match = pattern.exec(source)
  while (match) {
    if (match.index > last) parts.push(run(source.slice(last, match.index), options))
    parts.push(run(match[1], { ...options, bold: true }))
    last = match.index + match[0].length
    match = pattern.exec(source)
  }
  if (last < source.length) parts.push(run(source.slice(last), options))
  return parts.join('')
}

function paragraph(text = '', options = {}) {
  const props = []
  if (options.style) props.push(`<w:pStyle w:val="${options.style}"/>`)
  if (options.align) props.push(`<w:jc w:val="${options.align}"/>`)
  if (options.keepNext) props.push('<w:keepNext/>')
  if (options.numId) props.push(`<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${options.numId}"/></w:numPr>`)
  if (options.before !== undefined || options.after !== undefined || options.line !== undefined) {
    const before = options.before !== undefined ? ` w:before="${options.before}"` : ''
    const after = options.after !== undefined ? ` w:after="${options.after}"` : ''
    const line = options.line !== undefined ? ` w:line="${options.line}" w:lineRule="auto"` : ''
    props.push(`<w:spacing${before}${after}${line}/>`)
  }
  if (options.indentLeft || options.hanging) {
    const left = options.indentLeft ? ` w:left="${options.indentLeft}"` : ''
    const hanging = options.hanging ? ` w:hanging="${options.hanging}"` : ''
    props.push(`<w:ind${left}${hanging}/>`)
  }
  const pPr = props.length ? `<w:pPr>${props.join('')}</w:pPr>` : ''
  return `<w:p>${pPr}${options.rawRuns || inlineRuns(text, options)}</w:p>`
}

function pageBreak() {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
}

function splitTableRow(line) {
  return String(line || '').replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim())
}

function isSeparatorRow(row) {
  return row.length > 0 && row.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function normalizeTableRows(tableLines) {
  const parsed = tableLines.map(splitTableRow).filter((row) => row.some(Boolean) && !isSeparatorRow(row))
  if (!parsed.length) return null
  let headers = parsed[0]
  const rows = parsed.slice(1)
  const maxColumns = Math.max(headers.length, ...rows.map((row) => row.length))
  if (headers.length === 4 && maxColumns === 5 && headers.join('|').includes('主要风险')) {
    headers = ['风险维度', '风险事项', '待核验', '等级分布', '主要风险']
  }
  while (headers.length < maxColumns) headers.push('说明')
  return { headers, rows: rows.map((row) => Array.from({ length: maxColumns }, (_, index) => row[index] || '')) }
}

function tableWidths(headers, explicit) {
  if (explicit?.length) return explicit
  const key = headers.join('|')
  if (key === '序号|材料|解析情况|审查范围') return [720, 3300, 2200, USABLE_WIDTH - 6220]
  if (/材料|解析情况|审查范围/.test(key)) return [1300, 2500, 2200, USABLE_WIDTH - 6000]
  if (/类型|抽取线索/.test(key)) return [2100, USABLE_WIDTH - 2100]
  if (/监管映射|命中模式|风险判断|关键依据/.test(key)) return [2300, 1500, 800, 2500, USABLE_WIDTH - 7100]
  if (/异常项目|量化|复核建议/.test(key)) return [1700, 800, 3900, USABLE_WIDTH - 6400]
  if (/税务风险点|风险说明|证据依据/.test(key)) return [1700, 800, 3300, USABLE_WIDTH - 5800]
  if (/风险维度|风险事项|待核验|等级分布|主要风险/.test(key)) return [1900, 1100, 1100, 1800, USABLE_WIDTH - 5900]
  if (/优先级|整改动作|责任部门|完成要求/.test(key)) return [600, 1100, 1500, 3300, 1400, USABLE_WIDTH - 7900]
  if (/规则编号|规则名称|结果|说明/.test(key)) return [520, 1150, 1350, 1800, 700, 850, USABLE_WIDTH - 6370]
  if (headers.length === 2) return [2200, USABLE_WIDTH - 2200]
  if (headers.length === 3) return [2000, 2200, USABLE_WIDTH - 4200]
  if (headers.length === 4) return [1300, 1900, 2100, USABLE_WIDTH - 5300]
  if (headers.length === 5) return [1700, 1500, 900, 2600, USABLE_WIDTH - 6700]
  if (headers.length === 6) return [650, 1100, 1600, 3000, 1400, USABLE_WIDTH - 7750]
  return Array.from({ length: headers.length }, () => Math.floor(USABLE_WIDTH / headers.length))
}

function cellParagraphs(value, options = {}) {
  const lines = cleanXmlText(value || '').split(/\n+/).map((line) => line.trim()).filter(Boolean)
  const parts = lines.length ? lines : ['']
  return parts.map((line) => paragraph(line, {
    style: options.header ? 'TableHeader' : 'TableText',
    before: 0,
    after: 0,
    line: options.fontSize && options.fontSize <= 16 ? 240 : 280,
    bold: options.header || options.bold,
    color: options.color,
    size: options.fontSize,
    align: options.align,
  })).join('')
}

function tableCell(value, width, options = {}) {
  const fill = options.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${options.fill}"/>` : ''
  const valign = `<w:vAlign w:val="${options.vAlign || 'center'}"/>`
  const margins = '<w:tcMar><w:top w:w="90" w:type="dxa"/><w:left w:w="110" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tcMar>'
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${fill}${valign}${margins}</w:tcPr>${cellParagraphs(value, options)}</w:tc>`
}

function tableRow(cells, widths, options = {}) {
  const trPr = options.header ? '<w:trPr><w:tblHeader/></w:trPr>' : ''
  const cellXml = cells.map((cell, index) => tableCell(cell, widths[index], {
    header: options.header,
    fill: options.header ? '1F4E79' : options.fill,
    color: options.header ? 'FFFFFF' : options.color,
    fontSize: options.fontSize,
    align: options.align,
    bold: options.bold,
  })).join('')
  return `<w:tr>${trPr}${cellXml}</w:tr>`
}

function markdownTable(tableLines) {
  const table = normalizeTableRows(tableLines)
  if (!table) return ''
  return makeTable(table.headers, table.rows)
}

function makeTable(headers, rows, options = {}) {
  const columnCount = Math.max(headers.length, ...rows.map((row) => row.length), 1)
  const normalizedHeaders = Array.from({ length: columnCount }, (_, index) => headers[index] || '')
  const normalizedRows = rows.map((row) => Array.from({ length: columnCount }, (_, index) => row[index] || ''))
  const widths = tableWidths(normalizedHeaders, options.widths)
  const totalWidth = widths.reduce((sum, width) => sum + width, 0)
  const grid = widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('')
  const fontSize = options.fontSize || (columnCount >= 6 ? 16 : columnCount >= 5 ? 17 : 19)
  const rowsXml = [
    normalizedHeaders.some(Boolean) ? tableRow(normalizedHeaders, widths, { header: true, fontSize }) : '',
    ...normalizedRows.map((row, index) => tableRow(row, widths, { fill: index % 2 ? 'F8FAFC' : 'FFFFFF', fontSize })),
  ].join('')
  return `<w:tbl><w:tblPr><w:tblW w:w="${totalWidth}" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/><w:left w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/><w:right w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/></w:tblBorders><w:tblCellMar><w:top w:w="90" w:type="dxa"/><w:left w:w="110" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rowsXml}</w:tbl>${paragraph('', { after: 80 })}`
}

function fieldTable(rows) {
  const widths = [1550, 3269, 1550, 3269]
  const xmlRows = rows.map((row) => {
    const cells = [
      tableCell(row[0], widths[0], { fill: 'EEF2F7', bold: true, color: '334155', fontSize: 18 }),
      tableCell(row[1], widths[1], { fill: 'FFFFFF', fontSize: 18 }),
      tableCell(row[2], widths[2], { fill: 'EEF2F7', bold: true, color: '334155', fontSize: 18 }),
      tableCell(row[3], widths[3], { fill: 'FFFFFF', fontSize: 18 }),
    ].join('')
    return `<w:tr>${cells}</w:tr>`
  }).join('')
  return `<w:tbl><w:tblPr><w:tblW w:w="${USABLE_WIDTH}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="5" w:color="CBD5E1"/><w:left w:val="single" w:sz="5" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="5" w:color="CBD5E1"/><w:right w:val="single" w:sz="5" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:color="E2E8F0"/><w:insideV w:val="single" w:sz="4" w:color="E2E8F0"/></w:tblBorders></w:tblPr><w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>${xmlRows}</w:tbl>${paragraph('', { after: 120 })}`
}

function callout(title, text, tone = {}) {
  const fill = tone.fill || 'F8FAFC'
  const color = tone.color || '1F4E79'
  const width = USABLE_WIDTH
  const content = paragraph(title, { style: 'CalloutTitle', color, bold: true, after: 60 }) + paragraph(text || '未提供', { style: 'CalloutText', after: 0 })
  return `<w:tbl><w:tblPr><w:tblW w:w="${width}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="8" w:color="${color}"/><w:left w:val="single" w:sz="8" w:color="${color}"/><w:bottom w:val="single" w:sz="4" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:color="CBD5E1"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="${width}"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:shd w:val="clear" w:fill="${fill}"/><w:tcMar><w:top w:w="180" w:type="dxa"/><w:left w:w="220" w:type="dxa"/><w:bottom w:w="180" w:type="dxa"/><w:right w:w="220" w:type="dxa"/></w:tcMar></w:tcPr>${content}</w:tc></w:tr></w:tbl>${paragraph('', { after: 140 })}`
}

function reportBodyMarkdown(report) {
  const lines = String(report?.markdown || '').split(/\r?\n/)
  const firstFormalSection = lines.findIndex((line) => /^##\s*[一二三四五六七八九十]+[、.]/.test(line.trim()))
  if (firstFormalSection >= 0) return lines.slice(firstFormalSection).join('\n')
  return lines.filter((line, index) => !(index === 0 && line.trim().startsWith('# '))).join('\n')
}

function markdownToBody(markdown) {
  const parts = []
  let tableLines = []
  const flushTable = () => {
    if (!tableLines.length) return
    parts.push(markdownTable(tableLines))
    tableLines = []
  }
  for (const rawLine of String(markdown || '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) {
      flushTable()
      continue
    }
    if (line.startsWith('|')) {
      tableLines.push(line)
      continue
    }
    flushTable()
    if (line.startsWith('## ')) parts.push(paragraph(line.replace(/^##\s+/, ''), { style: 'Heading1', keepNext: true }))
    else if (line.startsWith('### ')) parts.push(paragraph(line.replace(/^###\s+/, ''), { style: 'Heading2', keepNext: true }))
    else if (line.startsWith('#### ')) parts.push(paragraph(line.replace(/^####\s+/, ''), { style: 'Heading3', keepNext: true }))
    else if (line.startsWith('- ')) parts.push(paragraph(line.slice(2), { style: 'ListParagraph', numId: 1 }))
    else if (/^\d+[.、]\s+/.test(line)) parts.push(paragraph(line.replace(/^\d+[.、]\s+/, ''), { style: 'ListParagraph', numId: 2 }))
    else if (/^提示[:：]/.test(line)) parts.push(callout('提示', line.replace(/^提示[:：]\s*/, ''), { fill: 'FFF7ED', color: 'C2410C' }))
    else parts.push(paragraph(line, { style: 'BodyText' }))
  }
  flushTable()
  return parts.join('')
}

function sourceDocumentRows(report) {
  const docs = Array.isArray(report?.sourceDocuments) ? report.sourceDocuments : []
  if (docs.length) {
    return docs.map((item, index) => [String(index + 1), item.fileName || item.name || '未命名材料', `${item.characters || 0} 字`, item.parser || '文档解析'])
  }
  return [['1', report?.documentName || '上传材料', '', '已纳入审查']]
}

function reportRiskItems(report) {
  if (Array.isArray(report?.riskItems) && report.riskItems.length) return report.riskItems
  const failed = (report?.findings || []).filter(isRiskFinding)
  const order = { 高: 1, 中: 2, 低: 3 }
  return failed.sort((a, b) => (order[a.severity] || 9) - (order[b.severity] || 9)).slice(0, 8).map((item, index) => ({
    id: `RISK-FALLBACK-${index + 1}`,
    type: 'risk',
    title: item.issue || item.reason || item.ruleName || '风险事项',
    category: item.category || '综合',
    severity: item.severity || '中',
    statusText: `${item.severity || '中'}风险`,
    summary: item.issue || item.reason || '存在异常线索',
    evidence: item.evidence || '未提供',
    suggestion: item.suggestion || '补充底层证据并复核。',
  }))
}

function topFindingRows(report) {
  const order = { 高: 1, 中: 2, 低: 3 }
  return reportRiskItems(report)
    .filter((item) => item.type !== 'material_gap')
    .sort((a, b) => (order[a.severity] || 9) - (order[b.severity] || 9))
    .slice(0, 8)
    .map((item, index) => [
      String(index + 1),
      item.title || '风险事项',
      item.severity || '待研判',
      item.summary || item.evidence || '未提供风险判断',
      item.suggestion || '补充底层证据并复核。',
    ])
}
function coverSection(report) {
  const stats = report?.riskStats || {}
  const tone = riskTone(report?.riskLevel)
  return [
    paragraph('超级智能体', { style: 'CoverEyebrow', align: 'center', after: 220 }),
    paragraph(report?.title || '虚假贸易风险专项审查报告', { style: 'Title', align: 'center', after: 160 }),
    paragraph(`基于 ${report?.documentName || '上传材料'} 的合规分析`, { style: 'Subtitle', align: 'center', after: 520 }),
    fieldTable([
      ['报告编号', report?.id || '未生成', '关联审查', report?.reviewId || '未关联'],
      ['审查对象', report?.documentName || '上传材料', '报告日期', report?.createdAt || '未提供'],
      ['风险等级', report?.riskLevel || '待研判', '综合评分', stats.score !== undefined ? `${stats.score} 分` : '未评分'],
      ['风险事项', stats.riskItemCount !== undefined ? `${stats.riskItemCount} 项` : `${stats.failedCount || 0} 项`, '待核验', stats.materialGapCount !== undefined ? `${stats.materialGapCount} 项` : `${stats.insufficientCount || 0} 项`],    ]),
    callout('综合结论', report?.conclusion || report?.summary || '未提供综合结论', tone),
    paragraph('本报告仅供内部审查、整改闭环和穿透核查辅助使用。', { style: 'Disclaimer', align: 'center', before: 200 }),
    pageBreak(),
  ].join('')
}

function summarySection(report) {
  const stats = report?.riskStats || {}
  const rows = [
    ['风险等级', report?.riskLevel || '待研判', '综合评分', stats.score !== undefined ? `${stats.score} 分` : '未评分'],
    ['风险事项', stats.riskItemCount !== undefined ? `${stats.riskItemCount} 项` : `${stats.failedCount || 0} 项`, '待核验', stats.materialGapCount !== undefined ? `${stats.materialGapCount} 项` : `${stats.insufficientCount || 0} 项`],
    ['高风险', `${stats.highCount || 0} 项`, '中风险', `${stats.mediumCount || 0} 项`],
    ['低风险', `${stats.lowCount || 0} 项`, '审查材料', report?.documentCount ? `${report.documentCount} 篇` : '未提供'],
  ]
  const categoryRows = (report?.categoryStats || []).map((item) => [item.category, item.riskItems || item.failedRules || '0 项', item.materialGaps || '0 项', item.severityStats, item.mainRisk])
  const findingRows = topFindingRows(report)
  return [
    paragraph('一页摘要', { style: 'Heading1', keepNext: true }),
    callout('报告摘要', report?.summary || '未提供摘要'),
    fieldTable(rows),
    makeTable(['序号', '材料', '文本量', '解析状态'], sourceDocumentRows(report), { widths: [700, 3600, 1600, USABLE_WIDTH - 5900] }),
    categoryRows.length ? makeTable(['风险维度', '风险事项', '待核验', '等级分布', '主要风险'], categoryRows) : '',
    findingRows.length ? makeTable(['序号', '风险事项', '等级', '风险判断', '整改建议'], findingRows) : callout('风险识别情况', (stats.materialGapCount || stats.insufficientCount || 0) ? `本次审查未识别出明确风险事项，但有 ${stats.materialGapCount || stats.insufficientCount || 0} 项材料需补充核验，建议补证复核。` : '本次审查未识别出明确风险事项，建议保留审查记录并按业务流程归档。', { fill: (stats.materialGapCount || stats.insufficientCount || 0) ? 'FFF2CC' : 'F0FDF4', color: (stats.materialGapCount || stats.insufficientCount || 0) ? '9C6500' : '15803D' }),
    pageBreak(),
  ].join('')
}
function sectionProperties() {
  return `<w:sectPr><w:footerReference w:type="default" r:id="rId3"/><w:pgSz w:w="${PAGE.width}" w:h="${PAGE.height}"/><w:pgMar w:top="${PAGE.marginTop}" w:right="${PAGE.marginRight}" w:bottom="${PAGE.marginBottom}" w:left="${PAGE.marginLeft}" w:header="720" w:footer="720" w:gutter="0"/><w:cols w:space="425"/></w:sectPr>`
}

function documentXml(report) {
  const body = [coverSection(report), summarySection(report), markdownToBody(reportBodyMarkdown(report)), sectionProperties()].join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}</w:body></w:document>`
}

function contentTypes() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>'
}

function rootRels() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>'
}

function documentRels() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>'
}

function styles() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/><w:sz w:val="21"/><w:lang w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/><w:sz w:val="21"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="BodyText"><w:name w:val="Body Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="1F4E79"/><w:sz w:val="44"/><w:rFonts w:ascii="Microsoft YaHei" w:hAnsi="Microsoft YaHei" w:eastAsia="Microsoft YaHei"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="64748B"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="CoverEyebrow"><w:name w:val="Cover Eyebrow"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="64748B"/><w:sz w:val="20"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="300" w:after="160"/></w:pPr><w:rPr><w:b/><w:color w:val="1F4E79"/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="100"/></w:pPr><w:rPr><w:b/><w:color w:val="2F5597"/><w:sz w:val="24"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="374151"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="80" w:line="320" w:lineRule="auto"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="280" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="18"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="TableHeader"><w:name w:val="Table Header"/><w:basedOn w:val="TableText"/><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="18"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="CalloutTitle"><w:name w:val="Callout Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="21"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="CalloutText"><w:name w:val="Callout Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="330" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Disclaimer"><w:name w:val="Disclaimer"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:color w:val="64748B"/><w:sz w:val="18"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="Footer"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0"/></w:pPr><w:rPr><w:color w:val="94A3B8"/><w:sz w:val="16"/></w:rPr></w:style></w:styles>'
}

function numbering() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="540" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:eastAsia="Microsoft YaHei"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="540" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>'
}

function footer() {
  const field = '<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>'
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:pStyle w:val="Footer"/><w:jc w:val="center"/></w:pPr><w:r><w:t>超级智能体检测报告 | 仅供内部审查使用 | 第 </w:t></w:r>${field}<w:r><w:t> 页</w:t></w:r></w:p></w:ftr>`
}

function coreProperties(report) {
  const now = new Date().toISOString()
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(report?.title || '检测报告')}</dc:title><dc:creator>超级智能体</dc:creator><cp:lastModifiedBy>超级智能体</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`
}

function appProperties() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Super Agent</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><Company>中国电子云</Company><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0000</AppVersion></Properties>'
}

export function buildReportDocx(report) {
  return zipStore([
    { name: '[Content_Types].xml', data: contentTypes() },
    { name: '_rels/.rels', data: rootRels() },
    { name: 'docProps/core.xml', data: coreProperties(report) },
    { name: 'docProps/app.xml', data: appProperties() },
    { name: 'word/_rels/document.xml.rels', data: documentRels() },
    { name: 'word/document.xml', data: documentXml(report) },
    { name: 'word/styles.xml', data: styles() },
    { name: 'word/numbering.xml', data: numbering() },
    { name: 'word/footer1.xml', data: footer() },
  ])
}
