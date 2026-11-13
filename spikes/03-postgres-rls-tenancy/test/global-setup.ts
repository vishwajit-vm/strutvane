/**
 * Vitest global setup: starts throwaway containers for the whole test run.
 *
 *   docker network  sv-spike03-<id>
 *   ├─ postgres:18.7-alpine        published on a random 127.0.0.1 port
 *   └─ edoburu/pgbouncer:v1.26.1-p0  POOL_MODE=transaction, DEFAULT_POOL_SIZE=4, random 127.0.0.1 port
 *
 * Containers run with --rm and are force-removed in teardown, including when setup fails part-way.
 * No Docker files are written to disk (ADR-0006: Docker is local-only and never committed).
 */
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import { promisify } from 'node:util'
import pg from 'pg'
import type { TestProject } from 'vitest/node'
import { migrate } from '../src/migrate.ts'

const execFileAsync = promisify(execFile)

export const POSTGRES_IMAGE = 'postgres:18.7-alpine'
export const PGBOUNCER_IMAGE = 'edoburu/pgbouncer:v1.26.1-p0'
export const PGBOUNCER_POOL_SIZE = 4
const DATABASE = 'spike'

export interface SpikeEnvironment {
  readonly host: string
  readonly database: string
  readonly postgresPort: number
  readonly bouncerPort: number
  readonly bouncerPoolSize: number
  readonly passwords: {
    readonly postgres: string
    readonly appOwner: string
    readonly appUser: string
    readonly appBypass: string
  }
}

declare module 'vitest' {
  export interface ProvidedContext {
    spike: SpikeEnvironment
  }
}

async function docker(...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('docker', args, { windowsHide: true, maxBuffer: 10 * 1024 * 1024 })
  return stdout.trim()
}

async function publishedPort(container: string): Promise<number> {
  const mapping = await docker('port', container, '5432/tcp') // e.g. "127.0.0.1:55012"
  const port = Number(mapping.split('\n')[0]?.split(':').pop())
  if (!Number.isInteger(port) || port <= 0) throw new Error(`Could not read published port of ${container}: "${mapping}"`)
  return port
}

/** Polls until a real query succeeds (TCP is only opened by the final server, after initdb). */
async function waitForQuery(config: pg.ClientConfig, label: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    const client = new pg.Client({ ...config, connectionTimeoutMillis: 2_000 })
    try {
      await client.connect()
      await client.query('SELECT 1')
      return
    } catch (error) {
      lastError = error
      await sleep(500)
    } finally {
      await client.end().catch(() => undefined)
    }
  }
  throw new Error(`${label} not ready after ${timeoutMs} ms: ${String(lastError)}`)
}

const secret = (): string => randomBytes(18).toString('base64url')

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const id = randomBytes(4).toString('hex')
  const network = `sv-spike03-${id}`
  const pgName = `sv-spike03-pg-${id}`
  const bouncerName = `sv-spike03-bouncer-${id}`
  const created: { network: boolean; containers: string[] } = { network: false, containers: [] }

  const teardown = async (): Promise<void> => {
    for (const name of created.containers.reverse()) await docker('rm', '-f', '-v', name).catch(() => undefined)
    if (created.network) await docker('network', 'rm', network).catch(() => undefined)
  }

  const passwords = { postgres: secret(), appOwner: secret(), appUser: secret(), appBypass: secret() }

  try {
    await docker('network', 'create', network)
    created.network = true

    await docker(
      'run', '--rm', '-d', '--name', pgName, '--network', network,
      '-e', `POSTGRES_PASSWORD=${passwords.postgres}`, '-e', `POSTGRES_DB=${DATABASE}`,
      '-p', '127.0.0.1::5432', POSTGRES_IMAGE,
    )
    created.containers.push(pgName)
    const postgresPort = await publishedPort(pgName)
    const superuserConfig: pg.ClientConfig = {
      host: '127.0.0.1', port: postgresPort, database: DATABASE, user: 'postgres', password: passwords.postgres,
    }
    await waitForQuery(superuserConfig, 'PostgreSQL')

    const superuser = new pg.Client(superuserConfig)
    await superuser.connect()
    try {
      await migrate(superuser, passwords)
    } finally {
      await superuser.end()
    }

    await docker(
      'run', '--rm', '-d', '--name', bouncerName, '--network', network,
      '-e', `DB_HOST=${pgName}`, '-e', 'DB_PORT=5432', '-e', `DB_NAME=${DATABASE}`,
      '-e', 'DB_USER=app_user', '-e', `DB_PASSWORD=${passwords.appUser}`,
      '-e', 'AUTH_TYPE=scram-sha-256', '-e', 'POOL_MODE=transaction',
      '-e', `DEFAULT_POOL_SIZE=${PGBOUNCER_POOL_SIZE}`, '-e', 'MAX_CLIENT_CONN=500',
      '-p', '127.0.0.1::5432', PGBOUNCER_IMAGE,
    )
    created.containers.push(bouncerName)
    const bouncerPort = await publishedPort(bouncerName)
    await waitForQuery(
      { host: '127.0.0.1', port: bouncerPort, database: DATABASE, user: 'app_user', password: passwords.appUser },
      'PgBouncer',
    )

    project.provide('spike', {
      host: '127.0.0.1',
      database: DATABASE,
      postgresPort,
      bouncerPort,
      bouncerPoolSize: PGBOUNCER_POOL_SIZE,
      passwords,
    })
  } catch (error) {
    await teardown()
    throw error
  }

  return teardown
}
