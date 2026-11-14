/**
 * The application: Laravel's `bootstrap/app.php`, as a fluent builder.
 *
 * ```ts
 * export default Application.configure({ basePath: dirname(import.meta.dirname) })
 *   .withConfig(config)
 *   .withProviders(providers)
 *   .withRouting({ web, api, health: '/up', bindings: { post: Post } })
 *   .withMiddleware((middleware) => middleware.alias({ admin: EnsureAdmin }))
 *   .withExceptions((exceptions) => exceptions.dontReport(PaymentDeclined))
 *   .create()
 * ```
 *
 * `create()` is cheap and does no I/O. The work happens in `boot()` (called lazily by the first
 * request or command): config and env are validated, providers register then boot, routes are
 * compiled and *every* route is checked (middleware aliases, bindings, policies, internal tables),
 * so a mistake fails at start-up and in `node strut route:list`, not on the first request.
 */
import { Hono } from 'hono'
import { Authenticate } from '../auth/authenticate.ts'
import type { AnyCommand } from '../console/command.ts'
import { ConnectionToken, openConnection, type ConnectionSettings } from '../database/connection.ts'
import { isInternalResource, loadMetadata, MetadataToken } from '../database/metadata.ts'
import { ExceptionHandler, ExceptionsConfig } from '../exceptions/handler.ts'
import { HttpContext } from '../http/context.ts'
import { Authorize } from '../http/authorize.ts'
import { VerifyCsrfToken } from '../http/csrf.ts'
import { buildMiddleware, MiddlewareConfig, MiddlewareConfigToken, type MiddlewareReference } from '../http/middleware.ts'
import { cspReportRoutes } from '../http/csp-report.ts'
import { corsPreflightStage, decorateResponse, runStages, trustedHostStage, type KernelStage } from '../http/kernel.ts'
import { newNonce, type RequestState } from '../http/request-state.ts'
import { forwardedClient } from '../security/trusted-proxies.ts'
import { resolveRouteMiddleware, type ResolvedRouteMiddleware } from '../http/route-middleware.ts'
import { SecurityToken, type ResolvedSecurity } from '../security/settings.ts'
import { closestMatch } from '../support/str.ts'
import { NotFoundError, HttpError } from '../http/problem.ts'
import { ResourceController } from '../http/resource-controller.ts'
import { MemoryRateLimitStore, RateLimitStoreToken, ThrottleRequests } from '../http/throttle.ts'
import { defineRoutes, Route, type RouteList } from '../routing/route.ts'
import { actionLabel, allowedMethods, compileRoutes, toHonoPath, type CompiledRoute } from '../routing/router.ts'
import { UrlGenerator } from '../routing/url.ts'
import { StrutvaneError } from '../support/errors.ts'
import { StderrLogger } from '../support/log.ts'
import { loadConfig, type ConfigDefinition, type ConfigRepository } from './config.ts'
import { Container, type Key, type Token } from './container.ts'
import { runInApplication, type ApplicationScope } from './context.ts'
import { loadEnvSource, type EnvSource } from './env.ts'
import type { ProviderClass, ServiceProvider } from './provider.ts'
import { ClockToken, ConfigToken, LoggerToken } from './tokens.ts'

/**
 * A model class that route model binding can use.
 *
 * @example
 * const bindings: Record<string, BindableModel> = { post: Post }
 */
export interface BindableModel {
  readonly name: string
  resolveRouteBinding(value: string, field?: string): Promise<object | null>
  metadata(): { readonly label: { readonly singular: string } }
}

/**
 * `withRouting` options, Laravel's `withRouting(web:, api:, health:)`.
 *
 * @example
 * .withRouting({ web, api, health: '/up', bindings: { post: Post, author: Author } })
 */
export interface RoutingOptions {
  readonly web?: RouteList<unknown>
  readonly api?: RouteList<unknown>
  /** Prefix for API routes. Default `/api`. */
  readonly apiPrefix?: string
  /** A liveness route answering `{"status":"ok"}`, like Laravel's `/up`. */
  readonly health?: string
  /** Route model binding: a `{post}` parameter is resolved through `Post`, or a 404. */
  readonly bindings?: Readonly<Record<string, BindableModel>>
}

