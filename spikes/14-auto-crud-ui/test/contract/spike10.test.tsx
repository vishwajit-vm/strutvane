// @vitest-environment jsdom
/**
 * Proof that the UI talks to the real thing, not only to its mock:
 *
 * 1. Contract: one scripted session of 40+ requests runs against spike 10's Hono CRUD API
 *    (in-process, on `node:sqlite`) and against the mock; status codes and bodies must be identical.
 * 2. UI: the app's list, search, sort, create-with-slug, 422 and delete flows run against spike 10.
 *
 * Spike 10 is loaded at runtime from the sibling folder. Spikes are standalone, so when spike 10
 * has not been installed (`npm install` there), these tests are skipped with a message instead of
 * failing.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { screen, waitFor, within } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Transport } from '../../src/app/api/client.ts'
import { createMockApi } from '../../src/mock-api/mock-api.ts'
import { parseAppMetadata, type AppMetadata } from '../../src/shared/metadata.ts'
import { lastListQuery, NOW, renderApp } from '../app/render-app.tsx'

/** Where spike 10 lives, from this spike's root (vitest runs with the spike as cwd). */
const SPIKE10 = join(process.cwd(), '..', '10-migration-first-schema')
const INSTALLED = existsSync(join(SPIKE10, 'node_modules', 'hono'))

/** The parts of spike 10 this test uses, described locally so `tsc` never compiles spike 10. */
interface Spike10 {
  readonly createApp: () => Promise<{ fetch: (request: Request) => Response | Promise<Response> }>
  readonly metadata: AppMetadata
}

async function loadSpike10(): Promise<Spike10> {
  // Non-literal specifiers: loaded at runtime only, so this spike type-checks without spike 10.
  // Absolute file paths (forward slashes): Vite's module runner resolves them; `file://` URLs it does not.
  const sqlitePath = fileUrl(join(SPIKE10, 'src', 'db', 'sqlite.ts'))
  const appPath = fileUrl(join(SPIKE10, 'src', 'crud', 'app.ts'))
  const sqlite = (await import(/* @vite-ignore */ sqlitePath)) as { openSqlite: () => { execute: (sql: string) => Promise<void> } }
  const crud = (await import(/* @vite-ignore */ appPath)) as { createCrudApp: (db: unknown, metadata: AppMetadata, options: { now: () => Date }) => { fetch: (request: Request) => Response | Promise<Response> } }
  const metadata = parseAppMetadata(JSON.parse(readFileSync(join(SPIKE10, 'fixtures', 'blog', '.strutvane', 'resources.json'), 'utf8')))
  const schema = readFileSync(join(SPIKE10, 'fixtures', 'blog', '.strutvane', 'sql', 'schema.sqlite.sql'), 'utf8')
  return {
    metadata,
    createApp: async () => {
      const db = sqlite.openSqlite()
      await db.execute(schema)
      return crud.createCrudApp(db, metadata, { now: () => NOW })
    },
  }
}

/** A `file://` URL for a file in spike 10. */
function fileUrl(path: string): string {
  return pathToFileURL(path).href
}

/** One scripted request: method, path, optional JSON body. */
type Step = readonly [method: string, path: string, body?: unknown]

/** Seed both APIs the same way, through the API itself. */
const SEED: readonly Step[] = [
  ['POST', '/api/users', { name: 'Asha Rao', email: 'asha@example.com' }],
  ['POST', '/api/users', { name: 'Ben Okafor', email: 'ben@example.com' }],
  ['POST', '/api/categories', { name: 'Engineering' }],
  ['POST', '/api/posts', { title: 'Hello world', author_id: 1, price: '12.50', status: 'published', featured: true, published_on: '2026-10-05' }],
  ['POST', '/api/posts', { title: 'Hello world', author_id: 2, price: 3, category_id: 1 }],
  ['POST', '/api/posts', { title: 'Hello world', author_id: 1, subtitle: 'Third', meta: { tags: ['x'] } }],
  ['POST', '/api/posts', { title: '100% _literal_ search', author_id: 2, price: '100.00' }],
  ['POST', '/api/posts', { title: 'Pricing notes', author_id: 1, price: '0.5', content: 'long text' }],
]

