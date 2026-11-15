/**
 * Test setup: DOM matchers, cleanup between tests, and the few browser APIs jsdom lacks that
 * Radix (popper positioning, pointer capture) and cmdk (scrolling the active item) call.
 */
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeAll } from 'vitest'

if (typeof document !== 'undefined') {
  // Screens are lazy-loaded, and the first import of one (the dashboard pulls in Recharts) is
  // compiled on demand. That cost used to land INSIDE a test's `findBy…` wait and, on a busy
  // machine, outlast it: the dashboard tests failed while the UI was fine. Every screen is now
  // loaded once, before any test, in a hook whose only job is that (its own generous timeout), so
  // the waits measure rendering only.
  beforeAll(async () => {
    const { preloadScreens } = await import('../src/App.tsx')
    await preloadScreens()
  }, 120_000)
  const { configure } = await import('@testing-library/react')
  configure({ asyncUtilTimeout: 5000 })
}

if (typeof window !== 'undefined') {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  window.ResizeObserver ??= ResizeObserverStub
  Element.prototype.scrollIntoView ??= function scrollIntoView() {}
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => undefined
  window.scrollTo = () => undefined
  HTMLElement.prototype.scrollTo ??= function scrollTo() {}
}

afterEach(async () => {
  // Only DOM tests have something to clean up; Node tests skip the import entirely.
  if (typeof document === 'undefined') return
  const { cleanup } = await import('@testing-library/react')
  cleanup()
  window.localStorage.clear()
  document.documentElement.className = ''
})
