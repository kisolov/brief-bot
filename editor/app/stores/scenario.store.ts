import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useContainer } from '~/container'
import { DraftConflict, ScenarioInvalid } from '~/errors/scenario'
import { NEXT_HANDLE } from '~/types/scenario'
import type { GraphView, Issue, Option, Scenario, Step, StepType, Target, When } from '~/types/scenario'
import { convertStep } from '~/utils/stepType'

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
const ID_LENGTH = 8

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
  /** Вид, где создан шаг без входящего перехода: пока шаг не подключён, он показывается там. */
  const homes = ref<Record<string, GraphView>>({})
  /** Счётчик правок: автосохранение следит за ним. */
  const edits = ref(0)
  const dirty = ref(false)
  const saving = ref(false)
  const savedAt = ref<Date | null>(null)
  const saveFailed = ref(false)
  /** Черновик изменён в другой вкладке: правки заблокированы до обновления страницы. */
  const conflict = ref(false)
  const publishing = ref(false)
  /** Сообщение о сбое вне ошибок сценария, например о сети. */
  const notice = ref<string | null>(null)

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
    homes.value = {}
    edits.value = 0
    dirty.value = false
    saveFailed.value = false
    conflict.value = false
    notice.value = null
    loaded.value = true
  }

  /** Правка принята: счётчик будит автосохранение. После конфликта правки не принимаются. */
  function touch(): boolean {
    if (conflict.value) return false
    edits.value++
    dirty.value = true
    return true
  }

  function select(id: string | null): void {
    selectedId.value = id
  }

  function setIssues(next: Issue[]): void {
    issues.value = next
  }

  function setNotice(text: string | null): void {
    notice.value = text
  }

  function updateStep(id: string, patch: Partial<Step>): void {
    const step = steps.value[id]
    if (!step || !touch()) return
    steps.value = { ...steps.value, [id]: applyPatch(step, patch) }
  }

  /** «Разложить»: шаги без `pos` ложатся по раскладке, поэтому позиции вида очищаются. */
  function clearPositions(ids: string[]): void {
    const next = { ...steps.value }
    let changed = false
    for (const id of ids) {
      const step = next[id]
      if (!step || step.pos === undefined) continue
      next[id] = applyPatch(step, { pos: undefined })
      changed = true
    }
    if (changed && touch()) steps.value = next
  }

  function addStep(type: StepType, afterId?: string, place?: { pos?: [number, number]; view?: GraphView }): string {
    const id = freshId('s_', new Set(Object.keys(steps.value)))
    if (!touch()) return id
    const step: Step = { type, text: '' }
    const after = afterId ? steps.value[afterId] : undefined
    if (after && typeof after.next === 'string') {
      step.next = after.next
    }
    if (place?.pos) step.pos = place.pos
    steps.value = { ...steps.value, [id]: step }
    if (place?.view && place.view !== 'main') homes.value = { ...homes.value, [id]: place.view }
    if (after && afterId) steps.value = { ...steps.value, [afterId]: { ...after, next: id } }
    selectedId.value = id
    return id
  }

  /** Смена типа с чисткой того, чего новый тип не показывает; потери считает `convertStep`. */
  function changeStepType(id: string, type: StepType): boolean {
    const step = steps.value[id]
    if (!step || step.type === type || !touch()) return false
    steps.value = { ...steps.value, [id]: convertStep(step, type).step }
    return true
  }

  /** Блоки, чей первый шаг это `id`: удаление такого шага ломает блок. */
  function blocksStartingAt(id: string): string[] {
    return Object.entries(blocks.value)
      .filter(([, first]) => first === id)
      .map(([name]) => name)
  }

  /** Начальный шаг не удаляется. Возвращает, удалён ли шаг. */
  function removeStep(id: string): boolean {
    if (id === entry.value || !steps.value[id] || !touch()) return false
    const rest = { ...steps.value }
    delete rest[id]
    for (const [sid, step] of Object.entries(rest)) {
      rest[sid] = detach(step, id)
    }
    steps.value = rest
    blocks.value = Object.fromEntries(Object.entries(blocks.value).filter(([, first]) => first !== id))
    const { [id]: _gone, ...otherHomes } = homes.value
    homes.value = otherHomes
    if (selectedId.value === id) selectedId.value = null
    return true
  }

  function addOption(stepId: string): string | null {
    const step = steps.value[stepId]
    if (!step || !touch()) return null
    const options = step.options ?? []
    const id = freshId('o_', new Set(options.map((o) => o.id)))
    steps.value = { ...steps.value, [stepId]: { ...step, options: [...options, { id, label: 'Новая кнопка' }] } }
    return id
  }

  /** Ссылка на сайт и переход на шаг взаимоисключают друг друга: побеждает то, что задано сейчас. */
  function updateOption(stepId: string, optionId: string, patch: Partial<Option>): void {
    const step = steps.value[stepId]
    if (!step || !touch()) return
    const options = (step.options ?? []).map((o) => {
      if (o.id !== optionId) return o
      const rule: Partial<Option> = { ...patch }
      if (typeof rule.url === 'string') rule.next = undefined
      else if (rule.next !== undefined) rule.url = undefined
      return applyPatch(o, rule)
    })
    steps.value = { ...steps.value, [stepId]: { ...step, options } }
  }

  /** Кнопка уходит и из условий показа, что на неё ссылались. */
  function removeOption(stepId: string, optionId: string): void {
    const step = steps.value[stepId]
    if (!step || !touch()) return
    const options = (step.options ?? []).filter((o) => o.id !== optionId)
    const next: Record<string, Step> = { ...steps.value, [stepId]: { ...step, options } }
    for (const [sid, other] of Object.entries(next)) {
      next[sid] = scrubWhen(other, (w) => (w.step === stepId ? withoutAnswer(w, optionId) : w))
    }
    steps.value = next
  }

  /** `handle` равен `NEXT_HANDLE`, когда выход принадлежит самому шагу; без `target` переход снимается. */
  function connect(sourceStep: string, handle: string, target: Target | undefined): void {
    if (!steps.value[sourceStep]) return
    if (handle === NEXT_HANDLE) {
      updateStep(sourceStep, { next: target })
      return
    }
    updateOption(sourceStep, handle, { next: target })
  }

  /** Данные для `saveDraft`: исходный JSON плюс правки, без потери незнакомых полей. */
  function toDraftData(): Scenario {
    return JSON.parse(JSON.stringify(scenario.value)) as Scenario
  }

  // Сохранения идут строго по очереди: правка во время запроса уходит после ответа с новой ревизией.
  let queue: Promise<void> = Promise.resolve()

  function flush(): Promise<void> {
    const run = queue.catch(() => undefined).then(persist)
    queue = run
    return run
  }

  async function persist(): Promise<void> {
    if (!dirty.value || conflict.value) return
    const stamp = edits.value
    const data = toDraftData()
    saving.value = true
    try {
      revision.value = await repository.saveDraft(data, revision.value)
      // правка, пришедшая во время запроса, остаётся несохранённой
      if (edits.value === stamp) dirty.value = false
      saveFailed.value = false
      savedAt.value = new Date()
    } catch (e) {
      if (e instanceof DraftConflict) conflict.value = true
      else saveFailed.value = true
      throw e
    } finally {
      saving.value = false
    }
  }

  /**
   * Дожимает несохранённое, потом публикует и возвращает номер версии.
   * Невалидный сценарий кладёт `issues` и бросает `ScenarioInvalid`; без ответа вернётся `null`.
   */
  async function publish(): Promise<number | null> {
    if (publishing.value) return null
    if (conflict.value) throw new DraftConflict()
    publishing.value = true
    notice.value = null
    try {
      await flush()
      const version = await repository.publish()
      activeVersion.value = version
      issues.value = []
      return version
    } catch (e) {
      if (e instanceof ScenarioInvalid) {
        issues.value = e.issues.length
          ? e.issues
          : [{ code: 'malformed', stepId: '', optionId: null, message: 'Сценарий не прошёл проверку.' }]
      }
      throw e
    } finally {
      publishing.value = false
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
    homes,
    edits,
    dirty,
    saving,
    savedAt,
    saveFailed,
    conflict,
    publishing,
    notice,
    scenario,
    load,
    select,
    setIssues,
    setNotice,
    updateStep,
    changeStepType,
    clearPositions,
    addStep,
    blocksStartingAt,
    removeStep,
    addOption,
    updateOption,
    removeOption,
    connect,
    flush,
    publish,
    toDraftData,
  }
})

