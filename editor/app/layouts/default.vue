<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useAutosaveDraft } from '~/composables/useAutosaveDraft'
import { usePublishScenario } from '~/composables/usePublishScenario'
import { useScenarioStore } from '~/stores/scenario.store'

// Автосохранение и публикация живут в каркасе: шапка показывает их состояние на любой странице
const { status } = useAutosaveDraft()
const publish = usePublishScenario()
const { loaded, publishing, conflict } = storeToRefs(useScenarioStore())
</script>

<template>
  <div class="shell">
    <AppHeader
      active="scenario"
      :status="status"
      :publish-disabled="!loaded || publishing || conflict"
      @publish="publish"
    />
    <main class="content">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-canvas);
}
.content {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
