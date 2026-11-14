/**
 * Vitest config. Screen tests render real components in jsdom; the token tests read the CSS
 * and source files from disk, so they run in the same environment without extra setup.
 */
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['test/setup.ts'],
    // Whole screens (charts, tables, axe) render per test; give them room on slow machines.
    testTimeout: 30_000,
    restoreMocks: true,
    css: false,
  },
})
