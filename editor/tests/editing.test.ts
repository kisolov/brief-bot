import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useAddStep } from '~/composables/useAddStep'
import { useAutosaveDraft } from '~/composables/useAutosaveDraft'
import { useConnectSteps } from '~/composables/useConnectSteps'
import { useEditStep } from '~/composables/useEditStep'
import { usePublishScenario } from '~/composables/usePublishScenario'
import { useScenarioLayout } from '~/composables/useScenarioLayout'
import { __setContainer } from '~/container'
import { BackendUnavailable } from '~/errors/base'
import { DraftConflict, ScenarioInvalid } from '~/errors/scenario'
import { MockScenarioRepository } from '~/repositories/adapters/scenario.mock'
import { useScenarioStore } from '~/stores/scenario.store'
import type { Issue, Scenario } from '~/types/scenario'
import { issueItems, locateIssue } from '~/utils/issues'
import { keyInfo } from '~/utils/stepKeys'
import { canChangeType, canFinish, convertStep } from '~/utils/stepType'
import { decodeTarget, encodeTarget, isConnected, targetChoices } from '~/utils/stepTargets'

const CONFLICT_TEXT = 'Сценарий изменён в другой вкладке. Обновите страницу.'
const NETWORK_TEXT = 'Не удалось сохранить. Проверьте соединение.'

function fixture(): Scenario {
  return {
    entry: 'menu',
    blocks: { sphere: 'sph', late: 'pick' },
    legacy: { keep: true },
    steps: {
      menu: {
        type: 'choice',
        text: 'Меню\nвторая строка',
        options: [
          { id: 'a', label: 'А', next: 'pay', when: { step: 'pick', any: ['p1'] } },
          { id: 'b', label: 'Б', next: { call: 'sphere', then: 'pay' } },
          { id: 'u', label: 'Сайт', url: 'https://example.com' },
        ],
      },
      pay: { type: 'text', text: 'Оплата', next: 'fin' },
      pick: {
        type: 'multi',
        text: 'Что нужно',
        options: [
          { id: 'p1', label: 'Один' },
          { id: 'p2', label: 'Два' },
        ],
        next: 'fin',
      },
      fin: {
        type: 'info',
        text: 'Готово',
        finish: true,
        back_to: 'pick',
        when: { step: 'pick', any: ['p1', 'p2'], none: ['p2'] },
        options: [{ id: 'z', label: 'Заново', next: 'menu' }],
      },
      sph: { type: 'info', text: 'Блок', next: '@return' },
    },
  }
}

async function setup(revision = 3) {
  const repo = new MockScenarioRepository({ data: fixture(), revision })
  __setContainer({ scenarioRepository: repo })
  setActivePinia(createPinia())
  const store = useScenarioStore()
  await store.load()
  return { store, repo }
}

function stubRouter(path = '/') {
  const replace = vi.fn()
  const push = vi.fn()
  vi.stubGlobal('useRouter', () => ({ replace, push, currentRoute: { value: { path } } }))
  return Object.assign(replace, { push })
}

