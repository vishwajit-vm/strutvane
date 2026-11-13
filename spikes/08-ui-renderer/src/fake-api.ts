/**
 * In-memory API that behaves like the planned Strutvane server for the purposes of this spike:
 * - list: filter (two-valued null-safe semantics, ADR-0008), search, sort (stable, id tiebreak),
 *   cursor pagination (page size capped at LIST_QUERY_LIMITS.maxPageSize);
 * - create/update: server-side validation with the SAME catalog as the client, plus server-only
 *   rules (unique number, cross-field date rule), returning RFC 9457 problems with `issues`;
 * - `failNext()` to simulate non-validation failures (409, 500, …);
 * - `requests` records every ListQuery received, so tests can assert what the UI asked for.
 */
import type { ResourceApi } from './api.ts'
import {
  type ApiRecord,
  LIST_QUERY_LIMITS,
  type ListQuery,
  type ListResult,
  type Problem,
  type QueryFilter,
  type ResourceDescriptor,
  type ResourceManifest,
  type ValidationIssue,
} from './contracts.ts'
import { ApiProblemError } from './errors.ts'
import { defaultMessages, formatMessage } from './messages.ts'
import { validateArrayItems, validateField } from './validation.ts'

type Row = Record<string, unknown> & { id: string }

export class FakeApi implements ResourceApi {
  readonly requests: { path: string; query: ListQuery }[] = []
  private readonly tables = new Map<string, Row[]>()
  private readonly resources: Map<string, ResourceDescriptor>
  private nextFailure: Problem | undefined
  private seq = 0

  constructor(manifest: ResourceManifest, seed: Record<string, Row[]> = {}) {
    this.resources = new Map(manifest.resources.map((r) => [r.path, r]))
    for (const r of manifest.resources) this.tables.set(r.path, [...(seed[r.path] ?? [])])
  }

  /** Make the next create/update fail with this problem (non-validation scenarios). */
  failNext(problem: Problem): void {
    this.nextFailure = problem
  }

  async list(path: string, query: ListQuery): Promise<ListResult<ApiRecord>> {
    this.requests.push({ path, query })
    const resource = this.resource(path)
    let rows = [...this.table(path)]
    if (query.filter) rows = rows.filter((r) => matches(query.filter as QueryFilter, r))
    if (query.search) {
      const needle = query.search.toLowerCase()
      const searchable = resource.fields.filter((f) => f.searchable).map((f) => f.name)
      rows = rows.filter((r) => searchable.some((n) => String(r[n] ?? '').toLowerCase().includes(needle)))
    }
    rows.sort(compareBy(query.sort ?? []))

    const size = Math.min(query.page?.size ?? LIST_QUERY_LIMITS.defaultPageSize, LIST_QUERY_LIMITS.maxPageSize)
    const offset = query.page?.kind === 'cursor' && query.page.cursor ? decodeCursor(query.page.cursor) : 0
    const data = rows.slice(offset, offset + size)
    const hasMore = offset + size < rows.length
    return {
      data,
      meta: { page: { size, hasMore, ...(hasMore ? { nextCursor: encodeCursor(offset + size) } : {}) } },
    }
  }

  async get(path: string, id: string): Promise<ApiRecord> {
    const row = this.table(path).find((r) => r.id === id)
    if (!row) throw new ApiProblemError(problem(404, 'NOT_FOUND', 'Not found', 'This record no longer exists.'))
    return row
  }

  async create(path: string, values: Record<string, unknown>): Promise<ApiRecord> {
    this.throwIfFailing()
    const resource = this.resource(path)
    this.validateOrThrow(resource, values, undefined)
    const row: Row = { ...values, id: `${path}-${++this.seq}`, createdAt: '2026-11-13T10:00:00.000Z' }
    this.table(path).push(row)
    return row
  }

  async update(path: string, id: string, values: Record<string, unknown>): Promise<ApiRecord> {
    this.throwIfFailing()
    const resource = this.resource(path)
    const table = this.table(path)
    const index = table.findIndex((r) => r.id === id)
    const current = table[index]
    if (index < 0 || !current) throw new ApiProblemError(problem(404, 'NOT_FOUND', 'Not found', 'This record no longer exists.'))
    this.validateOrThrow(resource, values, id)
    const updated: Row = { ...current, ...values, id }
    table[index] = updated
    return updated
  }

  // ── internals ──────────────────────────────────────────────────────────────────────────────

