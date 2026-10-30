import { mapLeadsError } from '~/errors/presentation'
import { useLeadStore } from '~/stores/lead.store'
import { usePageGuard } from './usePageGuard'

/** Сценарий «открыть заявки»: загрузить список; возвращает текст ошибки или `null`. */
export function useLoadLeads() {
  const store = useLeadStore()
  const guard = usePageGuard(mapLeadsError)

  return () => guard(() => store.load())
}
