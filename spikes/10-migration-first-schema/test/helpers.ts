/**
 * Shared test helpers: the replayed blog fixture, the two real engines, and temp folders.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Database } from '../src/db/database.ts'
import { openPglite } from '../src/db/pglite.ts'
import { openSqlite } from '../src/db/sqlite.ts'
import { discoverMigrations, loadMigrations, replayMigrations, type Replay } from '../src/schema/replay.ts'

/** The spike's root folder. */
export const SPIKE_ROOT = fileURLToPath(new URL('..', import.meta.url))
/** The realistic blog app used across the suite. */
export const BLOG_ROOT = join(SPIKE_ROOT, 'fixtures', 'blog')
/** An app whose migrations use loops, helpers and `if`: fine for replay, unreadable statically. */
export const DYNAMIC_ROOT = join(SPIKE_ROOT, 'fixtures', 'dynamic')

/** Replay an app's migrations (approach a). */
export async function replayApp(root: string): Promise<Replay> {
  return replayMigrations(await loadMigrations(discoverMigrations(join(root, 'database', 'migrations'))))
}

/** The two engines every database test runs on. */
export const ENGINES: readonly { readonly name: string; readonly open: () => Promise<Database> | Database }[] = [
  { name: 'SQLite (node:sqlite)', open: openSqlite },
  { name: 'PostgreSQL (PGlite)', open: openPglite },
]

const TEMP_PARENT = join(SPIKE_ROOT, '.tmp')
const tempDirs: string[] = []

/**
 * A fresh folder inside the spike (so `#strutvane/*` imports and `node_modules` resolve from it).
 * Removed by {@link cleanupTempDirs}.
 */
export function makeTempDir(prefix: string): string {
  mkdirSync(TEMP_PARENT, { recursive: true })
  const dir = mkdtempSync(join(TEMP_PARENT, `${prefix}-`))
  tempDirs.push(dir)
  return dir
}

/** Remove every temp folder this test file created. */
export function cleanupTempDirs(): void {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
}

/** A migration file body with the given `up` and `down` statements, as `make:migration` would start it. */
export function migrationSource(up: string, down: string): string {
  return `import { migration } from '#strutvane/schema'

export default migration({\n  up(schema) {\n    ${up}\n  },\n  down(schema) {\n    ${down}\n  },\n})\n`
}

/** Median of a list of numbers (timings). */
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : (sorted[middle] ?? 0)
}
