import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import fc from 'fast-check'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildCatalogue, CatalogueBuildError, serializeCatalogue } from '../src/catalogue/build.ts'
import { parseCatalogueIndex } from '../src/catalogue/index-schema.ts'
import { hubConfigSchema, readLocalPackages, readNpmPackages, type VersionSnapshot } from '../src/catalogue/sources.ts'
import { passing, pkg, root, shuffled, snap, testHub } from './helpers.ts'

const rootPath = fileURLToPath(root)

/** The build's problems as "package | path: message" lines. */
function buildProblems(snapshots: readonly VersionSnapshot[]): string[] {
  try {
    buildCatalogue(snapshots, testHub)
  } catch (error) {
    if (error instanceof CatalogueBuildError) return error.problems.map((p) => `${p.package} | ${p.path}: ${p.message}`)
    throw error
  }
  return []
}

async function seedSnapshots(): Promise<VersionSnapshot[]> {
  const registry = JSON.parse(await readFile(join(rootPath, 'test/fixtures/seed/registry.json'), 'utf8')) as { published: Record<string, string[]> }
  return readLocalPackages(join(rootPath, 'test/fixtures/seed/manifests'), { registry, relativeTo: rootPath })
}

async function seedHub() {
  return hubConfigSchema.parse(JSON.parse(await readFile(join(rootPath, 'test/fixtures/seed/hub.json'), 'utf8')))
}

describe('determinism', () => {
  it('rebuilds the committed seed/catalogue.json byte for byte', async () => {
    const { index } = buildCatalogue(await seedSnapshots(), await seedHub())
    expect(serializeCatalogue(index)).toBe(await readFile(join(rootPath, 'test/fixtures/seed/catalogue.json'), 'utf8'))
  })

  it('gives identical bytes whatever order the manifests arrive in (property)', async () => {
    const snapshots = await seedSnapshots()
    const hub = await seedHub()
    const expected = serializeCatalogue(buildCatalogue(snapshots, hub).index)
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        let state = seed
        const random = () => ((state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x80000000)
        expect(serializeCatalogue(buildCatalogue(shuffled(snapshots, random), hub).index)).toBe(expected)
      }),
      { numRuns: 25 },
    )
  })

  it('sorts entries by id, sorts tags and relations, and writes no timestamps', async () => {
    const { index } = buildCatalogue(await seedSnapshots(), await seedHub())
    const ids = index.entries.map((entry) => entry.id)
    expect(ids).toEqual([...ids].sort())
    for (const entry of index.entries) expect(entry.tags).toEqual([...entry.tags].sort())
  })

  it('does not depend on the clock (no build timestamps)', async () => {
    const snapshots = await seedSnapshots()
    const hub = await seedHub()
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2020-01-01T00:00:00Z'))
      const first = serializeCatalogue(buildCatalogue(snapshots, hub).index)
      vi.setSystemTime(new Date('2031-06-15T12:34:56Z'))
      expect(serializeCatalogue(buildCatalogue(snapshots, hub).index)).toBe(first)
    } finally {
      vi.useRealTimers()
    }
  })

  it('produces an index the format 2 reader reads back with nothing skipped', async () => {
    const text = await readFile(join(rootPath, 'test/fixtures/seed/catalogue.json'), 'utf8')
    const { index, skipped } = parseCatalogueIndex(text)
    expect(skipped).toEqual([])
    expect(index.entries).toHaveLength(49)
    expect(index.entries.filter((entry) => entry.kind === 'design').map((entry) => entry.id)).toEqual(['crisp', 'vivid'])
  })

  it('marks every seed package unpublished (nothing is released as v2 yet)', async () => {
    const { index } = buildCatalogue(await seedSnapshots(), await seedHub())
    expect(index.entries.every((entry) => !entry.published && !entry.verified)).toBe(true)
  })
})

