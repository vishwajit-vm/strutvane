/**
 * Smoke test: every screen in the Screens switcher renders in both themes, with a top-level
 * heading, the right theme class on <html>, and without throwing.
 */
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SCREENS } from '../src/app/screens.ts'
import { renderAt } from './render-app.tsx'

describe.each(['light', 'dark'] as const)('%s theme', (theme) => {
  it.each(SCREENS.map((entry) => [entry.label, entry.path] as const))('renders %s (%s)', async (_label, path) => {
    renderAt(path, theme)
    expect(await screen.findByRole('heading', { level: 1 })).toBeVisible()
    expect(document.documentElement.classList.contains('dark')).toBe(theme === 'dark')
    expect(screen.queryByText('Page not found')).toBeNull()
  })
})

describe('shell', () => {
  it('shows the sidebar, top bar and Screens switcher on inner pages', () => {
    renderAt('/dashboard')
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mockup screens' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
  })

  it('a malformed URL (bad percent-encoding) is the 404 inside the shell, never a blank page', () => {
    renderAt('/invoices/%E0%A4%A')
    expect(screen.getByText('Page not found')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })

  it('a screen that throws while rendering shows a message inside the shell, not a blank page', async () => {
    const { render } = await import('@testing-library/react')
    const { ScreenErrorBoundary } = await import('../src/screens/kit/ScreenError.tsx')
    const Broken = (): never => {
      throw new Error('boom')
    }
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <ScreenErrorBoundary>
        <Broken />
      </ScreenErrorBoundary>,
    )
    quiet.mockRestore()
    expect(screen.getByRole('alert')).toHaveTextContent('This page couldn’t be shown')
  })

  it('offers the Screens switcher on the bare auth pages too', () => {
    renderAt('/sign-in')
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Mockup screens' })).toBeInTheDocument()
  })

  it('remembers the theme choice', async () => {
    renderAt('/dashboard', 'light')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Switch to dark theme' }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(window.localStorage.getItem('strutvane.design-a.theme')).toBe('dark')
  })

  it('shows a friendly 404 for unknown routes', () => {
    renderAt('/nope')
    expect(screen.getByText('Page not found')).toBeInTheDocument()
  })
})
