// Unit tests for the pure helpers of scripts/e2e-local.mjs. Run: node --test scripts/e2e-local.test.mjs
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import {
  BUILD_ORDER,
  cookiesFrom,
  LOCAL_PACKAGES,
  listQuery,
  parseArgs,
  parseEnv,
  relativePosix,
  secret,
  updateJar,
  workspaceYaml,
} from './e2e-local.mjs'

describe('parseArgs', () => {
  test('defaults and known flags', () => {
    assert.deepEqual(parseArgs([]), { skipBuild: false, skipTenancy: false })
    assert.deepEqual(parseArgs(['--skip-build', '--skip-tenancy']), { skipBuild: true, skipTenancy: true })
  })
  test('unknown flags are an error, so a typo never skips steps silently', () => {
    assert.throws(() => parseArgs(['--skip-tenacy']), /Unknown flag --skip-tenacy/)
  })
})

describe('relativePosix / workspaceYaml', () => {
  const hub = process.platform === 'win32' ? 'C:\\hub' : '/hub'
  test('relative paths use forward slashes', () => {
    assert.equal(relativePosix(join(hub, 'integration-local/app'), join(hub, 'packages/core')), '../../packages/core')
    assert.equal(relativePosix(join(hub, 'a'), join(hub, 'a')), '.')
  })
  test('every local package is overridden with file: (never link:)', () => {
    const yaml = workspaceYaml(join(hub, 'integration-local/app'), join(hub, 'packages'))
    for (const name of Object.keys(LOCAL_PACKAGES)) assert.match(yaml, new RegExp(`"${name}": file:`))
    assert.doesNotMatch(yaml, /link:/)
    assert.match(yaml, /"@strutvane\/cli": file:\.\.\/\.\.\/packages\/cli\/packages\/cli/)
  })
  test('build order puts dependencies first', () => {
    assert.ok(BUILD_ORDER.indexOf('contracts') < BUILD_ORDER.indexOf('core'))
    assert.ok(BUILD_ORDER.indexOf('core') < BUILD_ORDER.indexOf('framework'))
    assert.equal(BUILD_ORDER.at(-1), 'create-strutvane')
  })
})

describe('parseEnv', () => {
  test('reads KEY=VALUE, ignores comments/blanks, keeps "=" inside values', () => {
    assert.deepEqual(parseEnv('# c\nA=1\r\n\nB = x=y\nBAD\nC=\n'), { A: '1', B: 'x=y', C: '' })
  })
})

describe('cookies', () => {
  test('cookiesFrom keeps name=value pairs only', () => {
    const h = new Headers()
    h.append('set-cookie', 'sv_session=abc; Path=/; HttpOnly')
    h.append('set-cookie', 'other=1; Max-Age=0')
    assert.deepEqual(cookiesFrom(h), ['sv_session=abc', 'other=1'])
    assert.deepEqual(cookiesFrom(new Headers()), [])
  })
  test('updateJar replaces by name and removes cleared cookies', () => {
    const jar = updateJar(new Map(), ['a=1', 'b=2'])
    updateJar(jar, ['a=3', 'b='])
    assert.deepEqual([...jar.values()], ['a=3'])
  })
})

describe('listQuery / secret', () => {
  test('encodes bracketed list-query keys', () => {
    assert.equal(
      listQuery({ 'filter[method][eq]': 'card', 'page[size]': 2 }),
      'filter%5Bmethod%5D%5Beq%5D=card&page%5Bsize%5D=2',
    )
  })
  test('secrets are random and URL-safe', () => {
    const a = secret()
    assert.match(a, /^[A-Za-z0-9_-]{32}$/)
    assert.notEqual(a, secret())
  })
})
