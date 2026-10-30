import type { Issue } from '~/types/scenario'
import { DomainError } from './base'

/** Черновик успел измениться: сохранение с устаревшей ревизией. */
export class DraftConflict extends DomainError {
  constructor() {
    super('Черновик изменён в другом месте')
  }
}

/** Публикация остановлена проверкой сценария. */
export class ScenarioInvalid extends DomainError {
  constructor(readonly issues: Issue[]) {
    super('Сценарий не прошёл проверку')
  }
}

/** Откат выполнен на сервере, но черновик и список версий перечитать не удалось. */
export class RollbackNotRefreshed extends DomainError {
  constructor() {
    super('Откат выполнен, но экран не обновился')
  }
}

/** Нет версии с таким номером. */
export class VersionNotFound extends DomainError {
  constructor() {
    super('Версия не найдена')
  }
}
