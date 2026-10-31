import { describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAddStep } from '~/composables/useAddStep'
import { useConnectSteps } from '~/composables/useConnectSteps'
import { useManageBlocks } from '~/composables/useManageBlocks'
import { __setContainer } from '~/container'
import { MockScenarioRepository } from '~/repositories/adapters/scenario.mock'
import { useScenarioStore } from '~/stores/scenario.store'
import type { Scenario } from '~/types/scenario'
import { stepIdsOf, toFlow, viewOfStep, viewTabs } from '~/utils/scenarioGraph'
import { menuChoices, thenChoices } from '~/utils/stepTargets'

const HINT = 'Выберите шаг в панели справа.'

function fixture(): Scenario {
  return {
    entry: 'menu',
    blocks: { sphere: 'sph', two: 'tw' },
    steps: {
      menu: {
        type: 'choice',
        text: 'Меню',
        options: [
          { id: 'a', label: 'А', next: 'pay' },
          { id: 'b', label: 'Б', next: { call: 'sphere', then: 'pay' } },
          { id: 'c', label: 'В', next: { call: 'sphere', then: 'fin' } },
          { id: 'd', label: 'Г', next: { call: 'sphere' } },
          { id: 'e', label: 'Д', next: 'ghost' },
          { id: 'f', label: 'Е', next: { call: 'two', then: 'fin' } },
        ],
      },
      pay: { type: 'text', text: 'Оплата', next: { call: 'sphere', then: 'fin' } },
      fin: { type: 'info', text: 'Готово', finish: true },
      sph: {
        type: 'choice',
        text: 'Сфера',
        options: [
          { id: 'x', label: 'Икс', next: 'sph2' },
          { id: 'y', label: 'Игрек', next: '@return' },
        ],
      },
      sph2: { type: 'info', text: 'Ещё', next: '@return' },
      // второй блок заходит в середину первого: sph2 виден на двух вкладках
      tw: { type: 'info', text: 'Второй', next: 'sph2' },
    },
  }
}

async function setup() {
  const repo = new MockScenarioRepository({ data: fixture(), revision: 1 })
  __setContainer({ scenarioRepository: repo })
  setActivePinia(createPinia())
  const store = useScenarioStore()
  await store.load()
  return { store, repo }
}

function nodeOf(store: ReturnType<typeof useScenarioStore>, view: string, id: string) {
  const found = toFlow(store.scenario, view, store.homes).nodes.find((n) => n.id === id)
  if (!found) throw new Error(`нет ноды ${id} на виде ${view}`)
  return found
}

