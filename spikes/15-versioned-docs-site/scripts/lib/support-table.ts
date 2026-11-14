/**
 * The support table readers see on every version's Release Notes page.
 *
 * It is rendered from `versions.json` at build time, in EVERY version's build, so even old
 * docs show today's dates. (Laravel copies the table into each docs branch, and on
 * 2026-11-14 its `master` branch still showed the Laravel 12 table: a copied table goes stale.)
 *
 * The same rows feed the HTML table (`SupportTable.astro`) and the Markdown export.
 */
import type { SupportLine, SupportStatus, SupportTable } from './versions.ts'

/** One rendered row. Every cell is plain text. */
export interface SupportRow {
  readonly version: string
  readonly node: string
  readonly release: string
  readonly bugFixesUntil: string
  readonly securityUntil: string
  readonly status: SupportStatus
  /** Text label for the status, so it never relies on colour alone. */
  readonly statusLabel: string
  /** `true` for the line whose docs are being read. */
  readonly reading: boolean
}

/** Readable labels for each status (used as text, not just colour). */
export const STATUS_LABELS: Readonly<Record<SupportStatus, string>> = {
  active: 'Bug and security fixes',
  security: 'Security fixes only',
  eol: 'End of life',
}

function nodeText(range: string): string {
  return range.replace(/^>=\s*/, '') + '+'
}

function windowText(line: SupportLine, date: string | null, isCurrent: boolean, kind: 'bugs' | 'security'): string {
  if (date !== null) return date
  if (line.status === 'eol') return '—'
  if (!isCurrent) return kind === 'bugs' ? '—' : 'To be announced'
  return kind === 'bugs' ? 'Release of the next line' : 'Next line’s release + 6 months'
}

/**
 * Turns `versions.json` into display rows, newest line first.
 *
 * `null` dates are shown in words: "Not released yet", "Release of the next line",
 * "Next line's release + 6 months" (the pre-1.0 policy), or "—" for end-of-life lines.
 *
 * @example
 * ```ts
 * supportRows(table, '0.1')[1] // { version: '0.1', status: 'eol', statusLabel: 'End of life', reading: true, … }
 * ```
 */
export function supportRows(table: SupportTable, readingLine: string | undefined): SupportRow[] {
  return table.lines.map((line) => {
    const isCurrent = line.line === table.current
    return {
      version: line.line,
      node: nodeText(line.node),
      release: line.released ?? (line.status === 'eol' ? 'Pre-releases only' : 'Not released yet'),
      bugFixesUntil: windowText(line, line.bugFixesUntil, isCurrent, 'bugs'),
      securityUntil: windowText(line, line.securityUntil, isCurrent, 'security'),
      status: line.status,
      statusLabel: STATUS_LABELS[line.status],
      reading: line.line === readingLine,
    }
  })
}

/**
 * The support table as a GitHub-flavoured Markdown table (for "Copy as Markdown" and `llms.txt`).
 *
 * @example
 * ```ts
 * supportTableMarkdown(table, '0.2')
 * // '| Version | Node | Release | … |\n|---|…|\n| **0.2** (you are reading these docs) | 24.3+ | … |'
 * ```
 */
export function supportTableMarkdown(table: SupportTable, readingLine: string | undefined): string {
  const header = '| Version | Node | Release | Bug fixes until | Security fixes until | Status |\n|---|---|---|---|---|---|'
  const rows = supportRows(table, readingLine).map((row) => {
    const version = row.reading ? `**${row.version}** (you are reading these docs)` : row.version
    return `| ${version} | ${row.node} | ${row.release} | ${row.bugFixesUntil} | ${row.securityUntil} | ${row.statusLabel} |`
  })
  return [header, ...rows].join('\n')
}
