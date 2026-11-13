import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // PGlite boots a full Postgres (WASM) per test: 2-5 s on a laptop, more on loaded CI runners.
    // The vitest default of 5 s made two Postgres rename tests intermittently time out (observed 8.7 s).
    testTimeout: 60_000,
    hookTimeout: 60_000,
    reporters: ['verbose'],
  },
})
