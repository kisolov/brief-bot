<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useEditStep } from '~/composables/useEditStep'
import { useScenarioStore } from '~/stores/scenario.store'
import { stepLabel } from '~/utils/stepTargets'

/** Условие показа: без `optionId` у шага, с ним у кнопки. */
const props = defineProps<{ stepId: string; optionId?: string; fieldId: string }>()

const { steps } = storeToRefs(useScenarioStore())
const { whenOf, setCondition, setAnswer } = useEditStep()

const when = computed(() => whenOf(props.stepId, props.optionId))
const subject = computed(() => (props.optionId === undefined ? 'шаг' : 'кнопка'))
const conditionSteps = computed(() =>
  Object.entries(steps.value)
    .filter(([sid, s]) => sid !== props.stepId && (s.options?.length ?? 0) > 0)
    .map(([sid, s]) => ({ value: sid, label: stepLabel(s) })),
)
const answers = computed(() => (when.value ? (steps.value[when.value.step]?.options ?? []) : []))
/** Условие осталось только с "не отмечено": ждёт, пока человек выберет ответ. */
const needsAnswer = computed(() => when.value !== undefined && when.value.any.length === 0)

function text(e: Event): string {
  return (e.target as HTMLSelectElement).value
}

function checked(e: Event): boolean {
  return (e.target as HTMLInputElement).checked
}

function setStep(sid: string) {
  if (sid === '') return setCondition(props.stepId, undefined, props.optionId)
  const first = steps.value[sid]?.options?.[0]?.id
  setCondition(props.stepId, { step: sid, any: first ? [first] : [] }, props.optionId)
}

function mark(kind: 'any' | 'none', answerId: string, on: boolean) {
  setAnswer(props.stepId, kind, answerId, on, props.optionId)
}
</script>

<template>
  <div class="when-field">
    <label :for="fieldId">Когда показывать</label>
    <select :id="fieldId" :value="when?.step ?? ''" @change="setStep(text($event))">
      <option value="">Всегда</option>
      <option v-if="when && !steps[when.step]" :value="when.step">Шаг не найден</option>
      <option v-for="c in conditionSteps" :key="c.value" :value="c.value">После вопроса: {{ c.label }}</option>
    </select>
    <template v-if="when && answers.length">
      <div class="caption">Показывать, если отмечено</div>
      <label v-for="o in answers" :key="o.id" class="check">
        <input type="checkbox" :checked="when.any.includes(o.id)" @change="mark('any', o.id, checked($event))" />
        {{ o.label }}
      </label>
      <div v-if="needsAnswer" class="warn">
        Отметьте хотя бы один ответ в «Показывать, если отмечено», иначе {{ subject }} никогда не покажется.
      </div>
      <div class="caption">И не отмечено</div>
      <label v-for="o in answers" :key="`n-${o.id}`" class="check">
        <input type="checkbox" :checked="(when.none ?? []).includes(o.id)" @change="mark('none', o.id, checked($event))" />
        {{ o.label }}
      </label>
    </template>
  </div>
</template>

<style scoped>
.when-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.when-field > label:first-child {
  font-weight: 500;
}
select {
  font: inherit;
  font-size: 14px;
  box-sizing: border-box;
  width: 100%;
  height: 38px;
  padding: 0 8px;
  border: 1px solid #a9b3c0;
  border-radius: var(--radius-sm);
  color: var(--ink);
  background: var(--bg-card);
}
select:focus-visible,
input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.caption {
  font-size: 12px;
  font-weight: 500;
  color: var(--ink-2);
  margin-top: 4px;
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
.warn {
  color: var(--danger);
  line-height: 18px;
}
</style>
