/**
 * `charts:sync`: owned files are written once and never overwritten, suggestions that appear
 * after a migrate are shown (auto) or reported (explicit lists), dropped columns are reported and
 * become compile errors (real TypeScript compiler), and the committed example equals fresh output.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { readOwnedCharts } from '../../src/generator/owned-reader.ts'
import { syncCharts, SyncError } from '../../src/generator/sync.ts'
import type { AppMetadata, FieldMetadata, ResourceMetadata } from '../../src/shared/metadata.ts'

const ROOT = join(import.meta.dirname, '../..')
const EXAMPLE = join(ROOT, 'example')
// Inside the spike (and git-ignored), so `#strutvane/charts` resolves through package.json imports.
const TMP = join(ROOT, '.tmp')
const created: string[] = []

/** A fresh app directory with the example's resources.json, and optionally its owned files. */
function makeApp(options: { readonly withOwned?: boolean } = {}): string {
  // A fresh, unique directory per app: on Windows a just-deleted folder can linger for a moment
  // (antivirus, indexer), so names are never reused.
  mkdirSync(TMP, { recursive: true })
  const dir = mkdtempSync(join(TMP, 'app-'))
  created.push(dir)
  mkdirSync(join(dir, '.strutvane'), { recursive: true })
  cpSync(join(EXAMPLE, '.strutvane/resources.json'), join(dir, '.strutvane/resources.json'))
  if (options.withOwned === true) {
    cpSync(join(EXAMPLE, 'resources'), join(dir, 'resources'), { recursive: true })
    cpSync(join(EXAMPLE, '.strutvane/charts.lock.json'), join(dir, '.strutvane/charts.lock.json'))
    cpSync(join(EXAMPLE, '.strutvane/charts.gen.ts'), join(dir, '.strutvane/charts.gen.ts'))
  }
  return dir
}

function readJson(dir: string): AppMetadata {
  return JSON.parse(readFileSync(join(dir, '.strutvane/resources.json'), 'utf8')) as AppMetadata
}

/** Simulate a migrate: change resources.json the way a new migration would. */
function migrate(dir: string, change: (resources: ResourceMetadata[]) => ResourceMetadata[]): void {
  const metadata = readJson(dir)
  writeFileSync(join(dir, '.strutvane/resources.json'), JSON.stringify({ ...metadata, resources: change([...metadata.resources]) }, null, 2))
}

function withField(table: string, field: FieldMetadata): (resources: ResourceMetadata[]) => ResourceMetadata[] {
  return (resources) => resources.map((resource) => (resource.table === table ? { ...resource, fields: [...resource.fields, field] } : resource))
}

function withoutField(table: string, name: string): (resources: ResourceMetadata[]) => ResourceMetadata[] {
  return (resources) => resources.map((resource) => (resource.table === table ? { ...resource, fields: resource.fields.filter((field) => field.name !== name) } : resource))
}

const read = (dir: string, path: string): string => readFileSync(join(dir, path), 'utf8')

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
})

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true, maxRetries: 5 })
})

describe('first sync', () => {
  it('scaffolds one owned file per chartable resource, plus the registry and the lock', () => {
    const dir = makeApp()
    const result = syncCharts(dir)
    expect(result.written).toEqual([
      'resources/charts/customers.charts.ts',
      'resources/charts/employees.charts.ts',
      'resources/charts/invoices.charts.ts',
      'resources/charts/users.charts.ts',
      '.strutvane/charts.gen.ts',
      '.strutvane/charts.lock.json',
    ])
    // No file for the internal sessions table, nor for tags (nothing to suggest).
    expect(existsSync(join(dir, 'resources/charts/sessions.charts.ts'))).toBe(false)
    expect(existsSync(join(dir, 'resources/charts/tags.charts.ts'))).toBe(false)
    expect(read(dir, '.strutvane/charts.gen.ts')).not.toMatch(/sessions|api_key|password/)
    expect(result.report[0]).toBe('- Skipped internal table sessions: it never gets charts or an aggregate endpoint.')
  })

  it('a second sync writes nothing; a dry run writes nothing', () => {
    const dir = makeApp()
    syncCharts(dir)
    expect(syncCharts(dir).written).toEqual([])
    const fresh = makeApp()
    expect(syncCharts(fresh, { dryRun: true }).written).toEqual([])
    expect(existsSync(join(fresh, '.strutvane/charts.gen.ts'))).toBe(false)
  })

  it('the committed example equals fresh output (deterministic, LF, no machine paths)', () => {
    const dir = makeApp({ withOwned: true })
    expect(syncCharts(dir).written).toEqual([])
    expect(read(dir, '.strutvane/charts.gen.ts')).toBe(read(EXAMPLE, '.strutvane/charts.gen.ts'))
    expect(read(dir, '.strutvane/charts.gen.ts')).not.toContain('\r')
    expect(read(dir, '.strutvane/charts.gen.ts')).not.toContain(ROOT)
  })

  it('explains a missing resources.json', () => {
    expect(() => syncCharts(join(TMP, 'nowhere'))).toThrow(SyncError)
    expect(() => syncCharts(join(TMP, 'nowhere'))).toThrow(/Run `node strut migrate` first/)
  })
})

