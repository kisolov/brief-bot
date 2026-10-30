<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useAddStep } from '~/composables/useAddStep'
import { useConnectSteps } from '~/composables/useConnectSteps'
import { useEditStep } from '~/composables/useEditStep'
import { useScenarioStore } from '~/stores/scenario.store'
import { NEXT_HANDLE } from '~/types/scenario'
import type { Option, Step, StepType, Target, When } from '~/types/scenario'
import { STEP_TYPE_LABELS } from '~/utils/scenarioGraph'
import { decodeTarget, encodeTarget, stepLabel, targetChoices } from '~/utils/stepTargets'

const props = defineProps<{ view: string }>()
const emit = defineEmits<{ allErrors: [] }>()

const LABEL_LIMIT = 40
const URL_PLACEHOLDER = 'https://'
const INPUT_PLACEHOLDER = 'Напишите ваш вариант:'
const URL_VALUE = '__url'
const NEW_VALUE = '__new'

const store = useScenarioStore()
const { steps, selectedId, scenario, issues } = storeToRefs(store)
const { updateStep, addOption, updateOption, removeOption, setCondition, canRemove, removeStep } = useEditStep()
const { connect, disconnect } = useConnectSteps()
const addStep = useAddStep()

const id = computed(() => selectedId.value ?? '')
const step = computed<Step | undefined>(() => steps.value[id.value])
const type = computed<StepType>(() => step.value?.type ?? 'info')

const typeChoices = (Object.keys(STEP_TYPE_LABELS) as StepType[]).map((t) => ({ value: t, label: STEP_TYPE_LABELS[t] }))
const choices = computed(() => targetChoices(scenario.value, props.view))
const stepChoices = computed(() => choices.value.filter((c) => c.value.startsWith('step:')))

const hasButtons = computed(() => type.value !== 'text' && type.value !== 'file')
const multiButtons = computed(() => type.value === 'multi' || type.value === 'multi_input')
/** Кнопка ведёт сама только у выбора, сообщения и завершающего шага; у остальных переход один, у шага. */
const buttonsLead = computed(() => type.value === 'choice' || type.value === 'info' || step.value?.finish === true)
const hasKey = computed(() => type.value !== 'info')
const showNext = computed(
  () => type.value !== 'choice' || step.value?.next !== undefined || step.value?.when !== undefined,
)

const stepIssues = computed(() =>
  issues.value
    .map((issue, i) => ({ number: i + 1, issue }))
    .filter((x) => x.issue.stepId === id.value),
)

function text(e: Event): string {
  return (e.target as HTMLInputElement).value
}

function checked(e: Event): boolean {
  return (e.target as HTMLInputElement).checked
}

function setKey(value: string) {
  updateStep(id.value, { key: value === '' ? undefined : value })
}

function targetValue(target: Target | undefined): string {
  return encodeTarget(target)
}

/** Выбор другого шага блока сохраняет, куда вернуться после блока, если блок тот же. */
function resolve(value: string, current: Target | undefined): Target | undefined {
  const next = decodeTarget(value)
  if (typeof next === 'object' && typeof current === 'object' && current.call === next.call && current.then) {
    return { ...next, then: current.then }
  }
  return next
}

function createTarget(handle: string) {
  addStep('info', { from: { step: id.value, handle }, view: props.view })
}

function onStepTarget(value: string) {
  if (value === NEW_VALUE) return createTarget(NEXT_HANDLE)
  const next = resolve(value, step.value?.next)
  if (next === undefined) disconnect(id.value, NEXT_HANDLE)
  else connect(id.value, NEXT_HANDLE, next)
}

function setThen(value: string) {
  const current = step.value?.next
  if (typeof current !== 'object') return
  connect(id.value, NEXT_HANDLE, value === '' ? { call: current.call } : { call: current.call, then: value })
}

function setOptionThen(o: Option, value: string) {
  if (typeof o.next !== 'object') return
  connect(id.value, o.id, value === '' ? { call: o.next.call } : { call: o.next.call, then: value })
}

function optionValue(o: Option): string {
  return o.url !== undefined ? URL_VALUE : targetValue(o.next)
}

