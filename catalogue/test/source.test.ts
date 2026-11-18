import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseSource } from '../src/source/schema.ts'
import { root } from './helpers.ts'
import { entry, frameworkEntry, rawSource } from './source-helpers.ts'

const problems = (raw: unknown): string[] => {
  const result = parseSource(raw)
  return result.ok ? [] : result.problems.map((p) => `${p.path}: ${p.message}`)
}

describe('source.json', () => {
  it('the committed file parses, and lists every kind', async () => {
    const result = parseSource(JSON.parse(await readFile(new URL('source.json', root), 'utf8')))
    expect(result.ok ? [] : result.problems).toEqual([])
    if (!result.ok) return
    const kinds = new Set(result.source.packages.map((p) => p.kind))
    expect([...kinds].sort()).toEqual(['design', 'feature', 'package', 'repo'])
    // The npx guard holds the unscoped name; logs was renamed to log-viewer; glass is shelved.
    const byId = new Map(result.source.packages.map((p) => [p.id, p]))
    expect(byId.get('strutvane')).toMatchObject({ npm: 'strutvane', repo: 'strutvane-npx' })
    expect(byId.get('log-viewer')).toMatchObject({ npm: '@strutvane/log-viewer', repo: 'strutvane-log-viewer' })
    expect(byId.get('logs')).toMatchObject({ status: 'retired', repo: 'strutvane-log-viewer' })
    expect(byId.get('glass')).toMatchObject({ status: 'shelved', npm: '@strutvane/design-glass' })
  })

  it('accepts a minimal valid source', () => {
    expect(problems(rawSource([frameworkEntry(), entry('tags')]))).toEqual([])
  })

  it.each([
    ['a package without an npm name', entry('tags', { npm: null }), 'npm: is required for a package'],
    ['a listed package without docs', { ...entry('tags'), docs: undefined }, 'docs: is required while the package is listed'],
    ['a planned package without a phase', { ...entry('tags'), phase: undefined }, 'phase: is required for a planned package'],
    ['a retired entry without a replacement', entry('tags', { status: 'retired', note: 'Gone.' }), 'replacement: is required for a retired entry'],
    ['a shelved entry without a note', entry('tags', { status: 'shelved' }), 'note: is required for a shelved entry'],
    ['a feature with an npm name', entry('tags', { kind: 'feature', status: 'retired', note: 'x', replacement: { packages: ['@strutvane/framework'], note: 'x' } }), 'npm: must be null for a feature'],
    ['a released feature', { ...entry('tags', { kind: 'feature', npm: null, status: 'released' }) }, '"released" applies to npm packages and designs only'],
    ['a repo entry without a repo', { id: 'docs', name: 'Docs', description: 'Docs site', kind: 'repo', npm: null, repo: null, status: 'in-development' }, 'repo: is required for a repository entry'],
    ['a popular retired package', entry('tags', { status: 'retired', popular: true, note: 'x', replacement: { packages: ['@strutvane/framework'], note: 'x' } }), 'popular: only listed packages can be popular'],
    ['an http docs link', entry('tags', { docs: 'http://example.com/' }), 'must use https'],
    ['a pre-release framework range', entry('tags', { framework: '^0.2.0-next.0' }), 'framework'],
    ['a foreign npm scope', entry('tags', { npm: '@evil/tags' }), 'is not a Strutvane package name'],
    ['a repo URL instead of a name', entry('tags', { repo: 'https://github.com/x/y' }), 'must be a repository name inside the org'],
    ['an unknown field', entry('tags', { popluar: true }), 'popluar'],
  ])('refuses %s', (_name, bad, message) => {
    expect(problems(rawSource([frameworkEntry(), bad])).join('\n')).toContain(message)
  })

  it('refuses duplicate ids, duplicate npm names and unknown categories, all at once', () => {
    const found = problems(
      rawSource([frameworkEntry(), entry('tags'), entry('tags', { npm: '@strutvane/tags-two' }), entry('labels', { npm: '@strutvane/tags' }), entry('x', { category: 'nope' })]),
    )
    expect(found.join('\n')).toContain('id "tags" is also used by packages.1')
    expect(found.join('\n')).toContain('npm name @strutvane/tags is also used by packages.1')
    expect(found.join('\n')).toContain('"nope" is not one of the categories')
  })

  it('refuses a replacement that is not a listed package', () => {
    const retired = entry('core', { status: 'retired', note: 'Merged.', replacement: { packages: ['@strutvane/ghost'], note: 'Use ghost.' } })
    expect(problems(rawSource([frameworkEntry(), retired])).join('\n')).toContain('@strutvane/ghost is not a listed package, so it cannot replace core')
  })

  it('refuses a newer source format with a clear hint', () => {
    expect(problems(rawSource([frameworkEntry()], { sourceVersion: 2 })).join('\n')).toContain('this tool reads source format 1')
  })
})
