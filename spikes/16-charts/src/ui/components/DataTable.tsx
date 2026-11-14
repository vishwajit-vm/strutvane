/**
 * `<DataTable>`: a chart's numbers as a real table. Always in the page: visually hidden next to
 * the chart (screen readers read it), or shown instead of the chart with "Show table".
 *
 * Why always present: a chart is a picture. The table is the accessible version of the same
 * information (WCAG 1.1.1), and it is also what a sighted user copies into a spreadsheet.
 *
 * @module
 */
import { clsx } from 'clsx'
import type { ReactElement } from 'react'
import type { ValueFormat } from '../../shared/widgets.ts'
import { formatValue } from '../format.ts'
import type { ChartData } from '../series.ts'

/**
 * Props of {@link DataTable}.
 *
 * @example
 * <DataTable data={data} caption="Invoices per month" groupLabel="Month" format="integer" visible={false} />
 */
export interface DataTableProps {
  readonly data: ChartData
  readonly caption: string
  readonly groupLabel: string
  readonly format: ValueFormat
  /** Shown on screen (true) or only to assistive technology (false). */
  readonly visible: boolean
  readonly locale?: string
}

/**
 * The table fallback of a chart.
 *
 * @example
 * <DataTable data={data} caption="Top customers" groupLabel="Customer" format="integer" visible />
 */
export function DataTable({ data, caption, groupLabel, format, visible, locale }: DataTableProps): ReactElement {
  return (
    <div className={visible ? 'max-h-80 overflow-auto rounded-lg border border-border/60' : 'sr-only'}>
      <table className="w-full text-sm">
        <caption className={visible ? 'sr-only' : undefined}>{caption}</caption>
        <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-semibold">
              {groupLabel}
            </th>
            {data.series.map((series) => (
              <th key={series.dataKey} scope="col" className="px-3 py-2 text-right font-semibold">
                {series.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <tr key={row.key} className="border-t border-border/60">
              <th scope="row" className="px-3 py-2 text-left font-medium">
                {row.label}
              </th>
              {data.series.map((series) => {
                const hidden = row.suppressed.includes(series.dataKey)
                return (
                  <td key={series.dataKey} className={clsx('px-3 py-2 text-right tabular-nums', hidden && 'text-muted-foreground')}>
                    {hidden ? 'Hidden (too few records)' : formatValue(row.values[series.dataKey] ?? null, format, locale)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
