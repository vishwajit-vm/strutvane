/**
 * Your own database server without Docker (consistency rows 40-44), with faked programs: the
 * Docker-aware default of question 14, the recovery menu after a Docker problem, connection
 * details (defaults, empty passwords, DB_URL), and how setup reads `node strut db:prepare`.
 * The same flows run for real against MySQL, MariaDB and PostgreSQL in own-server.e2e.test.ts.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseEnv } from '../src/env-file.ts'
import { type InstallerEnvironment, main } from '../src/main.ts'
import { parseDatabaseUrl } from '../src/options.ts'
import { loadState } from '../src/setup-state.ts'
import { unreachableMessage } from '../src/steps/database.ts'
import { recoveryChoices } from '../src/steps/recovery.ts'
import { describeCall, fakeEnvironment, RECOMMENDED_ANSWERS, scriptedPrompter, tempFolder } from './helpers/fakes.ts'
import { fakePrograms, type ProgramOverrides } from './helpers/programs.ts'

async function create(argv: string[], overrides: ProgramOverrides = {}, extra: Partial<InstallerEnvironment> = {}) {
  const cwd = tempFolder()
  const world = fakePrograms(overrides)
  const run = fakeEnvironment({ cwd, argv: ['acme', ...argv], spawn: world.spawn, ...extra })
  const code = await main(run.environment)
  const directory = join(cwd, 'acme')
  return { code, directory, world, output: run.output, env: () => parseEnv(readFileSync(join(directory, '.env'), 'utf8')) }
}

const prepared = (report: object) => ({ output: `STRUT_DB_PREPARE ${JSON.stringify({ ok: true, created: [], sql: [], roles: 'none', warnings: [], ...report })}\n` })
const dockerDown: ProgramOverrides = { docker: (spec) => (spec.args[0] === 'info' ? { code: 1, output: 'Cannot connect to the Docker daemon' } : undefined) }

describe('question 14: Docker is the default only when it is running (never required)', () => {
  it('Docker not running: --yes sets up MySQL on your own server (127.0.0.1:3306, root), never Docker', async () => {
    const result = await create(['--yes', '--no-git'], dockerDown)
    expect(result.code).toBe(0)
    expect(result.world.calls.map(describeCall)).toEqual(['docker info', 'npm ci', 'strut db:prepare', 'strut migrate'])
    expect(result.env().get('DB_HOST')).toBe('127.0.0.1')
    expect(result.env().get('DB_USERNAME')).toBe('root')
    expect(result.env().get('DB_SSLMODE')).toBe('prefer')
    expect(existsSync(join(result.directory, 'docker'))).toBe(false)
    expect(result.output()).toMatch(/No database password: fine for XAMPP/)
  })

  it('interactive: the Docker question starts on "Without Docker" when Docker is not running', async () => {
    const { prompter, initials } = scriptedPrompter({ ...RECOMMENDED_ANSWERS, docker: 'host', dbHost: '', dbPort: '', dbName: '', dbUser: '', dbPassword: '', review: 'create', dev: false })
    const result = await create(['--no-git'], dockerDown, { interactiveTerminal: true, prompter })
    expect(result.code).toBe(0)
    expect(initials['docker']).toBe('host')
  })

  it('a server on another computer needs a password: CI stops before writing anything', async () => {
    const result = await create(['--yes', '--no-docker', '--db-host', 'db.example.com'])
    expect(result.code).toBe(1)
    expect(result.output()).toMatch(/a database server on another computer needs a password: set STRUT_DB_PASSWORD/)
    expect(existsSync(result.directory)).toBe(false)
  })

  it('interactive: an empty password for a remote host is asked again', async () => {
    const { prompter, infos } = scriptedPrompter({
      ...RECOMMENDED_ANSWERS, docker: 'host', dbHost: 'db.example.com', dbPort: '', dbName: '', dbUser: 'shop', dbPassword: ['', 'Shop-Pass-4711'], review: 'create', dev: false,
    })
    const result = await create(['--no-git'], {}, { interactiveTerminal: true, prompter })
    expect(result.code).toBe(0)
    expect(infos.join('\n')).toMatch(/another computer needs a password/)
    expect(result.env().get('DB_PASSWORD')).toBe('Shop-Pass-4711')
  })
})

describe('after a Docker problem: your own server first, then Docker, then SQLite', () => {
  it('offers the choices in that order', () => {
    for (const kind of ['docker-missing', 'docker-stopped'] as const) {
      expect(recoveryChoices(kind).map((choice) => choice.value)).toEqual(['own-server', 'start-docker', 'sqlite', 'retry', 'skip', 'stop'])
    }
    expect(recoveryChoices('database-connection').map((choice) => choice.value)).toEqual(['edit-connection', 'retry', 'skip', 'stop'])
  })

  it('"Use my own database server": asks the details, rewrites .env (password there only), installs, then checks the server', async () => {
    const { prompter } = scriptedPrompter({
      ...RECOMMENDED_ANSWERS, docker: 'docker', review: 'create', 'recover:database': 'own-server',
      dbHost: '', dbPort: '3307', dbName: '', dbUser: '', dbPassword: 'Xampp-Pass-4711', dev: false,
    })
    // Docker answers the first probe (so Docker mode is the default) but is stopped at setup time.
    const result = await create(['--no-git'], { docker: (spec, nth) => (spec.args[0] === 'info' && nth > 1 ? { code: 1, output: 'Cannot connect to the Docker daemon' } : undefined) }, {
      interactiveTerminal: true, prompter,
    })
    expect(result.code).toBe(0)
    const calls = result.world.calls.map(describeCall)
    expect(calls.slice(calls.indexOf('npm ci'))).toEqual(['npm ci', 'strut db:prepare', 'strut migrate'])
    const env = result.env()
    expect(env.get('DB_HOST')).toBe('127.0.0.1')
    expect(env.get('DB_PORT')).toBe('3307')
    expect(env.get('DB_USERNAME')).toBe('root')
    expect(env.get('DB_PASSWORD')).toBe('Xampp-Pass-4711')
    expect(env.get('COMPOSE_PROJECT_NAME')).toBeUndefined() // commented out
    expect(existsSync(join(result.directory, 'docker'))).toBe(false)
    expect(JSON.parse(readFileSync(join(result.directory, '.strutvane', 'env.json'), 'utf8')).mode).toBe('host')
    expect(JSON.parse(readFileSync(join(result.directory, 'strutvane.json'), 'utf8')).answers).toMatchObject({ docker: false, dbPort: 3307, dbUser: 'root' })
    for (const file of ['.env.example', 'strutvane.json', '.strutvane/setup.json']) expect(readFileSync(join(result.directory, file), 'utf8')).not.toContain('Xampp-Pass-4711')
    expect(result.output()).not.toContain('Xampp-Pass-4711')
  })
})

describe('setup reads `node strut db:prepare`', () => {
  const own = ['--yes', '--no-docker', '--no-git']

  it('MariaDB is detected: DB_CONNECTION=mariadb', async () => {
    const result = await create(own, { strut: (spec) => (spec.args.includes('db:prepare') ? prepared({ flavor: 'mariadb', version: '11.8.3-MariaDB' }) : undefined) })
    expect(result.code).toBe(0)
    expect(result.env().get('DB_CONNECTION')).toBe('mariadb')
    expect(result.output()).toMatch(/MariaDB 11\.8\.3 at 127\.0\.0\.1:3306/)
  })

  it('no right to create the database: the exact SQL, exit 2, migrate waits', async () => {
    const sql = "CREATE DATABASE `acme` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL PRIVILEGES ON `acme`.* TO 'lim'@'%';"
    const result = await create(own, { strut: (spec) => (spec.args.includes('db:prepare') ? prepared({ flavor: 'mysql', version: '8.4.6', sql: [sql] }) : undefined) })
    expect(result.code).toBe(2)
    expect(result.output()).toContain(sql)
    expect(loadState(result.directory).steps.database.status).toBe('failed')
    expect(loadState(result.directory).steps.migrate.status).toBe('pending')
  })

  it('a refused login is explained in plain words; interactive "Change the connection details" fixes it', async () => {
    let attempts = 0
    const { prompter } = scriptedPrompter({
      ...RECOMMENDED_ANSWERS, docker: 'host', dbHost: '', dbPort: '', dbName: '', dbUser: '', dbPassword: ['Wrong-Pass-0815', 'Right-Pass-4711'], review: 'create',
      'recover:database': 'edit-connection', dev: false,
    })
    const result = await create(['--no-git'], {
      strut: (spec) => {
        if (!spec.args.includes('db:prepare')) return undefined
        attempts += 1
        return attempts === 1
          ? { code: 4, output: 'STRUT_DB_PREPARE {"ok":false,"kind":"auth","message":"MySQL refused the login for user \\"root\\": wrong user name or password (DB_USERNAME / DB_PASSWORD in .env)."}\n' }
          : prepared({ flavor: 'mysql', version: '8.4.6' })
      },
    }, { interactiveTerminal: true, prompter })
    expect(result.code).toBe(0)
    expect(result.output()).toMatch(/refused the login for user "root"/)
    expect(result.env().get('DB_PASSWORD')).toBe('Right-Pass-4711')
    expect(result.output()).not.toMatch(/Wrong-Pass-0815|Right-Pass-4711/)
  })

  it('PostgreSQL: roles created by setup replace the administrator login in .env', async () => {
    const result = await create([...own, '--db', 'postgres'], { strut: (spec) => (spec.args.includes('db:prepare') ? prepared({ flavor: 'pgsql', version: '18.1', roles: 'created' }) : undefined) }, {
      env: { STRUT_DB_PASSWORD: 'Pg-Super-4711' },
    })
    expect(result.code).toBe(0)
    const prepare = result.world.calls.find((call) => call.args.includes('db:prepare'))
    expect(prepare?.env).toMatchObject({ STRUT_DB_OWNER: 'acme_owner', STRUT_DB_APP: 'acme_app' })
    expect(prepare?.redact).toEqual(expect.arrayContaining([prepare?.env?.['STRUT_DB_OWNER_PASSWORD'], 'Pg-Super-4711']))
    const env = result.env()
    expect(env.get('DB_CONNECTION')).toBe('pgsql')
    expect(env.get('DB_USERNAME')).toBe('acme_app')
    expect(env.get('DB_PASSWORD')).toBe(prepare?.env?.['STRUT_DB_APP_PASSWORD'])
    expect(env.get('DB_MIGRATION_USERNAME')).toBe('acme_owner')
  })

  it('PostgreSQL without CREATEROLE as a superuser: the role SQL and a loud RLS warning', async () => {
    const warning = 'You connect as "postgres", which is a superuser or may bypass row-level security: RLS does NOT protect your teams\' data with this login.'
    const result = await create([...own, '--db', 'postgres'], {
      strut: (spec) => (spec.args.includes('db:prepare') ? prepared({ flavor: 'pgsql', version: '18.1', roles: 'sql', sql: ['CREATE ROLE "acme_owner" ...'], warnings: [warning] }) : undefined),
    })
    expect(result.code).toBe(0)
    expect(result.output()).toContain('RLS does NOT protect')
    expect(result.output()).toMatch(/Create the owner and app roles/)
  })
})

describe('connection details', () => {
  it('DB_URL: parsed and checked, and a problem never repeats the URL or its password', () => {
    expect(parseDatabaseUrl('mysql://root:p%40ss@127.0.0.1:3307/shop?sslmode=require')).toEqual({
      database: 'mysql', host: '127.0.0.1', port: 3307, name: 'shop', user: 'root', password: 'p@ss', sslMode: 'require',
    })
    expect(parseDatabaseUrl('postgresql://app:x@db.example.com/shop')).toMatchObject({ database: 'postgres', port: 5432 })
    for (const bad of ['not a url Secret-1', 'http://root:Secret-1@h/db', 'mysql://root:Secret-1@h/', 'mysql://root:Secret-1@h/db?sslmode=maybe']) {
      const problem = parseDatabaseUrl(bad)
      expect(typeof problem).toBe('string')
      expect(String(problem)).not.toContain('Secret-1')
    }
  })

  it('CI: STRUT_DB_URL fills the connection; the URL lands in .env only, never in output or committed files', async () => {
    const url = 'mysql://root:Url-Pass-4711@127.0.0.1:3307/shop'
    const result = await create(['--yes', '--no-docker', '--no-git'], {}, { env: { STRUT_DB_URL: url } })
    expect(result.code).toBe(0)
    expect(result.env().get('DB_URL')).toBe(url)
    expect(result.env().get('DB_DATABASE')).toBe('shop')
    expect(result.output()).not.toContain('Url-Pass-4711')
    for (const file of ['.env.example', 'strutvane.json', '.strutvane/setup.json']) expect(readFileSync(join(result.directory, file), 'utf8')).not.toContain('Url-Pass-4711')
  })

  it('plain-language messages when nothing answers, with the MAMP port on a Mac', () => {
    expect(unreachableMessage('refused', 'MySQL', '127.0.0.1', 3306, 'darwin')).toMatch(/XAMPP, WAMP, MAMP or Laragon control panel.*MAMP the port is 8889/)
    expect(unreachableMessage('refused', 'MySQL', '127.0.0.1', 3306, 'win32')).not.toMatch(/8889/)
    expect(unreachableMessage('not-found', 'MySQL', 'db.exmaple.com', 3306, 'linux')).toMatch(/"db.exmaple.com" was not found/)
    expect(unreachableMessage('timeout', 'PostgreSQL', '10.0.0.9', 5432, 'linux')).toMatch(/firewall, a VPN/)
  })
})
