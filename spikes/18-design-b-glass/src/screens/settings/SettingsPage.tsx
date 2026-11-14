/**
 * Account settings: a side navigation (a scrollable pill row on phones) and one panel per
 * section: Profile, Security & 2FA, Sessions, Notifications and API tokens.
 */
import { IconBell, IconDevices, IconKey, IconShieldLock, IconUser, type Icon } from '@tabler/icons-react'
import { NavLink, useParams } from 'react-router'
import { PageHeader } from '../../components/PageHeader.tsx'
import { cn } from '../../lib/cn.ts'
import { NotFoundPage } from '../NotFoundPage.tsx'
import { ApiTokensPanel, NotificationsPanel, SessionsPanel } from './panels-account.tsx'
import { ProfilePanel, SecurityPanel } from './panels-profile.tsx'

const SECTIONS: readonly { id: string; label: string; description: string; icon: Icon }[] = [
  { id: 'profile', label: 'Profile', description: 'Name, photo and contact details', icon: IconUser },
  { id: 'security', label: 'Security & 2FA', description: 'Password and two-factor', icon: IconShieldLock },
  { id: 'sessions', label: 'Sessions', description: 'Where you are signed in', icon: IconDevices },
  { id: 'notifications', label: 'Notifications', description: 'E-mail and in-app alerts', icon: IconBell },
  { id: 'api-tokens', label: 'API tokens', description: 'Programmatic access', icon: IconKey },
]

export function SettingsPage() {
  const { section = 'profile' } = useParams()
  const current = SECTIONS.find((candidate) => candidate.id === section)
  if (current === undefined) return <NotFoundPage />
  return (
    <>
      <PageHeader breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Settings', to: '/settings/profile' }, { label: current.label }]} title="Account settings" description="Manage your profile, security and how Strutvane talks to you." />
      <div className="grid items-start gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="glass-card scroll-thin flex gap-1 overflow-x-auto rounded-xl p-1.5 lg:sticky lg:top-[calc(var(--topbar-height)+var(--chrome-gap)*2+1rem)] lg:flex-col">
          {SECTIONS.map((item) => (
            <NavLink
              key={item.id}
              to={`/settings/${item.id}`}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-3 rounded-md px-3 py-2.5 transition-base',
                  isActive ? 'bg-surface text-fg shadow-glass' : 'text-fg-muted hover:bg-glass-hover hover:text-fg',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={cn('size-[1.15rem] shrink-0', isActive && 'text-primary-text')} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-base font-semibold whitespace-nowrap">{item.label}</span>
                    <span className="hidden truncate text-xs text-fg-muted lg:block">{item.description}</span>
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0">
          {section === 'profile' && <ProfilePanel />}
          {section === 'security' && <SecurityPanel />}
          {section === 'sessions' && <SessionsPanel />}
          {section === 'notifications' && <NotificationsPanel />}
          {section === 'api-tokens' && <ApiTokensPanel />}
        </div>
      </div>
    </>
  )
}
