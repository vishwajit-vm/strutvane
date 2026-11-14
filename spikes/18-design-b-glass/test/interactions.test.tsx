// @vitest-environment jsdom
/**
 * Behaviour of the clickable mockup: theme memory, command palette, list toolbar, selection and
 * bulk delete with confirm + undo toast, quick view, form validation, and the empty-filter state.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SOLID_KEY, THEME_KEY } from '../src/lib/theme.tsx'
import { renderAt } from './render.tsx'

describe('theme', () => {
  it('switching to dark is applied to <html> and remembered', async () => {
    const { user } = renderAt('/')
    await user.click(await screen.findByRole('button', { name: /^theme:/i }))
    await user.click(await screen.findByRole('menuitemradio', { name: 'Dark' }))
    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
  })

  it('"Solid surfaces" turns the reduced-transparency fallback on and remembers it', async () => {
    const { user } = renderAt('/')
    await user.click(await screen.findByRole('button', { name: /^theme:/i }))
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Solid surfaces' }))
    expect(document.documentElement.dataset['transparency']).toBe('reduced')
    expect(localStorage.getItem(SOLID_KEY)).toBe('1')
  })

  it('still works when storage throws (private mode)', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const { user } = renderAt('/')
    await user.click(await screen.findByRole('button', { name: /^theme:/i }))
    await user.click(await screen.findByRole('menuitemradio', { name: 'Dark' }))
    expect(document.documentElement).toHaveClass('dark')
  })
})

describe('command palette', () => {
  it('Ctrl+K opens it, typing filters, Enter opens the invoice and closes the palette', async () => {
    const { user } = renderAt('/')
    await screen.findByRole('heading', { level: 1, name: /dashboard/i })
    await user.keyboard('{Control>}k{/Control}')
    const input = await screen.findByRole('combobox', { name: /search pages/i })
    await user.type(input, 'kestrel')
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveTextContent(/kestrel aviation/i)
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('heading', { level: 1, name: /inv-2026-/i })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /search pages/i })).not.toBeInTheDocument()
  })

  it('says so when nothing matches', async () => {
    const { user } = renderAt('/')
    await user.keyboard('{Control>}k{/Control}')
    await user.type(await screen.findByRole('combobox', { name: /search pages/i }), 'zzzz')
    expect(screen.getByText(/no results for/i)).toBeInTheDocument()
  })
})

describe('invoice list', () => {
  it('search narrows the rows and the empty result offers to clear', async () => {
    const { user } = renderAt('/invoices')
    await user.type(await screen.findByRole('searchbox', { name: 'Search invoices' }), 'no-such-customer')
    expect(await screen.findByRole('heading', { name: 'No invoices match' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear search and filters' }))
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('a saved view filters, and its chips remove one filter at a time', async () => {
    const { user } = renderAt('/invoices')
    await user.click(await screen.findByRole('button', { name: /needs attention/i }))
    expect(screen.getByRole('button', { name: /needs attention/i })).toHaveAttribute('aria-pressed', 'true')
    const remove = screen.getByRole('button', { name: 'Remove filter Status: Overdue' })
    await user.click(remove)
    expect(screen.queryByRole('button', { name: 'Remove filter Status: Overdue' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove filter Status: Pending' })).toBeInTheDocument()
  })

  it('sorting a column sets aria-sort', async () => {
    const { user } = renderAt('/invoices')
    await user.click(await screen.findByRole('button', { name: /^amount/i }))
    expect(screen.getByRole('columnheader', { name: /amount/i })).toHaveAttribute('aria-sort', 'descending')
  })

  it('columns can be hidden from the Columns menu', async () => {
    const { user } = renderAt('/invoices')
    expect(await screen.findByRole('columnheader', { name: /owner/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Columns' }))
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Owner' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('columnheader', { name: /owner/i })).not.toBeInTheDocument()
  })

  it('page size and pages work, with a summary', async () => {
    const { user } = renderAt('/invoices')
    expect(await screen.findByText(/showing/i)).toHaveTextContent('Showing 1–10 of 86 invoices')
    await user.click(screen.getByRole('button', { name: 'Page 2' }))
    expect(screen.getByText(/showing/i)).toHaveTextContent('Showing 11–20 of 86 invoices')
    expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page')
  })

  it('bulk delete asks first (Cancel focused), then deletes with an Undo toast', async () => {
    const { user } = renderAt('/invoices')
    await user.click(await screen.findByRole('checkbox', { name: 'Select INV-2026-1048' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select INV-2026-1083' }))
    const bar = screen.getByRole('toolbar', { name: 'Bulk actions' })
    expect(bar).toHaveTextContent('2')
    await user.click(within(bar).getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete 2 invoices?' })
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Delete 2 invoices' }))
    expect(await screen.findByText('2 invoices deleted')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'INV-2026-1048' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByRole('link', { name: 'INV-2026-1048' })).toBeInTheDocument()
  })

  it('quick view opens a drawer with the invoice and closes with Escape', async () => {
    const { user } = renderAt('/invoices')
    await user.click(await screen.findByRole('button', { name: 'Actions for INV-2026-1048' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Quick view' }))
    const drawer = await screen.findByRole('dialog', { name: 'INV-2026-1048' })
    expect(within(drawer).getByText('Line items')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('switches to the grid view', async () => {
    const { user } = renderAt('/invoices')
    await user.click(await screen.findByRole('button', { name: 'Grid view' }))
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Invoices' })).toBeInTheDocument()
  })
})

describe('invoice form', () => {
  it('submitting empty shows inline errors and focuses the first invalid field', async () => {
    const { user } = renderAt('/invoices/new')
    await user.click(await screen.findByRole('button', { name: /create & send/i }))
    expect(await screen.findByText('Choose who this invoice is for.')).toBeInTheDocument()
    expect(screen.getByText('Describe the item.')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /customer/i })).toHaveFocus()
    expect(screen.getByRole('combobox', { name: /customer/i })).toHaveAttribute('aria-invalid', 'true')
  })

  it('the async relation select finds and picks a customer', async () => {
    const { user } = renderAt('/invoices/new')
    await user.click(await screen.findByRole('combobox', { name: /customer/i }))
    await user.type(await screen.findByRole('combobox', { name: 'Search customers' }), 'oslo')
    await user.clear(screen.getByRole('combobox', { name: 'Search customers' }))
    await user.type(screen.getByRole('combobox', { name: 'Search customers' }), 'tidewater')
    const option = await screen.findByRole('option', { name: /tidewater energy/i }, { timeout: 3000 })
    await user.click(option)
    expect(screen.getByRole('combobox', { name: /customer/i })).toHaveTextContent('Tidewater Energy')
  })

  it('tags: Enter adds, the remove button deletes', async () => {
    const { user } = renderAt('/invoices/new')
    const tags = await screen.findByRole('textbox', { name: 'Tags' })
    await user.type(tags, 'Urgent{Enter}')
    expect(screen.getByRole('button', { name: 'Remove tag Urgent' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove tag Urgent' }))
    expect(screen.queryByRole('button', { name: 'Remove tag Urgent' })).not.toBeInTheDocument()
  })

  it('the drop zone previews accepted files and rejects others with a reason', async () => {
    renderAt('/invoices/new')
    const input = await screen.findByLabelText('Attachments')
    const good = new File(['%PDF'], 'timesheet.pdf', { type: 'application/pdf' })
    const bad = new File(['MZ'], 'setup.exe', { type: 'application/x-msdownload' })
    // fireEvent, not user.upload: user-event would pre-filter by the accept attribute, and the
    // component must defend itself anyway (drag-and-drop ignores accept).
    fireEvent.change(input, { target: { files: [good, bad] } })
    expect(screen.getByRole('list', { name: 'Attached files' })).toHaveTextContent('timesheet.pdf')
    expect(screen.getByRole('alert')).toHaveTextContent('setup.exe isn’t a PDF or image')
  })
})

describe('detail page', () => {
  it('tabs switch with the keyboard', async () => {
    const { user } = renderAt('/invoices/1044')
    const overview = await screen.findByRole('tab', { name: 'Overview' })
    await act(async () => overview.focus())
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: /activity/i })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText(/sent it to/i)).toBeInTheDocument()
  })
})
