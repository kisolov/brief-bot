import type { ReminderSettings } from '~/types/settings'

export interface SettingsRepository {
  getReminder(): Promise<ReminderSettings>
  /** Возвращает сохранённое; значения вне границ это `SettingsInvalid`. */
  saveReminder(settings: ReminderSettings): Promise<ReminderSettings>
}