describe('правка схемы', () => {
  it('test_connect_sets_option_next', async () => {
    const { store } = await setup()
    const { connect, disconnect } = useConnectSteps()
    connect('menu', 'a', 'sph')
    expect(store.steps.menu!.options![0]!.next).toBe('sph')
    connect('pay', ':next', 'menu')
    expect(store.steps.pay!.next).toBe('menu')
    disconnect('menu', 'a')
    expect(store.steps.menu!.options![0]).not.toHaveProperty('next')
    expect(store.steps.menu!.options![0]!.label).toBe('А')
  })

  it('ссылка на сайт и переход взаимоисключают друг друга', async () => {
    const { store } = await setup()
    const { connect } = useConnectSteps()
    connect('menu', 'u', 'pay')
    expect(store.steps.menu!.options![2]).not.toHaveProperty('url')
    expect(store.steps.menu!.options![2]!.next).toBe('pay')
    useEditStep().updateOption('menu', 'u', { url: 'https://a.b' })
    expect(store.steps.menu!.options![2]).not.toHaveProperty('next')
    expect(store.steps.menu!.options![2]!.url).toBe('https://a.b')
  })

  it('test_remove_step_clears_references', async () => {
    const { store } = await setup()
    const { removeStep } = useEditStep({ confirm: () => true })
    expect(removeStep('pay')).toBe(true)
    expect(store.steps.pay).toBeUndefined()
    expect(store.steps.menu!.options![0]).not.toHaveProperty('next')
    expect(store.steps.menu!.options![1]!.next).toEqual({ call: 'sphere' })
    expect(removeStep('pick')).toBe(true)
    // условия, ссылки назад и блок на удалённый шаг убраны
    expect(store.steps.fin).not.toHaveProperty('when')
    expect(store.steps.fin).not.toHaveProperty('back_to')
    expect(store.steps.menu!.options![0]).not.toHaveProperty('when')
    expect(store.blocks).toEqual({ sphere: 'sph' })
    const out = store.toDraftData()
    expect(JSON.stringify(out)).not.toMatch(/"(pay|pick)"/)
    expect(out.legacy).toEqual({ keep: true })
  })

  it('начальный шаг удалить нельзя', async () => {
    const { store } = await setup()
    const { removeStep, canRemove } = useEditStep({ confirm: () => true })
    expect(canRemove('menu')).toBe(false)
    expect(removeStep('menu')).toBe(false)
    expect(store.steps.menu).toBeDefined()
  })

  it('шаг, на который указывает блок, удаляется только с подтверждения', async () => {
    const { store } = await setup()
    const ask = vi.fn(() => false)
    const { removeStep } = useEditStep({ confirm: ask })
    expect(removeStep('pick')).toBe(false)
    expect(ask).toHaveBeenCalledTimes(1)
    expect(store.steps.pick).toBeDefined()
    // шаг без блока спрашивать не заставляет
    expect(useEditStep({ confirm: ask }).removeStep('pay')).toBe(true)
    expect(ask).toHaveBeenCalledTimes(1)
  })

  it('test_add_option_generates_short_id', async () => {
    const { store } = await setup()
    const { addOption } = useEditStep()
    const a = addOption('pick')!
    const b = addOption('pick')!
    expect(a).toMatch(/^o_[a-z0-9]{8}$/)
    expect(b).not.toBe(a)
    expect(store.steps.pick!.options!.map((o) => o.id)).toEqual(['p1', 'p2', a, b])
    expect(`s:pick:o:${a}`.length).toBeLessThanOrEqual(64)
  })

  it('новый шаг получает id s_ и 8 символов base36', async () => {
    const { store } = await setup()
    const id = useAddStep()('text', { pos: [10, 20] })
    expect(id).toMatch(/^s_[a-z0-9]{8}$/)
    expect(store.steps[id]!.pos).toEqual([10, 20])
    expect(store.selectedId).toBe(id)
  })

  it('удаление кнопки снимает её из условий показа', async () => {
    const { store } = await setup()
    useEditStep().removeOption('pick', 'p2')
    expect(store.steps.fin!.when).toEqual({ step: 'pick', any: ['p1'], none: [] })
    useEditStep().removeOption('pick', 'p1')
    expect(store.steps.fin).not.toHaveProperty('when')
    expect(store.steps.menu!.options![0]).not.toHaveProperty('when')
  })

  it('правки не меняют прежние объекты и сохраняют порядок шагов', async () => {
    const { store } = await setup()
    const before = store.steps
    const menuBefore = store.steps.menu
    useEditStep().updateStep('pay', { text: 'Новый' })
    expect(store.steps).not.toBe(before)
    expect(store.steps.menu).toBe(menuBefore)
    expect(before.pay!.text).toBe('Оплата')
    expect(Object.keys(store.steps)).toEqual(['menu', 'pay', 'pick', 'fin', 'sph'])
  })

  it('перетаскивание пишет pos, "Разложить" очищает pos шагов вида', async () => {
    const { store } = await setup()
    const { moveStep } = useEditStep()
    moveStep('menu', [100, 200])
    moveStep('sph', [5, 5])
    expect(store.steps.menu!.pos).toEqual([100, 200])
    const { relayout, nodes } = useScenarioLayout()
    relayout()
    await nextTick()
    expect(store.steps.menu).not.toHaveProperty('pos')
    // шаг блока вне главного вида остаётся на месте
    expect(store.steps.sph!.pos).toEqual([5, 5])
    expect(nodes.value.length).toBeGreaterThan(0)
  })

  it('шаг из палитры в блоке остаётся виден в этом блоке', async () => {
    const { store } = await setup()
    const { view, setView, nodes } = useScenarioLayout()
    setView('sphere')
    await nextTick()
    const id = useAddStep()('text', { pos: [0, 0], view: view.value })
    await nextTick()
    expect(nodes.value.some((n) => n.id === id)).toBe(true)
    setView('main')
    await nextTick()
    expect(nodes.value.some((n) => n.id === id)).toBe(false)
    expect(store.steps[id]).toBeDefined()
  })

  it('клик по шагу выбирает его', async () => {
    const { store } = await setup()
    const { selectNode } = useScenarioLayout()
    expect(selectNode('pay')).toEqual({})
    expect(store.selectedId).toBe('pay')
  })

  it('клик по общему блоку открывает его вкладку', async () => {
    const { store } = await setup()
    store.select('pay')
    const { view, selectNode, nodes } = useScenarioLayout()
    const call = nodes.value.find((n) => n.type === 'block')!
    expect(selectNode(call.id)).toEqual({})
    expect(view.value).toBe('sphere')
    expect(store.selectedId).toBeNull()
  })

  it('клик по переходу на шаг открывает шаг на его вкладке', async () => {
    const { store } = await setup()
    const { view, setView, selectNode, nodes } = useScenarioLayout()
    setView('late')
    await nextTick()
    const stub = nodes.value.find((n) => n.type === 'stub' && n.data.kind === 'link')!
    const target = stub.data.stepId as string
    expect(selectNode(stub.id)).toEqual({ reveal: target })
    expect(store.selectedId).toBe(target)
    expect(view.value).toBe('main')
  })

  it('клик по выходу из блока объясняет, куда идёт бот', async () => {
    const { store } = await setup()
    const { setView, selectNode, nodes, view } = useScenarioLayout()
    setView('sphere')
    await nextTick()
    const stub = nodes.value.find((n) => n.type === 'stub' && n.data.kind === 'return')!
    expect(selectNode(stub.id)).toEqual({
      hint: 'Здесь блок заканчивается: бот возвращается на шаг, указанный при входе в блок.',
    })
    expect(store.selectedId).toBeNull()
    expect(view.value).toBe('sphere')
  })

  it('кнопка "Новый шаг" в списке переходов создаёт шаг и соединяет', async () => {
    const { store } = await setup()
    const id = useAddStep()('info', { from: { step: 'menu', handle: 'a' } })
    expect(store.steps.menu!.options![0]!.next).toBe(id)
    expect(store.steps[id]!.type).toBe('info')
  })

  it('новый шаг создаётся с текстом, а не пустым', async () => {
    const { store } = await setup()
    const id = useAddStep()('text', { pos: [10, 20] })
    expect(store.steps[id]!.text).toBe('Новый шаг')
  })
})

