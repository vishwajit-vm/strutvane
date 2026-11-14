/**
 * The generated `strut.js` in Docker mode: on the host it forwards every command into the app
 * container (Sail-style); inside the container it runs the command itself. A fake `docker`
 * (a small .cjs file run by node; see STRUT_CONTAINER_CLI in strut.js) records what would have run.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { resolveOptions } from '../src/options.ts'
import { renderProject } from '../src/templates/project.ts'
import { writeProjectFiles } from '../src/write-files.ts'
import { tempFolder } from './helpers/fakes.ts'

/** A fake docker: logs its arguments, answers `compose ps` from FAKE_RUNNING, exits 0. */
const FAKE_DOCKER = `
const { appendFileSync } = require('node:fs')
const args = process.argv.slice(2)
appendFileSync(process.env.FAKE_LOG, JSON.stringify(args) + '\\n')
if (args.includes('ps') && args.includes('--services')) process.stdout.write(process.env.FAKE_RUNNING ?? '')
if (args.includes('exec')) process.exitCode = Number(process.env.FAKE_EXIT ?? 0)
`

let directory = ''
let fakeDocker = ''
let log = ''

beforeAll(async () => {
  const root = tempFolder('s13-fwd-')
  const options = resolveOptions({ name: 'fwd-app', docker: true, database: 'sqlite' }, root)
  directory = options.directory
  await writeProjectFiles(directory, renderProject(options))
  fakeDocker = join(root, 'fake-docker.cjs')
  writeFileSync(fakeDocker, FAKE_DOCKER)
  log = join(root, 'docker.log')
})

/** Run `node strut.js <args>` in the project with the fake docker. */
function strut(args: string[], env: Record<string, string> = {}) {
  writeFileSync(log, '')
  const result = spawnSync(process.execPath, ['strut.js', ...args], {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, STRUT_CONTAINER_CLI: fakeDocker, FAKE_LOG: log, FAKE_RUNNING: 'app\nmailpit\n', ...env },
  })
  const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as string[])
  return { code: result.status ?? -1, output: `${result.stdout}${result.stderr}`, calls }
}

describe('strut.js in Docker mode', () => {
  it('forwards a command into the running app container, scoped to this project', () => {
    // The fake is a .cjs file; strut.js runs .js/.mjs/.cjs test doubles with node.
    const result = strut(['migrate', '--seed', 'title:string(120)'])
    expect(result.code, result.output).toBe(0)
    const [ps, exec] = result.calls
    expect(ps?.slice(0, 2)).toEqual(['compose', '-p'])
    expect(ps?.[2]).toBe('fwd-app')
    expect(ps?.slice(-4)).toEqual(['ps', '--status', 'running', '--services'])
    // Not a terminal here, so -T; arguments arrive untouched (no shell anywhere).
    expect(exec?.slice(-8)).toEqual(['exec', '-T', 'app', 'node', 'strut', 'migrate', '--seed', 'title:string(120)'])
  })

  it('says how to start the containers when the app container is not running', () => {
    const result = strut(['dev'], { FAKE_RUNNING: 'mailpit\n' })
    expect(result.code).toBe(1)
    expect(result.output).toContain('The app container is not running. Start it with: node strut services:up')
    expect(result.calls).toHaveLength(1) // only the ps check, no exec
  })

  it('runs services:up / services:down on the host', () => {
    expect(strut(['services:up']).calls[0]?.slice(-5)).toEqual(['up', '-d', '--wait', '--wait-timeout', '180'])
    expect(strut(['services:down', '--volumes']).calls[0]?.slice(-2)).toEqual(['down', '-v'])
  })

  it('never forwards inside the container (STRUTVANE_IN_CONTAINER=1)', () => {
    const result = strut(['help'], { STRUTVANE_IN_CONTAINER: '1' })
    expect(result.calls).toHaveLength(0)
    // In this test there is no node_modules: proof that it tried to run here, not in a container.
    expect(result.output).toContain('Dependencies are not installed yet. Run: npm run setup')
  })

  it('runs setup on the host (it starts the containers itself)', () => {
    const result = strut(['setup'])
    expect(result.calls).toHaveLength(0)
    expect(result.output).toMatch(/No .strutvane\/setup.json found/)
  })

  it('refuses services:* without Docker, with a reason', () => {
    const envJson = join(directory, '.strutvane', 'env.json')
    const before = readFileSync(envJson, 'utf8')
    writeFileSync(envJson, JSON.stringify({ mode: 'host' }))
    try {
      const result = strut(['services:up'])
      expect(result.code).toBe(1)
      expect(result.output).toContain('This project runs without Docker')
    } finally {
      writeFileSync(envJson, before)
    }
  })
})

