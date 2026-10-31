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
function exitsOf(step: Step): Exit[] {
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
 * Шаги вида.
 * Главный граф: достижимые от `entry`, не заходя в блок (ни входом `call`, ни прямым
 * переходом на первый шаг блока). Блок: достижимые от его первого шага без `@return`,
 * не считая шагов главного графа и первых шагов других блоков. Шаг, который не показывает
 * ни один вид, попадает в главный граф: он не должен пропасть с экрана. Исключение: шаг,
 * созданный на вкладке блока (`homes`), пока он не подключён, показывается на этой вкладке.
 */
function stepsOf(s: Scenario, view: GraphView, homes: Homes = {}): Set<string> {
  const starts = new Set(Object.values(s.blocks ?? {}))
  const main = reach(s, s.entry, starts)
  const ownBlock = (name: string): Set<string> => {
    const first = s.blocks?.[name]
    const skip = new Set([...main, ...starts])
    if (first) skip.delete(first)
    return reach(s, first, skip)
  }
  const sets = new Map<GraphView, Set<string>>([[MAIN_VIEW, new Set(main)]])
  const owned = new Set(main)
  for (const name of Object.keys(s.blocks ?? {})) {
    const own = ownBlock(name)
    sets.set(name, own)
    for (const id of own) owned.add(id)
  }
  const homeOf = (id: string): GraphView => (homes[id] !== undefined && sets.has(homes[id]!) ? homes[id]! : MAIN_VIEW)
  const skip = new Set([...owned, ...starts])
  for (const id of Object.keys(s.steps)) {
    if (owned.has(id)) continue
    for (const x of reach(s, id, skip)) {
      sets.get(homeOf(id))!.add(x)
      owned.add(x)
    }
  }
  return sets.get(view) ?? new Set()
}

/** Шаг → вид, где он создан: пока шаг не подключён к схеме, он остаётся на этой вкладке. */
export type Homes = Record<string, GraphView>

/** Вид, где шаг виден: главный граф или имя общего блока. */
export function viewOfStep(s: Scenario, id: string, homes: Homes = {}): GraphView | null {
  for (const view of [MAIN_VIEW, ...Object.keys(s.blocks ?? {})]) {
    if (stepsOf(s, view, homes).has(id)) return view
  }
  return null
}

/** Шаги вида: «Разложить» очищает позиции именно их. */
export function stepIdsOf(s: Scenario, view: GraphView, homes: Homes = {}): string[] {
  const inView = stepsOf(s, view, homes)
  return Object.keys(s.steps).filter((id) => inView.has(id))
}

export function titleOf(step: Step): string {
  return (step.text ?? '').split('\n')[0]!.trim()
}

const ARROW = { type: 'arrowclosed' as MarkerType, color: '#7c8796', width: 14, height: 14 }

export function toFlow(s: Scenario, view: GraphView, homes: Homes = {}): { nodes: Node[]; edges: Edge[] } {
  const inView = stepsOf(s, view, homes)
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
    })

  const stubFor = (id: string): string => {
    const key = `stub:${id}`
    if (!extra.has(key)) {
      const kind = id === RETURN_TARGET ? 'return' : s.steps[id] ? 'link' : 'broken'
      const label = kind === 'return' ? 'Возврат из блока' : kind === 'link' ? titleOf(s.steps[id]!) : id
      const kindLabel = { return: 'Выход из блока', link: 'Переход на шаг', broken: 'Нет такого шага' }[kind]
      extra.set(key, node(key, 'stub', { label, title: label, kind, kindLabel, stepId: id, width: NODE_WIDTH, height: BLOCK_HEIGHT }))
    }
    return key
  }

  const resolve = (id: string): string => (inView.has(id) ? id : stubFor(id))

  const callFor = (block: string, then: string | undefined): string => {
    const key = `call:${block}>${then ?? ''}`
    if (!extra.has(key)) {
      extra.set(key, node(key, 'block', { block, title: blockLabel(block), kindLabel: 'Общий блок', width: NODE_WIDTH, height: BLOCK_HEIGHT }))
      if (then) link(key, 'out', resolve(then))
    }
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
      else link(id, handle, callFor(target.call, target.then))
    }
  }

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
