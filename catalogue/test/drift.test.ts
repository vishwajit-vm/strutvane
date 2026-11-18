import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkDocs, readDocsPackages, type DocsEntry, type DocsPackages } from '../src/checks/docs.ts'
import { formatFindings, type Finding } from '../src/checks/findings.ts'
import { checkNpm, currentFramework, githubRepoOf } from '../src/checks/npm-state.ts'
import { checkRepos, isTrackedRepo } from '../src/checks/repos.ts'
import type { RepoSnapshot } from '../src/live/repos.ts'
import { entry, frameworkEntry, npm, npmPackage, source } from './source-helpers.ts'

const lines = (findings: readonly Finding[]): string[] => findings.map((f) => `${f.severity} ${f.subject}: ${f.message}`)

describe('npm drift', () => {
  const src = source([
    frameworkEntry(),
    entry('tags', { status: 'released' }),
    entry('search'),
    entry('core', { status: 'retired', note: 'Merged.', replacement: { packages: ['@strutvane/framework'], note: 'Use the framework.' } }),
  ])

  it('finds a released package that is not on npm, or only holds a placeholder', () => {
    expect(lines(checkNpm(src, npm(src, { '@strutvane/tags': null })))).toContain('error @strutvane/tags: is marked released but does not exist on npm')
    expect(lines(checkNpm(src, npm(src))).join('\n')).toContain('@strutvane/tags: is marked released but npm has no full release (latest is 0.0.0-reserved.0)')
    const tagOnPlaceholder = npm(src, { '@strutvane/tags': npmPackage({ '0.1.0': {} }) })
    expect(lines(checkNpm(src, tagOnPlaceholder)).join('\n')).toContain('its latest dist-tag is 0.0.0-reserved.0, a name placeholder')
  })

  it('passes a released package with a real latest release', () => {
    const ok = npm(src, { '@strutvane/tags': npmPackage({ '0.1.0': {} }, { latest: '0.1.0' }) })
    expect(lines(checkNpm(src, ok)).filter((line) => line.includes('@strutvane/tags'))).toEqual([])
  })

  it('finds a planned package that npm has already released, and an unreserved listed name', () => {
    const snapshot = npm(src, { '@strutvane/tags': npmPackage({ '0.1.0': {} }, { latest: '0.1.0' }), '@strutvane/search': npmPackage({ '0.3.0': {} }, { latest: '0.3.0' }) })
    expect(lines(checkNpm(src, snapshot))).toContain('error @strutvane/search: is marked planned but npm already has the release 0.3.0; mark it released')
    expect(lines(checkNpm(src, npm(src, { '@strutvane/search': null }))).join('\n')).toContain('warning @strutvane/search: does not exist on npm, so nobody holds the name yet')
  })

  it('warns about a retired package that is not deprecated on npm, and a stale repository link', () => {
    const snapshot = npm(src, { '@strutvane/core': npmPackage({ '0.1.0-next.0': { repository: 'git+https://github.com/vishwajit-vm/strutvane-kernel.git' } }) })
    const found = lines(checkNpm(src, snapshot))
    expect(found.join('\n')).toContain('warning @strutvane/core: is retired but not deprecated on npm yet')
    expect(found.join('\n')).toContain('the newest release\'s repository is vishwajit-vm/strutvane-kernel, but the source says vishwajit-vm/strutvane-core')
  })

  it('reports a source name missing from the snapshot (the online build was not run)', () => {
    const snapshot = npm(src)
    const { ['@strutvane/search']: _drop, ...rest } = snapshot.packages
    expect(lines(checkNpm(src, { ...snapshot, packages: rest })).join('\n')).toContain('@strutvane/search: is not in snapshots/npm.json')
  })

  it('runs manifest conformance on published blocks; framework compatibility only on dist-tag versions', () => {
    const snapshot = npm(src, {
      '@strutvane/framework': npmPackage({ '0.2.0-next.0': { strutvane: { compat: '^0.2.0-next.0' } } }, { next: '0.2.0-next.0' }),
      '@strutvane/search': npmPackage(
        { '0.1.0-next.0': { strutvane: { compat: '^0.1.0-next.0' } }, '0.2.0-next.0': { strutvane: { compat: '^0.1.0-next.0', token: 'x' } } },
        { next: '0.2.0-next.0' },
      ),
    })
    const found = lines(checkNpm(src, snapshot)).filter((line) => line.includes('search'))
    // The old 0.1 pre-release may target 0.1; only the tagged one must accept 0.2.
    expect(found.filter((line) => line.includes('@0.1.0-next.0'))).toEqual([])
    expect(found.join('\n')).toContain('@strutvane/search@0.2.0-next.0: framework range "^0.1.0-next.0" does not accept the current framework 0.2.0-next.0')
    expect(found.join('\n')).toContain('@strutvane/search@0.2.0-next.0: strutvane.token is not a known field')
  })

  it('reads the current framework from latest, else next, never a placeholder', () => {
    expect(currentFramework(npmPackage({}, { next: '0.2.0-next.1' }))).toBe('0.2.0-next.1')
    expect(currentFramework(npmPackage({}, { latest: '0.2.0', next: '0.3.0-next.0' }))).toBe('0.2.0')
    expect(currentFramework(npmPackage({}))).toBeUndefined()
    expect(currentFramework(null)).toBeUndefined()
    expect(githubRepoOf('git+https://github.com/Vishwajit-VM/strutvane-ui.git')).toBe('vishwajit-vm/strutvane-ui')
    expect(githubRepoOf('git@github.com:vishwajit-vm/strutvane-ui.git')).toBe('vishwajit-vm/strutvane-ui')
    expect(githubRepoOf('https://gitlab.com/x/y')).toBeUndefined()
  })
})