function onOptionTarget(o: Option, value: string) {
  if (value === NEW_VALUE) return createTarget(o.id)
  if (value === URL_VALUE) return updateOption(id.value, o.id, { url: URL_PLACEHOLDER })
  const next = resolve(value, o.next)
  if (next === undefined) updateOption(id.value, o.id, { next: undefined, url: undefined })
  else connect(id.value, o.id, next)
}

function setInputPrompt(o: Option, on: boolean) {
  updateOption(id.value, o.id, { input: on ? INPUT_PLACEHOLDER : undefined })
}

function keepPrompt(o: Option, value: string) {
  // пустой вопрос бот не сможет задать
  if (value.trim() === '') updateOption(id.value, o.id, { input: INPUT_PLACEHOLDER })
}

function thenOf(target: Target | undefined): string {
  return typeof target === 'object' ? (target.then ?? '') : ''
}

// Условие показа
const conditionSteps = computed(() =>
  Object.entries(steps.value)
    .filter(([sid, s]) => sid !== id.value && (s.options?.length ?? 0) > 0)
    .map(([sid, s]) => ({ value: sid, label: stepLabel(s) })),
)
const when = computed<When | undefined>(() => step.value?.when)
const whenOptions = computed(() => (when.value ? (steps.value[when.value.step]?.options ?? []) : []))

function setWhenStep(sid: string) {
  if (sid === '') return setCondition(id.value, undefined)
  const first = steps.value[sid]?.options?.[0]?.id
  setCondition(id.value, { step: sid, any: first ? [first] : [] })
}

function toggle(list: string[] | undefined, optionId: string, on: boolean): string[] {
  const rest = (list ?? []).filter((x) => x !== optionId)
  return on ? [...rest, optionId] : rest
}

function setWhenAny(optionId: string, on: boolean) {
  const w = when.value
  if (w) setCondition(id.value, { ...w, any: toggle(w.any, optionId, on) })
}

function setWhenNone(optionId: string, on: boolean) {
  const w = when.value
  if (!w) return
  const none = toggle(w.none, optionId, on)
  const { none: _old, ...rest } = w
  setCondition(id.value, none.length ? { ...rest, none } : rest)
}

function onRemove() {
  removeStep(id.value)
}
</script>

