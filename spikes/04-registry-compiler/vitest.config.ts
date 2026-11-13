import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Perf and tsc-based tests spawn processes / touch the file system: give them room, and run
    // files sequentially so timing measurements are not distorted by parallel test files.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
})
