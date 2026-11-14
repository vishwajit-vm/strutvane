/**
 * The in-memory table behind the mock API: spike 10's `ResourceRepository` semantics over arrays.
 *
 * Semantics kept identical on purpose (the contract test checks them):
 * - search: one term, OR across fields; text fields match "contains" ignoring ASCII case, with
 *   `%` and `_` literal; number fields match exactly when the term parses as a number;
 * - sort: NULLs last in both directions, then the primary key ascending as the tie-breaker;
 * - soft-deleted rows are invisible to list, show, update and delete, but still reserve slugs;
 * - slugs: generated from the source field when not sent, `-2`, `-3` on collision, never
 *   regenerated on update.
 *
 * Extensions (design doc proposals, not in spike 10): `trashed` list modes and `restore`.
 *
 * Not modelled: `ON DELETE CASCADE / SET NULL` (spike 10's metadata does not carry them).
 *
 * @module
 */
import { isExposedField } from '../shared/exposure.ts'
import type { FieldMetadata, ResourceMetadata } from '../shared/metadata.ts'
import { slugify } from '../shared/slug.ts'
import type { ListFilter, ListRequest } from './list-query.ts'
import type { Issue } from './problem.ts'
import { coerceBodyValue, coerceQueryValue, serializeValue, type StoredValue } from './values.ts'

/**
 * A stored row: field name → value.
 *
 * @example
 * const row: Row = { id: 1, title: 'Hello', price: '0.00' }
 */
export type Row = Record<string, StoredValue>

/**
 * One page of results with Laravel-style paginator numbers (spike 10's `Page`).
 *
 * @example
 * const page: Page = { data: [], meta: { page: 1, perPage: 15, total: 0, lastPage: 1, from: null, to: null } }
 */
export interface Page {
  readonly data: Row[]
  readonly meta: { readonly page: number; readonly perPage: number; readonly total: number; readonly lastPage: number; readonly from: number | null; readonly to: number | null }
}

/**
 * The outcome of a write.
 *
 * @example
 * const refused: WriteResult = { ok: false, issues: [{ field: 'title', code: 'required', message: 'Title is required.' }] }
 */
export type WriteResult = { readonly ok: true; readonly row: Row } | { readonly ok: false; readonly issues: Issue[] }

/**
 * Looks up another resource's table, for foreign key checks.
 *
 * @example
 * const lookup: TableLookup = (table) => tables.get(table)
 */
export type TableLookup = (table: string) => MemoryTable | undefined

/**
 * CRUD over one in-memory table.
 *
 * @example
 * const posts = new MemoryTable(postsMetadata, lookup, () => new Date())
 * posts.create({ title: 'Hello', author_id: 1 })
 */
export class MemoryTable {
  readonly resource: ResourceMetadata
  readonly #rows: Row[] = []
  readonly #lookup: TableLookup
  readonly #now: () => Date
  #nextId = 1

  constructor(resource: ResourceMetadata, lookup: TableLookup, now: () => Date) {
    this.resource = resource
    this.#lookup = lookup
    this.#now = now
  }

