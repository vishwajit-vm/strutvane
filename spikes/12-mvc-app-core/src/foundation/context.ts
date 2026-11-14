/**
 * The "current application" for helpers like `route()`, `config()` and `Model.find()`.
 *
 * Laravel helpers reach a global container. A Node server can host several apps (and a test run
 * certainly does), so the current app is carried by `AsyncLocalStorage`: it is set around every
 * request and every console command, and follows `await` automatically. Outside those scopes the
 * helpers fail with a message that says how to get the app explicitly.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { Container } from './container.ts'
import type { ConfigRepository } from './config.ts'
import type { UrlGenerator } from '../routing/url.ts'
import { StrutvaneError } from '../support/errors.ts'

/**
 * What helpers need from an application. `Application` implements it; the interface keeps this
 * module free of a circular import.
 *
 * @example
 * const scope: ApplicationScope = app
 */
export interface ApplicationScope {
  readonly container: Container
  readonly config: ConfigRepository
  readonly url: UrlGenerator
}

const storage = new AsyncLocalStorage<ApplicationScope>()

/**
 * Run `work` with `app` as the current application.
 *
 * @example
 * await runInApplication(app, () => route('posts.index'))
 */
export function runInApplication<TResult>(app: ApplicationScope, work: () => TResult): TResult {
  return storage.run(app, work)
}

/**
 * The current application, or a friendly error naming the helper that needed it.
 *
 * @example
 * currentApplication('route()').url.route('home')
 */
export function currentApplication(helper: string): ApplicationScope {
  const app = storage.getStore()
  if (app !== undefined) return app
  throw new StrutvaneError(
    'NO_CURRENT_APPLICATION',
    `${helper} was called outside a request or console command, so there is no current app.`,
    'Call it from a controller, middleware or command, or wrap the code in app.run(() => …) (tests: await app.run(async () => …)).',
  )
}
