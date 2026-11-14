/**
 * The data side the controllers rely on: list-query parsing, per-dialect SQL (MySQL is the
 * default database, so its SQL text is pinned here even though no MySQL server runs in this
 * spike), metadata-derived validation and the mass-assignment rules.
 */
import { describe, expect, it } from 'vitest'
import { buildListSql, loadMetadata, mysqlDialect, parseListQuery, postgresDialect, sqliteDialect, type ListRequest } from '#strutvane/database'
import { isWritable, schemaFromMetadata } from '#strutvane/validation'
import { join } from 'node:path'

const metadata = loadMetadata(join(import.meta.dirname, '..', 'fixtures', 'example-app'))
const posts = metadata.resource('posts')
const authors = metadata.resource('authors')

function request(query: string): ListRequest {
  const parsed = parseListQuery(posts, new URLSearchParams(query))
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues))
  return parsed.request
}

describe('list SQL per dialect', () => {
  const list = request('search=50%_off&sort=title&filter[status][in]=draft,published&filter[published_at][null]=false&perPage=10&page=3')
  const constraints = [{ anyOf: [{ column: 'status', equals: 'published' }, { column: 'author_id', equals: 2 }] }] as const

  it('SQLite: numbered placeholders, LIKE with escapes, NULLS LAST and an id tie-breaker', () => {
    const { select } = buildListSql(posts, list, constraints, sqliteDialect)
    expect(select.sql).toBe(
      'SELECT * FROM "posts" WHERE "deleted_at" IS NULL AND ("status" = ?1 OR "author_id" = ?2) AND ("title" LIKE ?3 ESCAPE \'\\\' OR "slug" LIKE ?4 ESCAPE \'\\\' OR "body" LIKE ?5 ESCAPE \'\\\' OR "status" LIKE ?6 ESCAPE \'\\\') AND "status" IN (?7, ?8) AND "published_at" IS NOT NULL ORDER BY "title" ASC NULLS LAST, "id" ASC LIMIT ?9 OFFSET ?10',
    )
    expect(select.params).toEqual(['published', 2, '%50\\%\\_off%', '%50\\%\\_off%', '%50\\%\\_off%', '%50\\%\\_off%', 'draft', 'published', 10, 20])
  })

  it('MySQL (default database): positional ?, backticks, NULLS LAST emulated (unverified on a server here)', () => {
    const { select, count } = buildListSql(posts, request('sort=-published_at&filter[published_at][gte]=2026-01-01'), [], mysqlDialect)
    expect(select.sql).toBe('SELECT * FROM `posts` WHERE `deleted_at` IS NULL AND `published_at` >= ? ORDER BY `published_at` IS NULL, `published_at` DESC, `id` ASC LIMIT ? OFFSET ?')
    // MySQL DATETIME literals have no "T" or "Z".
    expect(select.params).toEqual(['2026-01-01 00:00:00.000', 15, 0])
    expect(count.sql).toBe('SELECT COUNT(*) AS `total` FROM `posts` WHERE `deleted_at` IS NULL AND `published_at` >= ?')
  })

  it('PostgreSQL: $n placeholders and ILIKE', () => {
    const { select } = buildListSql(authors, { page: 1, perPage: 5, search: 'ada', sort: [], filters: [] }, [], postgresDialect)
    // Hidden columns (api_token) are never searched; the id is only matched for numeric terms.
    expect(select.sql).toBe(`SELECT * FROM "authors" WHERE ("name" ILIKE $1 ESCAPE '\\' OR "email" ILIKE $2 ESCAPE '\\' OR "bio" ILIKE $3 ESCAPE '\\') ORDER BY "id" ASC LIMIT $4 OFFSET $5`)
    expect(buildListSql(authors, { page: 1, perPage: 5, search: '7', sort: [], filters: [] }, [], postgresDialect).select.sql).toContain('("id" = $1 OR "name" ILIKE $2')
  })

  it('fails closed on an empty anyOf and an unknown constraint column', () => {
    expect(buildListSql(posts, request(''), [{ anyOf: [] }], sqliteDialect).select.sql).toContain('1 = 0')
    expect(() => buildListSql(posts, request(''), [{ column: 'nope', equals: 1 }], sqliteDialect)).toThrow(/doesn't have/)
  })

  it('refuses bad page sizes, long searches and too many sort fields', () => {
    const parsed = parseListQuery(posts, new URLSearchParams(`perPage=101&search=${'x'.repeat(201)}&sort=a,b,c,d&filter[nope]=1&filter=x`))
    expect(parsed.ok ? [] : parsed.issues.map((issue) => issue.code)).toEqual(['invalid_integer', 'too_long', 'too_many', 'not_filterable', 'invalid_filter'])
  })
})

describe('validation derived from metadata', () => {
  it('requires required columns on create, nothing on update, and keeps limits and enums', () => {
    const create = schemaFromMetadata(posts, 'create', ['title', 'status'])
    expect(create.safeParse({ title: 'Hi' }).success).toBe(true)
    expect(create.safeParse({}).success).toBe(false)
    expect(create.safeParse({ title: 'x'.repeat(201) }).success).toBe(false)
    expect(create.safeParse({ title: 'Hi', status: 'archived' }).success).toBe(false)
    expect(schemaFromMetadata(posts, 'update', ['title']).safeParse({}).success).toBe(true)
  })

  it('F-10: without a fillable list, server-owned columns are never writable', () => {
    const field = (name: string) => posts.fields.find((entry) => entry.name === name) ?? authors.fields.find((entry) => entry.name === name)
    const writable = (name: string, owners: readonly string[] = ['users']) => {
      const found = field(name)
      if (found === undefined) throw new Error(name)
      return isWritable(found, undefined, owners)
    }
    expect(writable('title')).toBe(true)
    expect(writable('published_at')).toBe(false)
    expect(writable('is_admin')).toBe(false)
    expect(writable('api_token')).toBe(false)
    expect(writable('id')).toBe(false)
    expect(writable('author_id', ['authors'])).toBe(false)
    expect(writable('author_id', ['users'])).toBe(true)
  })

  it('a fillable list is the whole allowlist, and hidden columns stay out even if listed', () => {
    const apiToken = authors.fields.find((entry) => entry.name === 'api_token')
    const bio = authors.fields.find((entry) => entry.name === 'bio')
    expect(apiToken !== undefined && isWritable(apiToken, ['api_token'], [])).toBe(false)
    expect(bio !== undefined && isWritable(bio, ['name'], [])).toBe(false)
  })
})
