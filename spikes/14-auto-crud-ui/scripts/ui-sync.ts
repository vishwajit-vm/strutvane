/**
 * `ui:sync` command line: `node scripts/ui-sync.ts <app-root> [--dry-run]`.
 *
 * In the product, `sv migrate` calls this through the `schema.migrated` hook; here it is run by
 * hand (`npm run ui:sync`) on the example app.
 */
import { formatReport } from '../src/generator/report.ts'
import { runUiSync, SyncError } from '../src/generator/sync.ts'

const args = process.argv.slice(2)
const appRoot = args.find((arg) => !arg.startsWith('--'))
const dryRun = args.includes('--dry-run')

if (appRoot === undefined) {
  process.stderr.write('Usage: node scripts/ui-sync.ts <app-root> [--dry-run]\n')
  process.exit(1)
}

try {
  const result = runUiSync(appRoot, { dryRun })
  process.stdout.write(`${formatReport(result.report)}\n`)
  if (dryRun) process.stdout.write('(dry run: nothing was written)\n')
  else if (result.written.length > 0) process.stdout.write(`Wrote: ${result.written.join(', ')}\n`)
} catch (error) {
  // Expected problems get a clean message; anything else keeps its stack for debugging.
  if (error instanceof SyncError) {
    process.stderr.write(`ui:sync: ${error.message}\n`)
    process.exit(1)
  }
  throw error
}
