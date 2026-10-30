<script setup lang="ts">
import { VueFlow, useVueFlow } from '@vue-flow/core'
import type { Edge, Node } from '@vue-flow/core'
import { MiniMap } from '@vue-flow/minimap'
import BlockNode from './BlockNode.vue'
import StepNode from './StepNode.vue'

const props = defineProps<{ nodes: Node[]; edges: Edge[] }>()
const emit = defineEmits<{ select: [id: string]; relayout: [] }>()

const { zoomIn, zoomOut, fitView, viewport, onNodesInitialized } = useVueFlow()
const zoomPercent = computed(() => `${Math.round(viewport.value.zoom * 100)}%`)

const START_SPAN = 900
const SMALL_GRAPH = 14

// Маленькая схема вписывается целиком. У большой на экране начало сценария
// в читаемом масштабе, остальное достаётся зумом и миникартой.
function focus() {
  const all = props.nodes
  if (all.length <= SMALL_GRAPH) return fitView({ padding: 0.08, maxZoom: 1 })
  const left = Math.min(...all.map((n) => n.position.x))
  const start = all.filter((n) => n.position.x < left + START_SPAN).map((n) => n.id)
  return fitView({ nodes: start, padding: 0.08, minZoom: 0.5, maxZoom: 1 })
}

// Ноды получают размеры после отрисовки: фокус ставится на каждую новую раскладку
onNodesInitialized(focus)

function nodeColor(node: Node): string {
  if (node.type === 'block') return '#18212c'
  if (node.type === 'stub') return '#c8cfd9'
  return node.data.stepType === 'multi_input' ? '#d5cbf0' : '#c5d3f2'
}

function relayout() {
  emit('relayout')
  nextTick(focus)
}
</script>

<template>
  <div class="scenario-graph">
    <VueFlow
      :nodes="nodes"
      :edges="edges"
      :nodes-draggable="false"
      :nodes-connectable="false"
      :min-zoom="0.1"
      :max-zoom="2"
      fit-view-on-init
      @node-click="({ node }) => emit('select', node.id)"
    >
      <template #node-step="props"><StepNode v-bind="props" /></template>
      <template #node-block="props"><BlockNode v-bind="props" /></template>
      <template #node-stub="props"><BlockNode v-bind="props" /></template>
      <MiniMap :node-color="nodeColor" :width="150" :height="96" aria-label="Миникарта схемы" />
    </VueFlow>

    <div class="zoom">
      <button type="button" aria-label="Уменьшить" @click="zoomOut()">−</button>
      <span>{{ zoomPercent }}</span>
      <button type="button" aria-label="Увеличить" @click="zoomIn()">+</button>
      <button type="button" class="relayout" @click="relayout">Разложить</button>
    </div>
  </div>
</template>

<style scoped>
.scenario-graph {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: var(--bg-canvas);
  background-image: radial-gradient(var(--line-strong) 1px, transparent 1px);
  background-size: 20px 20px;
  font-family: var(--font);
  color: var(--ink);
}
.zoom {
  position: absolute;
  left: 16px;
  bottom: 16px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-card);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  padding: 3px;
  font-size: 13px;
}
.zoom button {
  font: inherit;
  width: 30px;
  height: 30px;
  border: 0;
  background: transparent;
  color: var(--ink);
  cursor: pointer;
}
.zoom span {
  min-width: 40px;
  text-align: center;
  color: var(--ink-2);
}
.zoom .relayout {
  width: auto;
  padding: 0 10px;
  border-left: 1px solid var(--line);
}
</style>

<style>
.scenario-graph .vue-flow__edge-path {
  stroke: var(--port);
  stroke-width: 1.5;
}
.scenario-graph .vue-flow__minimap {
  right: 16px;
  bottom: 16px;
  margin: 0;
  background: var(--bg-card);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
</style>
