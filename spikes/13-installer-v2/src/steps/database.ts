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
import { parseEnv, setEnvValue } from '../env-file.ts'
import { DATABASE_LABELS } from '../options.ts'
import { pickFreePort } from '../ports.ts'
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
  needs: () => ['secrets', 'ports'],
  applies: () => true,
  run: async (context) => {
    const { database, docker } = context.options
    if (docker) return startContainers(context)
    if (database === 'sqlite') return createSqliteFile(context)
    return checkServer(context)
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

/** Your own server: does anything answer at DB_HOST:DB_PORT? (3 seconds at most.) */
async function checkServer(context: StepContext): Promise<StepOutcome> {
  const label = DATABASE_LABELS[context.options.database]
  const host = envValue(context.directory, 'DB_HOST') ?? '127.0.0.1'
  const port = Number(envValue(context.directory, 'DB_PORT') ?? 0)
  if (await answers(host, port)) return { status: 'done', message: `${label} answers at ${host}:${port}` }
  return failed(
    'database-unreachable',
    `Nothing answers at ${host}:${port}, so ${label} cannot be reached.`,
    `Start your ${label} server (or fix DB_HOST/DB_PORT in .env), then choose Retry.`,
  )
}

/** Try a TCP connection. */
function answers(host: string, port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ host, port })
    const finish = (ok: boolean) => {
      socket.destroy()
      resolvePromise(ok)
    }
    socket.setTimeout(3000, () => finish(false))
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
  })
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
      'Install Docker Desktop (https://docs.docker.com/get-docker/; on Windows use the WSL2 backend), or continue without Docker on SQLite.',
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
