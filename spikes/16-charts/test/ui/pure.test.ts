/**
 * Pure browser-side rules: labels, number formats, summaries, KPI windows, relative ranges and
 * the client's error messages.
 */
import { describe, expect, it } from 'vitest'
import type { AggregateResult } from '../../src/shared/aggregate-contract.ts'
import { statValues } from '../../src/ui/components/StatCard.tsx'
import { AggregateRequestError, createAggregateClient, rangeDates, widgetQuery } from '../../src/ui/data.ts'
import { createKeyLabeler, formatBucket, formatCompact, formatValue, humanize, percentChange } from '../../src/ui/format.ts'
import { summarize, toChartData } from '../../src/ui/series.ts'

const NOW = new Date('2026-11-14T12:00:00.000Z')

describe('labels and numbers', () => {
  it('formats buckets in UTC, whatever the machine zone', () => {
    expect(formatBucket('2026-11-01', 'month')).toBe('Nov 2026')
    expect(formatBucket('2026-11-09', 'week')).toBe('w/c 9 Nov')
    expect(formatBucket('2026-11-14', 'day')).toBe('14 Nov')
  })

  it('labels special keys, booleans, relations and enums', () => {
    const category = createKeyLabeler({ kind: 'category' })
    expect(['true', 'false', '__none__', '__other__', 'in_review', 'IN'].map(category)).toEqual(['Yes', 'No', 'None', 'Other', 'In review', 'IN'])
    expect(createKeyLabeler({ kind: 'relation', relationLabels: { '1': 'Acme' } })('1')).toBe('Acme')
    expect(createKeyLabeler({ kind: 'relation' })('7')).toBe('#7')
  })

  it('formats values, compact ticks and changes', () => {
    expect(formatValue(1234.5, 'decimal')).toBe('1,234.50')
    expect(formatValue(null, 'integer')).toBe('–')
    expect(formatCompact(125_000)).toBe('125k')
    expect(percentChange(120, 100)).toBe(20)
    expect(percentChange(5, 0)).toBeNull()
    expect(humanize('past_due')).toBe('Past due')
  })
})

describe('chart data and summaries', () => {
  const result: AggregateResult = {
    data: [
      { key: '2026-10-01', values: { value: 3 } },
      { key: '2026-11-01', values: { value: null }, suppressed: ['value'] },
    ],
    series: [{ key: 'value' }],
    meta: { resource: 'x', metric: 'count', field: null, groupBy: 'created_at', groupKind: 'date', interval: 'month', splitBy: null, splitKind: 'none', dateField: 'created_at', from: null, to: null, timezone: 'UTC', minGroupSize: 5, suppressedCells: 1, truncated: false },
  }

  it('maps series to safe data keys and token colours, and keeps suppression', () => {
    const data = toChartData(result, createKeyLabeler({ kind: 'date', interval: 'month' }), () => 'Rows')
    expect(data.series).toEqual([{ dataKey: 's0', label: 'Rows', color: 'var(--chart-1)' }])
    expect(data.rows[1]).toEqual({ key: '2026-11-01', label: 'Nov 2026', values: { s0: null }, suppressed: ['s0'] })
    expect(data.empty).toBe(false)
  })

  it('summarises in one sentence, including what privacy hid', () => {
    const data = toChartData(result, createKeyLabeler({ kind: 'date', interval: 'month' }), () => 'Rows')
    expect(summarize(data, 'Rows per month', 'integer')).toBe('Rows per month: 2 points from Oct 2026 to Nov 2026. Highest: Oct 2026, 3. 1 small group is hidden for privacy.')
  })

  it('"Other" and "None" use the neutral token', () => {
    const data = toChartData({ ...result, series: [{ key: '__other__' }], data: [] }, (key) => key, (key) => key)
    expect(data.series[0]?.color).toBe('var(--chart-other)')
  })
})

describe('KPI windows and relative ranges', () => {
  it('splits two windows; a suppressed day hides the window total', () => {
    expect(statValues([1, 2, 3, 4])).toEqual({ current: 7, previous: 3, series: [3, 4] })
    expect(statValues([1, null, 3, 4]).previous).toBeNull()
  })

  it('turns "last N" into whole UTC buckets ending with the current one', () => {
    expect(rangeDates({ last: 30, unit: 'day' }, NOW)).toEqual({ from: '2026-10-16', to: '2026-11-15' })
    expect(rangeDates({ last: 12, unit: 'week' }, NOW)).toEqual({ from: '2026-08-24', to: '2026-11-16' })
    expect(rangeDates({ last: 12, unit: 'month' }, new Date('2026-01-31T23:00:00Z'))).toEqual({ from: '2025-02-01', to: '2026-02-01' })
  })

  it('a widget query gets its range, or the interval override and its default window', () => {
    const widget = { id: 'x.y', resource: 'x', kind: 'area', size: 'lg', format: 'integer', title: 'T', query: { metric: 'count', groupBy: 'created_at', interval: 'month' }, range: { last: 12, unit: 'month' } } as const
    expect(widgetQuery(widget, NOW)).toMatchObject({ interval: 'month', from: '2025-12-01', to: '2026-12-01' })
    expect(widgetQuery(widget, NOW, 'day')).toMatchObject({ interval: 'day', from: '2026-10-16', to: '2026-11-15' })
  })
})

describe('the client', () => {
  it('turns network failures and problems into friendly errors', async () => {
    const offline = createAggregateClient(async () => {
      throw new TypeError('fetch failed')
    })
    await expect(offline.get('x', { metric: 'count' })).rejects.toThrow("Couldn't reach the server. Check your connection and try again.")
    const problem = createAggregateClient(async () => new Response(JSON.stringify({ detail: 'Bad.', issues: [{ field: 'f', code: 'c', message: 'Fix f.' }] }), { status: 422 }))
    await expect(problem.get('x', { metric: 'count' })).rejects.toEqual(new AggregateRequestError(422, 'Bad. Fix f.'))
  })
})
