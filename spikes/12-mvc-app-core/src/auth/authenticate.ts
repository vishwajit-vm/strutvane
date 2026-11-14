/**
 * The `auth` middleware: Laravel's `Authenticate`, for bearer tokens.
 *
 * - `auth` → a valid token is required, otherwise 401.
 * - `auth:optional` → sign the user in when a token is sent, but let guests through (useful for
 *   lists where guests see published posts and authors also see their drafts).
 */
import type { HttpContext } from '../http/context.ts'
import type { Middleware, Next } from '../http/middleware.ts'
import { UnauthenticatedError } from '../http/problem.ts'
import { UserProviderToken, type UserProvider } from './user-provider.ts'

/** `Bearer <token>`, case-insensitive scheme, token of visible ASCII characters. */
const BEARER = /^Bearer ([\x21-\x7e]+)$/i

/**
 * The `auth` middleware class.
 *
 * @example
 * Route.get('/me', [ProfileController, 'show']).middleware('auth')
 */
export class Authenticate implements Middleware {
  static readonly inject = [UserProviderToken] as const
  readonly #users: UserProvider

  constructor(users: UserProvider) {
    this.#users = users
  }

  async handle(ctx: HttpContext, next: Next, mode?: string): Promise<Response> {
    const optional = mode === 'optional'
    const header = ctx.request.headers.get('authorization')
    if (header === null) {
      if (optional) return next()
      throw new UnauthenticatedError()
    }
    const match = BEARER.exec(header)
    const plainToken = match?.[1]
    // A malformed or unknown token is a 401 even on optional routes: the client *tried* to sign
    // in and should learn that it failed, rather than silently seeing the guest view.
    if (plainToken === undefined) throw new UnauthenticatedError('The Authorization header must look like "Bearer <token>".')
    const user = await this.#users.retrieveByToken(plainToken)
    if (user === null) throw new UnauthenticatedError('That token is not valid. Sign in again to get a new one.')
    ctx.user = user
    return next()
  }
}
