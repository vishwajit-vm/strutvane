import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPackumentOverHttp, MAX_VERSIONS, readNpm, reducePackument } from '../src/live/npm.ts'
import { readRepos } from '../src/live/repos.ts'

describe('npm: what the catalogue keeps of a packument', () => {
  it('keeps dist-tags and, per version, only deprecated, peers, the strutvane block and the repository', () => {
    const reduced = reducePackument('@strutvane/tags', {
      name: '@strutvane/tags',
      'dist-tags': { next: '0.2.0-next.0', latest: '0.1.0' },
      time: { created: '2026-01-01' },
      versions: {
        '0.1.0': { name: '@strutvane/tags', scripts: { postinstall: 'x' }, repository: { type: 'git', url: 'git+https://github.com/vishwajit-vm/strutvane-tags.git' }, peerDependencies: { b: '1', a: '2', bad: 3 } },
        '0.2.0-next.0': { deprecated: 'use 0.2.0', strutvane: { compat: '^0.2.0-next.0' } },
      },
    })
    expect(reduced).toEqual({
      distTags: { latest: '0.1.0', next: '0.2.0-next.0' },
      versions: {
        '0.2.0-next.0': { deprecated: 'use 0.2.0', strutvane: { compat: '^0.2.0-next.0' } },
        '0.1.0': { peerDependencies: { a: '2', b: '1' }, repository: 'git+https://github.com/vishwajit-vm/strutvane-tags.git' },
      },
    })
    expect(Object.keys(reduced.versions)).toEqual(['0.2.0-next.0', '0.1.0'])
  })

  it(`keeps at most the newest ${MAX_VERSIONS} versions`, () => {
    const versions = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`0.${i}.0`, {}]))
    const kept = Object.keys(reducePackument('@strutvane/tags', { name: '@strutvane/tags', versions }).versions)
    expect(kept).toHaveLength(MAX_VERSIONS)
    expect(kept[0]).toBe('0.79.0')
  })

  it('refuses an answer for another package, or not a packument at all', () => {
    expect(() => reducePackument('@strutvane/tags', { name: '@strutvane/evil', versions: {} })).toThrow(/not a package document for @strutvane\/tags/)
    expect(() => reducePackument('@strutvane/tags', 'hello')).toThrow()
  })

  it('reads every name once, sorted, records missing packages as null, and refuses foreign names', async () => {
    const urls: string[] = []
    const snapshot = await readNpm(['strutvane', '@strutvane/tags', '@strutvane/tags'], async (url) => {
      urls.push(url)
      return url.endsWith('/strutvane') ? { status: 'missing' } : { status: 'found', body: { name: '@strutvane/tags', 'dist-tags': {}, versions: {} } }
    })
    expect(urls).toEqual(['https://registry.npmjs.org/@strutvane%2ftags', 'https://registry.npmjs.org/strutvane'])
    expect(snapshot.packages).toEqual({ '@strutvane/tags': { distTags: {}, versions: {} }, strutvane: null })
    await expect(readNpm(['lodash'], async () => ({ status: 'missing' }))).rejects.toThrow(/not a Strutvane package name/)
  })
})

describe('npm over HTTP (fetch stubbed)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('maps 404 to missing, retries 5xx and network errors, and fails loudly in the end', async () => {
    const answers: (Response | Error)[] = [new Error('socket hang up'), new Response('', { status: 503 }), Response.json({ name: 'x' })]
    const fetchStub = vi.fn(async () => {
      const next = answers.shift()
      if (next instanceof Error) throw next
      return next ?? new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchStub)
    const fetchPackument = fetchPackumentOverHttp({ retries: 2, timeoutMs: 1_000 })
    await expect(fetchPackument('https://registry.npmjs.org/x')).resolves.toEqual({ status: 'found', body: { name: 'x' } })
    await expect(fetchPackument('https://registry.npmjs.org/y')).resolves.toEqual({ status: 'missing' })
    answers.push(new Response('', { status: 500 }), new Response('', { status: 500 }), new Response('', { status: 500 }))
    await expect(fetchPackument('https://registry.npmjs.org/z')).rejects.toThrow(/could not read .*HTTP 500/)
    answers.push(new Response('', { status: 403 }))
    await expect(fetchPackument('https://registry.npmjs.org/w')).rejects.toThrow(/HTTP 403/)
    expect(fetchStub).toHaveBeenCalledTimes(3 + 1 + 3 + 1)
  })
})

describe('repos', () => {
  it('records the list sorted by name, so the snapshot only changes when the org does', async () => {
    const snapshot = await readRepos('vishwajit-vm', async () => [
      { name: 'strutvane-ui', archived: false },
      { name: 'create-strutvane', archived: false },
      { name: 'strutvane-core', archived: true },
    ])
    expect(snapshot).toEqual({
      snapshotVersion: 1,
      org: 'vishwajit-vm',
      repos: [
        { name: 'create-strutvane', archived: false },
        { name: 'strutvane-core', archived: true },
        { name: 'strutvane-ui', archived: false },
      ],
    })
  })
})
