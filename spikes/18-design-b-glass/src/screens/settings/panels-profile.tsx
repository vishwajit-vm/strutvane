/**
 * Settings panels: Profile and Security (password, two-factor with recovery codes, passkeys).
 */
import { IconCheck, IconCopy, IconDeviceMobile, IconFingerprint, IconKey, IconUpload } from '@tabler/icons-react'
import { useState } from 'react'
import { Avatar } from '../../components/ui/avatar.tsx'
import { Badge } from '../../components/ui/badge.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Card, CardBody, CardHeader } from '../../components/ui/card.tsx'
import { Dialog } from '../../components/ui/dialog.tsx'
import { Field } from '../../components/ui/field.tsx'
import { Input, Textarea } from '../../components/ui/input.tsx'
import { Progress } from '../../components/ui/misc.tsx'
import { Select } from '../../components/ui/select.tsx'
import { useToast } from '../../components/ui/toast.tsx'
import { CURRENT_USER } from '../../data/people.ts'

/** A settings card with a save footer. */
function Panel({ title, description, children, footer }: { title: string; description: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <Card material="solid">
      <CardHeader title={title} description={description} />
      <CardBody>{children}</CardBody>
      {footer !== undefined && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-6 py-4">{footer}</div>}
    </Card>
  )
}

export function ProfilePanel() {
  const toast = useToast()
  const [name, setName] = useState(CURRENT_USER.name)
  const [timezone, setTimezone] = useState('europe-lisbon')
  const [nameError, setNameError] = useState<string | undefined>(undefined)
  const save = (): void => {
    if (name.trim() === '') {
      setNameError('Enter the name your team will see.')
      return
    }
    setNameError(undefined)
    toast({ title: 'Profile saved' })
  }
  return (
    <div className="flex flex-col gap-5">
      <Panel title="Profile" description="How you appear to your team and on invoices you send." footer={<><Button variant="ghost">Cancel</Button><Button onClick={save}>Save changes</Button></>}>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar name={name === '' ? '?' : name} size="xl" />
          <div>
            <p className="text-base font-semibold text-fg">Profile photo</p>
            <p className="text-sm text-fg-muted">PNG or JPG, at least 256 × 256 px.</p>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" size="sm">
                <IconUpload aria-hidden /> Upload
              </Button>
              <Button variant="ghost" size="sm">
                Remove
              </Button>
            </div>
          </div>
        </div>
        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
          <Field label="Full name" required error={nameError}>
            {(control) => <Input {...control} value={name} autoComplete="name" onChange={(event) => setName(event.target.value)} />}
          </Field>
          <Field label="Job title">{(control) => <Input {...control} defaultValue={CURRENT_USER.title} autoComplete="organization-title" />}</Field>
          <Field label="E-mail" hint="Changing it sends a confirmation link to the new address.">
            {(control) => <Input {...control} type="email" defaultValue={CURRENT_USER.email} autoComplete="email" />}
          </Field>
          <Field label="Phone" aside="Optional">{(control) => <Input {...control} type="tel" placeholder="+351 912 345 678" autoComplete="tel" />}</Field>
          <Field label="Time zone">
            {(control) => (
              <Select
                {...control}
                value={timezone}
                onValueChange={setTimezone}
                options={[
                  { value: 'europe-lisbon', label: 'Lisbon (GMT+0)' },
                  { value: 'europe-berlin', label: 'Berlin (GMT+1)' },
                  { value: 'america-new-york', label: 'New York (GMT−5)' },
                  { value: 'asia-singapore', label: 'Singapore (GMT+8)' },
                ]}
              />
            )}
          </Field>
          <Field label="Language">{(control) => <Select {...control} value="en" onValueChange={() => undefined} options={[{ value: 'en', label: 'English (US)' }, { value: 'pt', label: 'Português' }, { value: 'de', label: 'Deutsch' }]} />}</Field>
          <Field label="Bio" aside="Optional" className="sm:col-span-2">
            {(control) => <Textarea {...control} rows={3} defaultValue="Finance lead at Halcyon. Ask me about payment terms and month-end close." />}
          </Field>
        </div>
      </Panel>
      <Card material="solid" className="border-danger-soft">
        <CardHeader title="Delete account" description="Removes your access to every workspace. Invoices you created stay with the company." />
        <CardBody>
          <Button variant="danger">Delete my account</Button>
        </CardBody>
      </Card>
    </div>
  )
}

const RECOVERY_CODES = ['7KQ2-M9XD', 'P4HV-2LNC', 'B8RT-QW3E', 'ZD6F-JK1S', 'N3YU-8VAG', 'H2LX-5MEP', 'C9WB-4TQJ', 'R6GN-7ZKD']

export function SecurityPanel() {
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [codesOpen, setCodesOpen] = useState(false)
  const strength = Math.min(100, password.length * 8 + (/[A-Z]/.test(password) ? 12 : 0) + (/\d/.test(password) ? 12 : 0) + (/[^\w]/.test(password) ? 16 : 0))
  const strengthLabel = password === '' ? 'Enter a new password' : strength < 45 ? 'Weak' : strength < 75 ? 'Good' : 'Strong'
  return (
    <div className="flex flex-col gap-5">
      <Panel title="Password" description="Last changed 3 months ago." footer={<Button onClick={() => toast({ title: 'Password updated', description: 'Other sessions were signed out.' })}>Update password</Button>}>
        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
          <Field label="Current password" className="sm:col-span-2 sm:max-w-[calc(50%-0.625rem)]">
            {(control) => <Input {...control} type="password" autoComplete="current-password" />}
          </Field>
          <Field label="New password" hint="12+ characters. Use a phrase you don’t use anywhere else.">
            {(control) => <Input {...control} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />}
          </Field>
          <Field label="Confirm new password">{(control) => <Input {...control} type="password" autoComplete="new-password" />}</Field>
        </div>
        <div className="mt-4 max-w-sm">
          <div className="mb-1.5 flex justify-between text-xs">
            <span className="text-fg-muted">Strength</span>
            <span className="font-semibold text-fg">{strengthLabel}</span>
          </div>
          <Progress value={strength} tone={strength < 45 ? 'danger' : strength < 75 ? 'warning' : 'success'} label={`Password strength: ${strengthLabel}`} />
        </div>
      </Panel>

      <Panel title="Two-factor authentication" description="A second step at sign-in keeps your account safe even if your password leaks.">
        <ul className="divide-y divide-border rounded-lg border border-border">
          <SecurityMethod icon={<IconDeviceMobile />} title="Authenticator app" description="Codes from 1Password, Authy or Google Authenticator." status={<Badge tone="success" dot>Enabled</Badge>} action={<Button variant="secondary" size="sm">Reconfigure</Button>} />
          <SecurityMethod icon={<IconFingerprint />} title="Passkeys" description="MacBook Pro Touch ID · added Oct 2, 2026" status={<Badge tone="success" dot>1 passkey</Badge>} action={<Button variant="secondary" size="sm">Add passkey</Button>} />
          <SecurityMethod
            icon={<IconKey />}
            title="Recovery codes"
            description="Single-use codes for when you lose your device. 8 of 10 left."
            status={<Badge tone="warning">2 used</Badge>}
            action={
              <Button variant="secondary" size="sm" onClick={() => setCodesOpen(true)}>
                View codes
              </Button>
            }
          />
        </ul>
      </Panel>

      <Dialog
        open={codesOpen}
        onOpenChange={setCodesOpen}
        title="Recovery codes"
        description="Store these somewhere safe, like a password manager. Each code works once."
        footer={
          <>
            <Button variant="secondary" onClick={() => toast({ title: 'New codes generated', description: 'The old ones no longer work.' })}>
              Regenerate
            </Button>
            <Button
              onClick={() => {
                void navigator.clipboard?.writeText(RECOVERY_CODES.join('\n'))
                toast({ title: 'Codes copied' })
              }}
            >
              <IconCopy aria-hidden /> Copy all
            </Button>
          </>
        }
      >
        <ul className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface p-4 font-mono text-base text-fg">
          {RECOVERY_CODES.map((code) => (
            <li key={code} className="flex items-center gap-2">
              <IconCheck className="size-3.5 text-success" aria-hidden />
              {code}
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  )
}

function SecurityMethod({ icon, title, description, status, action }: { icon: React.ReactNode; title: string; description: string; status: React.ReactNode; action: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary-soft text-primary-soft-fg [&_svg]:size-5" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-base font-semibold text-fg">
          {title} {status}
        </p>
        <p className="mt-0.5 text-sm text-fg-muted">{description}</p>
      </div>
      {action}
    </li>
  )
}
