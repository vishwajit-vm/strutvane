/**
 * The step runner: every failure the design names, its recovery, and resume with `--resume`
 * (what `npm run setup` runs). Programs are faked; the project files are real.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseEnv, setEnvValue } from '../src/env-file.ts'
import { type InstallerEnvironment, main } from '../src/main.ts'
import { CANCEL } from '../src/prompter.ts'
import { loadState } from '../src/setup-state.ts'
import { describeCall, fakeEnvironment, scriptedPrompter, tempFolder, RECOMMENDED_ANSWERS } from './helpers/fakes.ts'
import { fakePrograms, type ProgramOverrides } from './helpers/programs.ts'

/** Create `acme` with these flags and fake programs; returns everything a test needs. */
async function create(argv: string[], overrides: ProgramOverrides = {}, extra: Partial<InstallerEnvironment> = {}) {
  const cwd = tempFolder()
  const world = fakePrograms(overrides)
  const run = fakeEnvironment({ cwd, argv: ['acme', ...argv], spawn: world.spawn, ...extra })
  const code = await main(run.environment)
  const directory = join(cwd, 'acme')
  return { code, cwd, directory, world, output: run.output, env: () => parseEnv(readFileSync(join(directory, '.env'), 'utf8')) }
}

/** Run `--resume <dir>` with fresh fake programs. */
async function resume(directory: string, overrides: ProgramOverrides = {}, extra: Partial<InstallerEnvironment> = {}) {
  const world = fakePrograms(overrides)
  const run = fakeEnvironment({ cwd: directory, argv: ['--resume', directory], spawn: world.spawn, ...extra })
  const code = await main(run.environment)
  return { code, world, output: run.output }
}

const statusOf = (directory: string) => Object.fromEntries(Object.entries(loadState(directory).steps).map(([id, record]) => [id, record.status]))

describe('npm install failures', () => {
  it('retries a network error once by itself', async () => {
    const result = await create(['--yes', '--db', 'sqlite'], {
      npm: (_spec, nth) => (nth === 1 ? { code: 1, output: 'npm error code ECONNRESET' } : undefined),
    })
    expect(result.code).toBe(0)
    expect(result.output()).toMatch(/could not reach the registry\. .*Retrying once/)
    expect(result.world.calls.filter((call) => describeCall(call) === 'npm ci')).toHaveLength(2)
  })

  it('waits and retries once on a Windows file lock (EPERM)', async () => {
    const waits: number[] = []
    const result = await create(
      ['--yes', '--db', 'sqlite'],
      { npm: (_spec, nth) => (nth === 1 ? { code: 1, output: 'npm error code EPERM' } : undefined) },
      { sleep: async (ms) => void waits.push(ms) },
    )
    expect(result.code).toBe(0)
    expect(waits).toEqual([2000])
  })

  it('in CI: stops with exit 2, the log path and a hint; npm run setup resumes from install', async () => {
    const failing = await create(['--yes', '--db', 'sqlite'], { npm: () => ({ code: 1, output: 'npm error code E403\nnpm error 403 Forbidden' }) })
    expect(failing.code).toBe(2)
    expect(failing.output()).toMatch(/npm install failed \(exit code 1\)/)
    expect(failing.output()).toMatch(/npm config get registry.*Full log: .*setup-.*\.log/)
    expect(failing.output()).toContain('cd acme; npm run setup')
    // Without Docker npm runs first; the database step waits for it.
    expect(statusOf(failing.directory)).toMatchObject({ files: 'done', secrets: 'done', ports: 'done', database: 'pending', install: 'failed', migrate: 'pending', git: 'pending' })

    let probes = 0
    const resumed = await resume(failing.directory, {}, { isPortFree: async () => ++probes > 0 })
    expect(resumed.code).toBe(0)
    expect(probes).toBe(0) // the ports step was done: not run again
    expect(resumed.world.calls.map(describeCall)[0]).toBe('npm ci')
    expect(Object.values(statusOf(failing.directory)).every((status) => status === 'done')).toBe(true)
  })
})

