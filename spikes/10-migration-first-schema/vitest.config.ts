import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // PGlite boots a WebAssembly Postgres per suite and the type tests spawn `tsc`: give them room.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Sequential files keep the timing measurements honest (no parallel suites stealing CPU).
    fileParallelism: false,
  },
})
