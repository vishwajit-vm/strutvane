/**
 * User profile: a gradient cover with the avatar overlapping it, name, title and quick facts;
 * then About + stats on the left and an activity timeline + teams on the right.
 */
import { IconBriefcase, IconCalendar, IconCheck, IconFileInvoice, IconMail, IconMapPin, IconPencil, IconPhone, IconUserCheck, IconWorld } from '@tabler/icons-react'
import type { ReactElement } from 'react'
import { Timeline } from '../../components/data-display.tsx'
import { CoverPattern } from '../../components/illustrations.tsx'
import { Badge } from '../../components/ui/badge.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx'
import { Avatar, AvatarGroup, IconChip } from '../../components/ui/misc.tsx'
import { recentActivity } from '../../data/dashboard.ts'
import { currentUser, team } from '../../data/people.ts'
import { formatRelative, TODAY } from '../../lib/format.ts'
import { Link } from '../../lib/router.tsx'

export function ProfilePage(): ReactElement {
  const facts = [
    { icon: IconBriefcase, text: currentUser.title },
    { icon: IconMapPin, text: currentUser.location },
    { icon: IconCalendar, text: `Joined ${currentUser.joined}` },
  ]
  return (
    <>
      <section aria-label="Profile header" className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm dark:border-border">
        <div className="relative h-36 bg-brand-gradient sm:h-44">
          <CoverPattern className="absolute inset-0" />
        </div>
        <div className="flex flex-col gap-4 px-5 pb-6 sm:flex-row sm:items-end sm:gap-6 sm:px-6">
          <Avatar name={currentUser.name} size="xl" status="online" className="-mt-12 shrink-0 ring-4 ring-card sm:-mt-10" />
          <div className="min-w-0 flex-1 sm:pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{currentUser.name}</h1>
              <Badge tone="primary">Owner</Badge>
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
              {facts.map((fact) => (
                <li key={fact.text} className="flex items-center gap-1.5">
                  <fact.icon aria-hidden className="size-4.5" />
                  {fact.text}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex gap-2 sm:pb-1">
            <Button variant="outline">
              <IconMail /> Message
            </Button>
            <Button asChild variant="primary">
              <Link to="/settings/profile">
                <IconPencil /> Edit profile
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>About</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <p className="text-sm leading-6 text-muted-foreground">{currentUser.bio}</p>
              <ul className="flex flex-col gap-3.5 text-sm">
                {[
                  { icon: IconMail, label: 'Email', value: currentUser.email },
                  { icon: IconPhone, label: 'Phone', value: currentUser.phone },
                  { icon: IconWorld, label: 'Time zone', value: currentUser.timezone },
                  { icon: IconUserCheck, label: 'Status', value: 'Active · 2FA on' },
                ].map((row) => (
                  <li key={row.label} className="flex items-center gap-3">
                    <row.icon aria-hidden className="size-4.5 shrink-0 text-muted-foreground" />
                    <span className="w-20 shrink-0 text-muted-foreground">{row.label}</span>
                    <span className="min-w-0 truncate font-medium">{row.value}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>This quarter</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              {[
                { label: 'Invoices sent', value: '312', tone: 'primary', icon: <IconFileInvoice /> },
                { label: 'Approvals', value: '48', tone: 'success', icon: <IconCheck /> },
              ].map((stat) => (
                <div key={stat.label} className="flex flex-col gap-3 rounded-lg border border-border p-4">
                  <IconChip icon={stat.icon} tone={stat.tone === 'primary' ? 'primary' : 'success'} size="sm" />
                  <div>
                    <p className="text-xl font-bold tabular">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Teams</CardTitle>
                <CardDescription>Member of 3 teams</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-4">
                {[
                  { name: 'Finance', members: team.slice(0, 6) },
                  { name: 'Leadership', members: team.slice(2, 5) },
                  { name: 'Revenue operations', members: team.slice(3, 9) },
                ].map((group) => (
                  <li key={group.name} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{group.name}</p>
                      <p className="text-xs text-muted-foreground">{group.members.length} members</p>
                    </div>
                    <AvatarGroup people={group.members} max={3} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Activity</CardTitle>
              <CardDescription>What Amara and her team did recently</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Timeline
              entries={recentActivity.map((item) => ({
                id: item.id,
                tone: item.tone,
                time: formatRelative(new Date(TODAY.getTime() - item.minutesAgo * 60_000)),
                title: (
                  <>
                    <span className="font-semibold">{item.actor}</span> <span className="text-muted-foreground">{item.action}</span> <span className="font-semibold">{item.target}</span>
                  </>
                ),
                ...(item.detail === undefined ? {} : { body: item.detail }),
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