describe('стрелка на карточки', () => {
  it('карточка блока помнит, куда возвращается и из каких шагов собрана', async () => {
    const { store } = await setup()
    const card = nodeOf(store, 'main', 'call:sphere>fin')
    expect(card.data.block).toBe('sphere')
    expect(card.data.then).toBe('fin')
    expect(card.data.sources).toEqual(['menu', 'pay'])
    expect(nodeOf(store, 'main', 'call:sphere>').data.then).toBeUndefined()
  })

  it('шаг на карточку блока: переход как у карточки', async () => {
    const { store } = await setup()
    const { connectNodes } = useConnectSteps()
    store.updateStep('fin', { next: undefined })
    const hint = connectNodes(nodeOf(store, 'main', 'fin'), ':next', nodeOf(store, 'main', 'call:sphere>pay'))
    expect(hint).toBeUndefined()
    expect(store.steps.fin!.next).toStrictEqual({ call: 'sphere', then: 'pay' })
  })

  it('карточка без возврата пишется без then', async () => {
    const { store } = await setup()
    const { connectNodes } = useConnectSteps()
    connectNodes(nodeOf(store, 'main', 'pay'), ':next', nodeOf(store, 'main', 'call:sphere>'))
    expect(store.steps.pay!.next).toStrictEqual({ call: 'sphere' })
  })

  it('шаг на выход из блока пишет @return, на заглушку шага пишет этот шаг', async () => {
    const { store } = await setup()
    const { connectNodes } = useConnectSteps()
    store.updateStep('sph', { options: [{ id: 'x', label: 'Икс', next: 'sph2' }, { id: 'y', label: 'Игрек', next: 'fin' }] })
    const ret = { id: 'stub:@return', type: 'stub', data: { kind: 'return' } }
    const link = nodeOf(store, 'sphere', 'stub:fin')
    expect(link.data.kind).toBe('link')
    connectNodes(nodeOf(store, 'sphere', 'sph2'), ':next', ret)
    expect(store.steps.sph2!.next).toBe('@return')
    connectNodes(nodeOf(store, 'sphere', 'sph'), 'x', link)
    expect(store.steps.sph!.options![0]!.next).toBe('fin')
  })

  it('заглушка «Нет такого шага» даёт подсказку и ничего не меняет', async () => {
    const { store } = await setup()
    const { connectNodes } = useConnectSteps()
    const before = JSON.stringify(store.steps)
    const broken = nodeOf(store, 'main', 'stub:ghost')
    expect(broken.data.kind).toBe('broken')
    expect(connectNodes(nodeOf(store, 'main', 'pay'), ':next', broken)).toBe(HINT)
    expect(JSON.stringify(store.steps)).toBe(before)
    expect(store.dirty).toBe(false)
  })

  it('выход карточки блока: then меняется по всем её ссылкам и только по ним', async () => {
    const { store } = await setup()
    const { connectNodes } = useConnectSteps()
    store.updateStep('tw', { next: { call: 'sphere', then: 'fin' } })
    const card = nodeOf(store, 'main', 'call:sphere>fin')
    expect(connectNodes(card, 'out', nodeOf(store, 'main', 'menu'))).toBeUndefined()
    // обе ссылки карточки: кнопка меню и переход шага оплаты
    expect(store.steps.menu!.options![2]!.next).toStrictEqual({ call: 'sphere', then: 'menu' })
    expect(store.steps.pay!.next).toStrictEqual({ call: 'sphere', then: 'menu' })
    // чужие: другой возврат, другой блок, тот же вызов на другой вкладке
    expect(store.steps.menu!.options![1]!.next).toStrictEqual({ call: 'sphere', then: 'pay' })
    expect(store.steps.menu!.options![3]!.next).toStrictEqual({ call: 'sphere' })
    expect(store.steps.menu!.options![5]!.next).toStrictEqual({ call: 'two', then: 'fin' })
    expect(store.steps.tw!.next).toStrictEqual({ call: 'sphere', then: 'fin' })
  })

  it('выход карточки на выход из блока и на заглушку шага', async () => {
    const { store } = await setup()
    const { connectNodes } = useConnectSteps()
    connectNodes(nodeOf(store, 'main', 'call:sphere>pay'), 'out', { id: 'stub:@return', type: 'stub', data: { kind: 'return' } })
    expect(store.steps.menu!.options![1]!.next).toStrictEqual({ call: 'sphere', then: '@return' })
    connectNodes(nodeOf(store, 'main', 'call:sphere>'), 'out', { id: 'stub:sph2', type: 'stub', data: { kind: 'link', stepId: 'sph2' } })
    expect(store.steps.menu!.options![3]!.next).toStrictEqual({ call: 'sphere', then: 'sph2' })
  })

  it('выход карточки на другую карточку или заглушку без шага даёт подсказку', async () => {
    const { store } = await setup()
    const { connectNodes } = useConnectSteps()
    const before = JSON.stringify(store.steps)
    const card = nodeOf(store, 'main', 'call:sphere>fin')
    expect(connectNodes(card, 'out', nodeOf(store, 'main', 'call:two>fin'))).toBeTruthy()
    expect(connectNodes(card, 'out', nodeOf(store, 'main', 'stub:ghost'))).toBe(HINT)
    expect(JSON.stringify(store.steps)).toBe(before)
  })

  it('источник, которого нет в сценарии, игнорируется', async () => {
    const { store } = await setup()
    const { connectNodes } = useConnectSteps()
    expect(connectNodes({ id: 'zzz', type: 'step', data: {} }, ':next', nodeOf(store, 'main', 'menu'))).toBeUndefined()
    expect(store.dirty).toBe(false)
  })
})

