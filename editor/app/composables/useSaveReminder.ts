import { mapSettingsError } from '~/errors/presentation'
import { useSettingsStore } from '~/stores/settings.store'
import type { ReminderSettings } from '~/types/settings'
import { usePageGuard } from './usePageGuard'

/**
 * Сценарий «сохранить напоминание». Ошибки полей остаются в store и показываются у полей;
 * возвращает только сбой связи или сервера как текст, иначе `null`.
 */
export function useSaveReminder() {
  const store = useSettingsStore()
  const guard = usePageGuard(mapSettingsError)

  return (input: ReminderSettings) => guard(() => store.save(input))
}
