/**
 * Vitest global setup: start a throwaway MySQL 8.4 container for the whole run, and remove it
 * afterwards. Nothing Docker-related is committed (ADR-0006): the container is created from the
 * official image with a `docker run` command and deleted at the end.
 *
 * Safety rules this file follows:
 * - It only ever touches a container with its own unique name (`spike11-orm-mysql`). It never
 *   lists, stops or removes any other container.
 * - It binds to 127.0.0.1 on a free port, so the database is never exposed to the network.
 * - The root password is random per run and only lives in this process' memory.
 * - When Docker is not available, MySQL tests are skipped with a clear message instead of failing.
 *   Set SPIKE11_MYSQL=off to skip MySQL deliberately.
 */
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import { promisify } from 'node:util'
import { createConnection } from 'mysql2/promise'
import type { TestProject } from 'vitest/node'

const run = promisify(execFile)
const CONTAINER = 'spike11-orm-mysql'
const IMAGE = 'mysql:8.4'
const READY_TIMEOUT_MS = 180_000

declare module 'vitest' {
  export interface ProvidedContext {
    /** Connection URL of the test MySQL, or a reason it is not available. */
    mysql: { readonly url: string } | { readonly skipped: string }
  }
}

/**
 * Start MySQL (or explain why not) and provide its URL to the test files.
 *
 * @example
 * // vitest.config.ts: test.globalSetup = ['test/support/mysql-container.ts']
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  if (process.env['SPIKE11_MYSQL'] === 'off') {
    project.provide('mysql', { skipped: 'SPIKE11_MYSQL=off' })
    return async () => undefined
  }
  if (!(await dockerAvailable())) {
    project.provide('mysql', { skipped: 'Docker is not available, so the MySQL suite is skipped (install/start Docker to run it)' })
    return async () => undefined
  }
  const port = await freePort()
  const password = randomBytes(18).toString('base64url')
  await removeOwnContainer()
  await run('docker', ['run', '--rm', '-d', '--name', CONTAINER, '-e', `MYSQL_ROOT_PASSWORD=${password}`, '-e', 'MYSQL_DATABASE=spike11', '-p', `127.0.0.1:${port}:3306`, IMAGE])
  const url = `mysql://root:${encodeURIComponent(password)}@127.0.0.1:${port}/spike11`
  try {
    await waitUntilReady(url)
  } catch (error) {
    await removeOwnContainer()
    throw error
  }
  project.provide('mysql', { url })
  return removeOwnContainer
}

async function dockerAvailable(): Promise<boolean> {
  try {
    await run('docker', ['version', '--format', '{{.Server.Version}}'], { timeout: 15_000 })
    return true
  } catch {
    return false
  }
}

/** Remove *our* container by its exact name; ignore "no such container". */
async function removeOwnContainer(): Promise<void> {
  try {
    await run('docker', ['rm', '-f', CONTAINER], { timeout: 60_000 })
  } catch {
    // Not running: nothing to clean up.
  }
}

/** Ask the OS for a free port on 127.0.0.1. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

/** MySQL's first boot initialises the data directory and restarts once: poll until a query works. */
async function waitUntilReady(url: string): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const connection = await createConnection(url)
      await connection.query('SELECT 1')
      await connection.end()
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
  throw new Error(`MySQL did not become ready within ${READY_TIMEOUT_MS / 1000}s: ${String(lastError)}`)
}
