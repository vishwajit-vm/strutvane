/**
 * Security: change password (with a strength meter), two-factor methods (authenticator app,
 * passkeys, recovery codes) and the set-up dialog with a QR code drawn locally (an original,
 * illustrative pattern; a real one encodes the TOTP secret).
 */
import { Copy, Download, Fingerprint, KeyRound, Plus, ShieldCheck, Smartphone } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Section } from '../../components/section.tsx'
import { Badge } from '../../components/ui/badge.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Dialog, DialogContent } from '../../components/ui/dialog.tsx'
import { Field } from '../../components/ui/field.tsx'
import { Input } from '../../components/ui/input.tsx'
import { useToast } from '../../components/ui/toast.tsx'
import { seeded } from '../../data/random.ts'
import { cn } from '../../lib/cn.ts'
import { SettingsHeader } from './SettingsPage.tsx'

/**
 * Score a password 0–4 from length and character variety. Deliberately simple (a real app uses
 * zxcvbn-style checks); it exists to drive the meter and its wording.
 */
export function passwordScore(password: string): 0 | 1 | 2 | 3 | 4 {
  if (password.length === 0) return 0
  let score = password.length >= 12 ? 2 : password.length >= 8 ? 1 : 0
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length
  if (kinds >= 3) score += 1
  if (password.length >= 16 && kinds >= 3) score += 1
  return Math.max(1, Math.min(4, score)) as 1 | 2 | 3 | 4
}

const SCORE_LABEL = ['', 'Weak', 'Fair', 'Good', 'Strong'] as const
const SCORE_BAR = ['', 'bg-danger', 'bg-warning', 'bg-success', 'bg-success'] as const

function StrengthMeter({ password }: { password: string }) {
  const score = passwordScore(password)
  return (
    <div className="flex items-center gap-3" aria-live="polite">
      <div className="flex flex-1 gap-1" aria-hidden>
        {[1, 2, 3, 4].map((step) => (
          <span key={step} className={cn('h-1 flex-1 rounded-full transition-colors duration-200', step <= score ? SCORE_BAR[score] : 'bg-muted')} />
        ))}
      </div>
      <span className="w-12 text-right text-xs text-fg-subtle">{score === 0 ? '' : SCORE_LABEL[score]}</span>
    </div>
  )
}

/** A QR-like 25×25 module pattern with the three finder squares. Illustrative only. */
function QrPattern() {
  const random = seeded(7)
  const size = 25
  const finder = (x: number, y: number) => (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7)
  const cells: ReactNode[] = []
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) if (!finder(x, y) && random.chance(0.48)) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />)
  const Finder = ({ x, y }: { x: number; y: number }) => (
    <g>
      <rect x={x} y={y} width="7" height="7" />
      <rect x={x + 1} y={y + 1} width="5" height="5" fill="var(--surface)" />
      <rect x={x + 2} y={y + 2} width="3" height="3" />
    </g>
  )
  return (
    <svg viewBox={`-2 -2 ${size + 4} ${size + 4}`} role="img" aria-label="QR code for your authenticator app" className="size-40 rounded-lg border border-border bg-surface p-1" style={{ fill: 'var(--fg)' }} shapeRendering="crispEdges">
      {cells}
      <Finder x={0} y={0} />
      <Finder x={size - 7} y={0} />
      <Finder x={0} y={size - 7} />
    </svg>
  )
}

const RECOVERY = ['k4f9-2m7q', 'p8x3-vn6t', 'w2c7-9hds', 'r5j1-qz4e', 'm3n8-6tby', 'h9q2-x7lp', 'b6v4-1rke', 'z8d5-3wfm'] as const

/** A method row: icon tile, title, explanation and its controls. */
function Method({ icon, title, description, status, children }: { icon: ReactNode; title: string; description: string; status?: ReactNode; children: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-subtle text-fg-muted [&_svg]:size-4">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium text-fg">
          {title} {status}
        </p>
        <p className="mt-0.5 text-sm text-fg-muted">{description}</p>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </li>
  )
}

