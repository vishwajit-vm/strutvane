import { describe, expect, test } from 'vitest'
import { decodeCursor, encodeCursor, type ListParams, parseListQuery, serializeListParams } from '../src/list-query.ts'
import type { z } from 'zod'
import { Customer, Invoice } from '../src/models.ts'
import type { Resource } from '../src/resource.ts'

/** Serialize like the client, then parse like the server, for the given resource. */
const parseFor =
  <S extends z.ZodRawShape>(resource: Resource<S>) =>
  (params: ListParams) =>
    parseListQuery(new URLSearchParams(serializeListParams(params)), resource)
const parse = parseFor(Invoice)

describe('serialize → parse round trip (client and server share one implementation)', () => {
  test('nested filters become filter[field][op]; repeated keys for multi-value operators', () => {
    const qs = serializeListParams({ filter: { status: { in: ['sent', 'paid'] }, amount: { between: [10, 99] } }, sort: ['-amount', 'number'], page: { size: 5 } })
    expect(decodeURIComponent(qs)).toBe(
      'filter[amount][between]=10&filter[amount][between]=99&filter[status][in]=sent&filter[status][in]=paid&sort=-amount,number&page[size]=5',
    )
  })

  test('produces the exact ListQuery AST', () => {
    const result = parse({ filter: { status: { in: ['sent', 'paid'] }, amount: { gte: 500 } }, sort: ['-amount'], page: { size: 10 }, search: 'acme' })
    expect(result).toEqual({
      ok: true,
      query: {
        filter: {
          op: 'and',
          filters: [
            { op: 'gte', field: 'amount', value: 500 },
            { op: 'in', field: 'status', values: ['sent', 'paid'] },
          ],
        },
        sort: [{ field: 'amount', direction: 'desc' }],
        page: { kind: 'cursor', size: 10 },
        search: 'acme',
      },
    })
  })

  test('values with commas, ampersands, percent signs, quotes and unicode survive intact', () => {
    const tricky = 'Acme, Inc & Sons 100% "Ünïcødé" 東京'
    const result = parseFor(Customer)({ filter: { name: { contains: tricky } } })
    expect(result).toMatchObject({ ok: true, query: { filter: { op: 'contains', field: 'name', value: tricky } } })
  })

  test('serialization is deterministic regardless of key order', () => {
    const a = serializeListParams({ filter: { status: { eq: 'paid' }, amount: { lt: 5 } } })
    const b = serializeListParams({ filter: { amount: { lt: 5 }, status: { eq: 'paid' } } })
    expect(a).toBe(b)
  })

  test('defaults: cursor pagination with the default page size', () => {
    expect(parse({})).toEqual({ ok: true, query: { page: { kind: 'cursor', size: 25 } } })
  })

  test('offset pagination with page[number]; cursor and number together are rejected', () => {
    expect(parse({ page: { size: 10, number: 3 } })).toMatchObject({ ok: true, query: { page: { kind: 'offset', size: 10, number: 3 } } })
    const both = parse({ page: { number: 2, cursor: encodeCursor(5) } })
    expect(both).toMatchObject({ ok: false, issues: [{ code: 'conflicting_pagination' }] })
  })
})

describe('validation against the resource allow-lists', () => {
  test.each([
    [{ filter: { notes: { eq: 'x' } } }, 'filter_not_allowed'],
    [{ filter: { status: { contains: 'pa' } } }, 'operator_not_allowed'],
    [{ filter: { amount: { eq: 'ten' } } }, 'invalid_filter_value'],
    [{ filter: { status: { eq: 'lost' } } }, 'invalid_filter_value'],
    [{ filter: { dueDate: { eq: '2026-02-30x' } } }, 'invalid_filter_value'],
    [{ filter: { amount: { between: [1] } } }, 'invalid_filter_value'],
    [{ sort: ['notes'] }, 'sort_not_allowed'],
    [{ page: { size: 0 } }, 'invalid_page_size'],
    [{ page: { size: 101 } }, 'invalid_page_size'],
  ] as [ListParams, string][])('%j → %s', (params, code) => {
    const result = parse(params)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.map((i) => i.code)).toContain(code)
  })

  test('isNull only accepts the value "true"', () => {
    expect(parseListQuery(new URLSearchParams('filter[region][isNull]=true'), Customer).ok).toBe(true)
    expect(parseListQuery(new URLSearchParams('filter[region][isNull]=false'), Customer).ok).toBe(false)
  })

  test('numbers are coerced and range-checked with the field schema itself', () => {
    expect(parseListQuery(new URLSearchParams('filter[amount][gte]=12.5'), Invoice)).toMatchObject({ ok: true, query: { filter: { value: 12.5 } } })
    expect(parseListQuery(new URLSearchParams('filter[amount][gte]=-1'), Invoice).ok).toBe(false)
    expect(parseListQuery(new URLSearchParams('filter[amount][gte]='), Invoice).ok).toBe(false)
    expect(parseListQuery(new URLSearchParams('filter[amount][gte]=Infinity'), Invoice).ok).toBe(false)
  })

  test('text filters reject empty, huge and NUL-containing values', () => {
    for (const bad of ['', 'a'.repeat(201), 'a\u0000b']) {
      expect(parseListQuery(new URLSearchParams({ 'filter[name][contains]': bad }), Customer).ok).toBe(false)
    }
  })

  test('unknown parameters are rejected (typos fail loudly)', () => {
    const result = parseListQuery(new URLSearchParams('fliter[status][eq]=paid'), Invoice)
    expect(result).toMatchObject({ ok: false, issues: [{ code: 'unknown_parameter', params: { name: 'fliter[status][eq]' } }] })
  })
})

describe('cursors', () => {
  test('round trip', () => {
    expect(decodeCursor(encodeCursor(0))).toBe(0)
    expect(decodeCursor(encodeCursor(1234))).toBe(1234)
  })

  test('garbage never throws and is rejected', () => {
    for (const bad of ['', '%%%', 'not base64!', 'eyJvIjotMX0', 'eyJvIjoxLjV9', 'bnVsbA', 'a'.repeat(500)]) {
      expect(decodeCursor(bad), bad).toBeUndefined()
    }
  })
})
