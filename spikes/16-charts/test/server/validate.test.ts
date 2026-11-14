/**
 * Strict request validation, without a database: every refusal names the parameter and says how
 * to fix it, and every accepted request becomes a fully typed plan.
 */
import { describe, expect, it } from 'vitest'
import type { ProblemIssue } from '../../src/shared/aggregate-contract.ts'
import { suppressSmallGroups, type Cell } from '../../src/server/suppress.ts'
import { validateAggregateRequest, type ValidationResult } from '../../src/server/validate.ts'
import { charts, NOW } from './fixture.ts'

const invoices = charts.get('invoices')
const employees = charts.get('employees')

function validate(query: string, resource = invoices): ValidationResult {
  if (resource === undefined) throw new Error('fixture resource missing')
  return validateAggregateRequest(new URLSearchParams(query), resource, { now: NOW, tenantColumn: 'tenant_id' })
}

function issues(query: string, resource = invoices): ProblemIssue[] {
  const result = validate(query, resource)
  return result.ok ? [] : [...result.issues]
}

function codes(query: string, resource = invoices): string[] {
  return issues(query, resource).map((issue) => `${issue.field}:${issue.code}`)
}

describe('accepted requests become typed plans', () => {
  it('count by enum: all options as keys, soft deletes on', () => {
    const result = validate('metric=count&groupBy=status')
    expect(result.ok && result.plan).toMatchObject({ metric: 'count', group: { kind: 'category', keys: ['draft', 'sent', 'paid', 'void'] }, softDeletes: true })
  })

  it('sum by month: aligned range conditions bound as typed values', () => {
    const result = validate('metric=sum&field=total&groupBy=issued_on&interval=month&from=2026-01-15&to=2026-03-02')
    if (!result.ok) throw new Error(JSON.stringify(result.issues))
    expect(result.plan.from?.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(result.plan.to?.toISOString()).toBe('2026-04-01T00:00:00.000Z')
    expect(result.plan.conditions).toEqual([
      { kind: 'compare', column: 'issued_on', op: '>=', value: { type: 'date', value: '2026-01-01' } },
      { kind: 'compare', column: 'issued_on', op: '<', value: { type: 'date', value: '2026-04-01' } },
    ])
    expect(result.plan.group).toMatchObject({ kind: 'date', keys: ['2026-01-01', '2026-02-01', '2026-03-01'] })
  })

  it('escapes LIKE wildcards so "100%" means the text "100%"', () => {
    const result = validate('metric=count&filter[number][contains]=100%25_x')
    expect(result.ok && result.plan.conditions).toEqual([{ kind: 'like', column: 'number', pattern: '%100\\%\\_x%' }])
  })

  it('filter[x]=v means eq; booleans and integers are parsed', () => {
    const result = validate('metric=count&filter[paid]=true&filter[customer_id][in]=1,2')
    expect(result.ok && result.plan.conditions).toEqual([
      { kind: 'compare', column: 'paid', op: '=', value: { type: 'boolean', value: true } },
      { kind: 'in', column: 'customer_id', values: [{ type: 'integer', value: 1 }, { type: 'integer', value: 2 }] },
    ])
  })
})

describe('refusals (422), each with the parameter and a fix', () => {
  const cases: readonly (readonly [string, string, readonly string[]])[] = [
    ['unknown and repeated parameters', 'metric=count&groupby=status&metric=count', ['groupby:unknown_parameter', 'metric:repeated_parameter']],
    ['missing metric', 'groupBy=status', ['metric:required']],
    ['count with a field', 'metric=count&field=total', ['field:not_allowed']],
    ['sum without a field', 'metric=sum', ['field:required']],
    ['sum of a non-numeric field', 'metric=sum&field=status', ['field:not_aggregatable']],
    ['interval without a date group', 'metric=count&groupBy=status&interval=day', ['interval:not_allowed']],
    ['date group without interval', 'metric=count&groupBy=created_at', ['interval:required']],
    ['too many buckets', 'metric=count&groupBy=created_at&interval=day&from=2025-01-01&to=2026-11-01', ['interval:too_many_buckets']],
    ['impossible date', 'metric=count&groupBy=created_at&interval=day&from=2026-02-30', ['from:invalid_date']],
    ['offset timestamp', 'metric=count&from=2026-11-01T00:00:00%2B02:00', ['from:invalid_date']],
    ['empty range', 'metric=count&from=2026-11-01&to=2026-11-01', ['to:empty_range']],
    ['dateField that is not a date', 'metric=count&dateField=status&from=2026-11-01', ['dateField:not_a_date']],
    ['limit without a relation group', 'metric=count&groupBy=status&limit=5', ['limit:not_allowed']],
    ['limit too large', 'metric=count&groupBy=customer_id&limit=51', ['limit:invalid']],
    ['split by a relation group', 'metric=count&groupBy=customer_id&splitBy=status', ['splitBy:not_allowed']],
    ['split by itself', 'metric=count&groupBy=status&splitBy=status', ['splitBy:not_splittable']],
    ['filter on an unknown field', 'metric=count&filter[nope][eq]=1', ['filter[nope][eq]:not_filterable']],
    ['wrong operator for the type', 'metric=count&filter[paid][gt]=true', ['filter[paid][gt]:invalid_operator']],
    ['enum value that does not exist', 'metric=count&filter[status][eq]=payed', ['filter[status][eq]:invalid_value']],
    ['integer that is not one', 'metric=count&filter[customer_id][eq]=1abc', ['filter[customer_id][eq]:invalid_value']],
    ['control characters', 'metric=count&filter[number][eq]=a%00b', ['filter[number][eq]:invalid_value']],
    ['too many filters', `metric=count&${Array.from({ length: 11 }, (_, index) => `filter[number][eq]=${index}`).join('&')}`, ['filter:too_many_filters']],
    ['too many in values', `metric=count&filter[customer_id][in]=${Array.from({ length: 51 }, (_, index) => index).join(',')}`, ['filter[customer_id][in]:invalid_value']],
  ]
  it.each(cases)('%s', (_name, query, expected) => {
    expect(codes(query)).toEqual(expected)
  })

  it('messages say how to fix it and list only allowed names', () => {
    const [issue] = issues('metric=sum&field=status')
    expect(issue?.message).toBe('sum needs a numeric field, and "status" isn\'t one here. Numeric fields: total, tax.')
    const [group] = issues('metric=count&groupBy=api_key', charts.get('customers'))
    expect(group?.message).toBe('"api_key" can\'t be grouped by here. Group fields: created_at, updated_at, country, tier.')
  })

  it('with privacy on, filters are equality on group fields only', () => {
    expect(codes('metric=count&filter[name][eq]=x', employees)).toEqual(['filter[name][eq]:not_filterable'])
    expect(codes('metric=count&filter[department][ne]=sales', employees)).toEqual(['filter[department][ne]:invalid_operator'])
    expect(codes('metric=count&filter[remote][eq]=true', employees)).toEqual([])
  })
})

describe('suppression grid rules', () => {
  const grid = (rows: number[][]): Cell[][] => rows.map((row) => row.map((count) => ({ rows: count, value: count, suppressed: false })))
  const shown = (cells: Cell[][]): (number | null)[][] => cells.map((row) => row.map((cell) => cell.value))

  it('primary only when two or more cells of a line are already hidden', () => {
    const cells = grid([[9], [2], [1], [7]])
    expect(suppressSmallGroups(cells, 5)).toBe(2)
    expect(shown(cells)).toEqual([[9], [null], [null], [7]])
  })

  it('complementary across groups and across series in a 2-D grid, until stable', () => {
    // One small cell (2) at [0][0]: its column partner (6) and row partner (8) go too, and then the
    // cell that pairs those (20) so no row or column is left with exactly one hidden value.
    const cells = grid([
      [2, 8, 30],
      [6, 20, 40],
      [9, 50, 60],
    ])
    suppressSmallGroups(cells, 5)
    const columns = [0, 1, 2].map((index) => cells.flatMap((row) => row.slice(index, index + 1)))
    for (const line of [...cells, ...columns]) {
      expect(line.filter((cell) => cell.suppressed).length).not.toBe(1)
    }
    expect(cells[0]?.[0]?.value).toBeNull()
  })

  it('zero and large cells are never hidden on their own', () => {
    const cells = grid([[0], [5], [100]])
    expect(suppressSmallGroups(cells, 5)).toBe(0)
  })
})
