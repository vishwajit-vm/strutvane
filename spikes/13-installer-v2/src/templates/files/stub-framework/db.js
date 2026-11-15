// SPIKE STUB of the framework's database connection layer (spike 11 owns the real one): how the app
// reaches its database from .env, for every engine and both setups (Docker, or your own server:
// XAMPP, WAMP, MAMP, Laragon, Postgres.app, a local install, remote/cloud), plus `db:prepare`,
// which setup runs once against your own server.
//
// Rules:
// - DB_CONNECTION is mysql | mariadb | pgsql | sqlite ("postgres" is accepted as pgsql);
// - DB_URL, when set, wins over DB_HOST/DB_PORT/DB_DATABASE/DB_USERNAME/DB_PASSWORD;
// - DB_SOCKET replaces host:port; DB_SSLMODE is disable | prefer | require | verify-ca | verify-full
//   (prefer: TLS when the server offers it), DB_SSL_CA the CA file for verify-*;
// - a password is never printed: errors say what went wrong in plain words, never the value.
import { readFileSync } from 'node:fs'

/** Exit code of `node strut ...` when the database cannot be reached (the installer offers Retry). */
export const UNREACHABLE = 3

/** A friendly failure: what went wrong and how to fix it, plus a stable `kind` for the installer. */
export class DatabaseError extends Error {
  constructor(kind, message, code = 1) {
    super(message)
    this.kind = kind
    this.code = code
  }
}

/**
 * The engine family from DB_CONNECTION: 'mysql' (MySQL and MariaDB), 'postgres' or 'sqlite'.
 * MariaDB speaks the MySQL protocol; the real ORM grammar handles the few SQL differences.
 */
export function dialectOf(connection) {
  if (connection === 'mysql' || connection === 'mariadb') return 'mysql'
  if (connection === 'pgsql' || connection === 'postgres') return 'postgres'
  if (connection === 'sqlite') return 'sqlite'
  throw new DatabaseError('config', `DB_CONNECTION=${connection} is not one of: mysql, mariadb, pgsql, sqlite. Fix it in .env.`)
}

/** The parts of DB_URL (mysql://, mariadb://, postgres://, postgresql://), or undefined. */
function fromUrl(text) {
  if (!text) return undefined
  let url
  try {
    url = new URL(text)
  } catch {
    // Never echo the URL: it holds the password.
    throw new DatabaseError('config', 'DB_URL in .env is not a valid URL (for example mysql://user:password@127.0.0.1:3306/my_app).')
  }
  return {
    host: url.hostname,
    port: url.port === '' ? undefined : Number(url.port),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    sslmode: url.searchParams.get('sslmode') ?? undefined,
  }
}

/**
 * Connection settings for one role from .env. Roles: 'migrate' uses DB_MIGRATION_* when set
 * (PostgreSQL owner role), everything else the app user.
 */
export function connectionSettings(env, role) {
  const dialect = dialectOf(env.DB_CONNECTION)
  const url = fromUrl(env.DB_URL)
  const migrate = role === 'migrate' && env.DB_MIGRATION_USERNAME
  return {
    dialect,
    flavor: env.DB_CONNECTION === 'mariadb' ? 'mariadb' : dialect,
    host: url?.host || env.DB_HOST || '127.0.0.1',
    port: Number(url?.port ?? env.DB_PORT ?? (dialect === 'postgres' ? 5432 : 3306)),
    user: migrate ? env.DB_MIGRATION_USERNAME : (url?.user ?? env.DB_USERNAME),
    password: migrate ? (env.DB_MIGRATION_PASSWORD ?? '') : (url?.password ?? env.DB_PASSWORD ?? ''),
    database: url?.database || env.DB_DATABASE,
    socket: env.DB_SOCKET || undefined,
    sslmode: url?.sslmode ?? env.DB_SSLMODE ?? 'prefer',
    sslCa: env.DB_SSL_CA || undefined,
  }
}

