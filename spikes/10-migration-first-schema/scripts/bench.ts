/**
 * Timings for the README: `npm run bench`.
 *
 * - Cold: a fresh Node process per run (what `sv types` costs), for the blog app and a synthetic
 *   200-migration app, with approach (a) replay and approach (b) static analysis.
 * - Warm: in-process medians (what `sv dev` costs per change once modules are loaded).
 * - Databases: migrating the blog app on SQLite and PGlite, and PGlite's boot.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from '../src/db/migrator.ts'
import { openPglite } from '../src/db/pglite.ts'
import { openSqlite } from '../src/db/sqlite.ts'
import { buildArtifacts } from '../src/generate/artifacts.ts'
import { discoverMigrations, loadMigrations, replayMigrations } from '../src/schema/replay.ts'
import { analyzeMigrationFiles } from '../src/schema/static.ts'
import { writeSyntheticApp } from './synthetic.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const RUNS = 5

/** What `cold-run.ts` prints. */
interface ColdResult {
  readonly toolLoadMs: number
  readonly importFilesMs: number
  readonly workMs: number
  readonly totalMs: number
  readonly sinceProcessStart: number
}

function coldRun(mode: 'replay' | 'static', directory: string): ColdResult {
  const result = spawnSync(process.execPath, [join(ROOT, 'scripts', 'cold-run.ts'), mode, directory], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`cold-run failed: ${result.stderr}`)
  return JSON.parse(result.stdout) as ColdResult
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

/** Median of `runs` timings, after one discarded warm-up. */
function timeMedian(work: () => unknown, runs = 20): number {
  work()
  const samples: number[] = []
  for (let run = 0; run < runs; run++) {
    const start = performance.now()
    work()
    samples.push(performance.now() - start)
  }
  return median(samples)
}

const ms = (value: number): string => `${value.toFixed(1)} ms`

mkdirSync(join(ROOT, '.tmp'), { recursive: true })
const synthetic = mkdtempSync(join(ROOT, '.tmp', 'bench-'))
try {
  const apps: Record<string, string> = {
    'blog (7 files)': join(ROOT, 'fixtures', 'blog', 'database', 'migrations'),
    'synthetic (200 files)': writeSyntheticApp(synthetic, 100),
  }
  console.log(`Node ${process.version}, ${process.platform}. Cold = median of ${RUNS} fresh processes (one warm-up discarded).\n`)
  console.log('| App | Approach | Load tooling | Read/import files | Replay | Total in-process | Process wall (incl. Node boot) |')
  console.log('|---|---|---|---|---|---|---|')
  for (const [name, directory] of Object.entries(apps)) {
    for (const mode of ['replay', 'static'] as const) {
      coldRun(mode, directory)
      const runs = Array.from({ length: RUNS }, () => coldRun(mode, directory))
      const pick = (key: keyof ColdResult): string => ms(median(runs.map((run) => run[key])))
      const label = mode === 'replay' ? '(a) replay' : '(b) oxc static'
      console.log(`| ${name} | ${label} | ${pick('toolLoadMs')} | ${pick('importFilesMs')} | ${pick('workMs')} | ${pick('totalMs')} | ${pick('sinceProcessStart')} |`)
    }
  }

  const bigFiles = discoverMigrations(apps['synthetic (200 files)'] ?? '')
  const loaded = await loadMigrations(bigFiles)
  const replay = replayMigrations(loaded)
  console.log('\nWarm, in-process (median of 20):')
  console.log(`- (a) replay 200 already-imported migrations: ${ms(timeMedian(() => replayMigrations(loaded)))}`)
  console.log(`- (b) static analysis of 200 files (read + parse + extract): ${ms(timeMedian(() => analyzeMigrationFiles(bigFiles)))}`)
  console.log(`- generate every artifact for 100 tables (types, metadata, 6 SQL files): ${ms(timeMedian(() => buildArtifacts(replay)))}`)

  const blog = replayMigrations(await loadMigrations(discoverMigrations(apps['blog (7 files)'] ?? '')))
  const sqliteStart = performance.now()
  const sqlite = openSqlite()
  await migrate(sqlite, blog)
  const sqliteMs = performance.now() - sqliteStart
  await sqlite.close()
  const pgStart = performance.now()
  const pg = await openPglite()
  const pgReady = performance.now()
  await migrate(pg, blog)
  const pgMigrated = performance.now()
  await pg.close()
  console.log('\nDatabases (blog app, 7 migrations):')
  console.log(`- SQLite open + migrate: ${ms(sqliteMs)}`)
  console.log(`- PGlite boot: ${ms(pgReady - pgStart)}; migrate: ${ms(pgMigrated - pgReady)}`)
} finally {
  rmSync(synthetic, { recursive: true, force: true })
}
