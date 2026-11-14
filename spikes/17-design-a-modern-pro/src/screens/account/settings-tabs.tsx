/**
 * The five account-settings panels. Each is a column of cards using the shared form pieces.
 *
 * @module
 */
import {
  IconAlertTriangle,
  IconCopy,
  IconDeviceDesktop,
  IconDeviceIpad,
  IconDeviceMobile,
  IconDownload,
  IconInfoCircle,
  IconKey,
  IconLogout,
  IconMessage2,
  IconPlus,
  IconShieldCheck,
  IconUpload,
  IconUsb,
} from '@tabler/icons-react'
import { useState, type ReactElement, type ReactNode } from 'react'
import { ShieldIllustration } from '../../components/illustrations.tsx'
import { Badge } from '../../components/ui/badge.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../components/ui/card.tsx'
import { Checkbox, Switch } from '../../components/ui/checkbox.tsx'
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog.tsx'
import { Field, fieldAria, Label } from '../../components/ui/field.tsx'
import { Input } from '../../components/ui/input.tsx'
import { Avatar, IconChip, Progress } from '../../components/ui/misc.tsx'
import { Select } from '../../components/ui/select.tsx'
import { toast } from '../../components/ui/toast.tsx'
import { apiTokens, notificationPreferences, sessions, type Session } from '../../data/account.ts'
import { currentUser } from '../../data/people.ts'
import { cn } from '../../lib/cn.ts'

function SaveFooter({ label = 'Save changes' }: { readonly label?: string }): ReactElement {
  return (
    <CardFooter className="justify-end">
      <Button variant="ghost">Cancel</Button>
      <Button variant="primary" onClick={() => toast({ tone: 'success', title: 'Settings saved' })}>
        {label}
      </Button>
    </CardFooter>
  )
}

function Header({ title, description, action }: { readonly title: string; readonly description: string; readonly action?: ReactNode }): ReactElement {
  return (
    <CardHeader>
      <div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </div>
      {action}
    </CardHeader>
  )
}

export function ProfileTab(): ReactElement {
  const [confirmed, setConfirmed] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [language, setLanguage] = useState('en')
  const [zone, setZone] = useState('cph')
  return (
    <>
      <Card>
        <Header title="Profile details" description="How you appear to your team and on invoices you send." />
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Avatar name={currentUser.name} size="xl" className="size-20 text-2xl" />
            <div>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="sm">
                  <IconUpload /> Upload new photo
                </Button>
                <Button variant="outline" size="sm">
                  Reset
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">JPG, PNG or GIF. At least 256 × 256 px, up to 2 MB.</p>
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="first-name" label="First name">
              <Input id="first-name" defaultValue="Amara" autoComplete="given-name" />
            </Field>
            <Field id="last-name" label="Last name">
              <Input id="last-name" defaultValue="Lindqvist" autoComplete="family-name" />
            </Field>
            <Field id="profile-email" label="Email" hint="Changing it sends a confirmation link to the new address.">
              <Input id="profile-email" type="email" defaultValue={currentUser.email} autoComplete="email" {...fieldAria('profile-email', undefined, true)} />
            </Field>
            <Field id="phone" label="Phone">
              <Input id="phone" type="tel" defaultValue={currentUser.phone} autoComplete="tel" />
            </Field>
            <Field id="job-title" label="Job title">
              <Input id="job-title" defaultValue={currentUser.title} />
            </Field>
            <Field id="company" label="Company">
              <Input id="company" defaultValue={currentUser.company} />
            </Field>
            <Field id="language" label="Language">
              <Select id="language" value={language} onValueChange={setLanguage} options={[{ value: 'en', label: 'English (US)' }, { value: 'da', label: 'Dansk' }, { value: 'de', label: 'Deutsch' }, { value: 'es', label: 'Español' }]} />
            </Field>
            <Field id="timezone" label="Time zone">
              <Select id="timezone" value={zone} onValueChange={setZone} options={[{ value: 'cph', label: 'Europe/Copenhagen', hint: 'UTC+1' }, { value: 'lon', label: 'Europe/London', hint: 'UTC+0' }, { value: 'nyc', label: 'America/New_York', hint: 'UTC−5' }]} />
            </Field>
          </div>
        </CardContent>
        <SaveFooter />
      </Card>
      <Card className="border-danger/40 dark:border-danger/40">
        <Header title="Delete account" description="Permanently remove your account and personal data from this workspace." />
        <CardContent className="flex flex-col gap-4">
          <div className="flex gap-3 rounded-lg bg-danger-soft p-4 text-danger">
            <IconAlertTriangle aria-hidden className="size-5 shrink-0" />
            <div className="text-label">
              <p className="font-semibold">This cannot be undone.</p>
              <p>Invoices you created stay with the workspace; your sign-in, sessions and API tokens are removed.</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Checkbox id="confirm-delete" checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} />
            <Label htmlFor="confirm-delete" className="font-medium">
              I understand, delete my account
            </Label>
          </div>
          <Button variant="danger" className="self-start" disabled={!confirmed} onClick={() => setDialogOpen(true)}>
            Delete account
          </Button>
        </CardContent>
      </Card>
      <ConfirmDialog open={dialogOpen} onOpenChange={setDialogOpen} title="Delete your account?" description="You will be signed out everywhere and lose access to Halyard Systems immediately." confirmLabel="Yes, delete my account" onConfirm={() => toast({ tone: 'danger', title: 'Account scheduled for deletion' })} />
    </>
  )
}

