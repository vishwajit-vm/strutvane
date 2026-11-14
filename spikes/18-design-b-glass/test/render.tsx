/**
 * Render the real app at a URL, in a given theme, the way main.tsx does but with a MemoryRouter.
 *
 * @example
 *   const { user } = renderAt('/invoices', 'dark')
 *   await user.click(screen.getByRole('button', { name: 'Filters' }))
 */
import { render, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { AppRoutes, Providers } from '../src/App.tsx'

export type ThemeName = 'light' | 'dark'

export function renderAt(path: string, theme: ThemeName = 'light'): RenderResult & { user: ReturnType<typeof userEvent.setup> } {
  const user = userEvent.setup()
  const result = render(
    <Providers theme={theme}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </Providers>,
  )
  return { ...result, user }
}

/** Every screen of the mockup with the heading it must show. */
export const SCREENS: readonly (readonly [path: string, heading: RegExp])[] = [
  ['/sign-in', /welcome back/i],
  ['/forgot-password', /reset your password/i],
  ['/', /^dashboard$/i],
  ['/invoices', /^invoices/i],
  ['/invoices?state=empty', /^invoices/i],
  ['/invoices?state=loading', /^invoices/i],
  ['/invoices/new', /new invoice/i],
  ['/invoices/1044/edit', /edit inv-2026-1044/i],
  ['/invoices/1044', /inv-2026-1044/i],
  ['/settings/profile', /account settings/i],
  ['/settings/security', /account settings/i],
  ['/settings/sessions', /account settings/i],
  ['/settings/notifications', /account settings/i],
  ['/settings/api-tokens', /account settings/i],
  ['/team', /team members/i],
  ['/board', /deals board/i],
  ['/calendar', /calendar/i],
  ['/overlays', /overlays & feedback/i],
  ['/does-not-exist', /page not found/i],
]
