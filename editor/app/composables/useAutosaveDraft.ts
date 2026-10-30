import { storeToRefs } from 'pinia'
import { computed, getCurrentScope, onScopeDispose, watch } from 'vue'
import { SessionExpired } from '~/errors/base'
import { CONFLICT_TEXT, SAVE_FAILED_TEXT } from '~/errors/presentation'
import { useScenarioStore } from '~/stores/scenario.store'

export const AUTOSAVE_DELAY_MS = 800

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Сценарий «сохранять черновик сам»: правки собираются 800 мс и уходят одним запросом.
 * Возвращает текст статуса для шапки и `stop`, чтобы снять слежение.
 */
export function useAutosaveDraft() {
  const store = useScenarioStore()
  const router = useRouter()
  const { edits, dirty, saving, savedAt, saveFailed, conflict } = storeToRefs(store)
  let timer: ReturnType<typeof setTimeout> | null = null

  async function save(): Promise<void> {
    try {
      await store.flush()
    } catch (e) {
      // статус показывает состояние store; здесь только уход на вход при кончившейся сессии
      if (e instanceof SessionExpired) await router.replace('/login')
    }
  }

  const stopWatch = watch(
    edits,
    () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        void save()
      }, AUTOSAVE_DELAY_MS)
    },
    { flush: 'sync' },
  )

  // Закрытие вкладки с несохранённой правкой: браузер спрашивает, уходить ли
  function guardUnload(event: { preventDefault: () => void; returnValue?: unknown }): void {
    if (!dirty.value && !saving.value) return
    event.preventDefault()
    event.returnValue = ''
  }
  const hasWindow = typeof window !== 'undefined'
  if (hasWindow) window.addEventListener('beforeunload', guardUnload as EventListener)

  function stop(): void {
    stopWatch()
    if (timer) clearTimeout(timer)
    timer = null
    if (hasWindow) window.removeEventListener('beforeunload', guardUnload as EventListener)
  }
  if (getCurrentScope()) onScopeDispose(stop)

  const status = computed(() => {
    if (conflict.value) return CONFLICT_TEXT
    if (saveFailed.value) return SAVE_FAILED_TEXT
    if (dirty.value || saving.value) return 'Сохраняем…'
    const at = savedAt.value
    return at ? `Черновик сохранён в ${pad(at.getHours())}:${pad(at.getMinutes())}` : ''
  })

  return { status, stop }
}
