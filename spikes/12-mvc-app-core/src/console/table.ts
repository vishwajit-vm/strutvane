/**
 * Plain-text tables for console output. No colours, so the output is the same in PowerShell, cmd,
 * bash and CI logs, and tests can compare it exactly.
 */

/**
 * Render rows under headers with padded columns.
 *
 * @example
 * renderTable(['Method', 'URI'], [['GET', '/up']])
 * // "  Method  URI\n  ------  ---\n  GET     /up"
 */
export function renderTable(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const widths = headers.map((header, column) => Math.max(header.length, ...rows.map((row) => (row[column] ?? '').length)))
  const line = (cells: readonly string[]): string => `  ${cells.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join('  ')}`.trimEnd()
  return [line(headers), line(widths.map((width) => '-'.repeat(width))), ...rows.map(line)].join('\n')
}
