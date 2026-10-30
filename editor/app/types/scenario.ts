/** Типы сценария: зеркало JSON черновика (`backend/src/scenario/parser.py`). */

export type StepType = 'choice' | 'multi' | 'multi_input' | 'text' | 'file' | 'info'

/** Переход «войти в блок»; `then` — куда вернуться по `@return`. */
export interface Call {
  call: string
  then?: string
}

/** Id шага, `"@return"` или вход в блок. */
export type Target = string | Call

/** Условие показа: хотя бы один id из `any` и ни одного из `none`. */
export interface When {
  step: string
  any: string[]
  none?: string[]
}

export interface Option {
  id: string
  label: string
  next?: Target
  input?: string
  exclusive?: boolean
  when?: When
  url?: string
  /** Незнакомые поля сохраняются как есть. */
  [extra: string]: unknown
}

export interface Step {
  type: StepType
  text: string
  key?: string
  options?: Option[]
  next?: Target
  when?: When
  no_back?: boolean
  validate?: 'phone' | 'url'
  done_label?: string
  pos?: [number, number]
  finish?: boolean
  back_to?: string
  /** Незнакомые поля сохраняются как есть. */
  [extra: string]: unknown
}

export interface Scenario {
  entry: string
  /** Имя блока → id его первого шага. */
  blocks: Record<string, string>
  steps: Record<string, Step>
  /** Незнакомые поля верхнего уровня сохраняются как есть. */
  [extra: string]: unknown
}

export interface Draft {
  data: Scenario
  revision: number
}

/** Проблема сценария из ответа 422 при публикации; для блока `stepId` равен имени блока. */
export interface Issue {
  code: string
  stepId: string
  optionId: string | null
  message: string
}

export interface VersionInfo {
  number: number
  publishedAt: string
  active: boolean
}

/** Представление графа: главный сценарий или имя общего блока. */
export type GraphView = 'main' | (string & {})

/** Выход шага без кнопки: переход `next` самого шага. */
export const NEXT_HANDLE = ':next'

/** Условный переход «вернуться из блока». */
export const RETURN_TARGET = '@return'
