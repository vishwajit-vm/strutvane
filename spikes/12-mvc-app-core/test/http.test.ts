/**
 * The example app end to end: real requests through routing, middleware, binding, controllers,
 * form requests, policies and SQLite. No mocks.
 *
 * Seed: Ada (admin), Alice, Bob. Posts: hello-world, routing-like-laravel (Alice, published),
 * alice-draft (Alice, draft), bob-on-policies (Bob, published), admin-notes (Ada, draft).
 */
import { describe, expect, it } from 'vitest'
import { client } from '#strutvane/testing'
import { demoTokens } from '../fixtures/example-app/database/seeders/database.seeder.ts'
import { exampleApp } from './helpers.ts'

const titles = (body: unknown): string[] => ((body as { data: { title: string }[] }).data ?? []).map((post) => post.title)

describe('index: pagination, search, sort and filters from resources.json', () => {
  it('shows guests only published posts, authors their drafts too, admins everything', async () => {
    const { app } = await exampleApp()
    const guest = await client(app).getJson('/api/posts')
    guest.assertStatus(200).assertJsonPath('meta.total', 3)
    expect(titles(guest.json)).toEqual(['Hello World', 'Routing like Laravel', 'Bob on policies'])
    ;(await client(app).actingAs(demoTokens.alice).getJson('/api/posts')).assertJsonPath('meta.total', 4)
    ;(await client(app).actingAs(demoTokens.admin).getJson('/api/posts')).assertJsonPath('meta.total', 5)
  })

  it('paginates with Laravel-style meta', async () => {
    const { app } = await exampleApp()
    const response = await client(app).getJson('/api/posts?perPage=2&page=2')
    response.assertJsonPath('meta', { page: 2, perPage: 2, total: 3, lastPage: 2, from: 3, to: 3 })
  })

  it('searches every text field case-insensitively, with % and _ taken literally', async () => {
    const { app } = await exampleApp()
    expect(titles((await client(app).getJson('/api/posts?search=ROUTING')).json)).toEqual(['Routing like Laravel'])
    expect(titles((await client(app).getJson('/api/posts?search=deny')).json)).toEqual(['Bob on policies'])
    expect(titles((await client(app).getJson('/api/posts?search=%25')).json)).toEqual([])
  })

  it('sorts and filters, and cannot see past the visibility constraint', async () => {
    const { app } = await exampleApp()
    expect(titles((await client(app).getJson('/api/posts?sort=-title')).json)).toEqual(['Routing like Laravel', 'Hello World', 'Bob on policies'])
    expect(titles((await client(app).getJson('/api/posts?filter[author_id][in]=3')).json)).toEqual(['Bob on policies'])
    ;(await client(app).getJson('/api/posts?filter[status]=draft')).assertJsonPath('meta.total', 0)
  })

  it('reports every bad query parameter at once, naming what is allowed', async () => {
    const { app } = await exampleApp()
    const response = await client(app).getJson('/api/posts?sort=secret&page=0&filter[api_token]=x&filter[status][gt]=a')
    response.assertProblem(422, 'validation_failed')
    expect((response.json as { issues: { field: string; code: string }[] }).issues.map((issue) => `${issue.field}:${issue.code}`)).toEqual([
      'page:invalid_integer',
      'sort:not_sortable',
      'filter[api_token]:not_filterable',
      'filter[status][gt]:invalid_operator',
    ])
  })

  it('never returns hidden columns', async () => {
    const { app } = await exampleApp()
    const response = await client(app).getJson('/api/authors')
    expect(response.text).not.toContain('api_token')
    response.assertJsonPath('data.0.name', 'Ada Admin')
  })
})

describe('show and route model binding', () => {
  it('binds by slug ({post:slug}) and 404s for a missing post', async () => {
    const { app } = await exampleApp()
    ;(await client(app).getJson('/api/posts/hello-world')).assertStatus(200).assertJsonPath('data.title', 'Hello World')
    const missing = await client(app).getJson('/api/posts/nope')
    missing.assertProblem(404, 'not_found').assertJsonPath('detail', 'No post matches "nope".')
  })

  it('binds by id for authors and refuses non-numeric ids without a query', async () => {
    const { app } = await exampleApp()
    ;(await client(app).getJson('/api/authors/2')).assertJsonPath('data.name', 'Alice Writer')
    ;(await client(app).getJson('/api/authors/2abc')).assertProblem(404, 'not_found')
  })

  it('answers a draft the user may not see exactly like a missing one', async () => {
    const { app } = await exampleApp()
    const hidden = await client(app).actingAs(demoTokens.bob).getJson('/api/posts/alice-draft')
    hidden.assertProblem(404, 'not_found').assertJsonPath('detail', 'No post matches "alice-draft".')
    ;(await client(app).actingAs(demoTokens.alice).getJson('/api/posts/alice-draft')).assertStatus(200)
  })

  it('serves the web side as the React shell, and binds there too', async () => {
    const { app } = await exampleApp()
    const page = await client(app).get('/posts/hello-world')
    page.assertStatus(200)
    expect(page.text).toContain('<div id="root"></div>')
    expect(page.text).toContain('<title>Blog Test</title>')
    const missing = await client(app).get('/posts/nope')
    missing.assertStatus(404)
    expect(missing.headers.get('content-type')).toContain('text/html')
  })
})

