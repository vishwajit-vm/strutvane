/**
 * `registerCrud`: one generic function that gives ANY resource its five REST endpoints, fully
 * documented in OpenAPI and validated at runtime — the "write once, every model gets it" property the
 * framework's resource engine needs.
 *
 * Per resource it registers:
 *   GET    /<path>        list   (ListQuery protocol; 200 <Name>List | 422 Problem)
 *   GET    /<path>/{id}   show   (200 <Name> | 404 | 422)
 *   POST   /<path>        create (201 <Name> | 400 | 422)
 *   PATCH  /<path>/{id}   update (200 <Name> | 400 | 404 | 422)
 *   DELETE /<path>/{id}   delete (204 | 404 | 422)
 *
 * @module
 */
import { randomUUID } from 'node:crypto'
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { z } from 'zod'
import type { Problem, ValidationIssue } from './contracts.ts'
import { PROBLEM_CONTENT_TYPE } from './contracts.ts'
import { parseListQuery } from './list-query.ts'
import { fromZodIssues, notFoundProblem, ProblemSchema, validationProblem } from './problem.ts'
import type { Resource } from './resource.ts'
import type { MemoryCollection, StoredRecord } from './store.ts'

const IdParams = z.object({
  id: z.uuid().meta({ param: { name: 'id', in: 'path' }, description: 'Record id (UUID)' }),
})

/** Standard error responses, documented once and reused by every route. */
function problemResponse(description: string) {
  return { description, content: { [PROBLEM_CONTENT_TYPE]: { schema: ProblemSchema } } }
}

/** Send a problem body with the right status and media type. */
export function sendProblem(c: Context, body: Problem): Response {
  return c.body(JSON.stringify(body), body.status as 400, { 'content-type': PROBLEM_CONTENT_TYPE })
}

/** Register the five CRUD endpoints for `resource`, backed by `collection`. */
export function registerCrud<S extends z.ZodRawShape>(
  app: OpenAPIHono,
  resource: Resource<S>,
  collection: MemoryCollection<StoredRecord>,
): void {
  const { meta } = resource
  const base = `/${meta.path}`
  const tags = [meta.pluralLabel]
  const labelFor = (path: readonly (string | number)[]): string => {
    const last = [...path].reverse().find((p): p is string => typeof p === 'string')
    return (last && resource.labels.get(last)) ?? last ?? meta.label
  }
  /** Route-level hook: turn validator failures into 422 problems with labelled issues. */
  const hook = (
    result: { success: boolean; target?: string; error?: { issues: readonly { code: string; path: readonly PropertyKey[] }[] } },
    c: Context,
  ): never | undefined => {
    if (result.success || !result.error) return undefined
    const prefix = result.target === 'param' ? ['params'] : []
    // `as never`: the problem response is documented on every route (422), but zod-openapi types a
    // hook's return per route; a generic hook cannot name each route's response union.
    return sendProblem(c, validationProblem(fromZodIssues(result.error.issues, labelFor, prefix))) as never
  }

  // ── list ────────────────────────────────────────────────────────────────────────────────────
  app.openapi(
    createRoute({
      method: 'get',
      path: base,
      operationId: `list${meta.name}s`,
      summary: `List ${meta.pluralLabel.toLowerCase()}`,
      tags,
      // No `request.query` here on purpose: Hono's generic query validator would see the flat wire
      // keys (`filter[status][in]`) and reject with a bare 400. `parseListQuery` owns the wire
      // format; the typed parameter docs are injected by `buildOpenApiDocument` (see spec.ts).
      responses: {
        200: { description: 'One page of results', content: { 'application/json': { schema: resource.list } } },
        422: problemResponse('Invalid filter, sort or page parameters'),
      },
    }),
    (c) => {
      const parsed = parseListQuery(new URL(c.req.url).searchParams, resource)
      if (!parsed.ok) return sendProblem(c, validationProblem(parsed.issues)) as never
      return c.json(collection.list(parsed.query, searchableFields(resource)) as never, 200)
    },
  )

  // ── show ────────────────────────────────────────────────────────────────────────────────────
  app.openapi(
    createRoute({
      method: 'get',
      path: `${base}/{id}`,
      operationId: `get${meta.name}`,
      summary: `Get one ${meta.label.toLowerCase()}`,
      tags,
      request: { params: IdParams },
      responses: {
        200: { description: meta.label, content: { 'application/json': { schema: resource.read } } },
        404: problemResponse('Not found'),
        422: problemResponse('Invalid id'),
      },
    }),
    (c) => {
      const row = collection.get(c.req.valid('param').id)
      if (!row) return sendProblem(c, notFoundProblem(meta.label)) as never
      return c.json(row as never, 200)
    },
    hook,
  )

  // ── create ──────────────────────────────────────────────────────────────────────────────────
  app.openapi(
    createRoute({
      method: 'post',
      path: base,
      operationId: `create${meta.name}`,
      summary: `Create a ${meta.label.toLowerCase()}`,
      tags,
      request: { body: { required: true, content: { 'application/json': { schema: resource.create } } } },
      responses: {
        201: { description: 'Created', content: { 'application/json': { schema: resource.read } } },
        400: problemResponse('Malformed JSON body'),
        422: problemResponse('Validation failed'),
      },
    }),
    (c) => {
      const input = c.req.valid('json') as Record<string, unknown>
      const row = collection.put({ ...input, id: randomUUID(), createdAt: new Date().toISOString() })
      return c.json(row as never, 201)
    },
    hook,
  )

  // ── update ──────────────────────────────────────────────────────────────────────────────────
  app.openapi(
    createRoute({
      method: 'patch',
      path: `${base}/{id}`,
      operationId: `update${meta.name}`,
      summary: `Update a ${meta.label.toLowerCase()}`,
      tags,
      request: {
        params: IdParams,
        body: { required: true, content: { 'application/json': { schema: resource.update } } },
      },
      responses: {
        200: { description: 'Updated', content: { 'application/json': { schema: resource.read } } },
        400: problemResponse('Malformed JSON body'),
        404: problemResponse('Not found'),
        422: problemResponse('Validation failed'),
      },
    }),
    (c) => {
      const existing = collection.get(c.req.valid('param').id)
      if (!existing) return sendProblem(c, notFoundProblem(meta.label)) as never
      const patch = c.req.valid('json') as Record<string, unknown>
      // `undefined` keys in a PATCH mean "not sent" and must not erase stored values.
      const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
      return c.json(collection.put({ ...existing, ...defined, id: existing.id }) as never, 200)
    },
    hook,
  )

  // ── delete ──────────────────────────────────────────────────────────────────────────────────
  app.openapi(
    createRoute({
      method: 'delete',
      path: `${base}/{id}`,
      operationId: `delete${meta.name}`,
      summary: `Delete a ${meta.label.toLowerCase()}`,
      tags,
      request: { params: IdParams },
      responses: {
        204: { description: 'Deleted' },
        404: problemResponse('Not found'),
        422: problemResponse('Invalid id'),
      },
    }),
    (c) => {
      if (!collection.delete(c.req.valid('param').id)) return sendProblem(c, notFoundProblem(meta.label)) as never
      return c.body(null, 204) as never
    },
    hook,
  )
}

/** Fields `search=` looks in: those marked `searchable` in their metadata. */
function searchableFields<S extends z.ZodRawShape>(resource: Resource<S>): string[] {
  return resource.searchable
}

/** Convenience alias used by tests. */
export type IssueList = readonly ValidationIssue[]
