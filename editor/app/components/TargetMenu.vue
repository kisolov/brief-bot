<script setup lang="ts">
import { NEW_STEP_VALUE as NEW_VALUE } from '~/composables/useTargetMenu'
import type { TargetChoice } from '~/utils/stepTargets'
import { filterChoices } from '~/utils/stepTargets'

const props = defineProps<{
  /** Точка отпускания стрелки в координатах холста. */
  x: number
  y: number
  /** Цели без поиска: вход в блок, выход из блока, шаги. */
  choices: TargetChoice[]
}>()
const emit = defineEmits<{ pick: [value: string]; close: [] }>()

const WIDTH = 260
const MAX_HEIGHT = 306
const GAP = 8

const root = ref<HTMLElement | null>(null)
const search = ref<HTMLInputElement | null>(null)
const query = ref('')
const active = ref(0)
const bounds = ref({ width: Infinity, height: Infinity })

const items = computed(() =>
  filterChoices([{ value: NEW_VALUE, label: 'Новый шаг' }, ...props.choices], query.value),
)

// Меню не выходит за край холста: ширина и высота известны заранее (список прокручивается внутри).
const left = computed(() => Math.max(GAP, Math.min(props.x, bounds.value.width - WIDTH - GAP)))
const top = computed(() => Math.max(GAP, Math.min(props.y, bounds.value.height - MAX_HEIGHT - GAP)))

watch(query, () => {
  active.value = 0
})

function move(step: number) {
  if (!items.value.length) return
  active.value = (active.value + step + items.value.length) % items.value.length
  nextTick(() => root.value?.querySelector('.item.active')?.scrollIntoView({ block: 'nearest' }))
}

function choose(index = active.value) {
  const item = items.value[index]
  if (item) emit('pick', item.value)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') move(1)
  else if (e.key === 'ArrowUp') move(-1)
  else if (e.key === 'Enter') choose()
  else if (e.key === 'Escape') emit('close')
  else return
  e.preventDefault()
}

// Клик мимо закрывает меню; нажатие внутри него — нет.
function onOutside(e: PointerEvent) {
  if (!root.value?.contains(e.target as Node)) emit('close')
}

onMounted(() => {
  const area = root.value?.offsetParent as HTMLElement | null
  if (area) bounds.value = { width: area.clientWidth, height: area.clientHeight }
  search.value?.focus()
  window.addEventListener('pointerdown', onOutside, true)
})
onBeforeUnmount(() => window.removeEventListener('pointerdown', onOutside, true))
</script>

<template>
  <div
    ref="root"
    class="target-menu"
    role="dialog"
    aria-label="Куда ведёт стрелка"
    :style="{ left: `${left}px`, top: `${top}px` }"
    @keydown="onKey"
  >
    <input
      ref="search"
      v-model="query"
      class="search"
      type="text"
      placeholder="Найти шаг или блок"
      aria-label="Найти шаг или блок"
      autocomplete="off"
    />
    <ul class="list" role="listbox">
      <li
        v-for="(item, i) in items"
        :key="item.value"
        class="item"
        :class="{ active: i === active, fresh: item.value === NEW_VALUE }"
        role="option"
        :aria-selected="i === active"
        @mousemove="active = i"
        @click="choose(i)"
      >
        {{ item.label }}
      </li>
      <li v-if="!items.length" class="empty">Ничего не найдено</li>
    </ul>
  </div>
</template>

<style scoped>
.target-menu {
  position: absolute;
  z-index: 20;
  width: 260px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  box-shadow: 0 6px 20px rgba(24, 33, 44, 0.16);
  font-family: var(--font);
  font-size: 13px;
  color: var(--ink);
  overflow: hidden;
}
.search {
  font: inherit;
  height: 40px;
  box-sizing: border-box;
  padding: 0 12px;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: var(--bg-card);
  color: var(--ink);
  outline: none;
}
.search:focus-visible {
  box-shadow: inset 0 -2px 0 var(--accent);
}
.search::placeholder {
  color: var(--ink-3);
}
.list {
  list-style: none;
  margin: 0;
  padding: 4px;
  max-height: 260px;
  overflow-y: auto;
}
.item {
  padding: 7px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.item.fresh {
  font-weight: 600;
}
.item.active {
  background: var(--accent-ring);
  color: var(--accent);
}
.empty {
  padding: 7px 8px;
  color: var(--ink-3);
}
</style>
