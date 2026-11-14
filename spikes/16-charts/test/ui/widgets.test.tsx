// @vitest-environment jsdom
/**
 * Widgets end to end in the browser environment: React renders each chart kind from the REAL
 * aggregate handler (SQLite fixture), with loading, error, empty and suppressed states, the table
 * fallback, keyboard focus, the interval switch and relation labels.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { WidgetSpec } from '../../src/shared/widgets.ts'
import { createAggregateClient } from '../../src/ui/data.ts'
import { Widget } from '../../src/ui/Widget.tsx'
import { charts } from '../server/fixture.ts'
import { context, realClient, realTransport } from './render.tsx'

function widget(resource: string, id: string): WidgetSpec {
  const found = charts.get(resource)?.widgets.find((candidate) => candidate.id === id)
  if (found === undefined) throw new Error(`no widget ${id}`)
  return found
}

/** Rows of a chart's data table, as "label: value" strings. */
function tableRows(table: HTMLElement): string[] {
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => Array.from(row.children, (cell) => cell.textContent ?? '').join(': '))
}

describe('a donut from the real endpoint', () => {
  it('shows a skeleton, then an accessible, focusable chart with a hidden data table', async () => {
    render(<Widget widget={widget('invoices', 'invoices.by-status')} context={context()} />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    const chart = await screen.findByRole('img', { name: 'Invoices by status' })
    expect(chart).toHaveAttribute('tabindex', '0')
    expect(chart.querySelector('desc')?.textContent).toBe('Invoices by status: 4 points from Draft to Void. Highest: Paid, 11.')
    expect(tableRows(screen.getByRole('table', { name: 'Invoices by status' }))).toEqual(['Draft: 2', 'Sent: 1', 'Paid: 11', 'Void: 1'])
  })

  it('"Show as a table" swaps the chart for a visible table, and back', async () => {
    const user = userEvent.setup()
    render(<Widget widget={widget('invoices', 'invoices.by-status')} context={context()} />)
    await screen.findByRole('img', { name: 'Invoices by status' })
    await user.click(screen.getByRole('button', { name: 'Show Invoices by status as a table' }))
    expect(screen.queryByRole('img', { name: 'Invoices by status' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Show Invoices by status as a chart' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('table', { name: 'Invoices by status' }).parentElement).not.toHaveClass('sr-only')
    await user.click(screen.getByRole('button', { name: 'Show Invoices by status as a chart' }))
    expect(screen.getByRole('img', { name: 'Invoices by status' })).toBeInTheDocument()
  })
})

describe('time series', () => {
  it('the interval switch refetches with that interval and its default window', async () => {
    const user = userEvent.setup()
    const { client, requests } = realClient()
    render(<Widget widget={widget('invoices', 'invoices.per-period')} context={context(client)} />)
    await screen.findByRole('img', { name: 'Invoices over time' })
    expect(requests.at(-1)).toBe('/api/v1/invoices/aggregate?metric=count&groupBy=created_at&interval=month&from=2025-12-01&to=2026-12-01')
    const group = screen.getByRole('group', { name: 'Invoices over time: interval' })
    await user.click(within(group).getByRole('button', { name: 'Week' }))
    await waitFor(() => expect(requests.at(-1)).toBe('/api/v1/invoices/aggregate?metric=count&groupBy=created_at&interval=week&from=2026-08-24&to=2026-11-16'))
    expect(within(group).getByRole('button', { name: 'Week' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(tableRows(screen.getByRole('table', { name: 'Invoices over time' }))).toHaveLength(12))
    expect(tableRows(screen.getByRole('table', { name: 'Invoices over time' })).at(-1)).toBe('w/c 9 Nov: 2')
  })

  it('stacked bars carry one table column per series', async () => {
    render(<Widget widget={widget('invoices', 'invoices.per-period-by-status')} context={context()} />)
    await screen.findByRole('img', { name: 'Invoices per month by status' })
    const table = screen.getByRole('table', { name: 'Invoices per month by status' })
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Month', 'Draft', 'Sent', 'Paid', 'Void'])
    expect(tableRows(table).at(-1)).toBe('Nov 2026: 2: 0: 1: 1')
  })
})

describe('KPI card', () => {
  it('shows the window total and the trend in words, not only colour', async () => {
    render(<Widget widget={widget('invoices', 'invoices.new')} context={context()} />)
    expect(await screen.findByText('4')).toBeInTheDocument()
    expect(screen.getByText('Up 33% from the previous 30 days')).toHaveClass('text-success')
  })
})

describe('top N with relation labels', () => {
  it('labels related ids through the resolver and names the rest "Other"', async () => {
    const spec: WidgetSpec = { ...widget('invoices', 'invoices.top-customer'), query: { metric: 'count', groupBy: 'customer_id', limit: 3 } }
    render(<Widget widget={spec} context={context()} />)
    await screen.findByRole('img', { name: spec.title })
    expect(tableRows(screen.getByRole('table', { name: spec.title }))).toEqual(['Customer 1: 3', 'Customer 2: 2', 'Customer 3: 2', 'Other: 8'])
  })
})

describe('states', () => {
  it('a server failure becomes a friendly error with Retry, and Retry recovers', async () => {
    const user = userEvent.setup()
    const { transport } = realTransport()
    let calls = 0
    const flaky = createAggregateClient(async (input) => {
      calls += 1
      // A proxy's HTML error page: no problem+json to read.
      return calls === 1 ? new Response('<html>502 Bad Gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } }) : transport(input)
    })
    render(<Widget widget={widget('invoices', 'invoices.by-status')} context={context(flaky)} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('The server had a problem computing this chart. Please try again.')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('img', { name: 'Invoices by status' })).toBeInTheDocument()
  })

  it('a 403 says so plainly', async () => {
    const denied = createAggregateClient(async () => new Response('{}', { status: 403 }))
    render(<Widget widget={widget('invoices', 'invoices.by-status')} context={context(denied)} />)
    expect(await screen.findByRole('alert')).toHaveTextContent("You don't have access to these numbers.")
  })

  it('a 422 shows the server detail and the first issue', async () => {
    const spec: WidgetSpec = { ...widget('invoices', 'invoices.by-status'), query: { metric: 'count', groupBy: 'api_key' } }
    render(<Widget widget={spec} context={context()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Some parameters are not valid. Each issue says how to fix it. "api_key" can\'t be grouped by here.')
  })

  it('all zeros is an empty state, not a flat chart', async () => {
    const spec: WidgetSpec = { ...widget('invoices', 'invoices.by-status'), query: { metric: 'count', groupBy: 'status', filters: [{ field: 'number', op: 'eq', value: 'nope' }] } }
    render(<Widget widget={spec} context={context()} />)
    expect(await screen.findByText('No invoices in this period yet.')).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('suppressed groups are marked in the table and explained under the chart', async () => {
    const spec: WidgetSpec = { ...widget('employees', 'employees.avg-salary'), kind: 'bar', query: { metric: 'avg', field: 'salary', groupBy: 'department' } }
    render(<Widget widget={spec} context={context()} />)
    await screen.findByRole('img', { name: spec.title })
    expect(tableRows(screen.getByRole('table', { name: spec.title }))).toEqual([
      'Engineering: 102,500.00',
      'Sales: 62,000.00',
      'Support: Hidden (too few records)',
      'Finance: Hidden (too few records)',
      'Legal: –',
    ])
    expect(screen.getByText('Groups with fewer than 5 records are hidden to protect privacy.')).toBeInTheDocument()
  })
})
