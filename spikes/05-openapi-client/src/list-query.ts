/**
 * The REST list-query protocol: one module that both PARSES (server) and SERIALIZES (client), so the
 * two sides can never drift.
 *
 * Wire format (query string):
 * - `filter[<field>][<op>]=<value>`. Multi-value operators repeat the key instead of joining with
 *   commas, so values containing commas are never mis-split:
 *   `filter[status][in]=draft&filter[status][in]=sent`, `filter[amount][between]=10&…=99`.
 *   `isNull` / `isNotNull` take the value `true`.
 * - `sort=-amount,number` (minus = descending; field names never contain commas).
 * - `page[size]=25`, plus either `page[cursor]=<opaque>` or `page[number]=3`.
 * - `search=<text>`.
 * Anything else is rejected with `unknown_parameter`, so typos fail loudly instead of being ignored.
 *
 * @module
 */
import { z } from 'zod'
import type { FilterOperator, FilterScalar, ListQuery, QueryFilter, SortDirective, ValidationIssue } from './contracts.ts'
import { LIST_QUERY_LIMITS } from './contracts.ts'
import { renderMessage } from './messages.ts'
import type { Resource } from './resource.ts'

const MULTI_VALUE: ReadonlySet<FilterOperator> = new Set(['in', 'nin', 'between'])
const NULL_CHECK: ReadonlySet<FilterOperator> = new Set(['isNull', 'isNotNull'])
const TEXT: ReadonlySet<FilterOperator> = new Set(['contains', 'startsWith', 'endsWith'])
const FILTER_KEY = /^filter\[([A-Za-z][A-Za-z0-9_]*)\]\[([A-Za-z]+)\]$/

/** Client-facing list parameters (what the typed client accepts; serialized by {@link serializeListParams}). */
export interface ListParams {
  readonly filter?: Readonly<Record<string, Readonly<Partial<Record<FilterOperator, unknown>>>>>
  readonly sort?: readonly string[]
  readonly page?: { readonly size?: number; readonly cursor?: string; readonly number?: number }
  readonly search?: string
}

/** Result of parsing: a typed `ListQuery`, or every problem found (not just the first). */
export type ParseResult =
  | { readonly ok: true; readonly query: ListQuery }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] }

// ─── Serialize (client) ──────────────────────────────────────────────────────────────────────────

/** Serialize client list params to a query string (without the leading `?`). Deterministic order. */
export function serializeListParams(params: ListParams): string {
  const out = new URLSearchParams()
  for (const [field, ops] of Object.entries(params.filter ?? {}).sort(byKey)) {
    for (const [op, value] of Object.entries(ops).sort(byKey)) {
      if (value === undefined) continue
      const key = `filter[${field}][${op}]`
      if (Array.isArray(value)) for (const v of value) out.append(key, String(v))
      else out.append(key, String(value))
    }
  }
  if (params.sort && params.sort.length > 0) out.append('sort', params.sort.join(','))
  if (params.page?.size !== undefined) out.append('page[size]', String(params.page.size))
  if (params.page?.cursor !== undefined) out.append('page[cursor]', params.page.cursor)
  if (params.page?.number !== undefined) out.append('page[number]', String(params.page.number))
  if (params.search !== undefined) out.append('search', params.search)
  return out.toString()
}

function byKey(a: [string, unknown], b: [string, unknown]): number {
  return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0
}

// ─── Parse (server) ──────────────────────────────────────────────────────────────────────────────

/** Parse and validate a list query against a resource's allow-lists. */
export function parseListQuery<S extends z.ZodRawShape>(
  search: URLSearchParams,
  resource: Resource<S>,
): ParseResult {
  const issues: ValidationIssue[] = []
  const filters: QueryFilter[] = []
  const seen = new Set<string>()

  for (const key of new Set(search.keys())) {
    if (seen.has(key)) continue
    seen.add(key)
    const values = search.getAll(key)
    const match = FILTER_KEY.exec(key)
    if (match) {
      const [, field = '', op = ''] = match
      const filter = parseFilter(field, op, values, resource, issues)
      if (filter) filters.push(filter)
    } else if (!['sort', 'page[size]', 'page[cursor]', 'page[number]', 'search'].includes(key)) {
      issues.push(issue(['query', key], 'unknown_parameter', { name: key }, key))
    }
  }

  const sort = parseSort(search.get('sort'), resource, issues)
  const page = parsePage(search, issues)
  const text = search.get('search')

  if (issues.length > 0) return { ok: false, issues }
  const query: ListQuery = {
    ...(filters.length === 1 && filters[0] ? { filter: filters[0] } : {}),
    ...(filters.length > 1 ? { filter: { op: 'and', filters } } : {}),
    ...(sort.length > 0 ? { sort } : {}),
    page,
    ...(text !== null && text !== '' ? { search: text } : {}),
  }
  return { ok: true, query }
}

