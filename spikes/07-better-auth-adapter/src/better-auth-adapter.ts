/**
 * Better Auth behind Strutvane's {@link IdentityEngine} interface.
 *
 * Every user-facing call goes through Better Auth's real HTTP handler (`auth.handler`), not its
 * server API shortcuts. That way cookies, CSRF/origin checks and rate limiting behave exactly as
 * they would in production; the adapter only translates requests in and results out.
 *
 * Nothing from Better Auth is exported from this module except through Strutvane types.
 *
 * @module
 */
import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import { organization } from 'better-auth/plugins/organization'
import type { Pool } from 'pg'
import type { Actor } from './contracts.ts'
import {
  fail,
  type IdentityEngine,
  type IdentityErrorCode,
  type IdentityResult,
  ok,
  type PasswordResetDelivery,
  type TenantMembership,
} from './identity-engine.ts'

/** Options for {@link createBetterAuthEngine}. */
export interface BetterAuthEngineOptions {
  /** PostgreSQL pool (the app's own; Better Auth tables live in the app database). */
  readonly pool: Pool
  /** Public base URL of the app, e.g. `https://app.example.com`. `https` makes cookies `Secure`. */
  readonly baseURL: string
  /** At least 32 random bytes (base64). Signs cookies and tokens. */
  readonly secret: string
  /** Sends the password-reset token (wire to the mailer / queue). */
  readonly deliverPasswordReset: PasswordResetDelivery
  /**
   * Sign-in rate limit per client IP. Better Auth only enables rate limiting in production by
   * default; Strutvane always enables it explicitly.
   */
  readonly signInRateLimit?: { readonly windowSeconds: number; readonly max: number }
  /** Headers that carry the client IP, set by YOUR proxy (never trust client-supplied values). */
  readonly ipAddressHeaders?: readonly string[]
  /** Called for unexpected engine failures. Never receives secrets. */
  readonly onUnexpectedError?: (context: string, error: unknown) => void
}

/** Request headers the adapter forwards to Better Auth. Everything else is dropped. */
const FORWARDED_HEADERS = [
  'cookie',
  'origin',
  'referer',
  'user-agent',
  'sec-fetch-site',
  'sec-fetch-mode',
  'sec-fetch-dest',
] as const

const BASE_PATH = '/api/auth'

/**
 * Ids are UUIDs (see `generateId: 'uuid'`). Anything else is rejected BEFORE it reaches Postgres:
 * otherwise a malformed id fails the uuid cast and surfaces as a 500, which is both a wrong answer
 * and a probe (malformed vs unknown ids would look different).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Map Better Auth error codes to Strutvane codes. Unknown codes fall back to the HTTP status. */
const CODE_MAP: Readonly<Record<string, IdentityErrorCode>> = {
  INVALID_EMAIL_OR_PASSWORD: 'INVALID_CREDENTIALS',
  INVALID_PASSWORD: 'INVALID_CREDENTIALS',
  USER_ALREADY_EXISTS: 'EMAIL_UNAVAILABLE',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'EMAIL_UNAVAILABLE',
  PASSWORD_TOO_SHORT: 'VALIDATION_FAILED',
  PASSWORD_TOO_LONG: 'VALIDATION_FAILED',
  INVALID_EMAIL: 'VALIDATION_FAILED',
  VALIDATION_ERROR: 'VALIDATION_FAILED',
  MISSING_FIELD: 'VALIDATION_FAILED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'INVALID_TOKEN',
  // Organization plugin: "not a member" and "does not exist" must look identical.
  YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION: 'FORBIDDEN',
  ORGANIZATION_NOT_FOUND: 'FORBIDDEN',
  USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION: 'FORBIDDEN',
}

function codeFromStatus(status: number): IdentityErrorCode {
  if (status === 401) return 'UNAUTHENTICATED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 429) return 'RATE_LIMITED'
  if (status >= 400 && status < 500) return 'VALIDATION_FAILED'
  return 'INTERNAL_ERROR'
}

/** Standard HTTP status per code, so hosts answer consistently whatever the engine said. */
const STATUS_FOR: Readonly<Record<IdentityErrorCode, number>> = {
  VALIDATION_FAILED: 422,
  INVALID_CREDENTIALS: 401,
  EMAIL_UNAVAILABLE: 422,
  RATE_LIMITED: 429,
  INVALID_TOKEN: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  INTERNAL_ERROR: 500,
}

