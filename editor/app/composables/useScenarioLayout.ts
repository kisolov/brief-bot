import type { Edge, Node } from '@vue-flow/core'
import { storeToRefs } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { useScenarioStore } from '~/stores/scenario.store'
import type { GraphView, Issue } from '~/types/scenario'
import { errorNumbers, locateIssue } from '~/utils/issues'
import { MAIN_VIEW, stepIdsOf, toFlow, viewOfStep, viewTabs } from '~/utils/scenarioGraph'
import { autoLayout, markBackEdges } from '~/utils/scenarioLayout'

/** Что показать после клика по ноде: прокрутить схему к шагу или вывести подсказку. */
export interface NodeOutcome {
  reveal?: string
  hint?: string
}

/** Сценарий «смотреть схему»: вкладка графа, раскладка dagre, выбор ноды, пометки ошибок. */
export function useScenarioLayout() {
  const store = useScenarioStore()
  const { scenario, selectedId, homes, issues } = storeToRefs(store)
  const view = ref<GraphView>(MAIN_VIEW)
  const tabs = computed(() => viewTabs(scenario.value))
  const laidOut = shallowRef<{ nodes: Node[]; edges: Edge[] }>({ nodes: [], edges: [] })

  function build() {
    const flow = toFlow(scenario.value, view.value, homes.value)
    const placed = autoLayout(flow.nodes, flow.edges, false)
    laidOut.value = { nodes: placed, edges: markBackEdges(placed, flow.edges) }
  }
  watch([scenario, view, homes], build, { immediate: true })

  const marks = computed(() => errorNumbers(issues.value))
  const nodes = computed(() =>
    laidOut.value.nodes.map((n) => {
      const isStep = n.type === 'step'
      const numbers = isStep ? marks.value.get(n.id) : undefined
      return {
        ...n,
        selected: isStep && n.id === selectedId.value,
        // перетаскивать и соединять можно только шаги: блоки и заглушки это отражение переходов
        draggable: isStep,
        connectable: isStep,
        data: numbers ? { ...n.data, state: 'error', errorNumbers: numbers } : n.data,
      }
    }),
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

  /** Кнопка «Разложить»: позиции шагов этого вида очищаются, шаги ложатся по раскладке заново. */
  function relayout() {
    store.clearPositions(stepIdsOf(scenario.value, view.value, homes.value))
  }

  /** Клик по ноде: шаг выбирается, блок открывает вкладку, заглушка ведёт туда, куда показывает. */
  function selectNode(id: string): NodeOutcome {
    if (scenario.value.steps[id]) {
      store.select(id)
      return {}
    }
    const clicked = laidOut.value.nodes.find((n) => n.id === id)
    if (clicked?.type === 'block') {
      setView(clicked.data.block)
      return {}
    }
    if (clicked?.data.kind === 'return') {
      return { hint: 'Здесь блок заканчивается: бот возвращается на шаг, указанный при входе в блок.' }
    }
    if (clicked?.data.kind === 'link') {
      const stepId: string = clicked.data.stepId
      view.value = viewOfStep(scenario.value, stepId, homes.value) ?? MAIN_VIEW
      store.select(stepId)
      return { reveal: stepId }
    }
    return { hint: 'Такого шага нет. Выберите другой шаг в панели кнопки.' }
  }

  function deselect() {
    store.select(null)
  }

  /** Клик по ошибке: вкладка с шагом (или блоком) и выбор шага. Ошибка разбора без перехода. */
  function jumpTo(issue: Issue) {
    const where = locateIssue(scenario.value, issue, homes.value)
    if (!where) return
    view.value = where.view
    store.select(where.stepId)
  }

  return { view, tabs, nodes, edges, setView, relayout, selectNode, deselect, jumpTo }
}
