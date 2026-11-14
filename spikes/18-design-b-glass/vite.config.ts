/**
 * Vite config for the Glass mockup. Port 5182 with `strictPort`, so the three design directions
 * can run side by side without one silently taking another's port.
 */
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5182, strictPort: true },
  preview: { port: 5182, strictPort: true },
  build: {
    // Recharts is the heaviest dependency; keep it in its own chunk so screens load fast.
    rollupOptions: {
      output: {
        manualChunks(id: string): string | undefined {
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) return 'charts'
          if (id.includes('node_modules/@radix-ui') || id.includes('node_modules/radix-ui')) return 'radix'
          return undefined
        },
      },
    },
  },
})
