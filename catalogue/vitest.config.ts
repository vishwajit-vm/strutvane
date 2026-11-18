import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Property tests run a few thousand cases each; give them room on slow CI machines.
    testTimeout: 30_000,
  },
})
