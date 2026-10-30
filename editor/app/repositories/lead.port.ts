import type { Lead, LeadFile, LeadStatus } from '~/types/lead'

export interface LeadRepository {
  /** Новые первыми; без `status` все заявки. */
  list(status?: LeadStatus): Promise<Lead[]>
  /** Файл ТЗ с именем из ответа; больше 20 МБ это `FileTooLarge`, нет файла это `LeadNotFound`. */
  downloadFile(id: number): Promise<LeadFile>
}
