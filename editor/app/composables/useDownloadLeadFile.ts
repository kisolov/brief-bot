import { mapLeadsError } from '~/errors/presentation'
import { useLeadStore } from '~/stores/lead.store'
import { usePageGuard } from './usePageGuard'

/** Через сколько отзывается ссылка на файл: браузер успевает начать скачивание. */
const REVOKE_DELAY_MS = 1000

/**
 * Сценарий «скачать ТЗ»: файл забирается запросом, чтобы ошибку (413) показать текстом,
 * и отдаётся браузеру под именем из ответа backend. Возвращает текст ошибки или `null`;
 * ошибка запоздавшего ответа по уже не выбранной заявке не возвращается: карточка чужая.
 */
export function useDownloadLeadFile() {
  const store = useLeadStore()
  const guard = usePageGuard(mapLeadsError)

  return async (id: number): Promise<string | null> => {
    const error = await guard(async () => {
      const file = await store.downloadFile(id)
      const url = URL.createObjectURL(file.blob)
      const link = document.createElement('a')
      link.href = url
      link.download = file.name
      // Firefox не кликает по якорю вне документа
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
    })
    return error !== null && store.selectedId !== id ? null : error
  }
}
