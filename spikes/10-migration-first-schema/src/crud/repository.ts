/**
 * Metadata-driven reads and writes for one resource: the SQL behind the CRUD API.
 *
 * Identifiers (table and column names) come only from metadata, which came from validated
 * migrations. Every value from a request is a bound parameter. Those two rules together are the
 * injection story.
 */
import { slugify } from '../naming.ts'
import { type Dialect, isMysqlFamily, quoteIdentifier, SqlParams, type SqlValue } from '../sql/dialect.ts'
import type { FieldMetadata, ResourceMetadata } from '../generate/metadata.ts'
import type { Database } from '../db/database.ts'
import type { ListFilter, ListRequest } from './list-query.ts'
import type { Issue } from './problem.ts'
import { coerceBodyValue, coerceQueryValue, serializeRow } from './values.ts'

/**
 * One page of results plus Laravel-style paginator numbers.
 *
 * @example
 * const page: Page = { data: [], meta: { page: 1, perPage: 15, total: 0, lastPage: 1, from: null, to: null } }
 */
export interface Page {
  readonly data: Record<string, unknown>[]
  readonly meta: { readonly page: number; readonly perPage: number; readonly total: number; readonly lastPage: number; readonly from: number | null; readonly to: number | null }
}

/**
 * The outcome of a write: the saved row, or why it was refused.
 *
 * @example
 * const result: WriteResult = { ok: false, issues: [{ field: 'title', code: 'required', message: 'Title is required.' }] }
 */
export type WriteResult = { readonly ok: true; readonly row: Record<string, unknown> } | { readonly ok: false; readonly issues: Issue[] }

/**
 * CRUD for one resource over one database.
 *
 * @example
 * const posts = new ResourceRepository(db, metadata, 'posts')
 * await posts.list({ page: 1, perPage: 15, sort: [], filters: [] })
 */
export class ResourceRepository {
  readonly resource: ResourceMetadata
  readonly #db: Database
  readonly #resources: readonly ResourceMetadata[]
  readonly #now: () => Date

  constructor(db: Database, resources: readonly ResourceMetadata[], resource: ResourceMetadata, now: () => Date = () => new Date()) {
    this.#db = db
    this.#resources = resources
    this.resource = resource
    this.#now = now
  }

