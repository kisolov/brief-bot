import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useContainer } from '~/container'
import {
  REMINDER_MAX_HOURS,
  REMINDER_MAX_TEXT,
  REMINDER_MIN_HOURS,
  type ReminderErrors,
  type ReminderSettings,
} from '~/types/settings'

/** Проверка до запроса: те же границы, что у backend (`hours` 1..168, `text` 1..1024). */
function validate(input: ReminderSettings): ReminderErrors {
  const errors: ReminderErrors = {}
  const { hours } = input
  if (!Number.isInteger(hours) || hours < REMINDER_MIN_HOURS || hours > REMINDER_MAX_HOURS) {
    errors.hours = `Укажите целое число часов от ${REMINDER_MIN_HOURS} до ${REMINDER_MAX_HOURS}.`
  }
  const text = input.text.trim()
  if (!text) errors.text = 'Напишите текст напоминания.'
  else if (text.length > REMINDER_MAX_TEXT) errors.text = `Не больше ${REMINDER_MAX_TEXT} знаков.`
  return errors
}

/** Сервис настроек: напоминание о брошенной анкете. */
export const useSettingsStore = defineStore('settings', () => {
  const repository = useContainer().settingsRepository

  const reminder = ref<ReminderSettings>({ hours: REMINDER_MIN_HOURS, text: '' })
  const errors = ref<ReminderErrors>({})
  /** «Сохранено» показывается до следующей попытки сохранить. */
  const saved = ref(false)
  const loaded = ref(false)

  async function load(): Promise<void> {
    reminder.value = await repository.getReminder()
    errors.value = {}
    saved.value = false
    loaded.value = true
  }

  /** Возвращает, ушло ли сохранение; при ошибке полей запрос не отправляется. */
  async function save(input: ReminderSettings): Promise<boolean> {
    saved.value = false
    const found = validate(input)
    errors.value = found
    if (Object.keys(found).length) return false
    reminder.value = await repository.saveReminder({ hours: input.hours, text: input.text.trim() })
    saved.value = true
    return true
  }

  return { reminder, errors, saved, loaded, load, save }
})
