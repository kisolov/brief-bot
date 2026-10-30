import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useActivateVersion } from '~/composables/useActivateVersion'
import { __setContainer } from '~/container'
import { SessionExpired } from '~/errors/base'
import { MockScenarioRepository } from '~/repositories/adapters/scenario.mock'
import { useScenarioStore } from '~/stores/scenario.store'
import type { Scenario } from '~/types/scenario'

const data: Scenario = {
  entry: 'a',
  blocks: {},
  steps: { a: { type: 'text', text: 'Первый' } },
}

async function setup() {
  const repo = new MockScenarioRepository({ data: structuredClone(data), revision: 1 })
  __setContainer({ scenarioRepository: repo })
  setActivePinia(createPinia())
  const store = useScenarioStore()
  await store.load()
  return { repo, store }
}

describe('versions', () => {
  const replace = vi.fn()
  beforeEach(() => {
    replace.mockReset()
    vi.stubGlobal('useRouter', () => ({ replace }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('loadVersions не зависит от загрузки схемы и ставит бейдж', async () => {
    __setContainer({ scenarioRepository: new MockScenarioRepository({ data, revision: 1 }) })
    setActivePinia(createPinia())
    const store = useScenarioStore()
    await store.loadVersions()
    expect(store.loaded).toBe(false)
    expect(store.versions.map((v) => v.number)).toEqual([1])
    expect(store.activeVersion).toBe(1)
  })

  it('test_activate_version_refreshes_list', async () => {
    const { store } = await setup()
    store.updateStep('a', { text: 'Второй' })
    await store.flush()
    expect(await store.publish()).toBe(2)
    expect(store.versions.map((v) => [v.number, v.active])).toEqual([
      [1, false],
      [2, true],
    ])

    await store.activate(1)
    expect(store.versions.map((v) => [v.number, v.active])).toEqual([
      [1, true],
      [2, false],
    ])
    expect(store.activeVersion).toBe(1)
    // черновик заменён версией 1, сценарий перезагружен
    expect(store.steps.a!.text).toBe('Первый')
    expect(store.dirty).toBe(false)
    expect(store.draftMatchesActive).toBe(true)
  })

  it('подтверждение не нужно сразу после публикации и нужно после правки', async () => {
    const { store } = await setup()
    // свежая загрузка: неизвестно, совпадает ли черновик с версией
    expect(store.needsRollbackConfirm).toBe(true)
    await store.publish()
    expect(store.needsRollbackConfirm).toBe(false)
    store.updateStep('a', { text: 'Правка' })
    expect(store.needsRollbackConfirm).toBe(true)
  })

  it('откат с несохранёнными правками спрашивает подтверждение с номером версии', async () => {
    const { store } = await setup()
    await store.publish()
    store.updateStep('a', { text: 'Правка' })
    const confirm = vi.fn().mockReturnValue(false)
    vi.stubGlobal('confirm', confirm)
    await useActivateVersion()(1)
    expect(confirm).toHaveBeenCalledWith('Черновик будет заменён версией 1. Продолжить?')
    // отказ: ничего не изменилось
    expect(store.steps.a!.text).toBe('Правка')
  })

  it('согласие заменяет черновик', async () => {
    const { store } = await setup()
    await store.publish()
    store.updateStep('a', { text: 'Правка' })
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    expect(await useActivateVersion()(1)).toBeNull()
    expect(store.steps.a!.text).toBe('Первый')
  })

  it('без правок и расхождений подтверждение не спрашивается', async () => {
    const { store } = await setup()
    await store.publish()
    const confirm = vi.fn()
    vi.stubGlobal('confirm', confirm)
    await useActivateVersion()(1)
    expect(confirm).not.toHaveBeenCalled()
    expect(store.activeVersion).toBe(1)
  })

  it('401 при откате ведёт на /login', async () => {
    const { repo } = await setup()
    vi.spyOn(repo, 'activate').mockRejectedValue(new SessionExpired())
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    expect(await useActivateVersion()(1)).toBeNull()
    expect(replace).toHaveBeenCalledWith('/login')
  })

  it('сбой отката возвращает текст', async () => {
    const { repo } = await setup()
    vi.spyOn(repo, 'activate').mockRejectedValue(new Error('x'))
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    expect(await useActivateVersion()(1)).toBe('Что-то пошло не так.')
  })
})
