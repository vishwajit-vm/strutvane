/**
 * Sign in: e-mail + password, a "Forgot password?" link aligned with the password label, remember
 * me, SSO as the secondary path. Errors appear inline under the field, the first invalid field
 * gets focus, and the submit button shows progress instead of being clicked twice.
 */
import { Eye, EyeOff, KeyRound, LoaderCircle } from 'lucide-react'
import { type FormEvent, useRef, useState } from 'react'
import { Button } from '../../components/ui/button.tsx'
import { Checkbox } from '../../components/ui/controls.tsx'
import { Field } from '../../components/ui/field.tsx'
import { Input } from '../../components/ui/input.tsx'
import { Link, useRouter } from '../../lib/router.tsx'
import { AuthLayout } from './AuthLayout.tsx'

/** A deliberately simple e-mail check; the server is the real judge. */
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface Errors {
  email?: string
  password?: string
}

export function validateSignIn(email: string, password: string): Errors {
  const errors: Errors = {}
  if (email.trim() === '') errors.email = 'Enter your work e-mail.'
  else if (!EMAIL.test(email.trim())) errors.email = 'That doesn’t look like an e-mail address.'
  if (password === '') errors.password = 'Enter your password.'
  return errors
}

export function SignIn() {
  const { navigate } = useRouter()
  const [email, setEmail] = useState('maya@northwind.example')
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [remember, setRemember] = useState(true)
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found = validateSignIn(email, password)
    setErrors(found)
    if (found.email !== undefined) return emailRef.current?.focus()
    if (found.password !== undefined) return passwordRef.current?.focus()
    setBusy(true)
    window.setTimeout(() => navigate('/'), 650)
  }

  return (
    <AuthLayout
      title="Sign in to Strutvane"
      description="Welcome back. Use your work account for Northwind Labs."
      footer={
        <>
          New to Northwind?{' '}
          <a href="#request-access" className="font-medium text-accent-text hover:underline">
            Request access
          </a>
        </>
      }
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Work e-mail" error={errors.email}>
          {(control) => <Input {...control} ref={emailRef} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-control-lg" />}
        </Field>
        <Field
          label="Password"
          error={errors.password}
          labelAside={
            <Link to="/forgot-password" className="rounded-xs text-xs font-medium text-accent-text hover:underline">
              Forgot password?
            </Link>
          }
        >
          {(control) => (
            <div className="relative">
              <Input
                {...control}
                ref={passwordRef}
                type={reveal ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-control-lg pr-10"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={reveal ? 'Hide password' : 'Show password'}
                aria-pressed={reveal}
                onClick={() => setReveal((value) => !value)}
                className="absolute right-1 top-1"
              >
                {reveal ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              </Button>
            </div>
          )}
        </Field>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
          <Checkbox checked={remember} onCheckedChange={(value) => setRemember(value === true)} />
          Keep me signed in for 30 days
        </label>
        <Button type="submit" variant="primary" size="lg" className="mt-1 w-full" disabled={busy}>
          {busy && <LoaderCircle aria-hidden className="animate-spin" />}
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
        <div className="flex items-center gap-3 text-xs text-fg-subtle" role="separator" aria-label="or">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>
        <Button size="lg" className="w-full">
          <KeyRound aria-hidden /> Continue with SSO
        </Button>
      </form>
    </AuthLayout>
  )
}