describe('repository drift', () => {
  const src = source([
    frameworkEntry(),
    entry('tags'),
    entry('core', { status: 'retired', note: 'Merged.', replacement: { packages: ['@strutvane/framework'], note: 'Use the framework.' } }),
    { id: 'docs', name: 'Docs site', description: 'The docs site', kind: 'repo', npm: null, repo: 'strutvane-docs', status: 'in-development' },
  ])
  const repos = (list: readonly [string, boolean][], org = 'vishwajit-vm'): RepoSnapshot => ({ snapshotVersion: 1, org, repos: list.map(([name, archived]) => ({ name, archived })) })
  const all: [string, boolean][] = [['strutvane-framework', false], ['strutvane-tags', false], ['strutvane-core', true], ['strutvane-docs', false], ['strutvane', false], ['.github', false], ['other-project', false]]

  it('passes when both sides agree (and ignores repos that are not Strutvane packages)', () => {
    expect(lines(checkRepos(src, repos(all)))).toEqual([])
    expect([isTrackedRepo('strutvane-x'), isTrackedRepo('create-strutvane'), isTrackedRepo('strutvane'), isTrackedRepo('.github')]).toEqual([true, true, false, false])
  })

  it('finds a repo in the org with no source entry, and a source repo missing from the org', () => {
    const found = lines(checkRepos(src, repos([...all.filter(([name]) => name !== 'strutvane-tags'), ['strutvane-kanban', false], ['create-strutvane', false]])))
    expect(found).toContain('error strutvane-kanban: is a repository in vishwajit-vm but no source.json entry names it; add one (kind "repo" if it is not a package)')
    expect(found).toContain('error create-strutvane: is a repository in vishwajit-vm but no source.json entry names it; add one (kind "repo" if it is not a package)')
    expect(found).toContain('error strutvane-tags: is named by tags but does not exist in vishwajit-vm (renamed or deleted?)')
  })

  it('finds an archived repo behind a live entry, and a live repo used only by retired entries', () => {
    const found = lines(checkRepos(src, repos(all.map(([name, archived]) => [name, name === 'strutvane-tags' ? true : name === 'strutvane-core' ? false : archived]))))
    expect(found.join('\n')).toContain('error strutvane-tags: is archived, but tags is planned')
    expect(found.join('\n')).toContain('warning strutvane-core: only retired entries (core) use it; archive the repository')
  })

  it('refuses a repo list for another org', () => {
    expect(lines(checkRepos(src, repos(all, 'someone-else')))[0]).toContain('the repo list is for someone-else')
  })
})

