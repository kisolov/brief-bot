import { RETURN_TARGET } from '~/types/scenario'
import type { GraphView, Scenario, Step, Target } from '~/types/scenario'
import { MAIN_VIEW, blockLabel, titleOf } from '~/utils/scenarioGraph'

/** Пункт выпадающего списка «Куда ведёт»: значение и подпись для человека. */
export interface TargetChoice {
  value: string
  label: string
}

const STEP_PREFIX = 'step:'
const BLOCK_PREFIX = 'block:'

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
