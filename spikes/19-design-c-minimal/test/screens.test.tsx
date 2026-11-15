// @vitest-environment jsdom
/**
 * Smoke test: every screen and state in the registry renders its page heading, in both themes,
 * with the theme class applied to <html>. The registry is the same list the "Screens" switcher
 * uses, so a screen cannot be added to the mockup without being covered here.
 */
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SCREENS } from '../src/shell/screens.ts'
import { renderAt } from './render.tsx'

describe.each(['light', 'dark'] as const)('every screen renders in the %s theme', (theme) => {
  it.each(SCREENS.map((entry) => [entry.label, entry] as const))('%s', async (_label, entry) => {
    renderAt(entry.path, theme)
    expect(await screen.findByRole('heading', { level: 1, name: entry.heading })).toBeInTheDocument()
    expect(document.documentElement.classList.contains('dark')).toBe(theme === 'dark')
  })
})

describe('states and fallbacks', () => {
  it('the empty list shows the empty state with its call to action', async () => {
    renderAt('/invoices?state=empty')
    expect(await screen.findByRole('heading', { name: 'No invoices yet' })).toBeInTheDocument()
    // One in the page header, one as the empty state's call to action.
    expect(screen.getAllByRole('link', { name: 'New invoice' })).toHaveLength(2)
  })

  it('the loading list is marked busy and shows no rows', async () => {
    renderAt('/invoices?state=loading')
    expect(await screen.findByRole('region', { name: 'Invoice results' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('row', { name: /INV-/ })).toBeNull()
  })

  it('a malformed URL (bad percent-encoding) is the friendly 404, never a blank page', async () => {
    renderAt('/invoices/%E0%A4%A')
    expect(await screen.findByRole('heading', { name: 'This page doesn’t exist' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })

  it('a screen that throws while rendering shows a message inside the shell, not a blank page', async () => {
    const { render } = await import('@testing-library/react')
    const { ScreenErrorBoundary } = await import('../src/screens/ScreenError.tsx')
    const { RouterProvider } = await import('../src/lib/router.tsx')
    const Broken = (): never => {
      throw new Error('boom')
    }
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <RouterProvider>
        <ScreenErrorBoundary>
          <Broken />
        </ScreenErrorBoundary>
      </RouterProvider>,
    )
    quiet.mockRestore()
    expect(screen.getByRole('alert')).toHaveTextContent('This page couldn’t be shown')
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/')
  })

  it('an unknown URL or record is a friendly 404 inside the shell', async () => {
    renderAt('/invoices/inv-0001')
    expect(await screen.findByRole('heading', { name: 'This page doesn’t exist' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })
})
