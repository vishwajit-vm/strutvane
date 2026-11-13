// End-to-end proof that a server-side model change breaks client compilation: rename a field in the
// spec, regenerate the client types, and run the REAL TypeScript compiler on a consumer file.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import openapiTS, { astToString } from 'openapi-typescript'
import { afterAll, describe, expect, test } from 'vitest'
import { SPEC_PATH } from '../scripts/generate-client.ts'

const ROOT = resolve(import.meta.dirname, '..')
const tsc = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
const dirs: string[] = []
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })))

/** A consumer written against the CURRENT API: reads `invoice.amount`. */
const CONSUMER = `import type { components } from './schema.d.ts'
type Invoice = components['schemas']['Invoice']
export const total = (invoices: Invoice[]): number => invoices.reduce((sum, i) => sum + i.amount, 0)
`

async function compileConsumerAgainst(spec: Record<string, unknown>): Promise<{ status: number | null; output: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'sv-drift-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'schema.d.ts'), astToString(await openapiTS(spec as never, { alphabetize: true })))
  writeFileSync(join(dir, 'consumer.ts'), CONSUMER)
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { strict: true, noEmit: true, module: 'NodeNext', moduleResolution: 'NodeNext', allowImportingTsExtensions: true, skipLibCheck: true, types: [] }, include: ['*.ts'] }),
  )
  const run = spawnSync(process.execPath, [tsc, '-p', dir], { encoding: 'utf8' })
  return { status: run.status, output: `${run.stdout}${run.stderr}` }
}

describe('server model change → client compile error', () => {
  const current = JSON.parse(readFileSync(SPEC_PATH, 'utf8')) as Record<string, unknown>

  test('baseline: the consumer compiles against the current API', async () => {
    const { status, output } = await compileConsumerAgainst(current)
    expect(output).toBe('')
    expect(status).toBe(0)
  })

  test('renaming Invoice.amount → total on the server breaks the consumer at compile time', async () => {
    const changed = structuredClone(current) as { components: { schemas: { Invoice: { properties: Record<string, unknown>; required: string[] } } } }
    const invoice = changed.components.schemas.Invoice
    invoice.properties.total = invoice.properties.amount
    delete invoice.properties.amount
    invoice.required = invoice.required.map((r) => (r === 'amount' ? 'total' : r))

    const { status, output } = await compileConsumerAgainst(changed as unknown as Record<string, unknown>)
    expect(status).not.toBe(0)
    expect(output).toMatch(/Property 'amount' does not exist/)
  })
})
