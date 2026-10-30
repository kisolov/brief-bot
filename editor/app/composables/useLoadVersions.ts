import { useScenarioStore } from '~/stores/scenario.store'
import { usePageGuard } from './usePageGuard'

/** Сценарий «показать, что в боте»: список версий и бейдж шапки, схема для этого не нужна. */
export function useLoadVersions() {
  const store = useScenarioStore()
  const guard = usePageGuard()

  return () => guard(() => store.loadVersions())
}