function parseFilter<S extends z.ZodRawShape>(
  field: string,
  op: string,
  raw: string[],
  resource: Resource<S>,
  issues: ValidationIssue[],
): QueryFilter | undefined {
  const path = ['query', 'filter', field, op]
  const allowed = resource.filterable.get(field)
  const label = resource.labels.get(field) ?? field
  if (!allowed) {
    issues.push(issue(path, 'filter_not_allowed', {}, label))
    return undefined
  }
  if (!isOperator(op) || !allowed.operators.includes(op)) {
    issues.push(issue(path, 'operator_not_allowed', { operator: op }, label))
    return undefined
  }
  const bad = () => {
    issues.push(issue(path, 'invalid_filter_value', { operator: op }, label))
    return undefined
  }

  if (NULL_CHECK.has(op)) {
    return raw.length === 1 && raw[0] === 'true' ? { op: op as 'isNull' | 'isNotNull', field } : bad()
  }
  if (TEXT.has(op)) {
    // Text operators match substrings, so the value is NOT validated against the field's format
    // (a partial email is a valid search term). Only length and NUL are checked.
    const [value] = raw
    if (raw.length !== 1 || value === undefined || value === '' || value.length > 200 || value.includes('\u0000')) return bad()
    return { op: op as 'contains' | 'startsWith' | 'endsWith', field, value }
  }
  const coerced = raw.map((v) => coerce(v, allowed.schema))
  if (coerced.some((v) => v === undefined)) return bad()
  const values = coerced as FilterScalar[]
  if (MULTI_VALUE.has(op)) {
    if (op === 'between') {
      const [from, to] = values
      return values.length === 2 && from !== undefined && to !== undefined ? { op: 'between', field, from, to } : bad()
    }
    return values.length >= 1 && values.length <= 100 ? { op: op as 'in' | 'nin', field, values } : bad()
  }
  const [value] = values
  return values.length === 1 && value !== undefined
    ? { op: op as 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte', field, value }
    : bad()
}

/** Convert a query-string value to the field's type, then validate it with the field's own schema. */
function coerce(raw: string, schema: z.ZodType): FilterScalar | undefined {
  let value: FilterScalar = raw
  if (schema instanceof z.ZodNumber) {
    if (raw.trim() === '') return undefined
    value = Number(raw)
    if (!Number.isFinite(value)) return undefined
  } else if (schema instanceof z.ZodBoolean) {
    if (raw !== 'true' && raw !== 'false') return undefined
    value = raw === 'true'
  }
  return schema.safeParse(value).success ? value : undefined
}

function parseSort<S extends z.ZodRawShape>(raw: string | null, resource: Resource<S>, issues: ValidationIssue[]): SortDirective[] {
  if (raw === null || raw === '') return []
  const out: SortDirective[] = []
  for (const part of raw.split(',')) {
    const desc = part.startsWith('-')
    const field = desc ? part.slice(1) : part
    if (!resource.sortable.includes(field)) {
      issues.push(issue(['query', 'sort'], 'sort_not_allowed', {}, resource.labels.get(field) ?? field))
      continue
    }
    out.push({ field, direction: desc ? 'desc' : 'asc' })
  }
  return out
}

function parsePage(search: URLSearchParams, issues: ValidationIssue[]): NonNullable<ListQuery['page']> {
  const max = LIST_QUERY_LIMITS.maxPageSize
  const sizeRaw = search.get('page[size]')
  let size = LIST_QUERY_LIMITS.defaultPageSize
  if (sizeRaw !== null) {
    const n = Number(sizeRaw)
    if (!Number.isInteger(n) || n < 1 || n > max) issues.push(issue(['query', 'page', 'size'], 'invalid_page_size', { max }, 'Page size'))
    else size = n
  }
  const cursor = search.get('page[cursor]')
  const numberRaw = search.get('page[number]')
  if (cursor !== null && numberRaw !== null) {
    issues.push(issue(['query', 'page'], 'conflicting_pagination', {}, 'Page'))
    return { kind: 'cursor', size }
  }
  if (numberRaw !== null) {
    const n = Number(numberRaw)
    if (!Number.isInteger(n) || n < 1) {
      issues.push(issue(['query', 'page', 'number'], 'invalid', {}, 'Page number'))
      return { kind: 'cursor', size }
    }
    return { kind: 'offset', size, number: n }
  }
  if (cursor !== null) {
    if (decodeCursor(cursor) === undefined) issues.push(issue(['query', 'page', 'cursor'], 'invalid_cursor', {}, 'Page cursor'))
    return { kind: 'cursor', size, cursor }
  }
  return { kind: 'cursor', size }
}

function isOperator(op: string): op is FilterOperator {
  return ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'nin', 'isNull', 'isNotNull', 'contains', 'startsWith', 'endsWith', 'between'].includes(op)
}

function issue(
  path: (string | number)[],
  code: string,
  params: Record<string, string | number | boolean>,
  attribute: string,
): ValidationIssue {
  const message = renderMessage(code, params, attribute)
  return Object.keys(params).length > 0 ? { path, code, params, message } : { path, code, message }
}

// ─── Cursors (opaque to clients) ─────────────────────────────────────────────────────────────────

