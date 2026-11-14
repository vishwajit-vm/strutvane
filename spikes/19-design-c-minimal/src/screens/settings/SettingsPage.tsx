/**
 * Settings: a two-column layout with a sub-navigation (Account / Workspace) on the left and the
 * chosen section on the right. On phones the sub-navigation becomes a horizontally scrolling row
 * of pills above the content.
 */
import { Bell, KeyRound, MonitorSmartphone, ShieldCheck, UserRound, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'
import { Link } from '../../lib/router.tsx'
import { PageContainer } from '../../shell/AppShell.tsx'
import { NotFound } from '../NotFound.tsx'
import { ApiTokens } from './ApiTokens.tsx'
import { NotificationSettings } from './NotificationSettings.tsx'
import { Profile } from './Profile.tsx'
import { Security } from './Security.tsx'
import { Sessions } from './Sessions.tsx'
import { Team } from './Team.tsx'

interface Entry {
  id: string
  label: string
  icon: ReactNode
  group: 'Account' | 'Workspace'
  render: () => ReactNode
}

const ENTRIES: readonly Entry[] = [
  { id: 'profile', label: 'Profile', icon: <UserRound aria-hidden />, group: 'Account', render: () => <Profile /> },
  { id: 'security', label: 'Security', icon: <ShieldCheck aria-hidden />, group: 'Account', render: () => <Security /> },
  { id: 'sessions', label: 'Sessions', icon: <MonitorSmartphone aria-hidden />, group: 'Account', render: () => <Sessions /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell aria-hidden />, group: 'Account', render: () => <NotificationSettings /> },
  { id: 'tokens', label: 'API tokens', icon: <KeyRound aria-hidden />, group: 'Workspace', render: () => <ApiTokens /> },
  { id: 'team', label: 'Team members', icon: <Users aria-hidden />, group: 'Workspace', render: () => <Team /> },
]

function SubNav({ current }: { current: string }) {
  return (
    <nav aria-label="Settings" className="lg:sticky lg:top-0">
      <div className="relative scroll-quiet -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-5 lg:overflow-visible lg:px-0">
        {(['Account', 'Workspace'] as const).map((group) => (
          <div key={group} className="flex shrink-0 gap-1 lg:flex-col lg:gap-px">
            <h2 className="hidden h-7 items-center px-2 text-xs font-medium text-fg-subtle lg:flex">{group}</h2>
            {ENTRIES.filter((entry) => entry.group === group).map((entry) => {
              const active = entry.id === current
              return (
                <Link
                  key={entry.id}
                  to={`/settings/${entry.id}`}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-8 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-md px-2.5 text-sm text-fg-muted transition-colors hover:bg-subtle hover:text-fg [&>svg]:size-4 [&>svg]:text-fg-subtle',
                    active && 'bg-subtle font-medium text-fg [&>svg]:text-fg',
                  )}
                >
                  {entry.icon}
                  {entry.label}
                </Link>
              )
            })}
          </div>
        ))}
      </div>
    </nav>
  )
}

export function SettingsPage({ section }: { section: string }) {
  const entry = ENTRIES.find((candidate) => candidate.id === section)
  if (entry === undefined) return <NotFound />
  return (
    <PageContainer>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
        <SubNav current={entry.id} />
        <div className="min-w-0 max-w-[880px]">{entry.render()}</div>
      </div>
    </PageContainer>
  )
}

/** The heading block at the top of each settings section. */
export function SettingsHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border pb-5">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-semibold tracking-(--tracking-title) text-fg">{title}</h1>
        <p className="mt-1 text-sm text-fg-muted">{description}</p>
      </div>
      {actions !== undefined && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  )
}