/** Случайный id из латиницы и цифр, которого ещё нет среди занятых. */
function freshId(prefix: string, taken: ReadonlySet<string>): string {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(ID_LENGTH))
    const id = prefix + Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('')
    if (!taken.has(id)) return id
  }
}

/** Неизменяемое слияние: ключ со значением `undefined` убирается из объекта. */
function applyPatch<T extends object>(base: T, patch: Partial<T>): T {
  const merged = { ...base, ...patch } as Record<string, unknown>
  for (const key of Object.keys(patch)) {
    if ((patch as Record<string, unknown>)[key] === undefined) delete merged[key]
  }
  return merged as T
}

function withoutAnswer(w: When, optionId: string): When | undefined {
  const any = w.any.filter((x) => x !== optionId)
  const none = (w.none ?? []).filter((x) => x !== optionId)
  // без единой отметки "если отмечено" и без "не отмечено" условие теряет смысл
  if (!any.length && !none.length) return undefined
  return { ...w, any, ...(w.none ? { none } : {}) }
}

/** Применяет `fn` к условию шага и к условиям его кнопок; `undefined` снимает условие. */
function scrubWhen(step: Step, fn: (w: When) => When | undefined): Step {
  let out = step
  if (step.when) out = applyPatch(out, { when: fn(step.when) })
  if (step.options?.some((o) => o.when)) {
    out = { ...out, options: step.options.map((o) => (o.when ? applyPatch(o, { when: fn(o.when) }) : o)) }
  }
  return out
}

/** Убирает из шага все ссылки на удалённый `gone`: переходы, возврат, условия показа. */
function detach(step: Step, gone: string): Step {
  const out: Step = { ...scrubWhen(step, (w) => (w.step === gone ? undefined : w)) }
  if (out.back_to === gone) delete out.back_to
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