describe('новый шаг от стрелки', () => {
  it('от кнопки: шаг в точке отпускания с готовым переходом', async () => {
    const { store } = await setup()
    const id = useAddStep()('choice', { pos: [400, 120], view: 'main', from: { step: 'menu', handle: 'a' } })
    expect(store.steps[id]!.type).toBe('choice')
    expect(store.steps[id]!.pos).toEqual([400, 120])
    expect(store.steps.menu!.options![0]!.next).toBe(id)
  })

  it('от выхода карточки: then карточки ведёт на новый шаг', async () => {
    const { store } = await setup()
    const card = nodeOf(store, 'main', 'call:sphere>fin')
    const id = useAddStep()('choice', {
      pos: [10, 10],
      view: 'main',
      from: { block: 'sphere', then: 'fin', sources: card.data.sources },
    })
    expect(store.steps.menu!.options![2]!.next).toStrictEqual({ call: 'sphere', then: id })
    expect(store.steps.pay!.next).toStrictEqual({ call: 'sphere', then: id })
    expect(store.steps.menu!.options![1]!.next).toStrictEqual({ call: 'sphere', then: 'pay' })
  })
})

describe('меню целей', () => {
  it('на главной нет выхода из блока, на вкладке блока он есть', async () => {
    const { store } = await setup()
    expect(menuChoices(store.scenario, 'main', '').some((c) => c.value === '@return')).toBe(false)
    expect(menuChoices(store.scenario, 'sphere', '').some((c) => c.value === '@return')).toBe(true)
  })

  it('порядок: вход в блок, выход, шаги; поиск без учёта регистра', async () => {
    const { store } = await setup()
    const all = menuChoices(store.scenario, 'sphere', '')
    expect(all[0]!.value).toBe('block:sphere')
    expect(all.findIndex((c) => c.value === '@return')).toBeLessThan(all.findIndex((c) => c.value === 'step:menu'))
    expect(menuChoices(store.scenario, 'main', 'ОПЛАТ').map((c) => c.value)).toEqual(['step:pay'])
    expect(menuChoices(store.scenario, 'main', 'нет такого')).toEqual([])
  })

  it('произвольное имя блока в списках', async () => {
    const { store } = await setup()
    store.addBlock('Оплата заказа')
    const labels = menuChoices(store.scenario, 'main', 'оплата заказа').map((c) => c.label)
    expect(labels).toEqual(['Перейти в блок: Оплата заказа'])
  })

  it('«После блока вернуться на» на вкладке блока предлагает выход из блока', async () => {
    const { store } = await setup()
    expect(thenChoices(store.scenario, 'main').some((c) => c.value === '@return')).toBe(false)
    const inBlock = thenChoices(store.scenario, 'sphere')
    expect(inBlock.at(-1)).toEqual({ value: '@return', label: 'Вернуться из блока' })
    expect(inBlock.some((c) => c.value === 'menu')).toBe(true)
  })
})