/**
 * A sidebar/navigation entry contributed by the app or a package (rendered by the React UI).
 *
 * @example
 * app.navigation.add({ label: 'Billing', route: 'billing.index', group: 'Account', order: 50 })
 */
export interface NavigationItem {
  readonly label: string
  /** A named route. */
  readonly route: string
  readonly group?: string
  readonly icon?: string
  readonly order?: number
}

/** Everything the builder collected. */
interface Blueprint {
  readonly basePath: string
  readonly env: EnvSource | undefined
  config: Readonly<Record<string, ConfigDefinition<unknown>>>
  providers: readonly ProviderClass[]
  routing: RoutingOptions
  middleware: ((config: MiddlewareConfig) => void)[]
  exceptions: ((config: ExceptionsConfig) => void)[]
  commands: AnyCommand[]
}

/**
 * The fluent builder returned by {@link Application.configure}.
 *
 * @example
 * Application.configure({ basePath }).withRouting({ api }).create()
 */
export class ApplicationBuilder {
  readonly #blueprint: Blueprint

  constructor(basePath: string, env: EnvSource | undefined) {
    this.#blueprint = { basePath, env, config: {}, providers: [], routing: {}, middleware: [], exceptions: [], commands: [] }
  }

  /**
   * The config files (`config/index.ts` exports them as one object).
   *
   * @example
   * .withConfig({ app, database })
   */
  withConfig(files: Readonly<Record<string, ConfigDefinition<unknown>>>): this {
    this.#blueprint.config = { ...this.#blueprint.config, ...files }
    return this
  }

  /**
   * The service providers (`bootstrap/providers.ts`).
   *
   * @example
   * .withProviders([AppServiceProvider])
   */
  withProviders(providers: readonly ProviderClass[]): this {
    this.#blueprint.providers = [...this.#blueprint.providers, ...providers]
    return this
  }

  /**
   * Routes files, the health route and model bindings.
   *
   * @example
   * .withRouting({ web, api, health: '/up', bindings: { post: Post } })
   */
  withRouting(options: RoutingOptions): this {
    this.#blueprint.routing = { ...this.#blueprint.routing, ...options }
    return this
  }

  /**
   * Configure middleware aliases, groups and rate limiters.
   *
   * @example
   * .withMiddleware((middleware) => middleware.rateLimiter('api', { maxAttempts: 120, decaySeconds: 60 }))
   */
  withMiddleware(configure: (middleware: MiddlewareConfig) => void): this {
    this.#blueprint.middleware.push(configure)
    return this
  }

  /**
   * Configure exception reporting and rendering.
   *
   * @example
   * .withExceptions((exceptions) => exceptions.dontReport(PaymentDeclined))
   */
  withExceptions(configure: (exceptions: ExceptionsConfig) => void): this {
    this.#blueprint.exceptions.push(configure)
    return this
  }

  /**
   * App commands for `node strut` (Laravel's `routes/console.php` / `withCommands`).
   *
   * @example
   * .withCommands([inspire])
   */
  withCommands(commands: readonly AnyCommand[]): this {
    this.#blueprint.commands.push(...commands)
    return this
  }

