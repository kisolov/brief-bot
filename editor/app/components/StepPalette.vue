<script setup lang="ts">
import type { StepType } from '~/types/scenario'
import { EXIT_ITEM, STEP_TYPE_LABELS } from '~/utils/scenarioGraph'
import type { PaletteItem } from '~/utils/scenarioGraph'

defineProps<{ disabled?: boolean; inBlock?: boolean }>()
const emit = defineEmits<{ add: [type: PaletteItem] }>()

const types: StepType[] = ['choice', 'multi', 'multi_input', 'text', 'file', 'info']

function startDrag(event: DragEvent, type: PaletteItem) {
  event.dataTransfer?.setData('application/x-step-type', type)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}
</script>

<template>
  <aside class="palette" aria-label="Новые шаги">
    <div class="hint">Перетащите шаг на схему</div>
    <button
      v-for="type in types"
      :key="type"
      type="button"
      class="item"
      :class="`type-${type}`"
      :draggable="!disabled"
      :disabled="disabled"
      @dragstart="startDrag($event, type)"
      @click="emit('add', type)"
    >
      {{ STEP_TYPE_LABELS[type] }}
    </button>
    <template v-if="inBlock">
      <div class="hint block-hint">В этом блоке</div>
      <button
        type="button"
        class="item exit"
        :draggable="!disabled"
        :disabled="disabled"
        title="Поставьте карточку на схему и проведите к ней стрелку: бот вернётся туда, откуда вошёл в блок"
        @dragstart="startDrag($event, EXIT_ITEM)"
        @click="emit('add', EXIT_ITEM)"
      >
        Выход из блока
      </button>
    </template>
  </aside>
</template>

<style scoped>
.palette {
  width: 144px;
  flex: none;
  box-sizing: border-box;
  padding: 14px 10px;
  background: var(--bg-card);
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  font-family: var(--font);
  color: var(--ink);
}
.hint {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-2);
  line-height: 16px;
}
.block-hint {
  margin-top: 8px;
}
.item {
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  text-align: left;
  line-height: 15px;
  min-height: 44px;
  padding: 6px 10px;
  border: 0;
  border-radius: var(--radius-sm);
  cursor: grab;
}
.item:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.exit {
  background: var(--bg-card);
  color: var(--ink);
  border: 1px solid var(--line-strong);
}
.type-choice { background: var(--step-choice-tint); color: var(--step-choice-ink); }
.type-multi { background: var(--step-multi-tint); color: var(--step-multi-ink); }
.type-multi_input { background: var(--step-multi_input-tint); color: var(--step-multi_input-ink); }
.type-text { background: var(--step-text-tint); color: var(--step-text-ink); }
.type-file { background: var(--step-file-tint); color: var(--step-file-ink); }
.type-info { background: var(--step-info-tint); color: var(--step-info-ink); }
</style>
