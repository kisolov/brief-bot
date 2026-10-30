import { BackendUnavailable, DomainError, SessionExpired } from './base'
import { InvalidLoginLink } from './auth'
import { DraftConflict, ScenarioInvalid, VersionNotFound } from './scenario'

/** Единственное место, где ошибка предметной области превращается в текст для человека. */
export const LOGIN_HINT = 'Откройте редактор командой /editor в боте.'

export function mapScenarioError(e: unknown): string {
  if (e instanceof SessionExpired) return LOGIN_HINT
  if (e instanceof DraftConflict) return 'Черновик изменён в другом окне. Обновите страницу.'
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
