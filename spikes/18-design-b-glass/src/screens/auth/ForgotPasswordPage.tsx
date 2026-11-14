/**
 * Forgot password: one field, then a confirmation that does NOT reveal whether the address has
 * an account (ADR-0013: no account enumeration).
 */
import { IconArrowLeft, IconMail, IconMailCheck } from '@tabler/icons-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Button } from '../../components/ui/button.tsx'
import { Field } from '../../components/ui/field.tsx'
import { Input, InputGroup } from '../../components/ui/input.tsx'
import { AuthLayout } from './AuthLayout.tsx'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)
  const [sent, setSent] = useState(false)

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter the e-mail address you sign in with.')
      return
    }
    setError(undefined)
    setSent(true)
  }

  return (
    <AuthLayout>
      {sent ? (
        <div role="status">
          <span className="grid size-12 place-items-center rounded-full bg-success-soft text-success" aria-hidden>
            <IconMailCheck className="size-6" />
          </span>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-fg">Check your inbox</h1>
          <p className="mt-2 text-base text-fg-muted">
            If <strong className="font-semibold text-fg">{email}</strong> has an account, a reset link is on its way. It expires in 30 minutes.
          </p>
          <Button variant="secondary" className="mt-7 w-full" onClick={() => setSent(false)}>
            Use a different e-mail
          </Button>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-bold tracking-tight text-fg">Reset your password</h1>
          <p className="mt-1.5 text-base text-fg-muted">Enter your e-mail and we’ll send you a link to choose a new password.</p>
          <form noValidate onSubmit={submit} className="mt-7 flex flex-col gap-4">
            <Field label="E-mail" error={error}>
              {(control) => (
                <InputGroup start={<IconMail />}>
                  <Input {...control} autoFocus type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" />
                </InputGroup>
              )}
            </Field>
            <Button type="submit" size="lg" className="w-full">
              Send reset link
            </Button>
          </form>
        </>
      )}
      <Link to="/sign-in" className="mt-6 flex items-center justify-center gap-1.5 text-sm font-semibold text-primary-text hover:underline">
        <IconArrowLeft className="size-4" aria-hidden />
        Back to sign in
      </Link>
    </AuthLayout>
  )
}
