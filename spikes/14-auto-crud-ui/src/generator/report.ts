/**
 * Turn a {@link SyncReport} into the friendly text `ui:sync` prints after `migrate`.
 *
 * Every line says what happened and, when something needs doing, exactly what to do.
 *
 * @module
 */
import type { ColumnNote, SyncReport } from './plan.ts'

/**
 * Format a report for the terminal. Returns one line when there is nothing to say.
 *
 * @example
 * console.log(formatReport(result.report))
 * // ui:sync: new screen for posts (resources/ui/posts.ui.ts)
 */
export function formatReport(report: SyncReport): string {
  const lines: string[] = [
    ...report.scaffolded.map((file) => `+ New screen: ${file} (yours to edit; ui:sync will not touch it again)`),
    ...report.addedAutomatically.map((note) => `+ ${describe(note)} appears automatically (the list is auto()).`),
    ...report.notInExplicitList.map(
      (note) => `! ${describe(note)} is NOT shown: ${note.file} lists ${note.list} explicitly. Add '${note.field}' to that list if you want it.`,
    ),
    ...report.missingFields.map(
      (note) => `x ${note.file} still names '${note.field}' in ${note.list}, but ${note.table} no longer has it. Remove it; until then the file does not type-check.`,
    ),
    ...report.missingOwnedFiles.map((file) => `! ${file} is missing, so that screen uses the defaults. Restore it from git to customise it again.`),
    ...report.orphanedOwnedFiles.map((file) => `! ${file} belongs to a table that no longer exists. Delete it (it no longer type-checks).`),
    ...report.unreadable.map((problem) => `? ${problem}`),
    ...report.skippedInternal.map((table) => `- ${table} is an internal table: no screen, sidebar entry or typed names (by design).`),
  ]
  return lines.length === 0 ? 'ui:sync: screens are up to date.' : ['ui:sync:', ...lines.map((line) => `  ${line}`)].join('\n')
}

function describe(note: ColumnNote): string {
  return `New column ${note.table}.${note.field} (${note.list})`
}
