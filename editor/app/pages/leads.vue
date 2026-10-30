<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useDownloadLeadFile } from '~/composables/useDownloadLeadFile'
import { useLoadLeads } from '~/composables/useLoadLeads'
import { useLeadStore } from '~/stores/lead.store'

const loadLeads = useLoadLeads()
const download = useDownloadLeadFile()
const store = useLeadStore()
const { visible, filter, selectedId, selected } = storeToRefs(store)

const failure = ref<string | null>(null)
const fileError = ref<string | null>(null)

onMounted(async () => {
  failure.value = await loadLeads()
})

// ошибка скачивания относится к заявке, у которой её получили
watch(selectedId, () => (fileError.value = null))

async function downloadFile(id: number) {
  fileError.value = await download(id)
}
</script>

<template>
  <div class="page">
    <div class="list">
      <LeadsTable
        :leads="visible"
        :filter="filter"
        :selected-id="selectedId"
        :failure="failure"
        @select="store.select"
        @filter="store.setFilter"
      />
    </div>
    <LeadDetail :lead="selected" :file-error="fileError" @download="downloadFile" />
  </div>
</template>

<style scoped>
.page {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  background: var(--bg-bar);
}
.list {
  flex: 999 1 560px;
  min-width: 0;
}
</style>
