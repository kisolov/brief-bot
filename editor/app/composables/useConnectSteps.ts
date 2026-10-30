import { useScenarioStore } from '~/stores/scenario.store'
import type { Target } from '~/types/scenario'

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

  return { connect, disconnect }
}
