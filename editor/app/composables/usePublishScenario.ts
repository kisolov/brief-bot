import { SessionExpired } from '~/errors/base'
import { mapPublishError, mapSaveError } from '~/errors/presentation'
import { ScenarioInvalid } from '~/errors/scenario'
import { useScenarioStore } from '~/stores/scenario.store'

/**
 * Сценарий «опубликовать»: сначала дожимается несохранённое, потом публикация.
 * Ошибки сценария остаются в store (панель ошибок), сбой сети становится сообщением.
 */
export function usePublishScenario(): () => Promise<void> {
  const store = useScenarioStore()
  const router = useRouter()

  return async function publishScenario(): Promise<void> {
    try {
      await store.publish()
    } catch (e) {
      if (e instanceof ScenarioInvalid) return
      if (e instanceof SessionExpired) {
        await router.replace('/login')
        return
      }
      // сбой записи черновика и сбой самой публикации называются по-разному
      store.setNotice(store.saveFailed || store.conflict ? mapSaveError(e) : mapPublishError(e))
    }
  }
}
