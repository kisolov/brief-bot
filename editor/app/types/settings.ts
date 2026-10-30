/** Настройки напоминания о брошенной анкете. */
export interface ReminderSettings {
  hours: number
  text: string
}

/** Ошибки полей формы; ключ есть, только если поле не прошло проверку. */
export interface ReminderErrors {
  hours?: string
  text?: string
}

export const REMINDER_MIN_HOURS = 1
export const REMINDER_MAX_HOURS = 168
export const REMINDER_MAX_TEXT = 1024