describe('fail closed', () => {
  it('stops on one invalid manifest, naming the package, the field and the problem', () => {
    const bad = pkg('billing', { questions: [{ id: 'api-key', type: 'select', label: 'Stripe key', choices: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], default: 'a' }] })
    let caught: unknown
    try {
      buildCatalogue([snap(pkg('tags')), snap(bad)], testHub)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(CatalogueBuildError)
    const message = (caught as Error).message
    expect(message).toMatch(/^The catalogue was not built: 1 package has problems\. Nothing was written\./)
    expect(message).toContain('@strutvane/billing (test:@strutvane/billing@0.1.0)')
    expect(message).toContain('strutvane.questions[0] ("api-key").id: asks for a secret ("apikey")')
  })

  it('reports every problem of every package at once', () => {
    const problems = buildProblems([snap(pkg('a', { popluar: true })), snap(pkg('b', { docs: 'http://x.com' }))])
    expect(problems).toHaveLength(2)
    expect(problems[0]).toMatch(/^@strutvane\/a \| strutvane: has an unknown field "popluar"/)
    expect(problems[1]).toMatch(/^@strutvane\/b \| strutvane\.docs: must use https/)
  })

  it.each([
    ['duplicate ids', [pkg('tags'), { ...pkg('tags'), name: '@strutvane/labels' }], '"tags" is also used by @strutvane/labels; catalogue ids are unique'],
    ['unknown category', [pkg('tags', { category: 'misc' })], '"misc" is not a hub category'],
    ['unknown requirement', [pkg('tags', { requires: ['ghost'] })], '"ghost" is not in the catalogue'],
    ['unknown conflict', [pkg('tags', { conflicts: ['ghost'] })], '"ghost" is not in the catalogue'],
    ['unknown replacement', [pkg('tags', { deprecated: { message: 'Old', replacedBy: 'ghost' } })], '"ghost" is not in the catalogue'],
    ['requires cycle', [pkg('a', { requires: ['b'] }), pkg('b', { requires: ['c'] }), pkg('c', { requires: ['a'] })], 'requirements go round in a circle: a → b → c → a'],
    ['same config file', [pkg('a', { installs: { config: ['config/x.ts'] } }), pkg('b', { installs: { config: ['config/x.ts'] } })], '@strutvane/b also installs the file config/x.ts'],
    ['same route', [pkg('a', { installs: { routes: [{ method: 'GET', path: '/x' }] } }), pkg('b', { installs: { routes: [{ method: 'GET', path: '/x' }] } })], 'the route GET /x'],
    ['same command', [pkg('a', { installs: { commands: [{ name: 'x:run', description: 'X' }] } }), pkg('b', { installs: { commands: [{ name: 'x:run', description: 'X' }] } })], 'the command x:run'],
    ['same migration', [pkg('a', { installs: { migrations: ['create_x_table'] } }), pkg('b', { installs: { migrations: ['create_x_table'] } })], 'the migration create_x_table'],
  ])('refuses %s', (_name, packages, message) => {
    expect(buildProblems(packages.map((p) => snap(p))).join('\n')).toContain(message)
  })

  it('allows the same file when the packages declare a conflict, or are both designs', () => {
    const a = pkg('a', { installs: { config: ['config/x.ts'] }, conflicts: ['b'] })
    const b = pkg('b', { installs: { config: ['config/x.ts'] } })
    const design = (id: string) => ({ ...pkg(id, { kind: 'design', category: 'design', installs: { config: ['resources/ui/theme.css'] } }), name: `@strutvane/design-${id}` })
    expect(buildProblems([a, b, design('crisp'), design('vivid')].map((p) => snap(p)))).toEqual([])
  })

  it('refuses an id that changed between published versions', () => {
    const old = { ...pkg('labels'), name: '@strutvane/tags', version: '0.1.0' }
    const current = { ...pkg('tags'), version: '0.2.0' }
    expect(buildProblems([snap(old, { published: true }), snap(current, { published: true })]).join('\n')).toContain(
      'changed its id from "labels" (0.1.0) to "tags" (0.2.0); ids are permanent',
    )
  })

  it('refuses two unpublished working copies of one package, and unreadable files', () => {
    expect(buildProblems([snap(pkg('tags')), snap({ ...pkg('tags'), version: '0.2.0' })]).join('\n')).toContain('none is published; keep one working copy')
    expect(buildProblems([{ source: 'x/package.json', packageJson: undefined, published: false, readProblem: 'package.json is not valid JSON' }])).toEqual([
      'x/package.json | : package.json is not valid JSON',
    ])
  })

  it('refuses a local package with no strutvane block', () => {
    expect(buildProblems([snap({ name: '@strutvane/tags', version: '0.1.0' })]).join('\n')).toContain('strutvane: is missing')
  })
})

