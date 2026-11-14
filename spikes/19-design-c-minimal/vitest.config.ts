/**
 * Vitest config. Token and contrast tests run in Node; screen tests opt into jsdom with a
 * `// @vitest-environment jsdom` comment at the top of the file.
 */
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['test/setup.ts'],
    // Whole screens (charts, tables, axe) render per test, so allow more than the default 5 s.
    testTimeout: 30_000,
    restoreMocks: true,
  },
})
