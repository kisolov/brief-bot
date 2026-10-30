import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { __setContainer } from '~/container'
import { MockLeadRepository, sampleLeads } from '~/repositories/adapters/lead.mock'
import { useLeadStore } from '~/stores/lead.store'
import type { Lead } from '~/types/lead'
import { leadClient, leadName, leadRest, leadStatus, leadTop } from '~/utils/lead'
import { formatWhen } from '~/utils/when'

const NOW = new Date('2026-10-30T15:00:00')

function useStore(leads: Lead[] = sampleLeads(NOW)) {
  __setContainer({ leadRepository: new MockLeadRepository(leads) })
  setActivePinia(createPinia())
  return useLeadStore()
}

describe('leads store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('test_filter_by_status', async () => {
    const store = useStore()
    await store.load()
    expect(store.visible).toHaveLength(5)
    store.setFilter('partial')
    expect(store.visible.map((l) => l.id)).toEqual([2, 0])
    store.setFilter('full')
    expect(store.visible.every((l) => l.status === 'full')).toBe(true)
    expect(store.visible).toHaveLength(3)
    store.setFilter('all')
    expect(store.visible).toHaveLength(5)
  })

  it('load выбирает первую (новейшую) заявку', async () => {
    const store = useStore()
    await store.load()
    expect(store.selected?.id).toBe(4)
  })

  it('смена фильтра переносит выбор, если выбранная заявка пропала из списка', async () => {
    const store = useStore()
    await store.load()
    store.select(4)
    store.setFilter('partial')
    expect(store.selected?.id).toBe(2)
  })

  it('пустой список не даёт выбранной заявки', async () => {
    const store = useStore([])
    await store.load()
    expect(store.selected).toBeNull()
    expect(store.loaded).toBe(true)
  })

  it('test_partial_lead_shows_step', () => {
    const partial = sampleLeads(NOW).find((l) => l.id === 2)!
    expect(leadStatus(partial)).toEqual({ label: 'Брошена на шаге «Какой бюджет вы рассматриваете?»', partial: true })
    const full = sampleLeads(NOW).find((l) => l.id === 3)!
    expect(leadStatus(full)).toEqual({ label: 'Полная', partial: false })
  })

  it('брошенная заявка без lastStep называется просто брошенной', () => {
    const lead = { ...sampleLeads(NOW)[2]!, lastStep: null }
    expect(leadStatus(lead).label).toBe('Брошена')
  })
})

describe('данные заявки', () => {
  const all = sampleLeads(NOW)

  it('имя это ответ «Имя», иначе «Заявка #id»', () => {
    expect(leadName(all.find((l) => l.id === 4)!)).toBe('Анна Ковалёва')
    expect(leadName(all.find((l) => l.id === 2)!)).toBe('Заявка #2')
  })

  it('в таблице клиент без имени показывается как @username, затем как номер', () => {
    expect(leadClient(all.find((l) => l.id === 2)!)).toBe('@telegram_user')
    expect(leadClient(all.find((l) => l.id === 0)!)).toBe('Заявка #0')
  })

  it('телефон, мессенджер и время идут наверх, остальное списком, имя не повторяется', () => {
    const lead = all.find((l) => l.id === 4)!
    expect(leadTop(lead).map((a) => a.key)).toEqual(['Телефон', 'Мессенджер', 'Удобное время'])
    const rest = leadRest(lead).map((a) => a.key)
    expect(rest[0]).toBe('Оплата на сайте')
    expect(rest).not.toContain('Имя')
    expect(rest).not.toContain('Телефон')
  })

  it('верхний блок показывает только то, что есть в заявке', () => {
    const lead = all.find((l) => l.id === 1)!
    expect(leadTop(lead).map((a) => a.key)).toEqual(['Телефон'])
  })

  it('формат времени: сегодня, вчера, дата', () => {
    expect(formatWhen('2026-10-30T14:12:00', NOW)).toBe('Сегодня, 14:12')
    expect(formatWhen('2026-10-29T18:27:00', NOW)).toBe('Вчера, 18:27')
    expect(formatWhen('2026-10-28T19:30:00', NOW)).toBe('28 октября, 19:30')
    expect(formatWhen('2025-01-05T09:05:00', NOW)).toBe('5 января 2025, 09:05')
  })
})
