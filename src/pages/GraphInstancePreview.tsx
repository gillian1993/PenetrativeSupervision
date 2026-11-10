import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import cytoscape, { type Core, type EventObject, type CollectionReturnValue } from 'cytoscape'
import type { GraphVersion } from '../types'
import { Icon } from '../ui'
import './graphInstancePreview.css'

type InstanceDataset = NonNullable<GraphVersion['instanceDataset']>
type PreviewNode = InstanceDataset['nodes'][number] & { color: string }
type PreviewRelation = InstanceDataset['relations'][number]
type Selection = { kind: 'node' | 'edge'; id: string } | null
type OverviewRow = { id: string; name: string; count?: number; color?: string }
type MapPoint = { id: string; x: number; y: number; color: string }
type MapSnapshot = { points: MapPoint[]; lines: Array<{ id: string; x1: number; y1: number; x2: number; y2: number }>; viewport: { x: number; y: number; width: number; height: number }; scale: number; left: number; top: number }

const TYPE_COLORS = ['#4272ff', '#32c5e9', '#ff7447', '#7945ff', '#23c59c', '#a34bff', '#30ce45', '#e49a26']
const OVERVIEW_PAGE_SIZE = 10
const MAP_WIDTH = 240
const MAP_HEIGHT = 144

export function graphEntityColor(typeCode: string, typeName: string) {
  const hash = Array.from(typeCode || typeName).reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0)
  return TYPE_COLORS[hash % TYPE_COLORS.length]
}

