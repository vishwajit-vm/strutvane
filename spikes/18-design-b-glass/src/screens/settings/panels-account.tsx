/**
 * Settings panels: Sessions (sign out other devices), Notifications (a matrix of switches) and
 * API tokens (create once, show once, revoke with confirmation).
 */
import { IconCopy, IconDeviceDesktop, IconDeviceLaptop, IconDeviceMobile, IconKey, IconPlus, IconTrash } from '@tabler/icons-react'
import { useState } from 'react'
import { Badge } from '../../components/ui/badge.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Card, CardBody, CardHeader } from '../../components/ui/card.tsx'
import { useConfirm } from '../../components/ui/confirm.tsx'
import { Dialog } from '../../components/ui/dialog.tsx'
import { Field } from '../../components/ui/field.tsx'
import { Input } from '../../components/ui/input.tsx'
import { Checkbox, Switch } from '../../components/ui/toggles.tsx'
import { useToast } from '../../components/ui/toast.tsx'
import { API_TOKENS, NOTIFICATION_PREFERENCES, SESSIONS, type ApiToken, type Session } from '../../data/workspace.ts'

const DEVICE_ICON = { laptop: IconDeviceLaptop, mobile: IconDeviceMobile, desktop: IconDeviceDesktop } as const

export function SessionsPanel() {
  const toast = useToast()
  const confirm = useConfirm()
  const [sessions, setSessions] = useState<readonly Session[]>(SESSIONS)
  const signOutOthers = async (): Promise<void> => {
    if (await confirm({ title: 'Sign out of all other sessions?', description: 'Every device except this one will need to sign in again.', confirmLabel: 'Sign out others', destructive: true })) {
      setSessions((list) => list.filter((session) => session.current))
      toast({ title: 'Other sessions signed out' })
    }
  }
  return (
    <Card material="solid">
      <CardHeader
        title="Active sessions"
        description="Devices signed in to your account. Sign out any you don’t recognise."
        actions={
          sessions.length > 1 ? (
            <Button variant="secondary" size="sm" onClick={() => void signOutOthers()}>
              Sign out others
            </Button>
          ) : undefined
        }
      />
      <ul className="divide-y divide-border border-t border-border">
        {sessions.map((session) => {
          const DeviceIcon = DEVICE_ICON[session.kind]
          return (
            <li key={session.id} className="flex flex-wrap items-center gap-4 px-6 py-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-md bg-neutral-soft text-fg-muted" aria-hidden>
                <DeviceIcon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-base font-semibold text-fg">
                  {session.device}
                  {session.current && (
                    <Badge tone="success" dot>
                      This device
                    </Badge>
                  )}
                </p>
                <p className="text-sm text-fg-muted">
                  {session.browser} · {session.location} · {session.lastActive}
                </p>
              </div>
              {!session.current && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSessions((list) => list.filter((candidate) => candidate.id !== session.id))
                    toast({ title: `Signed out of ${session.device}` })
                  }}
                >
                  Sign out
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

export function NotificationsPanel() {
  const toast = useToast()
  const [prefs, setPrefs] = useState(NOTIFICATION_PREFERENCES)
  const [digest, setDigest] = useState(true)
  const update = (id: string, channel: 'email' | 'inApp', on: boolean): void => setPrefs((list) => list.map((pref) => (pref.id === id ? { ...pref, [channel]: on } : pref)))
  return (
    <Card material="solid">
      <CardHeader title="Notifications" description="Choose what reaches you, and where." />
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[32rem] text-base">
          <thead>
            <tr className="border-y border-border bg-surface-muted text-2xs font-semibold tracking-[0.08em] text-fg-muted uppercase">
              <th scope="col" className="py-2.5 pr-3 pl-6 text-left">
                Event
              </th>
              <th scope="col" className="w-24 px-3 py-2.5 text-center">
                E-mail
              </th>
              <th scope="col" className="w-24 py-2.5 pr-6 pl-3 text-center">
                In-app
              </th>
            </tr>
          </thead>
          <tbody>
            {prefs.map((pref) => {
              const locked = pref.id === 'security'
              return (
                <tr key={pref.id} className="border-b border-border">
                  <td className="py-4 pr-3 pl-6">
                    <p className="font-semibold text-fg">{pref.label}</p>
                    <p className="text-sm text-fg-muted">{pref.description}</p>
                  </td>
                  <td className="px-3 py-4 text-center">
                    <Switch checked={pref.email} disabled={locked} onCheckedChange={(on) => update(pref.id, 'email', on)} aria-label={`${pref.label} by e-mail`} />
                  </td>
                  <td className="py-4 pr-6 pl-3 text-center">
                    <Switch checked={pref.inApp} disabled={locked} onCheckedChange={(on) => update(pref.id, 'inApp', on)} aria-label={`${pref.label} in the app`} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <CardBody className="pt-5">
        <label className="flex items-start gap-3">
          <Checkbox checked={digest} onCheckedChange={setDigest} className="mt-0.5" />
          <span>
            <span className="block text-base font-semibold text-fg">Weekly summary</span>
            <span className="block text-sm text-fg-muted">A Monday e-mail with last week’s revenue, collections and overdue invoices.</span>
          </span>
        </label>
      </CardBody>
      <div className="flex justify-end border-t border-border px-6 py-4">
        <Button onClick={() => toast({ title: 'Notification preferences saved' })}>Save preferences</Button>
      </div>
    </Card>
  )
}

export function ApiTokensPanel() {
  const toast = useToast()
  const confirm = useConfirm()
  const [tokens, setTokens] = useState<readonly ApiToken[]>(API_TOKENS)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | undefined>(undefined)
  const [created, setCreated] = useState<string | null>(null)

  const create = (): void => {
    if (name.trim() === '') {
      setNameError('Give the token a name so you can recognise it later.')
      return
    }
    // A mock secret, generated locally and shown once (never stored in the page after closing).
    const secret = `sv_pat_${Array.from(crypto.getRandomValues(new Uint8Array(18)), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
    setTokens((list) => [{ id: `t${String(list.length + 1)}`, name: name.trim(), suffix: secret.slice(-4), scopes: ['invoices:read'], lastUsed: 'Never', expires: 'Feb 12, 2027' }, ...list])
    setCreated(secret)
    setNameError(undefined)
  }
  const close = (): void => {
    setCreating(false)
    setCreated(null)
    setName('')
  }
  const revoke = async (token: ApiToken): Promise<void> => {
    if (await confirm({ title: `Revoke “${token.name}”?`, description: 'Apps using this token stop working immediately. This cannot be undone.', confirmLabel: 'Revoke token', destructive: true })) {
      setTokens((list) => list.filter((candidate) => candidate.id !== token.id))
      toast({ title: 'Token revoked' })
    }
  }

  return (
    <Card material="solid">
      <CardHeader
        title="API tokens"
        description="Tokens act as you. Give each one only the scopes it needs."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <IconPlus aria-hidden /> New token
          </Button>
        }
      />
      <ul className="divide-y divide-border border-t border-border">
        {tokens.map((token) => (
          <li key={token.id} className="flex flex-wrap items-center gap-4 px-6 py-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary-soft text-primary-soft-fg" aria-hidden>
              <IconKey className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-fg">{token.name}</p>
              <p className="font-mono text-xs text-fg-muted">sv_pat_••••••••{token.suffix}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {token.scopes.map((scope) => (
                  <Badge key={scope} tone="neutral" className="font-mono">
                    {scope}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="text-right text-xs text-fg-muted">
              <p>Last used {token.lastUsed}</p>
              <p>Expires {token.expires}</p>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label={`Revoke ${token.name}`} onClick={() => void revoke(token)} className="hover:bg-danger-soft hover:text-danger">
              <IconTrash aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <Dialog
        open={creating}
        onOpenChange={(open) => !open && close()}
        title={created === null ? 'Create API token' : 'Copy your new token'}
        description={created === null ? 'Name it after the app that will use it.' : 'This is the only time it is shown. Store it in a secret manager.'}
        footer={
          created === null ? (
            <>
              <Button variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button onClick={create}>Create token</Button>
            </>
          ) : (
            <Button onClick={close}>Done</Button>
          )
        }
      >
        {created === null ? (
          <Field label="Token name" required error={nameError}>
            {(control) => <Input {...control} value={name} placeholder="e.g. Accounting sync" onChange={(event) => setName(event.target.value)} />}
          </Field>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface p-3">
            <code className="min-w-0 flex-1 truncate font-mono text-sm text-fg">{created}</code>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(created)
                toast({ title: 'Token copied' })
              }}
            >
              <IconCopy aria-hidden /> Copy
            </Button>
          </div>
        )}
      </Dialog>
    </Card>
  )
}
