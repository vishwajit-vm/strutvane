/**
 * Sign-in screen: email + password with inline validation, show/hide password, remember me,
 * "Forgot password?", and passkey / SSO alternatives.
 *
 * Mock behaviour: any valid-looking email and an 8+ character password signs in.
 */
import { IconBuildingSkyscraper, IconEye, IconEyeOff, IconFingerprint, IconLock, IconMail } from '@tabler/icons-react'
import { useState, type FormEvent, type ReactElement } from 'react'
import { Button } from '../../components/ui/button.tsx'
import { Checkbox } from '../../components/ui/checkbox.tsx'
import { Field, fieldAria, Label } from '../../components/ui/field.tsx'
import { Input, InputGroup } from '../../components/ui/input.tsx'
import { toast } from '../../components/ui/toast.tsx'
import { Link, navigate } from '../../lib/router.tsx'
import { AuthLayout } from './AuthLayout.tsx'

interface Errors {
  email?: string
  password?: string
}

/** Friendly, specific messages: say what is wrong and how to fix it. */
export function validateSignIn(email: string, password: string): Errors {
  const errors: Errors = {}
  if (email.trim() === '') errors.email = 'Enter your work email.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'That email looks incomplete, e.g. name@company.com.'
  if (password === '') errors.password = 'Enter your password.'
  else if (password.length < 8) errors.password = 'Passwords are at least 8 characters.'
  return errors
}

export function SignInPage(): ReactElement {
  const [email, setEmail] = useState('amara@halyard.io')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    const found = validateSignIn(email, password)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    setBusy(true)
    setTimeout(() => {
      navigate('/dashboard')
      toast({ tone: 'success', title: 'Welcome back, Amara', description: 'You have 3 unread notifications.' })
    }, 600)
  }

  return (
    <AuthLayout
      title="Welcome back 👋"
      subtitle="Sign in to your Halyard workspace to continue."
      footer={
        <>
          New to Strutvane?{' '}
          <Link to="/sign-in" className="font-semibold text-primary-soft-foreground hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-5">
        <Field id="email" label="Work email" error={errors.email}>
          <InputGroup start={<IconMail />}>
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" {...fieldAria('email', errors.email)} />
          </InputGroup>
        </Field>
        <Field
          id="password"
          label="Password"
          error={errors.password}
          aside={
            <Link to="/forgot-password" className="text-label font-semibold text-primary-soft-foreground hover:underline">
              Forgot password?
            </Link>
          }
        >
          <InputGroup
            start={<IconLock />}
            end={
              <Button variant="ghost" size="icon-sm" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} className="text-muted-foreground">
                {showPassword ? <IconEyeOff /> : <IconEye />}
              </Button>
            }
          >
            <Input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" {...fieldAria('password', errors.password)} />
          </InputGroup>
        </Field>
        <div className="flex items-center gap-2.5">
          <Checkbox id="remember" defaultChecked />
          <Label htmlFor="remember" className="font-medium">
            Keep me signed in for 30 days
          </Label>
        </div>
        <Button type="submit" variant="primary" size="lg" disabled={busy} className="w-full">
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <div className="my-6 flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Button variant="outline" size="lg" onClick={() => toast({ tone: 'info', title: 'Passkey prompt', description: 'Your browser would ask for your fingerprint or security key.' })}>
          <IconFingerprint /> Passkey
        </Button>
        <Button variant="outline" size="lg" onClick={() => toast({ tone: 'info', title: 'Single sign-on', description: 'You would be redirected to your company’s identity provider.' })}>
          <IconBuildingSkyscraper /> Company SSO
        </Button>
      </div>
    </AuthLayout>
  )
}