describe('списки переходов', () => {
  it('кодирует и разбирает цель', () => {
    expect(decodeTarget('')).toBeUndefined()
    expect(decodeTarget('step:pay')).toBe('pay')
    expect(decodeTarget('@return')).toBe('@return')
    expect(decodeTarget('block:sphere')).toEqual({ call: 'sphere' })
    expect(encodeTarget(undefined)).toBe('')
    expect(encodeTarget('pay')).toBe('step:pay')
    expect(encodeTarget({ call: 'sphere', then: 'pay' })).toBe('block:sphere')
    expect(encodeTarget('@return')).toBe('@return')
  })

  it('выход из блока предлагается только внутри блока', () => {
    const s = fixture()
    const inMain = targetChoices(s, 'main')
    const inBlock = targetChoices(s, 'sphere')
    expect(inMain.some((c) => c.value === '@return')).toBe(false)
    expect(inBlock.find((c) => c.value === '@return')?.label).toBe('Вернуться из блока')
    expect(inMain.find((c) => c.value === 'step:menu')?.label).toBe('Меню')
    expect(inMain.find((c) => c.value === 'block:sphere')?.label).toBe('Перейти в блок: Сфера деятельности')
  })
})

describe('автосохранение', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 30, 14, 32, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('test_autosave_debounced', async () => {
    stubRouter()
    const { repo, store } = await setup(3)
    const save = vi.spyOn(repo, 'saveDraft')
    const { status, stop } = useAutosaveDraft()
    const edit = useEditStep()
    edit.updateStep('pay', { text: 'раз' })
    await vi.advanceTimersByTimeAsync(500)
    edit.updateStep('pay', { text: 'два' })
    await vi.advanceTimersByTimeAsync(500)
    edit.updateStep('pay', { text: 'три' })
    await vi.advanceTimersByTimeAsync(799)
    expect(save).not.toHaveBeenCalled()
    expect(status.value).toBe('Сохраняем…')
    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect((save.mock.calls[0]![0] as Scenario).steps.pay!.text).toBe('три')
    expect(save.mock.calls[0]![1]).toBe(3)
    expect(store.revision).toBe(4)
    expect(status.value).toBe('Черновик сохранён в 14:32')
    stop()
  })

  it('правка во время сохранения: следующее сохранение идёт с новой ревизией', async () => {
    stubRouter()
    const { repo, store } = await setup(3)
    const release: Array<(rev: number) => void> = []
    const save = vi.spyOn(repo, 'saveDraft').mockImplementation(
      () => new Promise<number>((resolve) => release.push(resolve)),
    )
    const { stop } = useAutosaveDraft()
    const edit = useEditStep()
    edit.updateStep('pay', { text: 'первая' })
    await vi.advanceTimersByTimeAsync(800)
    expect(save).toHaveBeenCalledTimes(1)
    edit.updateStep('pay', { text: 'вторая' })
    await vi.advanceTimersByTimeAsync(800)
    // первый ответ ещё не пришёл: второе сохранение ждёт
    expect(save).toHaveBeenCalledTimes(1)
    release[0]!(4)
    await vi.advanceTimersByTimeAsync(0)
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1]![1]).toBe(4)
    expect((save.mock.calls[1]![0] as Scenario).steps.pay!.text).toBe('вторая')
    release[1]!(5)
    await vi.advanceTimersByTimeAsync(0)
    expect(store.revision).toBe(5)
    expect(store.dirty).toBe(false)
    stop()
  })

  it('сбой сети: понятный текст, следующая правка повторяет попытку', async () => {
    stubRouter()
    const { repo, store } = await setup(3)
    const save = vi.spyOn(repo, 'saveDraft').mockRejectedValueOnce(new BackendUnavailable())
    const { status, stop } = useAutosaveDraft()
    const edit = useEditStep()
    edit.updateStep('pay', { text: 'раз' })
    await vi.advanceTimersByTimeAsync(800)
    expect(status.value).toBe(NETWORK_TEXT)
    expect(store.dirty).toBe(true)
    edit.updateStep('pay', { text: 'два' })
    await vi.advanceTimersByTimeAsync(800)
    expect(save).toHaveBeenCalledTimes(2)
    expect(status.value).toBe('Черновик сохранён в 14:32')
    stop()
  })

  it('test_conflict_shows_reload_message', async () => {
    stubRouter()
    const { repo, store } = await setup(3)
    const save = vi.spyOn(repo, 'saveDraft').mockRejectedValue(new DraftConflict())
    const { status, stop } = useAutosaveDraft()
    const edit = useEditStep()
    edit.updateStep('pay', { text: 'раз' })
    await vi.advanceTimersByTimeAsync(800)
    expect(status.value).toBe(CONFLICT_TEXT)
    expect(store.conflict).toBe(true)
    // редактирование заблокировано, повторов нет
    edit.updateStep('pay', { text: 'два' })
    expect(store.steps.pay!.text).toBe('раз')
    await vi.advanceTimersByTimeAsync(2000)
    expect(save).toHaveBeenCalledTimes(1)
    stop()
  })
})

