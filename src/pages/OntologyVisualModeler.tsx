import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from 'react'
import { type OntologyElement, type OntologyElementType, type OntologyValidation } from '../ontologyLocalStore'
import { Button, EmptyState, Icon, StatusTag } from '../ui'
import '../ontologyVisualModeler.css'

export interface CanvasPosition { x: number; y: number }
type LayoutMode = 'smart' | 'ring' | 'layered' | 'free'
type CreateDefaults = Partial<Pick<OntologyElement, 'ownerCode' | 'targetCode'>>

interface VisualModelerProps {
  ontologyId: string
  status: string
  elements: OntologyElement[]
  validation?: OntologyValidation
  onCreate: (type: OntologyElementType, position?: CanvasPosition, defaults?: CreateDefaults) => void
  onEdit: (type: OntologyElementType, element: OntologyElement) => void
  onCreateRelation: (sourceCode: string, targetCode: string) => void
}

const canvasWidth = 1040
const canvasHeight = 700
const layoutKey = (ontologyId: string) => `ontology-visual-layout-v3:${ontologyId}`
const modeKey = (ontologyId: string) => `ontology-visual-layout-mode-v3:${ontologyId}`
const labels: Record<OntologyElementType, string> = { class: '类', property: '属性', relation: '关系' }

function readPositions(ontologyId: string): Record<string, CanvasPosition> {
  try { return JSON.parse(localStorage.getItem(layoutKey(ontologyId)) || '{}') as Record<string, CanvasPosition> } catch { return {} }
}
function writePositions(ontologyId: string, positions: Record<string, CanvasPosition>) { localStorage.setItem(layoutKey(ontologyId), JSON.stringify(positions)) }
function readMode(ontologyId: string): LayoutMode {
  const value = localStorage.getItem(modeKey(ontologyId)) as LayoutMode | null
  return value && ['smart', 'ring', 'layered', 'free'].includes(value) ? value : 'smart'
}
function writeMode(ontologyId: string, mode: LayoutMode) { localStorage.setItem(modeKey(ontologyId), mode) }

export function saveOntologyLayoutPosition(ontologyId: string, code: string, position: CanvasPosition) {
  writePositions(ontologyId, { ...readPositions(ontologyId), [code.trim()]: position })
  writeMode(ontologyId, 'free')
}

function degreeMap(nodes: OntologyElement[], relations: OntologyElement[]) {
  const result: Record<string, number> = Object.fromEntries(nodes.map((item) => [item.code, 0]))
  relations.forEach((item) => {
    if (item.ownerCode && result[item.ownerCode] !== undefined) result[item.ownerCode] += 1
    if (item.targetCode && result[item.targetCode] !== undefined) result[item.targetCode] += 1
  })
  return result
}

function smartLayout(nodes: OntologyElement[], relations: OntologyElement[]) {
  const positions: Record<string, CanvasPosition> = {}
  const degrees = degreeMap(nodes, relations)
  const ordered = [...nodes].sort((a, b) => (degrees[b.code] || 0) - (degrees[a.code] || 0) || a.name.localeCompare(b.name, 'zh-CN'))
  const centerX = 500; const centerY = 320
  if (ordered[0]) positions[ordered[0].code] = { x: centerX - 48, y: centerY - 48 }
  const rest = ordered.slice(1)
  rest.forEach((item, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(rest.length, 1)
    positions[item.code] = { x: centerX + Math.cos(angle) * 355 - 42, y: centerY + Math.sin(angle) * 235 - 42 }
  })
  return positions
}

function ringLayout(nodes: OntologyElement[]) {
  const positions: Record<string, CanvasPosition> = {}
  const centerX = 500; const centerY = 320
  nodes.forEach((item, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(nodes.length, 1)
    positions[item.code] = { x: centerX + Math.cos(angle) * 360 - 42, y: centerY + Math.sin(angle) * 245 - 42 }
  })
  return positions
}