describe('published state and the compatibility table', () => {
  const versions = [
    snap({ ...pkg('charts', { framework: '^0.1' }), version: '0.1.0' }, { published: true }),
    snap({ ...pkg('charts', { framework: '^0.1 || ^0.2' }), version: '0.1.5' }, { published: true }),
    snap({ ...pkg('charts', { framework: '>=0.2.3 <0.3.0' }), version: '0.2.0' }, { published: true }),
    snap({ ...pkg('charts', { framework: '^0.2' }), version: '0.3.0' }, { published: false }),
  ]

  it('lists published versions newest first and maps each framework line to the newest that fits', () => {
    const { index } = buildCatalogue(versions, testHub)
    const charts = index.entries[0]
    expect(charts?.published).toBe(true)
    expect(charts?.version).toBe('0.2.0')
    expect(charts?.frameworkRange).toBe('>=0.2.3 <0.3.0')
    expect(charts?.versions.map((v) => v.version)).toEqual(['0.2.0', '0.1.5', '0.1.0'])
    // Line 0.2's newest framework is 0.2.4, which 0.2.0 accepts; line 0.1 gets 0.1.5.
    expect(charts?.compatibility).toEqual({ '0.1': '0.1.5', '0.2': '0.2.0' })
  })

  it('uses the unpublished working copy only when nothing is published', () => {
    const { index } = buildCatalogue([versions[3] as VersionSnapshot], testHub)
    expect(index.entries[0]).toMatchObject({ published: false, version: '0.3.0', compatibility: { '0.2': '0.3.0' } })
  })

  it('skips versions deprecated on npm and old releases without a manifest', () => {
    const { index, warnings } = buildCatalogue(
      [
        snap({ name: '@strutvane/charts', version: '0.0.1' }, { published: true }),
        snap({ ...pkg('charts'), version: '0.1.0' }, { published: true }),
        snap({ ...pkg('charts'), version: '0.1.1' }, { published: true, npmDeprecated: true }),
      ],
      testHub,
    )
    expect(index.entries[0]?.versions.map((v) => v.version)).toEqual(['0.1.0'])
    expect(warnings).toEqual([
      'test:@strutvane/charts@0.0.1: no strutvane manifest; that version is not listed',
      'test:@strutvane/charts@0.1.1: deprecated on npm; that version is not listed',
    ])
  })

  it('warns when no version fits any known framework line', () => {
    const { warnings } = buildCatalogue([snap(pkg('future', { framework: '^9.0' }))], testHub)
    expect(warnings).toEqual(['@strutvane/future: no version works with a known framework line (0.1, 0.2)'])
  })
})

describe('verified badge', () => {
  const build = (packageJson: Record<string, unknown>, conformance: unknown) =>
    buildCatalogue([snap(packageJson, { published: true, conformance })], testHub)

  it('is set only when every required kit passed for this exact version', () => {
    expect(build(pkg('tags'), passing('@strutvane/tags', '0.1.0')).index.entries[0]?.verified).toBe(true)
  })

  it.each([
    ['no results file', undefined, ''],
    ['a failed kit', passing('@strutvane/tags', '0.1.0', { security: 'failed' }), 'not passed: security'],
    ['a skipped kit', passing('@strutvane/tags', '0.1.0', { typecheck: 'skipped' }), 'not passed: typecheck'],
    ['another version', passing('@strutvane/tags', '0.0.9'), 'not @strutvane/tags@0.1.0'],
    ['another package', passing('@strutvane/billing', '0.1.0'), 'not @strutvane/tags@0.1.0'],
    ['a malformed file', { passed: true }, 'malformed'],
    ['a framework outside the range', { ...(passing('@strutvane/tags', '0.1.0') as object), framework: '0.1.0' }, 'outside the package\'s range'],
  ])('is not set with %s', (_name, conformance, reason) => {
    const { index, warnings } = build(pkg('tags'), conformance)
    expect(index.entries[0]?.verified).toBe(false)
    if (reason !== '') expect(warnings.join('\n')).toContain(reason)
  })

  it('needs the design kit for a design', () => {
    const design = { ...pkg('crisp', { kind: 'design', category: 'design' }), name: '@strutvane/design-crisp' }
    expect(build(design, passing('@strutvane/design-crisp', '0.1.0')).index.entries[0]?.verified).toBe(false)
    expect(build(design, passing('@strutvane/design-crisp', '0.1.0', { design: 'passed' })).index.entries[0]?.verified).toBe(true)
  })
})

