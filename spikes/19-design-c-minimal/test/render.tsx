/**
 * Render the whole app at a URL in a given theme, the way a user would land on it.
 *
 * @example
 * const { user } = renderAt('/invoices', 'dark')
 * await screen.findByRole('heading', { level: 1, name: 'Invoices' })
 */
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../src/App.tsx'
import type { ThemeMode } from '../src/lib/theme.tsx'

export function renderAt(path: string, theme: ThemeMode = 'light') {
  window.history.replaceState(null, '', path)
  const user = userEvent.setup()
  const view = render(<App initialTheme={theme} />)
  return { user, ...view }
}
