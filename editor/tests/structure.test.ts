import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAddStep } from '~/composables/useAddStep'
import { useConnectSteps } from '~/composables/useConnectSteps'
import { useEditStep } from '~/composables/useEditStep'
import { useManageBlocks } from '~/composables/useManageBlocks'
import { __setContainer } from '~/container'
import { MockScenarioRepository } from '~/repositories/adapters/scenario.mock'
import { useScenarioStore } from '~/stores/scenario.store'
import { NEXT_HANDLE } from '~/types/scenario'
import type { Scenario } from '~/types/scenario'
import { stepIdsOf, toFlow, viewOfStep, viewTabs } from '~/utils/scenarioGraph'

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