  /**
   * Build the application. No I/O happens here.
   *
   * @example
   * export default Application.configure({ basePath }).withRouting({ api }).create()
   */
  create(): Application {
    return new Application(this.#blueprint)
  }
}

/** What exists once the app has booted. */
interface BootedState {
  readonly config: ConfigRepository
  readonly routes: readonly CompiledRoute[]
  readonly url: UrlGenerator
  readonly hono: Hono<{ Bindings: RequestState }>
  readonly handler: ExceptionHandler
  readonly middleware: ReadonlyMap<CompiledRoute, ResolvedRouteMiddleware>
  readonly security: ResolvedSecurity
  /** Global stages run before routing for every request. */
  readonly stages: readonly KernelStage[]
}

/** What `handle()` may know about the connection. */
export interface RequestInfo {
  /** The peer address from the socket (never from headers). */
  readonly ip?: string
  /**
   * Test-only switches set by `#strutvane/testing` (never by a request): the app refuses them
   * unless APP_ENV=testing, so they can't weaken a real deployment.
   */
  readonly testing?: { readonly withoutCsrf?: boolean }
}

/**
 * A Strutvane application. One per process normally; tests create as many as they like.
 *
 * @example
 * const response = await app.handle(new Request('http://localhost/api/posts'))
 */
export class Application implements ApplicationScope {
  readonly basePath: string
  readonly container = new Container()
  /** Navigation entries from the app and packages, for the React sidebar. */
  readonly navigation = new NavigationRegistry()
  readonly #blueprint: Blueprint
  readonly #middleware = new MiddlewareConfig()
  readonly #exceptions = new ExceptionsConfig()
  readonly #providers: ServiceProvider[] = []
  readonly #extraRoutes: { routes: RouteList<unknown>; prefix: string; group: string | undefined }[] = []
  readonly #commands = new Map<string, AnyCommand>()
  /** Global stages added by the framework (maintenance mode) between the host check and CORS. */
  readonly #extraStages: KernelStage[] = []
  #state: BootedState | undefined
  #booting: Promise<void> | undefined

  constructor(blueprint: Blueprint) {
    this.#blueprint = blueprint
    this.basePath = blueprint.basePath
    for (const command of blueprint.commands) this.#commands.set(command.name, command)
  }

  /**
   * Start building an app, Laravel's `Application::configure(basePath: …)`.
   *
   * @example
   * Application.configure({ basePath: '/srv/blog', env: { APP_ENV: 'testing' } })
   */
  static configure(options: { readonly basePath: string; readonly env?: EnvSource }): ApplicationBuilder {
    return new ApplicationBuilder(options.basePath, options.env)
  }

  /** The loaded config. Throws before boot. */
  get config(): ConfigRepository {
    return this.#booted('app.config').config
  }

  /** The URL generator. Throws before boot. */
  get url(): UrlGenerator {
    return this.#booted('app.url').url
  }

  /** The compiled route table, in match order. Throws before boot. */
  get routes(): readonly CompiledRoute[] {
    return this.#booted('app.routes').routes
  }

  /**
   * The middleware a route runs after every style (groups, route, controller, wrapper, opt-outs)
   * was applied, plus the opt-outs that shaped it. `route:list --security` prints this.
   *
   * @example
   * app.routeMiddleware(app.routes[0]).optOuts // [{ alias: 'csrf', source: 'route' }]
   */
  routeMiddleware(route: CompiledRoute): ResolvedRouteMiddleware {
    const resolved = this.#booted('app.routeMiddleware()').middleware.get(route)
    if (resolved !== undefined) return resolved
    throw new StrutvaneError('UNKNOWN_ROUTE', `${route.uri} is not one of this app's routes.`, 'Pass a route from app.routes.')
  }

  /** `APP_ENV`: `local`, `testing` or `production`. */
  get environment(): string {
    return String(this.config.get('app.env'))
  }

  /** `true` when debug details may be shown: APP_DEBUG and a local or testing environment. */
  get showsDebugDetails(): boolean {
    return this.config.get('app.debug') === true && (this.environment === 'local' || this.environment === 'testing')
  }

