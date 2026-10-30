import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { toFlow, viewTabs } from '~/utils/scenarioGraph'
import { autoLayout } from '~/utils/scenarioLayout'
import type { Scenario } from '~/types/scenario'

const scenario: Scenario = {
  entry: 'menu',
  blocks: { sphere: 'sph' },
  steps: {
    menu: {
      type: 'choice',
      text: 'Главное меню\nвторая строка',
      options: [
        { id: 'new', label: 'Новый', next: { call: 'sphere', then: 'pay' } },
        { id: 'fix', label: 'Доработать', next: 'pay' },
        { id: 'site', label: 'Сайт', url: 'https://example.com' },
      ],
    },
    pay: { type: 'text', text: 'Оплата?', next: 'bye' },
    bye: { type: 'info', text: 'Спасибо' },
    sph: {
      type: 'choice',
      text: 'Сфера',
      options: [
        { id: 'a', label: 'А', next: 'sph2' },
        { id: 'b', label: 'Б', next: '@return' },
      ],
    },
    sph2: { type: 'multi', text: 'Ещё', done_label: 'Всё', next: '@return' },
  },
}

describe('toFlow', () => {
  it('test_toFlow_one_handle_per_option', () => {
    const { nodes, edges } = toFlow(scenario, 'main')
    const menu = nodes.find((n) => n.id === 'menu')!
    expect(menu.type).toBe('step')
    expect(menu.data.rows.map((r: { handle: string }) => r.handle)).toEqual(['new', 'fix', 'site'])
    expect(menu.data.title).toBe('Главное меню')
    const fromMenu = edges.filter((e) => e.source === 'menu')
    expect(fromMenu.map((e) => e.sourceHandle).sort()).toEqual(['fix', 'new'])
    expect(edges.find((e) => e.source === 'menu' && e.sourceHandle === 'fix')!.target).toBe('pay')
    // шаг без кнопок получает один выход «следующий»
    const pay = nodes.find((n) => n.id === 'pay')!
    expect(pay.data.rows.map((r: { handle: string }) => r.handle)).toEqual([':next'])
    expect(edges.find((e) => e.source === 'pay')!.target).toBe('bye')
  })

  it('длинный список кнопок сворачивается, но порт остаётся у каждой кнопки', () => {
    const options = Array.from({ length: 8 }, (_, i) => ({ id: `o${i}`, label: `Кнопка ${i}`, next: 'end' }))
    const s: Scenario = {
      entry: 'a',
      blocks: {},
      steps: { a: { type: 'choice', text: 'A', options }, end: { type: 'info', text: 'E' } },
    }
    const { nodes, edges } = toFlow(s, 'main')
    const rows = nodes.find((n) => n.id === 'a')!.data.rows as { handle: string; label: string; more?: string[] }[]
    expect(rows).toHaveLength(4)
    expect(rows[3]).toMatchObject({ label: 'ещё 5 кнопок', more: ['o3', 'o4', 'o5', 'o6', 'o7'] })
    const ports = rows.flatMap((r) => r.more ?? (r.handle ? [r.handle] : []))
    expect(ports).toEqual(options.map((o) => o.id))
    expect(edges.filter((e) => e.source === 'a')).toHaveLength(8)
  })

  it('test_block_call_renders_block_node', () => {
    const { nodes, edges } = toFlow(scenario, 'main')
    const call = nodes.find((n) => n.type === 'block')!
    expect(call.data.block).toBe('sphere')
    const into = edges.find((e) => e.source === 'menu' && e.sourceHandle === 'new')!
    expect(into.target).toBe(call.id)
    const out = edges.find((e) => e.source === call.id)!
    expect(out.target).toBe('pay')
  })

  it('test_view_shows_only_block_steps', () => {
    const main = toFlow(scenario, 'main').nodes.map((n) => n.id)
    expect(main).toEqual(expect.arrayContaining(['menu', 'pay', 'bye']))
    expect(main).not.toContain('sph')
    expect(main).not.toContain('sph2')

    const block = toFlow(scenario, 'sphere')
    const steps = block.nodes.filter((n) => n.type === 'step').map((n) => n.id)
    expect(steps.sort()).toEqual(['sph', 'sph2'])
    expect(block.nodes.some((n) => n.id === 'menu')).toBe(false)
    // выход из блока показан одной заглушкой
    expect(block.nodes.filter((n) => n.type === 'stub')).toHaveLength(1)
  })

  it('держит позицию из pos и оставляет остальным нулевую', () => {
    const s: Scenario = {
      entry: 'a',
      blocks: {},
      steps: { a: { type: 'text', text: 'A', next: 'b', pos: [40, 80] }, b: { type: 'info', text: 'B' } },
    }
    const nodes = toFlow(s, 'main').nodes
    expect(nodes.find((n) => n.id === 'a')!.position).toEqual({ x: 40, y: 80 })
    expect(nodes.find((n) => n.id === 'b')!.data.placed).toBe(false)
  })

  it('кнопка на шаг вне вида становится заглушкой, битая ссылка тоже', () => {
    const s: Scenario = {
      entry: 'a',
      blocks: { blk: 'x' },
      steps: {
        a: { type: 'choice', text: 'A', options: [{ id: 'o', label: 'O', next: 'ghost' }] },
        x: { type: 'info', text: 'X' },
      },
    }
    const { nodes, edges } = toFlow(s, 'main')
    const stub = nodes.find((n) => n.type === 'stub')!
    expect(stub.data.label).toBe('ghost')
    expect(edges.find((e) => e.source === 'a')!.target).toBe(stub.id)
  })

  it('прямой переход на первый шаг блока показан заглушкой, шаги блока остаются на своей вкладке', () => {
    const s: Scenario = {
      entry: 'a',
      blocks: { tail: 't1' },
      steps: {
        a: { type: 'choice', text: 'A', options: [{ id: 'go', label: 'Go', next: 't1' }] },
        t1: { type: 'text', text: 'Хвост', next: 't2' },
        t2: { type: 'choice', text: 'Конец', options: [{ id: 'again', label: 'Снова', next: 'a' }] },
      },
    }
    const main = toFlow(s, 'main')
    expect(main.nodes.map((n) => n.id).sort()).toEqual(['a', 'stub:t1'])
    const tail = toFlow(s, 'tail')
    expect(tail.nodes.filter((n) => n.type === 'step').map((n) => n.id).sort()).toEqual(['t1', 't2'])
    // возврат на шаг главного графа тоже заглушка
    expect(tail.nodes.find((n) => n.id === 'stub:a')!.data.kind).toBe('link')
  })

  it('вкладки: главный граф и по вкладке на блок с человеческими подписями', () => {
    const tabs = viewTabs({ ...scenario, blocks: { sections: 'a', sphere: 'b', custom: 'c' } })
    expect(tabs).toEqual([
      { view: 'main', label: 'Основной сценарий' },
      { view: 'sections', label: 'Разделы сайта' },
      { view: 'sphere', label: 'Сфера деятельности' },
      { view: 'custom', label: 'custom' },
    ])
  })

  it('сид: все шаги видны хотя бы в одном виде', () => {
    const seed = JSON.parse(
      readFileSync(new URL('../../backend/src/scenario/seed/scenario.json', import.meta.url), 'utf8'),
    ) as Scenario
    const shown = new Set<string>()
    for (const { view } of viewTabs(seed)) {
      for (const n of toFlow(seed, view).nodes) if (n.type === 'step') shown.add(n.id)
    }
    expect([...shown].sort()).toEqual(Object.keys(seed.steps).sort())
  })

  it('сид: раскладка dagre LR не накладывает ноды друг на друга', () => {
    const seed = JSON.parse(
      readFileSync(new URL('../../backend/src/scenario/seed/scenario.json', import.meta.url), 'utf8'),
    ) as Scenario
    for (const { view } of viewTabs(seed)) {
      const { nodes, edges } = toFlow(seed, view)
      const placed = autoLayout(nodes, edges, true)
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          const a = placed[i]!
          const b = placed[j]!
          const overlap =
            a.position.x < b.position.x + b.data.width &&
            b.position.x < a.position.x + a.data.width &&
            a.position.y < b.position.y + b.data.height &&
            b.position.y < a.position.y + a.data.height
          expect(overlap, `${view}: ${a.id} и ${b.id}`).toBe(false)
        }
      }
    }
  })
})
