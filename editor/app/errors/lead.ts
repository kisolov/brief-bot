import { DomainError } from './base'

/** Файл ТЗ больше 20 МБ: Telegram не отдаёт такие файлы ботам. */
export class FileTooLarge extends DomainError {
  constructor() {
    super('Файл слишком большой')
  }
}

/** Нет заявки или файла. */
export class LeadNotFound extends DomainError {
  constructor() {
    super('Заявка не найдена')
  }
}
