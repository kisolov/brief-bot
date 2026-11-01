import { storeToRefs } from 'pinia'
import { useScenarioStore } from '~/stores/scenario.store'
import type { BlockOutcome } from '~/stores/scenario.store'
import { blockNameError, callsTo, ownBlockSteps } from '~/utils/blocks'
import { blockLabel } from '~/utils/scenarioGraph'

interface Options {
  /** Вопрос «Удалить?» человеку; по умолчанию окно браузера. */
  confirm?: (question: string) => boolean
}

function browserConfirm(question: string): boolean {
  return typeof window === 'undefined' ? true : window.confirm(question)
}

/** Сценарий «управлять блоками»: создать, переименовать, удалить общий блок со вкладок схемы. */
export function useManageBlocks(options: Options = {}) {
  const store = useScenarioStore()
  const { conflict } = storeToRefs(store)
  const confirm = options.confirm ?? browserConfirm

  /** После конфликта версий правки заблокированы: кнопки неактивны. */
  const locked = conflict

  /** Текст ошибки для поля ввода; `null`, если название подходит. `except` это блок, который переименовывают. */
  function check(raw: string, except?: string): string | null {
    return blockNameError(store.scenario, raw, except)
  }

  /** Сколько шагов уйдёт вместе с блоком и сколько переходов в него придётся задать заново. */
  function usage(name: string): { steps: number; links: number } {
    return {
      steps: ownBlockSteps(store.scenario, name).length,
      links: callsTo(store.scenario, name),
    }
  }

  function create(name: string): BlockOutcome {
    return store.addBlock(name)
  }

  function rename(old: string, name: string): BlockOutcome {
    return store.renameBlock(old, name)
  }

  /** Спрашивает подтверждение с числами и удаляет. Возвращает, удалён ли блок. */
  function remove(name: string): boolean {
    if (locked.value || store.blocks[name] === undefined) return false
    const { steps, links } = usage(name)
    const question =
      `Удалить блок "${blockLabel(name)}"? Шаги: ${steps}. Кнопок и шагов ведут в него: ${links}. ` +
      'Эти переходы придётся задать заново.'
    if (!confirm(question)) return false
    return store.removeBlock(name)
  }

  return { locked, check, usage, create, rename, remove }
}
