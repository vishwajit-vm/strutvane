import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // The end-to-end tests run a real `npm install` and, when Docker is available, a real MySQL
    // container: give them room on a slow laptop.
    testTimeout: 60_000,
    hookTimeout: 180_000,
    // One file at a time: the end-to-end files pick free ports and start servers and containers;
    // running them side by side could make two of them pick the same port.
    fileParallelism: false,
  },
})
