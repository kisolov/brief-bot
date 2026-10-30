<script setup lang="ts">
import type { ReminderErrors, ReminderSettings } from '~/types/settings'

const props = defineProps<{
  /** Сохранённые значения: форма начинает с них и перечитывает их при смене. */
  reminder: ReminderSettings
  errors: ReminderErrors
  saved: boolean
  saving?: boolean
  /** Сбой связи при загрузке или сохранении. */
  failure?: string | null
}>()
const emit = defineEmits<{ save: [value: ReminderSettings] }>()

// v-model.number отдаёт пустое поле строкой: Number('') это 0, и проверка в store отклонит его как 0 часов
const hours = ref<number>(props.reminder.hours)
const text = ref(props.reminder.text)
watch(
  () => props.reminder,
  (r) => {
    hours.value = r.hours
    text.value = r.text
  },
)

function submit() {
  emit('save', { hours: Number(hours.value), text: text.value })
}
</script>

<template>
  <section class="settings" aria-label="Настройки">
    <form class="form" novalidate @submit.prevent="submit">
      <h1 class="title">Напоминание о брошенной анкете</h1>
      <div class="field">
        <label for="remind-hours">Через сколько часов напоминать</label>
        <input
          id="remind-hours"
          v-model.number="hours"
          type="number"
          class="hours"
          :class="{ bad: errors.hours }"
          :aria-invalid="!!errors.hours"
          aria-describedby="remind-hours-error"
        />
        <p v-if="errors.hours" id="remind-hours-error" class="error" role="alert">{{ errors.hours }}</p>
      </div>
      <div class="field">
        <label for="remind-text">Текст напоминания</label>
        <textarea
          id="remind-text"
          v-model="text"
          rows="4"
          :class="{ bad: errors.text }"
          :aria-invalid="!!errors.text"
          aria-describedby="remind-text-error"
        />
        <p v-if="errors.text" id="remind-text-error" class="error" role="alert">{{ errors.text }}</p>
      </div>
      <div class="actions">
        <button type="submit" class="save" :disabled="saving">Сохранить</button>
        <span v-if="saved" class="ok" role="status">Сохранено</span>
        <span v-if="failure" class="error" role="alert">{{ failure }}</span>
      </div>
    </form>
  </section>
</template>

<style scoped>
.settings {
  box-sizing: border-box;
  padding: 24px 20px;
  font-family: var(--font);
  font-size: 14px;
  color: var(--ink);
}
.form {
  max-width: 560px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
label {
  font-weight: 500;
}
input,
textarea {
  font: inherit;
  box-sizing: border-box;
  border: 1px solid #a9b3c0;
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--ink);
}
input {
  width: 120px;
  height: 40px;
  padding: 0 10px;
}
textarea {
  line-height: 20px;
  width: 100%;
  padding: 8px 10px;
  resize: vertical;
}
.bad {
  border-color: var(--danger);
}
.error {
  margin: 0;
  font-size: 13px;
  color: var(--danger);
}
.actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.save {
  font: inherit;
  font-weight: 600;
  height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: #fff;
  cursor: pointer;
}
.save:disabled {
  opacity: 0.5;
}
.ok {
  font-size: 13px;
  font-weight: 500;
  color: var(--ok-ink);
}
</style>
