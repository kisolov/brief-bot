import type { SettingsRepository } from '~/repositories/settings.port'
import type { ReminderSettings } from '~/types/settings'

/** Настройки в памяти: сохранённое живёт до перезагрузки страницы. */
export class MockSettingsRepository implements SettingsRepository {
  private current: ReminderSettings

  constructor(initial: ReminderSettings = { hours: 3, text: 'Вы не закончили анкету. Продолжим с того же места?' }) {
    this.current = { ...initial }
  }

  async getReminder(): Promise<ReminderSettings> {
    return { ...this.current }
  }

  async saveReminder(settings: ReminderSettings): Promise<ReminderSettings> {
    this.current = { ...settings }
    return { ...this.current }
  }
}
