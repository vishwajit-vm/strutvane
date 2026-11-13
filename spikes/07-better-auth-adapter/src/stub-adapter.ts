/**
 * A minimal native identity engine, written ONLY against the {@link IdentityEngine} interface.
 *
 * It exists to prove the seam is real: if a second, completely different implementation passes
 * the same contract test suite as the Better Auth adapter, Strutvane can swap engines (OIDC, a
 * native engine, a future Better Auth replacement) without touching anything above the interface.
 *
 * In-memory and single-process by design (it is a test double), but it follows the same security
 * rules as a real engine: scrypt password hashing with per-user salts, constant-time comparison,
 * a dummy hash for unknown emails (no timing-based enumeration), opaque random session ids,
 * server-side revocation, single-use expiring reset tokens and per-IP sign-in rate limiting.
 *
 * @module
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { Actor } from './contracts.ts'
import {
  fail,
  type IdentityEngine,
  ok,
  type PasswordResetDelivery,
  type TenantMembership,
} from './identity-engine.ts'

const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>

export interface StubEngineOptions {
  readonly baseURL: string
  readonly deliverPasswordReset: PasswordResetDelivery
  readonly signInRateLimit?: { readonly windowSeconds: number; readonly max: number }
  /** Clock override for tests. */
  readonly now?: () => number
}

interface User {
  readonly id: string
  readonly email: string
  readonly name: string
  salt: Buffer
  hash: Buffer
}

interface Session {
  readonly userId: string
  activeTenantId: string | undefined
}

interface Tenant {
  readonly id: string
  readonly name: string
  readonly slug: string
}

const COOKIE = 'sv_session'
const MIN_PASSWORD = 12
const MAX_PASSWORD = 128
const RESET_TTL_MS = 30 * 60 * 1000
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const id = (): string => randomBytes(16).toString('hex')

