import { FileTooLarge, LeadNotFound } from '~/errors/lead'
import type { LeadRepository } from '~/repositories/lead.port'
import type { Lead, LeadFile, LeadStatus } from '~/types/lead'
import { type HttpClient, request } from './http'

const FILE_NAME = /filename="([^"]+)"/

export class HttpLeadRepository implements LeadRepository {
  constructor(private readonly client: HttpClient) {}

  list(status?: LeadStatus): Promise<Lead[]> {
    const options = status ? { query: { status } } : {}
    return request(() => this.client<Lead[]>('/api/leads', options))
  }

  downloadFile(id: number): Promise<LeadFile> {
    return request(
      async () => {
        const response = await this.client.raw<Blob>(`/api/leads/${id}/file`, { responseType: 'blob' })
        const name = FILE_NAME.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? `tz-${id}`
        return { blob: response._data as Blob, name }
      },
      (status) => (status === 413 ? new FileTooLarge() : status === 404 ? new LeadNotFound() : null),
    )
  }
}
