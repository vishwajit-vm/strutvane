/**
 * Test setup: DOM matchers, cleanup between React tests, and the browser APIs jsdom lacks but
 * Radix and Recharts call (ResizeObserver, matchMedia, pointer capture, scrollIntoView).
 */
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

if (typeof window !== 'undefined') {
  window.scrollTo = () => undefined
  window.matchMedia ??= (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) satisfies MediaQueryList
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver ??= ResizeObserverStub
  Element.prototype.scrollIntoView ??= () => undefined
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => undefined
  // axe probes canvas for icon fonts; jsdom has none, and null is the documented 'unsupported' answer.
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext
  URL.createObjectURL ??= () => 'blob:preview'
  URL.revokeObjectURL ??= () => undefined
}

afterEach(async () => {
  if (typeof document === 'undefined') return
  const { cleanup } = await import('@testing-library/react')
  cleanup()
  document.documentElement.className = ''
  localStorage.clear()
})
