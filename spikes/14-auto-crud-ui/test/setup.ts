/**
 * Test setup: DOM matchers (`toBeInTheDocument`, ...), a warm-up before the first React test of a
 * file, and a clean browser between tests.
 *
 * Why the warm-up: the first render of the whole app in a file compiles and evaluates the route
 * tree, the registry and the screens on demand. That cold cost used to land INSIDE the first
 * test's `findBy…` wait (1 s by default) and, on a busy machine, outlast it: "goes back in
 * history" and "shows page numbers" failed while the UI was fine. The warm-up pays it once, in a
 * hook with its own timeout, so every assertion wait measures rendering only.
 *
 * Why the reset: view preferences, the collapsed menu and the theme live in localStorage and on
 * `<html>`; without a reset, a test's outcome depended on the tests that ran before it.
 */
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeAll } from 'vitest'

// jsdom does not implement scrolling; the router's scroll restoration calls it on navigation.
if (typeof window !== 'undefined') window.scrollTo = () => undefined

/** Forget everything a test left in the browser. */
function resetBrowser(): void {
  window.localStorage.clear()
  document.documentElement.className = ''
  document.documentElement.removeAttribute('style')
}

if (typeof document !== 'undefined') {
  beforeAll(async () => {
    const { cleanup, screen } = await import('@testing-library/react')
    const { renderApp } = await import('./app/render-app.tsx')
    renderApp({ path: '/posts' })
    await screen.findByRole('table', { name: 'Posts' }, { timeout: 60_000 })
    cleanup()
    resetBrowser()
  }, 120_000)
}

afterEach(async () => {
  // Only React tests (jsdom) have something to clean up; Node tests skip the import entirely.
  if (typeof document === 'undefined') return
  const { cleanup } = await import('@testing-library/react')
  cleanup()
  resetBrowser()
})
