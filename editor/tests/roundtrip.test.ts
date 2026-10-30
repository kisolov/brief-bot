import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useActivateVersion } from '~/composables/useActivateVersion'
import { useBrowseLeads } from '~/composables/useBrowseLeads'
import { useDownloadLeadFile } from '~/composables/useDownloadLeadFile'
import { useLoadScenario } from '~/composables/useLoadScenario'
import { useLoadVersions } from '~/composables/useLoadVersions'
import { __setContainer } from '~/container'
import { BackendUnavailable, SessionExpired } from '~/errors/base'
import { FILE_TOO_LARGE_TEXT } from '~/errors/presentation'
import { MockLeadRepository, sampleLeads } from '~/repositories/adapters/lead.mock'
import { MockScenarioRepository } from '~/repositories/adapters/scenario.mock'
import { useLeadStore } from '~/stores/lead.store'
import { useScenarioStore } from '~/stores/scenario.store'
import type { Scenario, VersionInfo } from '~/types/scenario'

const data: Scenario = { entry: 'a', blocks: {}, steps: { a: { type: 'text', text: 'Первый' } } }

const replace = vi.fn()

async function scenario() {
  const repo = new MockScenarioRepository({ data: structuredClone(data), revision: 1 })
  __setContainer({ scenarioRepository: repo })
  setActivePinia(createPinia())
  const store = useScenarioStore()
  return { repo, store }
}

/** Откат на сервере проходит, а следующее чтение черновика падает. */
function failAfterActivate(repo: MockScenarioRepository, error: Error) {
  const original = repo.activate.bind(repo)
  return vi.spyOn(repo, 'activate').mockImplementation(async (n: number) => {
    await original(n)
    vi.spyOn(repo, 'getDraft').mockRejectedValue(error)
  })
}

