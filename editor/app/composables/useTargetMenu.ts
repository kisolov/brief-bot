import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { useAddStep } from '~/composables/useAddStep'
import { useConnectSteps } from '~/composables/useConnectSteps'
import type { ConnectOrigin, GraphNodeRef } from '~/composables/useConnectSteps'
import { useScenarioStore } from '~/stores/scenario.store'
import type { GraphView } from '~/types/scenario'
import { decodeTarget, menuChoices } from '~/utils/stepTargets'

/** Значение пункта «Новый шаг» в меню. */
export const NEW_STEP_VALUE = '__new'

interface MenuState {
  origin: ConnectOrigin
  /** Точка отпускания в координатах холста: сюда встаёт меню. */
  at: { x: number; y: number }
  /** Она же в координатах схемы: сюда ляжет новый шаг. */
  pos: [number, number]
}

/**
 * Сценарий «выбрать цель стрелки»: стрелка от кнопки или выхода блока отпущена в пустом месте,
 * человек выбирает шаг, блок, выход из блока или создаёт новый шаг на месте.
 */
export function useTargetMenu(view: Ref<GraphView>) {
  const store = useScenarioStore()
  const { scenario } = storeToRefs(store)
  const { originOf, connectTo } = useConnectSteps()
  const addStep = useAddStep()
  const state = ref<MenuState | null>(null)

  // блок не ведёт в блок: от выхода карточки пункты входа в блок не предлагаются
  const choices = computed(() => {
    const all = menuChoices(scenario.value, view.value, '')
    return state.value && 'block' in state.value.origin ? all.filter((c) => !c.value.startsWith('block:')) : all
  })

  /** Открыть меню. Если от этой ноды стрелку вести нельзя, меню не открывается. */
  function open(node: GraphNodeRef, handle: string, at: { x: number; y: number }, pos: [number, number]): boolean {
    const origin = originOf(node, handle)
    if (!origin) return false
    state.value = { origin, at, pos }
    return true
  }

  function close(): void {
    state.value = null
  }

  /** Выбранный пункт пишет переход; возвращает подсказку, если так соединить нельзя. */
  function pick(value: string): string | undefined {
    const current = state.value
    state.value = null
    if (!current) return undefined
    if (value === NEW_STEP_VALUE) {
      addStep('choice', { pos: current.pos, view: view.value, from: current.origin })
      return undefined
    }
    const target = decodeTarget(value)
    return target === undefined ? undefined : connectTo(current.origin, target)
  }

  return { state, choices, open, close, pick }
}
