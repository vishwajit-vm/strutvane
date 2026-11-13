/**
 * A tiny in-memory store so the spike can exercise the protocol end to end. It is NOT the real data
 * layer (that is spike 01/02 territory). Filters follow the normative two-valued, NULL-safe
 * semantics of RFC-0001 / ADR-0008 so results are realistic; sorting always ends with an `id`
 * tiebreak so pages are stable.
 *
 * @module
 */
import type { FilterScalar, ListQuery, QueryFilter, SortDirective } from './contracts.ts'
import { decodeCursor, encodeCursor } from './list-query.ts'

/** A stored record: any JSON object with an `id`. */
export type StoredRecord = { readonly id: string } & Readonly<Record<string, unknown>>

/** One page of results. */
export interface Page<T> {
  readonly data: T[]
  readonly meta: { readonly page: { readonly size: number; readonly hasMore: boolean; readonly nextCursor?: string } }
}

/** In-memory collection keyed by id. */
export class MemoryCollection<T extends StoredRecord> {
  readonly #rows = new Map<string, T>()

  get(id: string): T | undefined {
    return this.#rows.get(id)
  }

  put(row: T): T {
    this.#rows.set(row.id, row)
    return row
  }

  delete(id: string): boolean {
    return this.#rows.delete(id)
  }

  list(query: ListQuery, searchFields: readonly string[]): Page<T> {
    let rows = [...this.#rows.values()]
    if (query.filter) {
      const filter = query.filter
      rows = rows.filter((r) => matches(filter, r))
    }
    if (query.search) {
      const needle = query.search.toLowerCase()
      rows = rows.filter((r) => searchFields.some((f) => String(r[f] ?? '').toLowerCase().includes(needle)))
    }
    rows.sort(comparator(query.sort ?? []))

    const page = query.page ?? { kind: 'cursor' as const, size: 25 }
    const offset =
      page.kind === 'offset' ? (page.number - 1) * page.size : page.cursor ? (decodeCursor(page.cursor) ?? 0) : 0
    const data = rows.slice(offset, offset + page.size)
    const hasMore = offset + page.size < rows.length
    return {
      data,
      meta: { page: { size: page.size, hasMore, ...(hasMore ? { nextCursor: encodeCursor(offset + page.size) } : {}) } },
    }
  }
}

/** Two-valued, NULL-safe evaluation (RFC-0001 semantics). */
function matches(filter: QueryFilter, row: Readonly<Record<string, unknown>>): boolean {
  if (filter.op === 'and') return filter.filters.every((f) => matches(f, row))
  const v = row[filter.field]
  const present = v !== null && v !== undefined
  switch (filter.op) {
    case 'eq':
      return present && v === filter.value
    case 'ne':
      return !(present && v === filter.value)
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return present && compare(v as FilterScalar, filter.value, filter.op)
    case 'between':
      return present && compare(v as FilterScalar, filter.from, 'gte') && compare(v as FilterScalar, filter.to, 'lte')
    case 'in':
      return present && filter.values.includes(v as FilterScalar)
    case 'nin':
      return !(present && filter.values.includes(v as FilterScalar))
    case 'isNull':
      return !present
    case 'isNotNull':
      return present
    case 'contains':
      return present && String(v).toLowerCase().includes(filter.value.toLowerCase())
    case 'startsWith':
      return present && String(v).toLowerCase().startsWith(filter.value.toLowerCase())
    case 'endsWith':
      return present && String(v).toLowerCase().endsWith(filter.value.toLowerCase())
  }
}

function compare(a: FilterScalar, b: FilterScalar, op: 'gt' | 'gte' | 'lt' | 'lte'): boolean {
  switch (op) {
    case 'gt':
      return a > b
    case 'gte':
      return a >= b
    case 'lt':
      return a < b
    case 'lte':
      return a <= b
  }
}

function comparator(sort: readonly SortDirective[]): (a: StoredRecord, b: StoredRecord) => number {
  const keys = [...sort, { field: 'id', direction: 'asc' as const }]
  return (a, b) => {
    for (const { field, direction } of keys) {
      const x = a[field]
      const y = b[field]
      if (x === y) continue
      // NULLs sort last regardless of direction (a documented, deterministic choice).
      if (x === null || x === undefined) return 1
      if (y === null || y === undefined) return -1
      const order = (x as FilterScalar) < (y as FilterScalar) ? -1 : 1
      return direction === 'asc' ? order : -order
    }
    return 0
  }
}
