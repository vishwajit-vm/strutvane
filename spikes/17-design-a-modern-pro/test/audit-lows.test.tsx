/**
 * The open lows from the 2026-11-15 audit: list state in the URL (deep links, Back restores it),
 * an unsaved-changes guard, no navigation after the form is gone, a 404 for editing an unknown
 * invoice, and a relation search that cannot spin forever.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RelationSelect } from '../src/components/form-widgets.tsx'
import { renderAt } from './render-app.tsx'

const mainNav = () => within(screen.getByRole('navigation', { name: 'Main' }))

describe('invoice list state lives in the URL', () => {
  it('a deep link opens the list with its status, search, sort and page', () => {
    renderAt('/invoices?status=overdue&q=a&sort=amount.asc&size=25')
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(/Overdue/i)
    expect(screen.getByRole('searchbox', { name: 'Search invoices' })).toHaveValue('a')
  })

  it('changing a filter updates the URL, and Back from a record restores the list exactly', async () => {
    const user = userEvent.setup()
    renderAt('/invoices')
    await user.type(screen.getByRole('searchbox', { name: 'Search invoices' }), 'gr')
    await waitFor(() => expect(window.location.search).toContain('q=gr'))
    const box = screen.getByRole('searchbox', { name: 'Search invoices' })
    expect(box).toHaveFocus() // typing does not remount the screen
    const link = screen.getAllByRole('link').find((a) => /^\/invoices\/INV-/.test(a.getAttribute('href') ?? ''))
    if (!link) throw new Error('no invoice link')
    await user.click(link)
    await waitFor(() => expect(window.location.pathname).toMatch(/^\/invoices\/INV-/))
    act(() => window.history.back())
    await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Search invoices' })).toHaveValue('gr'))
  })

  it('hostile list URLs fall back to defaults instead of crashing', () => {
    renderAt('/invoices?page=-5&size=99999&sort=__proto__.x&status=nope&min=abc')
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(/All/)
  })
})

describe('invoice form', () => {
  it('editing an unknown invoice is the 404, not a form for a record that does not exist', () => {
    renderAt('/invoices/NOPE/edit')
    expect(screen.getByText('Page not found')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Description' })).toBeNull()
  })

  it('asks before leaving with unsaved changes; Cancel stays, Discard leaves', async () => {
    const user = userEvent.setup()
    renderAt('/invoices/INV-1001/edit')
    await user.type(screen.getByRole('textbox', { name: 'Description' }), ' edited')
    await user.click(mainNav().getByRole('link', { name: /Dashboard/ }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Leave without saving?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(window.location.pathname).toBe('/invoices/INV-1001/edit')
    await user.click(mainNav().getByRole('link', { name: /Dashboard/ }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'))
  })

  it('leaving while a save is finishing never pulls the user back', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      renderAt('/invoices/INV-1001/edit')
      await user.type(screen.getByRole('textbox', { name: 'Description' }), ' more')
      await user.click(screen.getByRole('button', { name: /Save changes/ }))
      await user.click(mainNav().getByRole('link', { name: /Dashboard/ }))
      expect(screen.queryByRole('alertdialog')).toBeNull()
      await waitFor(() => expect(window.location.pathname).toBe('/dashboard'))
      await act(async () => {
        vi.advanceTimersByTime(2000)
      })
      expect(window.location.pathname).toBe('/dashboard')
    } finally {
      vi.useRealTimers()
    }
  })

  it('a failed relation search stops the spinner and says so (no endless loading)', async () => {
    const user = userEvent.setup()
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(<RelationSelect id="c" value={null} onChange={() => undefined} search={() => Promise.reject(new Error('offline'))} aria-label="Customer" />)
    await user.click(screen.getByRole('button', { name: 'Customer' }))
    expect(await screen.findByText(/Could not load results/)).toBeInTheDocument()
    quiet.mockRestore()
  })
})
