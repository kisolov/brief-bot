<script setup lang="ts">
import { VueFlow, useVueFlow } from '@vue-flow/core'
import type { Edge, Node } from '@vue-flow/core'
import { MiniMap } from '@vue-flow/minimap'
import BlockNode from './BlockNode.vue'
import ScenarioEdge from './ScenarioEdge.vue'
import StepNode from './StepNode.vue'
import { edgeDropOutcome, selectEdge } from '~/utils/scenarioGraph'

const props = defineProps<{
  nodes: Node[]
  edges: Edge[]
  /** Вкладка: при её смене схема заново вписывается в экран. */
  view: string
  /** Правки заблокированы (конфликт версий): ноды не двигаются и не соединяются. */
  locked?: boolean
  /** Есть что отменять и что возвращать: от этого зависят кнопки. */
  canUndo?: boolean
  canRedo?: boolean
}>()
const emit = defineEmits<{
  select: [id: string]
  deselect: []
  relayout: []
  move: [id: string, pos: [number, number]]
  connect: [source: string, handle: string, target: string]
  /** Стрелка от порта `handle` ноды `source` отпущена в пустом месте: `at` в координатах холста, `pos` в координатах схемы. */
  connectEmpty: [source: string, handle: string, at: { x: number; y: number }, pos: [number, number]]
  drop: [type: string, pos: [number, number]]
  /** Стрелку от порта `handle` ноды `source` нужно отсоединить: кнопка "×", Delete или конец отпущен в пустом месте. */
  detach: [source: string, handle: string]
  undo: []
  redo: []
}>()

const { zoomIn, zoomOut, fitView, viewport, dimensions, screenToFlowCoordinate, onNodesInitialized } = useVueFlow()
const root = ref<HTMLElement | null>(null)
const zoomPercent = computed(() => `${Math.round(viewport.value.zoom * 100)}%`)

const START_SPAN = 520
const START_ZOOM = 0.8
const SMALL_GRAPH = 14

// Маленькая схема вписывается целиком. У большой на экране начало сценария
// в читаемом масштабе, остальное достаётся зумом и миникартой.
function focus() {
  const all = props.nodes
  if (all.length <= SMALL_GRAPH) return fitView({ padding: 0.08, maxZoom: 1 })
  const left = Math.min(...all.map((n) => n.position.x))
  const start = all.filter((n) => n.position.x < left + START_SPAN).map((n) => n.id)
  // масштаб не меньше 80%: текст нод читается, остальное зумом и миникартой
  return fitView({ nodes: start, padding: 0.08, minZoom: START_ZOOM, maxZoom: 1 })
}

// Ноды получают размеры после отрисовки. Вид вписывается при открытии и смене вкладки,
// а не при добавлении шага: иначе схема прыгала бы из-под рук.
let refit = true
watch(
  () => props.view,
  () => {
    refit = true
  },
)
let revealId: string | null = null

// Показать шаг, к которому ведёт ошибка: схема большая, шаг может лежать за краем экрана.
function showRevealed() {
  if (!revealId) return
  const id = revealId
  revealId = null
  fitView({ nodes: [id], padding: 0.6, minZoom: START_ZOOM, maxZoom: 1, duration: 200 })
}

onNodesInitialized(() => {
  if (!refit) return
  refit = false
  if (revealId) showRevealed()
  else focus()
})

function reveal(id: string) {
  revealId = id
  // после смены вкладки ноды появятся позже и покажут шаг сами (onNodesInitialized)
  nextTick(() => {
    if (!refit) showRevealed()
  })
}

const NODE_WIDTH = 190
const NODE_HALF_HEIGHT = 40

/** Центр видимой части холста в координатах схемы: сюда ложится шаг, добавленный кликом. */
function visibleCenter(): [number, number] {
  const { x, y, zoom } = viewport.value
  return [
    Math.round((dimensions.value.width / 2 - x) / zoom - NODE_WIDTH / 2),
    Math.round((dimensions.value.height / 2 - y) / zoom - NODE_HALF_HEIGHT),
  ]
}

// Выделенная стрелка: id вида `источник:порт`, переживает пересборку схемы. Состояние только на экране.
const selectedEdge = ref<string | null>(null)
const shownEdges = computed(() =>
  selectEdge(
    // при конфликте версий стрелки не тянутся
    props.locked ? props.edges.map((e) => ({ ...e, updatable: false })) : props.edges,
    selectedEdge.value,
  ),
)
watch(
  () => props.view,
  () => (selectedEdge.value = null),
)
watch(
  () => props.edges,
  (all) => {
    if (selectedEdge.value && !all.some((e) => e.id === selectedEdge.value)) selectedEdge.value = null
  },
)

