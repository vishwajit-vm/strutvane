/**
 * "Your own database server" for real (blueprint §2.1, consistency rows 40-44): MySQL 8.4,
 * MariaDB 11 and PostgreSQL 18 run in throw-away containers that only play the part of a server
 * the developer runs (XAMPP, WAMP, MAMP, Laragon, Postgres.app, a cloud database). The installer
 * itself runs WITHOUT Docker, pointed at them by host and port, exactly like a user would.
 *
 * Isolation: unique container names (`s13own-<kind>-<pid>-<random>`), ports chosen by Docker on
 * 127.0.0.1, everything removed in afterAll. Skipped when Docker is not available. The drivers
 * (mysql2, pg) are installed from the npm registry, like a real first run.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseEnv } from '../src/env-file.ts'
import { tempFolder } from './helpers/fakes.ts'

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url))
const dockerWorks = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf8', timeout: 20_000 }).status === 0
const suffix = `${process.pid.toString(36)}-${Math.random().toString(36).slice(2, 6)}`
const containers: string[] = []

const ROOT_PASSWORD = 'Root-Pass-4711'
const PG_PASSWORD = 'Pg-Super-4711'

/** Run docker and return its output (throws on failure, with the output). */
function docker(args: string[], timeout = 120_000): string {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout })
  if (result.status !== 0) throw new Error(`docker ${args.join(' ')} failed: ${result.stdout}${result.stderr}`)
  return result.stdout.trim()
}

/** Start a server container on a random 127.0.0.1 port; returns its name and host port. */
function startServer(kind: string, image: string, env: Record<string, string>, port: number): { name: string; port: number } {
  const name = `s13own-${kind}-${suffix}`
  containers.push(name)
  docker(['run', '-d', '--name', name, '-p', `127.0.0.1::${port}`, ...Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]), image])
  const mapped = docker(['port', name, `${port}/tcp`]).split('\n')[0] ?? ''
  return { name, port: Number(mapped.split(':').at(-1)) }
}

/** Wait until a command inside the container succeeds (the server accepts logins). */
function waitFor(name: string, command: string[], env: Record<string, string> = {}): void {
  const deadline = Date.now() + 180_000
  for (;;) {
    const result = spawnSync('docker', ['exec', ...Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]), name, ...command], { encoding: 'utf8', timeout: 20_000 })
    if (result.status === 0) return
    if (Date.now() > deadline) throw new Error(`${name} did not become ready: ${result.stdout}${result.stderr}`)
    spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 1500)'])
  }
}

/** A clean environment without the test runner's npm variables or git settings. */
function cleanEnvironment(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (!/^(npm_|GIT_|CI$|STRUT_)/i.test(key)) env[key] = value
  }
  return { ...env, ...extra }
}

/** Run the real installer without Docker against a server; returns code, output and the .env. */
function install(name: string, flags: string[], env: Record<string, string> = {}, root = tempFolder('s13own-')) {
  const result = spawnSync(
    process.execPath,
    [CLI, name, '--yes', '--no-docker', '--no-git', '--stack', 'api', '--auth', 'none', '--testing', 'none', '--no-agents', '--features', 'none', '--no-dev', ...flags],
    { cwd: root, env: cleanEnvironment(env), encoding: 'utf8', timeout: 600_000 },
  )
  const directory = join(root, name)
  return {
    code: result.status ?? -1,
    output: `${result.stdout}${result.stderr}`,
    directory,
    env: () => parseEnv(readFileSync(join(directory, '.env'), 'utf8')),
    resume: () => {
      const again = spawnSync(process.execPath, [CLI, '--resume', directory], { cwd: directory, env: cleanEnvironment(env), encoding: 'utf8', timeout: 600_000 })
      return { code: again.status ?? -1, output: `${again.stdout}${again.stderr}` }
    },
  }
}

