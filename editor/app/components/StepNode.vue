<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'

interface Row {
  handle: string
  label: string
  more?: string[]
}

// Vue Flow передаёт ноде эти свойства; тип NodeProps компилятор SFC из node_modules не разворачивает
const props = defineProps<{
  id: string
  data: Record<string, any>
  selected?: boolean
}>()
const rows = computed<Row[]>(() => props.data.rows)
// номера ошибок публикации; на схеме они совпадают с номерами в панели ошибок
const errorNumbers = computed<number[]>(() => props.data.errorNumbers ?? [])
const failed = computed(() => props.data.state === 'error')
</script>

<template>
  <div
    class="step-node"
    :class="[`type-${data.stepType}`, { selected, error: failed }]"
    :style="{ height: `${data.height}px` }"
  >
    <Handle id="in" type="target" :position="Position.Left" class="port-in" />
    <div class="head">
      <span>{{ data.typeLabel }}</span>
      <span v-if="failed" class="badge">{{ errorNumbers.join(', ') }}</span>
    </div>
    <div class="title">{{ data.title }}</div>
    <div v-for="row in rows" :key="row.handle || 'more'" class="row" :class="{ more: row.more }">
      <span class="label">{{ row.label }}</span>
      <template v-if="row.more">
        <Handle v-for="id in row.more" :id="id" :key="id" type="source" :position="Position.Right" class="port-out" />
      </template>
      <Handle v-else :id="row.handle" type="source" :position="Position.Right" class="port-out" />
    </div>
  </div>
</template>

<style scoped>
.step-node {
  position: relative;
  width: 190px;
  box-sizing: border-box;
  background: var(--bg-card);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  font-family: var(--font);
  color: var(--ink);
  box-shadow: var(--shadow-node);
}
/* Толщина рамки постоянна: второй пиксель рисует тень, иначе выделение сдвигает содержимое */
.step-node.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent), 0 0 0 4px var(--accent-ring);
}
.step-node.error {
  border-color: var(--danger);
  box-shadow: 0 0 0 1px var(--danger);
}
.step-node.selected.error {
  box-shadow: 0 0 0 1px var(--danger), 0 0 0 4px var(--accent-ring);
}
.head {
  height: 26px;
  box-sizing: border-box;
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-radius: 6px 6px 0 0;
  font-size: 11px;
  font-weight: 600;
  background: var(--tint);
  color: var(--ink-type);
}
.badge {
  background: var(--danger);
  color: #fff;
  border-radius: 8px;
  padding: 0 6px;
  line-height: 16px;
}
.title {
  height: 46px;
  box-sizing: border-box;
  padding: 6px 10px 0;
  font-size: 12.5px;
  line-height: 17px;
  font-weight: 600;
  overflow: hidden;
}
.row {
  position: relative;
  height: 28px;
  box-sizing: border-box;
  padding: 0 10px;
  display: flex;
  align-items: center;
  font-size: 12px;
  border-top: 1px solid var(--line-soft);
}
.row.more {
  color: var(--ink-3);
}
.label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.type-choice { --tint: var(--step-choice-tint); --ink-type: var(--step-choice-ink); }
.type-multi { --tint: var(--step-multi-tint); --ink-type: var(--step-multi-ink); }
.type-multi_input { --tint: var(--step-multi_input-tint); --ink-type: var(--step-multi_input-ink); }
.type-text { --tint: var(--step-text-tint); --ink-type: var(--step-text-ink); }
.type-file { --tint: var(--step-file-tint); --ink-type: var(--step-file-ink); }
.type-info { --tint: var(--step-info-tint); --ink-type: var(--step-info-ink); }
</style>

<style>
/* Порты: Handle рендерится вне scoped-области компонента */
.step-node .vue-flow__handle {
  width: 10px;
  height: 10px;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  border-radius: 5px;
}
.step-node .port-in {
  left: -6px;
  top: 7px;
  transform: none;
  background: var(--bg-card);
  border: 2px solid var(--port);
}
.step-node .port-out {
  right: -6px;
  top: 9px;
  transform: none;
  background: var(--port);
  border: 2px solid var(--bg-card);
}
</style>