function nodeImage(node: PreviewNode) {
  const initial = (Array.from(node.name.trim())[0] || '?').toUpperCase().replace(/[<>&"']/g, '')
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><text x="24" y="25" dy=".35em" text-anchor="middle" fill="${node.color}" font-family="Microsoft YaHei, sans-serif" font-size="23" font-weight="600">${initial}</text></svg>`)}`
}

function PreviewIcon({ name }: { name: 'minus' | 'plus' | 'reset' | 'cube' | 'eye-off' }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'minus' || name === 'plus' ? <><circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5M7 10h6"/>{name === 'plus' && <path d="M10 7v6"/>}</> : name === 'reset' ? <><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/></> : name === 'cube' ? <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9M8 5.2l8 4.6"/></> : <><path d="M3 3 21 21M10.6 5.2A12 12 0 0 1 22 12a16 16 0 0 1-4 4.5M6.3 6.3A17 17 0 0 0 2 12s4 7 10 7a12 12 0 0 0 5-1.2"/><path d="M10 10a3 3 0 0 0 4 4"/></>}
  </svg>
}

export function GraphInstancePreview({ nodes, relations, selection, onSelect, onReset }: {
  nodes: PreviewNode[]
  relations: PreviewRelation[]
  selection: Selection
  onSelect: (selection: Selection) => void
  onReset: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const coreRef = useRef<Core | null>(null)
  const onSelectRef = useRef(onSelect)
  const overviewOpenRef = useRef(true)
  const fitRef = useRef<(elements?: CollectionReturnValue) => void>(() => {})
  const mapRef = useRef<MapSnapshot | null>(null)
  const [overviewOpen, setOverviewOpen] = useState(true)
  const [tab, setTab] = useState<'entities' | 'relations'>('entities')
  const [activeType, setActiveType] = useState('')
  const [relationFocus, setRelationFocus] = useState('')
  const [listKeyword, setListKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [hiddenNodes, setHiddenNodes] = useState<Set<string>>(new Set())
  const [hiddenRelations, setHiddenRelations] = useState<Set<string>>(new Set())
  const [relationsHidden, setRelationsHidden] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [map, setMap] = useState<MapSnapshot | null>(null)
  const [tooltip, setTooltip] = useState<{ name: string; x: number; y: number } | null>(null)
  onSelectRef.current = onSelect
  overviewOpenRef.current = overviewOpen

  const entityTypes = useMemo(() => {
    const types = new Map<string, OverviewRow>()
    nodes.forEach((node) => {
      const type = types.get(node.typeCode)
      if (type) type.count = (type.count || 0) + 1
      else types.set(node.typeCode, { id: node.typeCode, name: node.typeName, color: node.color, count: 1 })
    })
    return Array.from(types.values())
  }, [nodes])
  const relationTypes = useMemo(() => {
    const types = new Map<string, OverviewRow>()
    relations.forEach((relation) => {
      const type = types.get(relation.typeCode)
      if (type) type.count = (type.count || 0) + 1
      else types.set(relation.typeCode, { id: relation.typeCode, name: relation.name, count: 1 })
    })
    return Array.from(types.values())
  }, [relations])
  const selectedType = entityTypes.find((type) => type.id === activeType)
  const searchPlaceholder = tab === 'relations' ? '搜索关系名称' : selectedType ? '搜索实体实例名称' : '搜索实体类型名称'
  const rows = useMemo(() => {
    const source: OverviewRow[] = tab === 'relations' ? relationTypes : selectedType ? nodes.filter((node) => node.typeCode === activeType).map((node) => ({ id: node.id, name: node.name })) : entityTypes
    const keyword = listKeyword.trim().toLowerCase()
    return source.filter((row) => !keyword || `${row.name} ${row.id}`.toLowerCase().includes(keyword))
  }, [tab, relationTypes, selectedType, nodes, activeType, entityTypes, listKeyword])
  const pageCount = Math.max(1, Math.ceil(rows.length / OVERVIEW_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pagedRows = rows.slice((currentPage - 1) * OVERVIEW_PAGE_SIZE, currentPage * OVERVIEW_PAGE_SIZE)
  const shownNodeCount = nodes.filter((node) => !hiddenNodes.has(node.id)).length
  const shownRelationCount = relations.filter((relation) => !relationsHidden && !hiddenRelations.has(relation.typeCode) && !hiddenNodes.has(relation.sourceId) && !hiddenNodes.has(relation.targetId)).length

  useEffect(() => {
    if (!containerRef.current) return
    const core = cytoscape({
      container: containerRef.current,
      elements: [
        ...nodes.map((node) => ({ data: { id: node.id, fullName: node.name, label: Array.from(node.name).length > 13 ? `${Array.from(node.name).slice(0, 12).join('')}…` : node.name, typeCode: node.typeCode, color: node.color, image: nodeImage(node) }, position: { x: node.x, y: node.y } })),
        ...relations.map((relation) => ({ data: { id: relation.id, source: relation.sourceId, target: relation.targetId, fullName: relation.name, label: Array.from(relation.name).length > 13 ? `${Array.from(relation.name).slice(0, 12).join('')}…` : relation.name, typeCode: relation.typeCode } })),
      ],
      minZoom: .08, maxZoom: 2.5,
      style: [
        { selector: 'node', style: { width: 46, height: 46, 'background-color': 'data(color)', 'background-opacity': .16, 'background-image': 'data(image)', 'background-width': '100%', 'background-height': '100%', 'border-width': 2, 'border-color': 'data(color)', label: 'data(label)', color: '#5b6474', 'font-family': 'Microsoft YaHei, sans-serif', 'font-size': 11, 'text-valign': 'bottom', 'text-margin-y': 7, 'overlay-opacity': 0 } },
        { selector: 'edge', style: { width: 1.2, 'line-color': '#c9cedb', 'target-arrow-color': '#c9cedb', 'target-arrow-shape': 'triangle', 'arrow-scale': .7, 'curve-style': 'bezier', label: 'data(label)', color: '#535d70', 'font-family': 'Microsoft YaHei, sans-serif', 'font-size': 10, 'text-rotation': 'autorotate', 'text-background-color': '#ffffff', 'text-background-opacity': .96, 'text-background-padding': '4px', 'text-background-shape': 'roundrectangle', 'text-border-color': '#d5dae6', 'text-border-width': 1, 'text-border-opacity': 1, 'overlay-opacity': 0 } },
        { selector: '.muted', style: { opacity: .15 } },
        { selector: 'node.highlighted, node:selected', style: { 'border-width': 3.5, 'underlay-color': 'data(color)', 'underlay-opacity': .1, 'underlay-padding': 6, 'font-weight': 'bold', color: '#26334c' } },
        { selector: 'edge.highlighted, edge:selected', style: { width: 2.2, 'line-color': '#4272ff', 'target-arrow-color': '#4272ff', color: '#2458e8', 'text-border-color': '#9db5ff' } },
        { selector: '.concealed', style: { display: 'none' } },
      ],
      layout: { name: 'preset', fit: false },
    })
    coreRef.current = core
    let frame = 0
    const updateMap = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const visibleNodes = core.nodes().not('.concealed').nodes()
        if (!visibleNodes.length) { mapRef.current = null; setMap(null); return }
        const bounds = visibleNodes.boundingBox({ includeLabels: false, includeOverlays: false })
        const scale = Math.min((MAP_WIDTH - 32) / Math.max(bounds.w, 80), (MAP_HEIGHT - 28) / Math.max(bounds.h, 80))
        const left = (MAP_WIDTH - bounds.w * scale) / 2 - bounds.x1 * scale
        const top = (MAP_HEIGHT - bounds.h * scale) / 2 - bounds.y1 * scale
        const extent = core.extent()
        const snapshot: MapSnapshot = {
          points: visibleNodes.map((node) => ({ id: node.id(), x: node.position('x') * scale + left, y: node.position('y') * scale + top, color: String(node.data('color')) })),
          lines: core.edges().not('.concealed').edges().map((edge) => ({ id: edge.id(), x1: edge.source().position('x') * scale + left, y1: edge.source().position('y') * scale + top, x2: edge.target().position('x') * scale + left, y2: edge.target().position('y') * scale + top })),
          viewport: { x: extent.x1 * scale + left, y: extent.y1 * scale + top, width: extent.w * scale, height: extent.h * scale }, scale, left, top,
        }
        mapRef.current = snapshot
        setMap(snapshot)
        setZoom(core.zoom())
      })
    }
    fitRef.current = (elements) => {
      const target = (elements || core.elements()).not('.concealed')
      if (!target.length) return
      const bounds = target.boundingBox({ includeLabels: true, includeOverlays: false })
      const inset = overviewOpenRef.current && core.width() > 680 ? 284 : 24
      const availableWidth = Math.max(160, core.width() - inset - 40)
      const availableHeight = Math.max(160, core.height() - 150)
      const level = Math.min(1.6, Math.max(core.minZoom(), Math.min(availableWidth / Math.max(bounds.w, 90), availableHeight / Math.max(bounds.h, 90))))
      core.viewport({ zoom: level, pan: { x: inset + availableWidth / 2 - (bounds.x1 + bounds.w / 2) * level, y: 85 + availableHeight / 2 - (bounds.y1 + bounds.h / 2) * level } })
    }
    core.on('tap', 'node', (event: EventObject) => onSelectRef.current({ kind: 'node', id: event.target.id() }))
    core.on('tap', 'edge', (event: EventObject) => onSelectRef.current({ kind: 'edge', id: event.target.id() }))
    core.on('tap', (event: EventObject) => { if (event.target === core) onSelectRef.current(null) })
    core.on('mouseover', 'node, edge', (event: EventObject) => {
      const position = event.target.isNode() ? event.target.renderedPosition() : event.renderedPosition
      if (position) setTooltip({ name: String(event.target.data('fullName')), x: position.x, y: position.y })
    })
    core.on('mouseout drag pan zoom', () => setTooltip(null))
    core.on('pan zoom position add remove style', updateMap)
    const observer = new ResizeObserver(() => { core.resize(); updateMap() })
    observer.observe(containerRef.current)
    fitRef.current()
    updateMap()
    return () => { observer.disconnect(); cancelAnimationFrame(frame); core.destroy(); coreRef.current = null; mapRef.current = null }
  }, [nodes, relations])

  useEffect(() => {
    const core = coreRef.current
    if (!core) return
    core.batch(() => {
      core.elements().removeClass('muted highlighted concealed').unselect()
      core.nodes().filter((node) => hiddenNodes.has(node.id())).addClass('concealed')
      core.edges().filter((edge) => relationsHidden || hiddenRelations.has(String(edge.data('typeCode'))) || hiddenNodes.has(edge.source().id()) || hiddenNodes.has(edge.target().id())).addClass('concealed')
      const focusedEdges = relationFocus ? core.edges().filter((edge) => edge.data('typeCode') === relationFocus).not('.concealed') : core.collection()
      const selected = selection ? core.getElementById(selection.id).not('.concealed') : core.collection()
      let focused = core.collection()
      if (selected.length) {
        const adjacentEdges = selected.connectedEdges().not('.concealed').edges()
        focused = selection?.kind === 'node'
          ? selected.union(adjacentEdges).union(adjacentEdges.connectedNodes())
          : selected.union(selected.edges().connectedNodes())
      } else if (relationFocus) focused = focusedEdges.union(focusedEdges.edges().connectedNodes())
      else if (activeType) focused = core.nodes().filter((node) => node.data('typeCode') === activeType).not('.concealed')
      if (focused.length) { core.elements().addClass('muted'); focused.removeClass('muted').addClass('highlighted') }
      selected.select()
    })
  }, [nodes, relations, selection, activeType, relationFocus, hiddenNodes, hiddenRelations, relationsHidden])

  useEffect(() => {
    const core = coreRef.current
    if (!core) return
    const selected = selection ? core.getElementById(selection.id) : core.collection()
    const edges = relationFocus ? core.edges().filter((edge) => edge.data('typeCode') === relationFocus) : core.collection()
    if (selected.length) fitRef.current(selected.union(selection?.kind === 'node' ? selected.closedNeighborhood() : selected.edges().connectedNodes()))
    else if (edges.length) fitRef.current(edges.union(edges.connectedNodes()))
  }, [nodes, relations, selection, relationFocus])

  const changeZoom = (factor: number) => {
    const core = coreRef.current
    if (!core) return
    core.zoom({ level: Math.max(core.minZoom(), Math.min(core.maxZoom(), core.zoom() * factor)), renderedPosition: { x: core.width() / 2, y: core.height() / 2 } })
  }
  const reset = () => {
    onSelect(null); onReset()
  }
  const selectRow = (row: OverviewRow) => {
    if (tab === 'relations') {
      setRelationFocus((current) => current === row.id ? '' : row.id)
      setHiddenRelations((current) => { const next = new Set(current); next.delete(row.id); return next })
      setHiddenNodes((current) => {
        const next = new Set(current)
        relations.filter((relation) => relation.typeCode === row.id).forEach((relation) => { next.delete(relation.sourceId); next.delete(relation.targetId) })
        return next
      })
      setRelationsHidden(false); onSelect(null)
    } else if (!selectedType) { setActiveType(row.id); setRelationFocus(''); setListKeyword(''); setPage(1); onSelect(null) }
    else {
      setHiddenNodes((current) => { const next = new Set(current); next.delete(row.id); return next })
      onSelect({ kind: 'node', id: row.id })
    }
  }
  const toggleVisibility = (row: OverviewRow) => {
    const toggle = (current: Set<string>) => { const next = new Set(current); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next }
    if (tab === 'relations') {
      if (relationsHidden) {
        setRelationsHidden(false)
        setHiddenRelations(new Set(relationTypes.filter((type) => type.id !== row.id).map((type) => type.id)))
      } else setHiddenRelations(toggle)
      if (selection?.kind === 'edge' && relations.some((relation) => relation.id === selection.id && relation.typeCode === row.id)) onSelect(null)
    } else { setHiddenNodes(toggle); if (selection?.id === row.id) onSelect(null) }
  }
  const navigateMap = (event: ReactPointerEvent<SVGSVGElement>) => {
    const core = coreRef.current
    const snapshot = mapRef.current
    if (!core || !snapshot) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - bounds.left) * MAP_WIDTH / bounds.width - snapshot.left) / snapshot.scale
    const y = ((event.clientY - bounds.top) * MAP_HEIGHT / bounds.height - snapshot.top) / snapshot.scale
    core.pan({ x: core.width() / 2 - x * core.zoom(), y: core.height() / 2 - y * core.zoom() })
  }

  return <div className={`graph-preview${overviewOpen ? '' : ' overview-collapsed'}`}>
    <div ref={containerRef} className="graph-preview-canvas" role="img" aria-label="知识图谱实例关系视图"/>
    <aside className="graph-preview-overview" aria-label="结果概览">
      <header>
        <button type="button" className="graph-preview-overview-title" aria-expanded={overviewOpen} onClick={() => setOverviewOpen((open) => !open)}><span className="overview-caret">{overviewOpen ? '▾' : '▸'}</span><strong>结果概览</strong></button>
        <button type="button" className="graph-preview-icon-button" aria-label="重置结果概览" data-tooltip="重置结果概览" onClick={reset}><Icon name="refresh" size={17}/></button>
      </header>
      {overviewOpen && <>
        {selectedType && tab === 'entities' ? <button type="button" className="graph-preview-type-back" onClick={() => { setActiveType(''); setListKeyword(''); setPage(1); onSelect(null) }}><Icon name="chevron" size={14}/><PreviewIcon name="cube"/><span>{selectedType.name} ({selectedType.count})</span><i style={{ background: selectedType.color }}/></button> : <div className="graph-preview-tabs" role="tablist" aria-label="结果概览分类">{(['entities', 'relations'] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? 'active' : ''} onClick={() => { setTab(item); setActiveType(''); setRelationFocus(''); setListKeyword(''); setPage(1); onSelect(null) }}>{item === 'entities' ? '实体' : '关系'}</button>)}</div>}
        <label className="graph-preview-list-search"><input aria-label={searchPlaceholder} placeholder={searchPlaceholder} value={listKeyword} onChange={(event) => { setListKeyword(event.target.value); setPage(1) }}/><Icon name="search" size={17}/></label>
        <div className="graph-preview-overview-list">
          {pagedRows.map((row) => {
            const hidden = tab === 'relations' ? hiddenRelations.has(row.id) || relationsHidden : hiddenNodes.has(row.id)
            const active = tab === 'relations' ? relationFocus === row.id : selection?.id === row.id
            return <div className={`graph-preview-overview-row${active ? ' active' : ''}${hidden ? ' is-hidden' : ''}`} key={row.id}>
              <button type="button" className="graph-preview-row-name" onClick={() => selectRow(row)} title={row.name}>{tab === 'relations' ? <Icon name="graph" size={17}/> : !selectedType ? <PreviewIcon name="cube"/> : null}<span>{row.name}{row.count !== undefined && <small> ({row.count})</small>}</span></button>
              {tab === 'entities' && !selectedType ? <i className="graph-preview-type-color" style={{ background: row.color }}/> : <button type="button" className="graph-preview-icon-button graph-preview-row-eye" aria-label={`${hidden ? '显示' : '隐藏'}${row.name}`} aria-pressed={hidden} data-tooltip={`${hidden ? '显示' : '隐藏'}${tab === 'relations' ? '关系' : '实体'}`} onClick={() => toggleVisibility(row)}>{hidden ? <PreviewIcon name="eye-off"/> : <Icon name="eye" size={17}/>}</button>}
            </div>
          })}
          {!rows.length && <div className="graph-preview-list-empty">{listKeyword ? '没有匹配的结果' : tab === 'relations' ? '暂无关系' : '暂无实体'}</div>}
        </div>
        <footer className="graph-preview-pagination"><span>共 {rows.length} {selectedType ? '个实体' : tab === 'relations' ? '类关系' : '个类型'}</span><button type="button" aria-label="结果概览上一页" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹</button><input aria-label="结果概览页码" type="number" min={1} max={pageCount} value={currentPage} onChange={(event) => setPage(Math.max(1, Math.min(pageCount, Number(event.target.value) || 1)))}/><b>/ {pageCount}</b><button type="button" aria-label="结果概览下一页" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>›</button></footer>
      </>}
    </aside>
    <div className="graph-preview-tools" role="toolbar" aria-label="图谱画布工具栏">
      <button type="button" className="graph-preview-icon-button" aria-label="缩小" data-tooltip="缩小" disabled={zoom <= .081 || !shownNodeCount} onClick={() => changeZoom(1 / 1.2)}><PreviewIcon name="minus"/></button>
      <output aria-label="当前缩放比例">{Math.round(zoom * 100)}%</output>
      <button type="button" className="graph-preview-icon-button" aria-label="放大" data-tooltip="放大" disabled={zoom >= 2.499 || !shownNodeCount} onClick={() => changeZoom(1.2)}><PreviewIcon name="plus"/></button>
      <button type="button" className="graph-preview-icon-button" aria-label="复位" data-tooltip="复位" disabled={!shownNodeCount} onClick={() => fitRef.current()}><PreviewIcon name="reset"/></button>
      <span className="graph-preview-tool-divider"/>
      <button type="button" className={`graph-preview-icon-button${relationsHidden ? ' active' : ''}`} aria-label={relationsHidden ? '显示关系连线' : '隐藏关系连线'} aria-pressed={relationsHidden} data-tooltip={relationsHidden ? '显示关系连线' : '隐藏关系连线'} onClick={() => { setRelationsHidden((hidden) => !hidden); if (selection?.kind === 'edge') onSelect(null) }}><Icon name="graph" size={19}/></button>
    </div>
    {!shownNodeCount && <div className="graph-preview-empty"><Icon name="graph" size={28}/><strong>{nodes.length ? '当前实体已全部隐藏' : '没有找到匹配实例'}</strong><span>{nodes.length ? '可在结果概览中显示实体，或重置结果概览。' : '请调整搜索条件，或重置结果概览。'}</span><button type="button" onClick={reset}>重置结果概览</button></div>}
    {tooltip && <div className="graph-preview-node-tooltip" style={{ left: Math.max(12, Math.min(tooltip.x, (containerRef.current?.clientWidth || 800) - 180)), top: Math.max(70, tooltip.y - 50) }}>{tooltip.name}</div>}
    {map && <div className="graph-preview-minimap"><svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} role="img" aria-label="图谱缩略图，单击或拖动定位" tabIndex={0} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); navigateMap(event) }} onPointerMove={(event) => { if (event.buttons === 1) navigateMap(event) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fitRef.current() } }}>
      {map.lines.map((line) => <line key={line.id} {...{ x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2 }} stroke="#dbe0ed" strokeWidth=".65"/>)}
      {map.points.map((point) => <circle key={point.id} cx={point.x} cy={point.y} r="2.4" fill={point.color} fillOpacity=".18" stroke={point.color} strokeOpacity=".6" strokeWidth=".7"/>)}
      <rect className="graph-preview-minimap-viewport" x={map.viewport.x} y={map.viewport.y} width={map.viewport.width} height={map.viewport.height}/>
    </svg></div>}
    <div className="graph-preview-status" aria-live="polite">{shownNodeCount} 个实体<span>·</span>{shownRelationCount} 条关系</div>
  </div>
}
