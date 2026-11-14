/**
 * The `signed` middleware and the typed helpers that make signed links:
 *
 * ```ts
 * Route.get('/unsubscribe/{user}', [MailController, 'unsubscribe']).name('unsubscribe').middleware('signed')
 * const link = temporarySignedRoute('unsubscribe', new Date(Date.now() + 86_400_000), { user })
 * ```
 *
 * A tampered or unsigned link is a 403 `invalid_signature`; an expired one is a 403
 * `signature_expired`, so the page can offer "send me a new link".
 */
import { currentApplication } from '../foundation/context.ts'
import { ClockToken } from '../foundation/tokens.ts'
import type { RouteRegistry } from '../registry.ts'
import { route, type RouteArguments } from '../routing/url.ts'
import { KeyringToken, type Keyring } from '../security/keyring.ts'
import { signUrl, verifySignedUrl } from '../security/signed-url.ts'
import type { HttpContext } from './context.ts'
import type { Middleware, Next } from './middleware.ts'
import { HttpError } from './problem.ts'

/**
 * The `signed` middleware class.
 *
 * @example
 * Route.get('/downloads/{file}', [DownloadController, 'show']).middleware('signed')
 */
export class ValidateSignature implements Middleware {
  static readonly inject = [KeyringToken, ClockToken] as const
  readonly #keyring: Keyring
  readonly #clock: () => Date

  constructor(keyring: Keyring, clock: () => Date) {
    this.#keyring = keyring
    this.#clock = clock
  }

  async handle(ctx: HttpContext, next: Next): Promise<Response> {
    const verdict = verifySignedUrl(`${ctx.url.pathname}${ctx.url.search}`, this.#keyring, this.#clock())
    if (verdict === 'valid') return next()
    if (verdict === 'expired') throw new HttpError(403, 'signature_expired', 'Link expired', 'This link has expired. Ask for a new one.')
    throw new HttpError(403, 'invalid_signature', 'Invalid signature', 'This link is not valid. It may have been changed or copied incompletely.')
  }
}

/**
 * The URL of a named route, signed (no expiry). Name and parameters are typed like `route()`.
 *
 * @example
 * signedRoute('unsubscribe', { user })
 */
export function signedRoute<TName extends keyof RouteRegistry & string>(name: TName, ...args: RouteArguments<TName>): string {
  return signUrl(route(name, ...args), currentApplication('signedRoute()').container.make(KeyringToken))
}

/**
 * The URL of a named route, signed and valid until `expiresAt`.
 *
 * @example
 * temporarySignedRoute('downloads.show', new Date(Date.now() + 30 * 60_000), { file })
 */
export function temporarySignedRoute<TName extends keyof RouteRegistry & string>(name: TName, expiresAt: Date, ...args: RouteArguments<TName>): string {
  return signUrl(route(name, ...args), currentApplication('temporarySignedRoute()').container.make(KeyringToken), expiresAt)
}
