import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAddStep } from '~/composables/useAddStep'
import { useConnectSteps } from '~/composables/useConnectSteps'
import { useEditStep } from '~/composables/useEditStep'
import { useManageBlocks } from '~/composables/useManageBlocks'
import { __setContainer } from '~/container'
import { DraftConflict } from '~/errors/scenario'
import { MockScenarioRepository } from '~/repositories/adapters/scenario.mock'
import { HISTORY_LIMIT, useScenarioStore } from '~/stores/scenario.store'
import type { Issue, Scenario } from '~/types/scenario'
import { editorHotkey } from '~/utils/editorHotkeys'

function fixture(): Scenario {
  return {
    entry: 'menu',
    blocks: { sphere: 'sph' },
    legacy: { keep: true },
    steps: {
      menu: {
        type: 'choice',
        text: 'Меню',
        pos: [0, 0],
        futureField: 42,
        options: [
          { id: 'a', label: 'А', next: 'pay' },
          { id: 'b', label: 'Б', next: { call: 'sphere', then: 'pay' } },
        ],
      },
      pay: { type: 'text', text: 'Оплата', next: { call: 'sphere', then: 'fin' } },
      fin: { type: 'info', text: 'Готово', finish: true },
      sph: { type: 'choice', text: 'Сфера', options: [{ id: 'x', label: 'Икс', next: 'sph2' }, { id: 'y', label: 'Игрек', next: '@return' }] },
      sph2: { type: 'info', text: 'Ещё', next: '@return' },
    },
  }
}

class SlowRepo extends MockScenarioRepository {
  saves: { data: Scenario; revision: number }[] = []
  private release: (() => void) | null = null
  hold = false

  async saveDraft(data: Scenario, revision: number): Promise<number> {
    this.saves.push({ data: structuredClone(data), revision })
    if (this.hold) await new Promise<void>((r) => (this.release = r))
    return super.saveDraft(data, revision)
  }

  finish(): void {
    this.hold = false
    this.release?.()
  }
}

async function setup() {
  const repo = new SlowRepo({ data: fixture(), revision: 5 })
  __setContainer({ scenarioRepository: repo })
  setActivePinia(createPinia())
  const store = useScenarioStore()
  await store.load()
  return { store, repo }
}

const snap = (store: ReturnType<typeof useScenarioStore>) => JSON.parse(JSON.stringify(store.scenario)) as Scenario

