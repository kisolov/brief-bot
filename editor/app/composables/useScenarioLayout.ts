import type { Edge, Node } from '@vue-flow/core'
import { storeToRefs } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { useScenarioStore } from '~/stores/scenario.store'
import type { GraphView } from '~/types/scenario'
import { MAIN_VIEW, toFlow, viewTabs } from '~/utils/scenarioGraph'
import { autoLayout } from '~/utils/scenarioLayout'

/** Сценарий «смотреть схему»: вкладка графа, раскладка dagre, выбор ноды. */
export function useScenarioLayout() {
  const store = useScenarioStore()
  const { scenario, selectedId } = storeToRefs(store)

  const view = ref<GraphView>(MAIN_VIEW)
  const tabs = computed(() => viewTabs(scenario.value))
  const laidOut = shallowRef<{ nodes: Node[]; edges: Edge[] }>({ nodes: [], edges: [] })

  function build(all: boolean) {
    const flow = toFlow(scenario.value, view.value)
    laidOut.value = { nodes: autoLayout(flow.nodes, flow.edges, all), edges: flow.edges }
  }

  watch([scenario, view], () => build(false), { immediate: true })

  const nodes = computed(() =>
    laidOut.value.nodes.map((n) => ({ ...n, selected: n.type === 'step' && n.id === selectedId.value })),
  )
  const edges = computed(() => laidOut.value.edges)

  function setView(next: GraphView) {
    view.value = next
    store.select(null)
  }

  /** Кнопка «Разложить»: перекладывает всё, включая шаги с сохранённой позицией. */
  function relayout() {
    build(true)
  }

  function selectNode(id: string) {
    if (scenario.value.steps[id]) store.select(id)
  }

  return { view, tabs, nodes, edges, setView, relayout, selectNode }
}
