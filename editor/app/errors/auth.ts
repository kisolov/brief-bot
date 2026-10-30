import { DomainError } from './base'

/** Ссылка входа негодна: просрочена, уже использована или токена нет. */
export class InvalidLoginLink extends DomainError {
  constructor() {
    super('Ссылка для входа не подошла')
  }
}
