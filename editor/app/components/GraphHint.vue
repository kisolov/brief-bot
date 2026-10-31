<script setup lang="ts">
const props = defineProps<{ text: string | null }>()

// Текст остаётся на время исчезновения: иначе подсказка опустела бы раньше, чем растает
const shown = ref(props.text)
watch(
  () => props.text,
  (text) => {
    if (text) shown.value = text
  },
)
</script>

<template>
  <Transition name="graph-hint">
    <div v-if="text" class="graph-hint" role="status">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5" />
        <path d="M8 7.2v3.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        <circle cx="8" cy="5" r="0.9" fill="currentColor" />
      </svg>
      <span>{{ shown }}</span>
    </div>
  </Transition>
</template>

<style scoped>
.graph-hint {
  position: absolute;
  top: 16px;
  left: 50%;
  z-index: 10;
  max-width: min(520px, calc(100% - 32px));
  width: max-content;
  box-sizing: border-box;
  padding: 10px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  transform: translateX(-50%);
  background: var(--block-bg);
  color: #fff;
  border-radius: var(--radius);
  box-shadow: 0 6px 20px rgba(24, 33, 44, 0.24);
  font-family: var(--font);
  font-size: 13px;
  line-height: 18px;
  pointer-events: none;
}
.graph-hint svg {
  flex: none;
  color: var(--block-kind);
}
.graph-hint-enter-active,
.graph-hint-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.graph-hint-enter-from,
.graph-hint-leave-to {
  opacity: 0;
  transform: translate(-50%, -6px);
}
@media (prefers-reduced-motion: reduce) {
  .graph-hint-enter-active,
  .graph-hint-leave-active {
    transition: opacity 0.18s ease;
  }
  .graph-hint-enter-from,
  .graph-hint-leave-to {
    transform: translateX(-50%);
  }
}
</style>
