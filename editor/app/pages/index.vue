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
function connectNodes(source: string, handle: string, target: string) {
  if (scenario.value.steps[source] && scenario.value.steps[target]) connect(source, handle, target)
}

/** Клик по ошибке: вкладка, выбранный шаг и схема, прокрученная к нему. */
function openIssue(issue: Issue) {
  jumpTo(issue)
  if (scenario.value.steps[issue.stepId]) graph.value?.reveal(issue.stepId)
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
      <ScenarioGraph
        ref="graph"
        :nodes="nodes"
        :edges="edges"
        :view="view"
        :locked="conflict"
        @select="selectNode"
        @deselect="deselect"
        @relayout="relayout"
        @move="moveStep"
        @connect="connectNodes"
        @drop="dropStep"
      />
    </div>
    <StepPanel v-if="selectedId" :view="view" @all-errors="deselect" />
    <ErrorsPanel v-else-if="items.length" :items="items" :version="activeVersion" @jump="openIssue" />
  </div>
</template>

<style scoped>
.work {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: stretch;
}
.graph {
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
