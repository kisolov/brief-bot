import { SessionExpired } from '~/errors/base'
import { mapScenarioError } from '~/errors/presentation'
import { useScenarioStore } from '~/stores/scenario.store'

/**
 * Общая оболочка сценариев страниц: 401 на любой странице ведёт на /login,
 * прочий сбой становится текстом для человека. Успех и уход на вход возвращают `null`.
 */
export function usePageGuard(map: (e: unknown) => string = mapScenarioError) {
  const router = useRouter()
  const scenario = useScenarioStore()

  return async function guard(run: () => Promise<unknown>): Promise<string | null> {
    try {
      await run()
      return null
    } catch (e) {
      if (e instanceof SessionExpired) {
        scenario.expireSession()
        await router.replace('/login')
        return null
      }
      return map(e)
    }
  }
}
