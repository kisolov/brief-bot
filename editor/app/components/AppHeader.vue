<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useScenarioStore } from '~/stores/scenario.store'

withDefaults(
  defineProps<{
    active?: 'scenario' | 'leads' | 'settings' | 'versions'
    /** «Черновик сохранён в 14:32» и другие состояния автосохранения. */
    status?: string
    /** Кнопка «Опубликовать» недоступна: идёт публикация, черновик в конфликте или не загружен. */
    publishDisabled?: boolean
  }>(),
  { active: 'scenario', status: '', publishDisabled: false },
)
defineEmits<{ publish: [] }>()

const tabs = [
  { id: 'scenario', label: 'Сценарий', to: '/' },
  { id: 'leads', label: 'Заявки', to: '/leads' },
  { id: 'settings', label: 'Настройки', to: '/settings' },
  { id: 'versions', label: 'Версии', to: '/versions' },
] as const

const { activeVersion } = storeToRefs(useScenarioStore())
</script>

<template>
  <header class="app-header">
    <div class="brand">Редактор бота</div>
    <nav aria-label="Разделы">
      <NuxtLink
        v-for="tab in tabs"
        :key="tab.id"
        :to="tab.to"
        class="tab"
        :class="{ active: tab.id === active }"
      >
        {{ tab.label }}
      </NuxtLink>
    </nav>
    <div class="spacer" />
    <div v-if="status" class="status" role="status">{{ status }}</div>
    <div v-if="activeVersion" class="live">В боте: версия {{ activeVersion }}</div>
    <button type="button" class="publish" :disabled="publishDisabled" @click="$emit('publish')">Опубликовать</button>
  </header>
</template>

<style scoped>
.app-header {
  flex: none;
  height: 56px;
  box-sizing: border-box;
  padding: 0 20px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  gap: 28px;
  font-family: var(--font);
  color: var(--ink);
}
.brand {
  font-size: 15px;
  font-weight: 700;
  white-space: nowrap;
}
nav {
  display: flex;
  align-items: stretch;
  gap: 4px;
  height: 56px;
}
.tab {
  display: flex;
  align-items: center;
  padding: 0 12px;
  font-size: 14px;
  font-weight: 500;
  color: var(--ink-2);
  border-bottom: 2px solid transparent;
  box-sizing: border-box;
}
.tab:hover {
  color: var(--accent);
}
.tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
.spacer {
  flex: 1 1 auto;
}
.status {
  font-size: 13px;
  color: var(--ink-3);
  white-space: nowrap;
}
.live {
  font-size: 13px;
  font-weight: 500;
  color: var(--ok-ink);
  background: var(--ok-bg);
  border-radius: var(--radius-sm);
  padding: 5px 9px;
  white-space: nowrap;
}
.publish {
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: var(--accent);
  border: 0;
  border-radius: var(--radius-sm);
  padding: 9px 16px;
  white-space: nowrap;
}
.publish:disabled {
  opacity: 0.5;
}
</style>
