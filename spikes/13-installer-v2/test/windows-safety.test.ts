/**
 * Running programs safely: no shell, no .cmd shims, arguments arrive intact, PATH lookups never use
 * the current folder, npm found next to node, logs redacted, and real port probing.
 */
import { readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NpmNotFoundError, npmCliCandidates, resolveNpmCli } from '../src/npm-cli.ts'
import { isPortFree, pickFreePort } from '../src/ports.ts'
import { assertNoShellNeeded, nodeSpawner, redactValues, resolveExecutable } from '../src/spawn.ts'
import { installArgs } from '../src/steps/install.ts'
import { tempFolder } from './helpers/fakes.ts'

describe('no shell, no shims', () => {
  it('refuses .cmd, .bat and .ps1 programs with a friendly explanation', () => {
    for (const command of ['npm.cmd', 'C:\\x\\npx.CMD', 'build.bat', 'npm.ps1']) {
      expect(() => assertNoShellNeeded(command)).toThrow(/need a shell.*node <path to npm-cli.js>/)
    }
    expect(() => assertNoShellNeeded(process.execPath)).not.toThrow()
  })

  it('passes shell metacharacters and PowerShell-hostile text through unchanged', async () => {
    const tricky = ['a&b', 'echo|x', '100%PATH%', 'caret^here', 'with space', '"quoted"', "it's", 'title:string(120)', 'amount:decimal:12,2', '$HOME', '']
    const result = await nodeSpawner({
      command: process.execPath,
      args: ['-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))', ...tricky],
      cwd: process.cwd(),
    })
    expect(result.code).toBe(0)
    expect(JSON.parse(result.output)).toEqual(tricky)
  })

  it('reports a missing program as "not found" instead of throwing', async () => {
    const result = await nodeSpawner({ command: 'definitely-not-a-program-13', args: [], cwd: process.cwd() })
    expect(result).toMatchObject({ code: -1, notFound: true })
  })

  it('installs with npm ci --ignore-scripts (shipped lockfile), never running dependency scripts', () => {
    expect(installArgs(true)).toEqual(['ci', '--ignore-scripts', '--no-audit', '--no-fund'])
    expect(installArgs(false)[0]).toBe('install')
  })
})

describe('program lookup (security review F-25)', () => {
  it('walks only absolute PATH entries and only .exe/.com on Windows', () => {
    const present = new Set(['C:\\Git\\cmd\\git.exe', 'C:\\tools\\docker.cmd'])
    const exists = (path: string) => present.has(path)
    const path = '.;bin;C:\\tools;"C:\\Git\\cmd"'
    expect(resolveExecutable('git', path, 'win32', exists)).toBe('C:\\Git\\cmd\\git.exe')
    expect(resolveExecutable('docker', path, 'win32', exists)).toBeUndefined() // a .cmd is never picked
    expect(resolveExecutable('./local.exe', path, 'win32', exists)).toBe('./local.exe')
  })

  it('never resolves a program from the current folder', () => {
    const exists = (candidate: string) => candidate === 'git.exe' || candidate === '.\\git.exe' || candidate === 'C:\\real\\git.exe'
    expect(resolveExecutable('git', '.;C:\\real', 'win32', exists)).toBe('C:\\real\\git.exe')
    expect(resolveExecutable('git', ':relative:/usr/bin', 'linux', (c) => c === '/usr/bin/git')).toBe('/usr/bin/git')
  })
})

describe('npm-cli.js discovery', () => {
  it('prefers npm_execpath, maps npx-cli.js to npm-cli.js, ignores other package managers', () => {
    const node = join('C:', 'nodejs', 'node.exe')
    expect(npmCliCandidates({ npm_execpath: join('C:', 'n', 'npm-cli.js') }, node)[0]).toBe(join('C:', 'n', 'npm-cli.js'))
    expect(npmCliCandidates({ npm_execpath: join('C:', 'n', 'npx-cli.js') }, node)[0]).toBe(join('C:', 'n', 'npm-cli.js'))
    expect(npmCliCandidates({ npm_execpath: join('C:', 'p', 'pnpm.cjs') }, node)[0]).toBe(join('C:', 'nodejs', 'node_modules', 'npm', 'bin', 'npm-cli.js'))
  })

  it('finds the real npm next to this node, and explains when it is missing', () => {
    expect(resolveNpmCli({}, process.execPath)).toMatch(/npm-cli\.js$/)
    expect(() => resolveNpmCli({}, process.execPath, () => false)).toThrow(NpmNotFoundError)
    expect(() => resolveNpmCli({}, process.execPath, () => false)).toThrow(/Reinstall Node.js/)
  })
})

describe('setup log', () => {
  it('redacts secrets handed to a program from the log file', async () => {
    const logFile = join(tempFolder(), 'setup.log')
    await nodeSpawner({
      command: process.execPath,
      args: ['-e', 'console.log("password is " + process.env.SECRET)'],
      cwd: process.cwd(),
      env: { SECRET: 'Abcd-Efgh-Jkmn-Pqrs' },
      logFile,
      redact: ['Abcd-Efgh-Jkmn-Pqrs'],
    })
    const log = readFileSync(logFile, 'utf8')
    expect(log).toContain('password is [redacted]')
    expect(log).not.toContain('Abcd-Efgh-Jkmn-Pqrs')
    expect(redactValues('a abc', ['abc'])).toBe('a abc') // too short to redact meaningfully
  })
})

describe('ports', () => {
  it('sees a port that is in use and picks the next free one', async () => {
    const server = createServer()
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const busy = typeof address === 'object' && address !== null ? address.port : 0
    try {
      expect(await isPortFree(busy)).toBe(false)
      const probe = async (port: number) => port !== busy
      expect(await pickFreePort(busy, probe)).toBe(busy + 1)
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  it('explains when a whole range is busy', async () => {
    await expect(pickFreePort(5000, async () => false, 3)).rejects.toThrow(/Ports 5000 to 5002 are all in use/)
  })
})
