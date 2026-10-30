import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useContainer } from '~/container'
import { NEXT_HANDLE } from '~/types/scenario'
import type { Issue, Scenario, Step, StepType, Target } from '~/types/scenario'

const STEP_ID_LIMIT = 24

/** Сервис сценария: хранит черновик как есть и отдаёт правки через действия. */
export const useScenarioStore = defineStore('scenario', () => {
  const repository = useContainer().scenarioRepository

  const entry = ref('')
  const blocks = ref<Record<string, string>>({})
  const steps = ref<Record<string, Step>>({})
  /** Незнакомые поля верхнего уровня: возвращаются при сохранении нетронутыми. */
  const extra = ref<Record<string, unknown>>({})
  const selectedId = ref<string | null>(null)
  const revision = ref(0)
  const issues = ref<Issue[]>([])
  const activeVersion = ref<number | null>(null)
  const loaded = ref(false)

  const scenario = computed<Scenario>(() => ({
    ...extra.value,
    entry: entry.value,
    blocks: blocks.value,
    steps: steps.value,
  }))

  async function load(): Promise<void> {
    const [draft, versions] = await Promise.all([repository.getDraft(), repository.getVersions()])
    // черновик может быть невалидным: пустые поля не должны ронять экран
    const { entry: e, blocks: b, steps: s, ...rest } = (draft.data ?? {}) as Partial<Scenario>
    entry.value = typeof e === 'string' ? e : ''
    blocks.value = b ?? {}
    steps.value = s ?? {}
    extra.value = rest
    revision.value = draft.revision
    activeVersion.value = versions.find((v) => v.active)?.number ?? null
    selectedId.value = null
    issues.value = []
    loaded.value = true
  }

  function select(id: string | null): void {
    selectedId.value = id
  }

  function setIssues(next: Issue[]): void {
    issues.value = next
  }

  function updateStep(id: string, patch: Partial<Step>): void {
    const step = steps.value[id]
    if (!step) return
    const merged: Step = { ...step, ...patch }
    for (const key of Object.keys(patch)) {
      if (patch[key] === undefined) delete merged[key]
    }
    steps.value = { ...steps.value, [id]: merged }
  }

  function addStep(type: StepType, afterId?: string): string {
    const id = freeId()
    const step: Step = { type, text: '' }
    const after = afterId ? steps.value[afterId] : undefined
    if (after && typeof after.next === 'string') {
      step.next = after.next
    }
    steps.value = { ...steps.value, [id]: step }
    if (after && afterId) updateStep(afterId, { next: id })
    selectedId.value = id
    return id
  }

  function removeStep(id: string): void {
    const rest = { ...steps.value }
    delete rest[id]
    for (const [sid, step] of Object.entries(rest)) {
      rest[sid] = detach(step, id)
    }
    steps.value = rest
    blocks.value = Object.fromEntries(Object.entries(blocks.value).filter(([, first]) => first !== id))
    if (selectedId.value === id) selectedId.value = null
  }

  /** `optionId` равен `NEXT_HANDLE`, когда выход принадлежит самому шагу. */
  function connect(sourceStep: string, optionId: string, target: Target): void {
    const step = steps.value[sourceStep]
    if (!step) return
    if (optionId === NEXT_HANDLE) {
      updateStep(sourceStep, { next: target })
      return
    }
    const options = (step.options ?? []).map((o) => (o.id === optionId ? { ...o, next: target } : o))
    updateStep(sourceStep, { options })
  }

  /** Данные для `saveDraft`: исходный JSON плюс правки, без потери незнакомых полей. */
  function toDraftData(): Scenario {
    return JSON.parse(JSON.stringify(scenario.value)) as Scenario
  }

  function freeId(): string {
    for (let n = Object.keys(steps.value).length + 1; ; n++) {
      const id = `step_${n}`.slice(0, STEP_ID_LIMIT)
      if (!(id in steps.value)) return id
    }
  }

  return {
    steps,
    entry,
    blocks,
    selectedId,
    revision,
    issues,
    activeVersion,
    loaded,
    scenario,
    load,
    select,
    setIssues,
    updateStep,
    addStep,
    removeStep,
    connect,
    toDraftData,
  }
})

function detach(step: Step, gone: string): Step {
  const out: Step = { ...step }
  setTarget(out, cleanTarget(out.next, gone))
  if (out.options) {
    out.options = out.options.map((o) => {
      const next = cleanTarget(o.next, gone)
      const copy = { ...o }
      setTarget(copy, next)
      return copy
    })
  }
  return out
}

/** Убирает ссылку на удалённый шаг: у входа в блок остаётся блок без `then`. */
function cleanTarget(target: Target | undefined, gone: string): Target | undefined {
  if (target === undefined) return undefined
  if (typeof target === 'string') return target === gone ? undefined : target
  if (target.then !== gone) return target
  return { call: target.call }
}

function setTarget(holder: { next?: Target }, target: Target | undefined): void {
  if (target === undefined) delete holder.next
  else holder.next = target
}
