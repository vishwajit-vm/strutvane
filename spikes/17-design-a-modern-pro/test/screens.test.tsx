/**
 * Smoke test: every screen in the Screens switcher renders in both themes, with a top-level
 * heading, the right theme class on <html>, and without throwing.
 */
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
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
