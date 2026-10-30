<script setup lang="ts">
import type { VersionInfo } from '~/types/scenario'
import { formatWhen } from '~/utils/when'

defineProps<{
  /** По возрастанию номера; на экране новые сверху. */
  versions: VersionInfo[]
  failure?: string | null
  busy?: boolean
}>()
defineEmits<{ activate: [number: number] }>()
</script>

<template>
  <section class="versions" aria-label="Версии сценария">
    <div class="wrap">
      <h1 class="title">Версии сценария</h1>
      <p v-if="failure" class="error" role="alert">{{ failure }}</p>
      <div v-if="versions.length" class="card">
        <div v-for="v in [...versions].reverse()" :key="v.number" class="row">
          <div class="num">Версия {{ v.number }}</div>
          <div class="when">{{ formatWhen(v.publishedAt) }}</div>
          <span v-if="v.active" class="live">Сейчас в боте</span>
          <button v-else type="button" class="back" :disabled="busy" @click="$emit('activate', v.number)">Вернуть</button>
        </div>
      </div>
      <p v-else-if="!failure" class="empty">Версий пока нет.</p>
    </div>
  </section>
</template>

<style scoped>
.versions {
  box-sizing: border-box;
  padding: 24px 20px;
  font-family: var(--font);
  font-size: 14px;
  color: var(--ink);
}
.wrap {
  max-width: 720px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.card {
  background: var(--bg-card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 8px 14px;
  border-top: 1px solid var(--line-soft);
}
.num {
  font-weight: 600;
  width: 96px;
}
.when {
  flex: 1 1 auto;
  color: var(--ink-2);
  font-size: 13px;
}
.live {
  font-size: 12px;
  font-weight: 600;
  background: var(--ok-bg);
  color: #0b5b44;
  border-radius: var(--radius-sm);
  padding: 3px 8px;
}
.back {
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--accent);
  cursor: pointer;
}
.back:disabled {
  opacity: 0.5;
}
.error {
  margin: 0;
  font-size: 13px;
  color: var(--danger);
}
.empty {
  margin: 0;
  color: var(--ink-3);
}
</style>
