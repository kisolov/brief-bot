import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLoadScenario } from '~/composables/useLoadScenario'
import { __setContainer } from '~/container'
import { BackendUnavailable, SessionExpired } from '~/errors/base'
import { MockScenarioRepository } from '~/repositories/adapters/scenario.mock'

function setup(error: Error) {
  const repo = new MockScenarioRepository()
  vi.spyOn(repo, 'getDraft').mockRejectedValue(error)
  __setContainer({ scenarioRepository: repo })
  setActivePinia(createPinia())
  const replace = vi.fn()
  vi.stubGlobal('useRouter', () => ({ replace }))
  return replace
}

describe('useLoadScenario', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('401 уводит на /login и не показывает ошибку', async () => {
    const replace = setup(new SessionExpired())
    expect(await useLoadScenario()()).toBeNull()
    expect(replace).toHaveBeenCalledWith('/login')
  })

  it('прочие сбои возвращают текст для человека', async () => {
    const replace = setup(new BackendUnavailable())
    expect(await useLoadScenario()()).toBe('Сервер не отвечает. Попробуйте позже.')
    expect(replace).not.toHaveBeenCalled()
  })
})
