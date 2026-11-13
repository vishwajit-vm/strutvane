// Render cost for 500 rows: full render vs virtualized. jsdom has no layout or paint, so absolute
// numbers are a proxy (DOM work + React reconciliation), useful for comparing the two strategies and
// catching regressions, not a browser frame-time guarantee (that needs Playwright, see README).
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { ResourceApi } from '../src/api.ts'
import type { ApiRecord, ListQuery, ListResult } from '../src/contracts.ts'
import { invoiceResource } from '../src/manifest.fixture.ts'
import { ResourceList } from '../src/ResourceList.tsx'
import { customers, makeInvoices, renderWithUI } from './helpers.tsx'

const ROWS = 500
const invoices = makeInvoices(ROWS) as unknown as ApiRecord[]

/** Returns all 500 rows in one response, simulating accumulated pages ("load more"/infinite scroll). */
const bulkApi: ResourceApi = {
  async list(path: string, _q: ListQuery): Promise<ListResult<ApiRecord>> {
    const data = path === 'customers' ? (customers as unknown as ApiRecord[]) : invoices
    return { data, meta: { page: { size: data.length, hasMore: false } } }
  },
  get: async () => {
    throw new Error('not used')
  },
  create: async () => {
    throw new Error('not used')
  },
  update: async () => {
    throw new Error('not used')
  },
}

async function measure(virtualizeThreshold: number) {
  const t0 = performance.now()
  const utils = renderWithUI(<ResourceList resource={invoiceResource} virtualizeThreshold={virtualizeThreshold} onEdit={() => {}} />, { api: bulkApi })
  await screen.findByText(`Showing ${ROWS} invoices`)
  const ms = performance.now() - t0
  const bodyRows = utils.container.querySelectorAll('tbody tr:not([aria-hidden])').length
  utils.unmount()
  return { ms, bodyRows }
}

/** Give every element a 1024×600 box, as a browser would for the scroll container (jsdom has no layout). */
function withLayout() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, top: 0, left: 0, right: 1024, bottom: 600, width: 1024, height: 600, toJSON: () => ({}) } as DOMRect)
}

afterEach(() => vi.restoreAllMocks())

describe(`render ${ROWS} rows`, () => {
  test('full render vs virtualized: virtualization renders a window, not all rows', async () => {
    withLayout()
    await measure(Number.POSITIVE_INFINITY) // warm-up (module/JIT), not measured
    const runs = 3
    const full: number[] = []
    const virtual: number[] = []
    let fullRows = 0
    let virtualRows = 0
    for (let i = 0; i < runs; i++) {
      const f = await measure(Number.POSITIVE_INFINITY)
      const v = await measure(100)
      full.push(f.ms)
      virtual.push(v.ms)
      fullRows = f.bodyRows
      virtualRows = v.bodyRows
    }
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? Number.NaN
    const report = {
      rows: ROWS,
      fullRender: { medianMs: Math.round(median(full)), domRows: fullRows },
      virtualized: { medianMs: Math.round(median(virtual)), domRows: virtualRows },
    }
    // Printed so the README can quote real numbers from this machine.
    process.stdout.write(`\n[perf] ${JSON.stringify(report)}\n`)

    expect(fullRows).toBe(ROWS)
    expect(virtualRows).toBeGreaterThan(0)
    expect(virtualRows).toBeLessThan(60) // viewport (600px / 40px) + overscan
    expect(median(virtual)).toBeLessThan(median(full))
  })

  test('fail-safe: an unmeasurable (0px) container still shows the first window of rows, never an empty table', async () => {
    const { bodyRows } = await measure(100) // no layout mock: container measures 0x0
    expect(bodyRows).toBeGreaterThan(0)
    expect(bodyRows).toBeLessThan(60)
  })
})
