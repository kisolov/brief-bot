import { useScenarioStore } from '~/stores/scenario.store'
import { RETURN_TARGET } from '~/types/scenario'
import type { Target } from '~/types/scenario'

/** Нода схемы, как её отдаёт Vue Flow: достаточно id, типа и данных. */
export interface GraphNodeRef {
  id: string
  type?: string
  data: Record<string, any>
}

/**
 * Откуда ведёт стрелка: выход шага (кнопка или собственный) либо выход карточки «Общий блок».
 * Карточка это сразу несколько ссылок `{call: block, then}`: `sources` называет шаги, из которых собрана.
 */
export type ConnectOrigin =
  | { step: string; handle: string }
  | { block: string; then?: string; sources: readonly string[] }

export const PICK_STEP_HINT = 'Выберите шаг в панели справа.'
const BLOCK_TO_BLOCK_HINT = 'От блока стрелка идёт на шаг или на выход из блока.'

/**
 * Сценарий «соединить шаги»: стрелка на схеме и список «Куда ведёт» пишут один и тот же переход.
 * `handle` это id кнопки или `NEXT_HANDLE` для собственного выхода шага.
 */
export function useConnectSteps() {
  const store = useScenarioStore()

  function connect(source: string, handle: string, target: Target): void {
    store.connect(source, handle, target)
  }

  function disconnect(source: string, handle: string): void {
    store.connect(source, handle, undefined)
  }

  /** Начало стрелки по ноде и порту; `null`, если от этой ноды стрелку вести нельзя. */
  function originOf(node: GraphNodeRef, handle: string): ConnectOrigin | null {
    if (store.steps[node.id]) return { step: node.id, handle }
    if (node.type === 'block' && handle === 'out') {
      return { block: node.data.block, then: node.data.then, sources: node.data.sources ?? [] }
    }
    return null
  }

  /** Куда попала стрелка, пущенная на ноду; подсказка, если на неё стрелку вести нельзя. */
  function targetOfNode(origin: ConnectOrigin, node: GraphNodeRef): Target | { hint: string } {
    if (store.steps[node.id]) return node.id
    if (node.type === 'block') {
      if ('block' in origin) return { hint: BLOCK_TO_BLOCK_HINT }
      const { block, then } = node.data
      return then ? { call: block, then } : { call: block }
    }
    switch (node.data.kind) {
      case 'return':
        return RETURN_TARGET
      case 'link':
        return node.data.stepId
      default:
        // «Нет такого шага»: цель выбирается в списке панели, молчание выглядело бы как поломка
        return { hint: PICK_STEP_HINT }
    }
  }

  /** Пишет переход от `origin` к `target`. Возвращает подсказку, если так соединить нельзя. */
  function connectTo(origin: ConnectOrigin, target: Target): string | undefined {
    if ('step' in origin) {
      store.connect(origin.step, origin.handle, target)
      return undefined
    }
    if (typeof target !== 'string') return BLOCK_TO_BLOCK_HINT
    store.retargetCall(origin.block, origin.then, origin.sources, target)
    return undefined
  }

  /** Стрелка, доведённая до ноды. Возвращает подсказку, если переход не записан. */
  function connectNodes(source: GraphNodeRef, handle: string, target: GraphNodeRef): string | undefined {
    const origin = originOf(source, handle)
    if (!origin) return undefined
    const to = targetOfNode(origin, target)
    if (typeof to === 'object' && 'hint' in to) return to.hint
    return connectTo(origin, to)
  }

  return { connect, disconnect, originOf, connectTo, connectNodes }
}
