import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // PGlite boots a WASM Postgres; property tests run hundreds of DB round-trips.
    testTimeout: 120_000,
    hookTimeout: 60_000,
  },
})
