import dagre from '@dagrejs/dagre'
import type { Edge, Node } from '@vue-flow/core'
import type { GraphView, Scenario, Step } from '~/types/scenario'
import { toFlow, viewOfStep, viewTabs, withTabs } from '~/utils/scenarioGraph'

const NODE_GAP = 28
const RANK_GAP = 80
/** Отступ от края схемы, как у dagre. */
const MARGIN = 24

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
  graph.setGraph({ rankdir: 'LR', nodesep: NODE_GAP, ranksep: RANK_GAP, marginx: MARGIN, marginy: MARGIN })
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

/** Шаги с `pos` из раскладки вкладки: dagre считает все ноды, записываются только нужные шаги. */
function laidSteps(nodes: Node[], edges: Edge[], all: boolean): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {}
  for (const n of autoLayout(nodes, edges, all)) {
    if (n.type === 'step' && (all || !n.data.placed)) out[n.id] = [Math.round(n.position.x), Math.round(n.position.y)]
  }
  return out
}

/** Новые позиции шагов вкладки для кнопки «Разложить». */
export function layoutTab(s: Scenario, view: GraphView): Record<string, [number, number]> {
  const { nodes, edges } = toFlow(s, view)
  return laidSteps(nodes, edges, true)
}

/**
 * Шаги после первичной загрузки: у каждого есть вкладка и `pos`. Заданный `pos` не меняется, остальные
 * берут место из dagre. После этого dagre не двигает шаги: его зовёт только «Разложить».
 */
export function settleSteps(s: Scenario): Record<string, Step> {
  const tabbed = { ...s, steps: withTabs(s) }
  if (Object.values(tabbed.steps).every((step) => step.pos)) return tabbed.steps
  const out = { ...tabbed.steps }
  for (const { view } of viewTabs(tabbed)) {
    const { nodes, edges } = toFlow(tabbed, view)
    for (const [id, pos] of Object.entries(laidSteps(nodes, edges, false))) {
      if (!out[id]!.pos) out[id] = { ...out[id]!, pos }
    }
  }
  return out
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

const boxOf = (n: Node): Box => ({ x: n.position.x, y: n.position.y, width: n.data.width, height: n.data.height })

/** Ближайшее сверху вниз место в колонке `box.x`, где карточка не налезает на занятые. */
function freeY(box: Box, taken: Box[]): number {
  let y = box.y
  for (;;) {
    const hit = taken.find(
      (t) => box.x < t.x + t.width && t.x < box.x + box.width && y < t.y + t.height + NODE_GAP && t.y < y + box.height + NODE_GAP,
    )
    if (!hit) return y
    y = hit.y + hit.height + NODE_GAP
  }
}

/** Точка правее всех занятых карточек, на уровне верхней. */
function rightOfAll(taken: Box[]): [number, number] {
  if (!taken.length) return [MARGIN, MARGIN]
  return [Math.max(...taken.map((t) => t.x + t.width)) + RANK_GAP, Math.min(...taken.map((t) => t.y))]
}

/** Точка правее самого правого из источников; без источников правее всех. */
function nextToSources(id: string, edges: Edge[], placed: Map<string, Box>): [number, number] | null {
  const sources = edges.flatMap((e) => (e.target === id && placed.has(e.source) ? [placed.get(e.source)!] : []))
  if (!sources.length) return null
  const source = sources.reduce((a, b) => (b.x > a.x || (b.x === a.x && b.y < a.y) ? b : a))
  return [source.x + source.width + RANK_GAP, source.y]
}

/**
 * Места карточек без `pos`: считаются от источника, без dagre, поэтому шаги с `pos` не двигаются.
 * Порядок важен: шаг без `pos`, выход из блока, карточки блоков, потом заглушки (их источником бывает
 * карточка блока). Выход из блока не зависит от стрелок: снятая стрелка оставляет его на месте.
 */
export function placeCards(nodes: Node[], edges: Edge[]): Node[] {
  const placed = new Map(nodes.filter((n) => n.data.placed).map((n) => [n.id, boxOf(n)]))
  const rest = nodes.filter((n) => !n.data.placed)
  const rank = (n: Node): number => (n.type === 'step' ? 0 : n.data.kind === 'return' ? 1 : n.type === 'block' ? 2 : 3)
  const settled = new Map<string, Node>()
  for (const n of [...rest].sort((a, b) => rank(a) - rank(b))) {
    const taken = [...placed.values()]
    const from = n.data.kind === 'return' ? null : nextToSources(n.id, edges, placed)
    const [x, y] = from ?? rightOfAll(taken)
    const box = { ...boxOf(n), x, y }
    box.y = freeY(box, taken)
    placed.set(n.id, box)
    settled.set(n.id, { ...n, position: { x: box.x, y: box.y } })
  }
  return nodes.map((n) => settled.get(n.id) ?? n)
}

/** Свободное место для нового шага рядом с `source`: правее него, ниже, если там занято. */
export function spotNear(s: Scenario, source: string): [number, number] | undefined {
  const view = viewOfStep(s, source)
  if (view === null) return undefined
  const steps = toFlow(s, view).nodes.filter((n) => n.type === 'step' && n.data.placed)
  const from = steps.find((n) => n.id === source)
  if (!from) return undefined
  const x = from.position.x + from.data.width + RANK_GAP
  const box = { ...boxOf(from), x, height: from.data.height }
  return [x, freeY(box, steps.map(boxOf))]
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