/** Node TLS options for an sslmode (prefer is tried with TLS first, see connect()). */
function tlsOptions(settings) {
  if (settings.sslmode === 'disable') return false
  const ca = settings.sslCa ? readFileSync(settings.sslCa, 'utf8') : undefined
  if (settings.sslmode === 'verify-ca' || settings.sslmode === 'verify-full') {
    return {
      ...(ca ? { ca } : {}),
      rejectUnauthorized: true,
      // verify-ca checks the authority only; verify-full also the host name (Node's default).
      ...(settings.sslmode === 'verify-ca' ? { checkServerIdentity: () => undefined } : {}),
    }
  }
  // prefer / require: encrypt, without checking who signed the certificate (libpq's meaning).
  return { rejectUnauthorized: false }
}

/** Errors that mean "nothing answers" rather than "it answered no". */
const UNREACHABLE_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH', 'EAI_AGAIN', 'PROTOCOL_CONNECTION_LOST', 'ENOENT'])

/**
 * Turn a driver error into plain words with a stable kind. Never includes a password: driver
 * messages name the user and host at most.
 */
export function explainError(error, settings) {
  const label = settings.flavor === 'mariadb' ? 'MariaDB' : settings.dialect === 'postgres' ? 'PostgreSQL' : 'MySQL'
  const where = settings.socket ? `the socket ${settings.socket}` : `${settings.host}:${settings.port}`
  const code = error?.code ?? ''
  const message = String(error?.message ?? error)
  if (code === 'ECONNREFUSED' || code === 'ENOENT') {
    const mamp = process.platform === 'darwin' && settings.port === 3306 ? ' (MAMP uses port 8889: set DB_PORT=8889)' : ''
    // Docker mode: the database is the "db" service of this project's containers.
    if (settings.host === 'db') return new DatabaseError('refused', `${label} in Docker is not answering at ${where}. Start the containers: node strut services:up`, UNREACHABLE)
    return new DatabaseError('refused', `Nothing is listening at ${where}: is ${label} running? Start it in your XAMPP/WAMP/MAMP/Laragon control panel or as a service${mamp}.`, UNREACHABLE)
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return new DatabaseError('not-found', `The host name "${settings.host}" was not found. Check DB_HOST (or the host in DB_URL).`, UNREACHABLE)
  if (code === 'ETIMEDOUT' || code === 'EHOSTUNREACH' || /timeout/i.test(message)) {
    return new DatabaseError('timeout', `${label} at ${where} did not answer in time: a firewall, VPN or the wrong host?`, UNREACHABLE)
  }
  if (code === 'ER_ACCESS_DENIED_ERROR' || code === '28P01' || code === '28000' || /password authentication failed|access denied for user/i.test(message)) {
    return new DatabaseError('auth', `${label} refused the login for user "${settings.user}": wrong user name or password (DB_USERNAME / DB_PASSWORD in .env).`, 4)
  }
  if (code === 'ER_BAD_DB_ERROR' || code === '3D000') return new DatabaseError('bad-db', `The database "${settings.database}" does not exist on ${label} at ${where}. Run: npm run setup (it creates it).`, 5)
  if (/^HANDSHAKE_|SSL|TLS|certificate|self[- ]signed/i.test(`${code} ${message}`)) {
    return new DatabaseError('tls', `The encrypted (TLS) connection to ${label} failed: ${message.replace(/\s+/g, ' ').slice(0, 160)}. Check DB_SSLMODE and DB_SSL_CA, or use DB_SSLMODE=disable for a server on this computer.`, 6)
  }
  if (UNREACHABLE_CODES.has(code)) return new DatabaseError('refused', `Cannot reach ${label} at ${where} (${code}).`, UNREACHABLE)
  return new DatabaseError('other', `${label} said: ${message.replace(/\s+/g, ' ').slice(0, 200)}`, 1)
}

/** Load a driver installed with the app, with a fix when it is missing. */
async function loadDriver(name) {
  try {
    return await import(name)
  } catch {
    throw new DatabaseError('config', `The ${name} package is not installed. Run: npm run setup`)
  }
}

/** Is this a "the server has no TLS" refusal (then sslmode=prefer falls back to plain)? */
const noTlsOnServer = (error) => /does not support (ssl|secure)|server does not support ssl|HANDSHAKE_NO_SSL_SUPPORT/i.test(`${error?.code ?? ''} ${error?.message ?? ''}`)

/**
 * Open a connection. `database: null` connects to the server without a database (MySQL) or to
 * the maintenance database `postgres` (PostgreSQL), for db:prepare.
 */
export async function connect(settings, { database = settings.database } = {}) {
  const attempt = async (ssl) => {
    if (settings.dialect === 'mysql') {
      const mysql = await loadDriver('mysql2/promise')
      const connection = await mysql.createConnection({
        ...(settings.socket ? { socketPath: settings.socket } : { host: settings.host, port: settings.port }),
        user: settings.user,
        password: settings.password,
        ...(database ? { database } : {}),
        ...(ssl ? { ssl } : {}),
        connectTimeout: 5000,
      })
      return {
        dialect: 'mysql',
        exec: async (sql, params) => void (await connection.query(sql, params)),
        column: async (sql, params) => (await connection.query(sql, params))[0].map((row) => String(Object.values(row)[0])),
        close: async () => connection.end(),
      }
    }
    const { default: pg } = await loadDriver('pg')
    const client = new pg.Client({
      host: settings.socket ?? settings.host,
      port: settings.port,
      user: settings.user,
      password: settings.password,
      database: database ?? 'postgres',
      ssl,
      connectionTimeoutMillis: 5000,
    })
    try {
      await client.connect()
    } catch (error) {
      await client.end().catch(() => {})
      throw error
    }
    return {
      dialect: 'postgres',
      exec: async (sql, params) => void (await client.query(sql, params)),
      column: async (sql, params) => (await client.query(sql, params)).rows.map((row) => String(Object.values(row)[0])),
      close: async () => client.end(),
    }
  }
  const tls = settings.socket ? false : tlsOptions(settings)
  try {
    try {
      return await attempt(tls)
    } catch (error) {
      // sslmode=prefer: TLS when offered, plain otherwise (a fresh XAMPP MySQL has no TLS).
      if (settings.sslmode === 'prefer' && tls && noTlsOnServer(error)) return await attempt(false)
      throw error
    }
  } catch (error) {
    if (error instanceof DatabaseError) throw error
    throw explainError(error, settings)
  }
}

/** Quote an identifier (validated names only reach here; quoting is the second lock). */
const ident = (dialect, name) => (dialect === 'mysql' ? `\`${String(name).replace(/`/g, '``')}\`` : `"${String(name).replace(/"/g, '""')}"`)
/** Quote a string literal for the printed SQL. */
const literal = (value) => `'${String(value).replace(/'/g, "''")}'`