afterAll(() => {
  for (const name of containers) spawnSync('docker', ['rm', '-f', '-v', name], { encoding: 'utf8', timeout: 120_000 })
}, 180_000)

describe.runIf(dockerWorks)('your own database server, without Docker mode (servers in throw-away containers)', () => {
  let mysql: { name: string; port: number }
  let mariadb: { name: string; port: number }
  let postgres: { name: string; port: number }

  beforeAll(() => {
    mysql = startServer('mysql', 'mysql:8.4', { MYSQL_ROOT_PASSWORD: ROOT_PASSWORD }, 3306)
    mariadb = startServer('mariadb', 'mariadb:11.4', { MARIADB_ALLOW_EMPTY_ROOT_PASSWORD: '1' }, 3306)
    postgres = startServer('pg', 'postgres:18-alpine', { POSTGRES_PASSWORD: PG_PASSWORD }, 5432)
    waitFor(mysql.name, ['mysql', '-h', '127.0.0.1', '-uroot', '-e', 'SELECT 1'], { MYSQL_PWD: ROOT_PASSWORD })
    waitFor(mariadb.name, ['mariadb', '-h', '127.0.0.1', '-uroot', '-e', 'SELECT 1'])
    waitFor(postgres.name, ['pg_isready', '-h', '127.0.0.1', '-U', 'postgres'])
    // A user that may log in but not create databases (a shared host, a locked-down server).
    docker(['exec', '-e', `MYSQL_PWD=${ROOT_PASSWORD}`, mysql.name, 'mysql', '-h', '127.0.0.1', '-uroot', '-e', "CREATE USER 'lim'@'%' IDENTIFIED BY 'Lim-Pass-4711'"])
  }, 400_000)

  const mysqlSql = (sql: string) => docker(['exec', '-e', `MYSQL_PWD=${ROOT_PASSWORD}`, mysql.name, 'mysql', '-h', '127.0.0.1', '-uroot', '-N', '-B', '-e', sql])

  it('MySQL: the database is missing, so setup creates it (and the test database), then migrates', () => {
    const run = install('own-mysql', ['--db', 'mysql', '--db-host', '127.0.0.1', '--db-port', String(mysql.port), '--db-user', 'root'], { STRUT_DB_PASSWORD: ROOT_PASSWORD })
    expect(run.code, run.output).toBe(0)
    expect(run.output).toMatch(/MySQL 8\.4\.\d+ at 127\.0\.0\.1:\d+; created own_mysql, own_mysql_test/)
    expect(run.env().get('DB_CONNECTION')).toBe('mysql')
    expect(mysqlSql("SHOW DATABASES LIKE 'own_mysql%'").split('\n').sort()).toEqual(['own_mysql', 'own_mysql_test'])
    expect(mysqlSql('SELECT COUNT(*) FROM own_mysql.strut_migrations')).toBe('1')
    expect(run.output).not.toContain(ROOT_PASSWORD)
  }, 600_000)

  it('MySQL: a wrong password stops with exit 2 and plain words, and the password is never shown', () => {
    const run = install('own-wrongpw', ['--db', 'mysql', '--db-host', '127.0.0.1', '--db-port', String(mysql.port), '--db-user', 'root'], { STRUT_DB_PASSWORD: 'Wrong-Pass-0815' })
    expect(run.code, run.output).toBe(2)
    expect(run.output).toMatch(/MySQL refused the login for user "root": wrong user name or password/)
    expect(run.output).not.toContain('Wrong-Pass-0815')
    expect(readFileSync(join(run.directory, '.strutvane', 'setup.json'), 'utf8')).not.toContain('Wrong-Pass-0815')
  }, 600_000)

  it('MySQL: no right to create databases: prints the exact SQL, exit 2; after an admin runs it, npm run setup finishes', () => {
    const run = install('own-limited', ['--db', 'mysql', '--db-host', '127.0.0.1', '--db-port', String(mysql.port), '--db-user', 'lim'], { STRUT_DB_PASSWORD: 'Lim-Pass-4711' })
    expect(run.code, run.output).toBe(2)
    const sql = run.output.split(/\r?\n/).filter((line) => line.includes('CREATE DATABASE')).map((line) => line.replace(/^[^C]*/, '').trim())
    expect(sql).toEqual([
      "CREATE DATABASE `own_limited` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL PRIVILEGES ON `own_limited`.* TO 'lim'@'%';",
      "CREATE DATABASE `own_limited_test` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL PRIVILEGES ON `own_limited_test`.* TO 'lim'@'%';",
    ])
    for (const line of sql) mysqlSql(line)
    const resumed = run.resume()
    expect(resumed.code, resumed.output).toBe(0)
    expect(mysqlSql('SELECT COUNT(*) FROM own_limited.strut_migrations')).toBe('1')
  }, 600_000)

  it('MariaDB: detected from the server version (DB_CONNECTION=mariadb); an empty local root password works, with a warning', () => {
    const run = install('own-maria', ['--db', 'mysql', '--db-host', '127.0.0.1', '--db-port', String(mariadb.port), '--db-user', 'root'])
    expect(run.code, run.output).toBe(0)
    expect(run.output).toMatch(/No database password: fine for XAMPP/)
    expect(run.output).toMatch(/MariaDB 11\.\d+\.\d+ at 127\.0\.0\.1/)
    expect(run.env().get('DB_CONNECTION')).toBe('mariadb')
  }, 600_000)

  it('DB_URL (STRUT_DB_URL): parsed, written to .env only, never echoed', () => {
    const url = `mysql://root:${ROOT_PASSWORD}@127.0.0.1:${mysql.port}/url_app`
    const run = install('own-url', ['--db', 'mysql'], { STRUT_DB_URL: url })
    expect(run.code, run.output).toBe(0)
    expect(run.env().get('DB_URL')).toBe(url)
    expect(run.env().get('DB_DATABASE')).toBe('url_app')
    expect(run.output).not.toContain(ROOT_PASSWORD)
    expect(readFileSync(join(run.directory, '.env.example'), 'utf8')).not.toContain(ROOT_PASSWORD)
    expect(readFileSync(join(run.directory, 'strutvane.json'), 'utf8')).not.toContain(ROOT_PASSWORD)
    expect(mysqlSql("SHOW DATABASES LIKE 'url_app'")).toBe('url_app')
  }, 600_000)

  it('PostgreSQL as superuser: creates an owner and a plain app role, so row-level security applies to the app', () => {
    const run = install('own-pg', ['--db', 'postgres', '--db-host', '127.0.0.1', '--db-port', String(postgres.port), '--db-user', 'postgres'], { STRUT_DB_PASSWORD: PG_PASSWORD })
    expect(run.code, run.output).toBe(0)
    const env = run.env()
    expect(env.get('DB_CONNECTION')).toBe('pgsql')
    expect(env.get('DB_USERNAME')).toBe('own_pg_app')
    expect(env.get('DB_MIGRATION_USERNAME')).toBe('own_pg_owner')
    expect(env.get('DB_PASSWORD')).not.toBe(PG_PASSWORD) // the superuser login is not kept
    const asApp = (sql: string) =>
      docker(['exec', '-e', `PGPASSWORD=${env.get('DB_PASSWORD') ?? ''}`, postgres.name, 'psql', '-h', '127.0.0.1', '-U', 'own_pg_app', '-d', 'own_pg', '-tAc', sql])
    expect(asApp('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user')).toBe('f|f')
    expect(asApp("SELECT tableowner FROM pg_tables WHERE tablename = 'strut_migrations'")).toBe('own_pg_owner')
    expect(asApp("SELECT datname FROM pg_database WHERE datname = 'own_pg_test'")).toBe('own_pg_test')
    expect(run.output).not.toContain(PG_PASSWORD)
  }, 600_000)
})
