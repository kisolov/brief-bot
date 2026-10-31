<script setup lang="ts">
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@vue-flow/core'
import type { MarkerType, Position } from '@vue-flow/core'

// Vue Flow передаёт ребру все поля `EdgeProps`; компилятору нужны те, что читает шаблон
const props = defineProps<{
  id: string
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition: Position
  targetPosition: Position
  markerEnd?: MarkerType | string
  interactionWidth?: number
  selected?: boolean
  /** Правки заблокированы (конфликт версий): кнопка "×" не показывается. */
  locked?: boolean
}>()
defineEmits<{ detach: [] }>()

const geometry = computed(() =>
  getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  }),
)
const path = computed(() => geometry.value[0])
const middle = computed(() => ({ x: geometry.value[1], y: geometry.value[2] }))
</script>

<template>
  <BaseEdge :id="id" :path="path" :marker-end="markerEnd" :interaction-width="interactionWidth" />
  <EdgeLabelRenderer v-if="selected && !locked">
    <button
      type="button"
      class="detach nodrag nopan"
      aria-label="Отсоединить"
      :style="{ transform: `translate(-50%, -50%) translate(${middle.x}px, ${middle.y}px)` }"
      @mousedown.stop
      @click.stop="$emit('detach')"
    >
      ×
    </button>
  </EdgeLabelRenderer>
</template>

<style scoped>
.detach {
  position: absolute;
  width: 22px;
  height: 22px;
  padding: 0;
  display: grid;
  place-items: center;
  border: 1.5px solid var(--accent);
  border-radius: 50%;
  background: var(--bg-card);
  color: var(--accent);
  font: 600 16px/1 var(--font);
  cursor: pointer;
  pointer-events: all;
}
.detach:hover,
.detach:focus-visible {
  background: var(--accent);
  color: var(--bg-card);
}
</style>