describe('блоки: создание', () => {
  it('addBlock: запись в blocks, первый шаг, выбор и вкладка', async () => {
    const { store } = await setup()
    const out = store.addBlock('  Оплата  ')
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.name).toBe('Оплата')
    const first = store.blocks['Оплата']!
    expect(first).toMatch(/^s_[a-z0-9]{8}$/)
    expect(store.steps[first]).toEqual({ type: 'info', text: 'Новый шаг', next: '@return' })
    expect(store.selectedId).toBe(first)
    expect(Object.keys(store.blocks)).toEqual(['sphere', 'two', 'Оплата'])
    expect(viewTabs(store.scenario).at(-1)).toEqual({ view: 'Оплата', label: 'Оплата' })
    expect(stepIdsOf(store.scenario, 'Оплата', store.homes)).toEqual([first])
    expect(viewOfStep(store.scenario, first, {})).toBe('Оплата')
    expect(store.dirty).toBe(true)
  })

  it('пустое имя и дубли отклоняются без правки', async () => {
    const { store } = await setup()
    expect(store.addBlock('   ')).toEqual({ ok: false, error: 'Введите название.' })
    expect(store.addBlock('sphere')).toEqual({ ok: false, error: 'Такой блок уже есть.' })
    // подпись блока из каталога тоже занята
    expect(store.addBlock('Сфера деятельности')).toEqual({ ok: false, error: 'Такой блок уже есть.' })
    expect(store.addBlock('СФЕРА деятельности')).toEqual({ ok: false, error: 'Такой блок уже есть.' })
    expect(store.addBlock('я'.repeat(41)).ok).toBe(false)
    expect(store.addBlock('я'.repeat(40)).ok).toBe(true)
    expect(Object.keys(store.blocks)).toHaveLength(3)
  })

  it('после конфликта блок не создаётся', async () => {
    const { store } = await setup()
    store.conflict = true
    expect(store.addBlock('Оплата').ok).toBe(false)
    expect(store.blocks.Оплата).toBeUndefined()
  })

  it('круг: черновик с кириллическим блоком сохраняется и читается как был', async () => {
    const { store, repo } = await setup()
    const out = store.addBlock('Оплата')
    expect(out.ok).toBe(true)
    const entry = store.steps.menu!.options![0]!
    store.connect('menu', entry.id, { call: 'Оплата', then: 'fin' })
    await store.flush()
    const saved = (await repo.getDraft()).data
    expect(saved.blocks.Оплата).toBe(store.blocks.Оплата)
    expect(saved.steps.menu!.options![0]!.next).toEqual({ call: 'Оплата', then: 'fin' })
    expect(JSON.parse(JSON.stringify(saved))).toEqual(store.toDraftData())
    for (const [id, step] of Object.entries(saved.steps)) {
      expect(id).toMatch(/^[a-z0-9_]{1,24}$/)
      expect(typeof step.text).toBe('string')
    }
    for (const first of Object.values(saved.blocks)) expect(saved.steps[first]).toBeDefined()
    // после перезагрузки шаг блока всё так же на своей вкладке
    const again = useScenarioStore()
    await again.load()
    expect(viewOfStep(again.scenario, again.blocks.Оплата!, again.homes)).toBe('Оплата')
  })
})

describe('блоки: переименование', () => {
  it('ключ и все call переписываются, порядок сохраняется', async () => {
    const { store } = await setup()
    const out = store.renameBlock('sphere', 'Сфера бизнеса')
    expect(out).toEqual({ ok: true, name: 'Сфера бизнеса' })
    expect(Object.keys(store.blocks)).toEqual(['Сфера бизнеса', 'two'])
    expect(store.blocks['Сфера бизнеса']).toBe('sph')
    expect(store.steps.menu!.options![1]!.next).toStrictEqual({ call: 'Сфера бизнеса', then: 'pay' })
    expect(store.steps.menu!.options![3]!.next).toStrictEqual({ call: 'Сфера бизнеса' })
    expect(store.steps.pay!.next).toStrictEqual({ call: 'Сфера бизнеса', then: 'fin' })
    expect(store.steps.menu!.options![5]!.next).toStrictEqual({ call: 'two', then: 'fin' })
    expect(JSON.stringify(store.scenario)).not.toContain('"sphere"')
  })

  it('отказ на дубль и пустое имя; своё имя и своя подпись допустимы', async () => {
    const { store } = await setup()
    expect(store.renameBlock('sphere', 'two')).toEqual({ ok: false, error: 'Такой блок уже есть.' })
    expect(store.renameBlock('sphere', ' ')).toEqual({ ok: false, error: 'Введите название.' })
    expect(store.dirty).toBe(false)
    expect(store.renameBlock('sphere', 'Сфера деятельности').ok).toBe(true)
    expect(Object.keys(store.blocks)).toEqual(['Сфера деятельности', 'two'])
    expect(store.renameBlock('Сфера деятельности', 'Сфера деятельности').ok).toBe(true)
  })

  it('незнакомый блок не переименовывается', async () => {
    const { store } = await setup()
    expect(store.renameBlock('нет', 'Новый').ok).toBe(false)
  })

  it('шаги, созданные на вкладке блока, остаются на ней', async () => {
    const { store } = await setup()
    const id = store.addStep('info', undefined, { view: 'sphere' })
    store.renameBlock('sphere', 'Новое')
    expect(store.homes[id]).toBe('Новое')
  })
})

