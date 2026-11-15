/**
 * Step "database": make the database (and, in Docker mode, every container) ready.
 *
 * - **Docker mode:** check the docker CLI, the engine and Compose v2; write the host user id on
 *   Linux; then `docker compose ... up -d --wait` starts app, database and Mailpit. `--wait`
 *   returns only when the health checks pass. For SQLite the file is also created.
 * - **SQLite without Docker:** create `database/database.sqlite` (an empty file is a valid empty
 *   database).
 * - **Your own MySQL/PostgreSQL:** a quick TCP check that something answers at DB_HOST:DB_PORT, so
 *   a wrong host or a stopped server is reported here, with Retry, instead of as a cryptic
 *   migration error.
 *
 * @module
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { join } from 'node:path'
import { commentOutEnvKey, parseEnv, setEnvValue } from '../env-file.ts'
import { DATABASE_LABELS } from '../options.ts'
import { pickFreePort } from '../ports.ts'
import { postgresRoles } from '../names.ts'
import { lastLines } from '../spawn.ts'
import { compose, composeArgs } from './compose.ts'
import { envValue, readEnvFile, writeEnvFile } from './env-io.ts'
import { failed, type Step, type StepContext, type StepOutcome } from './types.ts'

/** Output that means "the published port is taken" (Linux, macOS and Windows wordings). */
const PORT_TAKEN = /port is already allocated|address already in use|only one usage of each socket address|ports are not available/i

/**
 * The database step.
 *
 * @example
 * await databaseStep.run(context) // { status: 'done', message: 'Containers running and healthy (app, db, mailpit)' }
 */
export const databaseStep: Step = {
  id: 'database',
  title: 'Preparing the database',
  // Your own server is checked with the app's own driver, so npm installs first (see stepsFor).
  needs: (options) => (options.connection === undefined ? ['secrets', 'ports'] : ['secrets', 'ports', 'install']),
  applies: () => true,
  run: async (context) => {
    const { database, docker } = context.options
    if (docker) return startContainers(context)
    if (database === 'sqlite') return createSqliteFile(context)
    return prepareOwnServer(context)
  },
}

/** SQLite: create the file (and its folder) if it does not exist yet. */
function createSqliteFile(context: StepContext): StepOutcome {
  const relative = envValue(context.directory, 'DB_DATABASE') ?? 'database/database.sqlite'
  const file = join(context.directory, relative)
  mkdirSync(join(file, '..'), { recursive: true })
  if (!existsSync(file)) writeFileSync(file, '')
  return { status: 'done', message: `SQLite database ready (${relative})` }
}

/** What a quick TCP probe of your own server found. */
export type Reach = 'ok' | 'refused' | 'not-found' | 'timeout' | 'other'

/** Try a TCP connection (3 seconds at most) and say what happened. */
export function reach(host: string, port: number): Promise<Reach> {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ host, port })
    const finish = (result: Reach) => {
      socket.destroy()
      resolvePromise(result)
    }
    socket.setTimeout(3000, () => finish('timeout'))
    socket.once('connect', () => finish('ok'))
    socket.once('error', (error: NodeJS.ErrnoException) => {
      const code = error.code ?? ''
      finish(code === 'ECONNREFUSED' ? 'refused' : code === 'ENOTFOUND' || code === 'EAI_AGAIN' ? 'not-found' : code === 'ETIMEDOUT' || code === 'EHOSTUNREACH' ? 'timeout' : 'other')
    })
  })
}

/**
 * The plain-language message for an unreachable server, with the control panels people use.
 *
 * @example
 * unreachableMessage('refused', 'MySQL', '127.0.0.1', 3306, 'darwin') // '... MAMP uses port 8889 ...'
 */
export function unreachableMessage(result: Exclude<Reach, 'ok'>, label: string, host: string, port: number, platform: NodeJS.Platform): string {
  if (result === 'refused') {
    const mamp = platform === 'darwin' && port === 3306 && label !== 'PostgreSQL' ? ' On a Mac with MAMP the port is 8889.' : ''
    const panel = label === 'PostgreSQL' ? 'Start PostgreSQL (Postgres.app, or its service).' : 'Start MySQL/MariaDB in your XAMPP, WAMP, MAMP or Laragon control panel (or its service).'
    return `Nothing is listening at ${host}:${port}, so ${label} is not running there. ${panel}${mamp}`
  }
  if (result === 'not-found') return `The host name "${host}" was not found. Check the database host.`
  if (result === 'timeout') return `${label} at ${host}:${port} did not answer within 3 seconds: a firewall, a VPN, or the wrong host?`
  return `${label} at ${host}:${port} could not be reached.`
}

