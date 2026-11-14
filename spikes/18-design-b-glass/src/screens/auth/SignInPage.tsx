/**
 * Sign in: e-mail + password with inline validation, "remember me", SSO and a passkey option.
 * The mock accepts any well-formed e-mail and a password of 8+ characters, then opens the
 * dashboard.
 */
import { IconBrandGoogle, IconEye, IconEyeOff, IconFingerprint, IconLock, IconMail } from '@tabler/icons-react'
import { useRef, useState, type FormEvent } from 'react'
import { flushSync } from 'react-dom'
import { Link, useNavigate } from 'react-router'
import { Button } from '../../components/ui/button.tsx'
import { Field } from '../../components/ui/field.tsx'
import { Input, InputGroup } from '../../components/ui/input.tsx'
import { Checkbox } from '../../components/ui/toggles.tsx'
import { AuthLayout } from './AuthLayout.tsx'

interface Errors {
  email?: string
  password?: string
}

/** Client-side checks, mirroring what the server would say (friendly, specific). */
export function validateSignIn(email: string, password: string): Errors {
  const errors: Errors = {}
  if (email.trim() === '') errors.email = 'Enter your e-mail address.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'That doesn’t look like an e-mail address.'
  if (password === '') errors.password = 'Enter your password.'
  else if (password.length < 8) errors.password = 'Passwords are at least 8 characters.'
  return errors
}

export function SignInPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('maya@halcyon.example')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [remember, setRemember] = useState(true)
  const [errors, setErrors] = useState<Errors>({})
  const formRef = useRef<HTMLFormElement>(null)

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    const next = validateSignIn(email, password)
    // Render the errors now, then move focus to the first invalid field.
    flushSync(() => setErrors(next))
    if (Object.keys(next).length === 0) void navigate('/')
    else formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }

  return (
    <AuthLayout>
      <h1 className="text-2xl font-bold tracking-tight text-fg">Welcome back</h1>
      <p className="mt-1.5 text-base text-fg-muted">Sign in to Halcyon Supply Co.</p>

      <div className="mt-7 grid grid-cols-2 gap-3">
        <Button variant="outline">
          <IconBrandGoogle aria-hidden /> Google
        </Button>
        <Button variant="outline">
          <IconFingerprint aria-hidden /> Passkey
        </Button>
      </div>
      <div className="my-6 flex items-center gap-3 text-xs font-medium text-fg-muted">
        <span className="h-px flex-1 bg-border" />
        or with e-mail
        <span className="h-px flex-1 bg-border" />
      </div>

      <form ref={formRef} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <Field label="E-mail" error={errors.email}>
          {(control) => (
            <InputGroup start={<IconMail />}>
              <Input {...control} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </InputGroup>
          )}
        </Field>
        <Field
          label="Password"
          error={errors.password}
          aside={
            <Link to="/forgot-password" className="font-semibold text-primary-text hover:underline">
              Forgot password?
            </Link>
          }
        >
          {(control) => (
            <div className="relative">
              <InputGroup start={<IconLock />}>
                <Input
                  {...control}
                 
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="pr-11"
                />
              </InputGroup>
              <button
                type="button"
                onClick={() => setShow((value) => !value)}
                aria-label={show ? 'Hide password' : 'Show password'}
                aria-pressed={show}
                className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-sm text-fg-muted hover:bg-glass-hover hover:text-fg"
              >
                {show ? <IconEyeOff className="size-4" aria-hidden /> : <IconEye className="size-4" aria-hidden />}
              </button>
            </div>
          )}
        </Field>
        <label className="flex items-center gap-2.5 text-base text-fg">
          <Checkbox checked={remember} onCheckedChange={setRemember} />
          Keep me signed in for 30 days
        </label>
        <Button type="submit" size="lg" className="mt-2 w-full">
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-fg-muted">
        New to Strutvane?{' '}
        <a href="#request-access" className="font-semibold text-primary-text hover:underline">
          Request access
        </a>
      </p>
    </AuthLayout>
  )
}
