import { useScenarioStore } from '~/stores/scenario.store'
import type { Option, Step, When } from '~/types/scenario'
import { blockLabel } from '~/utils/scenarioGraph'

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

  return { updateStep, moveStep, addOption, updateOption, removeOption, setCondition, canRemove, removeStep }
}
