import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useConnectSteps } from '~/composables/useConnectSteps'
import { __setContainer } from '~/container'
import { CONFLICT_TEXT } from '~/errors/presentation'
import { MockScenarioRepository } from '~/repositories/adapters/scenario.mock'
import { useScenarioStore } from '~/stores/scenario.store'
import type { Scenario } from '~/types/scenario'
import { EDGE_HIT_WIDTH, selectEdge, toFlow } from '~/utils/scenarioGraph'

function fixture(): Scenario {
  return {
    entry: 'menu',
    blocks: { sphere: 'sph' },
    steps: {
      menu: {
        type: 'choice',
        text: 'Меню',
        options: [
          { id: 'a', label: 'А', next: 'pay' },
          { id: 'b', label: 'Б', next: { call: 'sphere', then: 'pay' } },
          { id: 'c', label: 'В', next: { call: 'sphere' } },
          { id: 'd', label: 'Г', url: 'https://example.com' },
        ],
      },
      pay: { type: 'text', text: 'Оплата', next: { call: 'sphere', then: 'pay' } },
      fin: { type: 'info', text: 'Готово', next: 'menu' },
      sph: { type: 'choice', text: 'Сфера', options: [{ id: 'x', label: 'Икс', next: 'sph2' }] },
      sph2: { type: 'info', text: 'Ещё', next: '@return' },
    },
  }
}

async function setup() {
  __setContainer({ scenarioRepository: new MockScenarioRepository({ data: fixture(), revision: 1 }) })
  setActivePinia(createPinia())
  const store = useScenarioStore()
  await store.load()
  return store
}

function nodeOf(store: ReturnType<typeof useScenarioStore>, id: string) {
  const found = toFlow(store.scenario, 'main', store.homes).nodes.find((n) => n.id === id)
  if (!found) throw new Error(`нет ноды ${id}`)
  return found
}

describe('отсоединение стрелки', () => {
  it('кнопка шага теряет переход, остальное в кнопке остаётся', async () => {
    const store = await setup()
    expect(useConnectSteps().detach(nodeOf(store, 'menu'), 'a')).toBeUndefined()
    expect(store.steps.menu!.options![0]).toStrictEqual({ id: 'a', label: 'А' })
    expect(store.steps.menu!.options![1]!.next).toStrictEqual({ call: 'sphere', then: 'pay' })
    expect(store.dirty).toBe(true)
  })

  it('собственный выход шага снимается', async () => {
    const store = await setup()
    useConnectSteps().detach(nodeOf(store, 'fin'), ':next')
    expect('next' in store.steps.fin!).toBe(false)
  })

  it('кнопка, ведущая в блок, теряет весь вход', async () => {
    const store = await setup()
    useConnectSteps().detach(nodeOf(store, 'menu'), 'c')
    expect(store.steps.menu!.options![2]).toStrictEqual({ id: 'c', label: 'В' })
  })

  it('выход карточки снимает then у всех её ссылок и не трогает чужие', async () => {
    const store = await setup()
    const card = nodeOf(store, 'call:sphere>pay')
    expect(card.data.sources).toEqual(['menu', 'pay'])
    useConnectSteps().detach(card, 'out')
    expect(store.steps.menu!.options![1]!.next).toStrictEqual({ call: 'sphere' })
    expect(store.steps.pay!.next).toStrictEqual({ call: 'sphere' })
    // вход без возврата это другая карточка, она осталась как была
    expect(store.steps.menu!.options![2]!.next).toStrictEqual({ call: 'sphere' })
    expect(store.steps.menu!.options![0]!.next).toBe('pay')
  })

  it('при конфликте ничего не меняется и возвращается причина', async () => {
    const store = await setup()
    store.conflict = true
    const before = JSON.stringify(store.steps)
    expect(useConnectSteps().detach(nodeOf(store, 'menu'), 'a')).toBe(CONFLICT_TEXT)
    expect(useConnectSteps().detach(nodeOf(store, 'call:sphere>pay'), 'out')).toBe(CONFLICT_TEXT)
    expect(JSON.stringify(store.steps)).toBe(before)
  })

  it('нода, от которой стрелку не ведут, игнорируется', async () => {
    const store = await setup()
    const before = JSON.stringify(store.steps)
    expect(useConnectSteps().detach({ id: 'stub:x', type: 'stub', data: {} }, 'out')).toBeUndefined()
    expect(JSON.stringify(store.steps)).toBe(before)
    expect(store.dirty).toBe(false)
  })
})

describe('рёбра схемы', () => {
  it('у каждого ребра область попадания шире линии, тянется только конец у цели', async () => {
    const store = await setup()
    const { edges } = toFlow(store.scenario, 'main', store.homes)
    expect(edges.length).toBeGreaterThan(4)
    expect(EDGE_HIT_WIDTH).toBeGreaterThanOrEqual(16)
    expect(EDGE_HIT_WIDTH).toBeLessThanOrEqual(20)
    for (const e of edges) {
      expect(e.interactionWidth).toBe(EDGE_HIT_WIDTH)
      expect(e.updatable).toBe('target')
    }
  })

  it('выделенное ребро одно, с классом и акцентной стрелкой; чужие не меняются', async () => {
    const store = await setup()
    const { edges } = toFlow(store.scenario, 'main', store.homes)
    const out = selectEdge(edges, 'menu:a')
    expect(out.filter((e) => e.selected).map((e) => e.id)).toEqual(['menu:a'])
    const picked = out.find((e) => e.id === 'menu:a')!
    expect(String(picked.class)).toContain('selected')
    expect(picked.markerEnd).toMatchObject({ color: '#1f4fbf' })
    expect(out.find((e) => e.id === 'pay::next')!.selected).toBe(false)
  })

  it('выделение обратного ребра сохраняет его класс', () => {
    const out = selectEdge([{ id: 'e', source: 'a', target: 'b', class: 'back' }], 'e')
    expect(String(out[0]!.class).split(' ')).toEqual(expect.arrayContaining(['back', 'selected']))
  })

  it('без выделения у всех рёбер явно снято выделение: Vue Flow сливает поля и не забывает прежнее', () => {
    const edges = [
      { id: 'e', source: 'a', target: 'b', class: 'back' },
      { id: 'f', source: 'a', target: 'c' },
    ]
    const out = selectEdge(selectEdge(edges, 'e'), null)
    for (const e of out) {
      expect(e.selected).toBe(false)
      expect(String(e.class ?? '')).not.toContain('selected')
    }
    expect(out[0]!.class).toBe('back')
  })
})
