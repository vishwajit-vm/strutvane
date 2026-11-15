// SPIKE STUB of the `node strut` command registry (spike 12 owns the real one). It implements the
// commands the installer calls (migrate --seed) plus dev/build/test/user:password/help (strut.js
// itself handles setup and the Docker services:* commands), so the installer's end-to-end test exercises a real project, real files and a real
// database.
//
// Exit codes: 0 ok, 1 failed, 3 database unreachable (the installer offers Retry / Skip for 3).
import { spawnSync } from 'node:child_process'
import { randomBytes, scryptSync } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'
import { connect, connectionSettings, DatabaseError, dialectOf, prepareDatabase } from './db.js'
import { createSchema, sqlValue } from './index.js'

const UNREACHABLE = 3

/**
 * The settings: real environment variables, with `.env` (read by Node's own parser, the same one
 * as `node --env-file`) on top when it exists. A production container has no `.env`: its host
 * passes everything as environment variables (ADR-0021), so they must count too.
 */
function readEnv(root) {
  const file = join(root, '.env')
  const fromFile = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}
  const fromProcess = Object.fromEntries(Object.entries(process.env).filter(([, value]) => typeof value === 'string'))
  return { ...fromProcess, ...fromFile }
}

/** A friendly failure: what went wrong and how to fix it. */
class CommandError extends Error {
  constructor(message, code = 1) {
    super(message)
    this.code = code
  }
}

/** A database handle: `exec(sql)` runs a statement, `column(sql)` returns the first column as strings. */
async function openDatabase(root, env, role) {
  const dialect = dialectOf(env.DB_CONNECTION)
  if (dialect === 'sqlite') {
    const { DatabaseSync } = await import('node:sqlite')
    const file = join(root, env.DB_DATABASE || 'database/database.sqlite')
    if (!existsSync(file)) {
      throw new CommandError(`The SQLite file ${file} does not exist. Run: npm run setup`, UNREACHABLE)
    }
    const db = new DatabaseSync(file)
    return {
      dialect,
      exec: async (sql) => void db.exec(sql),
      column: async (sql) => db.prepare(sql).all().map((row) => String(Object.values(row)[0])),
      close: async () => db.close(),
    }
  }
  // MySQL, MariaDB or PostgreSQL, in Docker or your own server (see db.js).
  return connect(connectionSettings(env, role))
}

/**
 * `node strut db:prepare [--json]`: what setup runs once against your own server (see db.js).
 * With --json the report is one line, `STRUT_DB_PREPARE {...}`, for the installer.
 */
async function dbPrepare(env, json) {
  const report = await prepareDatabase({ ...env, ...pick(process.env, ['STRUT_DB_OWNER', 'STRUT_DB_APP', 'STRUT_DB_OWNER_PASSWORD', 'STRUT_DB_APP_PASSWORD']) })
  if (json) {
    process.stdout.write(`STRUT_DB_PREPARE ${JSON.stringify(report)}\n`)
    return 0
  }
  process.stdout.write(`${report.flavor} ${report.version}: created ${report.created.join(', ') || 'nothing'}\n`)
  for (const line of report.sql) process.stdout.write(`  An administrator must run: ${line}\n`)
  for (const line of report.warnings) process.stdout.write(`  WARNING: ${line}\n`)
  return report.sql.length > 0 ? 2 : 0
}

/** Only these keys of an object (the role settings setup hands over in the environment). */
function pick(source, keys) {
  return Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]))
}