export function createStubEngine(options: StubEngineOptions): IdentityEngine {
  const now = options.now ?? Date.now
  const secure = options.baseURL.startsWith('https://')
  const limit = options.signInRateLimit ?? { windowSeconds: 60, max: 5 }

  const users = new Map<string, User>() // by id
  const byEmail = new Map<string, string>() // lowercased email → user id
  const sessions = new Map<string, Session>() // session id → session
  const tenants = new Map<string, Tenant>()
  const members = new Map<string, Map<string, readonly string[]>>() // tenantId → userId → roles
  const resetTokens = new Map<string, { userId: string; expiresAt: number }>()
  const attempts = new Map<string, number[]>() // ip → timestamps
  const dummySalt = randomBytes(16)

  const hashPassword = (password: string, salt: Buffer): Promise<Buffer> => scrypt(password, salt, 64)

  const cookieHeaders = (value: string, maxAge: number): Headers => {
    const parts = [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`]
    if (secure) parts.push('Secure')
    const headers = new Headers()
    headers.append('set-cookie', parts.join('; '))
    return headers
  }

  const sessionId = (request: Request): string | undefined => {
    const header = request.headers.get('cookie') ?? ''
    for (const pair of header.split(';')) {
      const [name, ...rest] = pair.trim().split('=')
      if (name === COOKIE) return rest.join('=')
    }
    return undefined
  }

  const currentSession = (request: Request): { sid: string; session: Session } | undefined => {
    const sid = sessionId(request)
    const session = sid ? sessions.get(sid) : undefined
    return sid && session ? { sid, session } : undefined
  }

  const actorFor = (session: Session): Actor => {
    const tenantId = session.activeTenantId
    const roles = tenantId ? members.get(tenantId)?.get(session.userId) : undefined
    const base = { id: session.userId, type: 'user' as const, attrs: { emailVerified: false } }
    return tenantId && roles ? { ...base, tenantId, roles } : { ...base, roles: [] }
  }

  const newSession = (userId: string) => {
    const sid = randomBytes(32).toString('base64url')
    const session: Session = { userId, activeTenantId: undefined }
    sessions.set(sid, session)
    return { headers: cookieHeaders(sid, 60 * 60 * 24 * 7), actor: actorFor(session) }
  }

  const rateLimited = (request: Request): number | undefined => {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const windowMs = limit.windowSeconds * 1000
    const recent = (attempts.get(ip) ?? []).filter((t) => now() - t < windowMs)
    if (recent.length >= limit.max) {
      const oldest = recent[0] ?? now()
      return Math.max(1, Math.ceil((oldest + windowMs - now()) / 1000))
    }
    recent.push(now())
    attempts.set(ip, recent)
    return undefined
  }

  const passwordIssue = (password: string): boolean =>
    password.length < MIN_PASSWORD || password.length > MAX_PASSWORD

  return {
    name: 'stub-native',

    async signUp(input) {
      if (!EMAIL.test(input.email) || passwordIssue(input.password)) return fail('VALIDATION_FAILED', 422)
      const key = input.email.toLowerCase()
      if (byEmail.has(key)) return fail('EMAIL_UNAVAILABLE', 422)
      const salt = randomBytes(16)
      const user: User = { id: id(), email: input.email, name: input.name, salt, hash: await hashPassword(input.password, salt) }
      users.set(user.id, user)
      byEmail.set(key, user.id)
      const created = newSession(user.id)
      return ok({ actor: created.actor }, created.headers)
    },

    async signIn(input, request) {
      const retry = rateLimited(request)
      if (retry !== undefined) return fail('RATE_LIMITED', 429, new Headers(), retry)
      const user = users.get(byEmail.get(input.email.toLowerCase()) ?? '')
      // Hash even for unknown emails so response time does not reveal which emails exist.
      const candidate = await hashPassword(input.password, user?.salt ?? dummySalt)
      if (!user || !timingSafeEqual(candidate, user.hash)) return fail('INVALID_CREDENTIALS', 401)
      const created = newSession(user.id)
      return ok({ actor: created.actor }, created.headers)
    },

    async signOut(request) {
      const current = currentSession(request)
      if (!current) return fail('UNAUTHENTICATED', 401)
      sessions.delete(current.sid)
      return ok(null, cookieHeaders('', 0))
    },

    async getActor(request) {
      const current = currentSession(request)
      return current ? actorFor(current.session) : null
    },

    async startPasswordReset(input) {
      if (!EMAIL.test(input.email)) return fail('VALIDATION_FAILED', 422)
      const user = users.get(byEmail.get(input.email.toLowerCase()) ?? '')
      if (user) {
        const token = randomBytes(32).toString('base64url')
        resetTokens.set(token, { userId: user.id, expiresAt: now() + RESET_TTL_MS })
        await options.deliverPasswordReset({ email: user.email, token })
      }
      return ok(null) // identical for unknown emails
    },

    async completePasswordReset(input) {
      const entry = resetTokens.get(input.token)
      resetTokens.delete(input.token) // single use, even when it turns out to be expired
      if (!entry || entry.expiresAt < now()) return fail('INVALID_TOKEN', 400)
      if (passwordIssue(input.newPassword)) return fail('VALIDATION_FAILED', 422)
      const user = users.get(entry.userId)
      if (!user) return fail('INVALID_TOKEN', 400)
      user.salt = randomBytes(16)
      user.hash = await hashPassword(input.newPassword, user.salt)
      for (const [sid, session] of sessions) if (session.userId === user.id) sessions.delete(sid)
      return ok(null)
    },

    async createTenant(input, request) {
      const current = currentSession(request)
      if (!current) return fail('UNAUTHENTICATED', 401)
      if ([...tenants.values()].some((t) => t.slug === input.slug)) return fail('VALIDATION_FAILED', 422)
      const tenant: Tenant = { id: id(), name: input.name, slug: input.slug }
      tenants.set(tenant.id, tenant)
      members.set(tenant.id, new Map([[current.session.userId, ['owner']]]))
      current.session.activeTenantId = tenant.id // mirrors Better Auth: a new tenant becomes active
      return ok<TenantMembership>({ tenantId: tenant.id, name: tenant.name, slug: tenant.slug, roles: ['owner'] })
    },

    async listTenants(request) {
      const current = currentSession(request)
      if (!current) return fail('UNAUTHENTICATED', 401)
      const result: TenantMembership[] = []
      for (const [tenantId, roster] of members) {
        const roles = roster.get(current.session.userId)
        const tenant = tenants.get(tenantId)
        if (roles && tenant) result.push({ tenantId, name: tenant.name, slug: tenant.slug, roles })
      }
      return ok<readonly TenantMembership[]>(result)
    },

    async switchTenant(input, request) {
      const current = currentSession(request)
      if (!current) return fail('UNAUTHENTICATED', 401)
      if (!members.get(input.tenantId)?.has(current.session.userId)) return fail('FORBIDDEN', 403)
      current.session.activeTenantId = input.tenantId
      return ok({ actor: actorFor(current.session) })
    },

    async addMemberAsSystem(input) {
      const roster = members.get(input.tenantId)
      if (!roster || !users.has(input.userId)) return fail('VALIDATION_FAILED', 422)
      roster.set(input.userId, [input.role])
      return ok(null)
    },

    async removeMemberAsSystem(input) {
      members.get(input.tenantId)?.delete(input.userId)
      return ok(null)
    },
  }
}
