/**
 * Security rules from the v2 security design review, each as a test:
 * F-01 (no auto API for internal tables), F-07 (CSRF on every cookie-authenticated unsafe request),
 * F-11 (resource routes need a policy), F-22 (IPv6 /64 buckets), F-26 (no policy internals in
 * production 403s), plus the start-up checks that turn route mistakes into boot errors.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Application, StrutvaneError } from '#strutvane/foundation'
import { csrfToken, ipBucket, type HttpContext } from '#strutvane/http'
import { defineRoutes, Route } from '#strutvane/routing'
import { client } from '#strutvane/testing'
import { isInternalResource } from '#strutvane/database'
import { PostController } from '../fixtures/example-app/app/http/controllers/post.controller.ts'
import { Post } from '../fixtures/example-app/app/models/post.ts'
import { config } from '../fixtures/example-app/config/index.ts'
import { demoTokens } from '../fixtures/example-app/database/seeders/database.seeder.ts'
import { sortByPriority } from '../src/http/middleware.ts'
import { exampleApp, testEnv } from './helpers.ts'

const EXAMPLE = join(import.meta.dirname, '..', 'fixtures', 'example-app')
const temporary: string[] = []
afterEach(() => {
  for (const folder of temporary.splice(0)) rmSync(folder, { recursive: true, force: true })
})

/** A throwaway base path holding a copy of the example metadata, optionally edited. */
function metadataFolder(edit: (document: { resources: { table: string; internal?: boolean }[] }) => void = () => {}): string {
  const folder = mkdtempSync(join(tmpdir(), 'strut-meta-'))
  temporary.push(folder)
  cpSync(join(EXAMPLE, '.strutvane'), join(folder, '.strutvane'), { recursive: true })
  const file = join(folder, '.strutvane', 'resources.json')
  const document = JSON.parse(readFileSync(file, 'utf8')) as { resources: { table: string; internal?: boolean }[] }
  edit(document)
  writeFileSync(file, JSON.stringify(document))
  return folder
}

async function bootError(app: Application): Promise<StrutvaneError> {
  try {
    await app.boot()
  } catch (error) {
    if (error instanceof StrutvaneError) return error
    throw error
  }
  throw new Error('Expected boot to fail.')
}

describe('F-01: internal tables never get an auto API', () => {
  it('refuses at boot to serve a table flagged internal', async () => {
    const basePath = metadataFolder((document) => {
      for (const resource of document.resources) if (resource.table === 'posts') resource.internal = true
    })
    const app = Application.configure({ basePath, env: testEnv })
      .withConfig(config)
      .withRouting({ api: defineRoutes([Route.apiResource('posts', PostController, { bindBy: 'slug' })]), bindings: { post: Post } })
      .create()
    const error = await bootError(app)
    expect(error.code).toBe('INTERNAL_TABLE_EXPOSED')
    expect(error.message).toBe('PostController would serve the internal "posts" table over the API.')
  })

  it('treats framework and identity tables as internal even without the flag', () => {
    const resource = (table: string) => ({ table, model: '', route: '', label: { singular: '', plural: '' }, primaryKey: 'id', titleField: 'id', timestamps: false, softDeletes: false, defaultSort: 'id', perPage: 15, fields: [], sidebar: { order: 0, hidden: false } })
    for (const table of ['sessions', 'personal_access_tokens', 'user_roles', 'failed_jobs', 'users', 'team_invitations', 'team_whatever', 'audit_events', 'migrations']) {
      expect(isInternalResource(resource(table)), table).toBe(true)
    }
    expect(isInternalResource(resource('posts'))).toBe(false)
  })
})

describe('F-11 and start-up checks: route mistakes fail at boot, not at the first request', () => {
  const ok = (ctx: HttpContext): Response => ctx.json({})

  it('refuses resource routes whose controller has no policy', async () => {
    class LooseController {
      index(ctx: HttpContext): Response {
        return ctx.json([])
      }
      show(ctx: HttpContext): Response {
        return ctx.json({})
      }
    }
    const app = Application.configure({ basePath: metadataFolder(), env: testEnv })
      .withConfig(config)
      .withRouting({ api: defineRoutes([Route.apiResource('things', LooseController, { only: ['index', 'show'] })]), bindings: { thing: Post } })
      .create()
    expect((await bootError(app)).code).toBe('RESOURCE_WITHOUT_POLICY')
  })

  it('names a mistyped middleware alias and suggests the right one', async () => {
    const app = Application.configure({ basePath: tmpdir(), env: testEnv }).withConfig(config).withRouting({ api: defineRoutes([Route.get('/x', ok).middleware('auht')]) }).create()
    const error = await bootError(app)
    expect(error.message).toBe('No middleware is called "auht" (used by GET /api/x).')
    expect(error.hint).toBe('Did you mean "auth"?')
  })

  it('refuses {param:field} without a model binding', async () => {
    const app = Application.configure({ basePath: tmpdir(), env: testEnv }).withConfig(config).withRouting({ web: defineRoutes([Route.get('/things/{thing:slug}', ok)]) }).create()
    expect((await bootError(app)).hint).toBe('Add it in bootstrap/app.ts: withRouting({ bindings: { thing: YourModel } }).')
  })

  it('refuses a resource controller whose parameter is not bound', async () => {
    const app = Application.configure({ basePath: metadataFolder(), env: testEnv }).withConfig(config).withRouting({ api: defineRoutes([Route.apiResource('posts', PostController)]) }).create()
    expect((await bootError(app)).code).toBe('MISSING_BINDING')
  })
})

