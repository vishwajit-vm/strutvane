/**
 * Forgot password: ask for the email, then show a "check your inbox" state.
 *
 * Security note carried into the design: the confirmation never says whether the address has an
 * account ("If an account exists…"), so the screen cannot be used to discover who is a customer.
 */
import { IconArrowLeft, IconMail } from '@tabler/icons-react'
import { useState, type FormEvent, type ReactElement } from 'react'
import { MailIllustration } from '../../components/illustrations.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Field, fieldAria } from '../../components/ui/field.tsx'
import { Input, InputGroup } from '../../components/ui/input.tsx'
import { toast } from '../../components/ui/toast.tsx'
import { Link } from '../../lib/router.tsx'
import { AuthLayout } from './AuthLayout.tsx'

function BackToSignIn(): ReactElement {
  return (
    <Link to="/sign-in" className="inline-flex items-center gap-1.5 font-semibold text-primary-soft-foreground hover:underline">
      <IconArrowLeft aria-hidden className="size-4" /> Back to sign in
    </Link>
  )
}

export function ForgotPasswordPage(): ReactElement {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [sent, setSent] = useState(false)

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(email.trim() === '' ? 'Enter the email you sign in with.' : 'That email looks incomplete, e.g. name@company.com.')
      return
    }
    setError(undefined)
    setSent(true)
  }

  if (sent) {
    return (
      <AuthLayout title="Check your inbox" subtitle={<>If an account exists for <strong className="font-semibold text-foreground">{email}</strong>, a reset link is on its way. It expires in 30 minutes.</>} footer={<BackToSignIn />}>
        <div className="flex flex-col items-center gap-6 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <MailIllustration className="w-28" />
          <p className="text-sm text-muted-foreground">Didn’t get it? Check spam, or send it again in a minute.</p>
          <Button variant="soft" className="w-full" onClick={() => toast({ tone: 'success', title: 'Reset link sent again' })}>
            Resend link
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Forgot your password? 🔒" subtitle="Enter the email you sign in with and we’ll send you a link to choose a new one." footer={<BackToSignIn />}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-5">
        <Field id="reset-email" label="Email" error={error}>
          <InputGroup start={<IconMail />}>
            <Input id="reset-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" {...fieldAria('reset-email', error)} />
          </InputGroup>
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full">
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  )
}
