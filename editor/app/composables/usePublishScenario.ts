import { SessionExpired } from '~/errors/base'
import { mapPublishError, mapSaveError } from '~/errors/presentation'
import { ScenarioInvalid } from '~/errors/scenario'
import { useScenarioStore } from '~/stores/scenario.store'

/**
 * Сценарий «опубликовать»: сначала дожимается несохранённое, потом публикация.
 * Ошибки сценария остаются в store и показываются на схеме, сбой сети становится сообщением.
 */
export function usePublishScenario(): () => Promise<void> {
  const store = useScenarioStore()
  const router = useRouter()

  /** Панель ошибок есть только на схеме: с других страниц ведём туда. */
  async function showIssues(): Promise<void> {
    if (router.currentRoute.value.path === '/') return
    const found = store.issues
    if (!store.loaded) {
      // схема при первом открытии читает черновик сама и стёрла бы ошибки
      await store.load().catch(() => undefined)
      store.setIssues(found)
    }
    store.select(null)
    await router.push('/')
  }

  return async function publishScenario(): Promise<void> {
    try {
      await store.publish()
    } catch (e) {
      if (e instanceof ScenarioInvalid) {
        await showIssues()
        return
      }
      if (e instanceof SessionExpired) {
        store.expireSession()
        await router.replace('/login')
        return
      }
      // сбой записи черновика и сбой самой публикации называются по-разному
      store.setNotice(store.saveFailed || store.conflict ? mapSaveError(e) : mapPublishError(e))
    }
  }
}
