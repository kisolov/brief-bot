import type { Edge, MarkerType, Node } from '@vue-flow/core'
import { NEXT_HANDLE, RETURN_TARGET } from '~/types/scenario'
import type { GraphView, Scenario, Step, StepType, Target } from '~/types/scenario'

/** Размеры ноды из артборда StepNode / BlockNode. */
export const NODE_WIDTH = 190
const HEAD_HEIGHT = 26
const TITLE_HEIGHT = 46
const ROW_HEIGHT = 28
/** Длинный список кнопок сворачивается в строку «ещё N кнопок», как в артборде StepNode. */
const COLLAPSE_OVER = 5
const COLLAPSE_SHOWN = 3
const TAIL_HEIGHT = 6
export const BLOCK_HEIGHT = 64

export const MAIN_VIEW = 'main'
/** Id карточки выхода на вкладке блока. */
export const EXIT_NODE = `stub:${RETURN_TARGET}`
/** Пункт левой панели: не шаг, а карточка выхода блока. */
export const EXIT_ITEM = 'exit'
export type PaletteItem = StepType | typeof EXIT_ITEM

/** Подписи типов шага, как в артборде StepNode. */
export const STEP_TYPE_LABELS: Record<StepType, string> = {
  choice: 'Один выбор',
  multi: 'Несколько ответов',
  multi_input: 'Несколько + поле',
  text: 'Текст',
  file: 'Файл',
  info: 'Сообщение',
}

const BLOCK_LABELS: Record<string, string> = {
  sections: 'Разделы сайта',
  sphere: 'Сфера деятельности',
  final: 'Финальные вопросы',
  site_examples: 'Примеры сайтов',
}

const NEXT_ROW_LABELS: Partial<Record<StepType, string>> = {
  text: 'Ответ текстом',
  file: 'Файл',
  info: 'Далее',
}

export interface ViewTab {
  view: GraphView
  label: string
}

export function blockLabel(name: string): string {
  return BLOCK_LABELS[name] ?? name
}

export function viewTabs(s: Pick<Scenario, 'blocks'>): ViewTab[] {
  return [
    { view: MAIN_VIEW, label: 'Основной сценарий' },
    ...Object.keys(s.blocks ?? {}).map((name) => ({ view: name, label: blockLabel(name) })),
  ]
}

interface Exit {
  handle: string
  target: Target
}

/** Выходы шага: по одному на кнопку с переходом и один собственный `next`. */
export function exitsOf(step: Step): Exit[] {
  const out: Exit[] = []
  for (const o of step.options ?? []) if (o.next !== undefined) out.push({ handle: o.id, target: o.next })
  if (step.next !== undefined) out.push({ handle: NEXT_HANDLE, target: step.next })
  return out
}

/**
 * Шаги, достижимые от `start`: вход в блок не заходит внутрь, идёт на `then`.
 * Шаги из `skip` не посещаются и обход через них не идёт.
 */
function reach(s: Scenario, start: string | undefined, skip: ReadonlySet<string> = new Set()): Set<string> {
  const seen = new Set<string>()
  const queue = start ? [start] : []
  while (queue.length) {
    const id = queue.pop()!
    const step = s.steps[id]
    if (seen.has(id) || skip.has(id) || !step) continue
    seen.add(id)
    for (const { target } of exitsOf(step)) {
      const next = typeof target === 'string' ? target : target.then
      if (next && next !== RETURN_TARGET) queue.push(next)
    }
  }
  return seen
}

/**
 * Вкладки по стрелкам, только для черновика без `tab`: главный граф это шаги, достижимые от `entry`,
 * не заходя в блок (ни входом `call`, ни прямым переходом на первый шаг блока); блок это шаги,
 * достижимые от его первого шага без `@return`, кроме шагов главного графа и первых шагов других блоков.
 * Шаг, не попавший никуда, остаётся на главной: он не должен пропасть с экрана.
 */
function tabsByArrows(s: Scenario): Record<string, string> {
  const starts = new Set(Object.values(s.blocks ?? {}))
  const main = reach(s, s.entry, starts)
  const tabs: Record<string, string> = {}
  for (const [name, first] of Object.entries(s.blocks ?? {})) {
    const skip = new Set([...main, ...starts])
    skip.delete(first)
    for (const id of reach(s, first, skip)) tabs[id] ??= name
  }
  return tabs
}

/**
 * Шаги с вкладками. Черновик, где `tab` нет ни у кого, получает их один раз, по стрелкам. После этого
 * вкладка меняется только явным действием: у первого шага блока `tab` есть всегда, он и служит признаком.
 */
export function withTabs(s: Scenario): Record<string, Step> {
  if (Object.values(s.steps).some((step) => step.tab !== undefined)) return s.steps
  const tabs = tabsByArrows(s)
  return Object.fromEntries(
    Object.entries(s.steps).map(([id, step]) => [id, tabs[id] === undefined ? step : { ...step, tab: tabs[id] }]),
  )
}

