import { RETURN_TARGET } from '~/types/scenario'
import type { Scenario, Target } from '~/types/scenario'
import { MAIN_VIEW, blockLabel, exitsOf, stepIdsOf, viewOfStep } from '~/utils/scenarioGraph'

export const BLOCK_NAME_LIMIT = 40
export const NAME_EMPTY = 'Введите название.'
export const NAME_TAKEN = 'Такой блок уже есть.'
export const NAME_TOO_LONG = `Не длиннее ${BLOCK_NAME_LIMIT} символов.`
export const ENTRY_STEP_LOCKED = 'Это первый шаг сценария, его удалить нельзя.'
export const BLOCK_NEEDS_FIRST = 'Сначала задайте блоку другой первый шаг.'

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

/** Шаги, которые уходят вместе с блоком: его вкладка, кроме начала сценария и первых шагов других блоков. */
export function ownBlockSteps(s: Scenario, name: string): string[] {
  const others = Object.entries(s.blocks ?? {}).filter(([other]) => other !== name)
  const kept = new Set([s.entry, ...others.map(([, first]) => first)])
  return stepIdsOf(s, name).filter((id) => !kept.has(id))
}

/** Блоки, чей первый шаг это `id`. */
export function blocksStartingAt(s: Pick<Scenario, 'blocks'>, id: string): string[] {
  return Object.entries(s.blocks ?? {})
    .filter(([, first]) => first === id)
    .map(([name]) => name)
}

/** Следующий подключённый шаг на той же вкладке: он становится первым, когда первый шаг блока удаляют. */
export function nextStepOnTab(s: Scenario, id: string): string | undefined {
  const step = s.steps[id]
  if (!step) return undefined
  const starts = new Set(Object.values(s.blocks ?? {}))
  for (const { target } of exitsOf(step)) {
    const next = typeof target === 'string' ? target : target.then
    if (!next || next === RETURN_TARGET || next === id || starts.has(next) || !s.steps[next]) continue
    if (viewOfStep(s, next) === viewOfStep(s, id)) return next
  }
  return undefined
}

/** Почему шаг нельзя удалить; `null`, если можно. Удаление не оставляет сценарий или блок без начала. */
export function removeRefusal(s: Scenario, id: string): string | null {
  if (id === s.entry) return ENTRY_STEP_LOCKED
  if (blocksStartingAt(s, id).length && !nextStepOnTab(s, id)) return BLOCK_NEEDS_FIRST
  return null
}
