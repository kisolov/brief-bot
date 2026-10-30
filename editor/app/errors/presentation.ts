import { BackendUnavailable, DomainError, SessionExpired } from './base'
import { InvalidLoginLink } from './auth'
import { DraftConflict, ScenarioInvalid, VersionNotFound } from './scenario'

/** Единственное место, где ошибка предметной области превращается в текст для человека. */
export const LOGIN_HINT = 'Откройте редактор командой /editor в боте.'
export const CONFLICT_TEXT = 'Сценарий изменён в другой вкладке. Обновите страницу.'
export const SAVE_FAILED_TEXT = 'Не удалось сохранить. Проверьте соединение.'
export const PUBLISH_FAILED_TEXT = 'Не удалось опубликовать. Проверьте соединение.'

/** Сбой автосохранения: конфликт требует обновить страницу, остальное это связь. */
export function mapSaveError(e: unknown): string {
  if (e instanceof DraftConflict) return CONFLICT_TEXT
  if (e instanceof SessionExpired) return LOGIN_HINT
  return SAVE_FAILED_TEXT
}

/** Сбой самой публикации: ошибки сценария показывает панель, сюда они не попадают. */
export function mapPublishError(e: unknown): string {
  if (e instanceof SessionExpired) return LOGIN_HINT
  return PUBLISH_FAILED_TEXT
}

export function mapScenarioError(e: unknown): string {
  if (e instanceof SessionExpired) return LOGIN_HINT
  if (e instanceof DraftConflict) return CONFLICT_TEXT
  if (e instanceof ScenarioInvalid) return 'Сценарий не прошёл проверку.'
  if (e instanceof VersionNotFound) return 'Такой версии нет.'
  if (e instanceof BackendUnavailable) return 'Сервер не отвечает. Попробуйте позже.'
  if (e instanceof DomainError) return e.message
  return 'Что-то пошло не так.'
}

export function mapAuthError(e: unknown): string {
  if (e instanceof InvalidLoginLink || e instanceof SessionExpired) return LOGIN_HINT
  if (e instanceof BackendUnavailable) return 'Сервер не отвечает. Попробуйте позже.'
  return LOGIN_HINT
}
