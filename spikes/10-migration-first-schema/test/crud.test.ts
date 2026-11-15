/**
 * The metadata-driven CRUD API, end to end through Hono, on SQLite and PostgreSQL. Both engines
 * must return byte-identical JSON for the same requests.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { Hono } from 'hono'
import { constraintViolation, type Database } from '../src/db/database.ts'
import { migrate } from '../src/db/migrator.ts'
import { createCrudApp } from '../src/crud/app.ts'
import { generateMetadata } from '../src/generate/metadata.ts'
import { BLOG_ROOT, ENGINES, replayApp } from './helpers.ts'

interface ApiResult {
  readonly status: number
  readonly body: unknown
  readonly contentType: string | null
}

/** Small typed views over JSON responses, so assertions read naturally. */
interface ListBody {
  data: Record<string, unknown>[]
  meta: Record<string, unknown>
}
interface ProblemBody {
  code: string
  issues?: { field: string; code: string; message: string }[]
}

/** Responses collected per engine, compared at the end to prove both engines agree. */
const transcripts = new Map<string, string[]>()

describe.each(ENGINES)('$name', ({ name, open }) => {
  let db: Database
  let app: Hono
  const transcript: string[] = []

  async function api(method: string, path: string, body?: unknown): Promise<ApiResult> {
    const init: RequestInit = body === undefined ? { method } : { method, body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json' } }
    const response = await app.request(path, init)
    const text = await response.text()
    transcript.push(`${method} ${path} → ${response.status} ${text}`)
    return { status: response.status, body: text === '' ? null : (JSON.parse(text) as unknown), contentType: response.headers.get('content-type') }
  }
  const list = async (query: string): Promise<ListBody> => (await api('GET', `/api/posts${query}`)).body as ListBody
  const titles = async (query: string): Promise<unknown[]> => (await list(query)).data.map((row) => row['title'])
  const problem = (result: ApiResult): ProblemBody => result.body as ProblemBody
  const issueCodes = (result: ApiResult): string[] => (problem(result).issues ?? []).map((issue) => `${issue.field}:${issue.code}`)

  beforeAll(async () => {
    db = await open()
    const replay = await replayApp(BLOG_ROOT)
    await migrate(db, replay)
    // A clock that ticks one second per call: deterministic timestamps and created_at ordering.
    let clock = Date.parse('2026-11-14T09:00:00.000Z')
    app = createCrudApp(db, generateMetadata(replay.state), { now: () => new Date((clock += 1000)) })
    expect((await api('POST', '/api/users', { name: 'Ada Lovelace', email: 'ada@example.com' })).status).toBe(201)
    expect((await api('POST', '/api/users', { name: 'Grace Hopper', email: 'grace@example.com' })).status).toBe(201)
    expect((await api('POST', '/api/categories', { name: 'News & Views' })).status).toBe(201)
  })

  afterAll(async () => {
    transcripts.set(name, transcript)
    await db.close()
  })

  describe('create', () => {
    test('fills the slug, defaults and timestamps, and returns the generated JSON shape', async () => {
      const result = await api('POST', '/api/posts', { title: 'Hello, World!', author_id: 1, price: 12.5, meta: { tags: ['a', 'b'], pinned: true }, published_on: '2026-11-14' })
      expect(result.status).toBe(201)
      expect(result.body).toEqual({
        data: {
          id: 1, title: 'Hello, World!', slug: 'hello-world', content: null, price: '12.50', status: 'draft', author_id: 1, featured: false,
          published_on: '2026-11-14', meta: { tags: ['a', 'b'], pinned: true }, created_at: '2026-11-14T09:00:04.000Z', updated_at: '2026-11-14T09:00:04.000Z',
          deleted_at: null, subtitle: null, category_id: null,
        },
      })
    })

    test('slugs stay unique: -2, -3, … and an explicit slug is respected', async () => {
      expect(((await api('POST', '/api/posts', { title: 'Hello world', author_id: 1 })).body as { data: { slug: string } }).data.slug).toBe('hello-world-2')
      expect(((await api('POST', '/api/posts', { title: 'Hello WORLD', author_id: 2 })).body as { data: { slug: string } }).data.slug).toBe('hello-world-3')
      expect(((await api('POST', '/api/posts', { title: 'Custom', slug: 'my-custom-slug', author_id: 1 })).body as { data: { slug: string } }).data.slug).toBe('my-custom-slug')
      expect(((await api('GET', '/api/categories/1')).body as { data: { slug: string } }).data.slug).toBe('news-views')
    })

    test('validation is derived from the columns and reports every problem at once', async () => {
      const result = await api('POST', '/api/posts', {
        title: 'x'.repeat(201), status: 'archived', price: '1.234', featured: 'yes', published_on: '2026-02-30', body: 'old name', id: 9, created_at: 'now',
      })
      expect(result.status).toBe(422)
      expect(result.contentType).toBe('application/problem+json')
      expect(issueCodes(result)).toEqual([
        'title:too_long', 'status:not_allowed', 'price:invalid_decimal', 'featured:invalid_type', 'published_on:invalid_date',
        'body:unknown_field', 'id:not_fillable', 'created_at:not_fillable', 'author_id:required',
      ])
      expect(problem(result).issues?.find((issue) => issue.field === 'status')?.message).toBe('Status must be one of: draft, published.')
    })

    test.each([
      [{ title: 'A', author_id: 99 }, 'author_id:not_found'],
      [{ title: 'A', author_id: 1, price: '12345678901' }, 'price:invalid_decimal'],
      [{ title: 'A', author_id: 1.5 }, 'author_id:invalid_integer'],
      [{ title: null, author_id: 1 }, 'title:not_nullable'],
      [{ title: '', author_id: 1 }, 'title:required'],
      [{ title: 'A', author_id: 1, slug: 'Not A Slug' }, 'slug:invalid_slug'],
      [{ title: 'A', author_id: 1, slug: 'hello-world' }, 'slug:unique'],
      [{ title: '!!!', author_id: 1 }, 'slug:required'],
    ])('refuses %o with %s', async (body, code) => {
      const result = await api('POST', '/api/posts', body)
      expect(result.status).toBe(422)
      expect(issueCodes(result)).toEqual([code])
    })

    test('secrets can\'t be written through the generic API, and are never returned', async () => {
      expect(issueCodes(await api('POST', '/api/users', { name: 'Eve', email: 'eve@example.com', password: 'hunter2' }))).toEqual(['password:unknown_field'])
      expect(issueCodes(await api('POST', '/api/users', { name: 'Ada again', email: 'ada@example.com' }))).toEqual(['email:unique'])
      const user = (await api('GET', '/api/users/1')).body as { data: Record<string, unknown> }
      expect(Object.keys(user.data)).toEqual(['id', 'name', 'email', 'created_at', 'updated_at'])
    })

    test('bad requests get clear problems: invalid JSON, non-object body, oversized body', async () => {
      expect(problem(await api('POST', '/api/posts', '{"title": ')).code).toBe('invalid_json')
      expect(issueCodes(await api('POST', '/api/posts', '[1, 2]'))).toEqual([':invalid_body'])
      expect((await api('POST', '/api/posts', { title: 'x'.repeat(70_000), author_id: 1 })).status).toBe(413)
    })
  })

  describe('read', () => {
    test('by id and by slug, with 404s that say what was missing', async () => {
      expect(((await api('GET', '/api/posts/1')).body as { data: { title: string } }).data.title).toBe('Hello, World!')
      expect(((await api('GET', '/api/posts/by-slug/hello-world-2')).body as { data: { id: number } }).data.id).toBe(2)
      const missing = await api('GET', '/api/posts/by-slug/nope')
      expect(missing.status).toBe(404)
      expect((missing.body as { detail: string }).detail).toBe('No post has slug "nope".')
      expect((await api('GET', '/api/posts/999')).status).toBe(404)
      expect(problem(await api('GET', '/api/posts/abc')).code).toBe('invalid_id')
      expect(problem(await api('GET', '/api/widgets')).code).toBe('unknown_resource')
      // Tags have no slug, so there is no by-slug endpoint for them.
      expect(problem(await api('GET', '/api/tags/by-slug/x')).code).toBe('no_slug')
    })
  })

  describe('list', () => {
    beforeAll(async () => {
      const seed = [
        { title: '50% off everything', price: '42.00', status: 'published', featured: true, subtitle: 'Sale' },
        { title: '500 apples', price: '9.99', status: 'published', content: 'Fresh fruit, HELLO there' },
        { title: 'under_score title', price: '100.00', status: 'draft', subtitle: 'Zebra', category_id: 1 },
      ]
      for (const post of seed) expect((await api('POST', '/api/posts', { author_id: 2, ...post })).status).toBe(201)
      for (let index = 1; index <= 20; index++) await api('POST', '/api/posts', { title: `Bulk post ${String(index).padStart(2, '0')}`, author_id: 1 })
    })

    test('pagination returns Laravel-style meta, and past the end is empty, not an error', async () => {
      expect((await list('?perPage=10&page=2&sort=id')).meta).toEqual({ page: 2, perPage: 10, total: 27, lastPage: 3, from: 11, to: 20 })
      expect((await list('?perPage=10&page=3&sort=id')).meta).toEqual({ page: 3, perPage: 10, total: 27, lastPage: 3, from: 21, to: 27 })
      expect(await list('?page=9')).toEqual({ data: [], meta: { page: 9, perPage: 15, total: 27, lastPage: 2, from: null, to: null } })
      // Default sort is newest first.
      expect((await titles('?perPage=1'))[0]).toBe('Bulk post 20')
    })

    test('search covers every searchable field, case-insensitively', async () => {
      expect(await titles('?search=hello&sort=id')).toEqual(['Hello, World!', 'Hello world', 'Hello WORLD', '500 apples'])
      expect(await titles('?search=SALE')).toEqual(['50% off everything'])
      expect(await titles('?search=published&sort=id')).toEqual(['50% off everything', '500 apples'])
    })

    test('a numeric term also matches number fields exactly (price, ids)', async () => {
      expect(await titles('?search=42')).toEqual(['50% off everything'])
      expect(await titles('?search=9.99')).toEqual(['500 apples'])
    })

    test('% and _ in a search term are literal characters, not wildcards', async () => {
      expect(await titles('?search=50%25')).toEqual(['50% off everything'])
      expect(await titles('?search=r_s')).toEqual(['under_score title'])
    })

    test('sorting by several fields; NULLs last on both engines', async () => {
      expect(await titles('?sort=-price,title&perPage=3')).toEqual(['under_score title', '50% off everything', 'Hello, World!'])
      expect(await titles('?sort=subtitle&perPage=3')).toEqual(['50% off everything', 'under_score title', 'Hello, World!'])
      expect(await titles('?sort=-subtitle&perPage=3')).toEqual(['under_score title', '50% off everything', 'Hello, World!'])
    })

    test.each([
      ['filter[status]=published', ['50% off everything', '500 apples']],
      ['filter[status][in]=draft,published&filter[price][gte]=40', ['50% off everything', 'under_score title']],
      ['filter[featured]=true', ['50% off everything']],
      ['filter[price][lt]=10&filter[price][gt]=1', ['500 apples']],
      ['filter[subtitle][null]=false', ['50% off everything', 'under_score title']],
      ['filter[category_id]=1', ['under_score title']],
      ['filter[author_id][ne]=1', ['Hello WORLD', '50% off everything', '500 apples', 'under_score title']],
      ['filter[title][startsWith]=hello', ['Hello, World!', 'Hello world', 'Hello WORLD']],
      ['filter[title][contains]=_', ['under_score title']],
      ['filter[created_at][lt]=2026-11-14T09:00:05Z', ['Hello, World!']],
      ['filter[created_at][lte]=2026-11-14T09:00:05Z', ['Hello, World!', 'Hello world']],
      ['filter[published_on]=2026-11-14', ['Hello, World!']],
    ])('?%s', async (query, expected) => {
      expect(await titles(`?${query}&sort=id&perPage=100`)).toEqual(expected)
    })

    test.each([
      ['filter[nope]=1', 'filter[nope]:not_filterable'],
      ['filter[meta]=x', 'filter[meta]:not_filterable'],
      ['filter[password]=x', 'filter[password]:not_filterable'],
      ['filter[price][contains]=1', 'filter[price][contains]:invalid_operator'],
      ['filter[featured]=maybe', 'filter[featured]:invalid_boolean'],
      ['filter[price][gte]=ten', 'filter[price][gte]:invalid_decimal'],
      ['filter[status]=archived', 'filter[status]:not_allowed'],
      // The key is URL-encoded, otherwise the '=' inside it would end the key early.
      [`${encodeURIComponent('filter[title" OR 1=1 --]')}=x`, 'filter[title" OR 1=1 --]:invalid_filter'],
      ['sort=content', 'sort:not_sortable'],
      ['sort=title;DROP TABLE posts', 'sort:not_sortable'],
      ['sort=a,b,c,d', 'sort:too_many'],
      ['perPage=1000', 'perPage:invalid_integer'],
      ['page=0', 'page:invalid_integer'],
      [`search=${'x'.repeat(201)}`, 'search:too_long'],
    ])('?%s is refused with %s', async (query, code) => {
      const result = await api('GET', `/api/posts?${query}`)
      expect(result.status).toBe(422)
      expect(issueCodes(result)).toEqual([code])
    })

    test('SQL in a search term is just text: no match, and the table is intact', async () => {
      expect(await titles(`?search=${encodeURIComponent("' OR 1=1 --")}`)).toEqual([])
      expect((await list('')).meta['total']).toBe(27)
    })
  })

  describe('update and delete', () => {
    test('PATCH changes only what is sent, bumps updated_at, and keeps the slug stable', async () => {
      const before = ((await api('GET', '/api/posts/1')).body as { data: Record<string, unknown> }).data
      const result = await api('PATCH', '/api/posts/1', { title: 'Renamed', status: 'published' })
      expect(result.status).toBe(200)
      const after = (result.body as { data: Record<string, unknown> }).data
      expect(after).toMatchObject({ title: 'Renamed', status: 'published', slug: 'hello-world', created_at: before['created_at'] })
      expect(after['updated_at']).not.toBe(before['updated_at'])
    })

    test('PATCH validates too: unique slug (other rows only), enum values, unknown rows', async () => {
      expect(issueCodes(await api('PATCH', '/api/posts/1', { slug: 'hello-world-2' }))).toEqual(['slug:unique'])
      expect((await api('PATCH', '/api/posts/1', { slug: 'hello-world' })).status).toBe(200)
      expect(issueCodes(await api('PATCH', '/api/posts/1', { status: 'archived' }))).toEqual(['status:not_allowed'])
      expect((await api('PATCH', '/api/posts/999', { title: 'x' })).status).toBe(404)
    })

    test('DELETE soft-deletes posts: hidden from reads, still in the table, slug still reserved', async () => {
      expect((await api('DELETE', '/api/posts/2')).status).toBe(204)
      expect((await api('GET', '/api/posts/2')).status).toBe(404)
      expect((await api('DELETE', '/api/posts/2')).status).toBe(404)
      expect((await list('')).meta['total']).toBe(26)
      const raw = await db.query('SELECT "deleted_at" FROM "posts" WHERE "id" = 2')
      expect(raw[0]?.['deleted_at']).not.toBeNull()
      expect(((await api('POST', '/api/posts', { title: 'Hello world', author_id: 1 })).body as { data: { slug: string } }).data.slug).toBe('hello-world-4')
    })

    test('DELETE removes rows for real when the table has no softDeletes', async () => {
      expect((await api('POST', '/api/tags', { name: 'typescript' })).status).toBe(201)
      expect((await api('DELETE', '/api/tags/1')).status).toBe(204)
      expect(await db.query('SELECT COUNT(*) AS "n" FROM "tags"')).toEqual([{ n: 0 }])
    })

    test('a constraint the pre-checks missed (a race) is recognised on both engines and mapped to 409', async () => {
      const raced = db.query(`INSERT INTO "users" ("name", "email") VALUES ('Dup', 'ada@example.com')`)
      await expect(raced).rejects.toThrow()
      expect(constraintViolation(await raced.catch((error: unknown) => error))).toBe('unique')
    })

    test('date-time values need an explicit zone and a real calendar date (no server-time-zone guessing)', async () => {
      // Date.parse() read '2026-11-14T10:00:00' in the *server's* time zone, so the same request
      // matched different rows depending on where the app ran; it also took 'Nov 14 2026' and '1'.
      for (const value of ['2026-11-14T10:00:00', '2026-11-14 10:00:00', 'Nov 14 2026', '1', '2026-02-30T00:00:00Z', '2026-11-14T24:00:00Z', '0999-12-31T00:00:00Z']) {
        const result = await api('GET', `/api/posts?filter[created_at][gte]=${encodeURIComponent(value)}`)
        expect([result.status, issueCodes(result)], value).toEqual([422, ['filter[created_at][gte]:invalid_datetime']])
      }
      for (const value of ['2026-11-14T09:00:00Z', '2026-11-14T14:30:00+05:30', '2026-11-14']) {
        expect((await api('GET', `/api/posts?filter[created_at][gte]=${encodeURIComponent(value)}`)).status, value).toBe(200)
      }
    })

    test('a JSON field round-trips every JSON value, and one odd row never breaks the list', async () => {
      // PostgreSQL hands jsonb back parsed, so a stored JSON *string* arrived as a plain JS string and
      // was parsed a second time: "hello" crashed every read of the row (and every page holding it)
      // with a 500, and "123" came back as the number 123.
      for (const meta of ['hello', '123', 'null', 42, true, [1, 'a'], { a: 'x' }]) {
        const created = await api('POST', '/api/posts', { title: `JSON ${JSON.stringify(meta)}`, author_id: 1, meta })
        expect(created.status, JSON.stringify(meta)).toBe(201)
        const id = (created.body as { data: { id: number } }).data.id
        const fetched = await api('GET', `/api/posts/${id}`)
        expect([fetched.status, (fetched.body as { data: { meta: unknown } }).data.meta], JSON.stringify(meta)).toEqual([200, meta])
      }
      expect((await api('GET', '/api/posts?search=JSON&perPage=100')).status).toBe(200)
    })
  })
})

describe('both engines agree', () => {
  test('every request returned byte-identical JSON on SQLite and PostgreSQL', () => {
    const [sqlite, postgres] = [...transcripts.values()]
    expect(sqlite?.length).toBeGreaterThan(80)
    expect(postgres).toEqual(sqlite)
  })
})
