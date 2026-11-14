/**
 * `npm run charts:sync`: the spike's stand-in for `node strut charts:sync`.
 *
 * Usage: `node scripts/charts-sync.ts <app-dir> [--dry-run]`
 */
import { syncCharts, SyncError } from '../src/generator/sync.ts'

const [appDir = '.', ...flags] = process.argv.slice(2)
try {
  const result = syncCharts(appDir, { dryRun: flags.includes('--dry-run') })
  process.stdout.write(`${[...result.report, `Wrote ${result.written.length} file(s).`].join('\n')}\n`)
} catch (error) {
  if (!(error instanceof SyncError)) throw error
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
}
