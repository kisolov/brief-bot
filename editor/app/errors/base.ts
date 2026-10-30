/** Базовая ошибка предметной области: адаптеры превращают в неё сбои сети и HTTP. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

/** Сессия редактора кончилась: любой запрос ответил 401. */
export class SessionExpired extends DomainError {
  constructor() {
    super('Сессия редактора истекла')
  }
}

/** Сервер недоступен или ответил не так, как описано в API. */
export class BackendUnavailable extends DomainError {
  constructor() {
    super('Сервер не отвечает')
  }
}