function layeredLayout(nodes: OntologyElement[], relations: OntologyElement[]) {
  const positions: Record<string, CanvasPosition> = {}
  const classes = nodes
  const indegree = Object.fromEntries(classes.map((item) => [item.code, 0])) as Record<string, number>
  const adjacency = Object.fromEntries(classes.map((item) => [item.code, [] as string[]])) as Record<string, string[]>
  relations.forEach((item) => {
    if (item.ownerCode && item.targetCode && adjacency[item.ownerCode] && indegree[item.targetCode] !== undefined) {
      adjacency[item.ownerCode].push(item.targetCode)
      indegree[item.targetCode] += 1
    }
  })
  const ranks: Record<string, number> = {}
  const queue = classes.filter((item) => indegree[item.code] === 0).map((item) => item.code)
  queue.forEach((code) => { ranks[code] = 0 })
  while (queue.length) {
    const code = queue.shift()!
    adjacency[code].forEach((target) => {
      ranks[target] = Math.max(ranks[target] || 0, (ranks[code] || 0) + 1)
      indegree[target] -= 1
      if (indegree[target] === 0) queue.push(target)
    })
  }
  classes.forEach((item) => { if (ranks[item.code] === undefined) ranks[item.code] = 0 })
  const grouped = new Map<number, OntologyElement[]>()
  classes.forEach((item) => { const rank = ranks[item.code]; grouped.set(rank, [...(grouped.get(rank) || []), item]) })
  Array.from(grouped.entries()).sort(([a], [b]) => a - b).forEach(([rank, group]) => {
    group.forEach((item, index) => { positions[item.code] = { x: 90 + Math.min(rank, 3) * 265, y: 90 + index * 145 } })
  })
  return positions
}

function buildLayout(mode: Exclude<LayoutMode, 'free'>, nodes: OntologyElement[], relations: OntologyElement[]) {
  if (mode === 'ring') return ringLayout(nodes)
  if (mode === 'layered') return layeredLayout(nodes, relations)
  return smartLayout(nodes, relations)
}

