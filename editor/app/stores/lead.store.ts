import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useContainer } from '~/container'
import type { Lead, LeadFilter } from '~/types/lead'

/** Сервис заявок: список целиком, фильтр и выбранная заявка. */
export const useLeadStore = defineStore('lead', () => {
  const repository = useContainer().leadRepository

  const leads = ref<Lead[]>([])
  const filter = ref<LeadFilter>('all')
  const selectedId = ref<number | null>(null)
  const loaded = ref(false)

  const visible = computed(() => (filter.value === 'all' ? leads.value : leads.value.filter((l) => l.status === filter.value)))
  const selected = computed(() => visible.value.find((l) => l.id === selectedId.value) ?? null)

  /** Выбор держится на видимой заявке: пропавшая из списка заменяется первой. */
  function keepSelection(): void {
    if (!visible.value.some((l) => l.id === selectedId.value)) selectedId.value = visible.value[0]?.id ?? null
  }

  async function load(): Promise<void> {
    leads.value = await repository.list()
    loaded.value = true
    keepSelection()
  }

  /** Файл ТЗ заявки; 413 и 404 приходят ошибками предметной области. */
  function downloadFile(id: number): Promise<Blob> {
    return repository.downloadFile(id)
  }

  function setFilter(next: LeadFilter): void {
    filter.value = next
    keepSelection()
  }

  function select(id: number | null): void {
    selectedId.value = id
  }

  return { leads, filter, selectedId, loaded, visible, selected, load, downloadFile, setFilter, select }
})
