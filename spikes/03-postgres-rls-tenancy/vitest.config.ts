import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Starts throwaway PostgreSQL 18 + PgBouncer containers once for the whole run and removes them afterwards.
    globalSetup: ['./test/global-setup.ts'],
    // All test files share one database and one PgBouncer. Some tests deliberately poison pooled
    // connections (session-level SET) to prove a leak, so files must never run concurrently.
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
})
