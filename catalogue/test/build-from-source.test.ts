import { readFile } from 'node:fs/promises'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { CatalogueBuildError, serializeCatalogue } from '../src/catalogue/build.ts'
import { parseCatalogueIndex } from '../src/catalogue/index-schema.ts'
import { npmSnapshotSchema } from '../src/live/npm.ts'
import { buildFromSource, mergeSource } from '../src/source/merge.ts'
import { parseSource, type Source } from '../src/source/schema.ts'
import { pkg, root, shuffled } from './helpers.ts'
import { entry, frameworkEntry, npm, npmPackage, source } from './source-helpers.ts'

const buildProblems = (src: Source, snapshot: ReturnType<typeof npm>): string[] => {
  try {
    buildFromSource(src, snapshot)
  } catch (error) {
    if (error instanceof CatalogueBuildError) return error.problems.map((p) => `${p.package} | ${p.path}: ${p.message}`)
    throw error
  }
  return []
}

describe('the committed catalogue', () => {
  it('is exactly what source.json and snapshots/npm.json build (offline replay)', async () => {
    const parsed = parseSource(JSON.parse(await readFile(new URL('source.json', root), 'utf8')))
    if (!parsed.ok) throw new Error('source.json is invalid')
    const snapshot = npmSnapshotSchema.parse(JSON.parse(await readFile(new URL('snapshots/npm.json', root), 'utf8')))
    const { index } = buildFromSource(parsed.source, snapshot)
    expect(serializeCatalogue(index)).toBe(await readFile(new URL('catalogue.json', root), 'utf8'))
    // And the format 2 reader accepts every entry.
    expect(parseCatalogueIndex(serializeCatalogue(index)).skipped).toEqual([])
  })
})

