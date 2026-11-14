import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Real scrypt hashing and real SQLite files: give the slower security tests room.
    testTimeout: 30_000,
  },
})