describe('readers', () => {
  const temp: string[] = []
  afterEach(async () => {
    await Promise.all(temp.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  async function folder(files: Record<string, string>): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'spike21-'))
    temp.push(dir)
    for (const [path, content] of Object.entries(files)) {
      await mkdir(join(dir, path, '..'), { recursive: true })
      await writeFile(join(dir, path), content)
    }
    return dir
  }

  it('reads local folders, the registry state and conformance files', async () => {
    const dir = await folder({
      'tags/package.json': JSON.stringify(pkg('tags')),
      'tags/conformance.json': JSON.stringify(passing('@strutvane/tags', '0.1.0')),
      'broken/package.json': '{ not json',
    })
    const snapshots = await readLocalPackages(dir, { registry: { published: { '@strutvane/tags': ['0.1.0'] } }, relativeTo: dir })
    expect(snapshots.map((s) => [s.source, s.published, s.readProblem?.slice(0, 30)])).toEqual([
      ['broken/package.json', false, 'package.json is not valid JSON'],
      ['tags/package.json', true, undefined],
    ])
    expect(buildCatalogue(snapshots.slice(1), testHub).index.entries[0]?.verified).toBe(true)
  })

  it('refuses an oversized package.json before parsing it', async () => {
    const dir = await folder({ 'big/package.json': `{"name":"@strutvane/big","pad":"${'x'.repeat(600_000)}"}` })
    const [snapshot] = await readLocalPackages(dir)
    expect(snapshot?.readProblem).toMatch(/^package\.json is too large/)
  })

  it('reads every version of a package from the npm registry (fake fetch)', async () => {
    const urls: string[] = []
    const snapshots = await readNpmPackages(['@strutvane/tags', '@evil/x'], {
      fetchJson: async (url) => {
        urls.push(url)
        return {
          name: '@strutvane/tags',
          versions: {
            '0.0.1': { name: '@strutvane/tags', version: '0.0.1' },
            '0.1.0': pkg('tags'),
            '0.2.0-rc.1': pkg('tags'),
          },
        }
      },
      conformanceFor: async (_name, version) => (version === '0.1.0' ? passing('@strutvane/tags', '0.1.0') : undefined),
    })
    expect(urls).toEqual(['https://registry.npmjs.org/@strutvane%2ftags'])
    expect(snapshots.map((s) => s.source)).toEqual(['npm:@evil/x', 'npm:@strutvane/tags@0.1.0', 'npm:@strutvane/tags@0.0.1'])
    expect(snapshots[0]?.readProblem).toContain('not a Strutvane package name')
    const { index } = buildCatalogue(snapshots.slice(1), testHub)
    expect(index.entries[0]).toMatchObject({ id: 'tags', published: true, verified: true })
  })

  it('reports a registry answer for the wrong package as a problem', async () => {
    const snapshots = await readNpmPackages(['@strutvane/tags'], { fetchJson: async () => ({ name: '@strutvane/evil', versions: {} }) })
    expect(snapshots[0]?.readProblem).toBe('the npm registry answer is not a package document for this name')
  })
})

