<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useAddStep } from '~/composables/useAddStep'
import { useConnectSteps } from '~/composables/useConnectSteps'
import { useEditorHotkeys } from '~/composables/useEditorHotkeys'
import { useEditStep } from '~/composables/useEditStep'
import { useLoadScenario } from '~/composables/useLoadScenario'
import { useScenarioLayout } from '~/composables/useScenarioLayout'
import { useTargetMenu } from '~/composables/useTargetMenu'
import { CONFLICT_TEXT } from '~/errors/presentation'
import { useScenarioStore } from '~/stores/scenario.store'
import type { Issue, StepType } from '~/types/scenario'
import { issueItems } from '~/utils/issues'

const loadScenario = useLoadScenario()
const { tabs, view, nodes, edges, setView, relayout, selectNode, deselect, jumpTo } = useScenarioLayout()
const { moveStep } = useEditStep()
const { connectNodes: connectGraphNodes, detach: detachGraphEdge } = useConnectSteps()
const addStep = useAddStep()
const targetMenu = useTargetMenu(view)
const { scenario, selectedId, issues, activeVersion, conflict, notice, canUndo, canRedo } = storeToRefs(useScenarioStore())
const router = useRouter()
const scenarioStore = useScenarioStore()

const failure = ref<string | null>(null)
const graph = ref<{ visibleCenter: () => [number, number]; reveal: (id: string) => void; clearEdge: () => void } | null>(null)

const items = computed(() => issueItems(scenario.value, issues.value))

onMounted(async () => {
  failure.value = await loadScenario()
})

/** Клик по палитре: шаг ложится в видимой части холста. */
function addFromPalette(type: StepType) {
  addStep(type, { pos: graph.value?.visibleCenter(), view: view.value })
}

/** Бросок из палитры: шаг ложится там, где отпустили. */
function dropStep(type: string, pos: [number, number]) {
  addStep(type as StepType, { pos, view: view.value })
}

const hint = ref<string | null>(null)
let hintTimer: ReturnType<typeof setTimeout> | null = null

const nodeById = (id: string) => nodes.value.find((n) => n.id === id)

/** Стрелка доведена до ноды: шаг, карточка блока или заглушка. Если так соединить нельзя, подсказка. */
function connectNodes(source: string, handle: string, target: string) {
  const from = nodeById(source)
  const to = nodeById(target)
  if (!from || !to) return
  const text = connectGraphNodes(from, handle, to)
  if (text) showHint(text)
}

/** Стрелка отсоединена; подсказка только при отказе (конфликт версий), иначе результат виден на схеме. */
function detachEdge(source: string, handle: string) {
  const from = nodeById(source)
  if (!from) return
  const text = detachGraphEdge(from, handle)
  if (text) showHint(text)
}

/** Стрелка отпущена в пустом месте: меню целей в этой точке. */
function openTargetMenu(source: string, handle: string, at: { x: number; y: number }, pos: [number, number]) {
  const from = nodeById(source)
  if (from) targetMenu.open(from, handle, at, pos)
}

const { undo, redo } = useEditorHotkeys({
  menuOpen: () => Boolean(targetMenu.state.value),
  escape: () => {
    // закрытие меню не снимает выбор шага
    if (targetMenu.state.value) return targetMenu.close()
    deselect()
    graph.value?.clearEdge()
  },
  restored: () => graph.value?.clearEdge(),
  notify: (text) => showHint(text),
  sessionExpired: () => {
    scenarioStore.expireSession()
    void router.replace('/login')
  },
})

function pickTarget(value: string) {
  const text = targetMenu.pick(value)
  if (text) showHint(text)
}

function showHint(text: string) {
  hint.value = text
  if (hintTimer) clearTimeout(hintTimer)
  hintTimer = setTimeout(() => (hint.value = null), 5000)
}

/** Клик по ноде схемы: шаг, общий блок или заглушка. */
function openNode(id: string) {
  const { reveal, hint: text } = selectNode(id)
  if (reveal) graph.value?.reveal(reveal)
  if (text) showHint(text)
}

/** Клик по ошибке: вкладка, выбранный шаг и схема, прокрученная к нему. */
function openIssue(issue: Issue) {
  jumpTo(issue)
  if (scenario.value.steps[issue.stepId]) graph.value?.reveal(issue.stepId)
}

function goToStep(stepId: string) {
  openIssue({ code: 'link', stepId, optionId: null, message: '' })
}

function reload() {
  window.location.reload()
}
</script>

<template>
  <GraphTabs :tabs="tabs" :view="view" @select="setView" />
  <p v-if="failure" class="banner" role="alert">{{ failure }}</p>
  <p v-if="conflict" class="banner" role="alert">
    {{ CONFLICT_TEXT }}
    <button type="button" class="reload" @click="reload">Обновить страницу</button>
  </p>
  <p v-if="notice" class="banner" role="alert">{{ notice }}</p>
  <div class="work">
    <StepPalette :disabled="conflict" @add="addFromPalette" />
    <div class="graph">
      <GraphHint :text="hint" />
      <ScenarioGraph
        ref="graph"
        :nodes="nodes"
        :edges="edges"
        :view="view"
        :locked="conflict"
        :can-undo="canUndo"
        :can-redo="canRedo"
        @select="openNode"
        @deselect="deselect"
        @relayout="relayout"
        @move="moveStep"
        @connect="connectNodes"
        @detach="detachEdge"
        @connect-empty="openTargetMenu"
        @drop="dropStep"
        @undo="undo"
        @redo="redo"
      />
      <TargetMenu
        v-if="targetMenu.state.value"
        :x="targetMenu.state.value.at.x"
        :y="targetMenu.state.value.at.y"
        :choices="targetMenu.choices.value"
        @pick="pickTarget"
        @close="targetMenu.close"
      />
    </div>
    <StepPanel v-if="selectedId" :view="view" @all-errors="deselect" @goto="goToStep" />
    <ErrorsPanel v-else-if="items.length" :items="items" :version="activeVersion" @jump="openIssue" />
  </div>
</template>

<style scoped>
.work {
  /* высота от экрана, а не от содержимого: длинная панель прокручивается сама и не сдвигает схему */
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  align-items: stretch;
}
.graph {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
}
.banner {
  margin: 0;
  padding: 10px 20px;
  font-size: 13px;
  color: var(--danger);
  background: var(--bg-card);
  border-bottom: 1px solid var(--line);
}
.reload {
  font: inherit;
  margin-left: 12px;
  padding: 4px 10px;
  border: 1px solid var(--danger);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--danger);
  cursor: pointer;
}
</style>
