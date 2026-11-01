import { useConnectSteps } from '~/composables/useConnectSteps'
import type { ConnectOrigin } from '~/composables/useConnectSteps'
import { useScenarioStore } from '~/stores/scenario.store'
import type { GraphView, StepType } from '~/types/scenario'

/** Шаг ложится правее источника, если у источника задана позиция. */
const SHIFT_X = 260

interface Place {
  /** Положение на схеме: место броска из палитры или центр видимой части. */
  pos?: [number, number]
  /** Вкладка, на которой шаг создан: пока он не подключён, он остаётся на ней. */
  view?: GraphView
  /** Создать шаг как цель кнопки, выхода шага или выхода карточки блока: переход ставится сразу. */
  from?: ConnectOrigin
}

/** Сценарий «добавить шаг»: из палитры, из списка «Куда ведёт» или из меню у стрелки. Возвращает id нового шага. */
export function useAddStep() {
  const store = useScenarioStore()
  const { connectTo } = useConnectSteps()

  return function addStep(type: StepType, place: Place = {}): string {
    const origin = place.from
    const source = origin && 'step' in origin ? store.steps[origin.step] : undefined
    const pos = place.pos ?? (source?.pos ? ([source.pos[0] + SHIFT_X, source.pos[1]] as [number, number]) : undefined)
    // шаг и переход к нему это одно действие, отмена возвращает оба
    return store.batch(() => {
      const id = store.addStep(type, undefined, { pos, view: place.view })
      if (origin) connectTo(origin, id)
      return id
    })
  }
}
