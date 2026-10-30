<script setup lang="ts">
import type { Issue } from '~/types/scenario'
import type { IssueItem } from '~/utils/issues'

defineProps<{ items: IssueItem[]; version: number | null }>()
const emit = defineEmits<{ jump: [issue: Issue] }>()

/** «1 ошибку», «2 ошибки», «5 ошибок». */
function errors(n: number): string {
  const tail = n % 100
  if (tail >= 11 && tail <= 14) return `${n} ошибок`
  const last = n % 10
  if (last === 1) return `${n} ошибку`
  return last >= 2 && last <= 4 ? `${n} ошибки` : `${n} ошибок`
}
</script>

<template>
  <aside class="errors-panel" aria-label="Ошибки публикации">
    <div class="title">Публикация остановлена</div>
    <div v-if="version" class="calm">
      Бот продолжает работать на версии {{ version }}. Пользователи ничего не заметили.
    </div>
    <div class="count">Исправьте {{ errors(items.length) }}</div>
    <button v-for="item in items" :key="item.number" type="button" class="issue" @click="emit('jump', item.issue)">
      <span class="num">{{ item.number }}</span>
      <span><b>{{ item.title }}</b><br />{{ item.text }}</span>
    </button>
  </aside>
</template>

<style scoped>
.errors-panel {
  width: 336px;
  flex: none;
  box-sizing: border-box;
  padding: 16px;
  background: var(--bg-card);
  border-left: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  font-family: var(--font);
  font-size: 13px;
  line-height: 19px;
  color: var(--ink);
}
.title {
  font-size: 15px;
  font-weight: 600;
}
.calm {
  background: var(--ok-bg);
  color: var(--ok-ink);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
}
.count {
  font-weight: 500;
}
.issue {
  font: inherit;
  text-align: left;
  display: flex;
  gap: 10px;
  padding: 10px;
  background: var(--bg-card);
  border: 1px solid #e9b9b5;
  border-radius: var(--radius-sm);
  color: var(--ink);
  cursor: pointer;
}
.issue:hover {
  background: #fdf6f5;
}
.num {
  flex: none;
  width: 20px;
  height: 20px;
  border-radius: 10px;
  background: var(--danger);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  line-height: 20px;
}
</style>
