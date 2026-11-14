/**
 * Vite config for the demo app. In `npm run dev` the mock API (spike 10's contract, seeded with
 * demo data) is mounted at `/api`, so the UI runs with no backend to start.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { metadata } from './example/.strutvane/ui.gen.ts'
import { createMockApi } from './src/mock-api/mock-api.ts'
import { seedBlog } from './src/mock-api/seed.ts'

/** Mount the in-memory API on the dev server (a little latency makes loading states visible). */
function mockApiPlugin(): Plugin {
  const api = createMockApi(metadata, { delayMs: 150 })
  seedBlog(api)
  return {
    name: 'strutvane-mock-api',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.startsWith('/api/') !== true) return next()
        void forward(request, response, api.handle).catch(next)
      })
    },
  }
}

/** Convert a Node request into a fetch `Request`, run the handler, and write the `Response` back. */
async function forward(request: IncomingMessage, response: ServerResponse, handle: (request: Request) => Promise<Response>): Promise<void> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array))
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD' && chunks.length > 0
  const result = await handle(
    new Request(`http://localhost${request.url ?? '/'}`, {
      method: request.method ?? 'GET',
      headers: { 'content-type': request.headers['content-type'] ?? 'application/json' },
      ...(hasBody ? { body: Buffer.concat(chunks) } : {}),
    }),
  )
  response.statusCode = result.status
  result.headers.forEach((value, key) => response.setHeader(key, value))
  response.end(Buffer.from(await result.arrayBuffer()))
}

export default defineConfig({
  plugins: [react(), tailwindcss(), mockApiPlugin()],
  // Test runs create throwaway apps in .tmp; the dev server has no reason to watch (and lock) them.
  server: { watch: { ignored: ['**/.tmp/**'] } },
})
