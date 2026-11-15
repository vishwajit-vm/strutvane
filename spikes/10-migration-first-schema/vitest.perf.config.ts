import { defineConfig } from 'vitest/config'

/**
 * `npm run test:perf`: the time budgets only. Kept out of `npm test` because timings depend on how
 * busy the machine is; run on a quiet machine or in a dedicated CI job before a release.
 */
export default defineConfig({
  test: {
    include: ['test/perf/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // One file at a time, so no other suite steals CPU from the measurements.
    fileParallelism: false,
  },
})