<template>
  <aside v-if="step" class="step-panel" aria-label="Настройки шага">
    <div class="body">
    <div v-if="stepIssues.length" class="problems" role="alert">
      <div v-for="p in stepIssues" :key="p.number" class="problem">
        <span class="num">{{ p.number }}</span>
        <span>{{ p.issue.message }}</span>
      </div>
      <button type="button" class="link" @click="emit('allErrors')">Ко всем ошибкам</button>
    </div>

    <div class="field inline">
      <label for="step-type">Тип шага</label>
      <select id="step-type" :class="`type-${type}`" class="chip" :value="type" @change="updateStep(id, { type: text($event) as StepType })">
        <option v-for="c in typeChoices" :key="c.value" :value="c.value">{{ c.label }}</option>
      </select>
    </div>

    <div class="field">
      <label for="step-text">Текст сообщения</label>
      <textarea id="step-text" rows="3" :value="step.text" @input="updateStep(id, { text: text($event) })" />
    </div>

    <div v-if="hasKey" class="field">
      <label for="step-key">Как подписать ответ в заявке</label>
      <input id="step-key" type="text" :value="step.key ?? ''" @input="setKey(text($event))" />
    </div>

    <div v-if="type === 'text'" class="field">
      <label for="step-validate">Проверять ответ</label>
      <select
        id="step-validate"
        :value="step.validate ?? ''"
        @change="updateStep(id, { validate: (text($event) || undefined) as Step['validate'] })"
      >
        <option value="">Не проверять</option>
        <option value="phone">Как телефон</option>
        <option value="url">Как ссылку</option>
      </select>
    </div>

    <div v-if="hasButtons" class="field">
      <div class="caption">Кнопки</div>
      <div v-for="o in step.options ?? []" :key="o.id" class="card">
        <label class="sub">
          <span class="row-between">Подпись <span class="count">{{ o.label.length }}/{{ LABEL_LIMIT }}</span></span>
          <input
            type="text"
            :maxlength="LABEL_LIMIT"
            :value="o.label"
            @input="updateOption(id, o.id, { label: text($event) })"
          />
        </label>
        <template v-if="buttonsLead">
          <label class="sub">
            Куда ведёт
            <select :value="optionValue(o)" @change="onOptionTarget(o, text($event))">
              <option value="">Никуда не ведёт</option>
              <option :value="URL_VALUE">Открыть ссылку на сайт</option>
              <option v-for="c in choices" :key="c.value" :value="c.value">{{ c.label }}</option>
              <option :value="NEW_VALUE">Новый шаг…</option>
            </select>
          </label>
          <label v-if="o.url !== undefined" class="sub">
            Адрес ссылки
            <input type="text" :value="o.url" @input="updateOption(id, o.id, { url: text($event) })" />
          </label>
          <label v-if="typeof o.next === 'object'" class="sub">
            После блока вернуться на
            <select :value="thenOf(o.next)" @change="setOptionThen(o, text($event))">
              <option value="">Не выбрано</option>
              <option v-for="c in stepChoices" :key="c.value" :value="c.value.slice(5)">{{ c.label }}</option>
            </select>
          </label>
        </template>
        <template v-if="multiButtons">
          <label class="check">
            <input type="checkbox" :checked="o.input !== undefined" @change="setInputPrompt(o, checked($event))" />
            Человек вводит свой текст
          </label>
          <label v-if="o.input !== undefined" class="sub">
            Что спросить
            <input
              type="text"
              :value="o.input"
              @input="updateOption(id, o.id, { input: text($event) })"
              @change="keepPrompt(o, text($event))"
            />
          </label>
          <label class="check">
            <input type="checkbox" :checked="o.exclusive === true" @change="updateOption(id, o.id, { exclusive: checked($event) || undefined })" />
            Снимает другие отметки
          </label>
        </template>
        <button type="button" class="link danger" @click="removeOption(id, o.id)">Удалить кнопку</button>
      </div>
      <button type="button" class="add" @click="addOption(id)">Добавить кнопку</button>
    </div>

    <div v-if="showNext" class="field">
      <label for="step-next">Куда идти дальше</label>
      <select id="step-next" :value="targetValue(step.next)" @change="onStepTarget(text($event))">
        <option value="">Никуда не ведёт</option>
        <option v-for="c in choices" :key="c.value" :value="c.value">{{ c.label }}</option>
        <option :value="NEW_VALUE">Новый шаг…</option>
      </select>
      <template v-if="typeof step.next === 'object'">
        <label for="step-then">После блока вернуться на</label>
        <select id="step-then" :value="thenOf(step.next)" @change="setThen(text($event))">
          <option value="">Не выбрано</option>
          <option v-for="c in stepChoices" :key="c.value" :value="c.value.slice(5)">{{ c.label }}</option>
        </select>
      </template>
    </div>

    <div class="field">
      <label class="check">
        <input type="checkbox" :checked="step.finish === true" @change="updateStep(id, { finish: checked($event) || undefined })" />
        Завершить анкету на этом шаге
      </label>
      <template v-if="step.finish">
        <label for="step-back">Куда ведёт «Назад» после завершения</label>
        <select id="step-back" :value="step.back_to ?? ''" @change="updateStep(id, { back_to: text($event) || undefined })">
          <option value="">Не выбрано</option>
          <option v-for="c in stepChoices" :key="c.value" :value="c.value.slice(5)">{{ c.label }}</option>
        </select>
      </template>
    </div>

    <div class="field">
      <label for="step-when">Когда показывать</label>
      <select id="step-when" :value="when?.step ?? ''" @change="setWhenStep(text($event))">
        <option value="">Всегда</option>
        <option v-if="when && !steps[when.step]" :value="when.step">Шаг не найден</option>
        <option v-for="c in conditionSteps" :key="c.value" :value="c.value">После вопроса: {{ c.label }}</option>
      </select>
      <template v-if="when && whenOptions.length">
        <div class="caption small">Показывать, если отмечено</div>
        <label v-for="o in whenOptions" :key="o.id" class="check">
          <input type="checkbox" :checked="when.any.includes(o.id)" @change="setWhenAny(o.id, checked($event))" />
          {{ o.label }}
        </label>
        <div class="caption small">И не отмечено</div>
        <label v-for="o in whenOptions" :key="`n-${o.id}`" class="check">
          <input type="checkbox" :checked="(when.none ?? []).includes(o.id)" @change="setWhenNone(o.id, checked($event))" />
          {{ o.label }}
        </label>
      </template>
    </div>

    </div>
    <div class="foot">
      <button type="button" class="remove" :disabled="!canRemove(id)" @click="onRemove">Удалить шаг</button>
      <div v-if="!canRemove(id)" class="note">Это первый шаг сценария, его удалить нельзя.</div>
    </div>
  </aside>
