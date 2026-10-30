import { useScenarioStore } from '~/stores/scenario.store'
import { SessionExpired } from '~/errors/base'
import { mapScenarioError } from '~/errors/presentation'

/**
 * Сценарий «открыть редактор»: загрузка черновика; кончившаяся сессия ведёт на /login.
 * Уже загруженный сценарий не читается заново: возврат на схему не должен затирать правки.
 * Явная перезагрузка (после отката версии) идёт через `store.load()`.
 */
export function useLoadScenario() {
  const store = useScenarioStore()
  const router = useRouter()

  return async function loadScenario(): Promise<string | null> {
    if (store.loaded) return null
    try {
      await store.load()
      return null
    } catch (e) {
      if (e instanceof SessionExpired) {
        await router.replace('/login')
        return null
      }
      return mapScenarioError(e)
    }
  }
}