/** Permission refusals (create database, create role), per engine. */
const DENIED = /ER_DBACCESS_DENIED_ERROR|ER_SPECIFIC_ACCESS_DENIED|ER_ACCESS_DENIED|42501|permission denied|access denied/i
const isDenied = (error) => DENIED.test(`${error?.code ?? ''} ${error?.message ?? ''}`)

/**
 * `node strut db:prepare`: run once by setup against your own server. Logs in, tells MySQL from
 * MariaDB, creates the database and the test database when missing (or returns the exact SQL an
 * administrator must run), and on PostgreSQL creates the owner and app roles when allowed, so
 * row-level security applies to the app. Returns a report; throws DatabaseError on login problems.
 */
export async function prepareDatabase(env) {
  const settings = connectionSettings(env, 'app')
  const report = { ok: true, flavor: settings.dialect, version: '', created: [], sql: [], roles: 'none', superuser: false, warnings: [] }
  const names = [settings.database, env.DB_TEST_DATABASE].filter(Boolean)
  const server = await connect(settings, { database: null })
  try {
    report.version = (await server.column('SELECT VERSION()'))[0] ?? ''
    if (settings.dialect === 'mysql') {
      report.flavor = /mariadb/i.test(report.version) ? 'mariadb' : 'mysql'
      await prepareMysql(server, names, report)
    } else {
      report.flavor = 'pgsql'
      await preparePostgres(server, settings, names, env, report)
    }
  } finally {
    await server.close()
  }
  return report
}

