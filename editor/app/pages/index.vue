<script setup lang="ts">
import { useLoadScenario } from '~/composables/useLoadScenario'
import { useScenarioLayout } from '~/composables/useScenarioLayout'

const loadScenario = useLoadScenario()
const { tabs, view, nodes, edges, setView, relayout, selectNode } = useScenarioLayout()

const failure = ref<string | null>(null)
onMounted(async () => {
  failure.value = await loadScenario()
})
</script>

<template>
  <GraphTabs :tabs="tabs" :view="view" @select="setView" />
  <p v-if="failure" class="failure" role="alert">{{ failure }}</p>
  <div class="graph">
    <ScenarioGraph :nodes="nodes" :edges="edges" @select="selectNode" @relayout="relayout" />
  </div>
</template>

<style scoped>
.graph {
  flex: 1 1 auto;
  min-height: 0;
}
.failure {
  margin: 0;
  padding: 10px 20px;
  font-size: 13px;
  color: var(--danger);
  background: var(--bg-card);
  border-bottom: 1px solid var(--line);
}
</style>