describe('F-07: CSRF for every cookie-authenticated unsafe request, /api included', () => {
  const session = 'session-123'
  const cookie = { cookie: `theme=dark; strutvane_session=${session}` }
  const cases: [string, Record<string, string>, number][] = [
    ['session cookie, no proof', cookie, 419],
    ['Sec-Fetch-Site: same-origin', { ...cookie, 'sec-fetch-site': 'same-origin' }, 401],
    ['exact APP_URL origin, no fetch metadata', { ...cookie, origin: 'http://localhost' }, 401],
    ['Origin: null (sandboxed iframe)', { ...cookie, origin: 'null' }, 419],
    ['sibling subdomain origin', { ...cookie, origin: 'http://evil.localhost' }, 419],
    ['same-site fetch even with our origin', { ...cookie, 'sec-fetch-site': 'same-site', origin: 'http://localhost' }, 419],
    ['cross-site fetch', { ...cookie, 'sec-fetch-site': 'cross-site' }, 419],
    ['valid session-bound token', { ...cookie, 'x-csrf-token': csrfToken(session, testEnv.APP_KEY) }, 401],
    ['token of another session', { ...cookie, 'x-xsrf-token': csrfToken('other-session', testEnv.APP_KEY) }, 419],
    ['Basic credentials are no excuse', { ...cookie, authorization: 'Basic YTpi' }, 419],
    ['no session cookie at all', { 'sec-fetch-site': 'cross-site' }, 401],
  ]

  it.each(cases)('%s → %i', async (_label, headers, expected) => {
    const { app } = await exampleApp()
    const response = await client(app).withHeaders(headers).postJson('/api/posts', { title: 'Forged?' })
    response.assertStatus(expected)
    if (expected === 419) response.assertProblem(419, 'csrf_token_mismatch')
  })

  it('skips the check for bearer requests and for safe methods', async () => {
    const { app } = await exampleApp()
    const crossSite = { ...cookie, 'sec-fetch-site': 'cross-site' }
    ;(await client(app).withHeaders(crossSite).actingAs(demoTokens.alice).postJson('/api/posts', { title: 'Bearer wins' })).assertStatus(201)
    ;(await client(app).withHeaders(crossSite).getJson('/api/posts')).assertStatus(200)
  })
})

describe('F-22 and F-26: rate-limit keys and production 403s', () => {
  it('buckets IPv6 clients by /64 and leaves IPv4 alone', () => {
    expect(ipBucket('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64')
    expect(ipBucket('2001:0db8:0001:0002::9')).toBe('2001:db8:1:2::/64')
    expect(ipBucket('::1')).toBe('0:0:0:0::/64')
    expect(ipBucket('203.0.113.7')).toBe('203.0.113.7')
  })

  it('runs csrf, then auth, then throttle, whatever order they were listed in', () => {
    const order = sortByPriority([{ alias: 'throttle', params: ['api'] }, { alias: 'custom', params: [] }, { alias: 'auth', params: [] }, { alias: 'csrf', params: [] }]).map((reference) => reference.alias)
    expect(order).toEqual(['csrf', 'custom', 'auth', 'throttle'])
  })

  it('explains a denial in development but never in production', async () => {
    const development = await exampleApp()
    const dev = await client(development.app).actingAs(demoTokens.alice).deleteJson('/api/posts/hello-world')
    expect(dev.path('hint')).toBe('PostPolicy has no delete() method, so this is denied (Strutvane denies by default). Add delete(user, post) to the policy to allow it.')
    const production = await exampleApp({ APP_ENV: 'production', APP_DEBUG: 'true' })
    const prod = await client(production.app).actingAs(demoTokens.alice).deleteJson('/api/posts/hello-world')
    prod.assertProblem(403, 'forbidden')
    expect(prod.text).not.toContain('PostPolicy')
    expect(prod.path('hint')).toBeUndefined()
  })
})