  /**
   * List rows with search, filters, sorting and pagination.
   *
   * @example
   * await posts.list({ page: 2, perPage: 10, search: 'hello', sort: [{ field: 'price', direction: 'desc' }], filters: [] })
   */
  async list(request: ListRequest): Promise<Page> {
    const params = new SqlParams(this.#db.dialect)
    const where = this.#whereClause(request, params)
    const countRows = await this.#db.query(`SELECT COUNT(*) AS "total" FROM ${this.#table()}${where}`, params.values)
    const total = Number(countRows[0]?.['total'] ?? 0)
    const offset = (request.page - 1) * request.perPage
    const sql = `SELECT ${this.#columns()} FROM ${this.#table()}${where} ORDER BY ${this.#orderBy(request)} LIMIT ${params.add(request.perPage)} OFFSET ${params.add(offset)}`
    const rows = await this.#db.query(sql, params.values)
    const data = rows.map((row) => serializeRow(this.resource, row, this.#db.dialect))
    return {
      data,
      meta: {
        page: request.page,
        perPage: request.perPage,
        total,
        lastPage: Math.max(1, Math.ceil(total / request.perPage)),
        from: data.length === 0 ? null : offset + 1,
        to: data.length === 0 ? null : offset + data.length,
      },
    }
  }

  /**
   * One row by primary key, or `undefined` (also for soft-deleted rows).
   *
   * @example
   * await posts.findById(1)
   */
  async findById(id: number): Promise<Record<string, unknown> | undefined> {
    return this.#findBy(this.resource.primaryKey, id)
  }

  /**
   * One row by its slug, or `undefined`.
   *
   * @example
   * await posts.findBySlug('hello-world')
   */
  async findBySlug(slug: string): Promise<Record<string, unknown> | undefined> {
    const field = this.resource.slug?.field
    return field === undefined ? undefined : this.#findBy(field, slug)
  }

  /**
   * Validate and insert a row. The slug is filled in from its source column when not sent, and
   * the timestamps are stamped.
   *
   * @example
   * await posts.create({ title: 'Hello', author_id: 1 }) // { ok: true, row: { id: 1, slug: 'hello', … } }
   */
  async create(body: unknown): Promise<WriteResult> {
    const checked = await this.#validate(body, 'create', undefined)
    if (!checked.ok) return checked
    const values = { ...checked.values }
    const slug = this.resource.slug
    if (slug !== undefined && (values[slug.field] === undefined || values[slug.field] === '')) {
      const generated = await this.#uniqueSlug(String(values[slug.from] ?? ''))
      if (generated === undefined) return { ok: false, issues: [{ field: slug.field, code: 'required', message: `Couldn't build a ${slug.field} from ${slug.from}: send one, or give ${slug.from} some letters or digits.` }] }
      values[slug.field] = generated
    }
    if (this.resource.timestamps) {
      const now = this.#now().toISOString()
      values['created_at'] = now
      values['updated_at'] = now
    }
    const params = new SqlParams(this.#db.dialect)
    const names = Object.keys(values)
    const placeholders = names.map((name) => params.add(values[name] ?? null))
    const sql = `INSERT INTO ${this.#table()} (${names.map((name) => this.#q(name)).join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING ${this.#columns()}`
    const [row] = await this.#db.query(sql, params.values)
    return { ok: true, row: serializeRow(this.resource, row ?? {}, this.#db.dialect) }
  }

  /**
   * Validate and apply a partial update. Returns `undefined` when the row doesn't exist.
   * The slug is *not* regenerated when its source changes: URLs that were shared keep working.
   *
   * @example
   * await posts.update(1, { status: 'published' })
   */
  async update(id: number, body: unknown): Promise<WriteResult | undefined> {
    if ((await this.findById(id)) === undefined) return undefined
    const checked = await this.#validate(body, 'update', id)
    if (!checked.ok) return checked
    const values = { ...checked.values }
    if (this.resource.timestamps) values['updated_at'] = this.#now().toISOString()
    const params = new SqlParams(this.#db.dialect)
    const assignments = Object.keys(values).map((name) => `${this.#q(name)} = ${params.add(values[name] ?? null)}`)
    if (assignments.length === 0) return { ok: true, row: (await this.findById(id)) ?? {} }
    const sql = `UPDATE ${this.#table()} SET ${assignments.join(', ')} WHERE ${this.#q(this.resource.primaryKey)} = ${params.add(id)}${this.#notDeleted(' AND ')} RETURNING ${this.#columns()}`
    const [row] = await this.#db.query(sql, params.values)
    return row === undefined ? undefined : { ok: true, row: serializeRow(this.resource, row, this.#db.dialect) }
  }

  /**
   * Delete a row: a soft delete (stamp `deleted_at`) when the table has `softDeletes()`, a real
   * delete otherwise. Returns `false` when there was nothing to delete.
   *
   * @example
   * await posts.delete(1) // true
   */
  async delete(id: number): Promise<boolean> {
    const params = new SqlParams(this.#db.dialect)
    const key = `${this.#q(this.resource.primaryKey)} = ${params.add(id)}`
    if (this.resource.softDeletes) {
      const now = params.add(this.#now().toISOString())
      const touch = this.resource.timestamps ? `, ${this.#q('updated_at')} = ${now}` : ''
      const rows = await this.#db.query(`UPDATE ${this.#table()} SET ${this.#q('deleted_at')} = ${now}${touch} WHERE ${key}${this.#notDeleted(' AND ')} RETURNING ${this.#q(this.resource.primaryKey)}`, params.values)
      return rows.length > 0
    }
    const rows = await this.#db.query(`DELETE FROM ${this.#table()} WHERE ${key} RETURNING ${this.#q(this.resource.primaryKey)}`, params.values)
    return rows.length > 0
  }

  // ─── Validation ─────────────────────────────────────────────────────────────────────────────

  async #validate(body: unknown, mode: 'create' | 'update', id: number | undefined): Promise<{ ok: true; values: Record<string, SqlValue> } | { ok: false; issues: Issue[] }> {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return { ok: false, issues: [{ field: '', code: 'invalid_body', message: 'Send a JSON object, for example {"title": "Hello"}.' }] }
    }
    const issues: Issue[] = []
    const values: Record<string, SqlValue> = {}
    for (const [name, raw] of Object.entries(body)) {
      const field = this.resource.fields.find((candidate) => candidate.name === name)
      if (field === undefined || field.hidden) {
        issues.push({ field: name, code: 'unknown_field', message: `"${name}" isn't a field of ${this.resource.label.singular}.` })
      } else if (!field.fillable) {
        issues.push({ field: name, code: 'not_fillable', message: `${field.label} is set by the system and can't be sent.` })
      } else {
        const coerced = coerceBodyValue(field, raw)
        if (coerced.ok) values[name] = coerced.value
        else issues.push({ field: name, code: coerced.code, message: coerced.message })
      }
    }
    if (mode === 'create') issues.push(...this.#missingRequired(body, values))
    if (issues.length === 0) issues.push(...(await this.#referenceIssues(values)), ...(await this.#uniqueIssues(values, id)))
    return issues.length === 0 ? { ok: true, values } : { ok: false, issues }
  }

  /**
   * Required fields that weren't sent, or were sent empty. A field that was sent with an invalid
   * value already has its own, more precise issue, so it isn't reported a second time here.
   */
  #missingRequired(body: object, values: Record<string, SqlValue>): Issue[] {
    return this.resource.fields
      .filter((field) => field.required && (!(field.name in body) || values[field.name] === ''))
      .map((field) => ({ field: field.name, code: 'required', message: `${field.label} is required.` }))
  }

  /** Check foreign keys up front, so the client gets "Author not found" instead of a 409. */
  async #referenceIssues(values: Record<string, SqlValue>): Promise<Issue[]> {
    const issues: Issue[] = []
    for (const field of this.resource.fields) {
      const value = values[field.name]
      if (field.references === undefined || value === undefined || value === null) continue
      const parent = this.#resources.find((resource) => resource.table === field.references)
      if (parent === undefined) continue
      const params = new SqlParams(this.#db.dialect)
      const rows = await this.#db.query(`SELECT 1 AS "found" FROM ${this.#q(parent.table)} WHERE ${this.#q(parent.primaryKey)} = ${params.add(value)}`, params.values)
      if (rows.length === 0) issues.push({ field: field.name, code: 'not_found', message: `There is no ${parent.label.singular.toLowerCase()} with id ${String(value)}.` })
    }
    return issues
  }

  /**
   * Check unique columns up front for a friendly message. The unique index stays the real guard
   * (two concurrent requests can both pass this check); the API maps that error to a 409.
   */
  async #uniqueIssues(values: Record<string, SqlValue>, id: number | undefined): Promise<Issue[]> {
    const issues: Issue[] = []
    for (const field of this.resource.fields) {
      const value = values[field.name]
      if (!field.unique || value === undefined || value === null) continue
      const params = new SqlParams(this.#db.dialect)
      const notSelf = id === undefined ? '' : ` AND ${this.#q(this.resource.primaryKey)} <> ${params.add(id)}`
      const rows = await this.#db.query(`SELECT 1 AS "taken" FROM ${this.#table()} WHERE ${this.#q(field.name)} = ${params.add(value)}${notSelf}`, params.values)
      if (rows.length > 0) issues.push({ field: field.name, code: 'unique', message: `${field.label} "${String(value)}" is already taken.` })
    }
    return issues
  }

  /** `hello-world`, or `hello-world-2`, `-3`, … if taken (soft-deleted rows count: the index does). */
  async #uniqueSlug(source: string): Promise<string | undefined> {
    const field = this.resource.slug?.field
    const base = slugify(source)
    if (field === undefined || base === '') return undefined
    const params = new SqlParams(this.#db.dialect)
    const rows = await this.#db.query(
      `SELECT ${this.#q(field)} AS "slug" FROM ${this.#table()} WHERE ${this.#q(field)} = ${params.add(base)} OR ${this.#q(field)} LIKE ${params.add(`${base}-%`)}`,
      params.values,
    )
    const taken = new Set(rows.map((row) => String(row['slug'])))
    if (!taken.has(base)) return base
    let suffix = 2
    while (taken.has(`${base}-${suffix}`)) suffix++
    return `${base}-${suffix}`
  }

  // ─── SQL building ───────────────────────────────────────────────────────────────────────────

  async #findBy(column: string, value: SqlValue): Promise<Record<string, unknown> | undefined> {
    const params = new SqlParams(this.#db.dialect)
    const [row] = await this.#db.query(`SELECT ${this.#columns()} FROM ${this.#table()} WHERE ${this.#q(column)} = ${params.add(value)}${this.#notDeleted(' AND ')}`, params.values)
    return row === undefined ? undefined : serializeRow(this.resource, row, this.#db.dialect)
  }

  #whereClause(request: ListRequest, params: SqlParams): string {
    const conditions: string[] = []
    if (this.resource.softDeletes) conditions.push(`${this.#q('deleted_at')} IS NULL`)
    if (request.search !== undefined) {
      const search = this.#searchCondition(request.search, params)
      if (search !== undefined) conditions.push(search)
    }
    for (const filter of request.filters) conditions.push(this.#filterCondition(filter, params))
    return conditions.length === 0 ? '' : ` WHERE ${conditions.join(' AND ')}`
  }

  /**
   * `?search=` across every searchable field: "contains" on text fields, "equals" on number fields
   * when the term is a valid number for that field. One term, OR-ed across fields.
   */
  #searchCondition(term: string, params: SqlParams): string | undefined {
    const parts: string[] = []
    for (const field of this.resource.fields) {
      if (field.searchable === 'text') parts.push(this.#like(field, `%${escapeLike(term)}%`, params))
      if (field.searchable === 'exact') {
        const coerced = coerceQueryValue(field, term)
        if (coerced.ok) parts.push(`${this.#q(field.name)} = ${params.add(coerced.value)}`)
      }
    }
    // Nothing searchable matched the term's shape: that's "no results", not "everything".
    return parts.length === 0 ? '1 = 0' : `(${parts.join(' OR ')})`
  }

  #filterCondition(filter: ListFilter, params: SqlParams): string {
    const column = this.#q(filter.field.name)
    const value = filter.value
    switch (filter.operator) {
      case 'null':
        return `${column} IS ${value === true ? '' : 'NOT '}NULL`
      case 'in':
        return `${column} IN (${(Array.isArray(value) ? value : [value]).map((item) => params.add(item)).join(', ')})`
      case 'contains':
        return this.#like(filter.field, `%${escapeLike(String(value))}%`, params)
      case 'startsWith':
        return this.#like(filter.field, `${escapeLike(String(value))}%`, params)
      case 'ne':
        return notEqualCondition(this.#db.dialect, column, params.add(Array.isArray(value) ? null : (value as SqlValue)))
      default:
        return `${column} ${COMPARISON[filter.operator]} ${params.add(Array.isArray(value) ? null : (value as SqlValue))}`
    }
  }

  /** Case-insensitive "contains" (see {@link likeCondition}). */
  #like(field: FieldMetadata, pattern: string, params: SqlParams): string {
    return likeCondition(this.#db.dialect, this.#q(field.name), params.add(isMysqlFamily(this.#db.dialect) ? pattern.toLowerCase() : pattern))
  }

  /**
   * NULLs sort last in both directions on both engines. Left alone, PostgreSQL puts them last
   * when ascending but SQLite puts them first, and the same page would show different rows.
   * The primary key is the final tie-breaker, so pages never overlap or skip rows.
   */
  #orderBy(request: ListRequest): string {
    const terms = request.sort.map((sort) => orderTerm(this.#db.dialect, this.#q(sort.field), sort.direction))
    if (!request.sort.some((sort) => sort.field === this.resource.primaryKey)) terms.push(`${this.#q(this.resource.primaryKey)} ASC`)
    return terms.join(', ')
  }

  #notDeleted(prefix: string): string {
    return this.resource.softDeletes ? `${prefix}${this.#q('deleted_at')} IS NULL` : ''
  }

  /** Only the columns the API may return: secrets are never even selected. */
  #columns(): string {
    return this.resource.fields.filter((field) => !field.hidden).map((field) => this.#q(field.name)).join(', ')
  }

  #table(): string {
    return this.#q(this.resource.table)
  }

  #q(name: string): string {
    return quoteIdentifier(name, this.#db.dialect)
  }
}

const COMPARISON: Readonly<Record<string, string>> = { eq: '=', gt: '>', gte: '>=', lt: '<', lte: '<=' }

/** Make `%`, `_` and `!` (the escape character) in a search term match themselves. */
function escapeLike(text: string): string {
  return text.replace(/[!%_]/g, (character) => `!${character}`)
}

/**
 * A case-insensitive LIKE with `!` as the escape character. A backslash escape breaks on MySQL and
 * MariaDB (`ESCAPE '\\'` is a syntax error by default and "Incorrect arguments to ESCAPE" with
 * NO_BACKSLASH_ESCAPES; checked on 8.4.13 and 11.4.13). SQLite's LIKE ignores ASCII case,
 * PostgreSQL needs ILIKE, MySQL compares lower-cased text (binary-collated columns included); the
 * caller lower-cases the pattern there.
 *
 * @example
 * likeCondition('mysql', '`title`', '?') // "LOWER(`title`) LIKE ? ESCAPE '!'"
 */
export function likeCondition(dialect: Dialect, column: string, placeholder: string): string {
  if (dialect === 'postgres') return `CAST(${column} AS TEXT) ILIKE ${placeholder} ESCAPE '!'`
  if (isMysqlFamily(dialect)) return `LOWER(${column}) LIKE ${placeholder} ESCAPE '!'`
  return `${column} LIKE ${placeholder} ESCAPE '!'`
}

/**
 * One ORDER BY term with NULLs last in both directions. MySQL and MariaDB have no `NULLS LAST`, so
 * they sort on `col IS NULL` (0 before 1) first.
 *
 * @example
 * orderTerm('mysql', '`price`', 'desc') // '`price` IS NULL, `price` DESC'
 */
export function orderTerm(dialect: Dialect, column: string, direction: 'asc' | 'desc'): string {
  const keyword = direction.toUpperCase()
  return isMysqlFamily(dialect) ? `${column} IS NULL, ${column} ${keyword}` : `${column} ${keyword} NULLS LAST`
}

/**
 * NULL-safe "not equal": a NULL row counts as different, like JavaScript's `!==` and like the ORM
 * (spike 11) and the charts API (spike 16). Plain `<>` silently drops NULL rows.
 *
 * @example
 * notEqualCondition('postgres', '"status"', '$1') // '"status" IS DISTINCT FROM $1'
 */
export function notEqualCondition(dialect: Dialect, column: string, placeholder: string): string {
  if (dialect === 'postgres') return `${column} IS DISTINCT FROM ${placeholder}`
  if (isMysqlFamily(dialect)) return `NOT (${column} <=> ${placeholder})`
  return `${column} IS NOT ${placeholder}`
}

