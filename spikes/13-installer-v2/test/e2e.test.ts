/**
 * End to end, for real: the installer CLI runs in a temporary folder with real npm, real git, a
 * real SQLite database and the generated `node strut`. Dependencies are local stubs (`file:`),
 * so nothing is downloaded.
 *
 * The flow proves resume with a real failure: git has no identity on the first run (exit 2), then
 * `npm run setup` (real npm) finishes the job after the identity is set.
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { parseEnv } from '../src/env-file.ts'
import { resolveNpmCli } from '../src/npm-cli.ts'
import { isForbiddenInCommit } from '../src/steps/git.ts'
import { tempFolder } from './helpers/fakes.ts'

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url))
const NPM = resolveNpmCli(process.env, process.execPath)

/**
 * A clean environment: no npm_* variables from the test runner, no git identity, a private git
 * config file, and npm's network extras off.
 */
function cleanEnvironment(gitConfig: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(npm_|GIT_|EMAIL$|CI$)/i.test(key)) continue
    env[key] = value
  }
  return {
    ...env,
    GIT_CONFIG_GLOBAL: gitConfig,
    GIT_CONFIG_NOSYSTEM: '1',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_update_notifier: 'false',
    ...extra,
  }
}

/** Run a program to completion and return its exit code and output. */
function run(command: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv) {
  const result = spawnSync(command, [...args], { cwd, env, encoding: 'utf8', timeout: 120_000, windowsHide: true })
  return { code: result.status ?? -1, output: `${result.stdout}${result.stderr}` }
}

/** GET a path with a chosen Host header (fetch cannot set Host). */
function get(port: number, path: string, host: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, headers: { host } }, (res) => {
      let body = ''
      res.on('data', (chunk: Buffer) => {
        body += chunk.toString()
      })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

/** Start `node strut dev` and resolve once it prints its URL. */
function startDev(directory: string, env: NodeJS.ProcessEnv): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['strut.js', 'dev'], { cwd: directory, env, windowsHide: true })
    let output = ''
    const timer = setTimeout(() => reject(new Error(`dev did not start: ${output}`)), 20_000)
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString()
      if (output.includes('http://localhost:')) {
        clearTimeout(timer)
        resolve(child)
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
  })
}

const children: ChildProcess[] = []
afterAll(() => {
  for (const child of children) child.kill()
})

