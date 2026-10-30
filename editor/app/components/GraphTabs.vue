<script setup lang="ts">
import type { GraphView } from '~/types/scenario'
import type { ViewTab } from '~/utils/scenarioGraph'

defineProps<{ tabs: ViewTab[]; view: GraphView }>()
defineEmits<{ select: [view: GraphView] }>()
</script>

<template>
  <div class="graph-tabs">
    <template v-for="(tab, i) in tabs" :key="tab.view">
      <span v-if="i === 1" class="caption">Общие блоки:</span>
      <button
        type="button"
        class="tab"
        :class="{ active: tab.view === view, main: i === 0 }"
        @click="$emit('select', tab.view)"
      >
        {{ tab.label }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.graph-tabs {
  height: 44px;
  box-sizing: border-box;
  padding: 0 20px;
  background: var(--bg-bar);
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font);
  font-size: 13px;
  color: var(--ink-2);
}
.caption {
  color: var(--ink-3);
  padding: 0 6px;
}
.tab {
  font: inherit;
  color: var(--ink-2);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  padding: 6px 12px;
  cursor: pointer;
}
.tab:hover {
  color: var(--accent);
}
.tab.active {
  font-weight: 600;
  color: var(--ink);
  background: var(--bg-card);
  border-color: var(--line-strong);
}
</style>
