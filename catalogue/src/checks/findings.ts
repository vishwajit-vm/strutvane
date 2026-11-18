/**
 * The result type every check returns, and the text a person reads.
 *
 * Severity, and why there are only two:
 * - `error`: the catalogue and reality disagree in a way someone must fix (a repo missing from
 *   the source, a released package that is not on npm, a manifest that breaks a rule). The check
 *   command exits 1, so CI goes red.
 * - `warning`: worth knowing, nothing is wrong yet (a planned name not yet reserved on npm, an
 *   npm deprecation that is still pending). Printed, never fails the run.
 *
 * @module
 */
import { byCodeUnit } from '../graph.ts'

export type Severity = 'error' | 'warning'

/** Which check produced a finding. */
export type CheckName = 'manifest' | 'npm' | 'repos' | 'docs'

/** One finding. */
export interface Finding {
  readonly check: CheckName
  readonly severity: Severity
  /** What it is about: an npm name, a repo, a docs entry id. */
  readonly subject: string
  /** What is wrong and how to fix it. */
  readonly message: string
}

/** Findings in a stable order: errors first, then by check, subject and message. */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1) ||
      byCodeUnit(a.check, b.check) ||
      byCodeUnit(a.subject, b.subject) ||
      byCodeUnit(a.message, b.message),
  )
}

/**
 * The report a person reads: a summary line, then findings grouped by check.
 *
 * @example
 * process.stdout.write(formatFindings(findings))
 */
export function formatFindings(findings: readonly Finding[]): string {
  const errors = findings.filter((finding) => finding.severity === 'error').length
  const warnings = findings.length - errors
  const lines = [
    errors === 0
      ? `Catalogue checks passed${warnings === 0 ? '.' : ` with ${warnings} ${warnings === 1 ? 'warning' : 'warnings'}.`}`
      : `Catalogue checks FAILED: ${errors} ${errors === 1 ? 'error' : 'errors'}, ${warnings} ${warnings === 1 ? 'warning' : 'warnings'}.`,
  ]
  const byCheck = new Map<CheckName, Finding[]>()
  for (const finding of sortFindings(findings)) byCheck.set(finding.check, [...(byCheck.get(finding.check) ?? []), finding])
  for (const check of [...byCheck.keys()].sort(byCodeUnit)) {
    lines.push('', `  ${check}`)
    for (const finding of byCheck.get(check) ?? []) lines.push(`    ${finding.severity === 'error' ? 'ERROR  ' : 'warning'} ${finding.subject}: ${finding.message}`)
  }
  return `${lines.join('\n')}\n`
}
