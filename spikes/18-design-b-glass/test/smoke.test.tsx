// @vitest-environment jsdom
/**
 * Smoke: every screen renders, in BOTH themes, with its page heading, and the theme is applied
 * to <html> (the `.dark` class switches the token block in tokens.css).
 */
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderAt, SCREENS } from './render.tsx'

describe.each(['light', 'dark'] as const)('%s theme', (theme) => {
  it.each(SCREENS)('%s renders its heading', async (path, heading) => {
    renderAt(path, theme)
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
    expect(document.documentElement.classList.contains('dark')).toBe(theme === 'dark')
    // Exactly one h1 per screen: a clear document outline.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })
})

describe('screen states', () => {
  it('the empty list explains what to do next', async () => {
    renderAt('/invoices?state=empty')
    expect(await screen.findByRole('heading', { name: 'No invoices yet' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /create invoice/i })).toHaveAttribute('href', '/invoices/new')
  })

  it('the loading list shows a busy skeleton instead of rows', async () => {
    renderAt('/invoices?state=loading')
    expect(await screen.findByLabelText('Loading invoices')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('the dashboard shows four KPIs, the charts and recent records', async () => {
    renderAt('/')
    for (const label of ['Revenue (MTD)', 'Outstanding', 'New customers', 'Avg. days to pay']) expect(await screen.findByRole('heading', { name: label })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Revenue' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Invoices by status' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Top items' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Recent activity' })).toBeInTheDocument()
    // Charts carry a screen-reader table with the same numbers.
    expect(screen.getByRole('table', { name: 'Revenue by month' })).toBeInTheDocument()
  })
})