</template>

<style scoped>
.step-panel {
  width: 336px;
  flex: none;
  box-sizing: border-box;
  padding: 16px;
  background: var(--bg-card);
  border-left: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-family: var(--font);
  font-size: 13px;
  color: var(--ink);
}
/* Прокручивается тело, кнопка удаления остаётся внизу на виду */
.body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.body > * {
  flex: none;
}
.foot {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field.inline {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field > label,
.caption {
  font-weight: 500;
}
.caption.small {
  font-size: 12px;
  color: var(--ink-2);
  margin-top: 4px;
}
input[type='text'],
select,
textarea {
  font: inherit;
  font-size: 14px;
  box-sizing: border-box;
  width: 100%;
  padding: 0 10px;
  border: 1px solid #a9b3c0;
  border-radius: var(--radius-sm);
  color: var(--ink);
  background: var(--bg-card);
  height: 38px;
}
select {
  padding: 0 8px;
}
textarea {
  height: auto;
  padding: 8px 10px;
  line-height: 20px;
  resize: vertical;
}
input:focus-visible,
select:focus-visible,
textarea:focus-visible,
button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.chip {
  width: auto;
  align-self: flex-start;
  height: 30px;
  font-size: 12px;
  font-weight: 600;
  border: 0;
  background: var(--tint);
  color: var(--ink-type);
}
.type-choice { --tint: var(--step-choice-tint); --ink-type: var(--step-choice-ink); }
.type-multi { --tint: var(--step-multi-tint); --ink-type: var(--step-multi-ink); }
.type-multi_input { --tint: var(--step-multi_input-tint); --ink-type: var(--step-multi_input-ink); }
.type-text { --tint: var(--step-text-tint); --ink-type: var(--step-text-ink); }
.type-file { --tint: var(--step-file-tint); --ink-type: var(--step-file-ink); }
.type-info { --tint: var(--step-info-tint); --ink-type: var(--step-info-ink); }
.card {
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 2px;
}
.sub {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--ink-2);
}
.sub input,
.sub select {
  height: 36px;
}
.row-between {
  display: flex;
  justify-content: space-between;
}
.count {
  color: var(--ink-3);
}
.check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  line-height: 18px;
  color: var(--ink);
}
.check input {
  margin: 2px 0 0;
}
.add {
  font: inherit;
  font-weight: 500;
  height: 38px;
  border: 1px dashed var(--port);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--accent);
  cursor: pointer;
}
.link {
  font: inherit;
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  text-decoration: underline;
}
.link.danger {
  color: var(--danger);
}
.remove {
  font: inherit;
  font-weight: 500;
  height: 40px;
  flex: none;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--danger);
  cursor: pointer;
}
.remove:disabled {
  color: var(--ink-3);
  cursor: not-allowed;
}
.note {
  font-size: 12px;
  color: var(--ink-3);
}
.problems {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid #e9b9b5;
  border-radius: var(--radius-sm);
}
.problem {
  display: flex;
  gap: 10px;
  line-height: 19px;
}
.num {
  flex: none;
  width: 20px;
  height: 20px;
  border-radius: 10px;
  background: var(--danger);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  line-height: 20px;
}
</style>
