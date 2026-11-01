import { readFileSync } from 'node:fs'
import type { Node } from '@vue-flow/core'
import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAddStep } from '~/composables/useAddStep'
import { useConnectSteps } from '~/composables/useConnectSteps'
import { useEditStep } from '~/composables/useEditStep'
import { useManageBlocks } from '~/composables/useManageBlocks'
import { useScenarioLayout } from '~/composables/useScenarioLayout'
import { __setContainer } from '~/container'
import { MockScenarioRepository } from '~/repositories/adapters/scenario.mock'
import { useScenarioStore } from '~/stores/scenario.store'
import { NEXT_HANDLE } from '~/types/scenario'
import type { Scenario } from '~/types/scenario'
import { stepIdsOf, toFlow, viewOfStep, viewTabs } from '~/utils/scenarioGraph'
import { placeCards } from '~/utils/scenarioLayout'

function fixture(): Scenario {
  return {
    entry: 'menu',
    blocks: { sphere: 'sph' },
    steps: {
      menu: {
        type: 'choice',
        text: 'Меню',
        options: [
          { id: 'go', label: 'Дальше', next: 'pay' },
          { id: 'blk', label: 'В блок', next: { call: 'sphere', then: 'pay' } },
        ],
      },
      pay: { type: 'text', text: 'Оплата', key: 'pay', next: 'tail' },
      tail: { type: 'info', text: 'Хвост' },
      sph: { type: 'text', text: 'Сфера', key: 's', next: 'sph2' },
      sph2: { type: 'text', text: 'Ещё', key: 's2', next: 'sph3' },
      sph3: { type: 'info', text: 'Конец', next: '@return' },
    },
  }
}

async function setup(data: Scenario = fixture()) {
  const repo = new MockScenarioRepository({ data: structuredClone(data), revision: 1 })
  __setContainer({ scenarioRepository: repo })
  setActivePinia(createPinia())
  const store = useScenarioStore()
  await store.load()
  return { store, repo }
}

const seed = () =>
  JSON.parse(readFileSync(new URL('../../backend/src/scenario/seed/scenario.json', import.meta.url), 'utf8')) as Scenario

describe('А1: вкладка хранится в шаге', () => {
  it('первичная загрузка проставляет tab без истории и без правок', async () => {
    const { store } = await setup()
    expect(store.steps.menu!.tab).toBeUndefined()
    expect(store.steps.sph!.tab).toBe('sphere')
    expect(store.steps.sph3!.tab).toBe('sphere')
    expect(store.canUndo).toBe(false)
    expect(store.edits).toBe(0)
    expect(store.dirty).toBe(false)
  })

  it('tab попадает в черновик со следующим сохранением, вторая загрузка его не пересчитывает', async () => {
    const { store, repo } = await setup()
    store.updateStep('pay', { text: 'Правка' })
    await store.flush()
    const saved = (await repo.getDraft()).data
    expect(saved.steps.sph2!.tab).toBe('sphere')
    // по стрелкам шаг ушёл бы на главную: хранимая вкладка важнее
    saved.steps.tail!.next = 'sph2'
    saved.steps.sph!.next = 'pay'
    await repo.saveDraft(saved, 2)
    await store.load()
    expect(store.steps.sph2!.tab).toBe('sphere')
    expect(store.steps.tail!.tab).toBeUndefined()
  })

  it('снятая стрелка не переносит шаги на другую вкладку', async () => {
    const { store } = await setup()
    const before = stepIdsOf(store.scenario, 'sphere')
    useConnectSteps().disconnect('sph', NEXT_HANDLE)
    expect(stepIdsOf(store.scenario, 'sphere')).toEqual(before)
    useConnectSteps().disconnect('menu', 'go')
    expect(stepIdsOf(store.scenario, 'main')).toEqual(['menu', 'pay', 'tail'])
  })

  it('сид: снятие стрелки с первого шага оставляет все шаги на прежних вкладках', async () => {
    const data = seed()
    const { store } = await setup(data)
    const before = Object.fromEntries(Object.keys(data.steps).map((id) => [id, viewOfStep(store.scenario, id)]))
    useConnectSteps().disconnect('privacy', store.steps.privacy!.options![0]!.id)
    for (const [id, view] of Object.entries(before)) expect(viewOfStep(store.scenario, id), id).toBe(view)
  })

  it('шаг чужой вкладки это "Переход на шаг"', async () => {
    const { store } = await setup()
    store.connect('sph', NEXT_HANDLE, 'tail')
    const { nodes, edges } = toFlow(store.scenario, 'sphere')
    const stub = nodes.find((n) => n.id === 'stub:tail')!
    expect(stub.data.kind).toBe('link')
    expect(edges.find((e) => e.source === 'sph')!.target).toBe('stub:tail')
    expect(nodes.some((n) => n.id === 'tail')).toBe(false)
  })

  it('новый шаг сразу получает tab вкладки и остаётся на ней после перезагрузки', async () => {
    const { store } = await setup()
    const id = useAddStep()('info', { pos: [1, 2], view: 'sphere' })
    expect(store.steps[id]!.tab).toBe('sphere')
    const main = useAddStep()('info', { pos: [1, 2], view: 'main' })
    expect(store.steps[main]!.tab).toBeUndefined()
    await store.flush()
    await store.load()
    expect(viewOfStep(store.scenario, id)).toBe('sphere')
  })

  it('renameBlock переписывает tab, отмена возвращает', async () => {
    const { store } = await setup()
    store.renameBlock('sphere', 'Новое')
    expect(stepIdsOf(store.scenario, 'Новое')).toEqual(['sph', 'sph2', 'sph3'])
    expect(store.steps.sph!.tab).toBe('Новое')
    store.undo()
    expect(store.steps.sph!.tab).toBe('sphere')
  })

  it('removeBlock убирает шаги этого tab, даже не связанные стрелками', async () => {
    const { store } = await setup()
    store.connect('sph', NEXT_HANDLE, undefined)
    const { usage, remove } = useManageBlocks({ confirm: () => true })
    expect(usage('sphere').steps).toBe(3)
    expect(remove('sphere')).toBe(true)
    expect(Object.keys(store.steps)).toEqual(['menu', 'pay', 'tail'])
  })

  it('tab несуществующего блока не прячет шаг: он на главной', async () => {
    const data = fixture()
    data.steps.tail!.tab = 'нет такого'
    data.steps.sph!.tab = 'sphere'
    const { store } = await setup(data)
    expect(viewOfStep(store.scenario, 'tail')).toBe('main')
  })

  it('первая карточка блока на вкладке, даже если блоков с этим шагом два', async () => {
    const data = fixture()
    data.blocks.two = 'sph'
    const { store } = await setup(data)
    expect(toFlow(store.scenario, 'two').nodes.some((n) => n.id === 'sph')).toBe(true)
  })
})

