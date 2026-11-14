/**
 * How the `auth` middleware turns a bearer token into a user. The app binds one in a service
 * provider; the framework never knows what a "user" table looks like.
 *
 * This is a deliberately small stub: the real guard (sessions, hashed personal tokens with
 * abilities, Sanctum's split) is designed in the auth research and spike 07.
 */
import { createHash } from 'node:crypto'
import { token } from '../foundation/container.ts'
import type { AuthUser } from '../registry.ts'

/**
 * Finds the user who owns a bearer token.
 *
 * @example
 * const provider: UserProvider = { retrieveByToken: async (plain) => (plain === 'secret' ? { id: 1 } : null) }
 */
export interface UserProvider {
  /** The user for this token, or `null` when the token is unknown. */
  retrieveByToken(plainToken: string): Promise<AuthUser | null>
}

/**
 * The container token for the app's {@link UserProvider}.
 *
 * @example
 * app.container.singleton(UserProviderToken, () => new AuthorTokenProvider())
 */
export const UserProviderToken = token<UserProvider>('UserProvider')

/**
 * SHA-256 of a token, hex encoded. Tokens are stored hashed, so a leaked database doesn't leak
 * working credentials (the same reason Sanctum hashes its tokens).
 *
 * @example
 * hashToken('secret') // '2bb80d53…'
 */
export function hashToken(plainToken: string): string {
  return createHash('sha256').update(plainToken).digest('hex')
}
