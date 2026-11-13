/**
 * Test helpers: render inside the providers the app would use, seed data, and run axe.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import axe from 'axe-core'
import type { ReactElement } from 'react'
import type { ResourceApi } from '../src/api.ts'
import { defaultRegistry } from '../src/defaults.ts'
import { FakeApi } from '../src/fake-api.ts'
import { manifest } from '../src/manifest.fixture.ts'
import { type RegistryOverrides, StrutvaneUIProvider } from '../src/registry.tsx'

export const customers = [
  { id: 'c1', name: 'Acme GmbH', region: 'EU' },
  { id: 'c2', name: 'Globex Inc', region: 'US' },
  { id: 'c3', name: 'Initech', region: 'US' },
]

export function makeInvoices(count: number) {
  const statuses = ['draft', 'sent', 'paid'] as const
  return Array.from({ length: count }, (_, i) => ({
    id: `inv-${String(i + 1).padStart(4, '0')}`,
    number: `INV-${1000 + i}`,
    customer: customers[i % customers.length]?.id ?? null,
    amount: (i * 37) % 5000,
    status: statuses[i % 3] ?? 'draft',
    issueDate: '2026-11-01',
    dueDate: '2026-12-01',
    paid: i % 3 === 2,
    notes: null,
    lines: [],
    createdAt: '2026-11-01T09:00:00.000Z',
  }))
}

export function seededApi(invoiceCount = 30): FakeApi {
  return new FakeApi(manifest, { invoices: makeInvoices(invoiceCount), customers })
}

export function renderWithUI(ui: ReactElement, opts: { api?: ResourceApi; overrides?: RegistryOverrides } = {}) {
  const api = opts.api ?? seededApi()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const result = render(
    <QueryClientProvider client={queryClient}>
      <StrutvaneUIProvider api={api} manifest={manifest} defaults={defaultRegistry} {...(opts.overrides ? { overrides: opts.overrides } : {})}>
        {ui}
      </StrutvaneUIProvider>
    </QueryClientProvider>,
  )
  return { ...result, api, queryClient }
}

/**
 * Run axe-core on a container. color-contrast is disabled: jsdom has no layout/CSS engine, so the
 * rule cannot produce meaningful results here (it must run in a real browser, e.g. Playwright).
 */
export async function axeViolations(container: Element) {
  const results = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
    resultTypes: ['violations'],
  })
  return results.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help }))
}