describe('отмена и возврат', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('пустая история: отменять и возвращать нечего', async () => {
    const { store } = await setup()
    expect(store.canUndo).toBe(false)
    expect(store.canRedo).toBe(false)
    expect(store.undo()).toBe(false)
    expect(store.redo()).toBe(false)
  })

  it('поле шага: отмена и возврат', async () => {
    const { store } = await setup()
    const before = snap(store)
    store.updateStep('pay', { text: 'Новый текст' })
    const after = snap(store)
    expect(store.undo()).toBe(true)
    expect(snap(store)).toEqual(before)
    expect(store.canRedo).toBe(true)
    expect(store.redo()).toBe(true)
    expect(snap(store)).toEqual(after)
  })

  it('новый шаг с id, позицией и домом вида', async () => {
    const { store } = await setup()
    const before = snap(store)
    const id = store.addStep('info', 'pay', { pos: [10, 20], view: 'sphere' })
    store.select(id)
    expect(store.homes[id]).toBe('sphere')
    store.undo()
    expect(snap(store)).toEqual(before)
    expect(store.homes[id]).toBeUndefined()
    store.redo()
    expect(store.steps[id]?.pos).toEqual([10, 20])
    expect(store.homes[id]).toBe('sphere')
  })

  it('кнопка: добавить, изменить, удалить, каждое отменяется', async () => {
    const { store } = await setup()
    const s0 = snap(store)
    const id = store.addOption('menu')!
    const s1 = snap(store)
    vi.advanceTimersByTime(2000)
    store.updateOption('menu', id, { url: 'https://example.com' })
    const s2 = snap(store)
    store.removeOption('menu', 'a')
    store.undo()
    expect(snap(store)).toEqual(s2)
    store.undo()
    expect(snap(store)).toEqual(s1)
    store.undo()
    expect(snap(store)).toEqual(s0)
  })

  it('удаление шага возвращает шаг и все ссылки на него', async () => {
    const { store } = await setup()
    const before = snap(store)
    expect(store.removeStep('pay')).toBe(true)
    expect(store.steps.pay).toBeUndefined()
    store.undo()
    expect(snap(store)).toEqual(before)
  })

  it('стрелка: переподключить и отсоединить', async () => {
    const { store } = await setup()
    const { disconnect } = useConnectSteps()
    const before = snap(store)
    store.connect('menu', 'a', 'fin')
    const mid = snap(store)
    disconnect('menu', 'a')
    expect(store.steps.menu?.options?.[0]?.next).toBeUndefined()
    store.undo()
    expect(snap(store)).toEqual(mid)
    store.undo()
    expect(snap(store)).toEqual(before)
  })

  it('отсоединение выхода карточки блока (`retargetCall`) отменяется', async () => {
    const { store } = await setup()
    const before = snap(store)
    store.retargetCall('sphere', 'pay', ['menu'], undefined)
    expect(snap(store)).not.toEqual(before)
    store.undo()
    expect(snap(store)).toEqual(before)
  })

  it('смена типа с чисткой полей и условий других шагов', async () => {
    const { store } = await setup()
    const before = snap(store)
    expect(store.changeStepType('menu', 'text')).toBe(true)
    expect(store.steps.menu?.options).toBeUndefined()
    store.undo()
    expect(snap(store)).toEqual(before)
  })

  it('перемещение ноды: один шаг, даже если сдвинуто дважды подряд', async () => {
    const { store } = await setup()
    const { moveStep } = useEditStep()
    moveStep('menu', [50, 60])
    vi.advanceTimersByTime(100)
    moveStep('menu', [70, 80])
    expect(store.steps.menu?.pos).toEqual([70, 80])
    store.undo()
    expect(store.steps.menu?.pos).toEqual([50, 60])
    store.undo()
    expect(store.steps.menu?.pos).toEqual([0, 0])
  })

  it('«Разложить» одним шагом возвращает позиции', async () => {
    const { store } = await setup()
    store.updateStep('pay', { pos: [5, 5] })
    vi.advanceTimersByTime(2000)
    const before = snap(store)
    store.clearPositions(['menu', 'pay'])
    expect(store.steps.menu?.pos).toBeUndefined()
    store.undo()
    expect(snap(store)).toEqual(before)
  })

  it('условие показа ставится и снимается', async () => {
    const { store } = await setup()
    const { setCondition } = useEditStep()
    const before = snap(store)
    setCondition('fin', { step: 'menu', any: ['a'] })
    expect(store.steps.fin?.when).toBeTruthy()
    store.undo()
    expect(snap(store)).toEqual(before)
  })

  it('блок: создание и переименование', async () => {
    const { store } = await setup()
    const before = snap(store)
    const out = store.addBlock('Новый')
    expect(out.ok).toBe(true)
    const withBlock = snap(store)
    vi.advanceTimersByTime(2000)
    store.renameBlock('Новый', 'Другой')
    store.undo()
    expect(snap(store)).toEqual(withBlock)
    store.undo()
    expect(snap(store)).toEqual(before)
  })

  it('удаление блока со всеми шагами и входом в него: один шаг отмены', async () => {
    const { store } = await setup()
    const before = snap(store)
    const { remove } = useManageBlocks({ confirm: () => true })
    expect(remove('sphere')).toBe(true)
    expect(store.blocks.sphere).toBeUndefined()
    expect(store.steps.sph).toBeUndefined()
    expect(store.steps.menu?.options?.[1]?.next).toBeUndefined()
    expect(store.undo()).toBe(true)
    expect(snap(store)).toEqual(before)
    expect(store.canUndo).toBe(false)
  })

  it('«Новый шаг» из меню у стрелки: шаг и переход это один шаг отмены', async () => {
    const { store } = await setup()
    const before = snap(store)
    const addStep = useAddStep()
    const id = addStep('choice', { pos: [1, 2], view: 'main', from: { step: 'menu', handle: 'a' } })
    expect(store.steps.menu?.options?.[0]?.next).toBe(id)
    store.undo()
    expect(snap(store)).toEqual(before)
    expect(store.canUndo).toBe(false)
  })

  it('незнакомые поля возвращаются нетронутыми', async () => {
    const { store } = await setup()
    store.updateStep('menu', { text: 'Другой' })
    store.undo()
    expect(store.toDraftData().legacy).toEqual({ keep: true })
    expect(store.steps.menu?.futureField).toBe(42)
  })

  it('правки текста в одном поле одного шага сливаются, пауза больше 800 мс начинает новый шаг', async () => {
    const { store } = await setup()
    store.updateStep('pay', { text: 'О' })
    vi.advanceTimersByTime(300)
    store.updateStep('pay', { text: 'Оп' })
    vi.advanceTimersByTime(800)
    store.updateStep('pay', { text: 'Опл' })
    vi.advanceTimersByTime(801)
    store.updateStep('pay', { text: 'Опла' })
    store.undo()
    expect(store.steps.pay?.text).toBe('Опл')
    store.undo()
    expect(store.steps.pay?.text).toBe('Оплата')
    expect(store.canUndo).toBe(false)
  })

  it('смена поля или шага начинает новый шаг отмены', async () => {
    const { store } = await setup()
    store.updateStep('pay', { text: 'А' })
    store.updateStep('pay', { key: 'k' })
    store.updateStep('fin', { text: 'Б' })
    store.updateOption('menu', 'a', { label: 'В' })
    store.updateOption('menu', 'b', { label: 'Г' })
    let n = 0
    while (store.undo()) n++
    expect(n).toBe(5)
  })

  it('отмена обрывает слияние: следующая правка текста это новый шаг', async () => {
    const { store } = await setup()
    store.updateStep('pay', { text: 'А' })
    vi.advanceTimersByTime(100)
    store.updateStep('pay', { text: 'Аб' })
    store.undo()
    store.redo()
    store.updateStep('pay', { text: 'Абв' })
    store.undo()
    expect(store.steps.pay?.text).toBe('Аб')
  })

  it('лимит: хранится не больше HISTORY_LIMIT шагов, старые отбрасываются', async () => {
    const { store } = await setup()
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) store.updateStep('menu', { pos: [i + 1, 0] })
    let n = 0
    while (store.undo()) n++
    expect(n).toBe(HISTORY_LIMIT)
    expect(HISTORY_LIMIT).toBe(100)
    expect(store.steps.menu?.pos).toEqual([20, 0])
  })

  it('новая правка очищает стек возврата, пустая отмена его не трогает', async () => {
    const { store } = await setup()
    store.updateStep('menu', { pos: [1, 1] })
    store.undo()
    expect(store.canRedo).toBe(true)
    store.updateStep('menu', { pos: [2, 2] })
    expect(store.canRedo).toBe(false)
    expect(store.redo()).toBe(false)
  })

  it('выбранный шаг, исчезнувший после отмены, снимается; существующий остаётся', async () => {
    const { store } = await setup()
    const id = store.addStep('info', 'pay')
    expect(store.selectedId).toBe(id)
    store.undo()
    expect(store.selectedId).toBeNull()
    store.select('menu')
    store.updateStep('pay', { text: 'Х' })
    store.undo()
    expect(store.selectedId).toBe('menu')
  })

  it('ошибки публикации отменой не трогаются', async () => {
    const { store } = await setup()
    const issue: Issue = { code: 'link', stepId: 'pay', optionId: null, message: 'Ошибка' }
    store.updateStep('pay', { text: 'Х' })
    store.setIssues([issue])
    store.undo()
    expect(store.issues).toEqual([issue])
    store.redo()
    expect(store.issues).toEqual([issue])
  })

  it('отмена и возврат запускают автосохранение: растёт `edits`, `dirty` поднят', async () => {
    const { store } = await setup()
    store.updateStep('pay', { text: 'Х' })
    await store.flush()
    expect(store.dirty).toBe(false)
    const edits = store.edits
    store.undo()
    expect(store.edits).toBeGreaterThan(edits)
    expect(store.dirty).toBe(true)
    await store.flush()
    expect(store.dirty).toBe(false)
  })

  it('сохраняется состояние после отмены с верной ревизией', async () => {
    const { store, repo } = await setup()
    store.updateStep('pay', { text: 'Х' })
    await store.flush()
    store.undo()
    await store.flush()
    expect(repo.saves.map((s) => s.revision)).toEqual([5, 6])
    expect(repo.saves[1]?.data.steps.pay?.text).toBe('Оплата')
    expect(store.revision).toBe(7)
  })

  it('отмена во время сохранения в полёте уходит следом с новой ревизией', async () => {
    const { store, repo } = await setup()
    store.updateStep('pay', { text: 'Х' })
    repo.hold = true
    const first = store.flush()
    await vi.advanceTimersByTimeAsync(0)
    expect(store.saving).toBe(true)
    store.undo()
    const second = store.flush()
    repo.finish()
    await first
    await second
    expect(repo.saves.map((s) => s.revision)).toEqual([5, 6])
    expect(repo.saves[0]?.data.steps.pay?.text).toBe('Х')
    expect(repo.saves[1]?.data.steps.pay?.text).toBe('Оплата')
    expect(store.dirty).toBe(false)
  })

  it('при конфликте отмена и возврат не работают, состояние не меняется', async () => {
    const { store, repo } = await setup()
    store.updateStep('pay', { text: 'Х' })
    store.undo()
    store.redo()
    vi.spyOn(repo, 'saveDraft').mockRejectedValue(new DraftConflict())
    await store.flush().catch(() => undefined)
    expect(store.conflict).toBe(true)
    const frozen = snap(store)
    expect(store.canUndo).toBe(false)
    expect(store.undo()).toBe(false)
    expect(snap(store)).toEqual(frozen)
    expect(store.redo()).toBe(false)
    expect(snap(store)).toEqual(frozen)
  })

  it('`load` очищает историю', async () => {
    const { store } = await setup()
    store.updateStep('pay', { text: 'Х' })
    store.undo()
    expect(store.canRedo).toBe(true)
    await store.load()
    expect(store.canUndo).toBe(false)
    expect(store.canRedo).toBe(false)
  })

  it('откат версии очищает историю', async () => {
    const { store } = await setup()
    store.updateStep('pay', { text: 'Х' })
    await store.flush()
    await store.activate(1)
    expect(store.canUndo).toBe(false)
    expect(store.canRedo).toBe(false)
  })
})

