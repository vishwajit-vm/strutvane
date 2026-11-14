import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'fixtures/example-app/tests/**/*.test.ts'],
    environment: 'node',
    // The CLI tests spawn real `node strut` processes and the type tests run `tsc`: give them room.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
