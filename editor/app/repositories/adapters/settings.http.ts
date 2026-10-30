import { SettingsInvalid } from '~/errors/settings'
import type { SettingsRepository } from '~/repositories/settings.port'
import type { ReminderSettings } from '~/types/settings'
import { type HttpClient, request } from './http'

export class HttpSettingsRepository implements SettingsRepository {
  constructor(private readonly client: HttpClient) {}

  getReminder(): Promise<ReminderSettings> {
    return request(() => this.client<ReminderSettings>('/api/settings/reminder', {}))
  }

  saveReminder(settings: ReminderSettings): Promise<ReminderSettings> {
    return request(
      () => this.client<ReminderSettings>('/api/settings/reminder', { method: 'PUT', body: settings }),
      (status) => (status === 422 ? new SettingsInvalid() : null),
    )
  }
}
