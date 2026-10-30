import { InvalidLoginLink } from '~/errors/auth'
import { SessionExpired } from '~/errors/base'
import type { AuthRepository } from '~/repositories/auth.port'
import { type HttpClient, request } from './http'

export class HttpAuthRepository implements AuthRepository {
  constructor(private readonly client: HttpClient) {}

  async exchange(token: string): Promise<void> {
    try {
      await request(() => this.client('/api/auth/exchange', { method: 'POST', body: { token } }))
    } catch (e) {
      // 401 при обмене значит негодную ссылку, а не истёкшую сессию
      if (e instanceof SessionExpired) throw new InvalidLoginLink()
      throw e
    }
  }
}
