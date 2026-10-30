import dagre from '@dagrejs/dagre'
import type { Edge, Node } from '@vue-flow/core'

const NODE_GAP = 28
const RANK_GAP = 80

/**
 * Раскладка dagre слева направо. Без `all` ноды с известной позицией (`pos` шага)
 * остаются на месте, остальные ложатся по сетке; с `all` перекладывается всё.
 */
export function autoLayout(nodes: Node[], edges: Edge[], all: boolean): Node[] {
  const graph = new dagre.graphlib.Graph()
  graph.setGraph({ rankdir: 'LR', nodesep: NODE_GAP, ranksep: RANK_GAP, marginx: 24, marginy: 24 })
  graph.setDefaultEdgeLabel(() => ({}))
  for (const n of nodes) graph.setNode(n.id, { width: n.data.width, height: n.data.height })
  for (const e of edges) if (e.source !== e.target) graph.setEdge(e.source, e.target)
  dagre.layout(graph)
  return nodes.map((n) => {
    if (!all && n.data.placed) return n
    const p = graph.node(n.id)
    return { ...n, position: { x: p.x - n.data.width / 2, y: p.y - n.data.height / 2 } }
  })
}