/** One line of `node strut db:prepare --json` output. */
interface PrepareReport {
  readonly ok: boolean
  readonly kind?: string
  readonly message?: string
  readonly flavor?: 'mysql' | 'mariadb' | 'pgsql'
  readonly version?: string
  readonly created?: readonly string[]
  readonly sql?: readonly string[]
  readonly roles?: 'none' | 'created' | 'sql'
  readonly superuser?: boolean
  readonly warnings?: readonly string[]
}

/** Read the report line the app's `db:prepare --json` prints (or undefined when there is none). */
function readReport(output: string): PrepareReport | undefined {
  const line = output.split(/\r?\n/).find((candidate) => candidate.startsWith('STRUT_DB_PREPARE '))
  if (line === undefined) return undefined
  try {
    const parsed: unknown = JSON.parse(line.slice('STRUT_DB_PREPARE '.length))
    return typeof parsed === 'object' && parsed !== null ? (parsed as PrepareReport) : undefined
  } catch {
    return undefined
  }
}

/**
 * Your own server (XAMPP, WAMP, MAMP, Laragon, Postgres.app, a local install, remote/cloud):
 * 1. a quick TCP probe, so "not running" is said in plain words before any driver runs;
 * 2. `node strut db:prepare --json` with the app's own driver: logs in, tells MySQL from MariaDB,
 *    creates the database and the test database when allowed (or returns the exact SQL), and on
 *    PostgreSQL creates the owner and app roles when allowed (their passwords go to .env only);
 * 3. writes what it learned to .env: `DB_CONNECTION=mariadb`, the role logins.
 */
async function prepareOwnServer(context: StepContext): Promise<StepOutcome> {
  const env = parseEnv(readEnvFile(context.directory))
  const label = DATABASE_LABELS[context.options.database]
  const host = context.options.connection?.host ?? '127.0.0.1'
  const port = context.options.connection?.port ?? 0
  const viaSocket = (env.get('DB_SOCKET') ?? '') !== '' || (env.get('DB_URL') ?? '') !== ''
  if (!viaSocket) {
    const result = await (context.probeServer ?? reach)(host, port)
    if (result !== 'ok') {
      return failed('database-connection', unreachableMessage(result, label, host, port, process.platform), 'Fix it (or change the connection details), then choose Retry. Later: npm run setup.')
    }
  }
  const roles = context.options.database === 'postgres' ? postgresRoles(context.options.name) : undefined
  const passwords = roles === undefined ? undefined : { owner: context.generateSecret(), app: context.generateSecret() }
  const childEnv: Record<string, string> =
    roles === undefined || passwords === undefined
      ? {}
      : { STRUT_DB_OWNER: roles.owner, STRUT_DB_APP: roles.app, STRUT_DB_OWNER_PASSWORD: passwords.owner, STRUT_DB_APP_PASSWORD: passwords.app }
  const run = await context.spawn({
    command: context.execPath,
    args: ['strut.js', 'db:prepare', '--json'],
    cwd: context.directory,
    env: childEnv,
    logFile: context.logFile,
    redact: [passwords?.owner ?? '', passwords?.app ?? '', env.get('DB_PASSWORD') ?? '', env.get('DB_URL') ?? ''],
  })
  const report = readReport(run.output)
  if (report === undefined) {
    return failed('command-failed', `node strut db:prepare failed (exit code ${run.code}).`, `Full log: ${context.logFile}. Then run: npm run setup`, lastLines(run.output, 8))
  }
  if (!report.ok) {
    const message = report.message ?? `${label} refused the connection.`
    const kind = report.kind === 'other' || report.kind === 'config' ? 'command-failed' : 'database-connection'
    return failed(kind, message, 'Change the connection details (or fix the server), then choose Retry. Later: npm run setup.')
  }
  let text = readEnvFile(context.directory)
  if (report.flavor === 'mariadb') text = setEnvValue(text, 'DB_CONNECTION', 'mariadb')
  if (report.roles === 'created' && roles !== undefined && passwords !== undefined) {
    // From now on the app logs in as the plain app role and migrations as the owner, so row-level
    // security applies; the administrator login you typed is no longer kept.
    text = setEnvValue(text, 'DB_USERNAME', roles.app)
    text = setEnvValue(text, 'DB_PASSWORD', passwords.app)
    text = setEnvValue(text, 'DB_MIGRATION_USERNAME', roles.owner)
    text = setEnvValue(text, 'DB_MIGRATION_PASSWORD', passwords.owner)
    text = commentOutEnvKey(text, 'DB_URL')
  }
  writeEnvFile(context.directory, '.env', text)
  for (const warning of report.warnings ?? []) context.reporter.warn(warning)
  const flavor = report.flavor === 'mariadb' ? 'MariaDB' : label
  if ((report.sql ?? []).length > 0 && report.roles !== 'sql') {
    return failed(
      'database-sql',
      `Your database user may not create the database. An administrator must run this once (for example in phpMyAdmin, HeidiSQL or psql):`,
      'Then run: npm run setup',
      report.sql,
    )
  }
  if (report.roles === 'sql') {
    context.reporter.warn(`Create the owner and app roles so row-level security applies (run as an administrator): ${(report.sql ?? []).join(' ')}`)
  }
  const created = (report.created ?? []).length > 0 ? `; created ${(report.created ?? []).join(', ')}` : ''
  const roleNote = report.roles === 'created' ? '; app and owner roles ready (row-level security applies)' : ''
  const version = (report.version ?? '').split('-')[0] ?? ''
  return { status: 'done', message: `${flavor} ${version} at ${viaSocket ? 'your server' : `${host}:${port}`}${created}${roleNote}` }
}

