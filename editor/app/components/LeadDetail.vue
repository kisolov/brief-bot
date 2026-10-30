<script setup lang="ts">
import type { Lead } from '~/types/lead'
import { leadName, leadRest, leadTop } from '~/utils/lead'
import { formatWhen } from '~/utils/when'

defineProps<{
  /** Выбранная заявка; без неё показывается подсказка. */
  lead: Lead | null
  /** Текст ошибки скачивания, например про файл больше 20 МБ. */
  fileError?: string | null
}>()
defineEmits<{ download: [id: number] }>()
</script>

<template>
  <article class="detail" aria-label="Карточка заявки">
    <template v-if="lead">
      <div class="head">
        <h2 class="name">{{ leadName(lead) }}</h2>
        <div class="sub">{{ [lead.branch, formatWhen(lead.createdAt)].filter(Boolean).join('. ') }}</div>
      </div>
      <div v-if="leadTop(lead).length" class="top">
        <div v-for="a in leadTop(lead)" :key="a.key" class="cell">
          <span class="key">{{ a.key }}</span>
          <span class="val">{{ a.value }}</span>
        </div>
      </div>
      <div class="rows">
        <div v-for="(a, i) in leadRest(lead)" :key="i" class="row">
          <span class="key">{{ a.key }}</span>
          <span>{{ a.value }}</span>
        </div>
      </div>
      <div v-if="lead.hasFile" class="file">
        <a :href="`/api/leads/${lead.id}/file`" class="download" @click.prevent="$emit('download', lead.id)">Скачать ТЗ</a>
        <p v-if="fileError" class="error" role="alert">{{ fileError }}</p>
      </div>
    </template>
    <p v-else class="hint">Выберите заявку в списке.</p>
  </article>
</template>

<style scoped>
.detail {
  box-sizing: border-box;
  width: 600px;
  max-width: 100%;
  padding: 20px;
  background: var(--bg-card);
  border-left: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-family: var(--font);
  font-size: 14px;
  color: var(--ink);
}
.head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.name {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.sub {
  color: var(--ink-2);
}
.top {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  font-size: 13px;
}
.cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.key {
  color: var(--ink-3);
}
.val {
  font-weight: 500;
}
.rows {
  border-top: 1px solid var(--line-soft);
  display: flex;
  flex-direction: column;
}
.row {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  gap: 12px;
  padding: 9px 0;
  border-bottom: 1px solid var(--line-soft);
  font-size: 13px;
}
.file {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.download {
  font-size: 14px;
  font-weight: 500;
  color: var(--accent);
}
.error {
  margin: 0;
  font-size: 13px;
  color: var(--danger);
}
.hint {
  margin: 0;
  padding: 40px 0;
  text-align: center;
  color: var(--ink-3);
}
</style>
