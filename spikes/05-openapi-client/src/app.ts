/**
 * The spike's API: every resource gets CRUD via {@link registerCrud}; the OpenAPI document is served
 * at `/openapi.json` and interactive docs at `/docs` (Scalar). Every failure — validation, malformed
 * JSON, unknown route, unexpected exception — leaves as an RFC 9457 problem; internals never leak.
 *
 * @module
 */
import { randomUUID } from 'node:crypto'
import { OpenAPIHono } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { HTTPException } from 'hono/http-exception'
import type { z } from 'zod'
import { registerCrud, sendProblem } from './crud.ts'
import { Customer, Invoice } from './models.ts'
import { problem } from './problem.ts'
import type { Resource } from './resource.ts'
import { buildOpenApiDocument } from './spec.ts'
import { MemoryCollection, type StoredRecord } from './store.ts'

/** Every resource the app exposes. Adding a model here is all it takes to get its five endpoints. */
export const RESOURCES: readonly Resource<z.ZodRawShape>[] = [
  Customer as unknown as Resource<z.ZodRawShape>,
  Invoice as unknown as Resource<z.ZodRawShape>,
]

/** Options for {@link createApp}. */
export interface AppOptions {
  /**
   * Called with the trace id and the error for every unexpected failure. The real framework routes
   * this to the `Logger` contract (RFC-0004); the spike keeps it injectable so tests can assert on it
   * and nothing writes to the console.
   */
  readonly onUnexpectedError?: (traceId: string, error: unknown) => void
}

/** Create a fresh app with empty in-memory collections. */
export function createApp(options: AppOptions = {}): OpenAPIHono {
  const app = new OpenAPIHono()

  for (const resource of RESOURCES) registerCrud(app, resource, new MemoryCollection<StoredRecord>())

  app.get('/openapi.json', (c) => c.json(buildOpenApiDocument(app, RESOURCES)))
  app.get('/docs', Scalar({ url: '/openapi.json', pageTitle: 'Strutvane spike 05 API' }))

  app.notFound((c) => sendProblem(c, problem(404, 'NOT_FOUND', 'Not found', { detail: 'No such endpoint.' })))
  app.onError((error, c) => {
    if (error instanceof HTTPException && error.status === 400) {
      return sendProblem(c, problem(400, 'MALFORMED_REQUEST', 'Malformed request', { detail: 'The request body is not valid JSON.' }))
    }
    // Unexpected: log the details server-side, return only a reference id.
    const traceId = randomUUID().replaceAll('-', '')
    options.onUnexpectedError?.(traceId, error)
    return sendProblem(c, problem(500, 'INTERNAL_ERROR', 'Something went wrong', { traceId }))
  })

  return app
}