describe('Docker failures', () => {
  it('Docker missing (interactive): "Continue without Docker (SQLite)" switches the project and the app still starts', async () => {
    const { prompter, asked } = scriptedPrompter({ ...RECOMMENDED_ANSWERS, database: 'mysql', docker: 'docker', 'recover:database': 'sqlite', review: 'create', dev: false })
    const result = await create(['--stack', 'full', '--ui', 'admin', '--design', 'vivid', '--auth', 'email', '--security', 'none', '--no-teams', '--testing', 'vitest', '--git'], {
      docker: () => ({ code: -1, notFound: true, output: 'spawn docker ENOENT' }),
    }, { interactiveTerminal: true, prompter })
    expect(result.code).toBe(0)
    expect(asked).toContain('database') // the default (MySQL) was asked and kept
    expect(result.output()).toMatch(/Docker is not installed/)
    const env = result.env()
    expect(env.get('DB_CONNECTION')).toBe('sqlite')
    expect(env.get('DB_HOST')).toBeUndefined() // commented out
    expect(readFileSync(join(result.directory, '.env'), 'utf8')).toMatch(/^# DB_HOST=db$/m)
    expect(parseEnv(readFileSync(join(result.directory, '.env.example'), 'utf8')).get('DB_CONNECTION')).toBe('sqlite')
    expect(existsSync(join(result.directory, 'docker'))).toBe(false)
    expect(existsSync(join(result.directory, 'database', 'database.sqlite'))).toBe(true)
    // The design flag survives the switch and lands in setup.json, so a resume keeps it.
    expect(loadState(result.directory).options).toMatchObject({ database: 'sqlite', docker: false, design: 'vivid' })
    // strut.js stops forwarding into a container, and install/migrate ran on this computer.
    expect(JSON.parse(readFileSync(join(result.directory, '.strutvane', 'env.json'), 'utf8')).mode).toBe('host')
    expect(env.get('MAIL_MAILER')).toBe('log')
    expect(result.world.calls.map(describeCall)).toContain('npm ci')
    expect(result.world.calls.map(describeCall)).not.toContain('app: npm ci')
  })

  it('Docker stopped (interactive): Retry after starting it', async () => {
    const interactive = await create(['--stack', 'api', '--auth', 'none', '--db', 'postgres', '--docker', '--testing', 'none', '--no-git'], {
      docker: (spec, nth) => (spec.args[0] === 'info' && nth === 2 ? { code: 1, output: 'Cannot connect to the Docker daemon' } : undefined),
    }, { interactiveTerminal: true, prompter: scriptedPrompter({ ...RECOMMENDED_ANSWERS, 'recover:database': 'retry', review: 'create', dev: false }).prompter })
    expect(interactive.code).toBe(0)
    expect(interactive.output()).toMatch(/Docker is installed but not running/)
    expect(interactive.output()).toMatch(/Start Docker Desktop/)
  })

  it('Docker stopped (CI): exit 2, database and migrate left for npm run setup', async () => {
    const result = await create(['--yes', '--docker'], { docker: (spec) => (spec.args[0] === 'info' ? { code: 1, output: 'error during connect' } : undefined) })
    expect(result.code).toBe(2)
    expect(statusOf(result.directory)).toMatchObject({ database: 'failed', migrate: 'pending' })
  })

  it('port taken at `compose up` time: moves only the port Docker names, then retries', async () => {
    let ups = 0
    const result = await create(['--yes'], {
      docker: (spec) =>
        spec.args.includes('up') && ++ups === 1 ? { code: 1, output: 'Bind for 127.0.0.1:3306 failed: port is already allocated' } : undefined,
    })
    expect(result.code).toBe(0)
    expect(result.env().get('FORWARD_DB_PORT')).toBe('3307')
    expect(result.env().get('APP_PORT')).toBe('3000') // not named by Docker: kept
    expect(result.output()).toMatch(/Port 3306 was taken by another program while the containers started; using 3307 instead \(try 2 of 5\)/)
  })

  // Regression (class: check-then-use port races). Several installers (or test runs) started at
  // the same moment all see the same ports free, then race for them at `compose up`. Each loser
  // must keep moving to fresh ports, never collide forever on the same "+1" port.
  it('concurrent installers: keeps retrying with fresh ports while Docker reports a taken port', async () => {
    let ups = 0
    const taken = ['Bind for 127.0.0.1:8025 failed: port is already allocated', 'Bind for 127.0.0.1:3000 failed: port is already allocated',
      'Error response from daemon: ports are not available: exposing port TCP 127.0.0.1:8026 -> 127.0.0.1:0: listen tcp4 127.0.0.1:8026: bind: Only one usage of each socket address']
    const result = await create(['--yes'], {
      docker: (spec) => (spec.args.includes('up') ? (ups++ < taken.length ? { code: 1, output: taken[ups - 1] ?? '' } : undefined) : undefined),
    })
    expect(result.code).toBe(0)
    expect(ups).toBe(4)
    expect(result.env().get('FORWARD_MAILPIT_PORT')).toBe('8027')
    expect(result.env().get('APP_PORT')).toBe('3001')
    expect(result.env().get('APP_URL')).toBe('http://localhost:3001')
    expect(result.env().get('FORWARD_DB_PORT')).toBe('3306')
  })

  it('concurrent installers: picks a random offset so two losers do not chase the same next port', async () => {
    let ups = 0
    const result = await create(['--yes'], {
      docker: (spec) => (spec.args.includes('up') && ++ups === 1 ? { code: 1, output: 'Bind for 127.0.0.1:3306 failed: port is already allocated' } : undefined),
    }, { random: () => 0.5 })
    expect(result.code).toBe(0)
    expect(result.env().get('FORWARD_DB_PORT')).toBe('3313') // 3306 + 1 + floor(0.5 * 12)
  })

  it('gives up after 5 tries with a message naming the port, and npm run setup can resume', async () => {
    const result = await create(['--yes'], {
      docker: (spec) => (spec.args.includes('up') ? { code: 1, output: 'Bind for 127.0.0.1:3306 failed: port is already allocated' } : undefined),
    })
    expect(result.code).toBe(2)
    expect(result.world.calls.filter((call) => call.args.includes('up'))).toHaveLength(5)
    expect(result.output()).toMatch(/still could not get a free port after 5 tries \(last taken: 127\.0\.0\.1:3306\)/)
    expect(statusOf(result.directory)).toMatchObject({ database: 'failed' })
  })

  it('busy ports are moved before anything starts', async () => {
    const result = await create(['--yes'], {}, { isPortFree: async (port) => port !== 3000 && port !== 3306 })
    expect(result.code).toBe(0)
    expect(result.env().get('APP_PORT')).toBe('3001')
    expect(result.env().get('APP_URL')).toBe('http://localhost:3001')
    expect(result.env().get('FORWARD_DB_PORT')).toBe('3307')
    expect(result.env().get('DB_PORT')).toBe('3306') // inside the container network nothing moves
    expect(result.output()).toMatch(/3000 in use, using 3001; 3306 in use, using 3307; 8025 free/)
  })
})

describe('migrate and git failures', () => {
  it('your own server unreachable (interactive): Skip; migrate waits for it; git still runs', async () => {
    const { prompter } = scriptedPrompter({ ...RECOMMENDED_ANSWERS, dbPassword: 'Hunter-77-pw', 'recover:database': 'skip', review: 'create', dev: false })
    const result = await create(
      // Port 1 never answers: a deterministic "server is down".
      ['--stack', 'api', '--auth', 'none', '--db', 'postgres', '--no-docker', '--db-host', '127.0.0.1', '--db-port', '1', '--db-name', 'shop', '--db-user', 'shop', '--testing', 'none', '--git'],
      {},
      { interactiveTerminal: true, prompter, probeServer: async () => 'refused' },
    )
    expect(result.code).toBe(2)
    expect(result.output()).toMatch(/Nothing is listening at 127.0.0.1:1, so PostgreSQL is not running there/)
    expect(result.output()).toMatch(/waiting for database/)
    expect(statusOf(result.directory)).toMatchObject({ database: 'skipped', migrate: 'pending', git: 'done' })
    expect(result.env().get('DB_PASSWORD')).toBe('Hunter-77-pw') // typed once, kept in .env only
    expect(readFileSync(join(result.directory, '.strutvane', 'setup.json'), 'utf8')).not.toContain('Hunter-77-pw')
  })

  it('database unreachable during migrate (CI): exit 2 with what to do', async () => {
    const result = await create(['--yes'], { strut: () => ({ code: 3, output: 'Cannot reach MySQL at db:3306 (ECONNREFUSED)' }) })
    expect(result.code).toBe(2)
    expect(result.output()).toMatch(/The database could not be reached[\s\S]*node strut services:up/)
    expect(statusOf(result.directory)).toMatchObject({ migrate: 'failed', git: 'pending' })
  })

  it('no git identity: exit 2 with the git config commands; resume commits', async () => {
    const failing = await create(['--yes', '--db', 'sqlite'], {
      git: (spec) => (spec.args[0] === 'commit' ? { code: 128, output: 'Author identity unknown\n*** Please tell me who you are.' } : undefined),
    })
    expect(failing.code).toBe(2)
    expect(failing.output()).toMatch(/git config --global user.name/)
    const resumed = await resume(failing.directory, {
      // The repository exists now (created by the first run).
      git: (spec) => (spec.args[0] === 'rev-parse' && spec.args[1] === '--show-toplevel' ? { output: `${failing.directory}\n` } : spec.args[0] === 'rev-parse' ? { code: 1 } : undefined),
    })
    expect(resumed.code).toBe(0)
    expect(resumed.world.calls.map(describeCall)).toEqual(['git --version', 'git rev-parse', 'git rev-parse', 'git check-ignore', 'git add', 'git diff', 'git commit'])
  })

  it('git not installed: skipped with the install hint', async () => {
    const result = await create(['--yes', '--db', 'sqlite'], { git: () => ({ code: -1, notFound: true }) })
    expect(result.code).toBe(2)
    expect(result.output()).toMatch(/git was not found: install it/)
  })

  it('never commits when .gitignore stops ignoring a secret path', async () => {
    const result = await create(['--yes', '--db', 'sqlite'], { git: (spec) => (spec.args[0] === 'check-ignore' ? { output: '.strutvane/setup.json\n' } : undefined) })
    expect(result.code).toBe(2)
    expect(result.output()).toMatch(/Nothing was committed: .gitignore does not ignore .env, .env.local/)
    expect(result.world.calls.some((call) => call.args[0] === 'commit')).toBe(false)
  })

  it('never commits when a forbidden file was staged, and unstages it', async () => {
    const result = await create(['--yes', '--db', 'sqlite'], { git: (spec) => (spec.args[0] === 'diff' ? { output: 'package.json\n.env\n' } : undefined) })
    expect(result.code).toBe(2)
    expect(result.output()).toMatch(/must never be committed: \.env/)
    expect(result.world.calls.map(describeCall)).toContain('git reset')
    expect(result.world.calls.some((call) => call.args[0] === 'commit')).toBe(false)
  })
})

describe('resume safety', () => {
  it('re-checks secrets instead of trusting setup.json (forged or edited state)', async () => {
    const done = await create(['--yes', '--db', 'sqlite'])
    expect(done.code).toBe(0)
    const envPath = join(done.directory, '.env')
    writeFileSync(envPath, setEnvValue(readFileSync(envPath, 'utf8'), 'APP_KEY', 'changeme'))
    const resumed = await resume(done.directory)
    expect(resumed.code).toBe(0)
    expect(resumed.output()).toMatch(/missing or too short in .env.*APP_KEY/)
    expect(done.env().get('APP_KEY')?.length).toBeGreaterThanOrEqual(43)
  })

  it('refuses a damaged setup.json with a fix', async () => {
    const done = await create(['--yes', '--db', 'sqlite'])
    writeFileSync(join(done.directory, '.strutvane', 'setup.json'), '{ not json')
    const resumed = await resume(done.directory)
    expect(resumed.code).toBe(1)
    expect(resumed.output()).toMatch(/is damaged \(not valid JSON\)\. Delete it and run: npm run setup/)
  })

  it('cancel during a recovery question stops with exit 2 (the project stays)', async () => {
    const { prompter } = scriptedPrompter({ ...RECOMMENDED_ANSWERS, docker: 'host', 'recover:install': CANCEL, review: 'create', dev: false })
    const result = await create(
      ['--stack', 'api', '--auth', 'none', '--db', 'sqlite', '--testing', 'none', '--no-git'],
      { npm: () => ({ code: 1, output: 'boom' }) },
      { interactiveTerminal: true, prompter },
    )
    expect(result.code).toBe(2)
    expect(existsSync(join(result.directory, 'package.json'))).toBe(true)
  })

  it('an unexpected error inside a step becomes a readable failure, not a crash', async () => {
    const result = await create(['--yes', '--db', 'sqlite'], { strut: () => { throw new Error('kaboom') } })
    expect(result.code).toBe(2)
    expect(result.output()).toMatch(/stopped unexpectedly: kaboom/)
  })
})

// Regression (class: a secret kept in memory only, lost across resume). A typed first-admin
// password is never saved, so `npm run setup` after a failed migrate silently generated a random
// one, ignored STRUT_ADMIN_PASSWORD, and the Ready box still said "the one you typed" (in CI the
// generated one is never shown: the admin was locked out without being told).
describe('resume with a typed first-admin password', () => {
  const TYPED = 'Typed-Admin-Pass-4711'
  const failMigrate = { strut: (spec: { args: readonly string[] }) => (spec.args.includes('migrate') ? { code: 3, output: 'Cannot reach MySQL' } : undefined) }

  async function failedCreate() {
    const result = await create(['--yes', '--db', 'sqlite', '--admin-password', 'type', '--no-git'], failMigrate, { env: { STRUT_ADMIN_PASSWORD: TYPED } })
    expect(result.code).toBe(2)
    return result
  }

  it('CI: takes STRUT_ADMIN_PASSWORD again and hands it to the seeder', async () => {
    const failing = await failedCreate()
    const resumed = await resume(failing.directory, {}, { env: { STRUT_ADMIN_PASSWORD: TYPED } })
    expect(resumed.code).toBe(0)
    const migrate = resumed.world.calls.find((call) => call.args.includes('migrate'))
    expect(migrate?.env).toEqual({ STRUT_SEED_ADMIN_PASSWORD: TYPED })
    expect(resumed.output()).toMatch(/Password\s+the one you typed/)
  })

  it('CI without it: says a one-time password is used instead, never claims the typed one', async () => {
    const failing = await failedCreate()
    const resumed = await resume(failing.directory)
    expect(resumed.code).toBe(0)
    expect(resumed.output()).toMatch(/no terminal and no STRUT_ADMIN_PASSWORD/)
    expect(resumed.output()).not.toMatch(/the one you typed/)
    expect(resumed.output()).toMatch(/Password\s+not shown here\. Set one with: node strut user:password/)
  })

  it('interactive: asks for it again (masked)', async () => {
    const failing = await failedCreate()
    const { prompter, prompts } = scriptedPrompter({ adminPassword: TYPED, dev: false })
    const resumed = await resume(failing.directory, {}, { interactiveTerminal: true, prompter })
    expect(resumed.code).toBe(0)
    expect(prompts.find((p) => p.id === 'adminPassword')?.kind).toBe('password')
    expect(resumed.world.calls.find((call) => call.args.includes('migrate'))?.env).toEqual({ STRUT_SEED_ADMIN_PASSWORD: TYPED })
    expect(resumed.output()).not.toContain(TYPED)
  })
})
