/**
 * Vite config for the design-direction-C mockup. The dev server is pinned to port 5183
 * (`strictPort`) so the three design directions can run side by side without fighting over ports.
 */
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { cspPlugin } from './scripts/csp.ts'

export default defineConfig({
  // cspPlugin: the build writes a hash-based CSP for the inline theme script (CONSISTENCY #119).
  plugins: [react(), tailwindcss(), cspPlugin()],
  server: { port: 5183, strictPort: true },
  preview: { port: 5183, strictPort: true },
  build: {
    // Recharts is the largest dependency; splitting it keeps the first screen (sign-in) light.
    rollupOptions: { output: { manualChunks: (id) => (id.includes('recharts') || id.includes('d3-') ? 'charts' : undefined) } },
  },
})
