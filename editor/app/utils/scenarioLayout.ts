import dagre from '@dagrejs/dagre'
import type { Edge, Node } from '@vue-flow/core'

const NODE_GAP = 28
const RANK_GAP = 80

/**
 * Рёбра, замыкающие цикл (поиск в глубину: ребро в ноду, что ещё на стеке).
 * Обход идёт от нод без входящих рёбер, затем от остальных по порядку.
 */
export function cycleEdgeIds(nodes: Node[], edges: Edge[]): Set<string> {
  const out = new Map<string, Edge[]>()
  const hasIncoming = new Set<string>()
  for (const e of edges) {
    out.set(e.source, [...(out.get(e.source) ?? []), e])
    hasIncoming.add(e.target)
  }
  const roots = [...nodes.filter((n) => !hasIncoming.has(n.id)), ...nodes.filter((n) => hasIncoming.has(n.id))]
  const state = new Map<string, 1 | 2>()
  const back = new Set<string>()
  const visit = (id: string) => {
    state.set(id, 1)
    for (const e of out.get(id) ?? []) {
      const st = state.get(e.target)
      if (st === 1) back.add(e.id)
      else if (!st) visit(e.target)
    }
    state.set(id, 2)
  }
  for (const n of roots) if (!state.has(n.id)) visit(n.id)
  return back
}

/**
 * Раскладка dagre слева направо по прямым рёбрам: рёбра, замыкающие цикл, не ранжируют ноды.
 * Без `all` ноды с известной позицией (`pos` шага) остаются на месте, остальные ложатся
 * по сетке; с `all` перекладывается всё.
 */
export function autoLayout(nodes: Node[], edges: Edge[], all: boolean): Node[] {
  const cycles = cycleEdgeIds(nodes, edges)
  const graph = new dagre.graphlib.Graph()
  graph.setGraph({ rankdir: 'LR', nodesep: NODE_GAP, ranksep: RANK_GAP, marginx: 24, marginy: 24 })
  graph.setDefaultEdgeLabel(() => ({}))
  for (const n of nodes) graph.setNode(n.id, { width: n.data.width, height: n.data.height })
  for (const e of edges) if (e.source !== e.target && !cycles.has(e.id)) graph.setEdge(e.source, e.target)
  dagre.layout(graph)
  return nodes.map((n) => {
    if (!all && n.data.placed) return n
    const p = graph.node(n.id)
    return { ...n, position: { x: p.x - n.data.width / 2, y: p.y - n.data.height / 2 } }
  })
}

const BACK_COLOR = '#c8cfd9'

/** Ребро назад: цель не правее источника. Такие рёбра помечаются классом `back` и светлеют. */
export function markBackEdges(nodes: Node[], edges: Edge[]): Edge[] {
  const x = new Map(nodes.map((n) => [n.id, n.position.x]))
  return edges.map((e) => {
    const back = e.source === e.target || (x.get(e.target) ?? 0) <= (x.get(e.source) ?? 0)
    if (!back) return e
    const marker = typeof e.markerEnd === 'object' ? { ...e.markerEnd, color: BACK_COLOR } : e.markerEnd
    return { ...e, class: 'back', markerEnd: marker }
  })
}
