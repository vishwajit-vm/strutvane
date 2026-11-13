import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Real files, real child processes and timing-sensitive checks: give them room, and run
    // test files one at a time so benchmarks/timing tests don't fight each other for the CPU.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
})
