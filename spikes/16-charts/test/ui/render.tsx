/**
 * Test helpers for the React side: an aggregate client backed by the REAL handler on SQLite (the
 * same fixture as the server tests), and an axe runner.
 */
import axe from 'axe-core'
import { createAggregateClient, type AggregateClient } from '../../src/ui/data.ts'
import type { WidgetContext } from '../../src/ui/Widget.tsx'
import { charts, createSqlite, handlerFor, metadata, NOW, TENANT_A } from '../server/fixture.ts'

/**
 * A `fetch`-shaped transport that goes straight into the aggregate handler as tenant A's admin.
 *
 * @example
 * const { transport, requests } = realTransport()
 */
export function realTransport(): { readonly transport: (input: string) => Promise<Response>; readonly requests: string[] } {
  const { executor } = createSqlite()
  const requests: string[] = []
  const api = handlerFor(executor)
  const transport = async (input: string): Promise<Response> => {
    requests.push(decodeURIComponent(input))
    const { status, body } = await api.get(input, { tenant: TENANT_A })
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': status === 200 ? 'application/json' : 'application/problem+json' } })
  }
  return { transport, requests }
}

/**
 * A client on {@link realTransport}.
 *
 * @example
 * const { client, requests } = realClient()
 */
export function realClient(): { readonly client: AggregateClient; readonly requests: string[] } {
  const { transport, requests } = realTransport()
  return { client: createAggregateClient(transport), requests }
}

/**
 * A widget context on the real client, "now" pinned to the fixture's.
 *
 * @example
 * render(<Widget widget={spec} context={context()} />)
 */
export function context(client: AggregateClient = realClient().client): WidgetContext {
  return {
    client,
    metadata,
    now: () => NOW,
    locale: 'en-GB',
    relationLabels: async (_resource, ids) => Object.fromEntries(ids.map((id) => [id, `Customer ${id}`])),
    minGroupSize: (resource) => charts.get(resource)?.minGroupSize ?? null,
  }
}

/**
 * axe on the whole document; "rule: element" lines, empty when clean. `color-contrast` needs a
 * layout engine, so contrast is covered by spike 14's token contrast test instead.
 *
 * @example
 * expect(await violations()).toEqual([])
 */
export async function violations(): Promise<string[]> {
  const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
  return result.violations.flatMap((violation) => violation.nodes.map((node) => `${violation.id}: ${node.html.slice(0, 160)}`))
}
