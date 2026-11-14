/**
 * Pure rules: what can be charted, what is suggested, how owned settings resolve (fail closed),
 * and how widgets reach dashboards and the sidebar.
 */
import { describe, expect, it } from 'vitest'
import { aggregateUrl } from '../../src/shared/aggregate-contract.ts'
import { capabilitiesOf } from '../../src/shared/capabilities.ts'
import { auto } from '../../src/shared/define-charts.ts'
import { dashboardNavigation, dashboardWidgets, defineDashboard, DashboardDefinitionError, homeDashboardWidgets } from '../../src/shared/dashboard.ts'
import { findResource, type ResourceMetadata } from '../../src/shared/metadata.ts'
import { resolveCharts, resolveResource } from '../../src/shared/resolve.ts'
import { suggestCharts } from '../../src/shared/suggest.ts'
import { metadata } from '../server/fixture.ts'

function resource(name: string): ResourceMetadata {
  const found = findResource(metadata, name)
  if (found === undefined) throw new Error(`fixture has no ${name}`)
  return found
}

describe('capabilities', () => {
  it('derives roles from column kinds, never the id, tenant column or deleted_at', () => {
    expect(capabilitiesOf(metadata, resource('invoices'))).toEqual({
      numeric: ['total', 'tax'],
      date: ['issued_on', 'created_at', 'updated_at'],
      category: ['status', 'paid'],
      relation: [{ field: 'customer_id', resource: 'customers', relation: 'customer' }],
    })
  })

  it('drops secret-looking and hidden columns', () => {
    expect(capabilitiesOf(metadata, resource('customers')).category).toEqual(['country', 'tier'])
    expect(JSON.stringify(capabilitiesOf(metadata, resource('customers')))).not.toContain('api_key')
    expect(JSON.stringify(capabilitiesOf(metadata, resource('users')))).not.toContain('password')
  })

  it('honours the forward-compatible aggregatable: false and personal: true flags', () => {
    const invoices = resource('invoices')
    const flagged = { ...invoices, fields: invoices.fields.map((field) => (field.name === 'tax' ? { ...field, aggregatable: false } : field.name === 'status' ? { ...field, personal: true } : field)) }
    expect(capabilitiesOf(metadata, flagged).numeric).toEqual(['total'])
    expect(capabilitiesOf(metadata, flagged).category).toEqual(['paid'])
  })

    it('gives internal tables nothing, and never relates to them', () => {
    expect(capabilitiesOf(metadata, resource('sessions'))).toEqual({ numeric: [], date: [], category: [], relation: [] })
  })

  it('a single-tenant app may group by a column named tenant_id', () => {
    expect(capabilitiesOf(metadata, resource('invoices'), false).relation).toHaveLength(1)
  })
})

describe('suggestions', () => {
  it('are deterministic and cover KPI, time, categories, split, amounts and top N', () => {
    const ids = suggestCharts(metadata, resource('invoices')).map((widget) => widget.id)
    expect(ids).toEqual([
      'invoices.new',
      'invoices.per-period',
      'invoices.by-status',
      'invoices.by-paid',
      'invoices.per-period-by-status',
      'invoices.sum-total',
      'invoices.avg-total',
      'invoices.sum-tax',
      'invoices.avg-tax',
      'invoices.top-customer',
    ])
    expect(suggestCharts(metadata, resource('invoices'))).toEqual(suggestCharts(metadata, resource('invoices')))
  })

  it('choose donuts for a few groups and bars for many', () => {
    const byKind = Object.fromEntries(suggestCharts(metadata, resource('customers')).map((widget) => [widget.id, widget.kind]))
    expect(byKind['customers.by-tier']).toBe('donut') // 3 options
    expect(byKind['customers.by-country']).toBe('bar') // 7 options
  })

  it('every suggested query passes the server allow-list of its resource', () => {
    const resolved = resolveCharts(metadata, [])
    for (const charts of resolved.values()) {
      const suggested = suggestCharts(metadata, charts.resource)
      expect(charts.widgets.map((widget) => widget.id)).toEqual(suggested.map((widget) => widget.id))
    }
  })
})

