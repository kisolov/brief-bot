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
 * у шага; `choice`: переход у кнопок; `validate` только у `text`; подписи ответа у `info` нет;
 * свой текст `input` только у `multi_input`.
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
    const hidden = type === 'multi' ? ['next', 'input'] : ['next']
    if (options.length) out.options = withoutOptionKeys(options, ...hidden)
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
 * Тип нельзя менять у шага, от которого зависит бот: завершающего анкету (`finish`) и с подписью
 * `name` или `Направление`. Смена потеряла бы переходы кнопок или стёрла подпись, которую использует бот.
 */
export function canChangeType(step: Step): boolean {
  return !step.finish && !isReservedKey(step.key)
}

/** Шаг с вводом ответа не завершает анкету: человеку некуда было бы ответить. */
export function canFinish(type: StepType): boolean {
  return type !== 'text' && type !== 'file'
}
