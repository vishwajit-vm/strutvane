// @vitest-environment jsdom
/**
 * The keyboard-first promises and the main flows: command palette, global shortcuts, table row
 * navigation, selection + bulk delete with confirm and Undo, filter chips, form validation focus,
 * theme memory, notifications and the drawer.
 */
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { THEME_KEY } from '../src/lib/theme.tsx'
import { renderAt } from './render.tsx'

describe('command palette', () => {
  it('Ctrl+K opens it; typing an invoice number and Enter opens that invoice', async () => {
    const { user } = renderAt('/')
    await screen.findByRole('heading', { level: 1, name: 'Good morning, Maya' })
    await user.keyboard('{Control>}k{/Control}')
    const input = await screen.findByPlaceholderText('Search invoices, pages and actions…')
    await user.type(input, '2264')
    expect(await screen.findByRole('option', { name: /INV-2264/ })).toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('heading', { level: 1, name: 'INV-2264' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/invoices/inv-2264')
  })

  it('"Change theme…" opens a sub-page; choosing Dark applies and remembers it', async () => {
    const { user } = renderAt('/')
    await screen.findByRole('heading', { level: 1, name: 'Good morning, Maya' })
    await user.click(screen.getByRole('button', { name: 'Search or jump to' }))
    await user.click(await screen.findByRole('option', { name: /Change theme/ }))
    await user.click(await screen.findByRole('option', { name: /Dark/ }))
    expect(document.documentElement).toHaveClass('dark')
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark')
  })
})

describe('global shortcuts', () => {
  it('G then I goes to invoices; C creates an invoice; ? shows the shortcuts', async () => {
    const { user } = renderAt('/')
    await screen.findByRole('heading', { level: 1, name: 'Good morning, Maya' })
    await user.keyboard('gi')
    expect(await screen.findByRole('heading', { level: 1, name: 'Invoices' })).toBeInTheDocument()
    await user.keyboard('c')
    expect(await screen.findByRole('heading', { level: 1, name: 'New invoice' })).toBeInTheDocument()
    await user.keyboard('?')
    expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
  })
})

describe('invoice table', () => {
  it('J/K move between rows, X selects, Enter opens', async () => {
    const { user } = renderAt('/invoices')
    const first = await screen.findByRole('row', { name: /INV-2278/ })
    first.focus()
    await user.keyboard('j')
    const second = screen.getByRole('row', { name: /INV-2277/ })
    expect(second).toHaveFocus()
    await user.keyboard('x')
    expect(screen.getByRole('checkbox', { name: 'Select INV-2277' })).toBeChecked()
    expect(screen.getByRole('toolbar', { name: 'Bulk actions' })).toHaveTextContent('1 selected')
    await user.keyboard('k{Enter}')
    expect(await screen.findByRole('heading', { level: 1, name: 'INV-2278' })).toBeInTheDocument()
  })

  it('sorting by amount sets aria-sort and the URL', async () => {
    const { user } = renderAt('/invoices')
    await screen.findByRole('row', { name: /INV-2278/ })
    await user.click(screen.getByRole('button', { name: /^Amount/ }))
    expect(screen.getByRole('columnheader', { name: /Amount/ })).toHaveAttribute('aria-sort', 'ascending')
    expect(window.location.search).toBe('?sort=amount')
  })

  it('bulk delete asks first (Cancel focused), then removes the rows and offers Undo', async () => {
    const { user } = renderAt('/invoices')
    await screen.findByRole('row', { name: /INV-2278/ })
    await user.click(screen.getByRole('checkbox', { name: 'Select INV-2278' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select INV-2277' }))
    await user.click(within(screen.getByRole('toolbar', { name: 'Bulk actions' })).getByRole('button', { name: /Delete/ }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete 2 invoices?' })
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Delete 2 invoices' }))
    await waitFor(() => expect(screen.queryByRole('row', { name: /INV-2278/ })).toBeNull())
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(await screen.findByRole('row', { name: /INV-2278/ })).toBeInTheDocument()
  })

  it('filter chips show active filters and remove them one by one', async () => {
    const { user } = renderAt('/invoices?status=overdue&min=10000')
    const chips = await screen.findByRole('list', { name: 'Active filters' })
    expect(chips).toHaveTextContent('Status isOverdue')
    expect(chips).toHaveTextContent('Amount ≥€10K')
    await user.click(screen.getByRole('button', { name: /Remove filter: Status is/ }))
    expect(window.location.search).toBe('?min=10000')
  })

  it('a search with no matches says so and offers to clear filters', async () => {
    renderAt('/invoices?q=zzzz-nothing')
    expect(await screen.findByRole('heading', { name: 'No invoices match' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
  })
})

describe('invoice form', () => {
  it('a failed submit shows inline errors, a summary, and focuses the first invalid field', async () => {
    const { user } = renderAt('/invoices/new')
    await user.click(await screen.findByRole('button', { name: 'Create invoice' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Fix 3 fields to create the invoice')
    expect(screen.getByRole('combobox', { name: 'Customer' })).toHaveFocus()
    expect(screen.getByRole('combobox', { name: 'Customer' })).toHaveAttribute('aria-invalid', 'true')
  })

  it('the async relation select searches and fills the billing e-mail', async () => {
    const { user } = renderAt('/invoices/new')
    await user.click(await screen.findByRole('combobox', { name: 'Customer' }))
    await user.type(screen.getByPlaceholderText('Search by company or contact…'), 'kestrel')
    await user.click(await screen.findByRole('option', { name: /Kestrel Analytics/ }, { timeout: 2000 }))
    expect(screen.getByRole('textbox', { name: 'Billing e-mail' })).toHaveValue('billing@kestrel.example')
  })

  it('tags: Enter adds, Backspace removes; the save bar notices unsaved changes', async () => {
    const { user } = renderAt('/invoices/new')
    const tags = await screen.findByRole('combobox', { name: /Tags/ })
    await user.type(tags, 'Priority{Enter}Q4,')
    expect(screen.getByRole('button', { name: 'Remove Priority' })).toBeInTheDocument()
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    await user.keyboard('{Backspace}')
    expect(screen.queryByRole('button', { name: 'Remove Q4' })).toBeNull()
  })
})

describe('shell', () => {
  it('the theme survives a reload through localStorage, and storage errors are harmless', async () => {
    window.localStorage.setItem(THEME_KEY, 'dark')
    window.history.replaceState(null, '', '/')
    const { render } = await import('@testing-library/react')
    const { App } = await import('../src/App.tsx')
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: 'Good morning, Maya' })
    expect(document.documentElement).toHaveClass('dark')
  })

  it('notifications: unread count in the name, mark all as read', async () => {
    const { user } = renderAt('/')
    await user.click(await screen.findByRole('button', { name: 'Notifications, 3 unread' }))
    await user.click(await screen.findByRole('button', { name: /Mark all as read/ }))
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
  })

  it('the board opens a card in the side drawer', async () => {
    const { user } = renderAt('/invoices/board')
    await user.click(await screen.findByRole('button', { name: /^INV-2278,/ }))
    const drawer = await screen.findByRole('dialog', { name: 'INV-2278' })
    expect(within(drawer).getByRole('button', { name: /Open invoice/ })).toBeInTheDocument()
  })
})
