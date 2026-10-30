import { mapLeadsError } from '~/errors/presentation'
import { useLeadStore } from '~/stores/lead.store'
import { usePageGuard } from './usePageGuard'

/**
 * Сценарий «скачать ТЗ»: файл забирается запросом, чтобы ошибку (413) показать текстом,
 * и отдаётся браузеру как скачивание `tz-<id>`. Возвращает текст ошибки или `null`.
 */
export function useDownloadLeadFile() {
  const store = useLeadStore()
  const guard = usePageGuard(mapLeadsError)

  return (id: number) =>
    guard(async () => {
      const blob = await store.downloadFile(id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `tz-${id}`
      link.click()
      URL.revokeObjectURL(url)
    })
}