describe('lifecycle: status, phase, since and replacements (for the docs site)', () => {
  const withHub = (extra: Record<string, unknown>) => hubConfigSchema.parse({ ...testHub, ...extra })
  const lines = (packages: readonly Record<string, unknown>[], hub: ReturnType<typeof withHub>, published = false): string[] => {
    try {
      buildCatalogue(packages.map((p) => snap(p, { published })), hub)
    } catch (error) {
      if (error instanceof CatalogueBuildError) return error.problems.map((p) => `${p.package} | ${p.path}: ${p.message}`)
      throw error
    }
    return []
  }

  it('defaults to available when released and planned otherwise', () => {
    expect(buildCatalogue([snap(pkg('tags'), { published: true })], testHub).index.entries[0]?.status).toBe('available')
    expect(buildCatalogue([snap(pkg('tags'))], testHub).index.entries[0]?.status).toBe('planned')
  })

  it('copies status, phase and since from the hub', () => {
    const hub = withHub({ lifecycle: { tags: { status: 'in-development', phase: 1, since: '0.2' } } })
    expect(buildCatalogue([snap(pkg('tags'))], hub).index.entries[0]).toMatchObject({ status: 'in-development', phase: 1, since: '0.2' })
  })

  it.each([
    ['available without a release', { tags: { status: 'available' } }, false, 'is "available" but the package has no release on npm'],
    ['preview without a release', { tags: { status: 'preview' } }, false, 'is "preview" but the package has no release on npm'],
    ['planned with a release', { tags: { status: 'planned', phase: 4 } }, true, 'is "planned" but the package is released on npm'],
    ['a record for an unknown id', { ghost: { status: 'planned' } }, false, '"ghost" is not a package in the catalogue'],
  ])('refuses %s', (_name, lifecycle, published, message) => {
    expect(lines([pkg('tags')], withHub({ lifecycle }), published).join('\n')).toContain(message)
  })

  const retired = (extra: Record<string, unknown> = {}) => ({
    package: '@strutvane/core',
    name: 'Core (merged)',
    status: 'retired',
    note: 'Merged into the framework.',
    replacement: { packages: ['@strutvane/framework'], import: '@strutvane/framework/core', note: 'Import from @strutvane/framework/core.' },
    ...extra,
  })
  const framework = { ...pkg('framework', { category: 'core' }), name: '@strutvane/framework' }

  it('keeps retired packages, with replacements, in the index history', () => {
    const { index } = buildCatalogue([snap(framework)], withHub({ history: [retired()] }))
    expect(index.history).toEqual([retired()])
  })

  it('refuses a retired package without a replacement (schema) or with an unknown one (build)', () => {
    const { replacement: _drop, ...bare } = retired()
    expect(() => withHub({ history: [bare] })).toThrow(/required for a retired package/)
    expect(lines([framework], withHub({ history: [retired({ replacement: { packages: ['@strutvane/ghost'], note: 'Use ghost.' } })] })).join('\n')).toContain(
      '@strutvane/ghost is not in the catalogue, so it cannot replace @strutvane/core',
    )
  })

  it('refuses a history item that is still listed, or listed twice', () => {
    const stillListed = retired({ package: '@strutvane/framework', replacement: { packages: ['@strutvane/framework'], note: 'Itself.' } })
    expect(lines([framework], withHub({ history: [stillListed] })).join('\n')).toContain('is still listed in the catalogue')
    expect(lines([framework], withHub({ history: [retired(), retired()] })).join('\n')).toContain('lists @strutvane/core twice')
  })

  it('seed: every package has a status and phase; retired ones have replacements', async () => {
    const { index } = buildCatalogue(await seedSnapshots(), await seedHub())
    expect(index.entries.every((e) => e.phase !== undefined)).toBe(true)
    expect(index.entries.filter((e) => e.status === 'in-development').map((e) => e.id)).toEqual([
      'auth', 'create-strutvane', 'crisp', 'framework', 'log-viewer', 'strutvane', 'ui', 'vivid',
    ])
    expect(index.entries.filter((e) => e.status === 'in-development').every((e) => e.since === '0.2')).toBe(true)
    expect(index.entries.filter((e) => e.status === 'planned')).toHaveLength(41)
    expect(index.history.map((h) => [h.package, h.status, h.replacement?.packages ?? []])).toEqual([
      ['@strutvane/cli', 'retired', ['@strutvane/framework']],
      ['@strutvane/contracts', 'retired', ['@strutvane/framework']],
      ['@strutvane/core', 'retired', ['@strutvane/framework']],
      ['@strutvane/design-glass', 'shelved', []],
      ['@strutvane/devkit', 'retired', ['@strutvane/framework']],
      ['@strutvane/logs', 'retired', ['@strutvane/framework', '@strutvane/log-viewer']],
    ])
    expect(index.history.find((h) => h.package === '@strutvane/core')?.replacement?.import).toBe('@strutvane/framework/core')
  })
})
