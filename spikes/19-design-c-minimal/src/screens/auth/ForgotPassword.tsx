/**
 * Forgot password: one field, then a confirmation that never reveals whether the account exists
 * ("If an account exists for …"), which is the anti-enumeration rule from ADR-0013. Resend is
 * rate-limited on screen with a visible countdown so nobody hammers the button.
 */
import { ArrowLeft, LoaderCircle, MailCheck } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { Button } from '../../components/ui/button.tsx'
import { Field } from '../../components/ui/field.tsx'
import { Input } from '../../components/ui/input.tsx'
import { Link } from '../../lib/router.tsx'
import { AuthLayout } from './AuthLayout.tsx'
import { EMAIL } from './SignIn.tsx'

const RESEND_SECONDS = 30

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!EMAIL.test(email.trim())) {
      setError(email.trim() === '' ? 'Enter the e-mail you sign in with.' : 'That doesn’t look like an e-mail address.')
      return
    }
    setError(undefined)
    setState('sending')
    window.setTimeout(() => {
      setState('sent')
      setCooldown(RESEND_SECONDS)
    }, 600)
  }

  const back = (
    <Link to="/sign-in" className="inline-flex items-center gap-1.5 font-medium text-fg-muted hover:text-fg">
      <ArrowLeft aria-hidden className="size-3.5" /> Back to sign in
    </Link>
  )

  if (state === 'sent') {
    return (
      <AuthLayout title="Check your inbox" description={<>If an account exists for <span className="font-medium text-fg">{email.trim()}</span>, a reset link is on its way. It expires in 30 minutes.</>} footer={back}>
        <div className="flex flex-col gap-4" role="status">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-subtle/60 p-3 text-sm text-fg-muted">
            <MailCheck aria-hidden className="size-5 shrink-0 text-accent-text" />
            Didn’t get it? Check spam, or make sure you used your work e-mail.
          </div>
          <Button size="lg" className="w-full" disabled={cooldown > 0} onClick={() => setCooldown(RESEND_SECONDS)}>
            {cooldown > 0 ? (
              <>
                Resend in <span className="num">{cooldown}s</span>
              </>
            ) : (
              'Resend link'
            )}
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Reset your password" description="Enter the e-mail you sign in with and we’ll send you a link to choose a new password." footer={back}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Work e-mail" error={error}>
          {(control) => <Input {...control} type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} className="h-control-lg" />}
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={state === 'sending'}>
          {state === 'sending' && <LoaderCircle aria-hidden className="animate-spin" />}
          {state === 'sending' ? 'Sending link…' : 'Send reset link'}
        </Button>
      </form>
    </AuthLayout>
  )
}