/** Снять выделение стрелки: Esc и отмена. */
function clearEdge() {
  selectedEdge.value = null
}
defineExpose({ visibleCenter, reveal, clearEdge })

function detachSelected() {
  const edge = props.edges.find((e) => e.id === selectedEdge.value)
  selectedEdge.value = null
  if (edge && edge.sourceHandle && !props.locked) emit('detach', edge.source, edge.sourceHandle)
}

/** В поле ввода Delete и Backspace стирают текст, а не стрелку. */
function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
}

function onKey(event: KeyboardEvent) {
  if (event.key !== 'Delete' && event.key !== 'Backspace') return
  if (!selectedEdge.value || props.locked || isTyping(event.target)) return
  event.preventDefault()
  detachSelected()
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))

// Конец стрелки, взятый за якорь у цели: Vue Flow начинает от него обычное соединение, меню целей ему не нужно.
let reconnecting = false

function onEdgeUpdateEnd({ edge, event }: { edge: { source: string; sourceHandle?: string | null; target: string }; event: MouseEvent | TouchEvent }) {
  reconnecting = false
  const point = pointOf(event)
  if (!point) return
  const hit = document.elementFromPoint(point.clientX, point.clientY)
  const outcome = edgeDropOutcome(
    edge,
    { nodeId: hit?.closest('.vue-flow__node')?.getAttribute('data-id') ?? null, onPane: Boolean(hit?.closest('.vue-flow__pane')) },
    Boolean(props.locked),
  )
  if (outcome.kind === 'connect') emit('connect', outcome.source, outcome.handle, outcome.target)
  else if (outcome.kind === 'detach') {
    selectedEdge.value = null
    emit('detach', outcome.source, outcome.handle)
  }
}

function pointOf(event: MouseEvent | TouchEvent): { clientX: number; clientY: number } | undefined {
  return 'changedTouches' in event ? event.changedTouches[0] : event
}

// Стрелка, начатая от порта выхода: если она не дошла до порта, а отпущена на пустом холсте, открывается меню целей.
let pulling: { node: string; handle: string } | null = null

function onConnectStart(e: { nodeId: string; handleId: string | null; handleType: string | null }) {
  pulling = e.handleType === 'source' && e.handleId ? { node: e.nodeId, handle: e.handleId } : null
}

function onConnected(source: string, handle: string | null | undefined, target: string) {
  pulling = null
  if (handle) emit('connect', source, handle, target)
}

function onConnectEnd(event?: MouseEvent | TouchEvent) {
  const from = pulling
  pulling = null
  // конец стрелки тоже начинает соединение от порта источника (проверено мышью: без этого меню открывалось);
  // флаг гаснет здесь же, поэтому залипнуть дольше одного отпускания он не может
  const wasReconnect = reconnecting
  reconnecting = false
  if (!from || !event || props.locked || wasReconnect) return
  const point = pointOf(event)
  if (!point) return
  // для touchend event.target указывает на начало касания, поэтому элемент берётся по точке
  const hit = document.elementFromPoint(point.clientX, point.clientY)
  const onNode = hit?.closest('.vue-flow__node')
  if (onNode) {
    // отпущена на теле ноды, не на порту: соединяем с этой нодой, но не саму с собой
    const id = onNode.getAttribute('data-id')
    if (id && id !== from.node) onConnected(from.node, from.handle, id)
    return
  }
  // над подсказкой, кнопками масштаба или миникартой меню не нужно
  if (!hit?.closest('.vue-flow__pane')) return
  const box = root.value?.getBoundingClientRect()
  if (!box) return
  const at = screenToFlowCoordinate({ x: point.clientX, y: point.clientY })
  emit('connectEmpty', from.node, from.handle, { x: point.clientX - box.left, y: point.clientY - box.top }, [
    Math.round(at.x - NODE_WIDTH / 2),
    Math.round(at.y - NODE_HALF_HEIGHT),
  ])
}

function onNodeClick({ node }: { node: Node }) {
  selectedEdge.value = null
  emit('select', node.id)
}