export function OntologyVisualModeler({ ontologyId, status, elements, validation, onCreate, onEdit, onCreateRelation }: VisualModelerProps) {
  const readonly = status === '已发布'
  const nodes = useMemo(() => elements.filter((item) => item.type === 'class'), [elements])
  const relations = useMemo(() => elements.filter((item) => item.type === 'relation'), [elements])
  const properties = useMemo(() => elements.filter((item) => item.type === 'property'), [elements])
  const degrees = useMemo(() => degreeMap(nodes, relations), [nodes, relations])
  const maxDegree = Math.max(0, ...Object.values(degrees))
  const nodeSize = (element: OntologyElement) => maxDegree > 1 && degrees[element.code] === maxDegree ? 96 : 84
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const movedRef = useRef(false)
  const initialMode = readMode(ontologyId)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(initialMode)
  const [positions, setPositions] = useState<Record<string, CanvasPosition>>(() => ({ ...buildLayout(initialMode === 'free' ? 'smart' : initialMode, nodes, relations), ...readPositions(ontologyId) }))
  const [selectedCode, setSelectedCode] = useState(nodes[0]?.code || '')
  const [focusActive, setFocusActive] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [connectMode, setConnectMode] = useState(false)
  const [linkSource, setLinkSource] = useState('')
  const [dragging, setDragging] = useState<{ code: string; offsetX: number; offsetY: number } | null>(null)

  const centerViewport = (mode: LayoutMode, targetZoom = zoom) => window.requestAnimationFrame(() => {
    const viewport = viewportRef.current
    if (!viewport || mode === 'free') return
    viewport.scrollLeft = mode === 'layered' ? 0 : Math.max(0, canvasWidth * targetZoom / 2 - viewport.clientWidth / 2)
    viewport.scrollTop = 0
  })

  useEffect(() => {
    const savedMode = readMode(ontologyId)
    const base = buildLayout(savedMode === 'free' ? 'smart' : savedMode, nodes, relations)
    const stored = readPositions(ontologyId)
    setLayoutMode(savedMode)
    setPositions((current) => {
      const next = { ...base, ...current, ...stored }
      for (const code of Object.keys(next)) if (!nodes.some((item) => item.code === code)) delete next[code]
      return next
    })
    if (!selectedCode && nodes[0]) setSelectedCode(nodes[0].code)
  }, [ontologyId, nodes, relations, selectedCode])

  useEffect(() => {
    centerViewport(layoutMode)
  }, [ontologyId, layoutMode])
  const selected = elements.find((item) => item.code === selectedCode)
  const selectedNode = nodes.find((item) => item.code === selectedCode)
  const selectedProperties = selected?.type === 'class' ? properties.filter((item) => item.ownerCode === selected.code) : []
  const selectedRelations = selected?.type === 'class' ? relations.filter((item) => item.ownerCode === selected.code || item.targetCode === selected.code) : []
  const unlinkedRelations = relations.filter((item) => !item.ownerCode || !item.targetCode).length
  const arrowId = `ontology-arrow-${ontologyId.replace(/[^a-zA-Z0-9]/g, '')}`
  const classCount = nodes.length

  const relatedCodes = useMemo(() => {
    const result = new Set<string>()
    if (!selected) return result
    result.add(selected.code)
    if (selected.type === 'property' && selected.ownerCode) result.add(selected.ownerCode)
    if (selected.type === 'relation') { if (selected.ownerCode) result.add(selected.ownerCode); if (selected.targetCode) result.add(selected.targetCode) }
    if (selected.type === 'class') {
      relations.forEach((item) => {
        if (item.ownerCode === selected.code || item.targetCode === selected.code) { if (item.ownerCode) result.add(item.ownerCode); if (item.targetCode) result.add(item.targetCode) }
      })
    }
    return result
  }, [selected, relations, nodes])

  const disabledReason = (type: OntologyElementType) => {
    if (readonly) return '已发布版本只读，请先复制新版本'
    if (type === 'property' && classCount < 1) return '请先新增至少一个本体类'
    if (type === 'relation' && classCount < 2) return '请先新增至少两个本体类'
    return ''
  }

  const persistPositions = (next: Record<string, CanvasPosition>, mode = layoutMode) => {
    setPositions(next); setLayoutMode(mode); writePositions(ontologyId, next); writeMode(ontologyId, mode)
  }
  const applyLayout = (mode: LayoutMode) => {
    if (mode === 'free') { setLayoutMode('free'); writeMode(ontologyId, 'free'); return }
    persistPositions(buildLayout(mode, nodes, relations), mode)
    setFocusActive(false)
    setZoom(1)
    centerViewport(mode, 1)
  }

  const handleDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (readonly) return
    const type = event.dataTransfer.getData('application/x-ontology-element') as OntologyElementType
    if (!['class', 'property', 'relation'].includes(type) || disabledReason(type)) return
    const rect = canvasRef.current?.getBoundingClientRect()
    const position = rect && type === 'class' ? {
      x: Math.max(20, Math.min(canvasWidth - 110, (event.clientX - rect.left) / zoom - 42)),
      y: Math.max(20, Math.min(canvasHeight - 110, (event.clientY - rect.top) / zoom - 42)),
    } : undefined
    onCreate(type, position)
  }

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>, element: OntologyElement) => {
    if (connectMode) return
    const rect = canvasRef.current?.getBoundingClientRect(); const position = positions[element.code]
    if (!rect || !position) return
    movedRef.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging({ code: element.code, offsetX: (event.clientX - rect.left) / zoom - position.x, offsetY: (event.clientY - rect.top) / zoom - position.y })
  }
  const moveNode = (event: ReactPointerEvent<HTMLButtonElement>, element: OntologyElement) => {
    if (!dragging || dragging.code !== element.code) return
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return
    movedRef.current = true
    const size = nodeSize(element)
    setPositions((current) => ({ ...current, [element.code]: { x: Math.max(12, Math.min(canvasWidth - size - 12, (event.clientX - rect.left) / zoom - dragging.offsetX)), y: Math.max(12, Math.min(canvasHeight - size - 12, (event.clientY - rect.top) / zoom - dragging.offsetY)) } }))
  }
  const stopDrag = (event: ReactPointerEvent<HTMLButtonElement>, element: OntologyElement) => {
    if (!dragging || dragging.code !== element.code) return
    event.currentTarget.releasePointerCapture(event.pointerId); setDragging(null)
    if (movedRef.current) {
      setPositions((current) => { writePositions(ontologyId, current); return current })
      setLayoutMode('free'); writeMode(ontologyId, 'free')
    }
  }
  const selectNode = (element: OntologyElement) => {
    setSelectedCode(element.code)
    setFocusActive(true)
    const wasMoved = movedRef.current; movedRef.current = false
    if (!connectMode || wasMoved || element.type !== 'class') return
    if (!linkSource) { setLinkSource(element.code); return }
    if (linkSource !== element.code) onCreateRelation(linkSource, element.code)
    setLinkSource(''); setConnectMode(false)
  }

  const edgeGeometry = (fromElement: OntologyElement, toElement: OntologyElement, index: number) => {
    const from = positions[fromElement.code]; const to = positions[toElement.code]
    if (!from || !to) return null
    const fromSize = nodeSize(fromElement); const toSize = nodeSize(toElement)
    const fromCenter = { x: from.x + fromSize / 2, y: from.y + fromSize / 2 }; const toCenter = { x: to.x + toSize / 2, y: to.y + toSize / 2 }
    const dx = toCenter.x - fromCenter.x; const dy = toCenter.y - fromCenter.y; const distance = Math.max(Math.hypot(dx, dy), 1)
    const x1 = fromCenter.x + dx / distance * (fromSize / 2); const y1 = fromCenter.y + dy / distance * (fromSize / 2)
    const x2 = toCenter.x - dx / distance * (toSize / 2 + 7); const y2 = toCenter.y - dy / distance * (toSize / 2 + 7)
    const direction = index % 2 === 0 ? 1 : -1; const curvature = direction * (28 + Math.floor(index / 2) * 6)
    const cx = (x1 + x2) / 2 - dy / distance * curvature; const cy = (y1 + y2) / 2 + dx / distance * curvature
    const labelX = .25 * x1 + .5 * cx + .25 * x2; const labelY = .25 * y1 + .5 * cy + .25 * y2
    return { path: `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`, labelX, labelY }
  }

  const palette: Array<{ type: OntologyElementType; icon: 'graph' | 'file' | 'link'; title: string; description: string }> = [
    { type: 'class', icon: 'graph', title: '新增类', description: '业务对象、事件或概念' },
    { type: 'property', icon: 'file', title: '新增属性', description: '配置到所属本体类' },
    { type: 'relation', icon: 'link', title: '新增关系', description: '连接两个本体类' },
  ]

  return <div className="ontology-modeler">
    <aside className="ontology-model-palette">
      <header><span>元素面板</span><small>点击或拖入画布</small></header>
      <div className="ontology-palette-items">{palette.map((item) => {
        const reason = disabledReason(item.type)
        return <button type="button" key={item.type} draggable={!reason} disabled={Boolean(reason)} title={reason || undefined} onDragStart={(event) => { event.dataTransfer.setData('application/x-ontology-element', item.type); event.dataTransfer.effectAllowed = 'copy' }} onClick={() => onCreate(item.type)}><Icon name={item.icon}/><span><strong>{item.title}</strong><small>{reason || item.description}</small></span></button>
      })}</div>
      <div className="ontology-model-summary"><span>模型元素</span><strong>{elements.length}</strong><small>{classCount} 个类 · {properties.length} 个属性 · {relations.length} 条关系</small></div>
      {readonly && <div className="ontology-readonly-note"><Icon name="lock"/><span>已发布版本只读，画布可查看和调整本机布局；修改语义请先复制新版本。</span></div>}
    </aside>

    <section className="ontology-canvas-panel">
      <div className="ontology-canvas-toolbar"><div><strong>本体关系画布</strong><span>球形节点突出结构，详细定义在右侧查看</span></div><div><Button className={connectMode ? 'active-tool' : ''} disabled={readonly || classCount < 2} onClick={() => { movedRef.current = false; setConnectMode((value) => !value); setLinkSource('') }}><Icon name="link" size={15}/>{connectMode ? '退出连线' : '连接关系'}</Button><select aria-label="布局方式" value={layoutMode} onChange={(event) => applyLayout(event.target.value as LayoutMode)}><option value="smart">智能分组</option><option value="ring">环形布局</option><option value="layered">层级布局</option><option value="free">自由布局</option></select><Button onClick={() => applyLayout(layoutMode === 'free' ? 'smart' : layoutMode)}>重新布局</Button><div className="canvas-zoom"><button onClick={() => setZoom((value) => Math.max(.7, Number((value - .1).toFixed(1))))}>－</button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((value) => Math.min(1.3, Number((value + .1).toFixed(1))))}>＋</button></div></div></div>
      {connectMode && <div className="connection-guide"><Icon name="link"/><span>{linkSource ? `已选择起点：${elements.find((item) => item.code === linkSource)?.name}，请点击终点类` : '请依次点击起点类和终点类'}</span></div>}
      <div className="ontology-canvas-viewport" ref={viewportRef} onClick={(event) => { const target = event.target as Element; if (!target.closest('button') && !target.closest('g')) setFocusActive(false) }} onDragOver={(event) => { if (!readonly) event.preventDefault() }} onDrop={handleDrop}>
        <div className="ontology-canvas-stage" ref={canvasRef} style={{ width: canvasWidth, height: canvasHeight, transform: `scale(${zoom})` }}>
          <svg className="ontology-canvas-edges" width={canvasWidth} height={canvasHeight} aria-label="本体关系连线">
            <defs><marker id={arrowId} markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z"/></marker></defs>
            {relations.map((relation, index) => {
              const fromElement = nodes.find((item) => item.code === relation.ownerCode); const toElement = nodes.find((item) => item.code === relation.targetCode)
              if (!fromElement || !toElement) return null
              const geometry = edgeGeometry(fromElement, toElement, index); if (!geometry) return null
              const relevant = !focusActive || selected?.code === relation.code || (relatedCodes.has(fromElement.code) && relatedCodes.has(toElement.code))
              return <g key={relation.id} className={`${selectedCode === relation.code ? 'selected' : ''} ${relevant ? '' : 'dimmed'}`} onClick={() => { setSelectedCode(relation.code); setFocusActive(true) }}><path d={geometry.path} markerEnd={`url(#${arrowId})`}/><rect x={geometry.labelX - 48} y={geometry.labelY - 13} width="96" height="24" rx="12"/><text x={geometry.labelX} y={geometry.labelY + 3} textAnchor="middle">{relation.name}</text></g>
            })}
          </svg>
          {nodes.map((element) => {
            const position = positions[element.code] || { x: 50, y: 50 }; const size = nodeSize(element)
            const propertyCount = element.type === 'class' ? properties.filter((item) => item.ownerCode === element.code).length : 0
            const dimmed = Boolean(focusActive && selected && !relatedCodes.has(element.code))
            return <button type="button" title={`${element.name} · ${element.code}`} className={`ontology-canvas-node class ${size > 90 ? 'core' : ''} ${selectedCode === element.code ? 'selected' : ''} ${linkSource === element.code ? 'link-source' : ''} ${dimmed ? 'dimmed' : ''}`} style={{ left: position.x, top: position.y, width: size, height: size }} key={element.id} onPointerDown={(event) => startDrag(event, element)} onPointerMove={(event) => moveNode(event, element)} onPointerUp={(event) => stopDrag(event, element)} onClick={() => selectNode(element)}><span className="node-kind"><Icon name="graph" size={13}/>类</span><strong>{element.name}</strong><small>{element.code.split('.').pop()}</small><em>{propertyCount}</em></button>
          })}
          {selectedNode && !readonly && positions[selectedNode.code] && <div className="ontology-node-actions" style={{ left: Math.min(canvasWidth - 138, positions[selectedNode.code].x + nodeSize(selectedNode) + 10), top: positions[selectedNode.code].y + 3 }}><button onClick={() => onEdit(selectedNode.type, selectedNode)}><Icon name="edit" size={13}/>编辑</button><button onClick={() => onCreate('property', undefined, { ownerCode: selectedNode.code })}><Icon name="file" size={13}/>属性</button><button disabled={classCount < 2} onClick={() => { setConnectMode(true); setLinkSource(selectedNode.code) }}><Icon name="link" size={13}/>关系</button></div>}
          {!nodes.length && <div className="ontology-canvas-empty"><EmptyState title="画布中还没有类" description={readonly ? '当前版本没有可展示的本体类。' : '从左侧拖入类开始建模。'}/></div>}
        </div>
      </div>
      <footer className="ontology-validation-bar"><div><Icon name={(validation?.blockers.length || unlinkedRelations) ? 'warning' : 'check'}/><span>模型校验</span><strong>{validation?.blockers.length || 0} 个阻断</strong><strong>{validation?.warnings.length || 0} 个提示</strong>{unlinkedRelations > 0 && <strong>{unlinkedRelations} 条关系未连接</strong>}</div><small>{layoutMode === 'free' ? '自由布局已保存到本机' : `当前：${layoutMode === 'smart' ? '智能分组' : layoutMode === 'ring' ? '环形布局' : '层级布局'}`} · 不改变本体语义</small></footer>
    </section>

    <aside className="ontology-inspector">
      <header><span>属性检查器</span><small>{selected ? labels[selected.type] : '未选择元素'}</small></header>
      {selected ? <><div className={`inspector-identity ${selected.type}`}><Icon name={selected.type === 'relation' ? 'link' : 'graph'}/><div><strong>{selected.name}</strong><span>{selected.code}</span></div><StatusTag>{selected.type === 'class' ? '本体类' : labels[selected.type]}</StatusTag></div><dl><div><dt>{selected.type === 'class' ? '类型' : '数据类型或方向'}</dt><dd>{selected.type === 'class' ? '本体类' : selected.dataType || '—'}</dd></div><div><dt>约束</dt><dd>{selected.constraint || '—'}</dd></div><div><dt>业务说明</dt><dd>{selected.description || '—'}</dd></div></dl>{selected.type === 'class' && <><section className="inspector-list"><h3>类属性 <b>{selectedProperties.length}</b></h3>{selectedProperties.length ? selectedProperties.map((item) => <button key={item.id} onClick={() => { setSelectedCode(item.code); setFocusActive(true) }}><span>{item.name}</span><small>{item.dataType}</small></button>) : <p>暂未配置属性</p>}</section><section className="inspector-list"><h3>关联关系 <b>{selectedRelations.length}</b></h3>{selectedRelations.length ? selectedRelations.map((item) => <button key={item.id} onClick={() => { setSelectedCode(item.code); setFocusActive(true) }}><span>{item.name}</span><small>{item.dataType}</small></button>) : <p>暂未配置关系</p>}</section></>}<Button icon="edit" disabled={readonly} title={readonly ? '已发布版本只读，请先复制新版本' : undefined} onClick={() => onEdit(selected.type, selected)}>编辑当前元素</Button></> : <EmptyState title="请选择画布元素" description="点击球形节点或关系曲线查看详细定义。"/>}
    </aside>
  </div>
}