/** Вкладка шага; `tab` удалённого блока это главная: шаг не должен пропасть с экрана. */
function tabOf(s: Scenario, id: string): GraphView {
  const tab = s.steps[id]?.tab
  return tab !== undefined && s.blocks?.[tab] !== undefined ? tab : MAIN_VIEW
}

/** Шаги вида: хранимая вкладка плюс первый шаг блока, без которого вкладка осталась бы пустой. */
function stepsOf(s: Scenario, view: GraphView): Set<string> {
  const ids = new Set(Object.keys(s.steps).filter((id) => tabOf(s, id) === view))
  const first = s.blocks?.[view]
  if (first !== undefined && s.steps[first]) ids.add(first)
  return ids
}

/** Вид, где шаг виден: главный граф или имя общего блока. */
export function viewOfStep(s: Scenario, id: string): GraphView | null {
  return s.steps[id] ? tabOf(s, id) : null
}

/** Шаги вида в порядке сценария. */
export function stepIdsOf(s: Scenario, view: GraphView): string[] {
  const inView = stepsOf(s, view)
  return Object.keys(s.steps).filter((id) => inView.has(id))
}

export function titleOf(step: Step): string {
  return (step.text ?? '').split('\n')[0]!.trim()
}

const ARROW = { type: 'arrowclosed' as MarkerType, color: '#7c8796', width: 14, height: 14 }
/** Цвет `--accent`: цвет маркера Vue Flow это значение атрибута, переменная CSS в нём не работает. */
const ACCENT = '#1f4fbf'
/** Область попадания по стрелке шире линии: тонкую стрелку иначе не поймать. */
export const EDGE_HIT_WIDTH = 18

/**
 * Выделяет стрелку `id` (`null` снимает выделение): класс `selected` (толщина и цвет в стилях схемы)
 * и стрелка цвета `--accent`. Поля `selected`, `zIndex` и `class` пишутся у всех рёбер: Vue Flow сливает новое ребро
 * с прежним и не снимет выделение, которого в новом ребре нет.
 */
export function selectEdge(edges: Edge[], id: string | null): Edge[] {
  return edges.map((e) => {
    const classes = String(e.class ?? '').split(' ').filter((c) => c && c !== 'selected')
    if (e.id !== id) return { ...e, selected: false, zIndex: 0, class: classes.join(' ') }
    return {
      ...e,
      selected: true,
      // слой над нодами: линия видна поверх карточки, якорь цели не прячется под чужими областями попадания;
      // указатель линия не принимает (стили схемы), так что карточку под ней можно тянуть
      zIndex: 1,
      class: [...classes, 'selected'].join(' '),
      // линия толще, а маркер Vue Flow растёт вместе с ней: уменьшаем, чтобы стрелка не стала громоздкой
      markerEnd: typeof e.markerEnd === 'object' ? { ...e.markerEnd, color: ACCENT, width: 9, height: 9 } : e.markerEnd,
    }
  })
}

/** Что находится под точкой, где отпущен конец стрелки. */
export interface DropTarget {
  /** Нода под точкой (шаг, карточка, порт), если есть. */
  nodeId: string | null
  /** Точка на пустом холсте, а не над подсказкой, зумом или миникартой. */
  onPane: boolean
}

export type EdgeDrop =
  | { kind: 'none' }
  | { kind: 'connect'; source: string; handle: string; target: string }
  | { kind: 'detach'; source: string; handle: string }

/**
 * Решение по отпущенному концу стрелки: на другой ноде переподключить, на пустом холсте отсоединить.
 * Прежняя цель, нода-источник, зум, подсказка, миникарта, конфликт версий и стрелка без порта ничего не меняют.
 */
export function edgeDropOutcome(
  edge: { source: string; sourceHandle?: string | null; target: string },
  at: DropTarget,
  locked: boolean,
): EdgeDrop {
  const handle = edge.sourceHandle
  if (locked || !handle) return { kind: 'none' }
  if (at.nodeId) {
    return at.nodeId === edge.target || at.nodeId === edge.source
      ? { kind: 'none' }
      : { kind: 'connect', source: edge.source, handle, target: at.nodeId }
  }
  return at.onPane ? { kind: 'detach', source: edge.source, handle } : { kind: 'none' }
}

