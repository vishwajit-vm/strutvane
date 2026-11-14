/**
 * Render the whole app at a URL, the way a user would land on it.
 *
 * @example
 * renderAt('/invoices', 'dark')
 */
import { render, type RenderResult } from '@testing-library/react'
import { App } from '../src/app/App.tsx'
import type { ThemeChoice } from '../src/lib/theme.tsx'

export function renderAt(path: string, theme: ThemeChoice = 'light'): RenderResult {
  window.history.pushState(null, '', path)
  return render(<App theme={theme} />)
}
