/** Типы заявок: зеркало `LeadDto` из API (`docs/services/API.md`). */

export type LeadStatus = 'partial' | 'full'

export interface LeadAnswer {
  /** Подпись ответа уже человеческая: backend отдаёт её через `display_key`. */
  key: string
  value: string
}

export interface Lead {
  id: number
  /** Направление заявки: «Новый сайт», «Продвижение сайта». */
  branch: string
  username: string | null
  status: LeadStatus
  createdAt: string
  /** Первая строка текста шага, на котором анкету бросили; у полной заявки пусто. */
  lastStep: string | null
  hasFile: boolean
  answers: LeadAnswer[]
}

/** Файл ТЗ: содержимое и имя, которое назначил backend. */
export interface LeadFile {
  blob: Blob
  name: string
}

/** Фильтр списка: все, полные или брошенные. */
export type LeadFilter = 'all' | LeadStatus