describe('блоки: удаление', () => {
  it('убирает запись, свои шаги и все переходы в блок; общие шаги остаются', async () => {
    const { store } = await setup()
    const { remove, usage } = useManageBlocks({ confirm: () => true })
    // sph2 виден и на вкладке второго блока: общий
    expect(usage('sphere')).toEqual({ steps: 1, links: 4 })
    expect(remove('sphere')).toBe(true)
    expect(store.blocks).toEqual({ two: 'tw' })
    expect(store.steps.sph).toBeUndefined()
    expect(store.steps.sph2).toBeDefined()
    expect(store.steps.menu!.options!.map((o) => o.next)).toEqual([
      'pay',
      undefined,
      undefined,
      undefined,
      'ghost',
      { call: 'two', then: 'fin' },
    ])
    expect(store.steps.pay).not.toHaveProperty('next')
    expect(JSON.stringify(store.scenario)).not.toContain('sphere')
  })

  it('вопрос с числами; отказ ничего не меняет', async () => {
    const { store } = await setup()
    const ask = vi.fn(() => false)
    const { remove } = useManageBlocks({ confirm: ask })
    expect(remove('sphere')).toBe(false)
    expect(ask).toHaveBeenCalledWith(
      'Удалить блок "Сфера деятельности"? Шаги: 1. Кнопок и шагов ведут в него: 4. Эти переходы придётся задать заново.',
    )
    expect(store.blocks.sphere).toBe('sph')
    expect(store.dirty).toBe(false)
  })

  it('выбранный шаг блока сбрасывается', async () => {
    const { store } = await setup()
    store.select('sph')
    useManageBlocks({ confirm: () => true }).remove('sphere')
    expect(store.selectedId).toBeNull()
  })

  it('блок без переходов и с общими шагами: убирается только запись и собственные шаги', async () => {
    const { store } = await setup()
    expect(useManageBlocks({ confirm: () => true }).remove('two')).toBe(true)
    expect(store.steps.tw).toBeUndefined()
    expect(store.steps.sph2).toBeDefined()
    expect(store.steps.menu!.options!.some((o) => o.id === 'f' && o.next !== undefined)).toBe(false)
  })

  it('новый блок удаляется целиком', async () => {
    const { store } = await setup()
    const out = store.addBlock('Оплата')
    expect(out.ok).toBe(true)
    const count = Object.keys(store.steps).length
    expect(useManageBlocks({ confirm: () => true }).remove('Оплата')).toBe(true)
    expect(Object.keys(store.steps)).toHaveLength(count - 1)
    expect(Object.keys(store.blocks)).toEqual(['sphere', 'two'])
  })

  it('при конфликте кнопки заперты и удаление отклоняется', async () => {
    const { store } = await setup()
    store.conflict = true
    const manage = useManageBlocks({ confirm: () => true })
    expect(manage.locked.value).toBe(true)
    expect(manage.remove('sphere')).toBe(false)
    expect(store.blocks.sphere).toBe('sph')
  })
})
