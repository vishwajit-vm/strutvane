/**
 * Approach (b): reading migrations with oxc-parser, never running them, compared with (a).
 */
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { canonicalSchema, discoverMigrations, replayMigrations } from '../src/schema/replay.ts'
import { analyzeMigrationFiles, analyzeMigrationSource } from '../src/schema/static.ts'
import { BLOG_ROOT, DYNAMIC_ROOT, replayApp } from './helpers.ts'

describe('static analysis vs replay', () => {
  test('on the blog app (literal migrations) both approaches derive the identical schema', async () => {
    const files = discoverMigrations(join(BLOG_ROOT, 'database', 'migrations'))
    const analysis = analyzeMigrationFiles(files)
    expect(analysis.diagnostics).toEqual([])
    expect(canonicalSchema(replayMigrations(analysis.migrations).state)).toBe(canonicalSchema((await replayApp(BLOG_ROOT)).state))
  })

  test('on the dynamic app it can\'t see constants, loops, helpers or if, and says so with positions', () => {
    const analysis = analyzeMigrationFiles(discoverMigrations(join(DYNAMIC_ROOT, 'database', 'migrations')))
    expect(analysis.migrations).toEqual([])
    expect(analysis.diagnostics.map((d) => `${d.file}:${d.line}:${d.column}`)).toEqual([
      '2026_02_01_000000_create_products_table.ts:12:23',
      '2026_02_01_000000_create_products_table.ts:14:7',
      '2026_02_01_000000_create_products_table.ts:16:7',
      '2026_02_02_000000_add_barcode_to_products_table.ts:6:5',
    ])
    expect(analysis.diagnostics.map((d) => d.message)).toEqual([
      expect.stringContaining('must be written literally'),
      expect.stringContaining('A loop'),
      expect.stringContaining('`addAuditColumns(…)` is a helper function'),
      expect.stringContaining('An `if`'),
    ])
  })
})

describe('reading single files', () => {
  const wrap = (body: string): string => `import { migration } from '#strutvane/schema'\nexport default migration({ up(schema) { ${body} }, down(schema) {} })`

  test('accepts arrow functions, satisfies/as wrappers, template literals and negative numbers', () => {
    const source = `import { migration } from '#strutvane/schema'
export default (migration({
  up: (schema) => {
    schema.create(\`tags\`, (t) => { t.id(); t.integer('weight').default(-1); t.enum('kind', ['a', 'b']).default('a') })
  },
  down: (schema) => schema.drop('tags'),
}) satisfies object)`
    const result = analyzeMigrationSource('x.ts', source)
    expect(result.diagnostics).toEqual([])
    const migration = result.migration
    if (migration === undefined) throw new Error('expected a migration')
    const state = replayMigrations([{ name: 'x', migration }]).state
    expect(state.tables[0]?.columns.map((column) => [column.name, column.default])).toEqual([['id', undefined], ['weight', -1], ['kind', 'a']])
  })

  test.each([
    ['a missing default export', "import { migration } from '#strutvane/schema'\nexport const m = 1", 'Expected `export default migration'],
    ['a syntax error', 'export default migration({ up(schema) { schema.create( }, down() {} })', 'syntax error'],
    ['a non-whitelisted method', wrap("schema.create('a', (t) => { t.toActions() })"), "isn't a method the static reader understands"],
    ['an unknown modifier', wrap("schema.create('a', (t) => { t.string('x').nullabel() })"), "isn't a modifier"],
    ['a computed method name', wrap("schema.create('a', (t) => { t['string']('x') })"), 'Only plain method calls'],
    ['a variable argument', wrap("const n = 'x'; schema.drop(n)"), 'A variable'],
    ['a console.log', wrap("console.log('hi')"), "can't be read without running the file"],
  ])('reports %s instead of guessing', (_, source, message) => {
    const result = analyzeMigrationSource('x.ts', source)
    expect(result.migration).toBeUndefined()
    expect(result.diagnostics[0]?.message).toContain(message)
  })
})
