/**
 * Test setup: DOM matchers, cleanup between tests, and the few browser APIs jsdom lacks that
 * Radix (popper positioning, pointer capture) and cmdk (scrolling the active item) call.
 */
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

if (typeof document !== 'undefined') {
  // Screens are lazy-loaded; the first import of the chart library in a test file can take
  // longer than Testing Library's default 1 s, so `findBy…` waits up to 5 s.
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