const SCRIPT: readonly Step[] = [
  ['GET', '/api/posts'],
  ['GET', '/api/posts?page=2&perPage=2'],
  ['GET', '/api/posts?page=9&perPage=2'],
  ['GET', '/api/posts?search=hello'],
  ['GET', '/api/posts?search=HELLO'],
  ['GET', '/api/posts?search=100%25'],
  ['GET', '/api/posts?search=_'],
  ['GET', '/api/posts?search=3'],
  ['GET', '/api/posts?sort=-price,title'],
  ['GET', '/api/posts?sort=subtitle'],
  ['GET', '/api/posts?sort=-subtitle'],
  ['GET', '/api/posts?filter[status][in]=draft'],
  ['GET', '/api/posts?filter[price][gte]=10'],
  ['GET', '/api/posts?filter[price][lte]=3&filter[featured][eq]=false'],
  ['GET', '/api/posts?filter[title][contains]=WORLD'],
  ['GET', '/api/posts?filter[title][startsWith]=pri'],
  ['GET', '/api/posts?filter[subtitle][null]=true'],
  ['GET', '/api/posts?filter[category_id][null]=false'],
  ['GET', '/api/posts?filter[author_id][eq]=2'],
  ['GET', '/api/posts?filter[id][in]=1,3'],
  ['GET', '/api/posts?filter[published_on][gte]=2026-10-01'],
  ['GET', '/api/posts?sort=content'],
  ['GET', '/api/posts?filter[meta][eq]=1'],
  ['GET', '/api/posts?filter[status][gt]=a'],
  ['GET', '/api/posts?perPage=101&page=0'],
  ['GET', '/api/posts?filter[price][gte]=abc'],
  ['GET', '/api/posts/1'],
  ['GET', '/api/posts/by-slug/hello-world-2'],
  ['GET', '/api/posts/by-slug/nope'],
  ['GET', '/api/posts/999'],
  ['GET', '/api/posts/abc'],
  ['GET', '/api/tags/by-slug/x'],
  ['GET', '/api/nothing'],
  ['POST', '/api/posts', { author_id: 1 }],
  ['POST', '/api/posts', { title: 'X', author_id: 99, status: 'archived', price: '1.234', password: 'x', id: 5 }],
  ['POST', '/api/users', { name: 'Dup', email: 'asha@example.com' }],
  ['POST', '/api/posts', { title: '日本', author_id: 1 }],
  ['POST', '/api/posts', [1, 2]],
  ['PATCH', '/api/posts/1', { status: 'draft', title: 'Hello again' }],
  ['GET', '/api/posts/1'],
  ['PATCH', '/api/posts/1', { slug: 'hello-world-2' }],
  ['PATCH', '/api/posts/1', { slug: 'Not A Slug' }],
  ['DELETE', '/api/posts/2'],
  ['GET', '/api/posts/2'],
  ['DELETE', '/api/posts/2'],
  ['GET', '/api/posts'],
  ['POST', '/api/posts', { title: 'Hello world', author_id: 1 }],
]

