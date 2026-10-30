import { useScenarioStore } from '~/stores/scenario.store'
import type { GraphView, StepType } from '~/types/scenario'

/** Шаг ложится правее источника, если у источника задана позиция. */
const SHIFT_X = 260

interface Place {
  /** Положение на схеме: место броска из палитры или центр видимой части. */
  pos?: [number, number]
  /** Вкладка, на которой шаг создан: пока он не подключён, он остаётся на ней. */
  view?: GraphView
  /** Создать шаг как цель кнопки (или выхода шага): переход ставится сразу. */
  from?: { step: string; handle: string }
}

/** Сценарий «добавить шаг»: из палитры или из списка «Куда ведёт». Возвращает id нового шага. */
export function useAddStep() {
  const store = useScenarioStore()

  return function addStep(type: StepType, place: Place = {}): string {
    const source = place.from ? store.steps[place.from.step] : undefined
    const pos = place.pos ?? (source?.pos ? ([source.pos[0] + SHIFT_X, source.pos[1]] as [number, number]) : undefined)
    const id = store.addStep(type, undefined, { pos, view: place.view })
    if (place.from) store.connect(place.from.step, place.from.handle, id)
    return id
  }
}
