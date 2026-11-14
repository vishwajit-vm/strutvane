/**
 * Real Docker smoke tests (skipped when Docker is not available): the installer runs in Docker
 * mode for real, so containers start, `npm ci`, migrations and seeding run INSIDE the app
 * container, and `node strut` on the host forwards into it.
 *
 * Isolation: every run uses a unique Compose project name (`s13-<kind>-<random>`), and cleanup
 * removes exactly that project's containers and volumes. Other stacks on this machine are never
 * touched (the names cannot collide, and nothing here lists or stops other projects).
 *
 * MySQL and PostgreSQL download their drivers (mysql2, pg) inside the container, so those two
 * also need the npm registry.
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { parseEnv } from '../src/env-file.ts'
import { tempFolder } from './helpers/fakes.ts'

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url))
const dockerWorks = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf8', timeout: 20_000 }).status === 0

/** Projects created here, removed in afterAll (only these). */
const created: { project: string; directory: string }[] = []
const children: ChildProcess[] = []

afterAll(() => {
  for (const child of children) child.kill()
  for (const { project, directory } of created) {
    const composeFile = join(directory, 'docker', 'compose.yaml')
    const args = existsSync(composeFile)
      ? ['compose', '-p', project, '--env-file', join(directory, '.env'), '-f', composeFile, 'down', '-v', '--remove-orphans', '--timeout', '2']
      : ['compose', '-p', project, 'down', '-v', '--remove-orphans', '--timeout', '2']
    spawnSync('docker', args, { encoding: 'utf8', timeout: 120_000 })
  }
}, 180_000)

/** A clean environment without the test runner's npm variables or git identity. */
function cleanEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (!/^(npm_|GIT_|CI$)/i.test(key)) env[key] = value
  }
  return env
}

/** Create a project in Docker mode and register it for cleanup. */
function createProject(kind: string, flags: string[]) {
  const root = tempFolder(`s13-${kind}-`)
  const project = `s13-${kind}-${Math.random().toString(36).slice(2, 8)}`
  const directory = join(root, project)
  created.push({ project, directory })
  const result = spawnSync(process.execPath, [CLI, project, '--yes', '--docker', '--no-git', ...flags], {
    cwd: root,
    env: cleanEnvironment(),
    encoding: 'utf8',
    timeout: 600_000,
  })
  const env = () => parseEnv(readFileSync(join(directory, '.env'), 'utf8'))
  return { code: result.status ?? -1, output: `${result.stdout}${result.stderr}`, project, directory, env }
}

/** `docker compose ... exec -T <service> <command>` for a created project. */
function execIn(created: { project: string; directory: string }, service: string, command: string[], env: Record<string, string> = {}) {
  const forwarded = Object.keys(env).flatMap((name) => ['-e', name])
  const result = spawnSync(
    'docker',
    ['compose', '-p', created.project, '--env-file', join(created.directory, '.env'), '-f', join(created.directory, 'docker', 'compose.yaml'), 'exec', '-T', ...forwarded, service, ...command],
    { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 60_000 },
  )
  return { code: result.status ?? -1, output: `${result.stdout}${result.stderr}`.trim() }
}

