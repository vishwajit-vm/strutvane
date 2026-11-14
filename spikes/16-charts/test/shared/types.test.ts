/**
 * Type-level tests for owned chart files. `npm test` runs `tsc --noEmit` first, so every
 * `@ts-expect-error` below must be a real compile error, or the build fails ("unused directive").
 * The registry comes from the committed `example/.strutvane/charts.gen.ts`.
 */
import { describe, expect, expectTypeOf, it } from 'vitest'
import { auto, defineResourceCharts, type CategoryField, type ChartResource, type NumericField, type SuggestionId } from '#strutvane/charts'
import '../../example/.strutvane/charts.gen.ts'

describe('the generated registry types owned files', () => {
  it('knows each resource and the roles of its fields', () => {
    expectTypeOf<ChartResource>().toEqualTypeOf<'customers' | 'employees' | 'invoices' | 'tags' | 'users'>()
    expectTypeOf<NumericField<'invoices'>>().toEqualTypeOf<'total' | 'tax'>()
    expectTypeOf<CategoryField<'invoices'>>().toEqualTypeOf<'status' | 'paid'>()
    expectTypeOf<SuggestionId<'users'>>().toEqualTypeOf<'users.new' | 'users.per-period'>()
  })

  it('accepts a well-formed file', () => {
    const charts = defineResourceCharts('invoices', {
      widgets: [
        'invoices.by-status',
        { id: 'invoices.x', kind: 'bar', title: 'X', metric: 'sum', field: 'total', groupBy: 'issued_on', interval: 'week', splitBy: 'paid' },
        { id: 'invoices.k', kind: 'stat', title: 'K', metric: 'count', date: 'created_at' },
        { id: 'invoices.t', kind: 'bar', title: 'T', metric: 'count', groupBy: 'customer_id', limit: 5, layout: 'horizontal' },
      ],
      dashboard: auto({ except: ['invoices.avg-tax'] }),
      aggregates: { numeric: ['total'], groupBy: ['status', 'created_at'] },
      privacy: { minGroupSize: 5 },
    })
    expect(charts.resource).toBe('invoices')
  })

  it('rejects misuse at compile time', () => {
    // @ts-expect-error: no such resource (or an internal one: sessions never reaches the registry)
    defineResourceCharts('sessions', {})
    // @ts-expect-error: a secret-looking column is not in the registry, so it can't be named
    defineResourceCharts('customers', { aggregates: { groupBy: ['api_key'] } })
    // @ts-expect-error: the tenant column is never a group field
    defineResourceCharts('invoices', { aggregates: { groupBy: ['tenant_id'] } })
    // @ts-expect-error: misspelt suggestion id
    defineResourceCharts('invoices', { widgets: auto({ except: ['invoices.by-stauts'] }) })
    // @ts-expect-error: sum needs a numeric field
    defineResourceCharts('invoices', { widgets: [{ id: 'invoices.a', kind: 'bar', title: 'A', metric: 'sum' }] })
    // @ts-expect-error: status is not numeric
    defineResourceCharts('invoices', { widgets: [{ id: 'invoices.a', kind: 'bar', title: 'A', metric: 'avg', field: 'status' }] })
    // @ts-expect-error: count takes no field
    defineResourceCharts('invoices', { widgets: [{ id: 'invoices.a', kind: 'bar', title: 'A', metric: 'count', field: 'total' }] })
    // @ts-expect-error: interval only goes with a date group
    defineResourceCharts('invoices', { widgets: [{ id: 'invoices.a', kind: 'bar', title: 'A', metric: 'count', groupBy: 'status', interval: 'day' }] })
    // @ts-expect-error: a date group needs an interval
    defineResourceCharts('invoices', { widgets: [{ id: 'invoices.a', kind: 'line', title: 'A', metric: 'count', groupBy: 'created_at' }] })
    // @ts-expect-error: splitBy must be an enum or boolean
    defineResourceCharts('invoices', { widgets: [{ id: 'invoices.a', kind: 'bar', title: 'A', metric: 'count', groupBy: 'status', splitBy: 'issued_on' }] })
    // @ts-expect-error: a widget id must start with its resource
    defineResourceCharts('invoices', { widgets: [{ id: 'orders.a', kind: 'bar', title: 'A', metric: 'count' }] })
    // @ts-expect-error: a KPI card can't average (its trend would be wrong)
    defineResourceCharts('invoices', { widgets: [{ id: 'invoices.k', kind: 'stat', title: 'K', metric: 'avg', field: 'total', date: 'created_at' }] })
    // @ts-expect-error: limit only applies to a relation group
    defineResourceCharts('invoices', { widgets: [{ id: 'invoices.a', kind: 'bar', title: 'A', metric: 'count', groupBy: 'status', limit: 3 }] })
    // @ts-expect-error: unknown setting
    defineResourceCharts('invoices', { colour: 'red' })
    expect(true).toBe(true)
  })
})
