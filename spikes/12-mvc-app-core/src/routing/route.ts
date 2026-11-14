/**
 * The `Route` builder used in `routes/web.ts` and `routes/api.ts`:
 *
 * ```ts
 * export default defineRoutes([
 *   Route.get('/', [HomeController, 'index']).name('home'),
 *   Route.apiResource('posts', PostController, { bindBy: 'slug' }),
 *   Route.group({ prefix: 'admin', middleware: ['auth'], name: 'admin.' }, [ … ]),
 * ])
 * ```
 *
 * Why values instead of Laravel's global `Route::get(...)` registry: every builder call *returns*
 * a plain, immutable route object. Nothing is registered as a side effect of importing a file,
 * so routes files can be loaded twice (tests, `route:list`) with no global state, and their
 * `typeof` carries every route name and parameter to the type checker.
 */
import { StrutvaneError } from '../support/errors.ts'
import { singular } from '../support/str.ts'
import type {
  ApiResourceAction,
  ControllerClass,
  ControllerWith,
  HasSignatures,
  PrefixSignatures,
  ResourceAction,
  ResourceSignature,
  RouteAction,
  RouteSignature,
  SignaturesOf,
  StoredAction,
  Singular,
} from './types.ts'

/**
 * The HTTP methods a route can answer.
 *
 * @example
 * const method: HttpMethod = 'PATCH'
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * Any route entry: a route, a group or a resource.
 *
 * @example
 * const entries: RouteEntry[] = [Route.get('/', handler)]
 *
 * Groups and resources use `unknown` for their signatures: every entry satisfies it, which gives
 * an "any entry" type without `any`.
 */
export type RouteEntry = RouteDefinition<string, string> | RouteGroup<unknown> | ResourceRoutes<unknown>

/**
 * One route. Immutable: `.name()` and `.middleware()` return a new definition.
 *
 * @example
 * Route.get('/posts/{post:slug}', [PostController, 'show']).name('posts.show').middleware('auth:optional')
 */
export class RouteDefinition<TName extends string, TPath extends string> implements HasSignatures<RouteSignature<TName, TPath>> {
  declare readonly __routes: RouteSignature<TName, TPath>
  readonly kind = 'route'
  readonly methods: readonly HttpMethod[]
  readonly path: TPath
  readonly action: StoredAction
  /** The route name, if `.name()` was called. */
  readonly routeName: string | undefined
  readonly middlewareList: readonly string[]
  /** Aliases this route opts out of (`.withoutMiddleware('csrf')`), flagged by `route:list --security`. */
  readonly excludedMiddleware: readonly string[]

  constructor(init: { methods: readonly HttpMethod[]; path: TPath; action: StoredAction; routeName?: string | undefined; middleware?: readonly string[]; excluded?: readonly string[] }) {
    this.methods = init.methods
    this.path = init.path
    this.action = init.action
    this.routeName = init.routeName
    this.middlewareList = init.middleware ?? []
    this.excludedMiddleware = init.excluded ?? []
  }

