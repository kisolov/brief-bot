import { InvalidLoginLink } from '~/errors/auth'
import type { AuthRepository } from '~/repositories/auth.port'

/** Вход без backend: пустой токен не принимается, остальное проходит. */
export class MockAuthRepository implements AuthRepository {
  async exchange(token: string): Promise<void> {
    if (!token) throw new InvalidLoginLink()
  }
}