describe('customise, then migrate', () => {
  const discount: FieldMetadata = { name: 'discount', label: 'Discount', kind: 'decimal', cast: 'decimal', nullable: true, hidden: false, filterOperators: ['eq', 'gte', 'lte'], precision: 12, scale: 2 }
  const region: FieldMetadata = { name: 'region', label: 'Region', kind: 'enum', cast: 'string', nullable: false, hidden: false, filterOperators: ['eq', 'in'], options: ['emea', 'apac', 'amer'] }

  it('owned files stay byte-identical; auto() shows new suggestions, explicit lists get a report', () => {
    const dir = makeApp({ withOwned: true })
    const before = ['invoices', 'customers', 'employees', 'users'].map((name) => read(dir, `resources/charts/${name}.charts.ts`))
    migrate(dir, (resources) => withField('customers', region)(withField('invoices', discount)(resources)))
    const { report } = syncCharts(dir)
    expect(['invoices', 'customers', 'employees', 'users'].map((name) => read(dir, `resources/charts/${name}.charts.ts`))).toEqual(before)
    expect(report).toContain('+ New suggestion customers.by-region is shown (widgets: auto()).')
    expect(report).toContain("! New suggestion invoices.sum-discount is NOT shown: widgets in resources/charts/invoices.charts.ts is an explicit list. Add 'invoices.sum-discount' to show it.")
    expect(read(dir, '.strutvane/charts.gen.ts')).toContain("numeric: 'total' | 'tax' | 'discount'")
  })

  it('a dropped column is reported and turns the owned file into a compile error (real tsc)', () => {
    const dir = makeApp({ withOwned: true })
    migrate(dir, withoutField('invoices', 'total'))
    const { report } = syncCharts(dir)
    expect(report).toContain("! resources/charts/invoices.charts.ts names 'invoices.sum-total', which is no longer a suggestion (was a column dropped?). TypeScript reports it too.")
    const errors = compile([join(dir, '.strutvane/charts.gen.ts'), join(dir, 'resources/charts/invoices.charts.ts')])
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.join('\n')).toMatch(/invoices\.charts\.ts.*TS2322|TS2322.*invoices\.charts\.ts/)
    // Before the drop the same files compile cleanly.
    const clean = makeApp({ withOwned: true })
    syncCharts(clean)
    expect(compile([join(clean, '.strutvane/charts.gen.ts'), join(clean, 'resources/charts/invoices.charts.ts')])).toEqual([])
  })
})

describe('never overwritten, never recreated', () => {
  it('a deleted owned file is reported and not recreated', () => {
    const dir = makeApp()
    syncCharts(dir)
    rmSync(join(dir, 'resources/charts/users.charts.ts'))
    const { report } = syncCharts(dir)
    expect(existsSync(join(dir, 'resources/charts/users.charts.ts'))).toBe(false)
    expect(report).toContain('! resources/charts/users.charts.ts was deleted. Its resource now uses the defaults; it is not recreated.')
  })

  it('a lost or damaged lock never re-scaffolds over an edited file', () => {
    const dir = makeApp()
    syncCharts(dir)
    writeFileSync(join(dir, 'resources/charts/users.charts.ts'), "import { defineResourceCharts } from '#strutvane/charts'\nexport default defineResourceCharts('users', { dashboard: false })\n")
    writeFileSync(join(dir, '.strutvane/charts.lock.json'), '{ not json')
    syncCharts(dir)
    expect(read(dir, 'resources/charts/users.charts.ts')).toContain('dashboard: false')
  })

  it('an owned file for a dropped table is kept and called orphaned', () => {
    const dir = makeApp()
    syncCharts(dir)
    migrate(dir, (resources) => resources.filter((resource) => resource.table !== 'users'))
    const { report } = syncCharts(dir)
    expect(existsSync(join(dir, 'resources/charts/users.charts.ts'))).toBe(true)
    expect(report).toContain('! Orphaned: resources/charts/users.charts.ts has no resource "users" any more. It is kept; delete it if the table is gone for good.')
  })
})

describe('the static reader (never executes app code)', () => {
  it('classifies auto, explicit and unreadable widget lists', () => {
    expect(readOwnedCharts('a.ts', "export default defineResourceCharts('a', { widgets: auto({ except: ['a.x'] }) })").widgets).toEqual({ kind: 'auto', named: ['a.x'] })
    expect(readOwnedCharts('a.ts', "export default defineResourceCharts('a', { widgets: ['a.x', { id: 'a.y' }] as const, dashboard: ['a.x'] })")).toMatchObject({ widgets: { kind: 'explicit', named: ['a.x'] }, dashboardIds: ['a.x'] })
    const shape = readOwnedCharts('a.ts', "const list = ['a.x']\nexport default defineResourceCharts('a', {\n  widgets: list,\n})")
    expect(shape.widgets).toEqual({ kind: 'unreadable', line: 3 })
    expect(shape.problems).toEqual(['a.ts:3: `widgets` is not auto(...) or a list, so charts:sync skipped its checks.'])
    expect(readOwnedCharts('b.ts', 'export default {').problems[0]).toMatch(/syntax error/)
    expect(readOwnedCharts('c.ts', 'export const x = 1').problems[0]).toMatch(/no `export default defineResourceCharts/)
  })
})

/** Compile files with the spike's tsconfig and return "file: TSxxxx message" lines. */
function compile(files: readonly string[]): string[] {
  const config = ts.getParsedCommandLineOfConfigFile(join(ROOT, 'tsconfig.json'), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined })
  if (config === undefined) throw new Error('tsconfig.json could not be read')
  const program = ts.createProgram([...files], config.options)
  return ts.getPreEmitDiagnostics(program).map((diagnostic) => `${diagnostic.file?.fileName ?? ''}: TS${diagnostic.code} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`)
}