/** Arguments a shell would interpret. They must arrive untouched: there is no shell anywhere. */
const TRICKY = ['a&b', '$(touch pwned)', '; rm -rf /', '"quoted"', "it's", '%PATH%', '^caret', '|pipe', '`tick`']

describe('Sail-style pass-throughs: node strut npm|npx|node|shell', () => {
  it('npm run dev is node strut dev, and it is forwarded into the app container', () => {
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as { scripts: Record<string, string> }
    expect(manifest.scripts['dev']).toBe('node strut dev')
    expect(strut(['dev']).calls[1]?.slice(-5)).toEqual(['exec', '-T', 'app', 'node', 'strut', 'dev'].slice(-5))
  })

  it('Docker mode: npm, npx and node run inside the app container with their arguments verbatim', () => {
    expect(strut(['npm', 'install', 'left-pad']).calls[1]?.slice(-5)).toEqual(['-T', 'app', 'npm', 'install', 'left-pad'])
    expect(strut(['npx', 'vitest', 'run']).calls[1]?.slice(-5)).toEqual(['-T', 'app', 'npx', 'vitest', 'run'])
    const tricky = strut(['node', '-e', 'x', ...TRICKY])
    expect(tricky.calls[1]?.slice(-(TRICKY.length + 4))).toEqual(['app', 'node', '-e', 'x', ...TRICKY])
  })

  it('Docker mode: shell opens bash, or sh when the image has no bash (a fixed script, no user input)', () => {
    const exec = strut(['shell', 'ignored; rm -rf /']).calls[1] ?? []
    expect(exec.slice(-4)).toEqual(['app', 'sh', '-c', 'if command -v bash >/dev/null 2>&1; then exec bash; else exec sh; fi'])
    expect(exec.join(' ')).not.toContain('ignored')
  })

  it('Docker mode: the exit code comes back', () => {
    expect(strut(['npm', 'test'], { FAKE_EXIT: '7' }).code).toBe(7)
    expect(strut(['migrate'], { FAKE_EXIT: '3' }).code).toBe(3)
  })

  it('host mode: npm, npx and node run here (never in Docker), arguments verbatim, exit code passed through', () => {
    const envJson = join(directory, '.strutvane', 'env.json')
    const before = readFileSync(envJson, 'utf8')
    writeFileSync(envJson, JSON.stringify({ mode: 'host' }))
    try {
      const echo = strut(['node', '-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))', ...TRICKY])
      expect(echo.calls).toHaveLength(0)
      expect(echo.code).toBe(0)
      expect(JSON.parse(echo.output) as string[]).toEqual(TRICKY)
      expect(strut(['node', '-e', 'process.exit(7)']).code).toBe(7)
      const npm = strut(['npm', '--version'])
      expect(npm.code, npm.output).toBe(0)
      expect(npm.output.trim()).toMatch(/^\d+\.\d+\.\d+/)
      expect(npm.calls).toHaveLength(0)
    } finally {
      writeFileSync(envJson, before)
    }
  })

  it('inside the container the pass-throughs run right there (no forwarding loop)', () => {
    const result = strut(['node', '-e', 'process.stdout.write("inside")'], { STRUTVANE_IN_CONTAINER: '1' })
    expect(result.calls).toHaveLength(0)
    expect(result.output).toBe('inside')
  })
})
