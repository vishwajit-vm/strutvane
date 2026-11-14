/**
 * One cold measurement in a fresh Node process, the way `sv types` would run.
 *
 *   node scripts/cold-run.ts replay <migrations dir>
 *   node scripts/cold-run.ts static <migrations dir>
 *
 * Prints one JSON line. `sinceProcessStart` uses performance.now(), whose origin is the process
 * start, so it includes Node's own boot time.
 */
const mode = process.argv[2]
const directory = process.argv[3] ?? ''
const started = performance.now()

if (mode === 'replay') {
  const { discoverMigrations, loadMigrations, replayMigrations } = await import('../src/schema/replay.ts')
  const toolsLoaded = performance.now()
  const files = discoverMigrations(directory)
  const loaded = await loadMigrations(files)
  const filesRead = performance.now()
  const replay = replayMigrations(loaded)
  const done = performance.now()
  report(files.length, replay.state.tables.length, 0, toolsLoaded, filesRead, done)
} else if (mode === 'static') {
  const { discoverMigrations, replayMigrations } = await import('../src/schema/replay.ts')
  const { analyzeMigrationFiles } = await import('../src/schema/static.ts')
  const toolsLoaded = performance.now()
  const files = discoverMigrations(directory)
  const analysis = analyzeMigrationFiles(files)
  const filesRead = performance.now()
  const replay = replayMigrations(analysis.migrations)
  const done = performance.now()
  report(files.length, replay.state.tables.length, analysis.diagnostics.length, toolsLoaded, filesRead, done)
} else {
  console.error('Usage: node scripts/cold-run.ts replay|static <migrations dir>')
  process.exitCode = 1
}

function report(files: number, tables: number, diagnostics: number, toolsLoaded: number, filesRead: number, done: number): void {
  console.log(
    JSON.stringify({
      mode,
      files,
      tables,
      diagnostics,
      toolLoadMs: toolsLoaded - started,
      importFilesMs: filesRead - toolsLoaded,
      workMs: done - filesRead,
      totalMs: done - started,
      sinceProcessStart: done,
    }),
  )
}
