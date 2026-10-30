import { BackendUnavailable, DomainError, SessionExpired } from '~/errors/base'

/** Клиент HTTP по форме совпадает с `$fetch`; адаптеры получают его через конструктор. */
export type HttpClient = <T = unknown>(url: string, options?: Record<string, unknown>) => Promise<T>

interface FetchLikeError {
  statusCode?: number
  status?: number
  response?: { status?: number; _data?: unknown }
  data?: unknown
}

function statusOf(e: unknown): number | null {
  const err = e as FetchLikeError | null
  return err?.response?.status ?? err?.statusCode ?? err?.status ?? null
}

function bodyOf(e: unknown): unknown {
  const err = e as FetchLikeError | null
  return err?.response?._data ?? err?.data
}

/**
 * Единый разбор сбоя: 401 это SessionExpired, остальные статусы адаптер переводит
 * сам через `map`, всё нераспознанное превращается в BackendUnavailable.
 */
export async function request<T>(
  call: () => Promise<T>,
  map?: (status: number, body: unknown) => DomainError | null,
): Promise<T> {
  try {
    return await call()
  } catch (e) {
    if (e instanceof DomainError) throw e
    const status = statusOf(e)
    if (status === 401) throw new SessionExpired()
    const mapped = status !== null ? map?.(status, bodyOf(e)) : null
    throw mapped ?? new BackendUnavailable()
  }
}