/** A rough password strength score (0–4) for the meter; the server enforces the real policy. */
export function passwordStrength(password: string): number {
  let score = 0
  if (password.length >= 8) score += 1
  if (password.length >= 12) score += 1
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1
  return score
}

export function SecurityTab(): ReactElement {
  const [password, setPassword] = useState('')
  const [codesOpen, setCodesOpen] = useState(false)
  const strength = passwordStrength(password)
  const strengthLabel = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][strength] ?? 'Too short'
  const methods = [
    { icon: <IconShieldCheck />, title: 'Authenticator app', description: 'Codes from 1Password, Authy or Google Authenticator.', status: <Badge tone="success" dot>Enabled</Badge>, action: 'Reconfigure' },
    { icon: <IconUsb />, title: 'Security keys', description: '2 keys registered: YubiKey 5C, MacBook Touch ID.', status: <Badge tone="success" dot>2 keys</Badge>, action: 'Manage' },
    { icon: <IconMessage2 />, title: 'SMS backup', description: 'Least secure; use only as a fallback.', status: <Badge tone="neutral">Not set</Badge>, action: 'Set up' },
  ]
  return (
    <>
      <Card>
        <Header title="Change password" description="Use at least 12 characters with a mix of letters, numbers and symbols." />
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field id="current-password" label="Current password" className="sm:col-span-2 sm:max-w-[calc(50%-0.625rem)]">
            <Input id="current-password" type="password" autoComplete="current-password" />
          </Field>
          <Field id="new-password" label="New password">
            <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} aria-describedby="strength" />
          </Field>
          <Field id="confirm-password" label="Confirm new password">
            <Input id="confirm-password" type="password" autoComplete="new-password" />
          </Field>
          <div id="strength" className="flex items-center gap-3 sm:col-span-2">
            <div className="grid flex-1 grid-cols-4 gap-1.5" aria-hidden>
              {[1, 2, 3, 4].map((step) => (
                <span key={step} className={cn('h-1.5 rounded-full', step <= strength ? (strength <= 1 ? 'bg-danger' : strength === 2 ? 'bg-warning' : 'bg-success') : 'bg-subtle')} />
              ))}
            </div>
            <span className="w-20 text-right text-xs font-semibold text-muted-foreground">{password === '' ? 'Strength' : strengthLabel}</span>
          </div>
        </CardContent>
        <SaveFooter label="Update password" />
      </Card>
      <Card>
        <Header title="Two-factor authentication" description="A second step at sign-in keeps your account safe even if your password leaks." action={<Badge tone="success" dot>On</Badge>} />
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col items-start gap-5 rounded-xl bg-success-soft/60 p-5 sm:flex-row sm:items-center">
            <ShieldIllustration className="w-20 shrink-0" />
            <div className="flex-1">
              <p className="text-base font-semibold text-foreground">Your account is well protected</p>
              <p className="mt-1 text-sm text-muted-foreground">2FA has been on since March 2024. Keep your recovery codes somewhere safe: they are the only way in if you lose your devices.</p>
            </div>
            <Button variant="outline" onClick={() => setCodesOpen(true)}>
              View recovery codes
            </Button>
          </div>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {methods.map((method) => (
              <li key={method.title} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <IconChip icon={method.icon} tone="primary" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{method.title}</p>
                    {method.status}
                  </div>
                  <p className="text-label text-muted-foreground">{method.description}</p>
                </div>
                <Button variant="outline" size="sm">
                  {method.action}
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Dialog open={codesOpen} onOpenChange={setCodesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recovery codes</DialogTitle>
            <DialogDescription>Each code works once. Store them in a password manager. (Mock values.)</DialogDescription>
          </DialogHeader>
          <ul className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-4 font-mono text-sm">
            {['k7f2-9qxm', 'p3dr-8vla', 'z9tn-2hwe', 'c4jy-6bus', 'm8eq-1rko', 'w2xv-5ndf', 'h6gs-3zpa', 'b1lc-7tmy'].map((code) => (
              <li key={code} className="tabular">
                {code}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => toast({ tone: 'success', title: 'Codes downloaded' })}>
              <IconDownload /> Download
            </Button>
            <Button variant="primary" onClick={() => toast({ tone: 'success', title: 'Copied to clipboard' })}>
              <IconCopy /> Copy all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

const DEVICE_ICONS: Readonly<Record<Session['device'], ReactElement>> = { desktop: <IconDeviceDesktop />, phone: <IconDeviceMobile />, tablet: <IconDeviceIpad /> }

export function SessionsTab(): ReactElement {
  const [list, setList] = useState(sessions)
  const [confirmAll, setConfirmAll] = useState(false)
  return (
    <>
      <Card className="pb-0 sm:pb-0">
        <Header
          title="Active sessions"
          description="Devices signed in to your account. Revoke any you don’t recognise."
          action={
            <Button variant="outline" size="sm" onClick={() => setConfirmAll(true)} disabled={list.length <= 1}>
              <IconLogout /> Sign out others
            </Button>
          }
        />
        <CardContent flush>
          <ul className="divide-y divide-border border-t border-border">
            {list.map((session) => (
              <li key={session.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
                <IconChip icon={DEVICE_ICONS[session.device]} tone={session.current ? 'success' : 'neutral'} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">
                      {session.browser} on {session.os}
                    </p>
                    {session.current ? <Badge tone="success" dot>This device</Badge> : null}
                  </div>
                  <p className="text-label text-muted-foreground">
                    {session.location} · {session.ip} · {session.lastActive}
                  </p>
                </div>
                {session.current ? null : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setList(list.filter((item) => item.id !== session.id))
                      toast({ tone: 'success', title: 'Session revoked', description: `${session.browser} on ${session.os} was signed out.` })
                    }}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title="Sign out all other sessions?"
        description="Every device except this one will need to sign in again. Use this if you think someone else has access."
        confirmLabel="Sign out others"
        onConfirm={() => {
          setList(list.filter((item) => item.current))
          toast({ tone: 'success', title: 'Signed out of all other sessions' })
        }}
      />
    </>
  )
}

export function NotificationsTab(): ReactElement {
  const [prefs, setPrefs] = useState(notificationPreferences)
  const [digest, setDigest] = useState(true)
  const channels = [
    { key: 'email', label: 'Email' },
    { key: 'browser', label: 'Browser' },
    { key: 'app', label: 'Mobile app' },
  ] as const
  return (
    <Card className="pb-0 sm:pb-0">
      <Header title="Notifications" description="Choose what you hear about, and where." />
      <CardContent flush className="scrollbar-thin relative overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-y border-border bg-muted text-left text-overline font-semibold uppercase text-muted-foreground">
              <th scope="col" className="py-3 pl-5 pr-3 font-semibold sm:pl-6">Event</th>
              {channels.map((channel) => (
                <th key={channel.key} scope="col" className="w-28 px-3 py-3 text-center font-semibold">
                  {channel.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {prefs.map((pref) => (
              <tr key={pref.id} className="border-b border-border">
                <th scope="row" className="py-4 pl-5 pr-3 text-left font-normal sm:pl-6">
                  <span className="block font-semibold">{pref.label}</span>
                  <span className="block text-label text-muted-foreground">{pref.description}</span>
                </th>
                {channels.map((channel) => (
                  <td key={channel.key} className="px-3 py-4 text-center">
                    <Checkbox
                      aria-label={`${pref.label} by ${channel.label}`}
                      checked={pref[channel.key]}
                      disabled={pref.id === 'security' && channel.key === 'email'}
                      onCheckedChange={(value) => setPrefs(prefs.map((item) => (item.id === pref.id ? { ...item, [channel.key]: value === true } : item)))}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
      <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <Switch id="digest" checked={digest} onCheckedChange={setDigest} />
          <Label htmlFor="digest" className="font-medium">
            Bundle non-urgent emails into one daily digest (8:00)
          </Label>
        </div>
        <Button variant="primary" onClick={() => toast({ tone: 'success', title: 'Notification preferences saved' })}>
          Save preferences
        </Button>
      </div>
    </Card>
  )
}

const SCOPES = ['invoices:read', 'invoices:write', 'customers:read', 'payments:read', 'reports:read'] as const

export function ApiTokensTab(): ReactElement {
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | undefined>()
  const [expiry, setExpiry] = useState('90')
  const [scopes, setScopes] = useState<readonly string[]>(['invoices:read'])
  const [created, setCreated] = useState<string | null>(null)

  const create = (): void => {
    if (name.trim() === '') {
      setNameError('Give the token a name so you can recognise it later.')
      return
    }
    setNameError(undefined)
    // Mock only: a real token comes from the server and is shown exactly once.
    setCreated('sv_test_' + Array.from({ length: 32 }, (_unused, index) => 'abcdef0123456789'.charAt((index * 7 + name.length * 3) % 16)).join(''))
  }
  const close = (open: boolean): void => {
    setCreateOpen(open)
    if (!open) {
      setCreated(null)
      setName('')
    }
  }

  return (
    <>
      <div className="flex gap-3 rounded-xl border border-info/30 bg-info-soft p-4 text-info">
        <IconInfoCircle aria-hidden className="size-5 shrink-0" />
        <p className="text-label">Tokens act as you, with only the scopes you grant. Never paste a token into chat, email or a public repository. Rotate tokens at least every 90 days.</p>
      </div>
      <Card className="pb-0 sm:pb-0">
        <Header
          title="API tokens"
          description={`${apiTokens.length} active tokens`}
          action={
            <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
              <IconPlus /> Create token
            </Button>
          }
        />
        <CardContent flush className="scrollbar-thin relative overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead>
              <tr className="border-y border-border bg-muted text-left text-overline font-semibold uppercase text-muted-foreground">
                <th scope="col" className="py-3 pl-5 pr-3 font-semibold sm:pl-6">Name</th>
                <th scope="col" className="px-3 py-3 font-semibold">Scopes</th>
                <th scope="col" className="px-3 py-3 font-semibold">Last used</th>
                <th scope="col" className="px-3 py-3 font-semibold">Expires</th>
                <th scope="col" className="py-3 pl-3 pr-5 sm:pr-6"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {apiTokens.map((token) => (
                <tr key={token.id} className="border-b border-border last:border-b-0">
                  <td className="py-4 pl-5 pr-3 sm:pl-6">
                    <span className="flex items-center gap-3">
                      <IconChip icon={<IconKey />} tone="warning" size="sm" />
                      <span>
                        <span className="block font-semibold">{token.name}</span>
                        <code className="text-xs text-muted-foreground">{token.prefix}••••••••</code>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-4">
                    <span className="flex flex-wrap gap-1">
                      {token.scopes.map((scope) => (
                        <Badge key={scope} variant="outline" className="font-mono font-medium">
                          {scope}
                        </Badge>
                      ))}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-muted-foreground">{token.lastUsed}</td>
                  <td className="whitespace-nowrap px-3 py-4">{token.expires === 'Never' ? <Badge tone="warning">Never</Badge> : token.expires}</td>
                  <td className="py-4 pl-3 pr-5 text-right sm:pr-6">
                    <Button variant="outline" size="sm" className="hover:border-danger hover:text-danger" onClick={() => toast({ tone: 'success', title: `“${token.name}” revoked` })}>
                      Revoke
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <Header title="Usage this month" description="Requests made with your tokens" />
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <p className="text-2xl font-bold tabular">42,180</p>
            <p className="text-label text-muted-foreground">of 100,000 requests</p>
          </div>
          <Progress value={42} label="API usage: 42% of the monthly limit" />
        </CardContent>
      </Card>
      <Dialog open={createOpen} onOpenChange={close}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{created === null ? 'Create API token' : 'Copy your new token'}</DialogTitle>
            <DialogDescription>{created === null ? 'Grant only the scopes this integration needs.' : 'This is the only time it will be shown. Store it in a secret manager now.'}</DialogDescription>
          </DialogHeader>
          {created === null ? (
            <div className="flex flex-col gap-5">
              <Field id="token-name" label="Name" required error={nameError}>
                <Input id="token-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Accounting sync" {...fieldAria('token-name', nameError)} />
              </Field>
              <Field id="token-expiry" label="Expires after">
                <Select id="token-expiry" value={expiry} onValueChange={setExpiry} options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days (recommended)' }, { value: '365', label: '1 year' }]} />
              </Field>
              <fieldset>
                <legend className="mb-2.5 text-label font-semibold">Scopes</legend>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {SCOPES.map((scope) => (
                    <div key={scope} className="flex items-center gap-2.5">
                      <Checkbox id={`scope-${scope}`} checked={scopes.includes(scope)} onCheckedChange={(value) => setScopes(value === true ? [...scopes, scope] : scopes.filter((item) => item !== scope))} />
                      <Label htmlFor={`scope-${scope}`} className="font-mono text-xs font-medium">
                        {scope}
                      </Label>
                    </div>
                  ))}
                </div>
              </fieldset>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted p-2 pl-3">
              <code className="min-w-0 flex-1 truncate text-sm">{created}</code>
              <Button variant="soft" size="sm" onClick={() => toast({ tone: 'success', title: 'Token copied' })}>
                <IconCopy /> Copy
              </Button>
            </div>
          )}
          <DialogFooter>
            {created === null ? (
              <>
                <Button variant="outline" onClick={() => close(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={create}>
                  Create token
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={() => close(false)}>
                Done
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