describe('А1: первая карточка блока', () => {
  it('удаление первого шага передаёт блок следующему шагу, отмена возвращает', async () => {
    const { store } = await setup()
    const { removeStep, removeRefusal } = useEditStep()
    expect(removeRefusal('sph')).toBeNull()
    expect(removeStep('sph')).toBe(true)
    expect(store.blocks.sphere).toBe('sph2')
    expect(toFlow(store.scenario, 'sphere').nodes.some((n) => n.id === 'sph2')).toBe(true)
    store.undo()
    expect(store.blocks.sphere).toBe('sph')
    expect(store.steps.sph).toBeDefined()
  })

  it('без следующего шага на вкладке удаление отклоняется подсказкой', async () => {
    const { store } = await setup()
    store.connect('sph', NEXT_HANDLE, 'tail')
    const { removeStep, removeRefusal, canRemove } = useEditStep()
    expect(removeRefusal('sph')).toBe('Сначала задайте блоку другой первый шаг.')
    expect(canRemove('sph')).toBe(false)
    expect(removeStep('sph')).toBe(false)
    expect(store.steps.sph).toBeDefined()
    expect(store.blocks.sphere).toBe('sph')
  })

  it('новый блок: единственный шаг удалить нельзя, вкладка не пустеет', async () => {
    const { store } = await setup()
    const out = store.addBlock('Оплата')
    if (!out.ok) throw new Error('блок не создан')
    expect(store.steps[out.stepId!]!.tab).toBe('Оплата')
    expect(useEditStep().removeRefusal(out.stepId!)).toBe('Сначала задайте блоку другой первый шаг.')
  })

  it('начальный шаг по-прежнему не удаляется', async () => {
    await setup()
    expect(useEditStep().removeRefusal('menu')).toBe('Это первый шаг сценария, его удалить нельзя.')
  })

  it('вкладки блоков остаются, пока блок существует', async () => {
    const { store } = await setup()
    useEditStep().removeStep('sph')
    expect(viewTabs(store.scenario).map((t) => t.view)).toEqual(['main', 'sphere'])
  })
})

/** Положения всех нод вида так, как их показывает схема. */
function shown(store: ReturnType<typeof useScenarioStore>, view: string) {
  const flow = toFlow(store.scenario, view)
  return placeCards(flow.nodes, flow.edges)
}

const positions = (nodes: Node[], type?: string) =>
  Object.fromEntries(nodes.filter((n) => !type || n.type === type).map((n) => [n.id, [n.position.x, n.position.y]]))

