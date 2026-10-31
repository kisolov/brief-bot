import type { GraphView, Scenario, Target } from '~/types/scenario'
import { MAIN_VIEW, blockLabel, stepIdsOf } from '~/utils/scenarioGraph'
import type { Homes } from '~/utils/scenarioGraph'

export const BLOCK_NAME_LIMIT = 40
export const NAME_EMPTY = 'Введите название.'
export const NAME_TAKEN = 'Такой блок уже есть.'
export const NAME_TOO_LONG = `Не длиннее ${BLOCK_NAME_LIMIT} символов.`

/**
 * Что не так с названием блока; `null`, если оно подходит. Занятым считается и ключ, и подпись
 * на вкладке (у блоков из каталога они разные), без учёта регистра. Переименуемый блок `except`
 * сам себе не помеха.
 */
export function blockNameError(s: Pick<Scenario, 'blocks'>, raw: string, except?: string): string | null {
  const name = raw.trim()
  if (name === '') return NAME_EMPTY
  if (name.length > BLOCK_NAME_LIMIT) return NAME_TOO_LONG
  const key = name.toLowerCase()
  // `main` это вкладка основного сценария
  if (key === MAIN_VIEW) return NAME_TAKEN
  for (const other of Object.keys(s.blocks ?? {})) {
    if (other === except) continue
    if (other.toLowerCase() === key || blockLabel(other).toLowerCase() === key) return NAME_TAKEN
  }
  return null
}

/** Вход в блок `name` с любым возвратом: переход вида `{call: name}`. */
export function isCallTo(target: Target | undefined, name: string): target is Exclude<Target, string> {
  return typeof target === 'object' && target.call === name
}

/** Сколько кнопок и шагов ведут в блок: столько переходов придётся задать заново после удаления. */
export function callsTo(s: Pick<Scenario, 'steps'>, name: string): number {
  let count = 0
  for (const step of Object.values(s.steps)) {
    if (isCallTo(step.next, name)) count++
    for (const o of step.options ?? []) if (isCallTo(o.next, name)) count++
  }
  return count
}

/**
 * Шаги, которые уходят вместе с блоком: видны на его вкладке и больше ни на одной.
 * Шаг, достижимый и из другого вида, остаётся: он нужен там.
 */
export function ownBlockSteps(s: Scenario, name: string, homes: Homes = {}): string[] {
  const elsewhere = new Set<string>()
  for (const view of [MAIN_VIEW, ...Object.keys(s.blocks ?? {})] as GraphView[]) {
    if (view === name) continue
    for (const id of stepIdsOf(s, view, homes)) elsewhere.add(id)
  }
  return stepIdsOf(s, name, homes).filter((id) => !elsewhere.has(id))
}
