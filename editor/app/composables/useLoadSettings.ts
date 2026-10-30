import { mapSettingsError } from '~/errors/presentation'
import { useSettingsStore } from '~/stores/settings.store'
import { usePageGuard } from './usePageGuard'

/** Сценарий «открыть настройки»: загрузить напоминание; возвращает текст ошибки или `null`. */
export function useLoadSettings() {
  const store = useSettingsStore()
  const guard = usePageGuard(mapSettingsError)

  return () => guard(() => store.load())
}
