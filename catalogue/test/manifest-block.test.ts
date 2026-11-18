import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { checkBlock, findSecretValues } from '../src/checks/manifest-block.ts'
import { acceptsFramework, compareAnyVersions, isPlaceholder, isPrerelease, lineRange } from '../src/checks/prerelease.ts'
import { pkg } from './helpers.ts'
import { entry, source } from './source-helpers.ts'

const messages = (block: unknown, context: Partial<Parameters<typeof checkBlock>[1]> = {}): string[] =>
  checkBlock(block, { name: '@strutvane/tags', version: '0.2.0', ...context }).map((f) => `${f.severity}: ${f.message}`)

const manifest = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...(pkg('tags')['strutvane'] as Record<string, unknown>),
  ...overrides,
})

describe('runtime keys (the framework console reads them)', () => {
  it('accepts the blocks real packages publish today', () => {
    expect(messages({ compat: '^0.1.0-next.0', commands: './dist/commands.mjs', migrations: './migrations' }, { frameworkVersion: '0.1.0-next.0' })).toEqual([])
    expect(messages({ allowConsole: ['src/bin.ts'] }, { name: 'strutvane' })).toEqual([])
  })

  it('refuses unknown keys, paths that leave the package, and ranges it cannot read', () => {
    const found = messages({ comapt: '^0.2', commands: '../../etc/passwd.js', installer: '/abs/x.mjs', migrations: 3, allowConsole: ['a/../../b'], compat: 'banana' })
    expect(found.join('\n')).toContain('strutvane.comapt is not a known field')
    expect(found.join('\n')).toContain('strutvane.commands must be a relative path')
    expect(found.join('\n')).toContain('strutvane.installer must be a relative path')
    expect(found.join('\n')).toContain('strutvane.migrations must be a path string')
    expect(found.join('\n')).toContain('strutvane.allowConsole[0] must be a relative path')
    expect(found.join('\n')).toContain('strutvane.compat "banana" is not a semver range')
  })

  it('refuses something that is not an object, or is too large', () => {
    expect(messages(['x'])).toEqual(['error: strutvane must be an object'])
    expect(messages({ compat: '^0.2', note: 'x'.repeat(20_000) }).join('\n')).toContain('is too large')
  })
})

describe('no secrets in a published block', () => {
  it.each([
    ['an npm token', { compat: `npm_${'a'.repeat(36)}` }],
    ['a GitHub token', { compat: `ghp_${'A'.repeat(36)}` }],
    ['an AWS key id', { compat: 'AKIAABCDEFGHIJKLMNOP' }],
    ['a private key', { commands: '-----BEGIN RSA PRIVATE KEY-----' }],
    ['a URL with a password', { docs: 'https://user:hunter2@example.com/' }],
    ['a value under a credential name', { token: 'abc' }],
  ])('finds %s', (_name, block) => {
    expect(findSecretValues(block).length).toBeGreaterThan(0)
    expect(messages(block).join('\n')).toMatch(/Never publish credentials/)
  })

  it('does not flag env variable NAMES in installs.env, or secret flags', () => {
    const block = manifest({ installs: { env: [{ key: 'STRIPE_SECRET', description: 'Stripe secret API key', secret: true }] } })
    expect(findSecretValues(block)).toEqual([])
    expect(messages(block)).toEqual([])
  })

  it('never throws on arbitrary JSON (fuzz)', () => {
    fc.assert(
      fc.property(fc.jsonValue({ maxDepth: 8 }), (value) => {
        expect(() => checkBlock(value, { name: 'strutvane-x', version: '1.0.0', frameworkVersion: '0.2.0' })).not.toThrow()
        expect(() => findSecretValues(value)).not.toThrow()
      }),
      { numRuns: 500 },
    )
  })
})

describe('the catalogue manifest inside the block', () => {
  it('passes every manifest rule, with runtime keys alongside', () => {
    expect(messages({ ...manifest(), compat: '^0.2', commands: './dist/commands.mjs' }, { frameworkVersion: '0.2.0' })).toEqual([])
  })

  it('applies the manifest rules: a question asking for a secret, an unsafe pattern', () => {
    const secret = manifest({ questions: [{ id: 'api-key', type: 'text', label: 'Your API key?', maxLength: 40, pattern: { regex: '^[a-z]+$', message: 'letters' } }] })
    expect(messages(secret).join('\n')).toContain('asks for a secret')
    const redos = manifest({ questions: [{ id: 'prefix', type: 'text', label: 'Prefix?', maxLength: 40, pattern: { regex: '^(a+)+$', message: 'a' } }] })
    expect(messages(redos).join('\n')).toMatch(/strutvane\.questions\[0\]/)
  })

  it('validates a pre-release as its release line', () => {
    expect(messages(manifest(), { version: '0.2.0-next.3' })).toEqual([])
  })

  it('must agree with the hub on id, kind and category', () => {
    const src = source([entry('framework', { category: 'core', status: 'in-development', phase: 1 }), entry('labels', { npm: '@strutvane/tags', category: 'operations' })])
    const hubEntry = src.packages[1]
    const found = messages(manifest(), { entry: hubEntry })
    expect(found.join('\n')).toContain('strutvane.id is "tags" but the hub lists this package as "labels"')
    expect(found.join('\n')).toContain('strutvane.category is "data" but the hub files it under "operations"')
  })

  it('refuses catalogue fields without manifestVersion (half a manifest)', () => {
    const { manifestVersion: _drop, ...half } = manifest()
    expect(messages({ ...half, compat: '^0.2.0-next.0' }).join('\n')).toContain('without "manifestVersion": 1')
  })
})