describe('публикация', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('сначала дожимает черновик, потом публикует; успех показывает версию и сбрасывает ошибки', async () => {
    stubRouter()
    const { repo, store } = await setup(3)
    const order: string[] = []
    vi.spyOn(repo, 'saveDraft').mockImplementation(async () => {
      order.push('save')
      return 4
    })
    vi.spyOn(repo, 'publish').mockImplementation(async () => {
      order.push('publish')
      return 2
    })
    store.setIssues([{ code: 'missing_next', stepId: 'pay', optionId: null, message: 'x' }])
    useEditStep().updateStep('pay', { text: 'правка' })
    await usePublishScenario()()
    expect(order).toEqual(['save', 'publish'])
    expect(store.activeVersion).toBe(2)
    expect(store.issues).toEqual([])
    expect(store.publishing).toBe(false)
    expect(store.notice).toBeNull()
  })

  it('повторная публикация без правок допустима', async () => {
    stubRouter()
    const { repo } = await setup(3)
    const publish = vi.spyOn(repo, 'publish')
    await usePublishScenario()()
    await usePublishScenario()()
    expect(publish).toHaveBeenCalledTimes(2)
  })

  it('не публикует, если черновик не сохранился', async () => {
    stubRouter()
    const { repo, store } = await setup(3)
    vi.spyOn(repo, 'saveDraft').mockRejectedValue(new BackendUnavailable())
    const publish = vi.spyOn(repo, 'publish')
    useEditStep().updateStep('pay', { text: 'правка' })
    await usePublishScenario()()
    expect(publish).not.toHaveBeenCalled()
    expect(store.notice).toBe(NETWORK_TEXT)
    expect(store.publishing).toBe(false)
  })

  const issues: Issue[] = [
    { code: 'missing_next', stepId: 'menu', optionId: 'a', message: 'Кнопка "А" никуда не ведёт. Выберите следующий шаг.' },
    { code: 'missing_next', stepId: 'pay', optionId: null, message: 'После ответа бот не знает, куда идти.' },
    { code: 'missing_target', stepId: 'late', optionId: null, message: 'Блок ведёт на шаг, которого нет.' },
    { code: 'malformed', stepId: '', optionId: null, message: 'не разобрать' },
  ]

  it('test_publish_errors_mark_nodes', async () => {
    stubRouter()
    const { repo, store } = await setup(3)
    vi.spyOn(repo, 'publish').mockRejectedValue(new ScenarioInvalid(issues))
    const { nodes } = useScenarioLayout()
    await usePublishScenario()()
    await nextTick()
    expect(store.issues).toEqual(issues)
    expect(store.activeVersion).toBe(1)
    const byId = new Map(nodes.value.map((n) => [n.id, n]))
    expect(byId.get('menu')!.data.state).toBe('error')
    expect(byId.get('menu')!.data.errorNumbers).toEqual([1])
    expect(byId.get('pay')!.data.state).toBe('error')
    expect(byId.get('pay')!.data.errorNumbers).toEqual([2])
    expect(byId.get('fin')!.data.state).toBeUndefined()
  })

  it('ошибки живут до следующей успешной публикации, правка их не сбрасывает', async () => {
    stubRouter()
    const { repo, store } = await setup(3)
    vi.spyOn(repo, 'publish').mockRejectedValueOnce(new ScenarioInvalid(issues))
    await usePublishScenario()()
    useEditStep().updateStep('pay', { text: 'правка' })
    expect(store.issues).toHaveLength(4)
    await usePublishScenario()()
    expect(store.issues).toEqual([])
    expect(store.activeVersion).toBe(2)
  })

  it('сбой сети при публикации оставляет понятное сообщение', async () => {
    stubRouter()
    const { repo, store } = await setup(3)
    vi.spyOn(repo, 'publish').mockRejectedValue(new BackendUnavailable())
    await usePublishScenario()()
    expect(store.notice).toBe('Не удалось опубликовать. Проверьте соединение.')
    expect(store.issues).toEqual([])
  })

  it('клик по ошибке ведёт на шаг и на вкладку блока; malformed без перехода', async () => {
    await setup(3)
    const s = fixture()
    expect(locateIssue(s, issues[0]!)).toEqual({ view: 'main', stepId: 'menu' })
    expect(locateIssue(s, { ...issues[0]!, stepId: 'sph' })).toEqual({ view: 'sphere', stepId: 'sph' })
    expect(locateIssue(s, issues[2]!)).toEqual({ view: 'late', stepId: null })
    expect(locateIssue(s, issues[3]!)).toBeNull()
    const items = issueItems(s, issues)
    expect(items.map((i) => i.number)).toEqual([1, 2, 3, 4])
    expect(items[0]!.title).toBe('Меню')
    expect(items[0]!.text).toBe(issues[0]!.message)
    expect(items[3]!.title).toBe('Сценарий')
  })

  it('новые коды проверки ведут на шаг с ошибкой', async () => {
    await setup(3)
    const s = fixture()
    const codes = ['empty_text', 'empty_label', 'text_too_long', 'bad_url', 'bad_finish', 'input_on_multi', 'missing_key']
    const found = codes.map((code) => ({ code, stepId: 'pay', optionId: null, message: `текст ${code}` }))
    for (const issue of found) expect(locateIssue(s, issue)).toEqual({ view: 'main', stepId: 'pay' })
    expect(locateIssue(s, { ...found[0]!, stepId: 'sph' })).toEqual({ view: 'sphere', stepId: 'sph' })
    expect(issueItems(s, found).map((i) => i.text)).toEqual(found.map((i) => i.message))
  })

  it('ошибки со страницы вне схемы ведут на схему и снимают выбор шага', async () => {
    const router = stubRouter('/leads')
    const { repo, store } = await setup(3)
    store.select('pay')
    vi.spyOn(repo, 'publish').mockRejectedValue(new ScenarioInvalid(issues))
    await usePublishScenario()()
    expect(router.push).toHaveBeenCalledWith('/')
    expect(store.selectedId).toBeNull()
    expect(store.issues).toEqual(issues)
  })

  it('незагруженный сценарий читается до перехода: схема не стирает ошибки', async () => {
    const router = stubRouter('/settings')
    const repo = new MockScenarioRepository({ data: fixture(), revision: 3 })
    __setContainer({ scenarioRepository: repo })
    setActivePinia(createPinia())
    const store = useScenarioStore()
    vi.spyOn(repo, 'publish').mockRejectedValue(new ScenarioInvalid(issues))
    await usePublishScenario()()
    expect(store.loaded).toBe(true)
    expect(store.issues).toEqual(issues)
    expect(router.push).toHaveBeenCalledWith('/')
  })

  it('на схеме публикация с ошибками никуда не ведёт', async () => {
    const router = stubRouter('/')
    const { repo, store } = await setup(3)
    store.select('pay')
    vi.spyOn(repo, 'publish').mockRejectedValue(new ScenarioInvalid(issues))
    await usePublishScenario()()
    expect(router.push).not.toHaveBeenCalled()
    expect(store.selectedId).toBe('pay')
  })

  it('успешная публикация со страницы вне схемы остаётся на месте', async () => {
    const router = stubRouter('/versions')
    await setup(3)
    await usePublishScenario()()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('jumpTo переключает вкладку и выбирает шаг', async () => {
    const { store } = await setup(3)
    const { view, jumpTo } = useScenarioLayout()
    jumpTo({ code: 'x', stepId: 'sph', optionId: null, message: '' })
    expect(view.value).toBe('sphere')
    expect(store.selectedId).toBe('sph')
    jumpTo({ code: 'malformed', stepId: '', optionId: null, message: '' })
    expect(view.value).toBe('sphere')
  })
})

async function setupWith(data: Scenario) {
  const repo = new MockScenarioRepository({ data, revision: 1 })
  __setContainer({ scenarioRepository: repo })
  setActivePinia(createPinia())
  const store = useScenarioStore()
  await store.load()
  return { store, repo }
}

function keyFixture(): Scenario {
  return {
    entry: 'a',
    blocks: {},
    steps: {
      a: { type: 'text', text: 'Привет, {name}!', key: 'name', next: 'b' },
      b: { type: 'text', text: 'Ветка', key: 'Направление', next: 'c' },
      c: { type: 'text', text: 'Город', key: 'city', next: 'd' },
      d: { type: 'text', text: 'Вы из {city}', key: 'city', next: 'e' },
      e: { type: 'info', text: 'Конец' },
      lone: { type: 'info', text: 'Сирота' },
    },
  }
}

describe('подпись ответа (key)', () => {
  it('подписи, которые использует бот, заблокированы и показаны по-человечески', async () => {
    const { store } = await setupWith(keyFixture())
    const s = store.scenario
    expect(keyInfo(s, 'a')).toMatchObject({ locked: true, label: 'Имя' })
    expect(keyInfo(s, 'b')).toMatchObject({ locked: true, label: 'Направление' })
    expect(keyInfo(s, 'c')).toMatchObject({ locked: false, label: 'city' })
  })

  it('нельзя сделать подпись равной name или Направление, заблокированную нельзя менять', async () => {
    const { store } = await setupWith(keyFixture())
    const { setKey } = useEditStep()
    expect(setKey('c', 'name')).toBe(false)
    expect(setKey('c', 'Направление')).toBe(false)
    expect(setKey('a', 'other')).toBe(false)
    expect(setKey('b', '')).toBe(false)
    expect(store.steps.c!.key).toBe('city')
    expect(store.steps.a!.key).toBe('name')
    expect(setKey('c', ' name')).toBe(false)
    expect(setKey('c', 'Направление ')).toBe(false)
    expect(setKey('c', '  town ')).toBe(true)
    expect(store.steps.c!.key).toBe('town')
    expect(setKey('c', '')).toBe(true)
    expect(store.steps.c).not.toHaveProperty('key')
  })

  it('предупреждает о подписи из текста другого шага и о дубле', async () => {
    const { store } = await setupWith(keyFixture())
    const s = store.scenario
    expect(keyInfo(s, 'c').usedIn).toEqual(['d'])
    expect(keyInfo(s, 'c').duplicate).toBe(true)
    expect(keyInfo(s, 'd').usedIn).toEqual([])
    expect(keyInfo(s, 'd').duplicate).toBe(true)
    expect(keyInfo(s, 'e').duplicate).toBe(false)
    // правка разрешена
    expect(useEditStep().setKey('c', 'town')).toBe(true)
  })

  it('шаг без входящих стрелок помечен как неподключённый', async () => {
    const { store } = await setupWith(keyFixture())
    expect(isConnected(store.scenario, 'lone')).toBe(false)
    expect(isConnected(store.scenario, 'a')).toBe(true)
    expect(isConnected(store.scenario, 'c')).toBe(true)
  })
})

describe('адрес ссылки', () => {
  it('пустая строка остаётся строкой: режим ссылки не пропадает', async () => {
    const { store } = await setup()
    useEditStep().updateOption('menu', 'a', { url: '' })
    const o = store.steps.menu!.options![0]!
    expect(o.url).toBe('')
    expect(o).not.toHaveProperty('next')
    useEditStep().updateOption('menu', 'a', { url: 'https://x.y' })
    expect(store.steps.menu!.options![0]!.url).toBe('https://x.y')
    useEditStep().updateOption('menu', 'a', { url: '' })
    expect(store.steps.menu!.options![0]!.url).toBe('')
    useConnectSteps().connect('menu', 'a', 'pay')
    expect(store.steps.menu!.options![0]).not.toHaveProperty('url')
  })
})

describe('смена типа шага', () => {
  function typed(): Scenario {
    return {
      entry: 'c',
      blocks: {},
      steps: {
        c: {
          type: 'choice',
          text: 'Выбор',
          key: 'k',
          validate: 'phone',
          options: [
            { id: 'x', label: 'X', next: 'z', input: 'Что?', exclusive: true },
            { id: 'y', label: 'Y', next: 'w' },
          ],
          next: 'z',
        },
        m: { type: 'multi', text: 'Мульти', options: [{ id: 'p', label: 'P', next: 'z' }, { id: 'q', label: 'Q', next: 'w' }] },
        z: { type: 'info', text: 'Z' },
        w: { type: 'info', text: 'W' },
        p: { type: 'info', text: 'P', next: 'z' },
        f: { type: 'choice', text: 'Финал', finish: true, options: [{ id: 'o', label: 'O', next: 'z' }] },
      },
    }
  }

  it('текст и файл теряют кнопки, validate остаётся только у текста', () => {
    const c = typed().steps.c!
    const toText = convertStep(c, 'text')
    expect(toText.step).not.toHaveProperty('options')
    expect(toText.step.validate).toBe('phone')
    expect(toText.lostButtons).toBe(2)
    const toFile = convertStep(c, 'file')
    expect(toFile.step).not.toHaveProperty('validate')
    expect(toFile.step.key).toBe('k')
  })

  it('сообщение сохраняет кнопки, но без подписи ответа и проверки', () => {
    const toInfo = convertStep(typed().steps.c!, 'info')
    expect(toInfo.step.options).toHaveLength(2)
    expect(toInfo.step).not.toHaveProperty('key')
    expect(toInfo.step).not.toHaveProperty('validate')
    expect(toInfo.lostButtons).toBe(0)
    expect(toInfo.lostLinks).toBe(0)
  })

  it('несколько ответов: переходы кнопок уходят, у шага без next берётся next первой кнопки', () => {
    const c = typed().steps.c!
    const keep = convertStep(c, 'multi')
    expect(keep.step.next).toBe('z')
    expect(keep.step.options!.every((o) => !('next' in o))).toBe(true)
    expect(keep.lostLinks).toBe(2)
    const noNext = convertStep({ ...c, next: undefined }, 'multi_input')
    expect(noNext.step.next).toBe('z')
    expect(noNext.lostLinks).toBe(1)
  })

  it('выбор: снимаются input, exclusive и next шага', () => {
    const m = { ...typed().steps.m!, next: 'z', options: [{ id: 'p', label: 'P', input: 'Что?', exclusive: true }] }
    const out = convertStep(m, 'choice')
    expect(out.step).not.toHaveProperty('next')
    expect(out.step.options![0]).toEqual({ id: 'p', label: 'P' })
    expect(out.lostLinks).toBe(1)
  })

  it('при потере кнопок или переходов спрашивает, отказ ничего не меняет', async () => {
    const { store } = await setupWith(typed())
    const ask = vi.fn(() => false)
    useEditStep({ confirm: ask }).changeType('c', 'text')
    expect(ask).toHaveBeenCalledTimes(1)
    expect(ask.mock.calls[0]![0]).toContain('2')
    expect(store.steps.c!.type).toBe('choice')
    expect(store.steps.c!.options).toHaveLength(2)
    useEditStep({ confirm: () => true }).changeType('c', 'text')
    expect(store.steps.c!.type).toBe('text')
    expect(store.steps.c).not.toHaveProperty('options')
  })

  it('несколько ответов: свой текст снимается, он есть только у "Несколько + поле"', () => {
    const m = { ...typed().steps.m!, type: 'multi_input' as const, options: [{ id: 'p', label: 'P', input: 'Что?', exclusive: true }] }
    expect(convertStep(m, 'multi').step.options![0]).toEqual({ id: 'p', label: 'P', exclusive: true })
    const back = { ...typed().steps.c!, type: 'info' as const, options: [{ id: 'p', label: 'P', input: 'Что?' }] }
    expect(convertStep(back, 'multi_input').step.options![0]).toEqual({ id: 'p', label: 'P', input: 'Что?' })
  })

  it('сообщение без кнопок и перехода меняет тип: концом анкеты его делает только finish', async () => {
    const { store } = await setupWith(typed())
    expect(canChangeType(store.steps.z!)).toBe(true)
    expect(useEditStep({ confirm: () => true }).changeType('z', 'text')).toBe(true)
    expect(store.steps.z!.type).toBe('text')
  })

  it('завершать анкету могут все типы, кроме текста и файла', () => {
    expect(canFinish('text')).toBe(false)
    expect(canFinish('file')).toBe(false)
    for (const type of ['choice', 'info', 'multi', 'multi_input'] as const) expect(canFinish(type)).toBe(true)
  })

  it('тип служебных шагов не меняется: завершающий, name, Направление', async () => {
    const data = typed()
    data.steps.nm = { type: 'text', text: 'Имя?', key: 'name', next: 'z' }
    data.steps.dir = { type: 'choice', text: 'Куда?', key: 'Направление', options: [{ id: 'a', label: 'A', next: 'z' }] }
    const { store } = await setupWith(data)
    const edit = useEditStep({ confirm: () => true })
    for (const id of ['f', 'nm', 'dir']) {
      expect(canChangeType(store.steps[id]!)).toBe(false)
      expect(edit.changeType(id, 'multi')).toBe(false)
      expect(edit.changeType(id, 'info')).toBe(false)
    }
    expect(store.steps.f!.options![0]!.next).toBe('z')
    expect(store.steps.nm!.key).toBe('name')
    expect(store.steps.dir!.key).toBe('Направление')
    expect(canChangeType(store.steps.p!)).toBe(true)
    expect(edit.changeType('p', 'text')).toBe(true)
  })

  it('без потерь смена типа идёт без вопроса', async () => {
    const { store } = await setupWith(typed())
    const ask = vi.fn(() => false)
    expect(useEditStep({ confirm: ask }).changeType('p', 'file')).toBe(true)
    expect(ask).not.toHaveBeenCalled()
    expect(store.steps.p!.type).toBe('file')
  })
})

describe('условие показа', () => {
  it('снятие последней отметки снимает условие, если "не отмечено" пусто', async () => {
    const { store } = await setup()
    const edit = useEditStep()
    edit.setCondition('fin', { step: 'pick', any: ['p1'] })
    edit.setAnswer('fin', 'any', 'p1', false)
    expect(store.steps.fin).not.toHaveProperty('when')
  })

  it('если "не отмечено" не пусто, условие остаётся с пустым any для выбора пользователя', async () => {
    const { store } = await setup()
    const edit = useEditStep()
    edit.setCondition('fin', { step: 'pick', any: ['p1'], none: ['p2'] })
    edit.setAnswer('fin', 'any', 'p1', false)
    expect(store.steps.fin!.when).toEqual({ step: 'pick', any: [], none: ['p2'] })
    edit.removeOption('pick', 'p2')
    // none опустел, any пуст: условия больше нет
    expect(store.steps.fin).not.toHaveProperty('when')
  })

  it('removeOption с живым none не снимает условие', async () => {
    const { store } = await setup()
    useEditStep().setCondition('fin', { step: 'pick', any: ['p1'], none: ['p2'] })
    useEditStep().removeOption('pick', 'p1')
    expect(store.steps.fin!.when).toEqual({ step: 'pick', any: [], none: ['p2'] })
  })
})

describe('условие показа кнопки', () => {
  it('задаётся и снимается на кнопке, шаг не трогает', async () => {
    const { store } = await setup()
    const edit = useEditStep()
    const before = store.steps.menu!.when
    edit.setCondition('menu', { step: 'pick', any: ['p1'] }, 'b')
    expect(store.steps.menu!.options![1]!.when).toEqual({ step: 'pick', any: ['p1'] })
    expect(store.steps.menu!.when).toEqual(before)
    edit.setCondition('menu', undefined, 'b')
    expect(store.steps.menu!.options![1]).not.toHaveProperty('when')
  })

  it('отметки меняют условие кнопки, переход и ссылка остаются', async () => {
    const { store } = await setup()
    const edit = useEditStep()
    edit.setCondition('menu', { step: 'pick', any: ['p1'] }, 'a')
    edit.setAnswer('menu', 'none', 'p2', true, 'a')
    edit.setAnswer('menu', 'any', 'p2', true, 'a')
    const option = store.steps.menu!.options![0]!
    expect(option.when).toEqual({ step: 'pick', any: ['p1', 'p2'], none: ['p2'] })
    expect(option.next).toBe('pay')
    edit.setCondition('menu', { step: 'pick', any: ['p1'] }, 'u')
    expect(store.steps.menu!.options![2]!.url).toBe('https://example.com')
  })

  it('снятие последней отметки снимает условие кнопки', async () => {
    const { store } = await setup()
    const edit = useEditStep()
    edit.setCondition('menu', { step: 'pick', any: ['p1'] }, 'b')
    edit.setAnswer('menu', 'any', 'p1', false, 'b')
    expect(store.steps.menu!.options![1]).not.toHaveProperty('when')
  })

  it('whenOf читает условие шага и кнопки', async () => {
    await setup()
    const { whenOf } = useEditStep()
    expect(whenOf('menu', 'a')).toEqual({ step: 'pick', any: ['p1'] })
    expect(whenOf('fin')).toEqual({ step: 'pick', any: ['p1', 'p2'], none: ['p2'] })
    expect(whenOf('нет')).toBeUndefined()
  })
})

describe('несохранённые правки', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('beforeunload останавливает закрытие, пока есть несохранённое', async () => {
    stubRouter()
    const handlers: Record<string, (e: unknown) => void> = {}
    vi.stubGlobal('window', {
      addEventListener: (name: string, fn: (e: unknown) => void) => (handlers[name] = fn),
      removeEventListener: (name: string) => delete handlers[name],
    })
    const { store } = await setup()
    const { stop } = useAutosaveDraft()
    const event = { preventDefault: vi.fn(), returnValue: undefined as unknown }
    handlers.beforeunload!(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
    useEditStep().updateStep('pay', { text: 'правка' })
    expect(store.dirty).toBe(true)
    handlers.beforeunload!(event)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    stop()
    expect(handlers.beforeunload).toBeUndefined()
  })
})