export function Security() {
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [setupOpen, setSetupOpen] = useState(false)
  const [codesOpen, setCodesOpen] = useState(false)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | undefined>()

  const verify = () => {
    if (!/^\d{6}$/.test(code)) {
      setCodeError('Enter the 6-digit code from your app.')
      return
    }
    setSetupOpen(false)
    setCode('')
    setCodeError(undefined)
    toast({ title: 'Authenticator added', description: 'You’ll be asked for a code when signing in on a new device.' })
  }

  return (
    <div>
      <SettingsHeader title="Security" description="Keep your account safe with a strong password and a second factor." />
      <Section title="Password" description="Use 12 or more characters. Changing it signs you out everywhere else.">
        <Field label="Current password">{(control) => <Input {...control} type="password" autoComplete="current-password" />}</Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="New password">
            {(control) => (
              <div className="flex flex-col gap-2">
                <Input {...control} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
                <StrengthMeter password={password} />
              </div>
            )}
          </Field>
          <Field label="Confirm new password">{(control) => <Input {...control} type="password" autoComplete="new-password" />}</Field>
        </div>
        <div>
          <Button onClick={() => toast({ title: 'Password updated', description: 'Other sessions were signed out.' })}>Update password</Button>
        </div>
      </Section>
      <Section
        title="Two-factor authentication"
        description={
          <>
            Required for Owners and Admins in this workspace. <span className="inline-flex items-center gap-1 font-medium text-success-text"><ShieldCheck aria-hidden className="size-3.5" />On</span>
          </>
        }
      >
        <ul className="divide-y divide-border rounded-lg border border-border">
          <Method icon={<Smartphone aria-hidden />} title="Authenticator app" description="Codes from 1Password, Authy or Google Authenticator. Added 2 Mar 2026." status={<Badge tone="success">Enabled</Badge>}>
            <Button size="sm" onClick={() => setSetupOpen(true)}>
              Replace
            </Button>
          </Method>
          <Method icon={<Fingerprint aria-hidden />} title="Passkeys" description="MacBook Touch ID and a YubiKey 5C. Sign in with a fingerprint or a tap." status={<Badge>2 keys</Badge>}>
            <Button size="sm">
              <Plus aria-hidden /> Add passkey
            </Button>
          </Method>
          <Method icon={<KeyRound aria-hidden />} title="Recovery codes" description="One-time codes for when you lose your device. 8 of 10 left." status={<Badge tone="warning">2 used</Badge>}>
            <Button size="sm" onClick={() => setCodesOpen(true)}>
              View codes
            </Button>
          </Method>
        </ul>
      </Section>

      <Dialog.Root open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent
          title="Set up an authenticator app"
          description="Scan the code, then enter the 6-digit code your app shows."
          footer={
            <>
              <Button onClick={() => setSetupOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={verify}>
                Verify and turn on
              </Button>
            </>
          }
        >
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <QrPattern />
            <div className="flex w-full min-w-0 flex-col gap-4">
              <div>
                <p className="text-xs font-medium text-fg-subtle">Can’t scan? Enter this key</p>
                <p className="num mt-1 select-all break-all rounded-md border border-border bg-subtle px-2.5 py-1.5 text-sm text-fg">JBSW Y3DP EHPK 3PXP</p>
              </div>
              <Field label="6-digit code" error={codeError}>
                {(control) => <Input {...control} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" className="num h-9 text-center text-base tracking-[0.4em]" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} />}
              </Field>
            </div>
          </div>
        </DialogContent>
      </Dialog.Root>

      <Dialog.Root open={codesOpen} onOpenChange={setCodesOpen}>
        <DialogContent
          title="Recovery codes"
          description="Each code works once. Store them somewhere safe, like your password manager."
          footer={
            <>
              <Button onClick={() => toast({ title: 'Codes copied', tone: 'info' })}>
                <Copy aria-hidden /> Copy
              </Button>
              <Button variant="primary">
                <Download aria-hidden /> Download
              </Button>
            </>
          }
        >
          <ol className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-subtle/60 p-3">
            {RECOVERY.map((value, index) => (
              <li key={value} className={cn('num flex items-center gap-2 text-sm', index < 2 ? 'text-fg-subtle line-through' : 'text-fg')}>
                <span className="w-4 text-xs text-fg-subtle">{index + 1}</span>
                {value}
                {index < 2 && <span className="sr-only">(used)</span>}
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog.Root>
    </div>
  )
}
