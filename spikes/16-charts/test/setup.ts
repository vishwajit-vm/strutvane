/**
 * Test setup: DOM matchers (`toBeInTheDocument`, ...), a ResizeObserver for Recharts in jsdom, and
 * unmounting React trees after each test.
 */
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

// jsdom has no ResizeObserver. Chart sizes come from the getBoundingClientRect shim below, so the
// observer only has to exist; it never needs to fire.
if (typeof window !== 'undefined' && typeof window.ResizeObserver === 'undefined') {
  class NoopResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  window.ResizeObserver = NoopResizeObserver
}

// jsdom has no layout, so every box measures 0×0 and Recharts' ResponsiveContainer would draw
// nothing. Give chart containers a fixed size; everything else keeps jsdom's zeros.
if (typeof window !== 'undefined') {
  const original = Element.prototype.getBoundingClientRect
  Element.prototype.getBoundingClientRect = function getBoundingClientRect(this: Element): DOMRect {
    if (this.classList.contains('recharts-responsive-container')) return new DOMRect(0, 0, 600, 260)
    return original.call(this)
  }
}

afterEach(async () => {
  // Only React tests (jsdom) have something to clean up; Node tests skip the import entirely.
  if (typeof document === 'undefined') return
  const { cleanup } = await import('@testing-library/react')
  cleanup()
})
