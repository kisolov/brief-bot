import { useLeadStore } from '~/stores/lead.store'
import type { LeadFilter } from '~/types/lead'

/** Сценарий «смотреть заявки»: выбрать строку и переключить фильтр. */
export function useBrowseLeads() {
  const store = useLeadStore()

  return {
    select: (id: number | null): void => store.select(id),
    setFilter: (filter: LeadFilter): void => store.setFilter(filter),
  }
}
