/**
 * Test setup: DOM matchers, cleanup between tests, and the few browser APIs jsdom lacks but Radix
 * and Recharts call (ResizeObserver, pointer capture, scrollIntoView, matchMedia).
 */
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

class NoopResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof window !== 'undefined') {
  window.ResizeObserver ??= NoopResizeObserver
  window.scrollTo = () => undefined
  Element.prototype.scrollIntoView ??= () => undefined
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => undefined
  // Behave like a desktop browser in light mode: `(min-width: 1024px)` matches (docked sidebar),
  // everything else (dark preference, phone width) does not.
  window.matchMedia = (query: string) =>
    ({
      matches: /min-width:\s*1024px/.test(query),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) satisfies MediaQueryList
}

// Recharts warns that charts have no size: jsdom has no layout. That is expected, not a defect.
// Plain reassignment, not vi.spyOn: `restoreMocks` would undo a spy after the first test.
const warn = console.warn.bind(console)
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('should be greater than 0')) return
  warn(...args)
}

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  document.documentElement.classList.remove('dark')
})