async function run(fetch: (request: Request) => Response | Promise<Response>, steps: readonly Step[]): Promise<string[]> {
  const transcript: string[] = []
  for (const [method, path, body] of steps) {
    const init: RequestInit = body === undefined ? { method } : { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
    const response = await fetch(new Request(`http://local${path}`, init))
    const text = await response.text()
    transcript.push(`${method} ${path} → ${response.status} ${text}`)
  }
  return transcript
}

describe.skipIf(!INSTALLED)('against spike 10 (in-process Hono CRUD API on node:sqlite)', () => {
  let spike10: Spike10

  beforeAll(async () => {
    spike10 = await loadSpike10()
  })

  it("the mock and spike 10 answer the same script with identical status codes and bodies", async () => {
    const real = await spike10.createApp()
    const mock = createMockApi(spike10.metadata, { now: () => NOW })
    await run((request) => real.fetch(request), SEED)
    await run((request) => mock.handle(request), SEED)
    const realTranscript = await run((request) => real.fetch(request), SCRIPT)
    const mockTranscript = await run((request) => mock.handle(request), SCRIPT)
    expect(mockTranscript).toHaveLength(SCRIPT.length)
    for (let index = 0; index < SCRIPT.length; index++) expect(mockTranscript[index]).toBe(realTranscript[index])
  })

  it('the design-doc extensions are not in spike 10 yet: filter[trashed] is a 422 there', async () => {
    const real = await spike10.createApp()
    const response = await real.fetch(new Request('http://local/api/posts?filter[trashed]=only'))
    expect(response.status).toBe(422)
  })

  /** Render the UI with spike 10 as its backend, seeded through its own API. */
  async function renderOnSpike10(path: string) {
    const real = await spike10.createApp()
    await run((request) => real.fetch(request), SEED)
    const transport: Transport = async (request) => real.fetch(request)
    return renderApp({ path, metadata: spike10.metadata, seed: false, transport: () => transport })
  }

  it('lists, searches and sorts real rows', async () => {
    const app = await renderOnSpike10('/posts')
    const table = await screen.findByRole('table', { name: 'Posts' })
    expect(within(table).getAllByRole('row')).toHaveLength(6)
    expect(screen.getByText('Showing 1–5 of 5 posts')).toBeInTheDocument()
    await app.user.type(screen.getByRole('searchbox', { name: 'Search posts' }), 'pricing')
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Posts' })).getAllByRole('row')).toHaveLength(2))
    await app.user.click(within(screen.getByRole('columnheader', { name: /Price/ })).getByRole('button'))
    await waitFor(() => expect(lastListQuery(app.requests, 'posts')['sort']).toBe('price'))
  })

  it('creates a post through the form and opens it by slug; the server de-duplicates the slug', async () => {
    const app = await renderOnSpike10('/posts/new')
    await app.user.type(await screen.findByRole('textbox', { name: /^Title/ }), 'Hello world')
    await app.user.type(screen.getByRole('combobox', { name: /^Author/ }), 'asha')
    await app.user.click(await screen.findByRole('option', { name: 'Asha Rao' }))
    await app.user.click(screen.getByRole('button', { name: 'Create post' }))
    expect(await screen.findByRole('heading', { name: 'Hello world' })).toBeInTheDocument()
    expect(app.history.location.pathname).toBe('/posts/hello-world-4')
  })

  it("puts spike 10's 422 issues on the form fields", async () => {
    const app = await renderOnSpike10('/users/new')
    await app.user.type(await screen.findByRole('textbox', { name: /^Name/ }), 'Copy')
    await app.user.type(screen.getByRole('textbox', { name: /^Email/ }), 'asha@example.com')
    await app.user.click(screen.getByRole('button', { name: 'Create user' }))
    const email = screen.getByRole('textbox', { name: /^Email/ })
    // The description is the server's message, then the character counter.
    await waitFor(() => expect(email).toHaveAccessibleDescription('Email "asha@example.com" is already taken. 16 of 255 characters'))
    expect(email).toHaveFocus()
  })

  it('soft-deletes from the detail page and returns to the list', async () => {
    const app = await renderOnSpike10('/posts/pricing-notes')
    await app.user.click(await screen.findByRole('button', { name: 'Delete' }))
    await app.user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete post' }))
    expect(await screen.findByText('Showing 1–4 of 4 posts')).toBeInTheDocument()
  })
})

describe.skipIf(INSTALLED)('spike 10 not installed', () => {
  it('skips the contract tests (run `npm install` in spikes/10-migration-first-schema to enable them)', () => {
    expect(INSTALLED).toBe(false)
  })
})
