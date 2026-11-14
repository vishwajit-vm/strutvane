// SPIKE STUB of the `node strut` command registry (spike 12 owns the real one). It implements the
// commands the installer calls (migrate --seed) plus dev/build/test/user:password/help (strut.js
// itself handles setup and the Docker services:* commands), so the installer's end-to-end test exercises a real project, real files and a real
// database.
//
// Exit codes: 0 ok, 1 failed, 3 database unreachable (the installer offers Retry / Skip for 3).
import { spawnSync } from 'node:child_process'
import { randomBytes, scryptSync } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'
import { createSchema, sqlValue } from './index.js'

const UNREACHABLE = 3

/** Read .env with Node's own parser (the same one as `node --env-file`). */
function readEnv(root) {
  const file = join(root, '.env')
  return existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}
}

/** A friendly failure: what went wrong and how to fix it. */
class CommandError extends Error {
  constructor(message, code = 1) {
    super(message)
    this.code = code
  }
}

/**
 * Credentials per role. PostgreSQL migrations run as the owner role, everything else as the app
 * role (NOSUPERUSER, NOBYPASSRLS), so row-level security applies to the app.
 */
function credentials(env, role) {
  if (role === 'migrate' && env.DB_MIGRATION_USERNAME) {
    return { user: env.DB_MIGRATION_USERNAME, password: env.DB_MIGRATION_PASSWORD }
  }
  return { user: env.DB_USERNAME, password: env.DB_PASSWORD }
}

/** Errors that mean "the server is not there (yet)" rather than "the SQL is wrong". */
const UNREACHABLE_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH', 'EAI_AGAIN', 'PROTOCOL_CONNECTION_LOST'])

/** Load a driver installed with the app, with a fix when it is missing. */
async function loadDriver(name) {
  try {
    return await import(name)
  } catch {
    throw new CommandError(`The ${name} package is not installed. Run: npm run setup`)
  }
}

/** A database handle: `exec(sql)` runs a statement, `column(sql)` returns the first column as strings. */
async function openDatabase(root, env, role) {
  const dialect = env.DB_CONNECTION
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
  const label = dialect === 'mysql' ? 'MySQL' : 'PostgreSQL'
  const { user, password } = credentials(env, role)
  const settings = { host: env.DB_HOST, port: Number(env.DB_PORT), user, password, database: env.DB_DATABASE }
  const unreachable = (error) =>
    new CommandError(
      `Cannot reach ${label} at ${env.DB_HOST}:${env.DB_PORT} (${error.code ?? error.message}). ` +
        'Start the database (Docker: node strut services:up), check DB_* in .env, then run: npm run setup',
      UNREACHABLE,
    )
  try {
    if (dialect === 'mysql') {
      const mysql = await loadDriver('mysql2/promise')
      const connection = await mysql.createConnection(settings)
      return {
        dialect,
        exec: async (sql) => void (await connection.query(sql)),
        column: async (sql) => (await connection.query(sql))[0].map((row) => String(Object.values(row)[0])),
        close: async () => connection.end(),
      }
    }
    const { default: pg } = await loadDriver('pg')
    const client = new pg.Client(settings)
    await client.connect()
    return {
      dialect,
      exec: async (sql) => void (await client.query(sql)),
      column: async (sql) => (await client.query(sql)).rows.map((row) => String(Object.values(row)[0])),
      close: async () => client.end(),
    }
  } catch (error) {
    if (error instanceof CommandError) throw error
    if (UNREACHABLE_CODES.has(error.code)) throw unreachable(error)
    throw new CommandError(`${label} refused the connection: ${error.message}. Check DB_USERNAME and DB_PASSWORD in .env.`)
  }
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
  if (['production', 'staging'].includes(env.APP_ENV)) {
    throw new CommandError(
      `Refusing to seed with APP_ENV=${env.APP_ENV}: seeded accounts are for development only. ` +
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

/** Serve the app on 127.0.0.1:APP_PORT until Ctrl+C. */
async function dev(root, env) {
  const { default: app } = await import(pathToFileURL(join(root, 'bootstrap', 'app.ts')).href)
  const port = Number(env.APP_PORT || 3000)
  const hosts = allowedHosts(env)
  const server = createServer(async (request, response) => {
    // A web page you visit could point its own domain at 127.0.0.1 (DNS rebinding); the Host
    // header then names that domain. Only answer our own names.
    const host = (request.headers.host ?? '').replace(/:\d+$/, '')
    if (!hosts.has(host)) {
      response.writeHead(403, { 'content-type': 'application/problem+json' })
      response.end(JSON.stringify({ title: 'Forbidden host', status: 403, detail: `Host "${host}" is not allowed in development.` }))
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
    // Loopback only on this computer; 0.0.0.0 inside the app container (compose publishes the
    // port on the host's 127.0.0.1 only), set by APP_HOST in docker/compose.yaml.
    server.listen(port, process.env.APP_HOST || '127.0.0.1', resolve)
  })
  process.stdout.write(`\n  ${env.APP_NAME}  development\n  App + API   http://localhost:${port}\n  Press Ctrl+C to stop\n`)
  await new Promise(() => {}) // run until the process is stopped
}

/** Spike only: the "production server" reuses the dev server. The real build bundles and runs `vite build`. */
function build(root) {
  mkdirSync(join(root, 'build'), { recursive: true })
  writeFileSync(
    join(root, 'build', 'server.js'),
    [
      "import { fileURLToPath } from 'node:url'",
      "const { run } = await import('@strutvane/framework/cli')",
      "process.exitCode = await run(['dev'], { root: fileURLToPath(new URL('..', import.meta.url)) })",
      '',
    ].join('\n'),
  )
  process.stdout.write('Built build/server.js (start it with: npm start)\n')
  return 0
}

const HELP = `Usage: node strut <command>

  dev                    Start the app (API + UI) on 127.0.0.1:APP_PORT
  build                  Build for production (then: npm start)
  migrate [--seed]       Run new migrations (and the seeders)
  db:seed                Run the seeders (development only)
  user:password <email>  Set a new one-time password and show it once
  test                   Run the tests
  setup                  Finish or repeat setup (what npm run setup calls)
  services:up / services:down / services:status
                         Docker mode: start / stop / list the containers (data is kept)
  help                   Show this list
`

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
      case 'db:seed':
        await withDatabase(root, env, 'app', (db) => seed(root, db, env))
        return 0
      case 'user:password':
        await resetPassword(root, env, rest[0])
        return 0
      case 'dev':
        await dev(root, env)
        return 0
      case 'build':
        return build(root)
      case 'test': {
        const result = spawnSync(process.execPath, ['--test', 'tests/**/*.test.ts'], { cwd: root, stdio: 'inherit' })
        return result.status ?? 1
      }
      default:
        process.stderr.write(`Unknown command "${command}". Run: node strut help\n`)
        return 1
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    return error instanceof CommandError ? error.code : 1
  }
}
