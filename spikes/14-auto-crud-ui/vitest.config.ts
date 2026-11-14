/**
 * Vitest config. Generator and mock API tests run in Node; React tests opt into jsdom with a
 * `// @vitest-environment jsdom` comment at the top of the file.
 */
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  // The contract test loads spike 10 (a sibling folder) as its real backend.
  server: { fs: { allow: ['..'] } },
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['test/setup.ts'],
    // The type-check tests start the TypeScript compiler; React tests render whole screens.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    restoreMocks: true,
  },
})
