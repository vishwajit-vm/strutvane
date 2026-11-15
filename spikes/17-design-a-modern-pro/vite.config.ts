/**
 * Vite config for the design-direction-A mockup. There is no backend: every screen reads typed
 * mock data from `src/data`, so `npm run dev` is all the lead needs to click through it.
 * The port (5181, strict) is fixed so the three design directions can run side by side.
 */
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { cspPlugin } from './scripts/csp.ts'

export default defineConfig({
  // cspPlugin: the build writes a hash-based CSP for the inline theme script (CONSISTENCY #119).
  plugins: [react(), tailwindcss(), cspPlugin()],
  server: { port: 5181, strictPort: true },
  preview: { port: 5181, strictPort: true },
  // One bundle (~300 kB gzip, mostly Recharts + Radix) is fine for a local mockup; no code-splitting.
  build: { chunkSizeWarningLimit: 1200 },
})
