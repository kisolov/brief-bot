import { useScenarioStore } from '~/stores/scenario.store'
import type { Option, Step, StepType, When } from '~/types/scenario'
import { removeRefusal as refusalOf } from '~/utils/blocks'
import { isReservedKey, keyInfo } from '~/utils/stepKeys'
import { canChangeType, convertStep } from '~/utils/stepType'

interface Options {
  /** Вопрос «Удалить?» человеку; по умолчанию окно браузера. */
  confirm?: (question: string) => boolean
}

function browserConfirm(question: string): boolean {
  return typeof window === 'undefined' ? true : window.confirm(question)
}

/** Сценарий «править шаг»: поля шага, кнопки, условие показа, удаление, положение на схеме. */
export function useEditStep(options: Options = {}) {
  const store = useScenarioStore()
  const confirm = options.confirm ?? browserConfirm

  function updateStep(id: string, patch: Partial<Step>): void {
    store.updateStep(id, patch)
  }

  function moveStep(id: string, pos: [number, number]): void {
    store.updateStep(id, { pos: [Math.round(pos[0]), Math.round(pos[1])] })
  }

  function placeExit(block: string, pos: [number, number]): void {
    store.placeExit(block, [Math.round(pos[0]), Math.round(pos[1])])
  }

  function placeCard(view: string, block: string, then: string | undefined, pos: [number, number]): void {
    store.placeCard(view, block, then, [Math.round(pos[0]), Math.round(pos[1])])
  }

  function removeCard(view: string, block: string, then?: string): void {
    store.removeCard(view, block, then)
  }

  function addOption(stepId: string): string | null {
    return store.addOption(stepId)
  }

  function updateOption(stepId: string, optionId: string, patch: Partial<Option>): void {
    store.updateOption(stepId, optionId, patch)
  }

  function removeOption(stepId: string, optionId: string): void {
    store.removeOption(stepId, optionId)
  }

  /** Условие показа шага или, если задан `optionId`, его кнопки. */
  function whenOf(stepId: string, optionId?: string): When | undefined {
    const step = store.steps[stepId]
    return optionId === undefined ? step?.when : step?.options?.find((o) => o.id === optionId)?.when
  }

  /** Без `when` шаг или кнопка показываются всегда. */
  function setCondition(stepId: string, when: When | undefined, optionId?: string): void {
    if (optionId === undefined) store.updateStep(stepId, { when })
    else store.updateOption(stepId, optionId, { when })
  }

  /**
   * Подпись ответа. Ту, что использует бот (`name`, `Направление`), нельзя ни занять, ни сменить:
   * иначе в Telegram появится буквальное `{name}`, а направление выпадет из заявки.
   * Возвращает, применена ли правка.
   */
  function setKey(id: string, raw: string): boolean {
    const value = raw.trim()
    if (keyInfo(store.scenario, id).locked || isReservedKey(value)) return false
    store.updateStep(id, { key: value === '' ? undefined : value })
    return true
  }

  /** Смена типа чистит скрытое; если пропадают кнопки или переходы, сначала вопрос с числом. */
  function changeType(id: string, type: StepType): boolean {
    const step = store.steps[id]
    if (!step || step.type === type || !canChangeType(step)) return false
    const { lostButtons, lostLinks } = convertStep(step, type)
    if (lostButtons || lostLinks) {
      const what = lostButtons ? `кнопок: ${lostButtons}` : `переходов кнопок и шага: ${lostLinks}`
      if (!confirm(`При смене типа пропадёт ${what}. Сменить тип?`)) return false
    }
    return store.changeStepType(id, type)
  }

  /**
   * Отметка в условии показа. Снятие последней отметки снимает условие целиком;
   * если задано "не отмечено", условие остаётся и панель просит выбрать ответ.
   */
  function setAnswer(stepId: string, kind: 'any' | 'none', answerId: string, on: boolean, optionId?: string): void {
    const w = whenOf(stepId, optionId)
    if (!w) return
    // Ответ из соседнего списка занять нельзя: условие противоречило бы само себе.
    if (on && ((kind === 'any' ? w.none : w.any) ?? []).includes(answerId)) return
    const list = [...(w[kind] ?? []).filter((x) => x !== answerId), ...(on ? [answerId] : [])]
    const next: When = { ...w, [kind]: list }
    if (kind === 'none' && !list.length) delete next.none
    const empty = !next.any.length && !(next.none ?? []).length
    setCondition(stepId, empty ? undefined : next, optionId)
  }

  /** Почему шаг нельзя удалить: подпись под кнопкой; `null`, если можно. */
  function removeRefusal(id: string): string | null {
    return refusalOf(store.scenario, id)
  }

  function canRemove(id: string): boolean {
    return removeRefusal(id) === null
  }

  /** Первый шаг блока передаёт блок следующему шагу в store; отмена возвращает всё, поэтому вопроса нет. */
  function removeStep(id: string): boolean {
    return store.removeStep(id)
  }

  return { updateStep, moveStep, placeExit, placeCard, removeCard, addOption, updateOption, removeOption, whenOf, setCondition, canRemove, removeRefusal, removeStep, setKey, changeType, setAnswer }
}