/** Run every migration in database/migrations that has not run yet, in file-name order. */
async function migrate(root, db) {
  await db.exec('CREATE TABLE IF NOT EXISTS strut_migrations (name VARCHAR(255) PRIMARY KEY, ran_at VARCHAR(40) NOT NULL)')
  const done = new Set(await db.column('SELECT name FROM strut_migrations'))
  const folder = join(root, 'database', 'migrations')
  const files = existsSync(folder) ? readdirSync(folder).filter((f) => f.endsWith('.ts')).sort() : []
  let ran = 0
  for (const file of files) {
    const name = file.replace(/\.ts$/, '')
    if (done.has(name)) continue
    const { default: definition } = await import(pathToFileURL(join(folder, file)).href)
    const schema = createSchema(db.dialect)
    await definition.up(schema)
    for (const statement of schema.statements) await db.exec(statement)
    await db.exec(`INSERT INTO strut_migrations (name, ran_at) VALUES (${sqlValue(name)}, ${sqlValue(new Date().toISOString())})`)
    process.stdout.write(`  ran  ${name}\n`)
    ran += 1
  }
  process.stdout.write(`Migrations run (${ran} new, ${done.size + ran} total)\n`)
}

/** scrypt hash with a random salt (the real auth package owns the format). */
function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url')
  return `scrypt$${salt}$${scryptSync(password, salt, 32).toString('base64url')}`
}

/** A readable one-time password like `q7Vd-3kPz-Xm2c-8RtL`. */
function readablePassword() {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const limit = 256 - (256 % alphabet.length)
  let text = ''
  while (text.length < 16) {
    const byte = randomBytes(1)[0]
    if (byte < limit) text += alphabet[byte % alphabet.length]
  }
  return text.match(/.{4}/g).join('-')
}

/** Seeding is for development: refuse anywhere that looks like a real deployment (security review F-18). */
function assertDevelopment(env) {
  // Either source saying production is enough: a deployment may set APP_ENV in its environment
  // while an old .env copied along still says "local".
  const deployed = [env.APP_ENV, process.env.APP_ENV].find((value) => ['production', 'staging'].includes(value))
  if (deployed !== undefined) {
    throw new CommandError(
      `Refusing to seed with APP_ENV=${deployed}: seeded accounts are for development only. ` +
        'Create a production admin with: node strut user:create --password-env',
    )
  }
}

/** Run database/seeders/database-seeder.ts with tiny, idempotent helpers. */
async function seed(root, db, env) {
  assertDevelopment(env)
  const file = join(root, 'database', 'seeders', 'database-seeder.ts')
  if (!existsSync(file)) return
  const { default: seeder } = await import(pathToFileURL(file).href)
  const verb = { sqlite: 'INSERT OR IGNORE', mysql: 'INSERT IGNORE', postgres: 'INSERT' }[db.dialect]
  const tail = db.dialect === 'postgres' ? ' ON CONFLICT DO NOTHING' : ''
  await seeder.run({
    env,
    insertOrIgnore: async (table, row) => {
      const columns = Object.keys(row).join(', ')
      const values = Object.values(row).map(sqlValue).join(', ')
      await db.exec(`${verb} INTO ${table} (${columns}) VALUES (${values})${tail}`)
    },
    // The first admin: created once, with a password that is never stored in .env. The installer
    // passes a fresh one through STRUT_SEED_ADMIN_PASSWORD (process environment only) and shows it
    // once; a manual run generates one and prints it once. Either way the account must change it
    // at the first sign-in.
    createAdminOnce: async ({ name, email }) => {
      if (!email) throw new CommandError('SEED_ADMIN_EMAIL is empty in .env. Set it, then run: node strut db:seed')
      if ((await db.column(`SELECT COUNT(*) FROM users WHERE email = ${sqlValue(email)}`))[0] !== '0') {
        process.stdout.write(`Admin exists: ${email} (password unchanged)\n`)
        return
      }
      const given = process.env.STRUT_SEED_ADMIN_PASSWORD
      const password = given || readablePassword()
      await db.exec(
        `INSERT INTO users (name, email, password, must_change_password) VALUES (${sqlValue(name)}, ${sqlValue(email)}, ${sqlValue(hashPassword(password))}, ${sqlValue(true)})`,
      )
      process.stdout.write(`Admin created: ${email}\n`)
      if (!given) process.stdout.write(`  One-time password (shown once, change it at first sign-in): ${password}\n`)
    },
  })
  process.stdout.write('Database seeded\n')
}

