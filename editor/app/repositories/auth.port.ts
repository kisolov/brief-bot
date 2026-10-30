export interface AuthRepository {
  /** Меняет токен из ссылки бота на cookie сессии. */
  exchange(token: string): Promise<void>
}