/** Build the Better Auth instance. Exported for schema generation and tests only. */
export function buildBetterAuth(options: BetterAuthEngineOptions) {
  const limit = options.signInRateLimit ?? { windowSeconds: 60, max: 5 }
  return betterAuth({
    database: options.pool,
    baseURL: options.baseURL,
    basePath: BASE_PATH,
    secret: options.secret,
    logger: { disabled: true },
    telemetry: { enabled: false },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      // Without this, a reset leaves an attacker's existing session alive.
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 30,
      sendResetPassword: async ({ user, token }) => {
        await options.deliverPasswordReset({ email: user.email, token })
      },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: { '/sign-in/email': { window: limit.windowSeconds, max: limit.max } },
    },
    advanced: {
      // Tenant ids flow into Postgres RLS as `current_setting('app.tenant_id')::uuid` (ADR-0007).
      // Better Auth's default ids are random strings, which would make that cast fail.
      database: { generateId: 'uuid' },
      ipAddress: { ipAddressHeaders: [...(options.ipAddressHeaders ?? ['x-forwarded-for'])] },
      // Without a background handler Better Auth runs deferred work inline, and the password-reset
      // response then waits for email delivery: a known email answered in ~419 ms vs ~12 ms for an
      // unknown one (user enumeration by timing). Running it in the background closes that gap.
      backgroundTasks: {
        handler: (task) => {
          task.catch((error: unknown) => options.onUnexpectedError?.('better-auth background task', error))
        },
      },
    },
    // Unexpected internal errors are rethrown out of the handler instead of being printed by Better
    // Auth's router (`console.error("# SERVER_ERROR", …)` with a full stack trace, which bypasses
    // Strutvane's logger and redaction). The adapter's `guarded()` catches them, reports them once
    // and returns INTERNAL_ERROR. Expected API errors (wrong password, 403…) are still responses.
    onAPIError: { throw: true },
    plugins: [
      organization({
        allowUserToCreateOrganization: true,
        creatorRole: 'owner',
      }),
    ],
  })
}

type BetterAuthInstance = ReturnType<typeof buildBetterAuth>

/** A parsed handler response. */
interface HandlerResponse {
  readonly status: number
  readonly body: unknown
  readonly headers: Headers
}

