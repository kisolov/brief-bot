<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { useEditStep } from '~/composables/useEditStep'

// Vue Flow передаёт ноде эти свойства; тип NodeProps компилятор SFC из node_modules не разворачивает
const props = defineProps<{
  id: string
  type: string
  data: Record<string, any>
}>()
// Общий блок тёмный, заглушка-ссылка на шаг другого вида светлая (артборд BlockNode)
const shared = computed(() => props.type === 'block')
// Карточка без стрелок убирается крестиком, у подключённой сначала снимают стрелки
const removable = computed(() => shared.value && props.data.sources.length === 0)
const { removeCard } = useEditStep()
</script>

<template>
  <div class="block-node" :class="{ shared }">
    <Handle id="in" type="target" :position="Position.Left" class="port-in" />
    <button
      v-if="removable"
      type="button"
      class="drop nodrag"
      aria-label="Убрать со схемы"
      title="Убрать со схемы. Блок останется"
      @click.stop="removeCard(data.view, data.block, data.then)"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
      </svg>
    </button>
    <div class="kind">{{ data.kindLabel }}</div>
    <div class="title">{{ data.title }}</div>
    <Handle v-if="shared" id="out" type="source" :position="Position.Right" class="port-out" />
  </div>
</template>

<style scoped>
.block-node {
  position: relative;
  width: 190px;
  height: 64px;
  box-sizing: border-box;
  padding: 0 12px;
  background: var(--bg-card);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  font-family: var(--font);
  color: var(--ink);
  cursor: pointer;
}
.block-node.shared {
  background: var(--block-bg);
  border: 0;
  color: #fff;
}
.drop {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--block-kind);
  cursor: pointer;
}
.drop:hover {
  color: #fff;
}
.kind {
  font-size: 11px;
  font-weight: 500;
  color: var(--ink-2);
}
.shared .kind {
  color: var(--block-kind);
}
.title {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

<style>
.block-node .vue-flow__handle {
  width: 10px;
  height: 10px;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  border-radius: 5px;
  top: 27px;
  transform: none;
}
.block-node .port-in {
  left: -6px;
  background: var(--bg-card);
  border: 2px solid var(--port);
}
.block-node .port-out {
  right: -6px;
  background: var(--port);
  border: 2px solid var(--bg-card);
}
</style>
