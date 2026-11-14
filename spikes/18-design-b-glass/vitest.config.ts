/**
 * Vitest config. Pure tests (contrast maths, token rules, list logic) run in Node; screen tests
 * opt into jsdom with a `// @vitest-environment jsdom` comment at the top of the file.
 */
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['test/setup.ts'],
    // Whole screens render in these tests, and axe walks every node: give them room.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    restoreMocks: true,
  },
})
