import type { Option, Step, StepType } from '~/types/scenario'
import { isReservedKey } from '~/utils/stepKeys'

export interface Conversion {
  step: Step
  /** Кнопки, которые пропадают совсем. */
  lostButtons: number
  /** Переходы (кнопок и шага), которые пропадают. */
  lostLinks: number
}

/** Копия шага без ключей, значение которых не нужно новому типу. */
function without(step: Step, ...keys: string[]): Step {
  const out: Step = { ...step }
  for (const k of keys) delete out[k]
  return out
}

function withoutOptionKeys(options: Option[], ...keys: string[]): Option[] {
  return options.map((o) => without(o as Step, ...keys) as Option)
}

/**
 * Шаг после смены типа без скрытых остатков прежнего типа: иначе кнопки и переходы, которых
 * на экране уже нет, остались бы в черновике, а шаги за ними публиковались бы.
 * `text`, `file`: без кнопок; `info` и `choice`: кнопки остаются; `multi`, `multi_input`: переход один,
 * у шага; `choice`: переход у кнопок; `validate` только у `text`; подписи ответа у `info` нет.
 */
export function convertStep(step: Step, type: StepType): Conversion {
  const options = step.options ?? []
  let out: Step = { ...step, type }
  let lostButtons = 0
  let lostLinks = 0
  if (type !== 'text') delete out.validate
  if (type === 'info') delete out.key

  if (type === 'text' || type === 'file') {
    lostButtons = options.length
    delete out.options
    return { step: out, lostButtons, lostLinks }
  }

  if (type === 'multi' || type === 'multi_input') {
    const linked = options.filter((o) => o.next !== undefined)
    if (out.next === undefined && linked[0]) {
      out.next = linked[0].next
      lostLinks = linked.length - 1
    } else {
      lostLinks = linked.length
    }
    if (options.length) out.options = withoutOptionKeys(options, 'next')
    return { step: out, lostButtons, lostLinks }
  }

  if (type === 'choice') {
    if (out.next !== undefined) lostLinks = 1
    out = without(out, 'next')
    if (options.length) out.options = withoutOptionKeys(options, 'input', 'exclusive')
  }
  return { step: out, lostButtons, lostLinks }
}

/**
 * Тип нельзя менять у шага, от которого зависит бот: завершающего анкету (`finish` либо `info`
 * без кнопок и `next`) и с подписью `name` или `Направление`. Смена потеряла бы переходы кнопок
 * или стёрла подпись, которую использует бот.
 */
export function canChangeType(step: Step): boolean {
  if (step.finish) return false
  if (isReservedKey(step.key)) return false
  const isEnd = step.type === 'info' && !(step.options?.length) && step.next === undefined
  return !isEnd
}
