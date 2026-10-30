import type { ScenarioRepository } from '~/repositories/scenario.port'
import type { Draft, Scenario, VersionInfo } from '~/types/scenario'

declare const __EDITOR_MOCK__: boolean

/**
 * Сценарий в памяти для тестов и локального запуска без backend.
 * Без начального черновика берёт сид backend: файл подгружается динамическим
 * импортом и в рабочую сборку не попадает (`__EDITOR_MOCK__` там false).
 */
export class MockScenarioRepository implements ScenarioRepository {
  private draft: Draft | null
  private versions: VersionInfo[] = [{ number: 1, publishedAt: '2026-10-30T11:00:00Z', active: true }]

  constructor(initial?: Draft) {
    this.draft = initial ? structuredClone(initial) : null
  }

  async getDraft(): Promise<Draft> {
    if (!this.draft) {
      if (!__EDITOR_MOCK__) throw new Error('мок-адаптер выключен')
      const seed = await import('../../../../backend/src/scenario/seed/scenario.json')
      this.draft = { data: structuredClone(seed.default) as unknown as Scenario, revision: 1 }
    }
    return structuredClone(this.draft)
  }

  async saveDraft(data: Scenario, _revision: number): Promise<number> {
    const current = await this.getDraft()
    this.draft = { data: structuredClone(data), revision: current.revision + 1 }
    return this.draft.revision
  }

  async publish(): Promise<number> {
    const number = Math.max(0, ...this.versions.map((v) => v.number)) + 1
    this.versions = [
      ...this.versions.map((v) => ({ ...v, active: false })),
      { number, publishedAt: new Date().toISOString(), active: true },
    ]
    return number
  }

  async getVersions(): Promise<VersionInfo[]> {
    return structuredClone(this.versions)
  }

  async activate(n: number): Promise<void> {
    this.versions = this.versions.map((v) => ({ ...v, active: v.number === n }))
  }
}