/** `node strut user:password <email>`: set a new one-time password and print it once. */
async function resetPassword(root, env, email) {
  if (!email) throw new CommandError('Usage: node strut user:password <email>')
  const db = await openDatabase(root, env, 'app')
  try {
    if ((await db.column(`SELECT COUNT(*) FROM users WHERE email = ${sqlValue(email)}`))[0] === '0') {
      throw new CommandError(`No user with the email ${email}.`)
    }
    const password = readablePassword()
    await db.exec(`UPDATE users SET password = ${sqlValue(hashPassword(password))}, must_change_password = ${sqlValue(true)} WHERE email = ${sqlValue(email)}`)
    process.stdout.write(`New one-time password for ${email} (shown once, change it at first sign-in): ${password}\n`)
  } finally {
    await db.close()
  }
}

/** Host names the dev server answers (DNS-rebinding defence, security review F-19). */
function allowedHosts(env) {
  const hosts = new Set(['localhost', '127.0.0.1', '[::1]'])
  try {
    hosts.add(new URL(env.APP_URL).hostname)
  } catch {}
  return hosts
}

/**
 * Serve the app on APP_HOST:APP_PORT until Ctrl+C or SIGTERM. APP_HOST is 127.0.0.1 unless set:
 * 0.0.0.0 inside a container (compose and the production Dockerfile set it; the host publishes
 * the port). On SIGTERM/SIGINT the server stops taking connections, finishes, and exits 0, so
 * `docker stop` takes a moment, not its 10-second kill timeout.
 */
async function serve(root, env, label) {
  const { default: app } = await import(pathToFileURL(join(root, 'bootstrap', 'app.ts')).href)
  const port = Number(env.APP_PORT || 3000)
  const hosts = allowedHosts(env)
  const server = createServer(async (request, response) => {
    // A web page you visit could point its own domain at 127.0.0.1 (DNS rebinding); the Host
    // header then names that domain. Only answer our own names (APP_URL's host in production).
    const host = (request.headers.host ?? '').replace(/:\d+$/, '')
    if (!hosts.has(host)) {
      response.writeHead(403, { 'content-type': 'application/problem+json' })
      response.end(JSON.stringify({ title: 'Forbidden host', status: 403, detail: `Host "${host}" is not allowed. Set APP_URL to the address people use.` }))
      return
    }
    const { status, body } = await app.handle(request.method, new URL(request.url, 'http://localhost').pathname)
    const html = typeof body === 'string'
    response.writeHead(status, { 'content-type': html ? 'text/html; charset=utf-8' : 'application/json' })
    response.end(html ? body : JSON.stringify(body))
  })
  await new Promise((resolve, reject) => {
    server.once('error', (error) =>
      reject(new CommandError(error.code === 'EADDRINUSE' ? `Port ${port} is in use. Change APP_PORT in .env.` : error.message)),
    )
    server.listen(port, env.APP_HOST || '127.0.0.1', resolve)
  })
  process.stdout.write(`\n  ${env.APP_NAME ?? 'app'}  ${label}\n  App + API   http://localhost:${port}\n  Press Ctrl+C to stop\n`)
  await new Promise((resolve) => {
    const stop = () => {
      server.close(() => resolve(undefined))
      server.closeIdleConnections()
      // Requests still running get a few seconds, then the rest are cut.
      setTimeout(() => server.closeAllConnections(), 5000).unref()
    }
    process.once('SIGTERM', stop)
    process.once('SIGINT', stop)
  })
  return 0
}

/** The app's runtime sources the production server loads (the real build bundles them). */
const RUNTIME_FOLDERS = ['bootstrap', 'app', 'routes', 'config']

/**
 * Spike only: the "production build" copies the runtime sources into build/ and writes a server
 * that serves them, so build/ (plus production dependencies) is all an image needs. The real
 * build bundles and runs `vite build`.
 */