/** How many times `compose up` is tried while Docker keeps reporting a taken port. */
export const MAX_PORT_ATTEMPTS = 5

/**
 * A moved port lands 1 to 12 above the taken one, at random. Why random: installers (or test
 * runs) started at the same moment all lose the same port, and with a fixed "+1" they would all
 * race for the same next port again.
 */
const PORT_SPREAD = 12

/** The host ports Docker mode publishes, as `.env` keys. */
const PUBLISHED_PORT_KEYS = ['APP_PORT', 'FORWARD_DB_PORT', 'FORWARD_MAILPIT_PORT'] as const

/**
 * The host ports Docker says are taken, read from its error text ("Bind for 127.0.0.1:3306 failed",
 * "exposing port TCP 127.0.0.1:3306 -> ...", "listen tcp4 127.0.0.1:3306: bind: ..."). Empty when
 * the output names none (then every published port is moved).
 *
 * @example
 * takenPorts('Bind for 127.0.0.1:3306 failed: port is already allocated') // [3306]
 */
export function takenPorts(output: string): number[] {
  const ports = new Set<number>()
  for (const line of output.split(/\r?\n/)) {
    if (!PORT_TAKEN.test(line)) continue
    for (const match of line.matchAll(/(?:127\.0\.0\.1|0\.0\.0\.0|\[::1?\]|localhost):(\d{1,5})\b/g)) {
      const port = Number(match[1])
      if (port > 0 && port <= 65535) ports.add(port)
    }
  }
  return [...ports]
}

/** Docker mode: check the tools, then start every service and wait until they are healthy. */
async function startContainers(context: StepContext): Promise<StepOutcome> {
  const problem = await checkDocker(context)
  if (problem !== undefined) return problem
  writeHostUser(context)
  if (context.options.database === 'sqlite') createSqliteFile(context)
  // The ports step checked the ports a moment ago, but another program (or another installer
  // started at the same time) can take one before Docker binds it. Each time Docker names a taken
  // port, move just that one to a fresh free port and try again, a few times.
  let result = await compose(context, ['up', '-d', '--wait', '--wait-timeout', '180'])
  let lastTaken = ''
  for (let attempt = 2; attempt <= MAX_PORT_ATTEMPTS && result.code !== 0 && PORT_TAKEN.test(result.output); attempt += 1) {
    const moved = await movePublishedPorts(context, takenPorts(result.output))
    lastTaken = moved.map((move) => `127.0.0.1:${move.from}`).join(', ')
    for (const move of moved) {
      context.reporter.warn(
        `Port ${move.from} was taken by another program while the containers started; using ${move.to} instead (try ${attempt} of ${MAX_PORT_ATTEMPTS}).`,
      )
    }
    result = await compose(context, ['up', '-d', '--wait', '--wait-timeout', '180'])
  }
  if (result.code !== 0 && PORT_TAKEN.test(result.output)) {
    const named = takenPorts(result.output).map((port) => `127.0.0.1:${port}`).join(', ') || lastTaken
    return failed(
      'command-failed',
      `The containers still could not get a free port after ${MAX_PORT_ATTEMPTS} tries (last taken: ${named}).`,
      `Another program keeps taking these ports. Stop it, or set APP_PORT / FORWARD_DB_PORT / FORWARD_MAILPIT_PORT in .env, then run: npm run setup  (full log: ${context.logFile})`,
      lastLines(result.output, 15),
    )
  }
  if (result.code !== 0) {
    return failed(
      'command-failed',
      `The containers did not start (exit code ${result.code}).`,
      `See what they said: docker ${composeArgs(context, 'logs', '--tail', '30').join(' ')}  (full log: ${context.logFile})`,
      lastLines(result.output, 15),
    )
  }
  const services = context.options.database === 'sqlite' ? 'app, mailpit' : 'app, db, mailpit'
  return { status: 'done', message: `Containers running and healthy (${services})` }
}

