import { describe, expect, it, vi } from 'vitest'
import { BackendUnavailable, SessionExpired } from '~/errors/base'
import { FileTooLarge, LeadNotFound } from '~/errors/lead'
import { SettingsInvalid } from '~/errors/settings'
import { FILE_TOO_LARGE_TEXT, mapLeadsError } from '~/errors/presentation'
import { HttpLeadRepository } from '~/repositories/adapters/lead.http'
import { HttpSettingsRepository } from '~/repositories/adapters/settings.http'

function failing(status: number) {
  const fail = () => vi.fn().mockRejectedValue({ response: { status }, statusCode: status })
  return Object.assign(fail(), { raw: fail() })
}

function fileClient(disposition: string | null) {
  const headers = new Headers(disposition === null ? {} : { 'content-disposition': disposition })
  return Object.assign(vi.fn(), { raw: vi.fn().mockResolvedValue({ _data: new Blob(['x']), headers }) })
}

describe('HttpLeadRepository', () => {
  it('list без статуса и со статусом', async () => {
    const client = vi.fn().mockResolvedValue([])
    const repo = new HttpLeadRepository(client as never)
    await repo.list()
    await repo.list('partial')
    expect(client.mock.calls[0]).toEqual(['/api/leads', {}])
    expect(client.mock.calls[1]).toEqual(['/api/leads', { query: { status: 'partial' } }])
  })

  it('413 это FileTooLarge, 404 это LeadNotFound, 401 это SessionExpired', async () => {
    await expect(new HttpLeadRepository(failing(413) as never).downloadFile(1)).rejects.toBeInstanceOf(FileTooLarge)
    await expect(new HttpLeadRepository(failing(404) as never).downloadFile(1)).rejects.toBeInstanceOf(LeadNotFound)
    await expect(new HttpLeadRepository(failing(401) as never).list()).rejects.toBeInstanceOf(SessionExpired)
  })

  it('файл запрашивается как blob, имя берётся из заголовка', async () => {
    const client = fileClient('attachment; filename="tz-7.pdf"')
    const file = await new HttpLeadRepository(client as never).downloadFile(7)
    expect(client.raw).toHaveBeenCalledWith('/api/leads/7/file', { responseType: 'blob' })
    expect(file.name).toBe('tz-7.pdf')
    expect(file.blob).toBeInstanceOf(Blob)
  })

  it('без заголовка имя по номеру заявки', async () => {
    const file = await new HttpLeadRepository(fileClient(null) as never).downloadFile(7)
    expect(file.name).toBe('tz-7')
  })

  it('текст ошибки большого файла', () => {
    expect(FILE_TOO_LARGE_TEXT).toBe('Файл больше 20 МБ. Telegram не отдаёт такие файлы ботам.')
    expect(mapLeadsError(new FileTooLarge())).toBe(FILE_TOO_LARGE_TEXT)
    expect(mapLeadsError(new BackendUnavailable())).toBe('Сервер не отвечает. Попробуйте позже.')
  })
})

describe('HttpSettingsRepository', () => {
  it('PUT шлёт hours и text', async () => {
    const client = vi.fn().mockResolvedValue({ hours: 2, text: 'т' })
    await new HttpSettingsRepository(client as never).saveReminder({ hours: 2, text: 'т' })
    expect(client).toHaveBeenCalledWith('/api/settings/reminder', { method: 'PUT', body: { hours: 2, text: 'т' } })
  })

  it('422 это SettingsInvalid', async () => {
    const repo = new HttpSettingsRepository(failing(422) as never)
    await expect(repo.saveReminder({ hours: 0, text: '' })).rejects.toBeInstanceOf(SettingsInvalid)
  })
})
