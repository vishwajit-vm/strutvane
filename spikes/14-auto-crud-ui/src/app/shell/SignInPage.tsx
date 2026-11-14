/**
 * `<SignInPage>`: a sign-in **stub**. It checks the email's shape and lets you pick a demo role,
 * so the permission-aware sidebar can be tried. No password is asked for or checked: real sign-in
 * screens come from `@strutvane/auth` (installed into the app as owned files).
 *
 * @module
 */
import { useNavigate } from '@tanstack/react-router'
import { useId, useRef, useState, type FormEvent, type ReactElement } from 'react'
import { useSession, type Role } from '../auth/session.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { NativeSelect } from '../components/ui/native-select.tsx'
import { ThemeSwitch } from './ThemeSwitch.tsx'

/** Loose on purpose: the server owns real validation; this only catches obvious typos. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * The sign-in screen.
 *
 * @example
 * createRoute({ getParentRoute: () => rootRoute, path: '/sign-in', component: SignInPage })
 */
export function SignInPage(): ReactElement {
  const { signIn } = useSession()
  const navigate = useNavigate()
  const emailId = useId()
  const errorId = useId()
  const roleId = useId()
  const emailInput = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('admin')
  const [error, setError] = useState<string | null>(null)

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!EMAIL_SHAPE.test(email.trim())) {
      setError('Enter an email address like name@example.com.')
      emailInput.current?.focus()
      return
    }
    signIn({ email: email.trim(), role })
    void navigate({ to: '/' })
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4 text-foreground">
      <div className="absolute right-4 top-4">
        <ThemeSwitch />
      </div>
      <form noValidate onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-lg border bg-background p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">Demo sign-in: no password is checked. Pick a role to see how the screens change.</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={emailId} className="text-sm font-medium">
            Email
          </label>
          <Input
            ref={emailInput}
            id={emailId}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={error !== null}
            aria-describedby={error === null ? undefined : errorId}
          />
          {error !== null && (
            <p id={errorId} className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <label htmlFor={roleId} className="text-sm font-medium">
            Demo role
          </label>
          <NativeSelect id={roleId} value={role} onChange={(event) => setRole(toRole(event.target.value))}>
            <option value="admin">Admin: everything</option>
            <option value="editor">Editor: content, no users</option>
            <option value="viewer">Viewer: read only</option>
          </NativeSelect>
        </div>
        <Button type="submit" className="w-full">
          Sign in
        </Button>
      </form>
    </main>
  )
}

function toRole(value: string): Role {
  return value === 'editor' || value === 'viewer' ? value : 'admin'
}