  /**
   * Insert a row as-is (seeding). The id is assigned when missing.
   *
   * @example
   * posts.insertRaw({ title: 'Seeded', slug: 'seeded', ... })
   */
  insertRaw(row: Row): Row {
    const id = typeof row[this.resource.primaryKey] === 'number' ? Number(row[this.resource.primaryKey]) : this.#nextId
    const stored = { ...this.#withDefaults(row), [this.resource.primaryKey]: id }
    this.#nextId = Math.max(this.#nextId, id + 1)
    this.#rows.push(stored)
    return stored
  }

  /**
   * List with search, filters, sorting, pagination and the trashed mode.
   *
   * @example
   * posts.list({ page: 1, perPage: 10, sort: [], filters: [], trashed: 'without' })
   */
  list(request: ListRequest): Page {
    const matching = this.#rows.filter((row) => this.#isInTrashedMode(row, request.trashed) && this.#matchesSearch(row, request.search) && request.filters.every((filter) => this.#matchesFilter(row, filter)))
    const sorted = [...matching].sort((a, b) => this.#compareRows(a, b, request.sort))
    const offset = (request.page - 1) * request.perPage
    const data = sorted.slice(offset, offset + request.perPage).map((row) => this.serialize(row))
    return {
      data,
      meta: {
        page: request.page,
        perPage: request.perPage,
        total: matching.length,
        lastPage: Math.max(1, Math.ceil(matching.length / request.perPage)),
        from: data.length === 0 ? null : offset + 1,
        to: data.length === 0 ? null : offset + data.length,
      },
    }
  }

  /**
   * One live (not soft-deleted) row by a field value, serialized.
   *
   * @example
   * posts.findBy('slug', 'hello-world')
   */
  findBy(field: string, value: StoredValue): Row | undefined {
    const row = this.#rows.find((candidate) => candidate[field] === value && !this.#isDeleted(candidate))
    return row === undefined ? undefined : this.serialize(row)
  }

  /**
   * Validate and insert. Fills the slug, database defaults and timestamps.
   *
   * @example
   * posts.create({ title: 'Hello', author_id: 1 }) // { ok: true, row: { slug: 'hello', ... } }
   */
  create(body: unknown): WriteResult {
    const checked = this.#validate(body, 'create', undefined)
    if (!checked.ok) return checked
    const values: Row = { ...checked.values }
    const slug = this.resource.slug
    if (slug !== undefined && (values[slug.field] === undefined || values[slug.field] === '')) {
      const generated = this.#uniqueSlug(String(values[slug.from] ?? ''))
      if (generated === undefined) {
        return { ok: false, issues: [{ field: slug.field, code: 'required', message: `Couldn't build a ${slug.field} from ${slug.from}: send one, or give ${slug.from} some letters or digits.` }] }
      }
      values[slug.field] = generated
    }
    if (this.resource.timestamps) {
      const now = this.#now().toISOString()
      values['created_at'] = now
      values['updated_at'] = now
    }
    return { ok: true, row: this.serialize(this.insertRaw(values)) }
  }

  /**
   * Validate and apply a partial update; `undefined` when the row does not exist.
   *
   * @example
   * posts.update(1, { status: 'published' })
   */
  update(id: number, body: unknown): WriteResult | undefined {
    const row = this.#live(id)
    if (row === undefined) return undefined
    const checked = this.#validate(body, 'update', id)
    if (!checked.ok) return checked
    Object.assign(row, checked.values)
    if (this.resource.timestamps) row['updated_at'] = this.#now().toISOString()
    return { ok: true, row: this.serialize(row) }
  }

  /**
   * Soft delete (stamp `deleted_at`) or hard delete. `false` when there was nothing to delete.
   *
   * @example
   * posts.delete(1) // true
   */
  delete(id: number): boolean {
    const row = this.#live(id)
    if (row === undefined) return false
    if (this.resource.softDeletes) {
      const now = this.#now().toISOString()
      row['deleted_at'] = now
      if (this.resource.timestamps) row['updated_at'] = now
      return true
    }
    this.#rows.splice(this.#rows.indexOf(row), 1)
    return true
  }

  /**
   * Extension: undo a soft delete. `undefined` when no soft-deleted row has this id.
   *
   * @example
   * posts.restore(1) // { id: 1, deleted_at: null, ... }
   */
  restore(id: number): Row | undefined {
    const row = this.#rows.find((candidate) => candidate[this.resource.primaryKey] === id && this.#isDeleted(candidate))
    if (row === undefined) return undefined
    row['deleted_at'] = null
    if (this.resource.timestamps) row['updated_at'] = this.#now().toISOString()
    return this.serialize(row)
  }

  /**
   * Does a live row with this id exist? Used by other tables' foreign key checks.
   *
   * @example
   * users.exists(1) // true
   */
  exists(id: StoredValue): boolean {
    return this.#rows.some((row) => row[this.resource.primaryKey] === id)
  }

  /**
   * The row as the API returns it: no hidden fields, decimals fixed to their scale.
   *
   * @example
   * posts.serialize(row).price // '12.50'
   */
  serialize(row: Row): Row {
    const json: Row = {}
    for (const field of this.resource.fields) {
      // Secret columns (security review F-03) are never returned, whatever their `hidden` flag says.
      if (isExposedField(field)) json[field.name] = serializeValue(field, row[field.name])
    }
    return json
  }

  // ─── Reading ─────────────────────────────────────────────────────────────────────────────────

  #live(id: number): Row | undefined {
    return this.#rows.find((row) => row[this.resource.primaryKey] === id && !this.#isDeleted(row))
  }

  #isDeleted(row: Row): boolean {
    return this.resource.softDeletes && row['deleted_at'] !== null && row['deleted_at'] !== undefined
  }