  /**
   * Name the route, so `route('posts.show', …)` can build its URL.
   *
   * @example
   * Route.get('/', [HomeController, 'index']).name('home')
   */
  name<const TNewName extends string>(name: TNewName): RouteDefinition<TNewName, TPath> {
    return new RouteDefinition({ ...this.#init(), routeName: name })
  }

  /**
   * Add middleware by alias (`'auth'`, `'throttle:60,1'`).
   *
   * @example
   * Route.post('/posts', [PostController, 'store']).middleware('auth')
   */
  middleware(...references: string[]): RouteDefinition<TName, TPath> {
    return new RouteDefinition<TName, TPath>({ ...this.#init(), middleware: [...this.middlewareList, ...references] })
  }

  /**
   * Opt this route out of middleware its groups add, by alias (Laravel's `withoutMiddleware`).
   * Opting out is always explicit, and `node strut route:list --security` flags it.
   *
   * @example
   * Route.post('/webhooks/stripe', [StripeWebhookController, 'handle']).withoutMiddleware('csrf')
   */
  withoutMiddleware(...aliases: string[]): RouteDefinition<TName, TPath> {
    return new RouteDefinition<TName, TPath>({ ...this.#init(), excluded: [...this.excludedMiddleware, ...aliases] })
  }

  #init(): { methods: readonly HttpMethod[]; path: TPath; action: StoredAction; routeName: string | undefined; middleware: readonly string[]; excluded: readonly string[] } {
    return { methods: this.methods, path: this.path, action: this.action, routeName: this.routeName, middleware: this.middlewareList, excluded: this.excludedMiddleware }
  }
}

/**
 * Options for {@link Route.group}, Laravel's `Route::prefix()->middleware()->name()->group()`.
 *
 * @example
 * const options: GroupOptions = { prefix: 'admin', middleware: ['auth'], name: 'admin.' }
 */
export interface GroupOptions<TPrefix extends string = string, TNamePrefix extends string = string> {
  /** Path prefix, without slashes at either end is fine: `'admin'`. */
  readonly prefix?: TPrefix
  /** Prefix for every route name inside, usually ending in a dot: `'admin.'`. */
  readonly name?: TNamePrefix
  readonly middleware?: readonly string[]
  /** Aliases every route inside opts out of (flagged by `route:list --security`). */
  readonly withoutMiddleware?: readonly string[]
}

/**
 * A group of routes sharing a prefix, a name prefix and middleware.
 *
 * @example
 * Route.group({ prefix: 'admin', name: 'admin.' }, [Route.get('/', [AdminController, 'index']).name('home')])
 */
export class RouteGroup<TSignatures> implements HasSignatures<TSignatures> {
  declare readonly __routes: TSignatures
  readonly kind = 'group'
  readonly prefix: string
  readonly namePrefix: string
  readonly middlewareList: readonly string[]
  readonly excludedMiddleware: readonly string[]
  readonly entries: readonly RouteEntry[]

  constructor(options: GroupOptions, entries: readonly RouteEntry[]) {
    this.prefix = options.prefix ?? ''
    this.namePrefix = options.name ?? ''
    this.middlewareList = options.middleware ?? []
    this.excludedMiddleware = options.withoutMiddleware ?? []
    this.entries = entries
  }
}

/**
 * Options for {@link Route.resource} and {@link Route.apiResource}.
 *
 * @example
 * const options: ResourceOptions<'index' | 'show', never, 'post'> = { only: ['index', 'show'], bindBy: 'slug' }
 */
export interface ResourceOptions<TOnly extends ResourceAction, TExcept extends ResourceAction, TParam extends string> {
  /** Register only these actions. */
  readonly only?: readonly TOnly[]
  /** Register every action except these. */
  readonly except?: readonly TExcept[]
  /** The URL parameter name, for words the simple singular rule gets wrong (`people` → `person`). */
  readonly parameter?: TParam
  /** Bind the parameter by this column instead of the model's route key: `{post:slug}`. */
  readonly bindBy?: string
}

/** One resolved resource action, ready for the router. */
export interface ResourceActionRoute {
  readonly action: ResourceAction
  readonly methods: readonly HttpMethod[]
  readonly path: string
}

/**
 * The routes `Route.resource` / `Route.apiResource` generate.
 *
 * @example
 * Route.apiResource('posts', PostController).middlewareFor(['store', 'update', 'destroy'], 'auth')
 */
export class ResourceRoutes<TSignatures> implements HasSignatures<TSignatures> {
  declare readonly __routes: TSignatures
  readonly kind = 'resource'
  readonly resourceName: string
  readonly controller: ControllerClass
  readonly routes: readonly ResourceActionRoute[]
  readonly middlewareList: readonly string[]
  readonly middlewareByAction: Readonly<Partial<Record<ResourceAction, readonly string[]>>>
  readonly excludedMiddleware: readonly string[]

  constructor(init: { resourceName: string; controller: ControllerClass; routes: readonly ResourceActionRoute[]; middleware?: readonly string[]; middlewareByAction?: Partial<Record<ResourceAction, readonly string[]>>; excluded?: readonly string[] }) {
    this.resourceName = init.resourceName
    this.controller = init.controller
    this.routes = init.routes
    this.middlewareList = init.middleware ?? []
    this.middlewareByAction = init.middlewareByAction ?? {}
    this.excludedMiddleware = init.excluded ?? []
  }

  /**
   * Middleware for every action of the resource.
   *
   * @example
   * Route.apiResource('posts', PostController).middleware('auth')
   */
  middleware(...references: string[]): ResourceRoutes<TSignatures> {
    return new ResourceRoutes<TSignatures>({ ...this.#init(), middleware: [...this.middlewareList, ...references] })
  }

  /**
   * Middleware for some actions only, Laravel 12's `->middlewareFor()`.
   *
   * @example
   * Route.apiResource('posts', PostController).middlewareFor(['store', 'update', 'destroy'], 'auth')
   */
  middlewareFor(actions: readonly ResourceAction[], ...references: string[]): ResourceRoutes<TSignatures> {
    const byAction: Partial<Record<ResourceAction, readonly string[]>> = { ...this.middlewareByAction }
    for (const action of actions) byAction[action] = [...(byAction[action] ?? []), ...references]
    return new ResourceRoutes<TSignatures>({ ...this.#init(), middlewareByAction: byAction })
  }

  /**
   * Opt every action of the resource out of group middleware, by alias (flagged by
   * `route:list --security`).
   *
   * @example
   * Route.apiResource('imports', ImportController).withoutMiddleware('throttle')
   */
  withoutMiddleware(...aliases: string[]): ResourceRoutes<TSignatures> {
    return new ResourceRoutes<TSignatures>({ ...this.#init(), excluded: [...this.excludedMiddleware, ...aliases] })
  }

  #init(): { resourceName: string; controller: ControllerClass; routes: readonly ResourceActionRoute[]; middleware: readonly string[]; middlewareByAction: Partial<Record<ResourceAction, readonly string[]>>; excluded: readonly string[] } {
    return { resourceName: this.resourceName, controller: this.controller, routes: this.routes, middleware: this.middlewareList, middlewareByAction: this.middlewareByAction, excluded: this.excludedMiddleware }
  }
}

/**
 * A whole routes file: the default export of `routes/web.ts` and `routes/api.ts`.
 *
 * @example
 * export default defineRoutes([Route.get('/', [HomeController, 'index']).name('home')])
 */
export class RouteList<TSignatures> implements HasSignatures<TSignatures> {
  declare readonly __routes: TSignatures
  readonly entries: readonly RouteEntry[]

  constructor(entries: readonly RouteEntry[]) {
    this.entries = entries
  }
}

/**
 * Declare a routes file. The `const` type parameter keeps every route's literal name and path.
 *
 * @example
 * export default defineRoutes([
 *   Route.apiResource('posts', PostController),
 * ])
 */
export function defineRoutes<const TEntries extends readonly RouteEntry[]>(entries: TEntries): RouteList<SignaturesOf<TEntries[number]>> {
  return new RouteList(entries)
}

/** Laravel's resource table: action → methods and path suffix. The order is the match order. */
const RESOURCE_TABLE: readonly { action: ResourceAction; methods: readonly HttpMethod[]; suffix: (param: string) => string }[] = [
  { action: 'index', methods: ['GET'], suffix: () => '' },
  { action: 'create', methods: ['GET'], suffix: () => '/create' },
  { action: 'store', methods: ['POST'], suffix: () => '' },
  { action: 'show', methods: ['GET'], suffix: (param) => `/{${param}}` },
  { action: 'edit', methods: ['GET'], suffix: (param) => `/{${param}}/edit` },
  { action: 'update', methods: ['PUT', 'PATCH'], suffix: (param) => `/{${param}}` },
  { action: 'destroy', methods: ['DELETE'], suffix: (param) => `/{${param}}` },
]

const API_ACTIONS: readonly ApiResourceAction[] = ['index', 'store', 'show', 'update', 'destroy']
const ALL_ACTIONS: readonly ResourceAction[] = RESOURCE_TABLE.map((row) => row.action)
const RESOURCE_NAME = /^[a-z][a-z0-9_-]*$/

function buildResource<TSignatures>(name: string, controller: ControllerClass, allowed: readonly ResourceAction[], options: ResourceOptions<ResourceAction, ResourceAction, string>): ResourceRoutes<TSignatures> {
  if (!RESOURCE_NAME.test(name)) {
    throw new StrutvaneError('INVALID_RESOURCE_NAME', `"${name}" is not a valid resource name.`, 'Use the plural, lower-case table-style name, for example Route.resource(\'posts\', PostController).')
  }
  const only = options.only ?? allowed
  const except = new Set(options.except ?? [])
  const parameter = options.parameter ?? singular(name)
  const placeholder = options.bindBy === undefined ? parameter : `${parameter}:${options.bindBy}`
  const routes = RESOURCE_TABLE.filter((row) => allowed.includes(row.action) && only.includes(row.action) && !except.has(row.action)).map((row) => ({
    action: row.action,
    methods: row.methods,
    path: `/${name}${row.suffix(placeholder)}`,
  }))
  return new ResourceRoutes<TSignatures>({ resourceName: name, controller, routes })
}

/**
 * A group being built fluently, Laravel's `Route::middleware([...])->group(...)`. Calling
 * `.group([...])` returns an ordinary {@link RouteGroup}.
 *
 * @example
 * Route.middleware('csrf', 'auth').withoutMiddleware('throttle').group([Route.post('/import', handler)])
 */
export class PendingGroup {
  readonly #middleware: readonly string[]
  readonly #excluded: readonly string[]

  constructor(middleware: readonly string[], excluded: readonly string[]) {
    this.#middleware = middleware
    this.#excluded = excluded
  }

  /**
   * Add middleware for every route in the group.
   *
   * @example
   * Route.withoutMiddleware('throttle').middleware('auth').group([...])
   */
  middleware(...references: string[]): PendingGroup {
    return new PendingGroup([...this.#middleware, ...references], this.#excluded)
  }

  /**
   * Opt every route in the group out of these aliases.
   *
   * @example
   * Route.middleware('auth').withoutMiddleware('csrf').group([...])
   */
  withoutMiddleware(...aliases: string[]): PendingGroup {
    return new PendingGroup(this.#middleware, [...this.#excluded, ...aliases])
  }

  /**
   * Close the group over its routes.
   *
   * @example
   * Route.middleware('csrf').group([Route.post('/import', [ImportController, 'store'])])
   */
  group<const TEntries extends readonly RouteEntry[]>(entries: TEntries): RouteGroup<PrefixSignatures<SignaturesOf<TEntries[number]>, '', ''>> {
    return new RouteGroup({ middleware: this.#middleware, withoutMiddleware: this.#excluded }, entries)
  }
}

function single<const TPath extends string, TController extends ControllerClass>(methods: readonly HttpMethod[], path: TPath, action: RouteAction<TController>): RouteDefinition<never, TPath> {
  return new RouteDefinition<never, TPath>({ methods, path, action })
}

/**
 * The route builder. Every method returns a value; nothing is registered globally.
 *
 * @example
 * Route.get('/posts', [PostController, 'index']).name('posts.index')
 */
export const Route = {
  /** A GET route. */
  get<const TPath extends string, TController extends ControllerClass>(path: TPath, action: RouteAction<TController>): RouteDefinition<never, TPath> {
    return single(['GET'], path, action)
  },
  /** A POST route. */
  post<const TPath extends string, TController extends ControllerClass>(path: TPath, action: RouteAction<TController>): RouteDefinition<never, TPath> {
    return single(['POST'], path, action)
  },
  /** A PUT route. */
  put<const TPath extends string, TController extends ControllerClass>(path: TPath, action: RouteAction<TController>): RouteDefinition<never, TPath> {
    return single(['PUT'], path, action)
  },
  /** A PATCH route. */
  patch<const TPath extends string, TController extends ControllerClass>(path: TPath, action: RouteAction<TController>): RouteDefinition<never, TPath> {
    return single(['PATCH'], path, action)
  },
  /** A DELETE route. */
  delete<const TPath extends string, TController extends ControllerClass>(path: TPath, action: RouteAction<TController>): RouteDefinition<never, TPath> {
    return single(['DELETE'], path, action)
  },
  /** One route answering several methods: `Route.match(['GET', 'POST'], '/search', …)`. */
  match<const TPath extends string, TController extends ControllerClass>(methods: readonly HttpMethod[], path: TPath, action: RouteAction<TController>): RouteDefinition<never, TPath> {
    return single(methods, path, action)
  },

  /**
   * Start a fluent group with middleware, Laravel's `Route::middleware([...])->group(...)`.
   *
   * @example
   * Route.middleware('auth').group([Route.get('/me', [ProfileController, 'show']).name('me')])
   */
  middleware(...references: string[]): PendingGroup {
    return new PendingGroup(references, [])
  },

  /**
   * Start a fluent group that opts out of middleware, Laravel's `Route::withoutMiddleware()`.
   *
   * @example
   * Route.withoutMiddleware('csrf').group([Route.post('/webhooks/stripe', handler)])
   */
  withoutMiddleware(...aliases: string[]): PendingGroup {
    return new PendingGroup([], aliases)
  },

  /**
   * Group routes under a shared prefix, name prefix and middleware.
   *
   * @example
   * Route.group({ prefix: 'admin', name: 'admin.', middleware: ['auth'] }, [
   *   Route.get('/', [AdminController, 'index']).name('dashboard'), // admin.dashboard → /admin
   * ])
   */
  group<const TPrefix extends string = '', const TNamePrefix extends string = '', const TEntries extends readonly RouteEntry[] = readonly []>(
    options: GroupOptions<TPrefix, TNamePrefix>,
    entries: TEntries,
  ): RouteGroup<PrefixSignatures<SignaturesOf<TEntries[number]>, TNamePrefix, TPrefix>> {
    return new RouteGroup(options, entries)
  },

  /**
   * The seven resource routes (index, create, store, show, edit, update, destroy), named
   * `posts.index` … `posts.destroy`, Laravel's `Route::resource`. The controller must have a
   * method for every registered action, or the call doesn't compile.
   *
   * @example
   * Route.resource('posts', PostController, { only: ['index', 'show'] })
   */
  resource<const TName extends string, const TOnly extends ResourceAction = ResourceAction, const TExcept extends ResourceAction = never, const TParam extends string = Singular<TName>>(
    name: TName,
    controller: ControllerWith<NoInfer<Exclude<TOnly, TExcept>>>,
    options: ResourceOptions<TOnly, TExcept, TParam> = {},
  ): ResourceRoutes<ResourceSignature<TName, TParam, Exclude<TOnly, TExcept>>> {
    return buildResource(name, controller, ALL_ACTIONS, options)
  },

  /**
   * The five API resource routes (no `create`/`edit` form pages), Laravel's `Route::apiResource`.
   *
   * @example
   * Route.apiResource('posts', PostController, { bindBy: 'slug' })
   */
  apiResource<const TName extends string, const TOnly extends ApiResourceAction = ApiResourceAction, const TExcept extends ApiResourceAction = never, const TParam extends string = Singular<TName>>(
    name: TName,
    controller: ControllerWith<NoInfer<Exclude<TOnly, TExcept>>>,
    options: ResourceOptions<TOnly, TExcept, TParam> = {},
  ): ResourceRoutes<ResourceSignature<TName, TParam, Exclude<TOnly, TExcept>>> {
    return buildResource(name, controller, API_ACTIONS, options)
  },
} as const