  /** Every console command: the core ones are added by the kernel, plus the app's and packages'. */
  get commands(): readonly AnyCommand[] {
    return [...this.#commands.values()]
  }

  /**
   * Resolve from the container (shortcut for `app.container.make`).
   *
   * @example
   * const db = app.make(ConnectionToken)
   */
  make<TValue>(key: Token<TValue>): TValue {
    return this.container.make(key)
  }

  /**
   * Add routes from a package's provider (call it in `register()`). They get their own prefix and
   * middleware group.
   *
   * @example
   * app.addRoutes(billingRoutes, { prefix: '/api/billing', group: 'api' })
   */
  addRoutes(routes: RouteList<unknown>, options: { readonly prefix?: string; readonly group?: string } = {}): void {
    if (this.#state !== undefined) throw new StrutvaneError('ROUTES_AFTER_BOOT', 'Routes were added after the app booted, so they would never be matched.', 'Call app.addRoutes() in a provider\'s register() method.')
    this.#extraRoutes.push({ routes, prefix: options.prefix ?? '', group: options.group })
  }

  /**
   * Add a console command from a package's provider.
   *
   * @example
   * app.addCommand(billingSyncCommand)
   */
  addCommand(command: AnyCommand): void {
    this.#commands.set(command.name, command)
  }

  /**
   * Run code with this app as the current one, so `route()`, `config()` and models work
   * (tests and scripts use it; requests and commands get it automatically).
   *
   * @example
   * const url = await app.run(() => route('posts.index'))
   */
  run<TResult>(work: () => TResult): TResult {
    return runInApplication(this, work)
  }

  /**
   * Boot once: config, providers, routes and all start-up checks. Safe to call many times.
   *
   * @example
   * await app.boot()
   */
  async boot(): Promise<this> {
    this.#booting ??= this.#boot()
    await this.#booting
    return this
  }

  /**
   * Handle one HTTP request. This is the app's `fetch` handler (Hono, Node, tests).
   *
   * @example
   * const response = await app.handle(new Request('http://localhost/up'))
   */
  async handle(request: Request, info: RequestInfo = {}): Promise<Response> {
    await this.boot()
    const booted = this.#booted('app.handle()')
    const state = this.#requestState(request, info, booted.security)
    const ctx = new HttpContext({ request, state })
    return runInApplication(this, async () => {
      let response: Response
      try {
        response = await runStages(booted.stages, ctx, async () => booted.hono.fetch(request, state))
      } catch (error) {
        response = await booted.handler.render(error, ctx)
      }
      // Outside the try: error responses get the security headers too.
      return decorateResponse(response, ctx, booted.security, this.environment)
    })
  }

  #requestState(request: Request, info: RequestInfo, security: ResolvedSecurity): RequestState {
    const skipCsrf = info.testing?.withoutCsrf === true
    if (skipCsrf && this.environment !== 'testing') {
      throw new StrutvaneError('TESTING_ONLY', `withoutCsrf() was used with APP_ENV=${this.environment}.`, 'It is a test helper: it only works when APP_ENV=testing, so it can never switch CSRF off in a real deployment.')
    }
    return { ...forwardedClient(info.ip, request, security.proxies), nonce: newNonce(), limits: security.limits, skipCsrf }
  }

  /**
   * Close connections. Call it when the process stops (the `serve` command does).
   *
   * @example
   * await app.shutdown()
   */
  async shutdown(): Promise<void> {
    if (this.#state !== undefined && this.container.has(ConnectionToken)) await this.container.make(ConnectionToken).close()
  }

  async #boot(): Promise<void> {
    const config = loadConfig(this.#blueprint.config, loadEnvSource(this.basePath, this.#blueprint.env))
    this.#registerCore(config)
    for (const configure of this.#blueprint.middleware) configure(this.#middleware)
    for (const configure of this.#blueprint.exceptions) configure(this.#exceptions)
    const providers = this.#blueprint.providers.map((Provider) => new Provider())
    this.#providers.push(...providers)
    // Two phases, like Laravel: every register() before any boot().
    for (const provider of providers) await provider.register(this)
    const environment = String(config.get('app.env'))
    const security = this.#middleware.security.resolve({ appUrl: String(config.get('app.url')), environment })
    this.container.instance(SecurityToken, security)
    const routes = this.#compileRoutes()
    const url = new UrlGenerator(routes, String(config.get('app.url')))
    const logger = this.container.make(LoggerToken)
    const showDetails = config.get('app.debug') === true && (environment === 'local' || environment === 'testing')
    const handler = new ExceptionHandler(this.#exceptions, { showDetails, basePath: this.basePath, environment, logger })
    const middleware = new Map(routes.map((route) => [route, resolveRouteMiddleware(route, this.#middleware)] as const))
    const stages = [trustedHostStage(security), ...this.#extraStages, corsPreflightStage(security)]
    this.#state = { config, routes, url, hono: this.#buildHono(routes, middleware), handler, middleware, security, stages }
    if (config.get('app.debug') === true && !showDetails) logger.warn('APP_DEBUG=true is ignored outside local and testing environments; production errors stay plain.')
    await runInApplication(this, async () => {
      for (const provider of providers) await provider.boot(this)
      await this.#checkRoutes(routes)
    })
  }

  /**
   * Bindings every app has. Defaults only fill gaps: a clock, logger or store bound before boot
   * (tests do) or in a provider's `register()` wins.
   */
  #registerCore(config: ConfigRepository): void {
    this.container.instance(ConfigToken, config)
    this.container.instance(MiddlewareConfigToken, this.#middleware)
    if (!this.container.has(ClockToken)) this.container.singleton(ClockToken, () => () => new Date())
    if (!this.container.has(LoggerToken)) this.container.singleton(LoggerToken, () => new StderrLogger())
    if (!this.container.has(RateLimitStoreToken)) this.container.singleton(RateLimitStoreToken, () => new MemoryRateLimitStore())
    this.container.singleton(MetadataToken, () => loadMetadata(this.basePath))
    if (Object.hasOwn(config.all, 'database')) {
      this.container.singleton(ConnectionToken, () => {
        const name = String(config.get('database.default'))
        // The cast is checked by config/database.ts's own types (ConnectionSettings there).
        return openConnection(name, config.get(`database.connections.${name}`) as ConnectionSettings, this.basePath)
      })
    }
    this.#middleware.alias({ auth: Authenticate, throttle: ThrottleRequests, csrf: VerifyCsrfToken, can: Authorize })
    this.#middleware.prependToGroup('web', 'csrf')
    this.#middleware.prependToGroup('api', 'csrf', 'throttle:api')
    this.#middleware.rateLimiter('api', { maxAttempts: 60, decaySeconds: 60 })
  }

  #compileRoutes(): CompiledRoute[] {
    const { web, api, apiPrefix, health } = this.#blueprint.routing
    const extra = [...this.#extraRoutes, { routes: cspReportRoutes(), prefix: '', group: undefined }]
    if (health !== undefined) extra.push({ routes: defineRoutes([Route.get(health, (ctx) => ctx.json({ status: 'ok' }))]), prefix: '', group: undefined })
    return compileRoutes({ ...(web === undefined ? {} : { web }), ...(api === undefined ? {} : { api }), ...(apiPrefix === undefined ? {} : { apiPrefix }), extra })
  }

  /**
   * The start-up checks (security review F-01, F-11): every middleware alias exists, every
   * `{param:field}` has a model binding, every resource route has a policy, and no auto resource
   * serves an internal table.
   */
  async #checkRoutes(routes: readonly CompiledRoute[]): Promise<void> {
    const bindings = this.#blueprint.routing.bindings ?? {}
    const { middleware } = this.#booted('checkRoutes')
    for (const route of routes) {
      this.#checkAbilities(route, middleware.get(route)?.references ?? [])
      for (const parameter of route.parameters) {
        if (parameter.field !== undefined && bindings[parameter.name] === undefined) {
          throw new StrutvaneError('MISSING_BINDING', `${route.uri} binds {${parameter.name}:${parameter.field}}, but no model is bound to "${parameter.name}".`, `Add it in bootstrap/app.ts: withRouting({ bindings: { ${parameter.name}: YourModel } }).`)
        }
      }
      if (route.action.kind === 'controller') this.#checkController(route, route.action.controller)
    }
  }

  /** Every `can:<ability>` must name a defined ability (a typo would otherwise deny forever, or worse). */
  #checkAbilities(route: CompiledRoute, references: readonly MiddlewareReference[]): void {
    for (const reference of references) {
      if (reference.alias !== 'can') continue
      const ability = reference.params[0]
      if (ability !== undefined && this.#middleware.ability(ability) !== undefined) continue
      const suggestion = ability === undefined ? undefined : closestMatch(ability, this.#middleware.abilityNames)
      throw new StrutvaneError(
        'UNKNOWN_ABILITY',
        `${route.methods.join('|')} ${route.uri} uses can:${ability ?? ''}, but no such ability is defined.`,
        suggestion === undefined ? `Define it in bootstrap/app.ts: withMiddleware((m) => m.defineAbility('${ability ?? 'name'}', (user) => …)).` : `Did you mean "${suggestion}"?`,
      )
    }
  }

  #checkController(route: CompiledRoute, controllerClass: Key<object>): void {
    const controller = this.container.build(controllerClass)
    const name = actionLabel(route.action)
    if (route.action.kind === 'controller' && typeof (controller as Record<string, unknown>)[route.action.method] !== 'function') {
      throw new StrutvaneError('MISSING_ACTION', `${name} doesn't exist (route ${route.uri}).`, `Add a ${route.action.method}(ctx: HttpContext) method to ${controllerClass.name}.`)
    }
    if (!(controller instanceof ResourceController)) {
      const isResource = route.name !== undefined && /\.(index|create|store|show|edit|update|destroy)$/.test(route.name)
      if (isResource && typeof (controller as { policy?: unknown }).policy !== 'object') {
        throw new StrutvaneError('RESOURCE_WITHOUT_POLICY', `${controllerClass.name} serves resource routes but has no policy.`, 'Give it a `protected readonly policy = new PostPolicy()` and call authorize() in every action (node strut make:controller --resource writes this for you).')
      }
      return
    }
    const resource = controller.resourceMetadata()
    if (isInternalResource(resource)) {
      throw new StrutvaneError('INTERNAL_TABLE_EXPOSED', `${controllerClass.name} would serve the internal "${resource.table}" table over the API.`, 'Framework and identity tables (sessions, tokens, roles, jobs, users…) are never auto resources. Write a purpose-built controller with explicit fields instead.')
    }
    for (const parameter of route.parameters) {
      if (this.#blueprint.routing.bindings?.[parameter.name] === undefined) {
        throw new StrutvaneError('MISSING_BINDING', `${route.uri} needs the {${parameter.name}} parameter bound to a model.`, `Add it in bootstrap/app.ts: withRouting({ bindings: { ${parameter.name}: ${resource.model} } }).`)
      }
    }
  }

  #buildHono(routes: readonly CompiledRoute[], resolved: ReadonlyMap<CompiledRoute, ResolvedRouteMiddleware>): Hono<{ Bindings: RequestState }> {
    const hono = new Hono<{ Bindings: RequestState }>()
    for (const route of routes) {
      const middleware = resolved.get(route)?.references ?? []
      hono.on([...route.methods], toHonoPath(route.uri), (c) =>
        this.#dispatch(route, middleware, new HttpContext({ request: c.req.raw, params: c.req.param(), route: { name: route.name, method: c.req.method, uri: route.uri, action: actionLabel(route.action) }, state: c.env })),
      )
    }
    hono.notFound((c) => this.#notFound(routes, new HttpContext({ request: c.req.raw, state: c.env })))
    return hono
  }

  async #dispatch(route: CompiledRoute, middleware: readonly MiddlewareReference[], ctx: HttpContext): Promise<Response> {
    const state = this.#booted('dispatch')
    try {
      const destination = async (): Promise<Response> => {
        // Binding runs after middleware (Laravel's SubstituteBindings): a guest gets 401 before
        // learning whether a record exists.
        await this.#bindModels(route, ctx)
        return this.#invoke(route, ctx)
      }
      return await this.#pipeline(middleware, ctx, destination)
    } catch (error) {
      return state.handler.render(error, ctx)
    }
  }

  async #pipeline(middleware: readonly MiddlewareReference[], ctx: HttpContext, destination: () => Promise<Response>): Promise<Response> {
    const run = async (index: number): Promise<Response> => {
      const reference = middleware[index]
      if (reference === undefined) return destination()
      const middlewareClass = this.#middleware.resolveAlias(reference.alias)
      if (middlewareClass === undefined) throw new Error(`Middleware "${reference.alias}" vanished after boot.`)
      const instance = buildMiddleware(this.container, middlewareClass)
      // Recorded so a withCsrf()-style wrapper on the action knows the router already ran it.
      ctx.markApplied(reference.alias)
      return instance.handle(ctx, () => run(index + 1), ...reference.params)
    }
    return run(0)
  }

  async #bindModels(route: CompiledRoute, ctx: HttpContext): Promise<void> {
    const bindings = this.#blueprint.routing.bindings ?? {}
    for (const parameter of route.parameters) {
      const model = bindings[parameter.name]
      if (model === undefined) continue
      const value = ctx.param(parameter.name)
      const found = await model.resolveRouteBinding(value, parameter.field)
      if (found === null) {
        const label = model.metadata().label.singular.toLowerCase()
        throw new NotFoundError(`No ${label} matches "${value}".`, `Looked up ${model.name} by ${parameter.field ?? 'its route key'}.`)
      }
      ctx.bindModel(parameter.name, found)
    }
  }

  async #invoke(route: CompiledRoute, ctx: HttpContext): Promise<Response> {
    const action = route.action
    const result = action.kind === 'closure' ? await action.handler(ctx) : await this.#callController(action.controller, action.method, ctx)
    if (result instanceof Response) return result
    throw new StrutvaneError('NOT_A_RESPONSE', `${actionLabel(action)} returned ${result === undefined ? 'nothing' : typeof result} instead of a Response.`, 'Return ctx.json(...), ctx.html(...) or ctx.noContent().')
  }

  async #callController(controllerClass: Key<object>, method: string, ctx: HttpContext): Promise<unknown> {
    // A new controller per request: no state can leak from one request to the next.
    const controller = this.container.build(controllerClass) as Record<string, unknown>
    const handler = controller[method]
    if (typeof handler !== 'function') throw new Error(`${controllerClass.name}@${method} is not a method.`)
    return handler.call(controller, ctx)
  }

  async #notFound(routes: readonly CompiledRoute[], ctx: HttpContext): Promise<Response> {
    const state = this.#booted('notFound')
    const allowed = allowedMethods(routes, ctx.url.pathname)
    const error =
      allowed.length > 0
        ? new HttpError(405, 'method_not_allowed', 'Method not allowed', `${ctx.method} is not supported here. Use ${allowed.join(', ')}.`, { headers: { allow: allowed.join(', ') } })
        : new NotFoundError(`Nothing is at ${ctx.method} ${ctx.url.pathname}.`, 'Run `node strut route:list` to see every route.')
    return state.handler.render(error, ctx)
  }

  #booted(what: string): BootedState {
    if (this.#state !== undefined) return this.#state
    throw new StrutvaneError('NOT_BOOTED', `${what} was used before the app booted.`, 'Call `await app.boot()` first (requests and commands do it for you).')
  }
}

/**
 * The navigation registry: sidebar entries from the app and packages. The React UI reads it
 * (through an endpoint, in the product) and hides entries the user may not `viewAny`.
 *
 * @example
 * app.navigation.add({ label: 'Posts', route: 'posts.index', order: 10 })
 */
export class NavigationRegistry {
  readonly #items: NavigationItem[] = []

  /** Add an entry. */
  add(item: NavigationItem): void {
    this.#items.push(item)
  }

  /** Entries sorted by group, then order, then label. */
  get items(): readonly NavigationItem[] {
    return [...this.#items].sort((a, b) => (a.group ?? '').localeCompare(b.group ?? '') || (a.order ?? 0) - (b.order ?? 0) || a.label.localeCompare(b.label))
  }
}
