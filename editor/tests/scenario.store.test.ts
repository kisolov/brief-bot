import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { __setContainer } from '~/container'
import { MockScenarioRepository } from '~/repositories/adapters/scenario.mock'
import { useScenarioStore } from '~/stores/scenario.store'
import type { Scenario } from '~/types/scenario'

const data: Scenario = {
  entry: 'menu',
  blocks: { sphere: 'sph' },
  legacy: { keep: true },
  steps: {
    menu: {
      type: 'choice',
      text: 'Меню',
      futureField: 42,
      options: [
        { id: 'a', label: 'А', next: 'pay', colour: 'red' },
        { id: 'b', label: 'Б', next: 'pay' },
      ],
    },
    pay: { type: 'text', text: 'Оплата', next: 'sph' },
    sph: { type: 'info', text: 'Блок', next: '@return' },
  },
}

function useStore(revision = 7) {
  const repo = new MockScenarioRepository({ data: structuredClone(data), revision })
  __setContainer({ scenarioRepository: repo })
  setActivePinia(createPinia())
  return { store: useScenarioStore(), repo }
}

describe('scenario store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('test_load_sets_revision', async () => {
    const { store } = useStore(7)
    await store.load()
    expect(store.revision).toBe(7)
    expect(Object.keys(store.steps)).toEqual(['menu', 'pay', 'sph'])
    expect(store.issues).toEqual([])
    expect(store.selectedId).toBeNull()
  })

  it('круг на настоящем сиде: load и toDraftData возвращают scenario.json без потерь', async () => {
    const seed = JSON.parse(
      readFileSync(new URL('../../backend/src/scenario/seed/scenario.json', import.meta.url), 'utf8'),
    )
    __setContainer({ scenarioRepository: new MockScenarioRepository() })
    setActivePinia(createPinia())
    const store = useScenarioStore()
    await store.load()
    // первичная простановка добавляет только `tab`: остальное содержимое не меняется
    const draft = store.toDraftData()
    for (const step of Object.values(draft.steps)) delete step.tab
    expect(draft).toEqual(seed)
  })

  it('load подтягивает активную версию бота', async () => {
    const { store } = useStore()
    await store.load()
    expect(store.activeVersion).toBe(1)
  })

  it('select выбирает шаг, повторный вызов с null снимает выбор', async () => {
    const { store } = useStore()
    await store.load()
    store.select('menu')
    expect(store.selectedId).toBe('menu')
    store.select(null)
    expect(store.selectedId).toBeNull()
  })

  it('незнакомые поля шага, кнопки и верхнего уровня доживают до сохранения', async () => {
    const { store } = useStore()
    await store.load()
    store.updateStep('pay', { text: 'Новый текст' })
    const out = store.toDraftData()
    expect(out.legacy).toEqual({ keep: true })
    expect(out.steps.menu!.futureField).toBe(42)
    expect(out.steps.menu!.options![0]!.colour).toBe('red')
    expect(out.steps.pay!.text).toBe('Новый текст')
  })

  it('addStep вставляет шаг после указанного и сохраняет цепочку', async () => {
    const { store } = useStore()
    await store.load()
    const id = store.addStep('text', 'pay')
    expect(store.steps[id]!.type).toBe('text')
    expect(store.steps.pay!.next).toBe(id)
    expect(store.steps[id]!.next).toBe('sph')
    expect(id).toMatch(/^[a-z0-9_]{1,24}$/)
  })

  it('removeStep убирает шаг и ссылки на него', async () => {
    const { store } = useStore()
    await store.load()
    store.removeStep('pay')
    expect(store.steps.pay).toBeUndefined()
    expect(store.steps.menu!.options![0]!.next).toBeUndefined()
    expect(store.steps.menu!.options![1]!.next).toBeUndefined()
  })

  it('connect ставит переход кнопки и шага', async () => {
    const { store } = useStore()
    await store.load()
    store.connect('menu', 'a', 'sph')
    expect(store.steps.menu!.options![0]!.next).toBe('sph')
    store.connect('pay', ':next', 'menu')
    expect(store.steps.pay!.next).toBe('menu')
  })
})
