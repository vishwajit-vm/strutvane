/**
 * Vite config for the demo. In `npm run dev` the REAL aggregate handler (validation, tenant and
 * policy scope, SQL, suppression) is mounted at `/api/v1` on an in-memory SQLite database with
 * demo data, signed in as one tenant's admin. Nothing is mocked except sign-in.
 *
 * The server resolves charts from the full `.strutvane/resources.json` (it needs the tenant column
 * and hidden fields to refuse them); the browser gets the trimmed metadata in `charts.gen.ts`.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { ownedCharts } from './example/.strutvane/charts.gen.ts'
import { DEMO_TENANT, seedDemo } from './src/demo/seed.ts'
import { sqliteExecutor } from './src/server/executors.ts'
import { createAggregateHandler } from './src/server/handler.ts'
import { runWithTenant } from './src/server/scope.ts'
import { parseAppMetadata } from './src/shared/metadata.ts'
import { resolveCharts } from './src/shared/resolve.ts'

/** Mount the aggregate endpoint on the dev server (a little latency makes loading states visible). */
function aggregateApiPlugin(): Plugin {
  const metadata = parseAppMetadata(JSON.parse(readFileSync(new URL('./example/.strutvane/resources.json', import.meta.url), 'utf8')))
  const database = new DatabaseSync(':memory:')
  seedDemo(database, new Date())
  const adminOnly = { viewAny: (actor: { readonly roles: readonly string[] } | null) => actor?.roles.includes('admin') === true }
  const handle = createAggregateHandler({
    charts: resolveCharts(metadata, ownedCharts),
    policies: { invoices: adminOnly, customers: adminOnly, employees: adminOnly, users: adminOnly },
    executor: sqliteExecutor(database),
    tenancy: { column: 'tenant_id' },
    actorOf: () => ({ id: '1', roles: ['admin'] }),
    onError: (error) => console.error('[aggregate]', error),
  })
  return {
    name: 'strutvane-aggregate-api',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.startsWith('/api/v1/') !== true) return next()
        void forward(request, response, (fetchRequest) => runWithTenant(DEMO_TENANT, () => delay(250).then(() => handle(fetchRequest)))).catch(next)
      })
    },
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Convert a Node request into a fetch `Request`, run the handler, and write the `Response` back. */
async function forward(request: IncomingMessage, response: ServerResponse, handle: (request: Request) => Promise<Response>): Promise<void> {
  const result = await handle(new Request(`http://localhost${request.url ?? '/'}`, { method: request.method ?? 'GET' }))
  response.statusCode = result.status
  result.headers.forEach((value, key) => response.setHeader(key, value))
  response.end(Buffer.from(await result.arrayBuffer()))
}

export default defineConfig({
  plugins: [react(), tailwindcss(), aggregateApiPlugin()],
})
