import { FileTooLarge, LeadNotFound } from '~/errors/lead'
import type { LeadRepository } from '~/repositories/lead.port'
import type { Lead, LeadStatus } from '~/types/lead'
import { type HttpClient, request } from './http'

export class HttpLeadRepository implements LeadRepository {
  constructor(private readonly client: HttpClient) {}

  list(status?: LeadStatus): Promise<Lead[]> {
    const options = status ? { query: { status } } : {}
    return request(() => this.client<Lead[]>('/api/leads', options))
  }

  downloadFile(id: number): Promise<Blob> {
    return request(
      () => this.client<Blob>(`/api/leads/${id}/file`, { responseType: 'blob' }),
      (status) => (status === 413 ? new FileTooLarge() : status === 404 ? new LeadNotFound() : null),
    )
  }
}