/** Create the Better Auth identity engine. */
export function createBetterAuthEngine(options: BetterAuthEngineOptions): IdentityEngine & {
  /** Create/upgrade Better Auth's tables (spike only; real apps use Strutvane migrations). */
  migrate(): Promise<void>
} {
  const auth: BetterAuthInstance = buildBetterAuth(options)
  const ipHeaders = options.ipAddressHeaders ?? ['x-forwarded-for']
  const report = (context: string, error: unknown): void => options.onUnexpectedError?.(context, error)

  /** Call a Better Auth endpoint through its real HTTP handler, forwarding only safe headers. */
  async function call(
    method: 'GET' | 'POST',
    path: string,
    from: Request,
    body?: Readonly<Record<string, unknown>>,
  ): Promise<HandlerResponse> {
    const headers = new Headers()
    for (const name of [...FORWARDED_HEADERS, ...ipHeaders]) {
      const value = from.headers.get(name)
      if (value !== null) headers.set(name, value)
    }
    const init: RequestInit = { method, headers }
    if (body !== undefined) {
      headers.set('content-type', 'application/json')
      init.body = JSON.stringify(body)
    }
    const response = await auth.handler(new Request(`${options.baseURL}${BASE_PATH}${path}`, init))
    const outHeaders = new Headers()
    for (const cookie of response.headers.getSetCookie()) outHeaders.append('set-cookie', cookie)
    const text = await response.text()
    let parsed: unknown = null
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = null
      }
    }
    const retryAfter = response.headers.get('x-retry-after') ?? response.headers.get('retry-after')
    if (retryAfter !== null) outHeaders.set('retry-after', retryAfter)
    return { status: response.status, body: parsed, headers: outHeaders }
  }

  /** Convert a non-2xx handler response into a Strutvane error result. */
  function toFailure<T>(res: HandlerResponse): IdentityResult<T> {
    const engineCode =
      typeof res.body === 'object' && res.body !== null && 'code' in res.body
        ? String((res.body as { code: unknown }).code)
        : ''
    const code = CODE_MAP[engineCode] ?? codeFromStatus(res.status)
    if (code === 'INTERNAL_ERROR') report(`better-auth ${res.status} ${engineCode}`, res.body)
    const retry = Number(res.headers.get('retry-after'))
    return fail(
      code,
      STATUS_FOR[code],
      res.headers,
      code === 'RATE_LIMITED' && Number.isFinite(retry) && retry > 0 ? retry : undefined,
    )
  }

  /** Wrap an operation so engine exceptions become INTERNAL_ERROR results, never throws. */
  async function guarded<T>(
    context: string,
    run: () => Promise<IdentityResult<T>>,
  ): Promise<IdentityResult<T>> {
    try {
      return await run()
    } catch (error) {
      report(context, error)
      return fail('INTERNAL_ERROR', 500)
    }
  }

  /** Roles of `userId` in `tenantId` (Better Auth stores them comma-separated). */
  async function rolesIn(userId: string, tenantId: string): Promise<readonly string[] | null> {
    if (!UUID.test(userId) || !UUID.test(tenantId)) return null
    const ctx = await auth.$context
    const member = await ctx.adapter.findOne<{ role: string }>({
      model: 'member',
      where: [
        { field: 'userId', value: userId },
        { field: 'organizationId', value: tenantId },
      ],
    })
    if (!member) return null
    return member.role
      .split(',')
      .map((r) => r.trim())
      .filter((r) => r.length > 0)
  }

  /** Build an Actor from session data. A stale active tenant (membership gone) is dropped. */
  async function actorFrom(user: { id: string; emailVerified?: boolean }, activeTenantId: unknown) {
    const base = { id: user.id, type: 'user' as const, attrs: { emailVerified: user.emailVerified === true } }
    if (typeof activeTenantId !== 'string' || activeTenantId.length === 0) {
      return { ...base, roles: [] } satisfies Actor
    }
    const roles = await rolesIn(user.id, activeTenantId)
    if (roles === null) return { ...base, roles: [] } satisfies Actor // fail closed
    return { ...base, tenantId: activeTenantId, roles } satisfies Actor
  }

  async function session(request: Request) {
    const res = await call('GET', '/get-session', request)
    if (res.status !== 200 || typeof res.body !== 'object' || res.body === null) return null
    const body = res.body as {
      user?: { id: string; emailVerified?: boolean }
      session?: { activeOrganizationId?: unknown }
    }
    if (!body.user || !body.session) return null
    return { user: body.user, activeTenantId: body.session.activeOrganizationId }
  }

  /** Requests built by the adapter that must carry a just-issued session cookie. */
  function withCookies(request: Request, setCookies: Headers): Request {
    const fresh = setCookies
      .getSetCookie()
      .map((c) => c.split(';')[0] ?? '')
      .filter((c) => c.length > 0)
    const headers = new Headers(request.headers)
    if (fresh.length > 0) headers.set('cookie', fresh.join('; '))
    return new Request(request.url, { method: 'GET', headers })
  }

  const engine: IdentityEngine & { migrate(): Promise<void> } = {
    name: 'better-auth',

    async migrate() {
      const { runMigrations } = await getMigrations(auth.options)
      await runMigrations()
    },

    signUp(input, request) {
      return guarded('signUp', async () => {
        const res = await call('POST', '/sign-up/email', request, {
          email: input.email,
          password: input.password,
          name: input.name,
        })
        if (res.status !== 200) return toFailure(res)
        const current = await session(withCookies(request, res.headers))
        if (!current) return fail('INTERNAL_ERROR', 500)
        return ok({ actor: await actorFrom(current.user, current.activeTenantId) }, res.headers)
      })
    },

    signIn(input, request) {
      return guarded('signIn', async () => {
        const res = await call('POST', '/sign-in/email', request, {
          email: input.email,
          password: input.password,
        })
        if (res.status !== 200) return toFailure(res)
        const current = await session(withCookies(request, res.headers))
        if (!current) return fail('INTERNAL_ERROR', 500)
        return ok({ actor: await actorFrom(current.user, current.activeTenantId) }, res.headers)
      })
    },

    signOut(request) {
      return guarded('signOut', async () => {
        const res = await call('POST', '/sign-out', request)
        if (res.status !== 200) return toFailure(res)
        return ok(null, res.headers)
      })
    },

    async getActor(request) {
      try {
        const current = await session(request)
        return current ? await actorFrom(current.user, current.activeTenantId) : null
      } catch (error) {
        report('getActor', error)
        return null
      }
    },

    startPasswordReset(input, request) {
      return guarded('startPasswordReset', async () => {
        const res = await call('POST', '/request-password-reset', request, { email: input.email })
        // Better Auth answers 200 for unknown emails too; only real failures are surfaced.
        if (res.status !== 200) return toFailure(res)
        return ok(null, res.headers)
      })
    },

    completePasswordReset(input, request) {
      return guarded('completePasswordReset', async () => {
        const res = await call('POST', '/reset-password', request, {
          token: input.token,
          newPassword: input.newPassword,
        })
        if (res.status !== 200) return toFailure(res)
        return ok(null, res.headers)
      })
    },

    createTenant(input, request) {
      return guarded('createTenant', async () => {
        const res = await call('POST', '/organization/create', request, {
          name: input.name,
          slug: input.slug,
        })
        if (res.status !== 200) return toFailure(res)
        const org = res.body as { id: string; name: string; slug: string }
        return ok<TenantMembership>(
          { tenantId: org.id, name: org.name, slug: org.slug, roles: ['owner'] },
          res.headers,
        )
      })
    },

    listTenants(request) {
      return guarded('listTenants', async () => {
        const current = await session(request)
        if (!current) return fail('UNAUTHENTICATED', 401)
        const res = await call('GET', '/organization/list', request)
        if (res.status !== 200) return toFailure(res)
        const orgs = (res.body ?? []) as { id: string; name: string; slug: string }[]
        const memberships: TenantMembership[] = []
        for (const org of orgs) {
          const roles = await rolesIn(current.user.id, org.id)
          if (roles) memberships.push({ tenantId: org.id, name: org.name, slug: org.slug, roles })
        }
        return ok<readonly TenantMembership[]>(memberships, res.headers)
      })
    },

    switchTenant(input, request) {
      return guarded('switchTenant', async () => {
        const current = await session(request)
        if (!current) return fail('UNAUTHENTICATED', 401)
        if (!UUID.test(input.tenantId)) return fail('FORBIDDEN', 403) // same answer as "unknown"
        const res = await call('POST', '/organization/set-active', request, {
          organizationId: input.tenantId,
        })
        if (res.status !== 200) {
          // Any refusal (not a member, unknown tenant) is FORBIDDEN, so tenants can't be probed.
          const failure = toFailure<{ actor: Actor }>(res)
          return failure.ok || failure.error.code === 'INTERNAL_ERROR'
            ? failure
            : fail('FORBIDDEN', 403, res.headers)
        }
        const after = await session(request)
        if (!after) return fail('UNAUTHENTICATED', 401)
        return ok({ actor: await actorFrom(after.user, after.activeTenantId) }, res.headers)
      })
    },

    addMemberAsSystem(input) {
      return guarded('addMemberAsSystem', async () => {
        if (!UUID.test(input.tenantId) || !UUID.test(input.userId)) return fail('VALIDATION_FAILED', 422)
        await auth.api.addMember({
          // Better Auth types roles as its configured role names; Strutvane passes strings and
          // relies on the organization plugin to reject unknown roles at runtime.
          body: {
            userId: input.userId,
            organizationId: input.tenantId,
            role: input.role as 'member',
          },
        })
        return ok(null)
      })
    },

    removeMemberAsSystem(input) {
      return guarded('removeMemberAsSystem', async () => {
        if (!UUID.test(input.tenantId) || !UUID.test(input.userId)) return fail('VALIDATION_FAILED', 422)
        // There is no session-less "remove member" endpoint, so the system operation goes through
        // the adapter layer directly. Sessions keep activeOrganizationId, but actorFrom() re-checks
        // membership on every request, so the stale tenant is dropped immediately (fail closed).
        const ctx = await auth.$context
        await ctx.adapter.deleteMany({
          model: 'member',
          where: [
            { field: 'userId', value: input.userId },
            { field: 'organizationId', value: input.tenantId },
          ],
        })
        return ok(null)
      })
    },
  }
  return engine
}
