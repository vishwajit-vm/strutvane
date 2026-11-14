/**
 * The dashboard hero: a greeting, this week's headline number, two calls to action, three mini
 * stats and an original illustration, on a soft accent wash so it reads as the page's anchor.
 */
import { IconArrowUpRight, IconClockHour4, IconReceipt, IconUsers } from '@tabler/icons-react'
import type { ReactElement } from 'react'
import { GrowthIllustration } from '../../components/illustrations.tsx'
import { Button } from '../../components/ui/button.tsx'
import { IconChip, Progress } from '../../components/ui/misc.tsx'
import { currentUser } from '../../data/people.ts'
import { Link } from '../../lib/router.tsx'

const STATS = [
  { label: 'Paid', value: '128', tone: 'success', icon: <IconReceipt /> },
  { label: 'Days to pay', value: '11.4', tone: 'info', icon: <IconClockHour4 /> },
  { label: 'New clients', value: '+24', tone: 'warning', icon: <IconUsers /> },
] as const

export function WelcomeCard(): ReactElement {
  return (
    <section aria-labelledby="welcome-title" className="relative isolate flex h-full flex-col overflow-hidden rounded-xl border border-border/70 bg-linear-to-br from-primary-soft via-card to-card p-5 shadow-sm sm:p-6 dark:border-border">
      <span aria-hidden className="absolute -right-16 -top-16 -z-10 size-56 rounded-full bg-primary/10 blur-3xl" />
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-label font-semibold text-primary-soft-foreground">Friday, November 14</p>
          <h2 id="welcome-title" className="mt-1 text-xl font-bold leading-7 tracking-tight text-foreground sm:text-2xl sm:leading-8">
            Good morning, {currentUser.firstName}! 🎉
          </h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            You collected <strong className="font-bold text-foreground">$42,680</strong> this week, 18% above target. Three invoices need a nudge today.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild variant="primary">
              <Link to="/invoices">
                View invoices <IconArrowUpRight />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/invoices?status=overdue">Send reminders</Link>
            </Button>
          </div>
        </div>
        <GrowthIllustration className="hidden w-36 shrink-0 self-center sm:block xl:w-32 2xl:w-40" />
      </div>
      <div className="mt-auto pt-6">
        <div className="mb-2 flex items-baseline justify-between text-label">
          <span className="font-semibold text-foreground">Weekly collection target</span>
          <span className="text-muted-foreground tabular">
            <strong className="font-bold text-success">118%</strong> of $36,000
          </span>
        </div>
        <Progress value={100} tone="success" label="Weekly target: 118% reached" className="h-2" />
      </div>
      <ul className="grid grid-cols-3 gap-3 pt-5">
        {STATS.map((stat) => (
          <li key={stat.label} className="flex min-w-0 items-center gap-2.5 rounded-lg bg-card/70 p-2.5 ring-1 ring-border/70 backdrop-blur-sm">
            <IconChip icon={stat.icon} tone={stat.tone} size="sm" className="max-sm:hidden" />
            <div className="min-w-0">
              <p className="text-base font-bold leading-5 text-foreground tabular">{stat.value}</p>
              <p className="truncate text-xs text-muted-foreground">{stat.label}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
