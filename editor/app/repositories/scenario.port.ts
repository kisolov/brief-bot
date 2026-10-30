import type { Draft, Scenario, VersionInfo } from '~/types/scenario'

export interface ScenarioRepository {
  getDraft(): Promise<Draft>
  /** Возвращает новую ревизию; устаревшая ревизия это `DraftConflict`. */
  saveDraft(data: Scenario, revision: number): Promise<number>
  /** Возвращает номер новой версии; невалидный сценарий это `ScenarioInvalid`. */
  publish(): Promise<number>
  getVersions(): Promise<VersionInfo[]>
  activate(n: number): Promise<void>
}
