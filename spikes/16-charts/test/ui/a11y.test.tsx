// @vitest-environment jsdom
/**
 * Accessibility and keyboard: axe-core on whole dashboards and on every card state, the Tab order
 * through a card, arrow keys on a chart, and the demo shell (sidebar, named dashboard, theme).
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../src/demo/App.tsx'
import { resolved as demoResolved } from '../../src/demo/setup.ts'
import { homeDashboardWidgets } from '../../src/shared/dashboard.ts'
import type { WidgetSpec } from '../../src/shared/widgets.ts'
import { ChartCard } from '../../src/ui/components/ChartCard.tsx'
import { DashboardGrid, WidgetSlot } from '../../src/ui/components/DashboardGrid.tsx'
import { Dashboard } from '../../src/ui/Dashboard.tsx'
import { createAggregateClient } from '../../src/ui/data.ts'
import { charts } from '../server/fixture.ts'
import { context, violations } from './render.tsx'

const invoiceWidgets: readonly WidgetSpec[] = charts.get('invoices')?.widgets ?? []

/** Render inside a `<main>` landmark, as every page does (axe's `region` rule). */
const inMain = (): { container: HTMLElement } => ({ container: document.body.appendChild(document.createElement('main')) })

/** Wait until no card is loading any more. */
async function settled(): Promise<void> {
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull(), { timeout: 10_000 })
}

describe('axe: 0 violations', () => {
  it('a full resource dashboard (every chart kind, KPI cards, legends, tables)', async () => {
    render(<Dashboard label="Invoice insights" widgets={invoiceWidgets} context={context()} />, inMain())
    await settled()
    expect(screen.getAllByRole('img').length).toBeGreaterThanOrEqual(8)
    expect(await violations()).toEqual([])
  })

  it('the home dashboard with suppressed salary groups', async () => {
    render(<Dashboard label="Overview" widgets={homeDashboardWidgets(charts, () => true)} context={context()} />, inMain())
    await settled()
    expect(await violations()).toEqual([])
  })

  it('loading, error and empty states', async () => {
    const empty = { rows: [], series: [], empty: true, suppressedCells: 0 }
    render(
      <DashboardGrid label="States">
        <WidgetSlot size="md">
          <ChartCard title="Loading" state={{ status: 'loading' }} format="integer" emptyText="Nothing">
            {() => null}
          </ChartCard>
        </WidgetSlot>
        <WidgetSlot size="md">
          <ChartCard title="Error" state={{ status: 'error', message: 'The server had a problem.', retry: () => undefined }} format="integer" emptyText="Nothing">
            {() => null}
          </ChartCard>
        </WidgetSlot>
        <WidgetSlot size="md">
          <ChartCard title="Empty" state={{ status: 'ready', data: empty, summary: '' }} format="integer" emptyText="No invoices in this period yet.">
            {() => null}
          </ChartCard>
        </WidgetSlot>
      </DashboardGrid>,
      inMain(),
    )
    expect(await violations()).toEqual([])
  })

  it('a chart switched to its visible table', async () => {
    const user = userEvent.setup()
    render(<Dashboard label="Table" widgets={invoiceWidgets.filter((widget) => widget.id === 'invoices.by-status')} context={context()} />, inMain())
    await settled()
    await user.click(screen.getByRole('button', { name: 'Show Invoices by status as a table' }))
    expect(await violations()).toEqual([])
  })

  it('the demo shell, in dark mode, on the named dashboard', async () => {
    const user = userEvent.setup()
    render(<App context={context()} />)
    await user.click(screen.getByRole('button', { name: 'Dark theme' }))
    await user.click(screen.getByRole('button', { name: 'Sales' }))
    await settled()
    expect(document.documentElement).toHaveClass('dark')
    expect(await violations()).toEqual([])
  })
})

describe('keyboard', () => {
  it('Tab reaches the interval switch, the table toggle and the chart itself, in that order', async () => {
    const user = userEvent.setup()
    render(<Dashboard label="One" widgets={invoiceWidgets.filter((widget) => widget.id === 'invoices.per-period')} context={context()} />)
    await settled()
    await user.tab()
    expect(document.activeElement).toHaveAccessibleName('Day')
    await user.tab()
    await user.tab()
    await user.tab()
    expect(document.activeElement).toHaveAccessibleName('Show Invoices over time as a table')
    await user.tab()
    expect(document.activeElement).toHaveAttribute('role', 'img')
    expect(document.activeElement).toHaveAccessibleName('Invoices over time')
  })

  it('arrow keys on a focused chart move the tooltip from point to point', async () => {
    render(<Dashboard label="One" widgets={invoiceWidgets.filter((widget) => widget.id === 'invoices.by-status')} context={context()} />)
    await settled()
    const chart = screen.getByRole('img', { name: 'Invoices by status' })
    act(() => chart.focus())
    fireEvent.keyDown(chart, { key: 'ArrowRight' })
    await waitFor(() => expect(document.querySelector('.recharts-tooltip-wrapper')?.textContent ?? '').toMatch(/Draft|Sent/))
  })
})

describe('the demo shell', () => {
  it('lists the dashboard, one insights entry per resource and the named dashboard', () => {
    render(<App context={context()} />)
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getAllByRole('button').map((button) => button.textContent)).toEqual(['Dashboard', 'Invoices', 'Customers', 'Employees', 'Users', 'Sales'])
    expect(within(nav).getByRole('button', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
    expect(demoResolved.get('invoices')?.issues).toEqual([])
  })

  it('the theme switch works even when storage throws', async () => {
    const user = userEvent.setup()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    render(<App context={{ ...context(), client: createAggregateClient(async () => new Response('{}', { status: 403 })) }} />)
    await user.click(screen.getByRole('button', { name: 'Light theme' }))
    expect(document.documentElement).not.toHaveClass('dark')
    expect(screen.getByRole('button', { name: 'Light theme' })).toHaveAttribute('aria-pressed', 'true')
  })
})
