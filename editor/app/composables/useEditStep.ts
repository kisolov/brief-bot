import { useScenarioStore } from '~/stores/scenario.store'
import type { Option, Step, StepType, When } from '~/types/scenario'
import { blockLabel } from '~/utils/scenarioGraph'
import { isReservedKey, keyInfo } from '~/utils/stepKeys'
import { convertStep } from '~/utils/stepType'

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

  function addOption(stepId: string): string | null {
    return store.addOption(stepId)
  }

  function updateOption(stepId: string, optionId: string, patch: Partial<Option>): void {
    store.updateOption(stepId, optionId, patch)
  }

  function removeOption(stepId: string, optionId: string): void {
    store.removeOption(stepId, optionId)
  }

  /** Условие показа шага; без `when` шаг показывается всегда. */
  function setCondition(stepId: string, when: When | undefined): void {
    store.updateStep(stepId, { when })
  }

  /**
   * Подпись ответа. Ту, что использует бот (`name`, `Направление`), нельзя ни занять, ни сменить:
   * иначе в Telegram появится буквальное `{name}`, а направление выпадет из заявки.
   * Возвращает, применена ли правка.
   */
  function setKey(id: string, value: string): boolean {
    if (keyInfo(store.scenario, id).locked || isReservedKey(value.trim())) return false
    store.updateStep(id, { key: value === '' ? undefined : value })
    return true
  }

  /** Смена типа чистит скрытое; если пропадают кнопки или переходы, сначала вопрос с числом. */
  function changeType(id: string, type: StepType): boolean {
    const step = store.steps[id]
    if (!step || step.type === type) return false
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
  function setAnswer(stepId: string, kind: 'any' | 'none', optionId: string, on: boolean): void {
    const w = store.steps[stepId]?.when
    if (!w) return
    const list = [...(w[kind] ?? []).filter((x) => x !== optionId), ...(on ? [optionId] : [])]
    const next: When = { ...w, [kind]: list }
    if (kind === 'none' && !list.length) delete next.none
    if (!next.any.length && !(next.none ?? []).length) return store.updateStep(stepId, { when: undefined })
    store.updateStep(stepId, { when: next })
  }

  /** Начальный шаг удалять нельзя: бот не знал бы, с чего начать. */
  function canRemove(id: string): boolean {
    return id !== store.entry
  }

  /** Шаг, с которого начинается общий блок, удаляется только с подтверждения. */
  function removeStep(id: string): boolean {
    if (!canRemove(id)) return false
    const owners = store.blocksStartingAt(id)
    if (owners.length) {
      const names = owners.map((name) => `«${blockLabel(name)}»`).join(', ')
      const ok = confirm(
        `С этого шага начинается общий блок ${names}. Если удалить шаг, блок перестанет работать, ` +
          'и при публикации появится ошибка. Удалить шаг?',
      )
      if (!ok) return false
    }
    return store.removeStep(id)
  }

  return { updateStep, moveStep, addOption, updateOption, removeOption, setCondition, canRemove, removeStep, setKey, changeType, setAnswer }
}