/**
 * On Linux the app container runs as the host user (no root-owned files in the project).
 * Docker Desktop on Windows and macOS maps ownership itself, so the image's user 1000 stays.
 */
function writeHostUser(context: StepContext): void {
  if (context.hostUser === undefined) return
  let text = readEnvFile(context.directory)
  text = setEnvValue(text, 'STRUT_UID', String(context.hostUser.uid))
  text = setEnvValue(text, 'STRUT_GID', String(context.hostUser.gid))
  writeEnvFile(context.directory, '.env', text)
}

/** The three checks, cheapest first. Returns a failed outcome, or `undefined` when all pass. */
async function checkDocker(context: StepContext): Promise<StepOutcome | undefined> {
  const run = (args: string[]) =>
    context.spawn({ command: context.dockerCommand, args, cwd: context.directory, logFile: context.logFile })
  const version = await run(['--version'])
  if (version.notFound || version.code !== 0) {
    return failed(
      'docker-missing',
      'Docker is not installed (the docker command was not found).',
      'Install Docker Desktop (https://docs.docker.com/get-docker/; on Windows use the WSL2 backend), or set up without Docker: your own database server (XAMPP, WAMP, MAMP, Laragon, Postgres.app) or SQLite.',
    )
  }
  const info = await run(['info', '--format', '{{.ServerVersion}}'])
  if (info.code !== 0) {
    const permission = /permission denied/i.test(info.output)
    return failed(
      'docker-stopped',
      permission ? 'Docker is installed, but this user may not use it.' : 'Docker is installed but not running.',
      permission
        ? 'Add yourself to the docker group (sudo usermod -aG docker $USER), log out and in, then choose Retry.'
        : 'Start Docker Desktop, wait until it says "running", then choose Retry.',
      lastLines(info.output, 3),
    )
  }
  const composeVersion = await run(['compose', 'version'])
  if (composeVersion.code !== 0) {
    return failed(
      'command-failed',
      'Docker Compose v2 is missing (docker compose version failed).',
      'Update Docker Desktop, or install the Compose plugin, then choose Retry.',
      lastLines(composeVersion.output, 3),
    )
  }
  return undefined
}

/**
 * Move the published ports Docker named (or all of them when it named none) to a fresh free port
 * a random 1 to 12 above, write `.env`, and return what moved.
 */
async function movePublishedPorts(context: StepContext, taken: readonly number[]): Promise<{ from: number; to: number }[]> {
  let text = readEnvFile(context.directory)
  const env = parseEnv(text)
  const current = PUBLISHED_PORT_KEYS.map((key) => ({ key, from: Number(env.get(key) ?? 0) })).filter((entry) => entry.from > 0)
  const named = current.filter((entry) => taken.includes(entry.from))
  const toMove = named.length > 0 ? named : current
  const inUse = new Set(current.map((entry) => entry.from))
  const random = context.random ?? Math.random
  const moved: { from: number; to: number }[] = []
  for (const { key, from } of toMove) {
    const start = from + 1 + Math.floor(random() * PORT_SPREAD)
    // Never hand out a port another key of this project already uses.
    const to = await pickFreePort(start, async (port) => !inUse.has(port) && (await context.isPortFree(port)))
    inUse.add(to)
    text = setEnvValue(text, key, String(to))
    if (key === 'APP_PORT') text = setEnvValue(text, 'APP_URL', `http://localhost:${to}`)
    moved.push({ from, to })
  }
  writeEnvFile(context.directory, '.env', text)
  return moved
}
