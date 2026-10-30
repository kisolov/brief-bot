<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useLoadSettings } from '~/composables/useLoadSettings'
import { useSaveReminder } from '~/composables/useSaveReminder'
import { useSettingsStore } from '~/stores/settings.store'
import type { ReminderSettings } from '~/types/settings'

const loadSettings = useLoadSettings()
const saveReminder = useSaveReminder()
const { reminder, errors, saved, loaded } = storeToRefs(useSettingsStore())

const failure = ref<string | null>(null)
const saving = ref(false)

onMounted(async () => {
  failure.value = await loadSettings()
})

async function save(value: ReminderSettings) {
  saving.value = true
  failure.value = null
  failure.value = await saveReminder(value)
  saving.value = false
}
</script>

<template>
  <div class="page">
    <!-- форма появляется после загрузки: иначе она начала бы с пустых значений -->
    <SettingsForm
      v-if="loaded"
      :reminder="reminder"
      :errors="errors"
      :saved="saved"
      :saving="saving"
      :failure="failure"
      @save="save"
    />
    <p v-else-if="failure" class="failure" role="alert">{{ failure }}</p>
  </div>
</template>

<style scoped>
.page {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  background: var(--bg-bar);
}
.failure {
  margin: 0;
  padding: 24px 20px;
  font-size: 14px;
  color: var(--danger);
}
</style>