  #isInTrashedMode(row: Row, mode: ListRequest['trashed']): boolean {
    if (mode === 'with') return true
    return mode === 'only' ? this.#isDeleted(row) : !this.#isDeleted(row)
  }

  #matchesSearch(row: Row, term: string | undefined): boolean {
    if (term === undefined) return true
    return this.resource.fields.some((field) => {
      // A secret column is never searched: a match would leak its contents one guess at a time.
      if (!isExposedField(field)) return false
      if (field.searchable === 'text') return containsIgnoringAsciiCase(row[field.name], term)
      if (field.searchable === 'exact') {
        const coerced = coerceQueryValue(field, term)
        return coerced.ok && sameValue(field, row[field.name], coerced.value)
      }
      return false
    })
  }

  #matchesFilter(row: Row, filter: ListFilter): boolean {
    const value = row[filter.field.name] ?? null
    switch (filter.operator) {
      case 'null':
        return (value === null) === (filter.value === true)
      case 'in':
        return Array.isArray(filter.value) && filter.value.some((item: StoredValue) => sameValue(filter.field, value, item))
      case 'contains':
        return containsIgnoringAsciiCase(value, String(filter.value))
      case 'startsWith':
        return value !== null && foldAscii(String(value)).startsWith(foldAscii(String(filter.value)))
      default:
        return compareWithOperator(filter.field, value, filter.operator, filter.value)
    }
  }

  #compareRows(a: Row, b: Row, sort: ListRequest['sort']): number {
    for (const term of sort) {
      const field = this.resource.fields.find((candidate) => candidate.name === term.field)
      if (field === undefined) continue
      const left = a[term.field] ?? null
      const right = b[term.field] ?? null
      // NULLs last in both directions, like spike 10's explicit NULLS LAST.
      if (left === null || right === null) {
        if (left === right) continue
        return left === null ? 1 : -1
      }
      const order = compareValues(field, left, right)
      if (order !== 0) return term.direction === 'asc' ? order : -order
    }
    return compareNumbers(Number(a[this.resource.primaryKey]), Number(b[this.resource.primaryKey]))
  }

  // ─── Writing ─────────────────────────────────────────────────────────────────────────────────

  #withDefaults(row: Row): Row {
    const filled: Row = {}
    for (const field of this.resource.fields) {
      const value = row[field.name]
      filled[field.name] = value !== undefined ? value : (field.default ?? null)
    }
    return filled
  }

  #validate(body: unknown, mode: 'create' | 'update', id: number | undefined): { ok: true; values: Row } | { ok: false; issues: Issue[] } {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return { ok: false, issues: [{ field: '', code: 'invalid_body', message: 'Send a JSON object, for example {"title": "Hello"}.' }] }
    }
    const issues: Issue[] = []
    const values: Row = {}
    for (const [name, raw] of Object.entries(body)) {
      const field = this.resource.fields.find((candidate) => candidate.name === name)
      if (field === undefined || !isExposedField(field)) {
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
    if (issues.length === 0) issues.push(...this.#referenceIssues(values), ...this.#uniqueIssues(values, id))
    return issues.length === 0 ? { ok: true, values } : { ok: false, issues }
  }

  #missingRequired(body: object, values: Row): Issue[] {
    return this.resource.fields
      .filter((field) => field.required && (!(field.name in body) || values[field.name] === ''))
      .map((field) => ({ field: field.name, code: 'required', message: `${field.label} is required.` }))
  }

  #referenceIssues(values: Row): Issue[] {
    const issues: Issue[] = []
    for (const field of this.resource.fields) {
      const value = values[field.name]
      if (field.references === undefined || value === undefined || value === null) continue
      const parent = this.#lookup(field.references)
      if (parent === undefined) continue
      if (!parent.exists(value)) issues.push({ field: field.name, code: 'not_found', message: `There is no ${parent.resource.label.singular.toLowerCase()} with id ${String(value)}.` })
    }
    return issues
  }

  #uniqueIssues(values: Row, id: number | undefined): Issue[] {
    const issues: Issue[] = []
    for (const field of this.resource.fields) {
      const value = values[field.name]
      if (!field.unique || value === undefined || value === null) continue
      // Soft-deleted rows count: the unique index covers them too.
      const taken = this.#rows.some((row) => row[field.name] === value && row[this.resource.primaryKey] !== id)
      if (taken) issues.push({ field: field.name, code: 'unique', message: `${field.label} "${String(value)}" is already taken.` })
    }
    return issues
  }

  #uniqueSlug(source: string): string | undefined {
    const field = this.resource.slug?.field
    const base = slugify(source)
    if (field === undefined || base === '') return undefined
    const taken = new Set(this.#rows.map((row) => String(row[field])))
    if (!taken.has(base)) return base
    let suffix = 2
    while (taken.has(`${base}-${suffix}`)) suffix++
    return `${base}-${suffix}`
  }
}

