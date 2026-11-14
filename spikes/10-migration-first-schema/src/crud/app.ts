/**
 * A tiny CRUD API over the generated metadata, on Hono. Not one line here mentions posts, users
 * or any other table: everything comes from `resources.json`.
 *
 *   GET    /api/:resource                 list (page, perPage, search, sort, filter[…])
 *   GET    /api/:resource/:id             one row by id
 *   GET    /api/:resource/by-slug/:slug   one row by slug (resources with a slug only)
 *   POST   /api/:resource                 create (validated from the columns)
 *   PATCH  /api/:resource/:id             partial update
 *   DELETE /api/:resource/:id             delete (soft when the table has softDeletes)
 */
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { Database } from '../db/database.ts'
import { constraintViolation } from '../db/database.ts'
import type { AppMetadata, ResourceMetadata } from '../generate/metadata.ts'
import { parseListQuery } from './list-query.ts'
import { problemResponse, validationProblem } from './problem.ts'
import { ResourceRepository, type WriteResult } from './repository.ts'

/**
 * Options for {@link createCrudApp}.
 *
 * @example
 * createCrudApp(db, metadata, { now: () => new Date('2026-11-14T09:00:00Z') })
 */
export interface CrudAppOptions {
  /** The clock used for timestamps. Injected so tests are deterministic. */
  readonly now?: () => Date
}

/** Request bodies above this size are refused before parsing (the generic API has no large fields). */
const MAX_BODY_BYTES = 64 * 1024

/**
 * Build the CRUD API for every resource in the metadata.
 *
 * @example
 * const app = createCrudApp(db, generateMetadata(replay.state))
 * const response = await app.request('/api/posts?search=hello')
 */
export function createCrudApp(db: Database, metadata: AppMetadata, options: CrudAppOptions = {}): Hono {
  const app = new Hono()
  const repositories = new Map(metadata.resources.map((resource) => [resource.route, new ResourceRepository(db, metadata.resources, resource, options.now)]))
  const repositoryFor = (c: Context): ResourceRepository | undefined => repositories.get(c.req.param('resource') ?? '')

  app.use('/api/*', bodyLimit({ maxSize: MAX_BODY_BYTES, onError: () => problemResponse(413, 'payload_too_large', 'Request too large', `Send at most ${MAX_BODY_BYTES} bytes.`) }))

  app.get('/api/:resource', async (c) => {
    const repository = repositoryFor(c)
    if (repository === undefined) return unknownResource(c)
    const parsed = parseListQuery(repository.resource, new URL(c.req.url).searchParams)
    if (!parsed.ok) return validationProblem(parsed.issues)
    return c.json(await repository.list(parsed.request))
  })

  // Registered before `/:id`, so "by-slug" is never mistaken for an id.
  app.get('/api/:resource/by-slug/:slug', async (c) => {
    const repository = repositoryFor(c)
    if (repository === undefined) return unknownResource(c)
    if (repository.resource.slug === undefined) {
      const plural = repository.resource.label.plural
      return problemResponse(404, 'no_slug', 'No slugs here', `${plural} don't have a slug column, so look them up by id instead: /api/${repository.resource.route}/42.`)
    }
    const row = await repository.findBySlug(c.req.param('slug'))
    return row === undefined ? notFound(repository.resource, `slug "${c.req.param('slug')}"`) : c.json({ data: row })
  })

  app.get('/api/:resource/:id', async (c) => {
    const repository = repositoryFor(c)
    if (repository === undefined) return unknownResource(c)
    const id = parseId(c.req.param('id'))
    if (id === undefined) return badId()
    const row = await repository.findById(id)
    return row === undefined ? notFound(repository.resource, `id ${id}`) : c.json({ data: row })
  })

  app.post('/api/:resource', async (c) => {
    const repository = repositoryFor(c)
    if (repository === undefined) return unknownResource(c)
    const body = await readJson(c)
    if (body === INVALID_JSON) return invalidJson()
    return writeResponse(c, () => repository.create(body), 201)
  })

  app.patch('/api/:resource/:id', async (c) => {
    const repository = repositoryFor(c)
    if (repository === undefined) return unknownResource(c)
    const id = parseId(c.req.param('id'))
    if (id === undefined) return badId()
    const body = await readJson(c)
    if (body === INVALID_JSON) return invalidJson()
    return writeResponse(c, () => repository.update(id, body), 200, () => notFound(repository.resource, `id ${id}`))
  })

  app.delete('/api/:resource/:id', async (c) => {
    const repository = repositoryFor(c)
    if (repository === undefined) return unknownResource(c)
    const id = parseId(c.req.param('id'))
    if (id === undefined) return badId()
    return (await repository.delete(id)) ? c.body(null, 204) : notFound(repository.resource, `id ${id}`)
  })

  app.onError(() => problemResponse(500, 'internal_error', 'Something went wrong', 'The server hit an unexpected error. It has been logged; please try again.'))
  app.notFound(() => problemResponse(404, 'route_not_found', 'Not found', 'There is no endpoint at this address.'))
  return app
}

/** Turn a write outcome into a response, mapping constraint races to a calm 409. */
async function writeResponse(c: Context, write: () => Promise<WriteResult | undefined>, status: 200 | 201, missing?: () => Response): Promise<Response> {
  try {
    const result = await write()
    if (result === undefined) return missing?.() ?? problemResponse(404, 'not_found', 'Not found', 'That row no longer exists.')
    return result.ok ? c.json({ data: result.row }, status) : validationProblem(result.issues)
  } catch (error) {
    // The up-front checks passed but the database still refused: another request got there first.
    const violation = constraintViolation(error)
    if (violation === undefined) throw error
    return problemResponse(409, 'conflict', 'Conflict', violation === 'unique' ? 'Another row already uses one of these unique values. Reload and try again.' : 'A related row changed at the same time. Reload and try again.')
  }
}

const INVALID_JSON = Symbol('invalid json')

async function readJson(c: Context): Promise<unknown> {
  try {
    return (await c.req.json()) as unknown
  } catch {
    return INVALID_JSON
  }
}

function parseId(raw: string): number | undefined {
  const id = Number(raw)
  return /^\d+$/.test(raw) && Number.isSafeInteger(id) && id > 0 ? id : undefined
}

function unknownResource(c: Context): Response {
  return problemResponse(404, 'unknown_resource', 'Unknown resource', `There is no resource called "${c.req.param('resource') ?? ''}".`)
}

function notFound(resource: ResourceMetadata, what: string): Response {
  return problemResponse(404, 'not_found', 'Not found', `No ${resource.label.singular.toLowerCase()} has ${what}.`)
}

function badId(): Response {
  return problemResponse(400, 'invalid_id', 'Invalid id', 'Ids are positive whole numbers, for example /api/posts/42.')
}

function invalidJson(): Response {
  return problemResponse(400, 'invalid_json', 'Invalid JSON', 'The request body isn\'t valid JSON. Check for a missing quote or comma.')
}