/** Encode a position as an opaque cursor. Clients must treat it as an opaque string. */
export function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset }), 'utf8').toString('base64url')
}

/** Decode a cursor; `undefined` if it is malformed (never throws on untrusted input). */
export function decodeCursor(cursor: string): number | undefined {
  if (cursor.length === 0 || cursor.length > 200 || !/^[A-Za-z0-9_-]+$/.test(cursor)) return undefined
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    const o = (parsed as { o?: unknown } | null)?.o
    return typeof o === 'number' && Number.isInteger(o) && o >= 0 ? o : undefined
  } catch {
    return undefined
  }
}

// ─── OpenAPI documentation of the protocol (per resource) ────────────────────────────────────────

/** An OpenAPI 3.1 parameter object (only the members this module produces). */
export interface QueryParameterObject {
  readonly name: string
  readonly in: 'query'
  readonly required: false
  readonly style: 'form' | 'deepObject'
  readonly explode: boolean
  readonly description: string
  readonly schema: Record<string, unknown>
  readonly 'x-strutvane-serialization'?: 'strutvane-list-query'
}

/**
 * OpenAPI query parameters for a resource's list endpoint, derived from {@link listParamsSchema}.
 * `filter` is documented as `deepObject` with a nested schema, which is what makes generated
 * clients type it; `x-strutvane-serialization` tells clients that the second nesting level
 * (`filter[f][op]`, repeated keys for arrays) must be serialized with {@link serializeListParams},
 * since OpenAPI's `deepObject` style only defines one level.
 */
export function listQueryParameters<S extends z.ZodRawShape>(resource: Resource<S>): QueryParameterObject[] {
  const json = stripFieldMeta(
    z.toJSONSchema(listParamsSchema(resource), { target: 'draft-2020-12', io: 'input' }),
  ) as { properties?: Record<string, Record<string, unknown>> }
  const prop = (name: string): Record<string, unknown> => json.properties?.[name] ?? {}
  const params: QueryParameterObject[] = [
    {
      name: 'filter',
      in: 'query',
      required: false,
      style: 'deepObject',
      explode: true,
      description:
        'Row filter: `filter[<field>][<operator>]=<value>`. Repeat the key for `in`, `nin` and `between`; `isNull`/`isNotNull` take `true`. Only listed fields and operators are accepted.',
      schema: prop('filter'),
      'x-strutvane-serialization': 'strutvane-list-query',
    },
    {
      name: 'sort',
      in: 'query',
      required: false,
      style: 'form',
      explode: false,
      description: 'Comma-separated sort fields; prefix with `-` for descending. An `id` tiebreak is always applied.',
      schema: prop('sort'),
    },
    {
      name: 'page',
      in: 'query',
      required: false,
      style: 'deepObject',
      explode: true,
      description: '`page[size]` (1–100, default 25) and either `page[cursor]` (opaque) or `page[number]`.',
      schema: prop('page'),
    },
  ]
  if (resource.searchable.length > 0) {
    params.push({
      name: 'search',
      in: 'query',
      required: false,
      style: 'form',
      explode: true,
      description: `Free-text search in: ${resource.searchable.join(', ')}.`,
      schema: prop('search'),
    })
  }
  return params
}

/** Remove `x-strutvane-field` copies from parameter schemas (they belong on the resource schema). */
function stripFieldMeta(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripFieldMeta)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([k]) => k !== 'x-strutvane-field' && k !== '$schema')
      .map(([k, v]) => [k, stripFieldMeta(v)]),
  )
}

/**
 * Build a Zod schema describing a resource's list params in client terms. It is used to document the
 * query parameters in OpenAPI, which is how the generated client gets TYPED filters
 * (`filter.status.in: Array<'draft' | …>`), sort (`Array<'amount' | '-amount' | …>`) and page params.
 */
export function listParamsSchema<S extends z.ZodRawShape>(resource: Resource<S>): z.ZodObject {
  const filterShape: Record<string, z.ZodType> = {}
  for (const [name, { operators, schema }] of resource.filterable) {
    const ops: Record<string, z.ZodType> = {}
    for (const op of operators) {
      if (NULL_CHECK.has(op)) ops[op] = z.literal(true)
      else if (TEXT.has(op)) ops[op] = z.string().min(1).max(200)
      else if (op === 'between') ops[op] = z.tuple([schema, schema])
      else if (op === 'in' || op === 'nin') ops[op] = z.array(schema).min(1).max(100)
      else ops[op] = schema
    }
    filterShape[name] = z.strictObject(ops).partial()
  }
  const sortValues = resource.sortable.flatMap((f) => [f, `-${f}`])
  return z.object({
    filter: z.strictObject(filterShape).partial().optional(),
    sort: (sortValues.length > 0 ? z.array(z.enum(sortValues as [string, ...string[]])) : z.array(z.never())).optional(),
    page: z
      .strictObject({
        size: z.int().min(1).max(LIST_QUERY_LIMITS.maxPageSize),
        cursor: z.string(),
        number: z.int().min(1),
      })
      .partial()
      .optional(),
    search: z.string().max(200).optional(),
  })
}
