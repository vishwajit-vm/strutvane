import { defineConfig } from 'vitest/config'

// jsdom (not happy-dom): axe-core relies on DOM accessibility APIs that jsdom implements more
// completely. Neither engine does layout, so color-contrast cannot be checked here (see README).
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
    testTimeout: 20_000,
    restoreMocks: true,
  },
})
