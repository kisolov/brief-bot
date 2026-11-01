import { clearThen, dropBlockCards, dropCard, isPlaced, putCard, renameCards, retargetCard } from '~/utils/cardPlaces'
import type { CardPlaces } from '~/utils/cardPlaces'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, toRaw } from 'vue'
import { useContainer } from '~/container'
import { SessionExpired } from '~/errors/base'
import { CONFLICT_TEXT } from '~/errors/presentation'
import { DraftConflict, RollbackNotRefreshed, ScenarioInvalid } from '~/errors/scenario'
import { NEXT_HANDLE, RETURN_TARGET } from '~/types/scenario'
import type { GraphView, Issue, Option, Scenario, Step, StepType, Target, VersionInfo, When } from '~/types/scenario'
import { blockNameError, blocksStartingAt, isCallTo, nextStepOnTab, ownBlockSteps, removeRefusal } from '~/utils/blocks'
import { MAIN_VIEW } from '~/utils/scenarioGraph'
import { settleSteps } from '~/utils/scenarioLayout'
import { convertStep } from '~/utils/stepType'

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
const ID_LENGTH = 8
/** Пустой текст бот не отправит: шаг сразу получает черновой. */
const NEW_STEP_TEXT = 'Новый шаг'
/** Место первого шага нового блока: вкладка пуста, ориентироваться не на что. */
const FIRST_STEP_POS: [number, number] = [24, 24]
/** Сколько правок помнит отмена. */
export const HISTORY_LIMIT = 100
/** Правки текста в одном поле, идущие чаще, чем раз в столько мс, сливаются в один шаг отмены. */
export const MERGE_WINDOW_MS = 800
/** Поля, где правка это набор текста: только они сливаются в один шаг отмены. */
const TYPED_STEP_FIELDS = ['text', 'key', 'done_label']
const TYPED_OPTION_FIELDS = ['label', 'url', 'input']

/**
 * Состояние, которое возвращает отмена. Объекты внутри не копируются: store только заменяет их целиком
 * и никогда не правит на месте, поэтому снимок в стеке остаётся таким, каким был.
 */
interface Snapshot {
  entry: string
  blocks: Record<string, string>
  steps: Record<string, Step>
  extra: Record<string, unknown>
}

