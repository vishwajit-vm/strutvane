import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { root } from './helpers.ts'

const run = promisify(execFile)
const rootPath = fileURLToPath(root)

/** Run the CLI; resolve with the exit code and output whatever the code. */
async function cli(args: readonly string[]): Promise<{ readonly code: number; readonly stdout: string; readonly stderr: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, ['src/cli/catalogue.ts', ...args], { cwd: rootPath })
    return { code: 0, stdout, stderr }
  } catch (error) {
    const failed = error as { code: number; stdout: string; stderr: string }
    return { code: failed.code, stdout: failed.stdout, stderr: failed.stderr }
  }
}

// Child processes are slow on a busy Windows machine; give them room.
describe('catalogue command', { timeout: 90_000 }, () => {
  const temp: string[] = []
  afterEach(async () => {
    await Promise.all(temp.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })
  const tempDir = async (): Promise<string> => {
    const dir = await mkdtemp(join(tmpdir(), 'catalogue-cli-'))
    temp.push(dir)
    return dir
  }

  it('build --offline --check: the committed catalogue.json is up to date', async () => {
    const result = await cli(['build', '--offline', '--check'])
    expect(result).toMatchObject({ code: 0 })
    expect(result.stdout).toMatch(/catalogue\.json is up to date \(\d+ packages, \d+ in history\)\./)
  })

  it('build --offline --check exits 2 on a stale index, and build --offline writes nothing on a broken source', async () => {
    const dir = await tempDir()
    const stale = join(dir, 'catalogue.json')
    await writeFile(stale, '{}\n')
    expect((await cli(['build', '--offline', '--check', '--out', stale])).code).toBe(2)

    const source = JSON.parse(await readFile(join(rootPath, 'source.json'), 'utf8')) as { packages: { status: string }[] }
    const first = source.packages[0]
    if (first !== undefined) first.status = 'released' // released without a release on npm
    const badSource = join(dir, 'source.json')
    await writeFile(badSource, JSON.stringify(source))
    const out = join(dir, 'out.json')
    const result = await cli(['build', '--offline', '--source', badSource, '--out', out])
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('has no release on npm')
    await expect(readFile(out, 'utf8')).rejects.toThrow()
  })

  it('check --offline reads the recorded snapshots and reports without a docs checkout', async () => {
    const result = await cli(['check', '--offline'])
    expect(result.stdout).toContain('docs check skipped')
    expect(result.stdout).toMatch(/Catalogue checks (passed|FAILED)/)
    expect([0, 1]).toContain(result.code)
  })

  it('check-manifest fails on a published secret and passes a clean block', async () => {
    const dir = await tempDir()
    const bad = join(dir, 'bad.json')
    await writeFile(bad, JSON.stringify({ name: '@strutvane/tags', version: '0.2.0', strutvane: { compat: '^0.2', token: `npm_${'a'.repeat(36)}` } }))
    const failed = await cli(['check-manifest', bad, '--framework', '0.2.0'])
    expect(failed.code).toBe(1)
    expect(failed.stdout).toContain('Never publish credentials')
    const good = join(dir, 'good.json')
    await writeFile(good, JSON.stringify({ name: '@strutvane/tags', version: '0.2.0', strutvane: { compat: '^0.2', commands: './dist/commands.mjs' } }))
    expect(await cli(['check-manifest', good, '--framework', '0.2.0'])).toMatchObject({ code: 0 })
  })

  it('exits 3 on bad arguments', async () => {
    expect((await cli(['frobnicate'])).code).toBe(3)
    expect((await cli(['build', '--nope'])).code).toBe(3)
    expect((await cli(['check-manifest'])).code).toBe(3)
  })
})
