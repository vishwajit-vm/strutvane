import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: false,
    allowOnly: false,
    testTimeout: 60_000,
  },
})