describe('store: form requests, policies and problem+json', () => {
  it('needs a signed-in user (401 with WWW-Authenticate)', async () => {
    const { app } = await exampleApp()
    const response = await client(app).postJson('/api/posts', { title: 'Hello' })
    response.assertProblem(401, 'unauthenticated')
    expect(response.headers.get('www-authenticate')).toBe('Bearer')
    ;(await client(app).actingAs('wrong-token').postJson('/api/posts', { title: 'Hello' })).assertProblem(401, 'unauthenticated')
  })

  it('validates with the form request and reports every field issue', async () => {
    const { app } = await exampleApp()
    const response = await client(app).actingAs(demoTokens.alice).postJson('/api/posts', { title: 'Hi', status: 'archived', slug: 'Not A Slug' })
    response.assertProblem(422, 'validation_failed')
    const issues = (response.json as { issues: { field: string; message: string }[] }).issues
    expect(issues.map((issue) => issue.field).sort()).toEqual(['slug', 'status', 'title'])
    expect(issues.find((issue) => issue.field === 'title')?.message).toBe('Title must be at least 3 characters.')
  })

  it('rejects fields the request does not accept (author_id can never be forged)', async () => {
    const { app } = await exampleApp()
    const response = await client(app).actingAs(demoTokens.alice).postJson('/api/posts', { title: 'Forged', author_id: 3 })
    response.assertProblem(422, 'validation_failed').assertJsonPath('issues.0', { field: 'author_id', code: 'unknown_field', message: '"author_id" is not a field you can send here. Remove it from the request body.' })
  })

  it('creates with the author from the token, a slug, timestamps and a Location header', async () => {
    const { app } = await exampleApp()
    const response = await client(app).actingAs(demoTokens.bob).postJson('/api/posts', { title: 'Crème brûlée tips', status: 'published' })
    response.assertStatus(201).assertJsonPath('data.slug', 'creme-brulee-tips').assertJsonPath('data.author_id', 3).assertJsonPath('data.published_at', '2026-11-14T10:00:00.000Z')
    expect(response.headers.get('location')).toBe('/api/posts/creme-brulee-tips')
  })

  it('gives a colliding title a random slug suffix, not a counter', async () => {
    const { app } = await exampleApp()
    const response = await client(app).actingAs(demoTokens.bob).postJson('/api/posts', { title: 'Alice draft' })
    const slug = String(response.assertStatus(201).path('data.slug'))
    expect(slug).toMatch(/^alice-draft-[a-z0-9]{4}$/)
  })

  it('returns friendly 4xx for bad bodies: 415, 400, 413 and a non-object', async () => {
    const { app } = await exampleApp()
    const alice = client(app).actingAs(demoTokens.alice)
    ;(await alice.withHeaders({ 'content-type': 'text/plain' }).send('POST', '/api/posts', 'title=x')).assertProblem(415, 'unsupported_media_type')
    ;(await alice.send('POST', '/api/posts', '{"title": ')).assertProblem(400, 'invalid_json')
    ;(await alice.postJson('/api/posts', { title: 'x'.repeat(1024 * 1024) })).assertProblem(413, 'payload_too_large')
    ;(await alice.postJson('/api/posts', ['not', 'an', 'object'])).assertProblem(422, 'validation_failed').assertJsonPath('issues.0.code', 'invalid_body')
  })

  it('derives author validation from metadata, narrowed by Author.fillable', async () => {
    const { app } = await exampleApp()
    ;(await client(app).actingAs(demoTokens.alice).postJson('/api/authors', { name: 'X', email: 'x@example.test' })).assertProblem(403, 'forbidden')
    const admin = client(app).actingAs(demoTokens.admin)
    const escalation = await admin.postJson('/api/authors', { name: 'Eve', email: 'eve@example.test', is_admin: true })
    escalation.assertProblem(422, 'validation_failed').assertJsonPath('issues.0.field', 'is_admin')
    const taken = await admin.postJson('/api/authors', { name: 'Eve', email: 'alice@example.test' })
    taken.assertProblem(422, 'validation_failed').assertJsonPath('issues.0', { field: 'email', code: 'taken', message: 'That email is already taken.' })
    const missing = await admin.postJson('/api/authors', { email: 42 })
    expect((missing.json as { issues: { message: string }[] }).issues.map((issue) => issue.message)).toEqual(['Name is required.', 'Email must be text.'])
    ;(await admin.postJson('/api/authors', { name: 'Eve', email: 'eve@example.test' })).assertStatus(201).assertJsonPath('data.is_admin', false)
  })
})

