/**
 * `sv types` for the spike: replay an app's migrations (approach a) and write the generated files.
 *
 *   node scripts/generate.ts fixtures/blog
 *
 * Prints how long each phase took, so the README's timings can be reproduced.
 */
import { join, resolve } from 'node:path'
import { buildArtifacts, writeArtifacts } from '../src/generate/artifacts.ts'
import { SchemaError } from '../src/schema/errors.ts'
import { discoverMigrations, loadMigrations, replayMigrations } from '../src/schema/replay.ts'

const started = performance.now()
const root = resolve(process.argv[2] ?? 'fixtures/blog')

try {
  const files = discoverMigrations(join(root, 'database', 'migrations'))
  const discovered = performance.now()
  const loaded = await loadMigrations(files)
  const imported = performance.now()
  const replay = replayMigrations(loaded)
  const replayed = performance.now()
  const written = writeArtifacts(root, buildArtifacts(replay))
  const done = performance.now()
  const ms = (from: number, to: number): string => `${(to - from).toFixed(1)} ms`
  console.log(`Replayed ${files.length} migrations into ${replay.state.tables.length} tables.`)
  console.log(`  discover ${ms(started, discovered)} · import ${ms(discovered, imported)} · replay ${ms(imported, replayed)} · generate+write ${ms(replayed, done)} · total ${ms(started, done)}`)
  console.log(written.length === 0 ? '  Everything was already up to date.' : `  Updated: ${written.join(', ')}`)
} catch (error) {
  // Friendly output for schema mistakes; anything else is a real bug and keeps its stack trace.
  if (error instanceof SchemaError) {
    console.error(error.describe())
    process.exitCode = 1
  } else {
    throw error
  }
}