async function prepareMysql(server, names, report) {
  const existing = new Set(await server.column('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA'))
  const account = (await server.column('SELECT CURRENT_USER()'))[0] ?? ''
  const [user, host = '%'] = account.split('@')
  for (const name of names) {
    if (existing.has(name)) continue
    const create = `CREATE DATABASE ${ident('mysql', name)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    try {
      await server.exec(create)
      report.created.push(name)
    } catch (error) {
      if (!isDenied(error)) throw explainError(error, { dialect: 'mysql', flavor: report.flavor, host: '', port: 0 })
      report.sql.push(`${create}; GRANT ALL PRIVILEGES ON ${ident('mysql', name)}.* TO ${literal(user)}@${literal(host)};`)
    }
  }
}

async function preparePostgres(server, settings, names, env, report) {
  const [me] = await queryRows(server, 'SELECT rolsuper, rolcreaterole, rolcreatedb, rolbypassrls FROM pg_roles WHERE rolname = current_user')
  report.superuser = me?.[0] === 'true' || me?.[3] === 'true'
  const canRoles = me?.[0] === 'true' || me?.[1] === 'true'
  const owner = env.STRUT_DB_OWNER
  const app = env.STRUT_DB_APP
  const wantRoles = Boolean(owner && app && env.STRUT_DB_OWNER_PASSWORD && env.STRUT_DB_APP_PASSWORD)
  const existing = new Set(await server.column('SELECT datname FROM pg_database'))
  if (wantRoles && canRoles) {
    for (const [role, password] of [[owner, env.STRUT_DB_OWNER_PASSWORD], [app, env.STRUT_DB_APP_PASSWORD]]) {
      const exists = (await server.column('SELECT COUNT(*) FROM pg_roles WHERE rolname = $1', [role]))[0] !== '0'
      // PASSWORD only takes a literal (no bind parameter): the value is a generated base64url
      // secret (no quotes possible), and literal() quoting is the second lock. ALTER on resume
      // keeps the role in step with the new password setup writes to .env.
      const verb = exists ? 'ALTER' : 'CREATE'
      await server.exec(`${verb} ROLE ${ident('postgres', role)} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD ${literal(password)}`)
    }
    if (me?.[0] !== 'true') await server.exec(`GRANT ${ident('postgres', owner)} TO CURRENT_USER`).catch(() => {})
    report.roles = 'created'
  } else if (wantRoles) {
    report.roles = 'sql'
    report.sql.push(
      `CREATE ROLE ${ident('postgres', owner)} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '<choose one>'; CREATE ROLE ${ident('postgres', app)} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '<choose one>';`,
    )
    if (report.superuser) {
      report.warnings.push(
        `You connect as "${settings.user}", which is a superuser or may bypass row-level security: RLS does NOT protect your teams' data with this login. Create the two roles above and put them in DB_USERNAME / DB_MIGRATION_USERNAME.`,
      )
    }
  }
  const dbOwner = report.roles === 'created' ? owner : settings.user
  for (const name of names) {
    if (!existing.has(name)) {
      const create = `CREATE DATABASE ${ident('postgres', name)} OWNER ${ident('postgres', dbOwner)}`
      try {
        await server.exec(create)
        report.created.push(name)
      } catch (error) {
        if (!isDenied(error)) throw explainError(error, settings)
        report.sql.push(`${create};`)
        continue
      }
    } else if (report.roles === 'created') {
      await server.exec(`ALTER DATABASE ${ident('postgres', name)} OWNER TO ${ident('postgres', owner)}`)
    }
    if (report.roles === 'created') await lockDownSchema({ ...settings, database: name }, owner, app)
  }
}

/** The same schema rules as the Docker init script: the owner owns public, the app only uses it. */
async function lockDownSchema(settings, owner, app) {
  const db = await connect(settings, { database: settings.database })
  try {
    const o = ident('postgres', owner)
    const a = ident('postgres', app)
    await db.exec(`ALTER SCHEMA public OWNER TO ${o}`)
    await db.exec('REVOKE ALL ON SCHEMA public FROM PUBLIC')
    await db.exec(`GRANT USAGE ON SCHEMA public TO ${a}`)
    await db.exec(`ALTER DEFAULT PRIVILEGES FOR ROLE ${o} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${a}`)
    await db.exec(`ALTER DEFAULT PRIVILEGES FOR ROLE ${o} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${a}`)
  } finally {
    await db.close()
  }
}

/** Rows as arrays of strings (PostgreSQL booleans read as 'true'/'false'). */
async function queryRows(db, sql) {
  const values = await db.column(`SELECT row_to_json(r)::text FROM (${sql}) r`)
  return values.map((text) => Object.values(JSON.parse(text)).map((value) => String(value)))
}