describe('update, destroy and custom actions: policies deny by default', () => {
  it('lets only the author update (others get 403)', async () => {
    const { app } = await exampleApp()
    ;(await client(app).actingAs(demoTokens.bob).patchJson('/api/posts/hello-world', { title: 'Hacked' })).assertProblem(403, 'forbidden')
    const updated = await client(app).actingAs(demoTokens.alice).patchJson('/api/posts/hello-world', { title: 'Hello again' })
    updated.assertStatus(200).assertJsonPath('data.title', 'Hello again').assertJsonPath('data.slug', 'hello-world')
    ;(await client(app).actingAs(demoTokens.alice).putJson('/api/posts/hello-world', { body: null })).assertStatus(200).assertJsonPath('data.body', null)
  })

  it('denies delete when the policy has no delete() (even to the author); admins pass through before()', async () => {
    const { app } = await exampleApp()
    const denied = await client(app).actingAs(demoTokens.alice).deleteJson('/api/posts/hello-world')
    denied.assertProblem(403, 'forbidden').assertJsonPath('detail', 'You are not allowed to delete this post.')
    expect(denied.path('hint')).toContain('PostPolicy has no delete() method')
    ;(await client(app).actingAs(demoTokens.admin).deleteJson('/api/posts/hello-world')).assertStatus(204)
    // Soft-deleted: gone from show and from lists.
    ;(await client(app).getJson('/api/posts/hello-world')).assertProblem(404, 'not_found')
    ;(await client(app).getJson('/api/posts')).assertJsonPath('meta.total', 2)
  })

  it('runs a custom controller action with typed route() links', async () => {
    const { app } = await exampleApp()
    ;(await client(app).actingAs(demoTokens.bob).postJson('/api/posts/alice-draft/publish', {})).assertProblem(404, 'not_found')
    const published = await client(app).actingAs(demoTokens.alice).postJson('/api/posts/alice-draft/publish', {})
    published.assertStatus(200).assertJsonPath('data.status', 'published').assertJsonPath('links.self', '/api/posts/alice-draft')
  })

  it('injects constructor dependencies and guards groups with middleware', async () => {
    const { app } = await exampleApp()
    ;(await client(app).getJson('/api/admin/stats')).assertProblem(401, 'unauthenticated')
    ;(await client(app).actingAs(demoTokens.alice).getJson('/api/admin/stats')).assertProblem(403, 'forbidden')
    ;(await client(app).actingAs(demoTokens.admin).getJson('/api/admin/stats')).assertStatus(200).assertJsonPath('data', { posts: 5, authors: 3 })
    ;(await client(app).actingAs(demoTokens.bob).getJson('/api/me')).assertJsonPath('data.name', 'Bob Reader')
  })
})

describe('the HTTP edges', () => {
  it('has a /up health route', async () => {
    const { app } = await exampleApp()
    ;(await client(app).getJson('/up')).assertStatus(200).assertJsonPath('status', 'ok')
  })

  it('answers 405 with Allow for a known path, 404 for an unknown one', async () => {
    const { app } = await exampleApp()
    const wrongMethod = await client(app).deleteJson('/api/posts')
    wrongMethod.assertProblem(405, 'method_not_allowed')
    expect(wrongMethod.headers.get('allow')).toBe('GET, POST')
    ;(await client(app).getJson('/api/nothing-here')).assertProblem(404, 'not_found')
  })

  it('throttles the api group by user then IP, with headers and Retry-After', async () => {
    const { app, clock } = await exampleApp()
    const guest = client(app)
    let last = await guest.getJson('/up')
    for (let index = 0; index < 120; index += 1) last = await guest.getJson('/api/authors')
    last.assertStatus(200)
    expect(last.headers.get('x-ratelimit-remaining')).toBe('0')
    const blocked = await guest.getJson('/api/authors')
    blocked.assertProblem(429, 'too_many_requests')
    expect(blocked.headers.get('retry-after')).toBe('60')
    ;(await guest.getJson('/api/posts')).assertProblem(429, 'too_many_requests')
    // A signed-in user has their own bucket (on routes that run `auth`, which always runs before `throttle`).
    ;(await guest.actingAs(demoTokens.alice).getJson('/api/posts')).assertStatus(200)
    clock.now = new Date(clock.now.getTime() + 61_000)
    ;(await guest.getJson('/api/authors')).assertStatus(200)
  })
})
