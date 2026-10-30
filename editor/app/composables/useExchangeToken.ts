import { useContainer } from '~/container'
import { mapAuthError } from '~/errors/presentation'
import { InvalidLoginLink } from '~/errors/auth'

/**
 * Сценарий «войти по ссылке из бота»: токен из адреса меняется на cookie сессии.
 * Состояния в store нет, поэтому композабл идёт в container напрямую.
 * Возвращает текст ошибки или null, когда вход удался.
 */
export function useExchangeToken() {
  const route = useRoute()
  const router = useRouter()
  const auth = useContainer().authRepository

  return async function exchangeToken(): Promise<string | null> {
    const raw = route.query.token
    const token = Array.isArray(raw) ? raw[0] : raw
    // токен убираем из адреса при любой неудаче: ссылка одноразовая и не должна жить в истории
    const dropToken = () => router.replace({ path: route.path, query: {} })
    if (!token) return mapAuthError(new InvalidLoginLink())
    try {
      await auth.exchange(token)
    } catch (e) {
      await dropToken()
      return mapAuthError(e)
    }
    await router.replace('/')
    return null
  }
}