function overlap(a: Node, b: Node): boolean {
  return (
    a.position.x < b.position.x + b.data.width &&
    b.position.x < a.position.x + a.data.width &&
    a.position.y < b.position.y + b.data.height &&
    b.position.y < a.position.y + a.data.height
  )
}

describe('А2: карточки стоят на месте', () => {
  it('первичная загрузка записывает целые pos всем шагам без истории и правок', async () => {
    const { store } = await setup()
    for (const step of Object.values(store.steps)) {
      expect(step.pos).toHaveLength(2)
      expect(step.pos!.every(Number.isInteger)).toBe(true)
    }
    expect(store.canUndo).toBe(false)
    expect(store.edits).toBe(0)
    expect(store.dirty).toBe(false)
  })

  it('заданный pos загрузка не трогает, позиции уходят со следующим сохранением', async () => {
    const data = fixture()
    data.steps.pay!.pos = [777, 888]
    const { store, repo } = await setup(data)
    expect(store.steps.pay!.pos).toEqual([777, 888])
    store.updateStep('tail', { text: 'Правка' })
    await store.flush()
    expect((await repo.getDraft()).data.steps.sph3!.pos).toEqual(store.steps.sph3!.pos)
  })

  it('сид: смена перехода не двигает ни одну карточку шага', async () => {
    const { store } = await setup(seed())
    const before = Object.fromEntries(viewTabs(store.scenario).map(({ view }) => [view, positions(shown(store, view), 'step')]))
    const { connect, disconnect } = useConnectSteps()
    disconnect('privacy', store.steps.privacy!.options![0]!.id)
    connect('kind_other', NEXT_HANDLE, 'menu')
    store.addStep('info', undefined, { pos: [5000, 5000] })
    for (const { view } of viewTabs(store.scenario)) {
      const after = positions(shown(store, view), 'step')
      for (const [id, pos] of Object.entries(before[view]!)) expect(after[id], id).toEqual(pos)
    }
  })

  it('сид: заглушки и карточки блоков не налезают на шаги', async () => {
    const { store } = await setup(seed())
    for (const { view } of viewTabs(store.scenario)) {
      const nodes = shown(store, view)
      const steps = nodes.filter((n) => n.type === 'step')
      for (const card of nodes.filter((n) => n.type !== 'step')) {
        for (const step of steps) expect(overlap(card, step), `${view}: ${card.id} и ${step.id}`).toBe(false)
      }
    }
  })

  it('заглушка стоит правее источника и считается заново одинаково', async () => {
    const { store } = await setup()
    store.connect('sph', NEXT_HANDLE, 'tail')
    const nodes = shown(store, 'sphere')
    const stub = nodes.find((n) => n.id === 'stub:tail')!
    const source = nodes.find((n) => n.id === 'sph')!
    expect(stub.position.x).toBeGreaterThan(source.position.x + source.data.width)
    expect(positions(shown(store, 'sphere'))).toEqual(positions(nodes))
  })

  it('новый шаг из панели встаёт рядом с источником, не на занятое место', async () => {
    const { store } = await setup()
    store.updateStep('pay', { pos: [100, 100] })
    store.updateStep('tail', { pos: [370, 100] })
    const id = useAddStep()('info', { from: { step: 'tail', handle: NEXT_HANDLE } })
    const second = useAddStep()('info', { from: { step: 'pay', handle: NEXT_HANDLE } })
    expect(store.steps[id]!.pos![0]).toBeGreaterThan(370)
    const [x, y] = store.steps[second]!.pos!
    expect(x).toBe(370)
    expect(y).toBeGreaterThan(100)
  })

  it('«Разложить» пересчитывает только текущую вкладку, пишет pos одним шагом отмены', async () => {
    const { store } = await setup()
    store.updateStep('pay', { pos: [9000, 9000] })
    store.updateStep('sph', { pos: [7000, 7000] })
    const undoable = () => store.canUndo
    const edits = store.edits
    useScenarioLayout().relayout()
    expect(store.steps.pay!.pos).not.toEqual([9000, 9000])
    expect(store.steps.sph!.pos).toEqual([7000, 7000])
    expect(store.edits).toBe(edits + 1)
    expect(undoable()).toBe(true)
    store.undo()
    expect(store.steps.pay!.pos).toEqual([9000, 9000])
    expect(store.steps.menu!.pos).toBeDefined()
  })

  it('«Разложить» без изменений не кладёт шаг отмены', async () => {
    const { store } = await setup()
    useScenarioLayout().relayout()
    const edits = store.edits
    useScenarioLayout().relayout()
    expect(store.edits).toBe(edits)
  })
})