/** GET http://127.0.0.1:<port><path> with a Host header. */
function get(port: number, path: string, host = `localhost:${port}`): Promise<{ status: number; body: string }> {
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

/** Poll until `check` passes (the dev server needs a moment to start inside the container). */
async function eventually<T>(check: () => Promise<T>, timeoutMs = 30_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      return await check()
    } catch (error) {
      if (Date.now() > deadline) throw error
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
}

describe.skipIf(!dockerWorks)('real Docker mode (everything in containers)', () => {
  it('SQLite: app + Mailpit start, npm ci / migrate / seed run in the container, node strut forwards, npm run dev serves', async () => {
    const result = createProject('sqlite', ['--db', 'sqlite'])
    expect(result.code, result.output).toBe(0)
    expect(result.output).toMatch(/Containers running and healthy \(app, mailpit\)/)
    expect(result.output).toMatch(/Dependencies installed with npm/)
    expect(result.output).toMatch(/Admin created/)
    // node_modules lives in the named volume: on the host it is at most the empty mount point.
    const hostModules = join(result.directory, 'node_modules')
    expect(existsSync(hostModules) ? readdirSync(hostModules) : []).toEqual([])
    expect(existsSync(join(result.directory, 'database', 'database.sqlite'))).toBe(true)

    // node strut on the host runs inside the container.
    const help = spawnSync(process.execPath, ['strut.js', 'help'], { cwd: result.directory, encoding: 'utf8', timeout: 60_000 })
    expect(help.status, `${help.stdout}${help.stderr}`).toBe(0)
    expect(help.stdout).toMatch(/migrate \[--seed\]/)

    // npm run dev → node strut dev → docker compose exec app node strut dev, served on 127.0.0.1.
    const port = Number(result.env().get('APP_PORT'))
    const dev = spawn(process.execPath, ['strut.js', 'dev'], { cwd: result.directory, windowsHide: true })
    children.push(dev)
    const home = await eventually(() => get(port, '/'))
    expect(home.status).toBe(200)
    expect(home.body).toContain(result.project)
    expect((await get(port, '/', 'evil.example')).status).toBe(403)
    dev.kill()

    // The Mailpit inbox answers on the host's 127.0.0.1 only.
    const mail = await eventually(() => get(Number(result.env().get('FORWARD_MAILPIT_PORT')), '/'))
    expect(mail.status).toBe(200)
  }, 600_000)

  it('MySQL (the default): the database is healthy, migrated and seeded through mysql2 inside the container', () => {
    const result = createProject('mysql', [])
    expect(result.code, result.output).toBe(0)
    const env = result.env()
    const users = execIn(result, 'db', ['mysql', '-N', '-B', '-u', env.get('DB_USERNAME') ?? '', env.get('DB_DATABASE') ?? '', '-e', 'SELECT COUNT(*) FROM users'], {
      MYSQL_PWD: env.get('DB_PASSWORD') ?? '',
    })
    expect(users.output).toMatch(/^1$/m)
    const databases = execIn(result, 'db', ['mysql', '-N', '-B', '-u', env.get('DB_USERNAME') ?? '', '-e', 'SHOW DATABASES'], { MYSQL_PWD: env.get('DB_PASSWORD') ?? '' })
    expect(databases.output).toContain(env.get('DB_TEST_DATABASE') ?? 'missing')
  }, 600_000)

  it('PostgreSQL: the app role is not a superuser and cannot bypass row-level security', () => {
    const result = createProject('pg', ['--db', 'postgres'])
    expect(result.code, result.output).toBe(0)
    const env = result.env()
    const asApp = (sql: string) =>
      execIn(result, 'db', ['psql', '-h', '127.0.0.1', '-U', env.get('DB_USERNAME') ?? '', '-d', env.get('DB_DATABASE') ?? '', '-tAc', sql], {
        PGPASSWORD: env.get('DB_PASSWORD') ?? '',
      })
    expect(asApp('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user').output).toBe('f|f')
    expect(asApp("SELECT tableowner FROM pg_tables WHERE tablename = 'users'").output).toBe(env.get('DB_MIGRATION_USERNAME'))
    expect(asApp('SELECT COUNT(*) FROM users').output).toBe('1')
    expect(asApp(`SELECT datname FROM pg_database WHERE datname = '${env.get('DB_TEST_DATABASE') ?? ''}'`).output).toBe(env.get('DB_TEST_DATABASE'))
  }, 600_000)
})

describe.skipIf(dockerWorks)('real Docker mode', () => {
  it('is skipped: Docker is not available on this machine', () => {
    writeFileSync(join(tempFolder(), 'skipped.txt'), 'docker not available')
  })
})