describe('docs drift', () => {
  const src = source([
    frameworkEntry(),
    entry('tags', { repo: 'strutvane-tags' }),
    entry('crisp', { kind: 'design', npm: '@strutvane/design-crisp', repo: 'strutvane-design-crisp', category: 'design', status: 'in-development', phase: 1 }),
    { id: 'launcher', name: 'Launcher', description: 'v1 launcher', kind: 'feature', npm: null, repo: null, status: 'retired', note: 'Gone.', replacement: { packages: ['@strutvane/framework'], note: 'node strut' } },
  ])
  const docEntry = (id: string, extra: Partial<DocsEntry> = {}): DocsEntry => ({
    id,
    npm: `@strutvane/${id}`,
    repo: `https://github.com/vishwajit-vm/strutvane-${id}`,
    status: 'planned',
    phase: 3,
    ...extra,
  })
  const docs = (entries: readonly DocsEntry[], pages: DocsPackages['pages'] = []): DocsPackages => ({ entries, pages })
  const agreeing: DocsEntry[] = [
    docEntry('framework', { status: 'in-development', phase: 1 }),
    docEntry('tags'),
    docEntry('design-crisp', { status: 'in-development', phase: 1 }),
    { id: 'launcher', npm: null, repo: null, status: 'retired', phase: null },
  ]

  it('passes when the docs and the catalogue agree (design matched by npm name, feature by id)', () => {
    expect(lines(checkDocs(src, docs(agreeing, [{ file: 'versions/0.2.x/packages/tags.mdx', id: 'tags' }])))).toEqual([])
  })

  it('finds a docs entry with no catalogue entry, and every field that disagrees', () => {
    const found = lines(
      checkDocs(
        src,
        docs([
          ...agreeing.filter((item) => item.id !== 'tags'),
          docEntry('tags', { repo: null, status: 'available', phase: 4 }),
          docEntry('kanban'),
        ]),
      ),
    )
    expect(found).toContain('error docs:kanban: is on the docs Packages page but has no catalogue entry (npm @strutvane/kanban); add it to source.json or remove it from the docs')
    expect(found).toContain('error docs:tags: repo is null in the docs but https://github.com/vishwajit-vm/strutvane-tags in the catalogue')
    expect(found).toContain('error docs:tags: status is "available" in the docs but "planned" in the catalogue')
    expect(found).toContain('error docs:tags: phase is 4 in the docs but 3 in the catalogue')
  })

  it('finds pages for packages the docs data does not list, and catalogue entries missing from the docs', () => {
    const found = lines(checkDocs(src, docs(agreeing.filter((item) => item.id !== 'tags'), [{ file: 'versions/0.2.x/packages/ghost.mdx', id: 'ghost' }])))
    expect(found).toContain('error docs:ghost: versions/0.2.x/packages/ghost.mdx shows a package the docs data (src/data/packages.json) does not list')
    expect(found).toContain('warning tags: is in the catalogue but not on the docs Packages page')
  })

  describe('reading a strutvane-docs checkout', () => {
    const temp: string[] = []
    afterEach(async () => {
      await Promise.all(temp.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
    })

    it('reads src/data/packages.json and the PackagePage ids of every version', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'catalogue-docs-'))
      temp.push(dir)
      await mkdir(join(dir, 'src', 'data'), { recursive: true })
      await mkdir(join(dir, 'versions', '0.2.x', 'packages'), { recursive: true })
      await writeFile(join(dir, 'src', 'data', 'packages.json'), JSON.stringify({ packages: agreeing.map((item) => ({ ...item, title: 'x', extra: true })) }))
      await writeFile(join(dir, 'versions', '0.2.x', 'packages', 'tags.mdx'), '---\ntitle: Tags\n---\n<PackagePage id="tags" />\n')
      await writeFile(join(dir, 'versions', '0.2.x', 'packages', 'catalogue.mdx'), '# All packages\n')
      const read = await readDocsPackages(dir)
      expect(read.pages).toEqual([{ file: 'versions/0.2.x/packages/tags.mdx', id: 'tags' }])
      expect(lines(checkDocs(src, read))).toEqual([])
    })

    it('fails loudly on missing or malformed docs data (never "no entries, all fine")', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'catalogue-docs-'))
      temp.push(dir)
      await expect(readDocsPackages(dir)).rejects.toThrow()
      await mkdir(join(dir, 'src', 'data'), { recursive: true })
      await writeFile(join(dir, 'src', 'data', 'packages.json'), JSON.stringify({ packages: [{ id: 'x', status: 'unknown' }] }))
      await expect(readDocsPackages(dir)).rejects.toThrow(/packages\[0\] is malformed/)
    })
  })
})

describe('the report', () => {
  it('summarises, puts errors first and groups by check', () => {
    const text = formatFindings([
      { check: 'npm', severity: 'warning', subject: 'b', message: 'later' },
      { check: 'repos', severity: 'error', subject: 'a', message: 'first' },
    ])
    expect(text).toBe('Catalogue checks FAILED: 1 error, 1 warning.\n\n  npm\n    warning b: later\n\n  repos\n    ERROR   a: first\n')
    expect(formatFindings([])).toBe('Catalogue checks passed.\n')
  })
})
