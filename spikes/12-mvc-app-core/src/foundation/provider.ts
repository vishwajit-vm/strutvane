/**
 * Service providers: Laravel's `register()` / `boot()` lifecycle, typed.
 *
 * - `register(app)` only *binds* things into the container. It runs for every provider before
 *   any `boot`, so a provider never sees a half-registered app.
 * - `boot(app)` may *use* other services (read config, add routes, commands, navigation).
 *
 * Packages ship a provider and the installer adds one line to `bootstrap/providers.ts`.
 * There is no auto-discovery from `node_modules`: the app lists what runs at boot.
 */
import type { Application } from './application.ts'

/**
 * The base class for service providers.
 *
 * @example
 * export class AppServiceProvider extends ServiceProvider {
 *   override register(app: Application): void {
 *     app.container.singleton(UserProviderToken, () => new AuthorTokenProvider())
 *   }
 * }
 */
export abstract class ServiceProvider {
  /**
   * Bind services. Don't resolve other services here: they may not be registered yet.
   *
   * @example
   * override register(app: Application): void { app.container.singleton(Mailer, () => new LogMailer()) }
   */
  register(_app: Application): void | Promise<void> {}

  /**
   * Use services: add routes, commands, navigation entries, event listeners.
   *
   * @example
   * override boot(app: Application): void { app.navigation.add({ label: 'Billing', route: 'billing.index' }) }
   */
  boot(_app: Application): void | Promise<void> {}
}

/**
 * A provider class with a no-argument constructor, as listed in `bootstrap/providers.ts`.
 *
 * @example
 * export default [AppServiceProvider] satisfies ProviderClass[]
 */
export type ProviderClass = new () => ServiceProvider