describe('resolving owned settings (fail closed)', () => {
  const invoices = resource('invoices')

  it('auto() with except/order', () => {
    const resolved = resolveResource(metadata, invoices, { widgets: auto({ except: ['invoices.avg-tax'], order: ['invoices.top-customer'] }) })
    expect(resolved.widgets[0]?.id).toBe('invoices.top-customer')
    expect(resolved.widgets.map((widget) => widget.id)).not.toContain('invoices.avg-tax')
  })

  it('a narrower allow-list removes the suggestions that need other fields', () => {
    const resolved = resolveResource(metadata, invoices, { aggregates: { numeric: [], groupBy: ['status'] } })
    expect(resolved.widgets.map((widget) => widget.id)).toEqual(['invoices.by-status'])
    expect([...(resolved.allowList?.category ?? [])]).toEqual(['status'])
  })

  it('unknown, secret and stale names are dropped and reported, never allowed', () => {
    const resolved = resolveResource(metadata, resource('customers'), {
      aggregates: { numeric: ['api_key'], groupBy: ['api_key', 'tenant_id', 'tier'] },
      widgets: ['customers.by-tier', 'customers.by-region', { id: 'customers.leak', kind: 'bar', title: 'Leak', metric: 'count', groupBy: 'api_key' }],
    })
    expect(resolved.allowList?.numeric.size).toBe(0)
    expect([...(resolved.allowList?.category ?? [])]).toEqual(['tier'])
    expect(resolved.widgets.map((widget) => widget.id)).toEqual(['customers.by-tier'])
    expect(resolved.issues).toHaveLength(5)
    expect(resolved.issues.join('\n')).toContain('"customers.by-region" is not a current suggestion (was a column dropped?)')
  })

  it('custom widgets are checked like requests', () => {
    const resolved = resolveResource(metadata, invoices, {
      widgets: [
        { id: 'invoices.ok', kind: 'bar', title: 'OK', metric: 'sum', field: 'total', groupBy: 'issued_on', interval: 'month', splitBy: 'paid' },
        { id: 'invoices.kpi', kind: 'stat', title: 'KPI', metric: 'avg', field: 'total', date: 'created_at' },
        { id: 'invoices.days', kind: 'stat', title: 'Days', metric: 'count', date: 'created_at', days: 400 },
        { id: 'other.id', kind: 'bar', title: 'Wrong id', metric: 'count' },
        { id: 'invoices.ok', kind: 'pie', title: 'Duplicate', metric: 'count', groupBy: 'status' },
      ],
    })
    expect(resolved.widgets.map((widget) => widget.id)).toEqual(['invoices.ok'])
    expect(resolved.issues).toHaveLength(4)
  })

  it('a stat card asks for two windows of days', () => {
    const resolved = resolveResource(metadata, invoices, { widgets: [{ id: 'invoices.rev', kind: 'stat', title: 'Revenue', metric: 'sum', field: 'total', date: 'issued_on', days: 7 }] })
    expect(resolved.widgets[0]).toMatchObject({ kind: 'stat', query: { metric: 'sum', field: 'total', groupBy: 'issued_on', interval: 'day' }, range: { last: 14, unit: 'day' } })
  })

  it('an invalid privacy threshold never switches protection off', () => {
    expect(resolveResource(metadata, invoices, { privacy: { minGroupSize: 1 } }).minGroupSize).toBe(10)
    expect(resolveResource(metadata, invoices, { privacy: { minGroupSize: 5 } }).minGroupSize).toBe(5)
  })

  it('aggregates: false turns the endpoint and all widgets off', () => {
    const resolved = resolveResource(metadata, invoices, { aggregates: false })
    expect(resolved.allowList).toBeNull()
    expect(resolved.widgets).toEqual([])
  })
})

describe('dashboards and the sidebar', () => {
  const resolved = resolveCharts(metadata, [
    { resource: 'invoices', config: { sort: 1 } },
    { resource: 'employees', config: { sort: 2, dashboard: ['employees.by-department'] } },
    { resource: 'users', config: { dashboard: false } },
    { resource: 'customers', config: { sort: 5 } },
  ])

  it('the home dashboard follows sort, hides resources the user can not viewAny', () => {
    const all = homeDashboardWidgets(resolved, () => true).map((widget) => widget.id)
    expect(all.slice(0, 3)).toEqual(['invoices.new', 'invoices.by-status', 'employees.by-department'])
    expect(all).not.toContain('users.new')
    expect(homeDashboardWidgets(resolved, (route) => route !== 'invoices').map((widget) => widget.id)).not.toContain('invoices.new')
  })

  it('named dashboards become permission-gated sidebar entries in spike 14 shape', () => {
    const sales = defineDashboard({ name: 'sales', label: 'Sales', permission: 'dashboards.sales', widgets: ['invoices.new', 'invoices.top-customer', 'gone.widget'] })
    expect(dashboardNavigation([sales])).toEqual([{ name: 'dashboards.sales', label: 'Sales', path: '/dashboards/sales', icon: 'chart-bar', group: 'Dashboards', permission: 'dashboards.sales' }])
    const missing: string[] = []
    expect(dashboardWidgets(sales, resolved, () => true, (id) => missing.push(id)).map((widget) => widget.id)).toEqual(['invoices.new', 'invoices.top-customer'])
    expect(missing).toEqual(['gone.widget'])
    expect(dashboardWidgets(sales, resolved, () => false)).toEqual([])
  })

  it('refuses dashboards that cannot work, with a fix', () => {
    expect(() => defineDashboard({ name: 'Sales!', label: 'S', permission: 'p', widgets: [] })).toThrow(DashboardDefinitionError)
    expect(() => defineDashboard({ name: 'sales', label: 'S', permission: ' ', widgets: [] })).toThrow(/never public/)
    expect(() => defineDashboard({ name: 'sales', label: 'S', permission: 'p', widgets: ['a.b', 'a.b'] })).toThrow(/twice/)
  })
})

describe('the wire format', () => {
  it('builds the request URL with filters, encoded once', () => {
    expect(aggregateUrl('invoices', { metric: 'sum', field: 'total', groupBy: 'created_at', interval: 'month', filters: [{ field: 'status', op: 'in', value: 'paid,sent' }] })).toBe(
      '/api/v1/invoices/aggregate?metric=sum&field=total&groupBy=created_at&interval=month&filter%5Bstatus%5D%5Bin%5D=paid%2Csent',
    )
  })
})
