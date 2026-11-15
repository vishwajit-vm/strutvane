import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Time budgets run separately (`npm run test:perf`): they depend on machine load.
    exclude: ['test/perf/**', 'node_modules/**'],
    environment: 'node',
    // PGlite boots a WebAssembly Postgres per suite and the type tests spawn `tsc`: give them room.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Sequential files: PGlite instances are memory-hungry and the tsc tests are CPU-heavy.
    fileParallelism: false,
  },
})
