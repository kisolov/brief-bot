import { useScenarioStore } from '~/stores/scenario.store'
import { usePageGuard } from './usePageGuard'

/**
 * Сценарий «вернуть версию»: откат заменяет черновик, поэтому при несохранённых правках
 * или расхождении с активной версией сначала спрашивается подтверждение.
 * Возвращает текст ошибки или `null` (успех, отказ в подтверждении, уход на /login).
 */
export function useActivateVersion() {
  const store = useScenarioStore()
  const guard = usePageGuard()

  return async function activateVersion(n: number): Promise<string | null> {
    if (store.needsRollbackConfirm && !confirm(`Черновик будет заменён версией ${n}. Продолжить?`)) return null
    return guard(() => store.activate(n))
  }
}