function build(root) {
  const out = join(root, 'build')
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  for (const folder of RUNTIME_FOLDERS) {
    if (existsSync(join(root, folder))) cpSync(join(root, folder), join(out, folder), { recursive: true })
  }
  writeFileSync(
    join(out, 'server.js'),
    [
      '// Production server (spike build): serves the sources copied next to this file.',
      "import { fileURLToPath } from 'node:url'",
      "const { run } = await import('@strutvane/framework/cli')",
      "process.exitCode = await run(['serve'], { root: fileURLToPath(new URL('.', import.meta.url)) })",
      '',
    ].join('\n'),
  )
  process.stdout.write('Built build/ (start it with: npm start)\n')
  return 0
}

const HELP = `Usage: node strut <command>

  dev                    Start the app (API + UI) on 127.0.0.1:APP_PORT
  build                  Build for production (then: npm start)
  migrate [--seed]       Run new migrations (and the seeders)
  db:prepare             Check your own database server, create the databases (setup runs it)
  db:seed                Run the seeders (development only)
  user:password <email>  Set a new one-time password and show it once
  test                   Run the tests
  setup                  Finish or repeat setup (what npm run setup calls)
  services:up / services:down / services:status
                         Docker mode: start / stop / list the containers (data is kept)
  help                   Show this list

Coming with the framework (the spike's stand-in exits with code 2 and changes nothing):
  design:use <name>, token:create, docker:prod, add, install:<name>, user:create, make:model
`

/**
 * Commands the generated files and messages already mention, which the real framework brings.
 * The spike's stand-in says so clearly and exits non-zero (never a silent no-op that looks done).
 */
const COMING = {
  'design:use': 'switch the UI design package and update config/ui.ts',
  'token:create': 'create an API token',
  'docker:prod': 'write the production Dockerfile and .dockerignore',
  add: 'add a package from the catalogue',
  'user:create': 'create a user (a production admin: --password-env)',
  'make:model': 'generate a model, its migration and factory',
}

/** The friendly "not in this stand-in yet" answer, or undefined for a command that exists. */
function comingInFramework(command) {
  const what = command.startsWith('install:') ? `install the ${command.slice('install:'.length)} package and its settings` : COMING[command]
  if (what === undefined) return undefined
  return `node strut ${command} (${what}) comes with the Strutvane framework. This project uses the spike's stand-in, which does not have it yet: nothing was changed.`
}

/** Open the database for one role, run `work`, always close. */
async function withDatabase(root, env, role, work) {
  const db = await openDatabase(root, env, role)
  try {
    await work(db)
  } finally {
    await db.close()
  }
}

/** Entry point used by strut.js. Returns the exit code. */
export async function run(argv, { root }) {
  const [command = 'help', ...rest] = argv
  const env = readEnv(root)
  try {
    switch (command) {
      case 'help':
        process.stdout.write(HELP)
        return 0
      case 'migrate':
        await withDatabase(root, env, 'migrate', (db) => migrate(root, db))
        if (rest.includes('--seed')) await withDatabase(root, env, 'app', (db) => seed(root, db, env))
        return 0
      case 'db:prepare':
        return await dbPrepare(env, rest.includes('--json'))
      case 'db:seed':
        await withDatabase(root, env, 'app', (db) => seed(root, db, env))
        return 0
      case 'user:password':
        await resetPassword(root, env, rest[0])
        return 0
      case 'dev':
        return await serve(root, env, 'development')
      case 'serve':
        return await serve(root, env, process.env.NODE_ENV === 'production' ? 'production' : 'server')
      case 'build':
        return build(root)
      case 'test': {
        const result = spawnSync(process.execPath, ['--test', 'tests/**/*.test.ts'], { cwd: root, stdio: 'inherit' })
        return result.status ?? 1
      }
      default: {
        const coming = comingInFramework(command)
        process.stderr.write(coming === undefined ? `Unknown command "${command}". Run: node strut help\n` : `${coming}\n`)
        return coming === undefined ? 1 : 2
      }
    }
  } catch (error) {
    if (error instanceof DatabaseError && rest.includes('--json')) {
      process.stdout.write(`STRUT_DB_PREPARE ${JSON.stringify({ ok: false, kind: error.kind, message: error.message })}\n`)
    }
    process.stderr.write(`${error.message}\n`)
    return error instanceof CommandError || error instanceof DatabaseError ? error.code : 1
  }
}
