/**
 * Boot guards: settings so dangerous that the app refuses to start with them, instead of
 * starting and hoping nobody notices.
 *
 * 1. `APP_DEBUG=true` with `APP_ENV=production`. The debug page is already impossible in
 *    production, but the combination almost always means a development `.env` was deployed, with
 *    its development keys and passwords. `--force-debug` (or `app.forceDebug()`) starts anyway,
 *    with a logged warning, for a deliberate short investigation.
 * 2. A missing, short or malformed `APP_KEY` (or entry in `APP_PREVIOUS_KEYS`). Everything signed
 *    or encrypted depends on it; a weak key is a forgeable key.
 */
import { StrutvaneError } from '../support/errors.ts'
import { Keyring } from './keyring.ts'

/**
 * What the guards look at.
 *
 * @example
 * const input: BootGuardInput = { environment: 'production', debug: false, appKey: 'base64:…', previousKeys: '', forceDebug: false }
 */
export interface BootGuardInput {
  readonly environment: string
  readonly debug: boolean
  readonly appKey: string
  readonly previousKeys: string
  readonly forceDebug: boolean
}

/**
 * Run the guards. Returns the keyring (so the key is parsed once) and any warnings to log; throws
 * a friendly {@link StrutvaneError} when the app must not start.
 *
 * @example
 * const { keyring, warnings } = checkBootGuards({ environment, debug, appKey, previousKeys, forceDebug })
 */
export function checkBootGuards(input: BootGuardInput): { readonly keyring: Keyring; readonly warnings: readonly string[] } {
  const warnings: string[] = []
  if (input.debug && input.environment === 'production') {
    if (!input.forceDebug) {
      throw new StrutvaneError(
        'DEBUG_IN_PRODUCTION',
        'The app refuses to start: APP_DEBUG=true with APP_ENV=production.',
        'Set APP_DEBUG=false in the production environment. To start anyway for a short investigation, pass --force-debug (the debug page stays off in production either way).',
      )
    }
    warnings.push('Started with --force-debug: APP_DEBUG=true in production. Debug pages stay off; turn APP_DEBUG off again as soon as possible.')
  }
  return { keyring: Keyring.from(input.appKey, input.previousKeys), warnings }
}