  private validateOrThrow(resource: ResourceDescriptor, values: Record<string, unknown>, id: string | undefined): void {
    const issues: ValidationIssue[] = []
    for (const field of resource.fields) {
      if (field.readOnly || (id !== undefined && field.writeOnce)) continue
      issues.push(...validateField(field, values[field.name], defaultMessages))
      if (field.type === 'array') issues.push(...validateArrayItems(field, values[field.name], defaultMessages))
    }
    // Server-only rule 1: unique fields.
    for (const field of resource.fields.filter((f) => f.unique)) {
      const v = values[field.name]
      if (v !== undefined && this.table(resource.path).some((r) => r.id !== id && r[field.name] === v)) {
        issues.push({ path: [field.name], code: 'unique', message: formatMessage(defaultMessages, 'unique', { attribute: field.label.toLowerCase() }) })
      }
    }
    // Server-only rule 2 (Invoice): due date on or after issue date (cross-field, RFC-0003 row 2).
    if (resource.name === 'Invoice' && typeof values.dueDate === 'string' && typeof values.issueDate === 'string' && values.dueDate < values.issueDate) {
      issues.push({ path: ['dueDate'], code: 'date_before_field', params: { other: 'Issue date' }, message: formatMessage(defaultMessages, 'date_before_field', { attribute: 'Due date', other: 'Issue date' }) })
    }
    if (issues.length > 0) {
      throw new ApiProblemError({
        ...problem(422, 'VALIDATION_FAILED', 'Validation failed'),
        issues,
      })
    }
  }

  private throwIfFailing(): void {
    if (this.nextFailure) {
      const p = this.nextFailure
      this.nextFailure = undefined
      throw new ApiProblemError(p)
    }
  }

  private resource(path: string): ResourceDescriptor {
    const r = this.resources.get(path)
    if (!r) throw new ApiProblemError(problem(404, 'NOT_FOUND', 'Not found'))
    return r
  }

  private table(path: string): Row[] {
    const t = this.tables.get(path)
    if (!t) throw new ApiProblemError(problem(404, 'NOT_FOUND', 'Not found'))
    return t
  }
}

export function problem(status: number, code: string, title: string, detail?: string): Problem {
  return {
    type: `https://strutvane.dev/errors/${code.toLowerCase()}`,
    title,
    status,
    code,
    traceId: 'trace-0001',
    ...(detail ? { detail } : {}),
  }
}

// ── filtering (two-valued, null-safe: ADR-0008) ──────────────────────────────────────────────────

function value(row: Row, field: string): unknown {
  return row[field]
}
function isNullish(v: unknown): v is null | undefined {
  return v === null || v === undefined
}
function scalar(v: unknown): string | number | boolean | undefined {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : undefined
}

export function matches(f: QueryFilter, row: Row): boolean {
  switch (f.op) {
    case 'true': return true
    case 'false': return false
    case 'and': return f.filters.every((x) => matches(x, row))
    case 'or': return f.filters.some((x) => matches(x, row))
    case 'not': return !matches(f.filter, row)
    case 'isNull': return isNullish(value(row, f.field))
    case 'isNotNull': return !isNullish(value(row, f.field))
    case 'eq': { const v = value(row, f.field); return !isNullish(v) && v === f.value }
    case 'ne': { const v = value(row, f.field); return !(!isNullish(v) && v === f.value) }
    case 'in': { const v = value(row, f.field); return !isNullish(v) && f.values.some((x) => x === v) }
    case 'nin': { const v = value(row, f.field); return !(!isNullish(v) && f.values.some((x) => x === v)) }
    case 'gt': case 'gte': case 'lt': case 'lte': {
      const v = scalar(value(row, f.field)); const x = scalar(f.value as unknown)
      if (v === undefined || x === undefined) return false
      return f.op === 'gt' ? v > x : f.op === 'gte' ? v >= x : f.op === 'lt' ? v < x : v <= x
    }
    case 'between': {
      const v = scalar(value(row, f.field)); const a = scalar(f.from as unknown); const b = scalar(f.to as unknown)
      return v !== undefined && a !== undefined && b !== undefined && v >= a && v <= b
    }
    case 'contains': case 'startsWith': case 'endsWith': {
      const v = value(row, f.field)
      if (typeof v !== 'string') return false
      const hay = f.caseSensitive ? v : v.toLowerCase()
      const needle = f.caseSensitive ? f.value : f.value.toLowerCase()
      return f.op === 'contains' ? hay.includes(needle) : f.op === 'startsWith' ? hay.startsWith(needle) : hay.endsWith(needle)
    }
  }
}

function compareBy(sort: readonly { field: string; direction: 'asc' | 'desc' }[]) {
  return (a: Row, b: Row): number => {
    for (const s of sort) {
      const av = scalar(a[s.field]); const bv = scalar(b[s.field])
      if (av === bv) continue
      if (av === undefined) return 1 // nulls last regardless of direction
      if (bv === undefined) return -1
      const cmp = av < bv ? -1 : 1
      return s.direction === 'asc' ? cmp : -cmp
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0 // stable tiebreak
  }
}

function encodeCursor(offset: number): string {
  return btoa(JSON.stringify({ o: offset }))
}
function decodeCursor(cursor: string): number {
  try {
    const o = (JSON.parse(atob(cursor)) as { o?: unknown }).o
    return typeof o === 'number' && Number.isInteger(o) && o >= 0 ? o : 0
  } catch {
    return 0
  }
}
