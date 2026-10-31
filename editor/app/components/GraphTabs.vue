<script setup lang="ts">
import { useManageBlocks } from '~/composables/useManageBlocks'
import type { GraphView } from '~/types/scenario'
import { BLOCK_NAME_LIMIT } from '~/utils/blocks'
import type { ViewTab } from '~/utils/scenarioGraph'
import { MAIN_VIEW } from '~/utils/scenarioGraph'

const props = defineProps<{ tabs: ViewTab[]; view: GraphView }>()
/** `stepId`: шаг, который открытая вкладка выбирает сразу (первый шаг нового блока). */
const emit = defineEmits<{ select: [view: GraphView, stepId?: string] }>()

const { locked, check, create, rename, remove } = useManageBlocks()

/** Поле на панели: новое название блока или переименование активного. */
const mode = ref<'add' | 'rename' | null>(null)
const draft = ref('')
const error = ref<string | null>(null)
const field = ref<HTMLInputElement | null>(null)

// поле встречается в двух местах шаблона (в том числе внутри v-for): ссылку держит функция
function setField(el: unknown) {
  field.value = el as HTMLInputElement | null
}

const mainTab = computed(() => props.tabs[0])
const blockTabs = computed(() => props.tabs.slice(1))
const onBlock = computed(() => props.view !== MAIN_VIEW)

function open(next: 'add' | 'rename', value: string) {
  mode.value = next
  draft.value = value
  error.value = null
  nextTick(() => {
    field.value?.focus()
    field.value?.select()
  })
}

function startAdd() {
  open('add', '')
}

function startRename() {
  const current = props.tabs.find((t) => t.view === props.view)
  open('rename', current?.label ?? props.view)
}

function cancel() {
  mode.value = null
  error.value = null
}

function commit() {
  if (mode.value === null) return
  const out = mode.value === 'add' ? create(draft.value) : rename(props.view, draft.value)
  if (!out.ok) {
    error.value = out.error
    return
  }
  mode.value = null
  error.value = null
  emit('select', out.name, out.stepId)
}

function onInput() {
  // ошибка снимается, как только человек правит название
  error.value = draft.value.trim() ? check(draft.value, mode.value === 'rename' ? props.view : undefined) : null
}

function onBlur() {
  if (!draft.value.trim() && !error.value) cancel()
}

function removeActive() {
  if (remove(props.view)) emit('select', MAIN_VIEW)
}

// Вкладка сменилась, пока поле открыто (клик по другой вкладке): поле закрывается
watch(
  () => props.view,
  () => cancel(),
)
</script>

<template>
  <div class="graph-tabs">
    <button
      v-if="mainTab"
      type="button"
      class="tab main"
      :class="{ active: mainTab.view === view }"
      @click="$emit('select', mainTab.view)"
    >
      {{ mainTab.label }}
    </button>
    <span class="caption">Общие блоки:</span>
    <template v-for="tab in blockTabs" :key="tab.view">
      <span v-if="mode === 'rename' && tab.view === view" class="field">
        <input
          :ref="setField"
          v-model="draft"
          class="name"
          type="text"
          aria-label="Новое название блока"
          :maxlength="BLOCK_NAME_LIMIT + 10"
          @input="onInput"
          @keydown.enter.prevent="commit"
          @keydown.esc.prevent="cancel"
        />
        <span v-if="error" class="error" role="alert">{{ error }}</span>
      </span>
      <button
        v-else
        type="button"
        class="tab"
        :class="{ active: tab.view === view }"
        @click="$emit('select', tab.view)"
      >
        {{ tab.label }}
      </button>
      <template v-if="tab.view === view && mode !== 'rename'">
        <button type="button" class="icon" aria-label="Переименовать" title="Переименовать" :disabled="locked" @click="startRename">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M2.5 13.5l.6-3L10.8 2.8a1.4 1.4 0 012 2L5.1 12.5l-2.6 1z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />
          </svg>
        </button>
        <button type="button" class="icon danger" aria-label="Удалить" title="Удалить" :disabled="locked" @click="removeActive">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5M6.8 7v3.5M9.2 7v3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </template>
    </template>
    <span v-if="mode === 'add'" class="field">
      <input
        :ref="setField"
        v-model="draft"
        class="name"
        type="text"
        placeholder="Название блока"
        aria-label="Название нового блока"
        :maxlength="BLOCK_NAME_LIMIT + 10"
        @input="onInput"
        @blur="onBlur"
        @keydown.enter.prevent="commit"
        @keydown.esc.prevent="cancel"
      />
      <span v-if="error" class="error" role="alert">{{ error }}</span>
    </span>
    <button v-else type="button" class="tab add" :disabled="locked" @click="startAdd">+ Блок</button>
  </div>
</template>

<style scoped>
.graph-tabs {
  flex: none;
  height: 44px;
  box-sizing: border-box;
  padding: 0 20px;
  background: var(--bg-bar);
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font);
  font-size: 13px;
  color: var(--ink-2);
  overflow-x: auto;
}
.caption {
  color: var(--ink-3);
  padding: 0 6px;
  white-space: nowrap;
}
.tab {
  font: inherit;
  color: var(--ink-2);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  padding: 6px 12px;
  cursor: pointer;
  white-space: nowrap;
}
.tab:hover {
  color: var(--accent);
}
.tab.active {
  font-weight: 600;
  color: var(--ink);
  background: var(--bg-card);
  border-color: var(--line-strong);
}
.tab.add {
  color: var(--accent);
}
.tab:disabled,
.icon:disabled {
  opacity: 0.45;
  cursor: default;
}
.icon {
  flex: none;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-2);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.icon:hover:not(:disabled) {
  color: var(--accent);
  border-color: var(--line-strong);
  background: var(--bg-card);
}
.icon.danger:hover:not(:disabled) {
  color: var(--danger);
}
.field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.name {
  font: inherit;
  width: 190px;
  height: 30px;
  box-sizing: border-box;
  padding: 0 10px;
  color: var(--ink);
  background: var(--bg-card);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
}
.name:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 0;
}
.error {
  color: var(--danger);
  white-space: nowrap;
}
.tab:focus-visible,
.icon:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
</style>
