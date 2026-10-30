import { afterEach, describe, expect, it, vi } from 'vitest'
import { useExchangeToken } from '~/composables/useExchangeToken'
import { __setContainer } from '~/container'
import { InvalidLoginLink } from '~/errors/auth'
import { MockAuthRepository } from '~/repositories/adapters/auth.mock'

function setup(query: Record<string, string>, failWith?: Error) {
  const auth = new MockAuthRepository()
  if (failWith) vi.spyOn(auth, 'exchange').mockRejectedValue(failWith)
  __setContainer({ authRepository: auth })
  const replace = vi.fn()
  vi.stubGlobal('useRoute', () => ({ path: '/login', query }))
  vi.stubGlobal('useRouter', () => ({ replace }))
  return replace
}

describe('useExchangeToken', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('успех ведёт на /', async () => {
    const replace = setup({ token: 'abc' })
    expect(await useExchangeToken()()).toBeNull()
    expect(replace).toHaveBeenCalledWith('/')
  })

  it('неудача показывает подсказку и убирает токен из адреса', async () => {
    const replace = setup({ token: 'abc' }, new InvalidLoginLink())
    expect(await useExchangeToken()()).toBe('Откройте редактор командой /editor в боте.')
    expect(replace).toHaveBeenCalledWith({ path: '/login', query: {} })
  })

  it('без токена подсказка, на / не ведёт', async () => {
    const replace = setup({})
    expect(await useExchangeToken()()).toBe('Откройте редактор командой /editor в боте.')
    expect(replace).not.toHaveBeenCalledWith('/')
  })
})