describe('merging the source with npm', () => {
  it('lists a package with no release as one unpublished working copy (0.0.0)', () => {
    const src = source([frameworkEntry(), entry('tags')])
    const { index } = buildFromSource(src, npm(src))
    expect(index.entries.find((e) => e.id === 'tags')).toMatchObject({
      published: false,
      status: 'planned',
      phase: 3,
      version: '0.0.0',
      versions: [{ version: '0.0.0', framework: '^0.2' }],
      repo: 'https://github.com/vishwajit-vm/strutvane-tags',
      followUps: [],
    })
  })

  it('never counts pre-releases or name placeholders as published', () => {
    const src = source([frameworkEntry(), entry('tags', { status: 'in-development', since: '0.2' })])
    const snapshot = npm(src, { '@strutvane/tags': npmPackage({ '0.2.0-next.0': { strutvane: { compat: '^0.2.0-next.0' } }, '0.0.0-stage': {} }, { next: '0.2.0-next.0' }) })
    expect(buildFromSource(src, snapshot).index.entries.find((e) => e.id === 'tags')).toMatchObject({ published: false, version: '0.0.0' })
  })

  it('lists full releases newest first, taking each range from compat, then the framework peer, then the source', () => {
    const src = source([frameworkEntry(), entry('tags', { status: 'released' })])
    const snapshot = npm(src, {
      '@strutvane/tags': npmPackage(
        {
          '0.1.0': {},
          '0.2.0': { peerDependencies: { '@strutvane/framework': '^0.3' } },
          '0.3.0': { strutvane: { compat: '^0.2 || ^0.3' } },
        },
        { latest: '0.3.0' },
      ),
    })
    const tags = buildFromSource(src, snapshot).index.entries.find((e) => e.id === 'tags')
    expect(tags).toMatchObject({ published: true, status: 'available', version: '0.3.0' })
    expect(tags?.versions).toEqual([
      { version: '0.3.0', framework: '^0.2 || ^0.3' },
      { version: '0.2.0', framework: '^0.3' },
      { version: '0.1.0', framework: '^0.2' },
    ])
    expect(tags?.compatibility).toEqual({ '0.2': '0.3.0', '0.3': '0.3.0' })
  })

  it('uses a published catalogue manifest as is (questions, installs), setting runtime keys aside', () => {
    const src = source([frameworkEntry(), entry('billing', { status: 'released', category: 'data' })])
    const manifest = pkg('billing', {
      questions: [{ id: 'provider', type: 'select', label: 'Billing: provider?', choices: [{ value: 'stripe', label: 'Stripe' }, { value: 'paddle', label: 'Paddle' }], default: 'stripe' }],
      installs: { config: ['config/billing.ts'] },
    })['strutvane'] as Record<string, unknown>
    const snapshot = npm(src, { '@strutvane/billing': npmPackage({ '0.1.0': { strutvane: { ...manifest, compat: '^0.2', commands: './dist/commands.mjs' } } }, { latest: '0.1.0' }) })
    const billing = buildFromSource(src, snapshot).index.entries.find((e) => e.id === 'billing')
    expect(billing?.followUps.map((q) => q.id)).toEqual(['provider'])
    expect(billing?.installs.config).toEqual(['config/billing.ts'])
  })

  it('fails closed on an invalid published manifest, naming the npm version', () => {
    const src = source([frameworkEntry(), entry('billing', { status: 'released' })])
    const bad = { ...(pkg('billing')['strutvane'] as Record<string, unknown>), docs: 'http://example.com/' }
    const snapshot = npm(src, { '@strutvane/billing': npmPackage({ '0.1.0': { strutvane: bad } }, { latest: '0.1.0' }) })
    expect(buildProblems(src, snapshot).join('\n')).toContain('@strutvane/billing | strutvane.docs: must use https')
  })

  it('refuses status drift: released without a release, planned with one', () => {
    const released = source([frameworkEntry(), entry('tags', { status: 'released' })])
    expect(buildProblems(released, npm(released)).join('\n')).toContain('is "available" but the package has no release on npm')
    const planned = source([frameworkEntry(), entry('tags')])
    const snapshot = npm(planned, { '@strutvane/tags': npmPackage({ '0.1.0': {} }, { latest: '0.1.0' }) })
    expect(buildProblems(planned, snapshot).join('\n')).toContain('is "planned" but the package is released on npm')
  })

  it('falls back to the working copy when every release is deprecated on npm', () => {
    const src = source([frameworkEntry(), entry('tags')])
    const snapshot = npm(src, { '@strutvane/tags': npmPackage({ '0.1.0': { deprecated: 'broken' } }, { latest: '0.1.0' }) })
    expect(buildFromSource(src, snapshot).index.entries.find((e) => e.id === 'tags')).toMatchObject({ published: false, version: '0.0.0' })
  })

  it('puts retired and shelved packages in history, and leaves features and repos out of the index', () => {
    const src = source([
      frameworkEntry(),
      entry('core', { status: 'retired', since: '0.2', date: '2026-11-15', note: 'Merged into the framework.', replacement: { packages: ['@strutvane/framework'], import: '@strutvane/framework/core', note: 'Import from @strutvane/framework/core.' } }),
      entry('glass', { kind: 'design', npm: '@strutvane/design-glass', category: 'design', status: 'shelved', note: 'On hold.' }),
      { id: 'launcher', name: 'Launcher', description: 'v1 launcher', kind: 'feature', npm: null, repo: null, status: 'retired', note: 'Gone.', replacement: { packages: ['@strutvane/framework'], note: 'node strut' } },
      { id: 'docs', name: 'Docs site', description: 'The docs site', kind: 'repo', npm: null, repo: 'strutvane-docs', status: 'in-development' },
    ])
    const { index } = buildFromSource(src, npm(src))
    expect(index.entries.map((e) => e.id)).toEqual(['framework'])
    expect(index.history.map((h) => [h.package, h.status])).toEqual([
      ['@strutvane/core', 'retired'],
      ['@strutvane/design-glass', 'shelved'],
    ])
    expect(index.history[0]).toMatchObject({ since: '0.2', date: '2026-11-15', replacement: { import: '@strutvane/framework/core' } })
  })

  it('adds released framework versions to the compatibility lines', () => {
    const src = source([frameworkEntry({ status: 'released' })])
    const snapshot = npm(src, { '@strutvane/framework': npmPackage({ '0.4.1': {}, '0.4.0': {} }, { latest: '0.4.1' }) })
    const { hub } = mergeSource(src, snapshot)
    expect(hub.framework.versions).toEqual(['0.2.0', '0.3.0', '0.4.1', '0.4.0'])
    expect(buildFromSource(src, snapshot).index.frameworkLines).toEqual([
      { line: '0.2', latest: '0.2.0' },
      { line: '0.3', latest: '0.3.0' },
      { line: '0.4', latest: '0.4.1' },
    ])
  })

  it('gives identical bytes whatever order the source lists packages in (property)', () => {
    const packages = [frameworkEntry(), entry('tags'), entry('search', { category: 'operations' }), entry('charts', { popular: true })]
    const reference = serializeCatalogue(buildFromSource(source(packages), npm(source(packages))).index)
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        let state = seed
        const random = (): number => {
          state = (state * 1_103_515_245 + 12_345) % 2_147_483_648
          return Math.abs(state) / 2_147_483_648
        }
        const src = source(shuffled(packages, random))
        expect(serializeCatalogue(buildFromSource(src, npm(src)).index)).toBe(reference)
      }),
      { numRuns: 50 },
    )
  })
})