/** Клик в пустое место снимает выделение стрелки и выбор шага. */
function onPaneClick() {
  selectedEdge.value = null
  emit('deselect')
}

function onDrop(event: DragEvent) {
  const type = event.dataTransfer?.getData('application/x-step-type')
  if (!type || props.locked) return
  const at = screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  emit('drop', type, [Math.round(at.x - NODE_WIDTH / 2), Math.round(at.y - NODE_HALF_HEIGHT)])
}

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
  <div ref="root" class="scenario-graph" @dragover.prevent @drop.prevent="onDrop">
    <VueFlow
      :nodes="nodes"
      :edges="shownEdges"
      :nodes-draggable="!locked"
      :nodes-connectable="!locked"
      :edges-updatable="!locked"
      :elements-selectable="false"
      :delete-key-code="null"
      :min-zoom="0.1"
      :max-zoom="2"
      fit-view-on-init
      @node-click="onNodeClick"
      @edge-click="({ edge }) => (selectedEdge = edge.id)"
      @pane-click="onPaneClick"
      @edge-update-start="reconnecting = true"
      @edge-update-end="onEdgeUpdateEnd"
      @node-drag-stop="({ node }) => emit('move', node.id, [node.position.x, node.position.y])"
      @connect-start="onConnectStart"
      @connect="(c) => onConnected(c.source, c.sourceHandle, c.target)"
      @connect-end="onConnectEnd"
    >
      <template #node-step="props"><StepNode v-bind="props" /></template>
      <template #node-block="props"><BlockNode v-bind="props" /></template>
      <template #node-stub="props"><BlockNode v-bind="props" /></template>
      <template #edge-default="edgeProps">
        <ScenarioEdge v-bind="edgeProps" :locked="locked" @detach="detachSelected" />
      </template>
      <MiniMap :node-color="nodeColor" :width="150" :height="96" aria-label="Миникарта схемы" />
    </VueFlow>

    <div class="zoom">
      <button type="button" aria-label="Уменьшить" @click="zoomOut()">−</button>
      <span>{{ zoomPercent }}</span>
      <button type="button" aria-label="Увеличить" @click="zoomIn()">+</button>
      <button type="button" class="relayout" @click="relayout">Разложить</button>
      <span class="history">
        <button type="button" aria-label="Отменить" title="Отменить (Ctrl+Z)" :disabled="!canUndo" @click="emit('undo')">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M5.5 3 2.5 6l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M3 6h6.5a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
        <button type="button" aria-label="Вернуть" title="Вернуть (Ctrl+Shift+Z)" :disabled="!canRedo" @click="emit('redo')">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10.5 3l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M13 6H6.5a3.5 3.5 0 0 0 0 7H10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
      </span>
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
.zoom > span:not(.history) {
  min-width: 40px;
  text-align: center;
  color: var(--ink-2);
}
.zoom .relayout {
  width: auto;
  padding: 0 10px;
  border-left: 1px solid var(--line);
}
.zoom .history {
  display: flex;
  align-items: center;
  padding-left: 4px;
  border-left: 1px solid var(--line);
}
.zoom .history button {
  display: grid;
  place-items: center;
}
.zoom .history button:disabled {
  color: var(--line-strong);
  cursor: default;
}
</style>

<style>
.scenario-graph .vue-flow__edge-path {
  stroke: var(--port);
  stroke-width: 1.5;
}
.scenario-graph .vue-flow__edge.back .vue-flow__edge-path {
  stroke: var(--line-strong);
  stroke-width: 1;
}
.scenario-graph .vue-flow__edge.back.highlight .vue-flow__edge-path {
  stroke: var(--port);
  stroke-width: 1.5;
}
.scenario-graph .vue-flow__edge.selected .vue-flow__edge-path,
.scenario-graph .vue-flow__edge.back.selected .vue-flow__edge-path {
  stroke: var(--accent);
  stroke-width: 3;
}
/* Выделенная стрелка поднята над нодами только как рисунок: линия и область попадания не принимают
   указатель, карточку под линией можно тянуть, порты и клики работают. Принимает его якорь конца. */
.scenario-graph .vue-flow__edge.selected {
  pointer-events: none;
}
.scenario-graph .vue-flow__edge.selected .vue-flow__edgeupdater {
  pointer-events: all;
}
/* кнопка "×" выше слоя выделенной стрелки */
.scenario-graph .vue-flow__edge-labels {
  z-index: 2;
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