/** Fold ASCII letters only, matching SQLite's `LIKE` (spike 10's portable behaviour). */
function foldAscii(text: string): string {
  return text.replace(/[A-Z]/g, (letter) => letter.toLowerCase())
}

function containsIgnoringAsciiCase(value: StoredValue | undefined, term: string): boolean {
  if (value === null || value === undefined || typeof value === 'object') return false
  return foldAscii(String(value)).includes(foldAscii(term))
}

function sameValue(field: FieldMetadata, value: StoredValue | undefined, other: StoredValue): boolean {
  if (value === null || value === undefined) return false
  return compareValues(field, value, other) === 0
}

function compareWithOperator(field: FieldMetadata, value: StoredValue, operator: string, target: StoredValue | readonly StoredValue[]): boolean {
  // SQL: any comparison with NULL is unknown, so the row is not returned.
  if (value === null || Array.isArray(target) || target === null) return false
  const order = compareValues(field, value, target as StoredValue)
  switch (operator) {
    case 'eq':
      return order === 0
    case 'ne':
      return order !== 0
    case 'gt':
      return order > 0
    case 'gte':
      return order >= 0
    case 'lt':
      return order < 0
    case 'lte':
      return order <= 0
    default:
      return false
  }
}

/** Numbers and decimals compare as numbers; everything else in code-unit order (SQL BINARY). */
function compareValues(field: FieldMetadata, left: StoredValue, right: StoredValue): number {
  if (field.cast === 'integer' || field.cast === 'number' || field.cast === 'decimal') return compareNumbers(Number(left), Number(right))
  if (field.cast === 'boolean') return compareNumbers(Number(left), Number(right))
  const a = String(left)
  const b = String(right)
  return a < b ? -1 : a > b ? 1 : 0
}

function compareNumbers(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0
}
