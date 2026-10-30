import type { Edge, Node } from '@vue-flow/core'
import { storeToRefs } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { useScenarioStore } from '~/stores/scenario.store'
import type { GraphView } from '~/types/scenario'
import { MAIN_VIEW, toFlow, viewTabs } from '~/utils/scenarioGraph'
import { autoLayout, markBackEdges } from '~/utils/scenarioLayout'

/** Сценарий «смотреть схему»: вкладка графа, раскладка dagre, выбор ноды. */
export function useScenarioLayout() {
  const store = useScenarioStore()
  const { scenario, selectedId } = storeToRefs(store)

  const view = ref<GraphView>(MAIN_VIEW)
  const tabs = computed(() => viewTabs(scenario.value))
  const laidOut = shallowRef<{ nodes: Node[]; edges: Edge[] }>({ nodes: [], edges: [] })

  function build(all: boolean) {
    const flow = toFlow(scenario.value, view.value)
    const placed = autoLayout(flow.nodes, flow.edges, all)
    laidOut.value = { nodes: placed, edges: markBackEdges(placed, flow.edges) }
  }

  watch([scenario, view], () => build(false), { immediate: true })

  const nodes = computed(() =>
    laidOut.value.nodes.map((n) => ({ ...n, selected: n.type === 'step' && n.id === selectedId.value })),
  )
  // Обратные рёбра светлые; рёбра выбранной ноды подсвечиваются
  const edges = computed(() =>
    laidOut.value.edges.map((e) =>
      e.class === 'back' && (e.source === selectedId.value || e.target === selectedId.value)
        ? {
            ...e,
            class: 'back highlight',
            markerEnd: typeof e.markerEnd === 'object' ? { ...e.markerEnd, color: '#7c8796' } : e.markerEnd,
          }
        : e,
    ),
  )

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
