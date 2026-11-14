/**
 * Vitest config. Server, generator and pure tests run in Node; React tests opt into jsdom with a
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
    // PGlite boots a whole Postgres in WebAssembly, and the type-check test starts the compiler.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    restoreMocks: true,
  },
})
