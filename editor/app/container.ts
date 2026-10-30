import { HttpAuthRepository } from '~/repositories/adapters/auth.http'
import { MockAuthRepository } from '~/repositories/adapters/auth.mock'
import { HttpScenarioRepository } from '~/repositories/adapters/scenario.http'
import { MockScenarioRepository } from '~/repositories/adapters/scenario.mock'
import type { AuthRepository } from '~/repositories/auth.port'
import type { ScenarioRepository } from '~/repositories/scenario.port'
import type { HttpClient } from '~/repositories/adapters/http'

declare const __EDITOR_MOCK__: boolean

export interface Container {
  scenarioRepository: ScenarioRepository
  authRepository: AuthRepository
}

/**
 * `NUXT_PUBLIC_EDITOR_MOCK=1` на этапе сборки или `nuxt dev` включает мок-адаптеры
 * (флаг `__EDITOR_MOCK__` задан в nuxt.config.ts); в рабочей сборке ветка мока вырезается.
 */
function createContainer(): Container {
  if (__EDITOR_MOCK__) {
    return { scenarioRepository: new MockScenarioRepository(), authRepository: new MockAuthRepository() }
  }
  const client = $fetch as unknown as HttpClient
  return { scenarioRepository: new HttpScenarioRepository(client), authRepository: new HttpAuthRepository(client) }
}

let container: Container | null = null

export function useContainer(): Container {
  container ??= createContainer()
  return container
}

/** Только для тестов: в рабочем коде не вызывать. */
export function __setContainer(overrides: Partial<Container>): void {
  container = { ...useContainer(), ...overrides }
}
