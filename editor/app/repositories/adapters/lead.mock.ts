import { FileTooLarge, LeadNotFound } from '~/errors/lead'
import type { LeadRepository } from '~/repositories/lead.port'
import type { Lead, LeadStatus } from '~/types/lead'

const MINUTE = 60_000

/** Заявки в памяти: сегодняшние, вчерашняя и одна старая, полные и брошенные. */
export function sampleLeads(now = new Date()): Lead[] {
  const ago = (minutes: number) => new Date(now.getTime() - minutes * MINUTE).toISOString()
  return [
    {
      id: 4,
      branch: 'Новый сайт, товары',
      username: 'anna_k',
      status: 'full',
      createdAt: ago(25),
      lastStep: null,
      hasFile: true,
      answers: [
        { key: 'Имя', value: 'Анна Ковалёва' },
        { key: 'Телефон', value: '+7 999 111-22-33' },
        { key: 'Мессенджер', value: 'Telegram' },
        { key: 'Удобное время', value: 'День (12:00–17:00)' },
        { key: 'Оплата на сайте', value: 'Да' },
        { key: 'Расчёт доставки', value: 'Да' },
        { key: 'Учёт остатков', value: 'Нет' },
        { key: 'Функционал', value: 'Поиск, Личный кабинет, Купоны/промокоды' },
        { key: 'Количество товаров', value: '100–1 000' },
        { key: 'Дизайн', value: 'Главное — просто современно и красиво' },
      ],
    },
    {
      id: 3,
      branch: 'Продвижение сайта',
      username: 'ivan_p',
      status: 'full',
      createdAt: ago(180),
      lastStep: null,
      hasFile: false,
      answers: [
        { key: 'Имя', value: 'Иван Петров' },
        { key: 'Телефон', value: '+7 912 333-44-55' },
        { key: 'Мессенджер', value: 'WhatsApp' },
        { key: 'Удобное время', value: 'Утро (9:00–12:00)' },
        { key: 'Что продвигаем', value: 'Интернет-магазин' },
        { key: 'География продвижения', value: 'По России' },
      ],
    },
    {
      id: 2,
      branch: 'Новый сайт, услуги',
      username: 'telegram_user',
      status: 'partial',
      createdAt: ago(60 * 5),
      lastStep: 'Какой бюджет вы рассматриваете?',
      hasFile: false,
      answers: [
        { key: 'Сфера', value: 'Услуги' },
        { key: 'Основные страницы', value: 'Главная, Контакты' },
      ],
    },
    {
      id: 1,
      branch: 'Доработать сайт',
      username: null,
      status: 'full',
      createdAt: ago(60 * 30),
      lastStep: null,
      hasFile: false,
      answers: [
        { key: 'Имя', value: 'Ольга' },
        { key: 'Телефон', value: '+7 905 777-88-99' },
        { key: 'Платформа сайта', value: 'WordPress' },
      ],
    },
    {
      id: 0,
      branch: 'Новый сайт',
      username: null,
      status: 'partial',
      createdAt: ago(60 * 24 * 9),
      lastStep: 'Оставьте телефон для связи',
      hasFile: false,
      answers: [],
    },
  ]
}

/** Заявки без backend: файл есть только у тех, у кого `hasFile`. */
export class MockLeadRepository implements LeadRepository {
  private readonly leads: Lead[]
  /** Заявки, чей файл «слишком большой»: проверка текста ошибки без backend. */
  readonly oversized = new Set<number>()

  constructor(leads?: Lead[]) {
    this.leads = structuredClone(leads ?? sampleLeads())
  }

  async list(status?: LeadStatus): Promise<Lead[]> {
    const items = status ? this.leads.filter((l) => l.status === status) : this.leads
    return structuredClone(items)
  }

  async downloadFile(id: number): Promise<Blob> {
    const lead = this.leads.find((l) => l.id === id)
    if (!lead?.hasFile) throw new LeadNotFound()
    if (this.oversized.has(id)) throw new FileTooLarge()
    return new Blob([`ТЗ заявки ${id}`], { type: 'application/octet-stream' })
  }
}
