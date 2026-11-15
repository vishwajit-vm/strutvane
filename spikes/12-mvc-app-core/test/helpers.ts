/**
 * Shared test setup: a fresh example app on in-memory SQLite, migrated from spike 10's schema
 * dump and seeded, with a fixed clock and a memory logger.
 */
import { createApp } from '../fixtures/example-app/bootstrap/app.ts'
import { DatabaseSeeder } from '../fixtures/example-app/database/seeders/database.seeder.ts'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { Application, type RoutingOptions } from '#strutvane/foundation'
import type { MiddlewareConfig } from '#strutvane/http'
import { config } from '../fixtures/example-app/config/index.ts'
import { providers } from '../fixtures/example-app/bootstrap/providers.ts'
import { ClockToken, LoggerToken, MemoryLogger } from '#strutvane/foundation'
import { refreshDatabase } from '#strutvane/testing'

/** The environment every test app gets: deterministic, and nothing read from the real env. */
export const testEnv = {
  APP_NAME: 'Blog Test',
  APP_ENV: 'testing',
  APP_DEBUG: 'true',
  APP_URL: 'http://localhost',
  APP_KEY: 'test-key-0123456789abcdef0123456789abcdef',
  DB_CONNECTION: 'sqlite',
  DB_DATABASE: ':memory:',
} as const

/** The fixed "now" for timestamps and rate-limit windows. */
export const NOW = new Date('2026-11-14T10:00:00.000Z')

/**
 * A booted, migrated and seeded example app.
 *
 * @example
 * const { app, logger } = await exampleApp()
 */
export async function exampleApp(env: Readonly<Record<string, string>> = {}, options: { readonly forceDebug?: boolean } = {}): Promise<{ app: Application; logger: MemoryLogger; clock: { now: Date } }> {
  const app = createApp({ ...testEnv, ...env })
  if (options.forceDebug === true) app.forceDebug()
  const logger = new MemoryLogger()
  const clock = { now: NOW }
  // Bound before boot, so the core keeps them instead of its defaults.
  app.container.instance(LoggerToken, logger)
  app.container.instance(ClockToken, () => clock.now)
  await refreshDatabase(app)
  await app.run(() => new DatabaseSeeder().run())
  return { app, logger, clock }
}

/** The example app's folder (schema dump and metadata live here; tests never write into it). */
export const EXAMPLE_BASE = join(import.meta.dirname, '..', 'fixtures', 'example-app')

/**
 * An app with the example's config, providers and seeded database, but your own routes and
 * middleware settings: for testing protections in isolation.
 *
 * @example
 * const { app } = await customApp({ web: defineRoutes([Route.post('/x', handler)]) }, (m) => m.validateCsrfTokens({ except: ['x'] }))
 */
export async function customApp(routing: RoutingOptions, configure: (middleware: MiddlewareConfig) => void = () => {}, env: Readonly<Record<string, string>> = {}): Promise<{ app: Application; logger: MemoryLogger }> {
  const app = Application.configure({ basePath: EXAMPLE_BASE, env: { ...testEnv, ...env } })
    .withConfig(config)
    .withProviders(providers)
    .withRouting(routing)
    .withMiddleware(configure)
    .create()
  const logger = new MemoryLogger()
  app.container.instance(LoggerToken, logger)
  app.container.instance(ClockToken, () => NOW)
  await refreshDatabase(app)
  await app.run(() => new DatabaseSeeder().run())
  return { app, logger }
}

/** How long a test that spawns Node or runs `tsc` may take. Override with STRUT_SLOW_TEST_TIMEOUT (ms) on a slow machine. */
export const SLOW_TEST_TIMEOUT = Number(process.env['STRUT_SLOW_TEST_TIMEOUT'] ?? 300_000)

/**
 * A private scratch folder for one test file. It lives inside the spike (not the OS temp folder)
 * because copies of the example app are run as real `node strut` processes and import
 * `#strutvane/*`, which only resolves under this package. Each file gets its own `mkdtemp`
 * folder, so one file's cleanup can never delete another file's copies mid-run.
 *
 * @example
 * const scratch = scratchDir('console')
 */
export function scratchDir(prefix: string): string {
  const root = join(import.meta.dirname, '.tmp')
  mkdirSync(root, { recursive: true })
  return mkdtempSync(join(root, `${prefix}-`))
}

/**
 * Remove a folder, retrying Windows' transient EPERM/EBUSY, and never fail a test on cleanup:
 * a leftover folder in test/.tmp (git-ignored) is harmless, a red suite for it is not.
 *
 * @example
 * afterAll(() => removeQuietly(scratch))
 */
export function removeQuietly(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  } catch {
    // Deliberately ignored; see above.
  }
}