describe('горячие клавиши', () => {
  const key = (code: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
    code,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...mods,
  })
  const free = { typing: false, menuOpen: false }

  it('Ctrl+Z отмена, Ctrl+Shift+Z и Ctrl+Y возврат; метка по `code`, раскладка не важна', () => {
    expect(editorHotkey(key('KeyZ', { ctrlKey: true }), free)).toBe('undo')
    expect(editorHotkey(key('KeyZ', { ctrlKey: true, shiftKey: true }), free)).toBe('redo')
    expect(editorHotkey(key('KeyY', { ctrlKey: true }), free)).toBe('redo')
  })

  it('Cmd на Mac равен Ctrl', () => {
    expect(editorHotkey(key('KeyZ', { metaKey: true }), free)).toBe('undo')
    expect(editorHotkey(key('KeyS', { metaKey: true }), free)).toBe('save')
  })

  it('без Ctrl буквы ничего не делают, с Alt тоже', () => {
    expect(editorHotkey(key('KeyZ'), free)).toBeNull()
    expect(editorHotkey(key('KeyZ', { ctrlKey: true, altKey: true }), free)).toBeNull()
    expect(editorHotkey(key('KeyY', { ctrlKey: true, shiftKey: true }), free)).toBeNull()
  })

  it('Ctrl+S и Esc', () => {
    expect(editorHotkey(key('KeyS', { ctrlKey: true }), free)).toBe('save')
    expect(editorHotkey(key('Escape'), free)).toBe('escape')
  })

  it('в поле ввода Ctrl+Z, Ctrl+Y и Esc родные, Ctrl+S наш', () => {
    const typing = { typing: true, menuOpen: false }
    expect(editorHotkey(key('KeyZ', { ctrlKey: true }), typing)).toBeNull()
    expect(editorHotkey(key('KeyZ', { ctrlKey: true, shiftKey: true }), typing)).toBeNull()
    expect(editorHotkey(key('KeyY', { ctrlKey: true }), typing)).toBeNull()
    expect(editorHotkey(key('Escape'), typing)).toBeNull()
    expect(editorHotkey(key('KeyS', { ctrlKey: true }), typing)).toBe('save')
  })

  it('открытое меню целей забирает Esc и отмену себе, Ctrl+S остаётся', () => {
    const menu = { typing: false, menuOpen: true }
    expect(editorHotkey(key('Escape'), menu)).toBeNull()
    expect(editorHotkey(key('KeyZ', { ctrlKey: true }), menu)).toBeNull()
    expect(editorHotkey(key('KeyS', { ctrlKey: true }), menu)).toBe('save')
  })
})
