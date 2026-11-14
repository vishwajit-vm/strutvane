/**
 * Shared test setup: a fresh example app on in-memory SQLite, migrated from spike 10's schema
 * dump and seeded, with a fixed clock and a memory logger.
 */
import { createApp } from '../fixtures/example-app/bootstrap/app.ts'
import { DatabaseSeeder } from '../fixtures/example-app/database/seeders/database.seeder.ts'
import type { Application } from '#strutvane/foundation'
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
export async function exampleApp(env: Readonly<Record<string, string>> = {}): Promise<{ app: Application; logger: MemoryLogger; clock: { now: Date } }> {
  const app = createApp({ ...testEnv, ...env })
  const logger = new MemoryLogger()
  const clock = { now: NOW }
  // Bound before boot, so the core keeps them instead of its defaults.
  app.container.instance(LoggerToken, logger)
  app.container.instance(ClockToken, () => clock.now)
  await refreshDatabase(app)
  await app.run(() => new DatabaseSeeder().run())
  return { app, logger, clock }
}
