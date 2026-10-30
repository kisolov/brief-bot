<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useActivateVersion } from '~/composables/useActivateVersion'
import { useLoadVersions } from '~/composables/useLoadVersions'
import { useScenarioStore } from '~/stores/scenario.store'

const loadVersions = useLoadVersions()
const activateVersion = useActivateVersion()
const { versions } = storeToRefs(useScenarioStore())

const failure = ref<string | null>(null)
const busy = ref(false)

onMounted(async () => {
  failure.value = await loadVersions()
})

async function activate(n: number) {
  busy.value = true
  failure.value = await activateVersion(n)
  busy.value = false
}
</script>

<template>
  <div class="page">
    <VersionsList :versions="versions" :failure="failure" :busy="busy" @activate="activate" />
  </div>
</template>

<style scoped>
.page {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  background: var(--bg-bar);
}
</style>