export function toFlow(s: Scenario, view: GraphView): { nodes: Node[]; edges: Edge[] } {
  const inView = stepsOf(s, view)
  const nodes: Node[] = []
  const edges: Edge[] = []
  const extra = new Map<string, Node>()

  const link = (source: string, sourceHandle: string, target: string) =>
    edges.push({
      id: `${source}:${sourceHandle}`,
      source,
      sourceHandle,
      target,
      targetHandle: 'in',
      markerEnd: ARROW,
      interactionWidth: EDGE_HIT_WIDTH,
      // тянуть можно только конец у цели: начало стрелки принадлежит кнопке или выходу шага
      updatable: 'target',
    })

  const places = s.cards?.[view] ?? []
  const placeOf = (block: string, then?: string) =>
    places.find((p) => p.block === block && (p.then || undefined) === (then || undefined))?.pos

  const stubFor = (id: string): string => {
    const key = `stub:${id}`
    if (!extra.has(key)) {
      const kind = id === RETURN_TARGET ? 'return' : s.steps[id] ? 'link' : 'broken'
      const label = kind === 'return' ? 'Дальше по сценарию' : kind === 'link' ? titleOf(s.steps[id]!) : id
      const kindLabel = { return: 'Выход из блока', link: 'Переход на шаг', broken: 'Нет такого шага' }[kind]
      const pos = kind === 'return' ? s.exits?.[view] : undefined
      extra.set(key, node(key, 'stub', { label, title: label, kind, kindLabel, stepId: id, width: NODE_WIDTH, height: BLOCK_HEIGHT }, pos))
    }
    return key
  }

  const resolve = (id: string): string => (inView.has(id) ? id : stubFor(id))

  /**
   * Карточка общего блока одна на пару «блок, куда вернуться». `sources` это шаги этой схемы,
   * из переходов которых она собрана: стрелка от её выхода меняет `then` именно у них.
   */
  const callFor = (block: string, then: string | undefined, from?: string): string => {
    const key = `call:${block}>${then ?? ''}`
    const existing = extra.get(key)
    if (existing) {
      if (from && !existing.data.sources.includes(from)) existing.data.sources.push(from)
      return key
    }
    extra.set(
      key,
      node(
        key,
        'block',
        {
          block,
          then: then || undefined,
          sources: from ? [from] : [],
          view,
          title: blockLabel(block),
          kindLabel: 'Общий блок',
          width: NODE_WIDTH,
          height: BLOCK_HEIGHT,
        },
        placeOf(block, then),
      ),
    )
    if (then) link(key, 'out', resolve(then))
    return key
  }

  for (const id of Object.keys(s.steps)) {
    const step = s.steps[id]!
    if (!inView.has(id)) continue
    const rows = rowsOf(step)
    nodes.push(
      node(
        id,
        'step',
        {
          stepId: id,
          stepType: step.type,
          typeLabel: STEP_TYPE_LABELS[step.type] ?? step.type,
          title: titleOf(step),
          rows,
          width: NODE_WIDTH,
          height: HEAD_HEIGHT + TITLE_HEIGHT + rows.length * ROW_HEIGHT + TAIL_HEIGHT,
        },
        step.pos,
      ),
    )
    for (const { handle, target } of exitsOf(step)) {
      if (typeof target === 'string') link(id, handle, target === RETURN_TARGET ? stubFor(target) : resolve(target))
      else link(id, handle, callFor(target.call, target.then, id))
    }
  }

  // Поставленная карточка стоит и без стрелок: к ней их потом и проводят
  for (const p of places) if (s.blocks[p.block] !== undefined) callFor(p.block, p.then)

  // Выход блока есть всегда: иначе, сняв последнюю стрелку, вести новую было бы некуда
  if (view !== MAIN_VIEW) stubFor(RETURN_TARGET)

  return { nodes: [...nodes, ...extra.values()], edges }
}

interface Row {
  handle: string
  label: string
  /** Для строки «ещё N кнопок»: выходы свёрнутых кнопок, у каждой свой порт на этой строке. */
  more?: string[]
}

function rowsOf(step: Step): Row[] {
  const options = (step.options ?? []).map((o) => ({ handle: o.id, label: o.label }))
  const fold = options.length > COLLAPSE_OVER
  const rows: Row[] = fold ? options.slice(0, COLLAPSE_SHOWN) : options
  if (fold) {
    const hidden = options.slice(COLLAPSE_SHOWN)
    rows.push({ handle: '', label: `ещё ${hidden.length} ${buttons(hidden.length)}`, more: hidden.map((o) => o.handle) })
  }
  const needsNext = step.next !== undefined || ['text', 'file', 'multi', 'multi_input'].includes(step.type)
  if (needsNext) {
    const label = step.done_label ?? NEXT_ROW_LABELS[step.type] ?? 'Готово'
    rows.push({ handle: NEXT_HANDLE, label })
  }
  return rows
}

function buttons(n: number): string {
  const tail = n % 100
  if (tail >= 11 && tail <= 14) return 'кнопок'
  const last = n % 10
  if (last === 1) return 'кнопка'
  return last >= 2 && last <= 4 ? 'кнопки' : 'кнопок'
}

function node(id: string, type: string, data: Record<string, unknown>, pos?: [number, number]): Node {
  return {
    id,
    type,
    position: pos ? { x: pos[0], y: pos[1] } : { x: 0, y: 0 },
    data: { ...data, placed: Boolean(pos) },
  }
}
