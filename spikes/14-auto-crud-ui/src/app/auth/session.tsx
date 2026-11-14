/**
 * A stub session with demo roles, standing in for `@strutvane/auth` (which would install real
 * sign-in screens and policies through installer `enhances`).
 *
 * Important: hiding a button is a convenience, not security. The API must refuse what the UI
 * hides (deny-by-default on the server, ADR-0007/0008). Spike 10's API has no auth yet, so these
 * checks only shape the screens.
 *
 * @module
 */
import { createContext, useContext, useMemo, useState, type ReactElement, type ReactNode } from 'react'

/**
 * What a user may do with a resource (Laravel policy method names).
 *
 * @example
 * const ability: Ability = 'viewAny' // may see the list and the sidebar entry
 */
export type Ability = 'viewAny' | 'view' | 'create' | 'update' | 'delete' | 'restore'

/**
 * Demo roles for the sign-in stub.
 *
 * @example
 * const role: Role = 'editor'
 */
export type Role = 'admin' | 'editor' | 'viewer'

/**
 * The signed-in user.
 *
 * @example
 * const user: SessionUser = { email: 'asha@example.com', role: 'admin' }
 */
export interface SessionUser {
  readonly email: string
  readonly role: Role
}

/** Resources only admins may see: people data is not every editor's business. */
const ADMIN_ONLY: ReadonlySet<string> = new Set(['users'])
const READ_ABILITIES: ReadonlySet<Ability> = new Set(['viewAny', 'view'])

/**
 * The demo policy: admins may do anything; editors anything except on admin-only resources;
 * viewers may only read, and also not admin-only resources. Deny by default.
 *
 * @example
 * demoPolicy('editor', 'delete', 'posts') // true
 * demoPolicy('editor', 'viewAny', 'users') // false
 */
export function demoPolicy(role: Role, ability: Ability, resource: string): boolean {
  if (role === 'admin') return true
  if (ADMIN_ONLY.has(resource)) return false
  if (role === 'editor') return true
  return READ_ABILITIES.has(ability)
}

/**
 * The session as components see it.
 *
 * @example
 * const { user, can } = useSession()
 * if (can('create', 'posts')) showNewButton()
 */
export interface Session {
  readonly user: SessionUser | null
  signIn(user: SessionUser): void
  signOut(): void
  can(ability: Ability, resource: string): boolean
}

const SessionContext = createContext<Session | null>(null)

/** sessionStorage key: the stub session lasts for the browser tab, like a session cookie. */
const SESSION_STORAGE_KEY = 'strutvane.demo-session'

/** The stored stub user, or `null` (also when storage is blocked or holds something odd). */
function readStoredUser(): SessionUser | null {
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(SESSION_STORAGE_KEY) ?? 'null')
    if (typeof value !== 'object' || value === null || !('email' in value) || !('role' in value)) return null
    const { email, role } = value
    return typeof email === 'string' && (role === 'admin' || role === 'editor' || role === 'viewer') ? { email, role } : null
  } catch {
    return null
  }
}

function storeUser(user: SessionUser | null): void {
  try {
    if (user === null) window.sessionStorage.removeItem(SESSION_STORAGE_KEY)
    else window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user))
  } catch {
    // Storage blocked: the session still works until the page reloads.
  }
}

/**
 * Provide the session. Tests pass `initialUser` to start signed in; the browser restores the stub
 * session from this tab's sessionStorage, so a reload keeps you signed in.
 *
 * @example
 * <SessionProvider initialUser={{ email: 'a@example.com', role: 'admin' }}><App /></SessionProvider>
 */
export function SessionProvider({ initialUser, children }: { readonly initialUser?: SessionUser | null; readonly children: ReactNode }): ReactElement {
  const [user, setUser] = useState<SessionUser | null>(() => (initialUser === undefined ? readStoredUser() : initialUser))
  const session = useMemo<Session>(
    () => ({
      user,
      signIn: (next) => {
        storeUser(next)
        setUser(next)
      },
      signOut: () => {
        storeUser(null)
        setUser(null)
      },
      can: (ability, resource) => user !== null && demoPolicy(user.role, ability, resource),
    }),
    [user],
  )
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}

/**
 * Read the session. Throws a clear error when used outside {@link SessionProvider}.
 *
 * @example
 * const { user } = useSession()
 */
export function useSession(): Session {
  const session = useContext(SessionContext)
  if (session === null) throw new Error('useSession() needs a <SessionProvider> above it. Wrap the app in <SessionProvider>.')
  return session
}
