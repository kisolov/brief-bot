import { RETURN_TARGET } from '~/types/scenario'
import type { GraphView, Scenario, Step, Target } from '~/types/scenario'
import { MAIN_VIEW, blockLabel, titleOf } from '~/utils/scenarioGraph'

/** Пункт выпадающего списка «Куда ведёт»: значение и подпись для человека. */
export interface TargetChoice {
  value: string
  label: string
}

const STEP_PREFIX = 'step:'
export const BLOCK_PREFIX = 'block:'

/** Подпись шага для списков: первая строка текста, id человеку не показываются. */
export function stepLabel(step: Step): string {
  return titleOf(step) || 'Шаг без текста'
}

/** Пустая строка значит «никуда». */
export function encodeTarget(target: Target | undefined): string {
  if (target === undefined) return ''
  if (target === RETURN_TARGET) return RETURN_TARGET
  if (typeof target === 'string') return STEP_PREFIX + target
  return BLOCK_PREFIX + target.call
}

export function decodeTarget(value: string): Target | undefined {
  if (value === '') return undefined
  if (value === RETURN_TARGET) return RETURN_TARGET
  if (value.startsWith(BLOCK_PREFIX)) return { call: value.slice(BLOCK_PREFIX.length) }
  if (value.startsWith(STEP_PREFIX)) return value.slice(STEP_PREFIX.length)
  return undefined
}

/**
 * Все пункты «Куда ведёт»: шаги по первой строке текста, общие блоки, а внутри блока ещё и
 * «Вернуться из блока». Цель может лежать на другой вкладке, поэтому список не зависит от вида шага.
 */
export function targetChoices(s: Scenario, view: GraphView): TargetChoice[] {
  const steps = Object.entries(s.steps).map(([id, step]) => ({ value: STEP_PREFIX + id, label: stepLabel(step) }))
  const blocks = Object.keys(s.blocks ?? {}).map((name) => ({
    value: BLOCK_PREFIX + name,
    label: `Перейти в блок: ${blockLabel(name)}`,
  }))
  const back = view === MAIN_VIEW ? [] : [{ value: RETURN_TARGET, label: 'Вернуться из блока' }]
  return [...steps, ...blocks, ...back]
}

/** К шагу ведёт стрелка: начальный шаг, первый шаг блока, `next` шага или кнопки, `then` входа в блок. */
export function isConnected(s: Scenario, id: string): boolean {
  if (s.entry === id || Object.values(s.blocks ?? {}).includes(id)) return true
  const hits = (t: Target | undefined) => t === id || (typeof t === 'object' && t.then === id)
  return Object.entries(s.steps).some(
    ([sid, step]) => sid !== id && (hits(step.next) || (step.options ?? []).some((o) => hits(o.next))),
  )
}

/**
 * Пункты меню у стрелки, отпущенной в пустом месте: вход в блок, выход из блока (только на вкладке
 * блока), потом шаги. Поиск без учёта регистра по подписи.
 */
export function menuChoices(s: Scenario, view: GraphView, query: string): TargetChoice[] {
  const all = targetChoices(s, view)
  const ordered = [
    ...all.filter((c) => c.value.startsWith(BLOCK_PREFIX)),
    ...all.filter((c) => c.value === RETURN_TARGET),
    ...all.filter((c) => c.value.startsWith(STEP_PREFIX)),
  ]
  return filterChoices(ordered, query)
}

export function filterChoices(list: TargetChoice[], query: string): TargetChoice[] {
  const needle = query.trim().toLowerCase()
  return needle === '' ? list : list.filter((c) => c.label.toLowerCase().includes(needle))
}

/** Куда вернуться после блока: шаги по id, а на вкладке блока ещё и выход из него (вход в блок изнутри). */
export function thenChoices(s: Scenario, view: GraphView): TargetChoice[] {
  const steps = Object.entries(s.steps).map(([id, step]) => ({ value: id, label: stepLabel(step) }))
  return view === MAIN_VIEW ? steps : [...steps, { value: RETURN_TARGET, label: 'Вернуться из блока' }]
}
