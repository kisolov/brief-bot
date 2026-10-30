import type { Lead, LeadAnswer } from '~/types/lead'

/** Ответы, что идут в верхний блок карточки, в этом порядке. */
export const TOP_KEYS = ['Телефон', 'Мессенджер', 'Удобное время'] as const

const NAME_KEY = 'Имя'

function answerOf(lead: Lead, key: string): string | null {
  const value = lead.answers.find((a) => a.key === key)?.value.trim()
  return value ? value : null
}

/** Имя в карточке: ответ «Имя», иначе «Заявка #id». */
export function leadName(lead: Lead): string {
  return answerOf(lead, NAME_KEY) ?? `Заявка #${lead.id}`
}

/** Клиент в таблице: имя, иначе @username, иначе номер заявки. */
export function leadClient(lead: Lead): string {
  return answerOf(lead, NAME_KEY) ?? (lead.username ? `@${lead.username}` : `Заявка #${lead.id}`)
}

/** Подпись статуса; у брошенной заявки на ней последний шаг. */
export function leadStatus(lead: Lead): { label: string; partial: boolean } {
  if (lead.status === 'full') return { label: 'Полная', partial: false }
  const step = lead.lastStep?.trim()
  return { label: step ? `Брошена на шаге «${step}»` : 'Брошена', partial: true }
}

/** Телефон, мессенджер, удобное время: только те, что есть в заявке. */
export function leadTop(lead: Lead): LeadAnswer[] {
  return TOP_KEYS.flatMap((key) => lead.answers.filter((a) => a.key === key).slice(0, 1))
}

/** Остальные ответы списком: без имени и без того, что ушло наверх. */
export function leadRest(lead: Lead): LeadAnswer[] {
  const skip = new Set<string>([NAME_KEY, ...TOP_KEYS])
  return lead.answers.filter((a) => !skip.has(a.key))
}