describe('real end-to-end run (SQLite, no Docker)', () => {
  const root = tempFolder('s13-e2e-')
  const gitConfig = join(root, 'gitconfig')
  const directory = join(root, 'acme-e2e')

  it('first run: creates, installs, migrates and seeds; stops at git (no identity) with exit 2', () => {
    // useConfigOnly makes "no identity" deterministic on every machine.
    writeFileSync(gitConfig, '[user]\n\tuseConfigOnly = true\n[commit]\n\tgpgsign = false\n[init]\n\tdefaultBranch = main\n')
    const result = run(process.execPath, [CLI, 'acme-e2e', '--yes', '--db', 'sqlite'], root, cleanEnvironment(gitConfig))
    expect(result.code, result.output).toBe(2)
    expect(result.output).toMatch(/Dependencies installed with npm/)
    expect(result.output).toMatch(/Migrations run \(3 new, 3 total\)/)
    expect(result.output).toMatch(/git config --global user.name/)
    expect(result.output).toContain('cd acme-e2e; npm run setup')

    const state = JSON.parse(readFileSync(join(directory, '.strutvane', 'setup.json'), 'utf8')) as { steps: Record<string, { status: string }> }
    expect(Object.fromEntries(Object.entries(state.steps).map(([id, step]) => [id, step.status]))).toEqual({
      files: 'done', secrets: 'done', ports: 'done', install: 'done', database: 'done', migrate: 'done', git: 'failed',
    })
    expect(existsSync(join(directory, 'node_modules', '@strutvane', 'framework', 'package.json'))).toBe(true)

    const env = parseEnv(readFileSync(join(directory, '.env'), 'utf8'))
    const example = parseEnv(readFileSync(join(directory, '.env.example'), 'utf8'))
    expect(env.get('APP_KEY')?.length).toBe(43)
    expect(example.get('APP_KEY')).toBe('')
    expect(example.get('AUTH_SECRET')).toBe('')
    expect(env.has('SEED_ADMIN_PASSWORD')).toBe(false) // never stored (security review F-18)

    const db = new DatabaseSync(join(directory, 'database', 'database.sqlite'))
    try {
      const admin = db.prepare('SELECT email, must_change_password AS mustChange, password FROM users').all()
      expect(admin).toHaveLength(1)
      expect(admin[0]).toMatchObject({ email: 'admin@acme-e2e.test', mustChange: 1 })
      expect(String(admin[0]?.['password'])).toMatch(/^scrypt\$/)
    } finally {
      db.close()
    }
  })

  it('npm run setup resumes at git and finishes (exit 0)', () => {
    writeFileSync(gitConfig, '[user]\n\tname = Spike Tester\n\temail = spike@example.test\n[commit]\n\tgpgsign = false\n')
    const result = run(process.execPath, [NPM, 'run', 'setup'], directory, cleanEnvironment(gitConfig))
    expect(result.code, result.output).toBe(0)
    expect(result.output).toMatch(/Git repository created \(main, 1 commit\)/)
    expect(result.output).not.toMatch(/Running migrations/) // done steps are not run again
  })

  it('dependency install scripts never run (the generated .npmrc), unless allowlisted', () => {
    // A dependency with an install script that would leave a CANARY file behind.
    const canary = join(directory, 'stubs', 'canary')
    spawnSync(process.execPath, ['-e', `require('fs').mkdirSync(${JSON.stringify(canary)}, { recursive: true })`])
    writeFileSync(
      join(canary, 'package.json'),
      JSON.stringify({
        name: 'canary',
        version: '1.0.0',
        scripts: { postinstall: "node -e \"require('fs').writeFileSync(require('path').join(process.env.INIT_CWD,'CANARY'),'ran')\"" },
      }),
    )
    const manifestPath = join(directory, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { dependencies: Record<string, string> }
    manifest.dependencies['canary'] = 'file:stubs/canary'
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

    const install = run(process.execPath, [NPM, 'install', '--no-audit', '--no-fund'], directory, cleanEnvironment(gitConfig))
    expect(install.code, install.output).toBe(0)
    expect(existsSync(join(directory, 'node_modules', 'canary', 'package.json'))).toBe(true)
    expect(existsSync(join(directory, 'CANARY'))).toBe(false)

    // Control: the script does run when explicitly allowed, so the check above is meaningful.
    const rebuild = run(process.execPath, [NPM, 'rebuild', 'canary', '--ignore-scripts=false'], directory, cleanEnvironment(gitConfig))
    expect(rebuild.code, rebuild.output).toBe(0)
    expect(existsSync(join(directory, 'CANARY'))).toBe(true)
  })

  it('the first commit holds no secrets, local data or installer state', () => {
    const env = cleanEnvironment(gitConfig)
    expect(run('git', ['rev-list', '--count', 'HEAD'], directory, env).output.trim()).toBe('1')
    const committed = run('git', ['ls-tree', '-r', '--name-only', 'HEAD'], directory, env).output.split(/\r?\n/).filter(Boolean)
    expect(committed).toContain('package-lock.json')
    expect(committed).not.toContain('CANARY')
    expect(committed).toContain('.env.example')
    expect(committed).toContain('strut.js')
    expect(committed.filter(isForbiddenInCommit)).toEqual([])
    expect(committed.some((path) => path.startsWith('node_modules/'))).toBe(false)
  })

  it('node strut works: help, test, and dev on 127.0.0.1 refusing foreign Host headers', async () => {
    const env = cleanEnvironment(gitConfig)
    expect(run(process.execPath, ['strut.js', 'help'], directory, env).output).toMatch(/migrate \[--seed\]/)
    const tests = run(process.execPath, ['strut.js', 'test'], directory, env)
    expect(tests.code, tests.output).toBe(0)

    const port = Number(parseEnv(readFileSync(join(directory, '.env'), 'utf8')).get('APP_PORT'))
    const dev = await startDev(directory, env)
    children.push(dev)
    const home = await get(port, '/', `localhost:${port}`)
    expect(home.status).toBe(200)
    expect(home.body).toContain('acme-e2e')
    expect((await get(port, '/api/v1/health', `127.0.0.1:${port}`)).body).toBe('{"status":"ok"}')
    // DNS rebinding defence (security review F-19).
    expect((await get(port, '/', 'evil.example')).status).toBe(403)
    dev.kill()
  })

  it('the setup log exists and holds no generated secret', () => {
    const logs = join(directory, '.strutvane', 'logs')
    const text = readdirSync(logs).map((name) => readFileSync(join(logs, name), 'utf8')).join('\n')
    expect(text).toMatch(/npm-cli\.js" ci --ignore-scripts/)
    const env = parseEnv(readFileSync(join(directory, '.env'), 'utf8'))
    for (const key of ['APP_KEY', 'AUTH_SECRET']) expect(text).not.toContain(env.get(key) ?? 'missing')
  })
})

describe('real run with Docker missing (CI mode)', () => {
  it('exits 2 with a friendly message, keeps the project, and leaves the rest for npm run setup', () => {
    const root = tempFolder('s13-nodocker-')
    const gitConfig = join(root, 'gitconfig')
    writeFileSync(gitConfig, '')
    const result = run(
      process.execPath,
      // --docker: asked for explicitly (without it, a missing Docker simply means "your own server").
      [CLI, 'acme-nodocker', '--yes', '--docker', '--no-git'],
      root,
      cleanEnvironment(gitConfig, { STRUT_CONTAINER_CLI: 'definitely-not-docker-13' }),
    )
    expect(result.code, result.output).toBe(2)
    expect(result.output).toMatch(/Docker is not installed/)
    expect(result.output).toMatch(/or set up without Docker: your own database server .* or SQLite/)
    const state = JSON.parse(readFileSync(join(root, 'acme-nodocker', '.strutvane', 'setup.json'), 'utf8')) as { steps: Record<string, { status: string }> }
    expect(state.steps['database']?.status).toBe('failed')
    expect(state.steps['install']?.status).toBe('pending') // npm runs in the container, which never started
    expect(state.steps['migrate']?.status).toBe('pending')
  })
})
