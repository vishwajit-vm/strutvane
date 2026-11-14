/**
 * A KPI card: tinted icon chip and trend chip on top, the label, a large display number and a
 * caption, and an edge-to-edge sparkline along the bottom. The sparkline spans the card's width,
 * so the layout holds at any card width (no number squeezed beside a chart). A blurred,
 * tone-coloured glow in the corner adds depth, and the card lifts slightly on hover.
 *
 * @example
 * <KpiCard kpi={kpis[0]} />
 */
import { IconAlertTriangle, IconCurrencyDollar, IconFileInvoice, IconUsers } from '@tabler/icons-react'
import type { ReactElement } from 'react'
import { Sparkline } from '../../components/data-display.tsx'
import { IconChip, TrendChip } from '../../components/ui/misc.tsx'
import { TONE_FILL } from '../../components/ui/tone.ts'
import type { Kpi } from '../../data/dashboard.ts'
import { cn } from '../../lib/cn.ts'

const ICONS = { revenue: IconCurrencyDollar, invoices: IconFileInvoice, customers: IconUsers, overdue: IconAlertTriangle } as const

export function KpiCard({ kpi }: { readonly kpi: Kpi }): ReactElement {
  const Icon = ICONS[kpi.icon]
  return (
    <section
      aria-label={kpi.label}
      className="group relative isolate flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-card pt-5 shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-border"
    >
      <span aria-hidden className={cn('absolute -right-10 -top-10 -z-10 size-28 rounded-full opacity-[0.14] blur-2xl transition-opacity duration-300 group-hover:opacity-25', TONE_FILL[kpi.tone])} />
      <div className="flex items-start justify-between gap-3 px-5">
        <IconChip icon={<Icon />} tone={kpi.tone} />
        <TrendChip value={kpi.change} good={kpi.good} />
      </div>
      <div className="mt-4 px-5">
        <p className="text-label font-medium text-muted-foreground">{kpi.label}</p>
        <p className="mt-0.5 text-[1.625rem] font-bold leading-8 tracking-tight text-foreground tabular">{kpi.value}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{kpi.caption}</p>
      </div>
      <Sparkline values={kpi.series} tone={kpi.tone} width={240} height={44} endDot={false} className="mt-3 h-11 w-full" />
    </section>
  )
}
