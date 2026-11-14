/**
 * Test setup: DOM matchers (`toBeInTheDocument`, ...) and unmounting React trees after each test.
 */
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

// jsdom does not implement scrolling; the router's scroll restoration calls it on navigation.
if (typeof window !== 'undefined') window.scrollTo = () => undefined

afterEach(async () => {
  // Only React tests (jsdom) have something to clean up; Node tests skip the import entirely.
  if (typeof document === 'undefined') return
  const { cleanup } = await import('@testing-library/react')
  cleanup()
})