beforeEach(() => {
  replace.mockReset()
  vi.stubGlobal('useRouter', () => ({ replace }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('возврат на схему', () => {
  it('уход и возврат с несохранённой правкой не затирают её', async () => {
    const { repo, store } = await scenario()
    const getDraft = vi.spyOn(repo, 'getDraft')
    const loadScenario = useLoadScenario()
    expect(await loadScenario()).toBeNull()
    store.updateStep('a', { text: 'Правка' })
    expect(store.dirty).toBe(true)

    // страница схемы смонтирована заново
    expect(await useLoadScenario()()).toBeNull()
    expect(store.steps.a!.text).toBe('Правка')
    expect(store.dirty).toBe(true)
    expect(getDraft).toHaveBeenCalledTimes(1)
  })

  it('после упавшего автосохранения правка остаётся', async () => {
    const { repo, store } = await scenario()
    await useLoadScenario()()
    vi.spyOn(repo, 'saveDraft').mockRejectedValue(new BackendUnavailable())
    store.updateStep('a', { text: 'Правка' })
    await store.flush().catch(() => undefined)
    expect(store.saveFailed).toBe(true)

    await useLoadScenario()()
    expect(store.steps.a!.text).toBe('Правка')
    expect(store.saveFailed).toBe(true)
    expect(store.dirty).toBe(true)
  })

  it('откат перезагружает сценарий несмотря на loaded', async () => {
    const { store } = await scenario()
    await useLoadScenario()()
    await store.publish()
    store.updateStep('a', { text: 'Правка' })
    await store.flush()
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    expect(await useActivateVersion()(1)).toBeNull()
    expect(store.steps.a!.text).toBe('Первый')
    expect(store.dirty).toBe(false)
  })

  it('если после отката экран не обновился, говорит об этом', async () => {
    const { repo, store } = await scenario()
    await useLoadScenario()()
    await store.publish()
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const activate = failAfterActivate(repo, new BackendUnavailable())
    expect(await useActivateVersion()(1)).toBe('Откат выполнен, но обновить экран не удалось. Обновите страницу.')
    expect(activate).toHaveBeenCalledTimes(1)
  })

  it('401 при перезагрузке после отката ведёт на /login', async () => {
    const { repo, store } = await scenario()
    await useLoadScenario()()
    await store.publish()
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    failAfterActivate(repo, new SessionExpired())
    expect(await useActivateVersion()(1)).toBeNull()
    expect(replace).toHaveBeenCalledWith('/login')
  })
})

describe('заявки: выбор и фильтр через composable', () => {
  it('useBrowseLeads выбирает заявку и ставит фильтр', async () => {
    __setContainer({ leadRepository: new MockLeadRepository(sampleLeads(new Date('2026-10-30T15:00:00'))) })
    setActivePinia(createPinia())
    const store = useLeadStore()
    await store.load()
    const { select, setFilter } = useBrowseLeads()
    select(3)
    expect(store.selected?.id).toBe(3)
    setFilter('partial')
    expect(store.filter).toBe('partial')
    expect(store.selected?.id).toBe(2)
  })
})

describe('скачивание ТЗ', () => {
  let link: { href: string; download: string; click: ReturnType<typeof vi.fn> }
  let appended: unknown[]
  let removed: unknown[]

  function setup(configure?: (repo: MockLeadRepository) => void) {
    const repo = new MockLeadRepository(sampleLeads(new Date('2026-10-30T15:00:00')))
    configure?.(repo)
    __setContainer({ leadRepository: repo })
    setActivePinia(createPinia())
    link = { href: '', download: '', click: vi.fn() }
    appended = []
    removed = []
    vi.stubGlobal('document', {
      createElement: () => link,
      body: { appendChild: (n: unknown) => appended.push(n), removeChild: (n: unknown) => removed.push(n) },
    })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    return { repo, store: useLeadStore(), revoke }
  }

  it('успех: якорь в body, клик, удаление, отзыв ссылки позже', async () => {
    vi.useFakeTimers()
    const { revoke } = setup()
    expect(await useDownloadLeadFile()(4)).toBeNull()
    expect(link.download).toBe('tz-4.pdf')
    expect(link.href).toBe('blob:x')
    expect(link.click).toHaveBeenCalledTimes(1)
    expect(appended).toEqual([link])
    expect(removed).toEqual([link])
    expect(revoke).not.toHaveBeenCalled()
    await vi.runAllTimersAsync()
    expect(revoke).toHaveBeenCalledWith('blob:x')
  })

  it('413 даёт текст про 20 МБ', async () => {
    const { store } = setup((repo) => repo.oversized.add(4))
    await store.load()
    store.select(4)
    expect(await useDownloadLeadFile()(4)).toBe(FILE_TOO_LARGE_TEXT)
    expect(link.click).not.toHaveBeenCalled()
  })

  it('401 ведёт на /login', async () => {
    const { repo } = setup()
    vi.spyOn(repo, 'downloadFile').mockRejectedValue(new SessionExpired())
    expect(await useDownloadLeadFile()(4)).toBeNull()
    expect(replace).toHaveBeenCalledWith('/login')
  })

  it('ошибка запоздавшего ответа не попадает на чужую карточку', async () => {
    const { store } = setup((repo) => repo.oversized.add(4))
    await store.load()
    store.select(4)
    const pending = useDownloadLeadFile()(4)
    store.select(3)
    expect(await pending).toBeNull()
  })
})

describe('версии в шапке', () => {
  it('устаревший ответ не перезаписывает новый', async () => {
    const { repo, store } = await scenario()
    const old: VersionInfo[] = [{ number: 1, publishedAt: '2026-10-30T11:00:00Z', active: true }]
    const fresh: VersionInfo[] = [
      { number: 1, publishedAt: '2026-10-30T11:00:00Z', active: false },
      { number: 2, publishedAt: '2026-10-30T12:00:00Z', active: true },
    ]
    let release!: () => void
    const slow = new Promise<VersionInfo[]>((resolve) => {
      release = () => resolve(old)
    })
    vi.spyOn(repo, 'getVersions').mockReturnValueOnce(slow).mockResolvedValueOnce(fresh)
    const first = store.loadVersions()
    await store.loadVersions()
    expect(store.activeVersion).toBe(2)
    release()
    await first
    expect(store.activeVersion).toBe(2)
    expect(store.versions).toHaveLength(2)
  })

  it('сбой не 401 превращается в текст и не бросает', async () => {
    const { repo } = await scenario()
    vi.spyOn(repo, 'getVersions').mockRejectedValue(new BackendUnavailable())
    expect(await useLoadVersions()()).toBe('Сервер не отвечает. Попробуйте позже.')
    expect(replace).not.toHaveBeenCalled()
  })
})