describe('framework compatibility', () => {
  it('requires the range to accept the current framework line', () => {
    expect(messages({ compat: '^0.2.0-next.0' }, { frameworkVersion: '0.2.0-next.4' })).toEqual([])
    expect(messages({ compat: '^0.1.0-next.0' }, { frameworkVersion: '0.2.0-next.0' }).join('\n')).toContain(
      'framework range "^0.1.0-next.0" does not accept the current framework 0.2.0-next.0',
    )
    expect(messages({}, { frameworkVersion: '0.2.0', peerDependencies: { '@strutvane/framework': '^0.1' } }).join('\n')).toContain('does not accept')
  })

  it('first-party may omit the range (warning); community may not (error)', () => {
    expect(messages({ commands: './x.mjs' }, { frameworkVersion: '0.2.0' })).toEqual([
      'warning: declares no framework range; first-party packages may omit it, but then nothing proves it works with the current framework',
    ])
    expect(messages({ commands: './x.mjs' }, { name: 'strutvane-kanban', frameworkVersion: '0.2.0' })[0]).toMatch(/^error: declares no framework range/)
  })

  it('the framework\'s own compat must include its own version (the 0.2 release blocker)', () => {
    expect(messages({ compat: '^0.1.0-next.0' }, { name: '@strutvane/framework', version: '0.2.0-next.0' }).join('\n')).toContain(
      'does not include the framework\'s own version 0.2.0-next.0',
    )
    expect(messages({ compat: '^0.2.0-next.0' }, { name: '@strutvane/framework', version: '0.2.0-next.0' })).toEqual([])
  })
})

describe('pre-release helpers', () => {
  it('order versions the semver way', () => {
    const sorted = ['0.2.0', '0.2.0-next.10', '0.0.0-reserved.0', '0.2.0-next.2', '0.1.0', '0.2.0-alpha', 'x'].sort(compareAnyVersions)
    expect(sorted).toEqual(['x', '0.0.0-reserved.0', '0.1.0', '0.2.0-next.2', '0.2.0-next.10', '0.2.0-alpha', '0.2.0'].sort(compareAnyVersions))
    expect(sorted.indexOf('0.2.0-next.2')).toBeLessThan(sorted.indexOf('0.2.0-next.10'))
    expect(sorted.indexOf('0.2.0-alpha')).toBeLessThan(sorted.indexOf('0.2.0-next.2'))
    expect(sorted.at(-1)).toBe('0.2.0')
    expect(sorted[0]).toBe('x')
  })

  it('tell placeholders and pre-releases apart', () => {
    expect([isPlaceholder('0.0.0-reserved.0'), isPlaceholder('0.0.0-stage'), isPlaceholder('0.1.0')]).toEqual([true, true, false])
    expect([isPrerelease('0.2.0-next.0'), isPrerelease('0.2.0')]).toEqual([true, false])
    expect(lineRange('>=0.1.0-next.0 <0.3.0-rc.1+b')).toBe('>=0.1.0 <0.3.0')
    expect(acceptsFramework('^0.2', 'not-a-version')).toBe(false)
  })

  it('compareAnyVersions is a total order (property)', () => {
    const version = fc.tuple(fc.nat(3), fc.nat(3), fc.nat(3), fc.option(fc.constantFrom('next.0', 'next.2', 'next.10', 'alpha', 'rc.1'), { nil: undefined })).map(
      ([a, b, c, pre]) => `${a}.${b}.${c}${pre === undefined ? '' : `-${pre}`}`,
    )
    fc.assert(
      fc.property(version, version, version, (a, b, c) => {
        expect(Math.sign(compareAnyVersions(a, b))).toBe(-Math.sign(compareAnyVersions(b, a)) || 0)
        if (compareAnyVersions(a, b) <= 0 && compareAnyVersions(b, c) <= 0) expect(compareAnyVersions(a, c)).toBeLessThanOrEqual(0)
      }),
    )
  })
})
