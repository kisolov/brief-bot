import { DraftConflict, ScenarioInvalid, VersionNotFound } from '~/errors/scenario'
import type { ScenarioRepository } from '~/repositories/scenario.port'
import type { Draft, Issue, Scenario, VersionInfo } from '~/types/scenario'
import { type HttpClient, request } from './http'

export class HttpScenarioRepository implements ScenarioRepository {
  constructor(private readonly client: HttpClient) {}

  getDraft(): Promise<Draft> {
    return request(() => this.client<Draft>('/api/scenario/draft', {}))
  }

  async saveDraft(data: Scenario, revision: number): Promise<number> {
    const res = await request(
      () => this.client<{ revision: number }>('/api/scenario/draft', { method: 'PUT', body: { data, revision } }),
      (status) => (status === 409 ? new DraftConflict() : null),
    )
    return res.revision
  }

  async publish(): Promise<number> {
    const res = await request(
      () => this.client<{ version: number }>('/api/scenario/publish', { method: 'POST' }),
      (status, body) => (status === 422 ? new ScenarioInvalid(issuesOf(body)) : null),
    )
    return res.version
  }

  getVersions(): Promise<VersionInfo[]> {
    return request(() => this.client<VersionInfo[]>('/api/scenario/versions', {}))
  }

  async activate(n: number): Promise<void> {
    await request(
      () => this.client(`/api/scenario/versions/${n}/activate`, { method: 'POST' }),
      (status) => (status === 404 ? new VersionNotFound() : null),
    )
  }
}

function issuesOf(body: unknown): Issue[] {
  const issues = (body as { issues?: Issue[] } | null)?.issues
  return Array.isArray(issues) ? issues : []
}
