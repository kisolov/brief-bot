<script setup lang="ts">
import type { Lead, LeadFilter } from '~/types/lead'
import { leadClient, leadStatus } from '~/utils/lead'
import { formatWhen } from '~/utils/when'

defineProps<{
  leads: Lead[]
  filter: LeadFilter
  selectedId: number | null
  /** Текст сбоя загрузки; пока он есть, вместо таблицы показывается он. */
  failure?: string | null
}>()
defineEmits<{ select: [id: number]; filter: [value: LeadFilter] }>()

const filters: { id: LeadFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'full', label: 'Полные' },
  { id: 'partial', label: 'Брошенные' },
]
</script>

<template>
  <section class="leads" aria-label="Список заявок">
    <div class="bar">
      <h1 class="title">Заявки</h1>
      <button
        v-for="f in filters"
        :key="f.id"
        type="button"
        class="chip"
        :class="{ on: f.id === filter }"
        :aria-pressed="f.id === filter"
        @click="$emit('filter', f.id)"
      >
        {{ f.label }}
      </button>
    </div>
    <p v-if="failure" class="note error" role="alert">{{ failure }}</p>
    <p v-else-if="!leads.length" class="note">Заявок пока нет.</p>
    <div v-else class="card">
      <table>
        <thead>
          <tr>
            <th scope="col">Когда</th>
            <th scope="col">Клиент</th>
            <th scope="col">Запрос</th>
            <th scope="col">Статус</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="lead in leads"
            :key="lead.id"
            :class="{ on: lead.id === selectedId }"
            tabindex="0"
            :aria-selected="lead.id === selectedId"
            @click="$emit('select', lead.id)"
            @keydown.enter="$emit('select', lead.id)"
          >
            <td class="when">{{ formatWhen(lead.createdAt) }}</td>
            <td class="client">{{ leadClient(lead) }}</td>
            <td>{{ lead.branch || '—' }}</td>
            <td>
              <span
                class="badge"
                :class="{ partial: leadStatus(lead).partial }"
                :title="leadStatus(lead).label"
                >{{ leadStatus(lead).label }}</span
              >
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.leads {
  box-sizing: border-box;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  font-family: var(--font);
  color: var(--ink);
}
.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.title {
  margin: 0 8px 0 0;
  font-size: 18px;
  font-weight: 600;
}
.chip {
  font: inherit;
  font-size: 13px;
  padding: 6px 12px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--ink-2);
  cursor: pointer;
}
.chip.on {
  font-weight: 600;
  border-color: var(--accent);
  background: var(--step-choice-tint);
  color: var(--step-choice-ink);
}
.card {
  background: var(--bg-card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
th {
  padding: 10px 12px;
  font-weight: 500;
  text-align: left;
  color: var(--ink-3);
}
td {
  padding: 12px;
  overflow-wrap: anywhere;
}
tbody tr {
  border-top: 1px solid var(--line-soft);
  cursor: pointer;
}
tbody tr.on {
  background: #eff3fc;
}
.when {
  color: var(--ink-2);
  white-space: nowrap;
}
.client {
  font-weight: 500;
  /* без минимума `anywhere` сжимает столбец до обрыва посреди обычного имени */
  min-width: 120px;
}
.badge {
  display: inline-block;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
  font-size: 12px;
  font-weight: 600;
  border-radius: var(--radius-sm);
  padding: 3px 8px;
  white-space: nowrap;
  background: var(--ok-bg);
  color: #0b5b44;
}
.badge.partial {
  background: var(--step-text-tint);
  color: var(--step-text-ink);
}
.note {
  margin: 0;
  background: var(--bg-card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 40px 12px;
  text-align: center;
  font-size: 14px;
  color: var(--ink-3);
}
.note.error {
  color: var(--danger);
}
</style>
