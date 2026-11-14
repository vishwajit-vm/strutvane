/**
 * Three dashboard cards of the third row: collection goal (gradient progress ring), top-selling
 * plans (chip + sparkline + share bar) and the recent-activity timeline.
 *
 * @module
 */
import { IconBriefcase, IconCrown, IconDatabaseExport, IconHeadset, IconRocket } from '@tabler/icons-react'
import { useId, type ReactElement } from 'react'
import { CardMenu } from '../../components/card-menu.tsx'
import { Sparkline, Timeline } from '../../components/data-display.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx'
import { IconChip, Progress } from '../../components/ui/misc.tsx'
import { recentActivity, topItems } from '../../data/dashboard.ts'
import { formatCompactMoney, formatRelative, TODAY } from '../../lib/format.ts'
import { Link } from '../../lib/router.tsx'

/** A circular progress ring drawn with the brand gradient. */
function GoalRing({ value }: { readonly value: number }): ReactElement {
  const gradient = useId()
  const radius = 52
  const circumference = 2 * Math.PI * radius
  return (
    <div role="img" aria-label={`${value}% of the monthly goal collected`} className="relative mx-auto size-40">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--primary)" />
            <stop offset="1" stopColor="var(--chart-2)" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--subtle)" strokeWidth="10" />
        <circle cx="60" cy="60" r={radius} fill="none" stroke={`url(#${gradient})`} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(value / 100) * circumference} ${circumference}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tracking-tight text-foreground tabular">{value}%</span>
        <span className="text-xs text-muted-foreground">of goal</span>
      </div>
    </div>
  )
}

export function GoalCard(): ReactElement {
  const rows = [
    { label: 'Collected', value: '$248.6K', tone: 'bg-primary' },
    { label: 'Outstanding', value: '$51.9K', tone: 'bg-chart-2' },
    { label: 'Monthly goal', value: '$320K', tone: 'bg-subtle' },
  ] as const
  return (
    <Card className="h-full">
      <CardHeader>
        <div>
          <CardTitle>Collection goal</CardTitle>
          <CardDescription>November target</CardDescription>
        </div>
        <CardMenu label="Goal options" />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-6">
        <GoalRing value={78} />
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.label} className="flex items-center gap-3 text-sm">
              <span aria-hidden className={`size-2.5 rounded-full ${row.tone}`} />
              <span className="flex-1 text-muted-foreground">{row.label}</span>
              <span className="font-semibold text-foreground tabular">{row.value}</span>
            </li>
          ))}
        </ul>
        <p className="rounded-lg bg-success-soft px-3 py-2 text-label font-medium text-success">On track: 16 days left, $3.8K a day needed.</p>
      </CardContent>
    </Card>
  )
}

const ITEM_ICONS = [IconCrown, IconRocket, IconBriefcase, IconDatabaseExport, IconHeadset] as const
const ITEM_TRENDS: readonly (readonly number[])[] = [
  [8, 10, 9, 12, 14, 13, 16],
  [12, 11, 13, 12, 15, 17, 16],
  [5, 7, 6, 8, 7, 9, 11],
  [9, 8, 7, 8, 6, 7, 6],
  [3, 4, 4, 5, 6, 6, 7],
]

export function TopItemsCard(): ReactElement {
  return (
    <Card className="h-full">
      <CardHeader>
        <div>
          <CardTitle>Top plans & services</CardTitle>
          <CardDescription>By revenue this month</CardDescription>
        </div>
        <CardMenu label="Top items options" />
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-5">
          {topItems.map((item, index) => {
            const Icon = ITEM_ICONS[index] ?? IconCrown
            return (
              <li key={item.name} className="flex items-center gap-3">
                <IconChip icon={<Icon />} tone={item.tone} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
                    <p className="text-sm font-bold text-foreground tabular">{formatCompactMoney(item.revenue)}</p>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3">
                    <Progress value={item.share * 2.2} tone={item.tone} label={`${item.name}: ${item.share}% of revenue`} />
                    <span className="w-8 shrink-0 text-right text-xs text-muted-foreground tabular">{item.share}%</span>
                  </div>
                </div>
                <Sparkline values={ITEM_TRENDS[index] ?? []} tone={item.tone} className="hidden h-8 w-14 shrink-0 sm:block" />
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

export function ActivityCard(): ReactElement {
  return (
    <Card className="h-full">
      <CardHeader>
        <div>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>Across your workspace</CardDescription>
        </div>
        <CardMenu label="Activity options" />
      </CardHeader>
      <CardContent>
        <Timeline
          entries={recentActivity.map((item) => ({
            id: item.id,
            tone: item.tone,
            time: formatRelative(new Date(TODAY.getTime() - item.minutesAgo * 60_000)),
            title: (
              <>
                <span className="font-semibold">{item.actor}</span> <span className="text-muted-foreground">{item.action}</span>{' '}
                {item.target.startsWith('INV-') ? (
                  <Link to={`/invoices/${item.target}`} className="font-semibold text-primary-soft-foreground hover:underline">
                    {item.target}
                  </Link>
                ) : (
                  <span className="font-semibold">{item.target}</span>
                )}
              </>
            ),
            ...(item.detail === undefined ? {} : { body: item.detail }),
          }))}
        />
      </CardContent>
    </Card>
  )
}
