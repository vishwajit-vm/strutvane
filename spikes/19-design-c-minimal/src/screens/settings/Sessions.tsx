/**
 * Sessions: every device signed in to the account, with the current one marked and the others
 * revocable one by one or all at once (each behind a confirmation).
 */
import { Laptop, LogOut, Smartphone, Tablet } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '../../components/ui/badge.tsx'
import { Button } from '../../components/ui/button.tsx'
import { useToast } from '../../components/ui/toast.tsx'
import { type Session, sessions as seed } from '../../data/activity.ts'
import { formatRelative } from '../../lib/format.ts'
import { useOverlays } from '../../shell/overlays.tsx'
import { SettingsHeader } from './SettingsPage.tsx'

const ICONS = { laptop: Laptop, phone: Smartphone, tablet: Tablet } as const

export function Sessions() {
  const [items, setItems] = useState<readonly Session[]>(seed)
  const { confirm } = useOverlays()
  const toast = useToast()
  const others = items.filter((session) => !session.current)

  const revoke = async (targets: readonly Session[]) => {
    const one = targets.length === 1 ? targets[0] : undefined
    const ok = await confirm({
      title: one !== undefined ? `Sign out ${one.device}?` : `Sign out ${targets.length} other sessions?`,
      description: 'The device must sign in again, including two-factor authentication.',
      confirmLabel: one !== undefined ? 'Sign out device' : 'Sign out all',
    })
    if (!ok) return
    const ids = new Set(targets.map((target) => target.id))
    setItems((current) => current.filter((session) => !ids.has(session.id)))
    toast({ title: one !== undefined ? `${one.device} signed out` : 'Other sessions signed out' })
  }

  return (
    <div>
      <SettingsHeader
        title="Sessions"
        description="Devices signed in to your account. Sign out anything you don’t recognise."
        actions={
          <Button disabled={others.length === 0} onClick={() => void revoke(others)}>
            <LogOut aria-hidden /> Sign out all others
          </Button>
        }
      />
      <ul className="mt-6 divide-y divide-border rounded-lg border border-border">
        {items.map((session) => {
          const Icon = ICONS[session.kind]
          return (
            <li key={session.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-subtle text-fg-muted">
                <Icon aria-hidden className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                  {session.device} <span className="font-normal text-fg-subtle">· {session.browser}</span>
                  {session.current && <Badge tone="accent">This device</Badge>}
                </p>
                <p className="mt-0.5 text-sm text-fg-muted">
                  {session.location} · <span className="num text-xs">{session.ip}</span>
                </p>
              </div>
              <span className="text-sm text-fg-subtle">{session.current ? 'Active now' : formatRelative(session.lastActiveAt)}</span>
              {!session.current && (
                <Button size="sm" onClick={() => void revoke([session])}>
                  Sign out
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      <p className="mt-4 text-xs text-fg-subtle">Sessions expire after 30 days without activity. Locations are approximate, based on IP address.</p>
    </div>
  )
}
