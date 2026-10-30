import type { Scenario } from '~/types/scenario'

/**
 * Подписи ответов, которые использует сам бот: `name` подставляется в текст как `{name}`,
 * `Направление` берётся из заявки как направление. Переименование ломает их молча.
 */
export const RESERVED_KEYS: Readonly<Record<string, string>> = {
  name: 'Имя',
  Направление: 'Направление',
}

export function isReservedKey(key: string | undefined): boolean {
  return key !== undefined && Object.hasOwn(RESERVED_KEYS, key)
}

export interface KeyInfo {
  /** Подпись нельзя менять: её использует бот. */
  locked: boolean
  /** Что показать человеку вместо служебного ключа. */
  label: string
  /** Другие шаги, в тексте которых есть `{подпись}`: переименование сломает им подстановку. */
  usedIn: string[]
  /** У другого шага такая же подпись: ответы смешаются в заявке. */
  duplicate: boolean
}

export function keyInfo(s: Scenario, stepId: string): KeyInfo {
  const key = s.steps[stepId]?.key
  if (key === undefined || key === '') return { locked: false, label: '', usedIn: [], duplicate: false }
  if (isReservedKey(key)) return { locked: true, label: RESERVED_KEYS[key]!, usedIn: [], duplicate: false }
  const others = Object.entries(s.steps).filter(([id]) => id !== stepId)
  return {
    locked: false,
    label: key,
    usedIn: others.filter(([, step]) => (step.text ?? '').includes(`{${key}}`)).map(([id]) => id),
    duplicate: others.some(([, step]) => step.key === key),
  }
}
