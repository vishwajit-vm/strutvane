/**
 * Account settings: pill tabs (Profile, Security, Sessions, Notifications, API tokens), each
 * with its own URL so a tab can be linked to directly (`/settings/security`).
 */
import { IconBell, IconDevices, IconKey, IconShieldLock, IconUser } from '@tabler/icons-react'
import type { ReactElement } from 'react'
import { PageHeader } from '../../components/page-header.tsx'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs.tsx'
import { navigate } from '../../lib/router.tsx'
import { ApiTokensTab, NotificationsTab, ProfileTab, SecurityTab, SessionsTab } from './settings-tabs.tsx'

export type SettingsTab = 'profile' | 'security' | 'sessions' | 'notifications' | 'api-tokens'

const TABS: readonly { readonly id: SettingsTab; readonly label: string; readonly icon: ReactElement; readonly panel: () => ReactElement }[] = [
  { id: 'profile', label: 'Profile', icon: <IconUser />, panel: ProfileTab },
  { id: 'security', label: 'Security', icon: <IconShieldLock />, panel: SecurityTab },
  { id: 'sessions', label: 'Sessions', icon: <IconDevices />, panel: SessionsTab },
  { id: 'notifications', label: 'Notifications', icon: <IconBell />, panel: NotificationsTab },
  { id: 'api-tokens', label: 'API tokens', icon: <IconKey />, panel: ApiTokensTab },
]

export function SettingsPage({ tab }: { readonly tab: SettingsTab }): ReactElement {
  return (
    <>
      <PageHeader breadcrumbs={[{ label: 'Account' }, { label: 'Settings' }]} title="Account settings" description="Manage your profile, security and how Strutvane talks to you." />
      <Tabs value={tab} onValueChange={(value) => navigate(`/settings/${value}`, { replace: true })}>
        <TabsList aria-label="Settings sections" className="mb-6">
          {TABS.map((item) => (
            <TabsTrigger key={item.id} value={item.id}>
              {item.icon}
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((item) => (
          <TabsContent key={item.id} value={item.id} className="flex flex-col gap-6">
            <item.panel />
          </TabsContent>
        ))}
      </Tabs>
    </>
  )
}
