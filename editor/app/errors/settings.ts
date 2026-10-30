import { DomainError } from './base'

/** Сервер не принял значения настроек. */
export class SettingsInvalid extends DomainError {
  constructor() {
    super('Настройки не приняты')
  }
}