/** Итог правки блока: новое имя или текст ошибки рядом с полем. */
export type BlockOutcome = { ok: true; name: string; stepId?: string } | { ok: false; error: string }

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
  const versions = ref<VersionInfo[]>([])
  /** Черновик известно равен активной версии: сразу после публикации или отката, до первой правки. */
  const draftMatchesActive = ref(false)
  const loaded = ref(false)
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

  /** Стеки отмены и возврата; в памяти страницы, после перезагрузки истории нет. */
  const past = shallowRef<Snapshot[]>([])
  const future = shallowRef<Snapshot[]>([])
  const canUndo = computed(() => !conflict.value && past.value.length > 0)
  const canRedo = computed(() => !conflict.value && future.value.length > 0)
  // слияние набора текста: ключ поля последней записанной правки и время правки
  let mergeKey: string | null = null
  let mergeAt = 0
  // внутри `batch` записывается только первая правка
  let batchDepth = 0
  let batchRecorded = false

  /** Откат заменит черновик: подтверждение нужно, если есть правки или совпадение с версией неизвестно. */
  const needsRollbackConfirm = computed(() => dirty.value || saving.value || !draftMatchesActive.value)

  /** Список версий и бейдж «В боте»: не зависит от того, открыта ли схема. */
  async function loadVersions(): Promise<void> {
    const mine = ++versionsRequest
    const list = await repository.getVersions()
    // ответ опоздал: за это время ушёл более новый запрос
    if (mine === versionsRequest) applyVersions(list)
  }

  /** Счётчик запросов списка версий: применяется только ответ самого свежего. */
  let versionsRequest = 0

  function applyVersions(list: VersionInfo[]): void {
    versions.value = list
    activeVersion.value = list.find((v) => v.active)?.number ?? null
  }

  async function load(): Promise<void> {
    const mine = ++versionsRequest
    const [draft, list] = await Promise.all([repository.getDraft(), repository.getVersions()])
    // черновик может быть невалидным: пустые поля не должны ронять экран
    const { entry: e, blocks: b, steps: s, ...rest } = (draft.data ?? {}) as Partial<Scenario>
    entry.value = typeof e === 'string' ? e : ''
    blocks.value = b ?? {}
    // простановка не правка: без истории и `edits`, в черновик уйдёт со следующим сохранением
    steps.value = settleSteps({ entry: entry.value, blocks: blocks.value, steps: s ?? {} })
    extra.value = rest
    revision.value = draft.revision
    if (mine === versionsRequest) applyVersions(list)
    draftMatchesActive.value = false
    selectedId.value = null
    issues.value = []
    resetHistory()
    edits.value = 0
    dirty.value = false
    saveFailed.value = false
    conflict.value = false
    notice.value = null
    loaded.value = true
  }

  function snapshot(): Snapshot {
    return {
      entry: entry.value,
      blocks: toRaw(blocks.value),
      steps: toRaw(steps.value),
      extra: toRaw(extra.value),
    }
  }

  function resetHistory(): void {
    past.value = []
    future.value = []
    mergeKey = null
  }

  /** Кладёт состояние до правки в стек отмены. `merge` называет поле, набор текста в котором сливается. */
  function record(merge?: string): void {
    if (future.value.length) future.value = []
    const now = Date.now()
    if (batchDepth > 0) {
      mergeKey = null
      if (batchRecorded) return
      batchRecorded = true
    } else if (merge && merge === mergeKey && now - mergeAt <= MERGE_WINDOW_MS) {
      mergeAt = now
      return
    } else {
      mergeKey = merge ?? null
      mergeAt = now
    }
    past.value = [...past.value, snapshot()].slice(-HISTORY_LIMIT)
  }

  /** Составное действие (несколько вызовов store) это один шаг отмены. */
  function batch<T>(fn: () => T): T {
    batchDepth++
    try {
      return fn()
    } finally {
      batchDepth--
      if (batchDepth === 0) {
        batchRecorded = false
        mergeKey = null
      }
    }
  }

  /** Переносит состояние из одного стека в другой; после конфликта и при пустом стеке ничего не делает. */
  function travel(from: typeof past, to: typeof past): boolean {
    const target = from.value.at(-1)
    if (conflict.value || !target) return false
    to.value = [...to.value, snapshot()].slice(-HISTORY_LIMIT)
    from.value = from.value.slice(0, -1)
    entry.value = target.entry
    blocks.value = target.blocks
    steps.value = target.steps
    extra.value = target.extra
    if (selectedId.value && !steps.value[selectedId.value]) selectedId.value = null
    mergeKey = null
    // как обычная правка: будит автосохранение, но историю не трогает
    edits.value++
    dirty.value = true
    draftMatchesActive.value = false
    return true
  }

  function undo(): boolean {
    return travel(past, future)
  }

  function redo(): boolean {
    return travel(future, past)
  }

  /** Правка принята: счётчик будит автосохранение. После конфликта правки не принимаются. */
  function touch(merge?: string): boolean {
    if (conflict.value) return false
    record(merge)
    edits.value++
    dirty.value = true
    draftMatchesActive.value = false
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
    if (!step) return
    const next = applyPatch(step, patch)
    // правка без изменений не кладёт снимок и не стирает возврат
    if (isSame(step, next) || !touch(typedKey(`step:${id}`, patch, TYPED_STEP_FIELDS))) return
    steps.value = { ...steps.value, [id]: next }
  }

  /** «Разложить»: новые позиции шагов одним шагом отмены; без изменений правки нет. */
  function setPositions(places: Record<string, [number, number]>): void {
    const next = { ...steps.value }
    let changed = false
    for (const [id, pos] of Object.entries(places)) {
      const step = next[id]
      if (!step || isSame(step.pos, pos)) continue
      next[id] = { ...step, pos }
      changed = true
    }
    if (changed && touch()) steps.value = next
  }

  function addStep(type: StepType, afterId?: string, place?: { pos?: [number, number]; view?: GraphView }): string {
    const id = freshId('s_', new Set(Object.keys(steps.value)))
    if (!touch()) return id
    const step: Step = { type, text: NEW_STEP_TEXT }
    const after = afterId ? steps.value[afterId] : undefined
    if (after && typeof after.next === 'string') {
      step.next = after.next
    }
    if (place?.pos) step.pos = place.pos
    if (place?.view && place.view !== MAIN_VIEW) step.tab = place.view
    steps.value = { ...steps.value, [id]: step }
    if (after && afterId) steps.value = { ...steps.value, [afterId]: { ...after, next: id } }
    selectedId.value = id
    return id
  }

  /** Смена типа с чисткой того, чего новый тип не показывает; потери считает `convertStep`. */
  function changeStepType(id: string, type: StepType): boolean {
    const step = steps.value[id]
    if (!step || step.type === type || !touch()) return false
    const converted = convertStep(step, type).step
    const next: Record<string, Step> = { ...steps.value, [id]: converted }
    // Без кнопок условия на ответы этого шага повисли бы: ответов у него больше нет.
    if (step.options?.length && !converted.options) {
      for (const [sid, other] of Object.entries(next)) {
        if (sid !== id) next[sid] = scrubWhen(other, (w) => (w.step === id ? undefined : w))
      }
    }
    steps.value = next
    return true
  }

  /**
   * Начальный шаг не удаляется. Блок без первого шага не остаётся: его получает следующий подключённый
   * шаг, а если такого нет, удаление отклоняется. Возвращает, удалён ли шаг.
   */
  function removeStep(id: string): boolean {
    if (!steps.value[id] || removeRefusal(scenario.value, id) !== null || !touch()) return false
    const owners = blocksStartingAt(scenario.value, id)
    if (owners.length) {
      const heir = nextStepOnTab(scenario.value, id)!
      blocks.value = { ...blocks.value, ...Object.fromEntries(owners.map((name) => [name, heir])) }
    }
    dropSteps([id])
    return true
  }

  /** Убирает шаги и все ссылки на них: переходы, возврат, условия показа. */
  function dropSteps(ids: Iterable<string>): void {
    const gone = new Set(ids)
    gone.delete(entry.value)
    const rest: Record<string, Step> = {}
    for (const [sid, step] of Object.entries(steps.value)) {
      if (gone.has(sid)) continue
      let cleaned = step
      for (const id of gone) cleaned = detach(cleaned, id)
      rest[sid] = cleaned
    }
    steps.value = rest
    setCards(clearThen(cardPlaces(), gone))
    if (selectedId.value && gone.has(selectedId.value)) selectedId.value = null
  }

  /** Новый общий блок: первый шаг «Новый шаг» сразу возвращает назад и стоит на вкладке блока. */
  function addBlock(raw: string): BlockOutcome {
    const error = blockNameError(scenario.value, raw)
    if (error) return { ok: false, error }
    if (!touch()) return { ok: false, error: CONFLICT_TEXT }
    const name = raw.trim()
    const stepId = freshId('s_', new Set(Object.keys(steps.value)))
    steps.value = {
      ...steps.value,
      [stepId]: { type: 'info', text: NEW_STEP_TEXT, next: RETURN_TARGET, tab: name, pos: FIRST_STEP_POS },
    }
    blocks.value = { ...blocks.value, [name]: stepId }
    selectedId.value = stepId
    return { ok: true, name, stepId }
  }

  /** Ключ `blocks`, все `call` на него и `tab` шагов меняются разом; блоки остаются в прежнем порядке. */
  function renameBlock(old: string, raw: string): BlockOutcome {
    if (blocks.value[old] === undefined) return { ok: false, error: 'Такого блока нет.' }
    const error = blockNameError(scenario.value, raw, old)
    if (error) return { ok: false, error }
    const name = raw.trim()
    // выбранный шаг возвращается, чтобы смена вкладки его не сбросила
    if (name === old) return { ok: true, name, stepId: selectedId.value ?? undefined }
    if (!touch()) return { ok: false, error: CONFLICT_TEXT }
    blocks.value = Object.fromEntries(Object.entries(blocks.value).map(([k, first]) => [k === old ? name : k, first]))
    steps.value = Object.fromEntries(
      Object.entries(steps.value).map(([sid, step]) => {
        const moved = step.tab === old ? { ...step, tab: name } : step
        return [sid, rewriteTargets(moved, (t) => (isCallTo(t, old) ? { ...t, call: name } : t))]
      }),
    )
    const { [old]: place, ...others } = exitPlaces()
    if (place) setExits({ ...others, [name]: place })
    setCards(renameCards(cardPlaces(), old, name))
    return { ok: true, name, stepId: selectedId.value ?? undefined }
  }

  /** Удаляет блок, шаги его вкладки (через ту же чистку, что `removeStep`) и все переходы в него. */
  function removeBlock(name: string): boolean {
    if (blocks.value[name] === undefined || !touch()) return false
    const own = ownBlockSteps(scenario.value, name)
    steps.value = Object.fromEntries(
      Object.entries(steps.value).map(([sid, step]) => [sid, rewriteTargets(step, (t) => (isCallTo(t, name) ? undefined : t))]),
    )
    const { [name]: _gone, ...left } = blocks.value
    blocks.value = left
    dropSteps(own)
    const { [name]: _exit, ...exits } = exitPlaces()
    setExits(exits)
    setCards(dropBlockCards(cardPlaces(), name))
    return true
  }

  function exitPlaces(): Record<string, [number, number]> {
    return (extra.value.exits ?? {}) as Record<string, [number, number]>
  }

  function setExits(exits: Record<string, [number, number]>): void {
    const { exits: _old, ...rest } = extra.value
    extra.value = Object.keys(exits).length || _old ? { ...rest, exits } : rest
  }

  function cardPlaces(): CardPlaces {
    return (extra.value.cards ?? {}) as CardPlaces
  }

  function setCards(cards: CardPlaces): void {
    const { cards: old, ...rest } = extra.value
    extra.value = Object.keys(cards).length || old ? { ...rest, cards } : rest
  }

  /** Карточка блока на схеме: брошена из списка блоков или передвинута. */
  function placeCard(view: GraphView, block: string, then: string | undefined, pos: [number, number]): void {
    if (blocks.value[block] === undefined || !touch()) return
    setCards(putCard(cardPlaces(), view, block, then, pos))
  }

  /** Убирает поставленную карточку, на которую не ведут стрелки. */
  function removeCard(view: GraphView, block: string, then?: string): void {
    if (!isPlaced(cardPlaces(), view, block, then) || !touch()) return
    setCards(dropCard(cardPlaces(), view, block, then))
  }

  /** Место карточки выхода на вкладке блока: из палитры или перетаскиванием. */
  function placeExit(block: string, pos: [number, number]): void {
    if (blocks.value[block] === undefined || !touch()) return
    setExits({ ...exitPlaces(), [block]: pos })
  }

  /**
   * Стрелка от выхода карточки блока: у всех ссылок `{call: block, then}`, из которых она собрана,
   * ставится новый `then`, а без `to` он снимается. `sources` это шаги, из которых карточка собрана на своей схеме.
   */
  function retargetCall(block: string, then: string | undefined, sources: readonly string[], to?: string, view?: GraphView): void {
    const next = { ...steps.value }
    let changed = false
    for (const sid of sources) {
      const step = next[sid]
      if (!step) continue
      const rewritten = rewriteTargets(step, (t) =>
        isCallTo(t, block) && (t.then || undefined) === (then || undefined) ? (to ? { call: block, then: to } : { call: block }) : t,
      )
      if (isSame(step, rewritten)) continue
      next[sid] = rewritten
      changed = true
    }
    // поставленная карточка без стрелок хранит «куда вернуться» только в своём месте
    const moves = view !== undefined && (to || undefined) !== (then || undefined) && isPlaced(cardPlaces(), view, block, then)
    if ((!changed && !moves) || !touch()) return
    if (changed) steps.value = next
    if (moves) setCards(retargetCard(cardPlaces(), view, block, then, to))
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
    if (!step) return
    const options = (step.options ?? []).map((o) => {
      if (o.id !== optionId) return o
      const rule: Partial<Option> = { ...patch }
      if (typeof rule.url === 'string') rule.next = undefined
      else if (rule.next !== undefined) rule.url = undefined
      return applyPatch(o, rule)
    })
    const next = { ...step, options }
    if (isSame(step, next) || !touch(typedKey(`option:${stepId}:${optionId}`, patch, TYPED_OPTION_FIELDS))) return
    steps.value = { ...steps.value, [stepId]: next }
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

  /**
   * Откат: черновик на backend становится копией версии `n`, затем сценарий и список версий
   * читаются заново. Сохранение в полёте дожидается, чтобы оно не перезаписало откат.
   */
  async function activate(n: number): Promise<void> {
    await queue.catch(() => undefined)
    await repository.activate(n)
    try {
      await load()
    } catch (e) {
      // 401 остаётся 401, прочее: откат на сервере уже сделан, а экран показывает старое
      if (e instanceof SessionExpired) throw e
      throw new RollbackNotRefreshed()
    }
    draftMatchesActive.value = true
  }

  /** Конец сессии: история и загруженный сценарий не переживают нового входа. */
  function expireSession(): void {
    resetHistory()
    loaded.value = false
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
    // счётчик берётся до сохранения: отмена во время него тоже расходится с версией
    const stamp = edits.value
    try {
      await flush()
      const version = await repository.publish()
      // публикуется сохранённый черновик: правка за время сохранения или запроса в версию не попала
      draftMatchesActive.value = edits.value === stamp && !dirty.value
      // список для страницы «Версии» обновляется по возможности; номер из ответа верен и без него
      await loadVersions().catch(() => undefined)
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
    versions,
    draftMatchesActive,
    needsRollbackConfirm,
    loadVersions,
    activate,
    loaded,
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
    setPositions,
    addStep,
    removeStep,
    placeExit,
    placeCard,
    removeCard,
    addOption,
    updateOption,
    removeOption,
    connect,
    addBlock,
    renameBlock,
    removeBlock,
    retargetCall,
    expireSession,
    canUndo,
    canRedo,
    undo,
    redo,
    batch,
    flush,
    publish,
    toDraftData,
  }
})

/** Структурное равенство шагов: данные сценария это чистый JSON. */
function isSame(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Ключ слияния: правка одного текстового поля. Остальные правки не сливаются. */
function typedKey(scope: string, patch: object, fields: readonly string[]): string | undefined {
  const keys = Object.keys(patch)
  const field = keys[0]
  if (keys.length !== 1 || field === undefined || !fields.includes(field)) return undefined
  return typeof (patch as Record<string, unknown>)[field] === 'string' ? `${scope}:${field}` : undefined
}

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

/** Применяет `fn` к `next` шага и его кнопок; `undefined` снимает переход. Остальное не трогается. */
function rewriteTargets(step: Step, fn: (t: Target) => Target | undefined): Step {
  const out: Step = { ...step }
  if (step.next !== undefined) setTarget(out, fn(step.next))
  if (step.options) {
    out.options = step.options.map((o) => {
      if (o.next === undefined) return o
      const copy = { ...o }
      setTarget(copy, fn(o.next))
      return copy
    })
  }
  return out
}
