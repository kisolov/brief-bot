import { describe, expect, it, vi } from 'vitest'
import { HttpAuthRepository } from '~/repositories/adapters/auth.http'
import { HttpScenarioRepository } from '~/repositories/adapters/scenario.http'
import { InvalidLoginLink } from '~/errors/auth'
import { SessionExpired } from '~/errors/base'
import { DraftConflict, ScenarioInvalid } from '~/errors/scenario'

function failing(status: number, data?: unknown) {
  return vi.fn().mockRejectedValue({ response: { status, _data: data }, statusCode: status })
}

describe('HttpScenarioRepository', () => {
  it('getDraft отдаёт данные и ревизию как пришли', async () => {
    const client = vi.fn().mockResolvedValue({ data: { entry: 'a', steps: {}, extra: 1 }, revision: 3 })
    const draft = await new HttpScenarioRepository(client as never).getDraft()
    expect(client).toHaveBeenCalledWith('/api/scenario/draft', expect.anything())
    expect(draft.revision).toBe(3)
    expect(draft.data.extra).toBe(1)
  })

  it('401 превращается в SessionExpired', async () => {
    const repo = new HttpScenarioRepository(failing(401) as never)
    await expect(repo.getDraft()).rejects.toBeInstanceOf(SessionExpired)
    await expect(repo.getVersions()).rejects.toBeInstanceOf(SessionExpired)
  })

  it('409 при сохранении это DraftConflict', async () => {
    const repo = new HttpScenarioRepository(failing(409) as never)
    await expect(repo.saveDraft({ entry: 'a', blocks: {}, steps: {} }, 1)).rejects.toBeInstanceOf(DraftConflict)
  })

  it('422 при публикации несёт проблемы', async () => {
    const issues = [{ code: 'unreachable', stepId: 'x', optionId: null, message: 'm' }]
    const repo = new HttpScenarioRepository(failing(422, { issues }) as never)
    const err = await repo.publish().catch((e) => e)
    expect(err).toBeInstanceOf(ScenarioInvalid)
    expect(err.issues).toEqual(issues)
  })

  it('saveDraft шлёт data и revision, activate отвечает пусто', async () => {
    const client = vi.fn().mockResolvedValue({ revision: 4 })
    const repo = new HttpScenarioRepository(client as never)
    expect(await repo.saveDraft({ entry: 'a', blocks: {}, steps: {} }, 3)).toBe(4)
    expect(client.mock.calls[0]![1]).toMatchObject({ method: 'PUT', body: { revision: 3 } })
    await repo.activate(2)
    expect(client.mock.calls[1]![0]).toBe('/api/scenario/versions/2/activate')
  })
})

describe('HttpAuthRepository', () => {
  it('exchange шлёт токен', async () => {
    const client = vi.fn().mockResolvedValue(undefined)
    await new HttpAuthRepository(client as never).exchange('tok')
    expect(client).toHaveBeenCalledWith('/api/auth/exchange', { method: 'POST', body: { token: 'tok' } })
  })

  it('401 при обмене это InvalidLoginLink', async () => {
    await expect(new HttpAuthRepository(failing(401) as never).exchange('x')).rejects.toBeInstanceOf(
      InvalidLoginLink,
    )
  })
})
