/**
 * The API surface the renderer depends on. The real implementation will be generated from the
 * resource manifest / OpenAPI (spike 03); tests use the in-memory FakeApi. Components never call
 * fetch directly, which keeps them testable and transport-agnostic.
 */
import type { ApiRecord, ListQuery, ListResult } from './contracts.ts'

export interface ResourceApi {
  list(path: string, query: ListQuery, signal?: AbortSignal): Promise<ListResult<ApiRecord>>
  get(path: string, id: string): Promise<ApiRecord>
  create(path: string, values: Record<string, unknown>): Promise<ApiRecord>
  update(path: string, id: string, values: Record<string, unknown>): Promise<ApiRecord>
}
