import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Starts a throwaway MySQL 8.4 container for the run (or records why MySQL is skipped).
    globalSetup: ['test/support/mysql-container.ts'],
    // PGlite boots a WebAssembly Postgres per suite and MySQL may still be warming up.
    testTimeout: 60_000,
    hookTimeout: 240_000,
    // One file at a time: the suites share the MySQL database and the global model connection.
    fileParallelism: false,
  },
})
