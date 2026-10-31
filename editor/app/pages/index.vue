<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useAddStep } from '~/composables/useAddStep'
import { useConnectSteps } from '~/composables/useConnectSteps'
import { useEditStep } from '~/composables/useEditStep'
import { useLoadScenario } from '~/composables/useLoadScenario'
import { useScenarioLayout } from '~/composables/useScenarioLayout'
import { CONFLICT_TEXT } from '~/errors/presentation'
import { useScenarioStore } from '~/stores/scenario.store'
import type { Issue, StepType } from '~/types/scenario'
import { issueItems } from '~/utils/issues'

const loadScenario = useLoadScenario()
const { tabs, view, nodes, edges, setView, relayout, selectNode, deselect, jumpTo } = useScenarioLayout()
const { moveStep } = useEditStep()
const { connect } = useConnectSteps()
const addStep = useAddStep()
const { scenario, selectedId, issues, activeVersion, conflict, notice } = storeToRefs(useScenarioStore())

const failure = ref<string | null>(null)
const graph = ref<{ visibleCenter: () => [number, number]; reveal: (id: string) => void } | null>(null)

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

/** Стрелку можно вести только от шага к шагу: блоки и заглушки это отражение переходов. */
const hint = ref<string | null>(null)
let hintTimer: ReturnType<typeof setTimeout> | null = null

function connectNodes(source: string, handle: string, target: string) {
  if (!scenario.value.steps[source]) return
  if (scenario.value.steps[target]) return connect(source, handle, target)
  // блок и заглушка выбираются в списке панели: молчание выглядело бы как поломка
  showHint('Выберите шаг в панели справа.')
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
        @select="openNode"
        @deselect="deselect"
        @relayout="relayout"
        @move="moveStep"
        @connect="connectNodes"
        @drop="dropStep"
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
