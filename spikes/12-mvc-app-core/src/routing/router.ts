/**
 * Turn routes files into one flat, validated route table: prefixes and name prefixes applied,
 * middleware collected in order, parameters parsed, duplicates refused. The table drives the
 * HTTP kernel, URL generation, 405 detection and `node strut route:list`.
 */
import { StrutvaneError } from '../support/errors.ts'
import type { HttpMethod, RouteEntry, RouteList } from './route.ts'
import type { ActionHandler, ControllerClass, ResourceAction, StoredAction } from './types.ts'

/**
 * A route action after compilation: a closure, or a controller class plus method name.
 *
 * @example
 * const action: CompiledAction = { kind: 'controller', controller: PostController, method: 'show' }
 */
export type CompiledAction = { readonly kind: 'closure'; readonly handler: ActionHandler } | { readonly kind: 'controller'; readonly controller: ControllerClass; readonly method: string }

/**
 * A path parameter: `{post:slug}` → `{ name: 'post', field: 'slug' }`.
 *
 * @example
 * const param: RouteParameter = { name: 'post', field: undefined }
 */
export interface RouteParameter {
  readonly name: string
  /** The column to bind by, when the path says so (`{post:slug}`). */
  readonly field: string | undefined
}

/**
 * One fully resolved route.
 *
 * @example
 * table.find((route) => route.name === 'posts.show')?.uri // '/api/posts/{post:slug}'
 */
export interface CompiledRoute {
  readonly methods: readonly HttpMethod[]
  /** The full path with placeholders, including group and file prefixes. */
  readonly uri: string
  readonly name: string | undefined
  readonly action: CompiledAction
  /** Middleware references in run order (group aliases like `api` are expanded later). */
  readonly middleware: readonly string[]
  readonly parameters: readonly RouteParameter[]
  /** Matches a concrete path; capture groups follow `parameters`. */
  readonly pattern: RegExp
}

/**
 * The routes files `withRouting` receives.
 *
 * @example
 * const files: RoutingFiles = { web, api, apiPrefix: '/api' }
 */
export interface RoutingFiles {
  readonly web?: RouteList<unknown>
  readonly api?: RouteList<unknown>
  /** Laravel's `apiPrefix`; `/api` by default. */
  readonly apiPrefix?: string
  /** Extra route lists contributed by packages, with their own prefix and middleware group. */
  readonly extra?: readonly { readonly routes: RouteList<unknown>; readonly prefix: string; readonly group: string | undefined }[]
}

/** Everything inherited from the enclosing groups while flattening. */
interface Scope {
  readonly prefix: string
  readonly namePrefix: string
  readonly middleware: readonly string[]
}

const PLACEHOLDER = /\{([^{}]*)\}/g
const PARAM_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/

/**
 * Compile routes files into a route table. Web routes get the `web` middleware group; API routes
 * get the `api` group and the `/api` prefix, as in Laravel.
 *
 * @example
 * const table = compileRoutes({ web, api })
 */
export function compileRoutes(files: RoutingFiles): CompiledRoute[] {
  const table: CompiledRoute[] = []
  if (files.web !== undefined) flatten(files.web.entries, { prefix: '', namePrefix: '', middleware: ['web'] }, table)
  if (files.api !== undefined) flatten(files.api.entries, { prefix: files.apiPrefix ?? '/api', namePrefix: '', middleware: ['api'] }, table)
  for (const extra of files.extra ?? []) flatten(extra.routes.entries, { prefix: extra.prefix, namePrefix: '', middleware: extra.group === undefined ? [] : [extra.group] }, table)
  assertUnique(table)
  return table
}

function flatten(entries: readonly RouteEntry[], scope: Scope, table: CompiledRoute[]): void {
  for (const entry of entries) {
    if (entry.kind === 'route') {
      table.push(
        compileOne({
          methods: entry.methods,
          uri: joinPath(scope.prefix, entry.path),
          name: entry.routeName === undefined ? undefined : `${scope.namePrefix}${entry.routeName}`,
          action: compileAction(entry.action),
          middleware: [...scope.middleware, ...entry.middlewareList],
        }),
      )
    } else if (entry.kind === 'group') {
      flatten(entry.entries, { prefix: joinPath(scope.prefix, entry.prefix), namePrefix: `${scope.namePrefix}${entry.namePrefix}`, middleware: [...scope.middleware, ...entry.middlewareList] }, table)
    } else {
      for (const route of entry.routes) {
        table.push(
          compileOne({
            methods: route.methods,
            uri: joinPath(scope.prefix, route.path),
            name: `${scope.namePrefix}${entry.resourceName}.${route.action}`,
            action: { kind: 'controller', controller: entry.controller, method: route.action },
            middleware: [...scope.middleware, ...entry.middlewareList, ...actionMiddleware(entry.middlewareByAction, route.action)],
          }),
        )
      }
    }
  }
}

function actionMiddleware(byAction: Readonly<Partial<Record<ResourceAction, readonly string[]>>>, action: ResourceAction): readonly string[] {
  return byAction[action] ?? []
}

function compileAction(action: StoredAction): CompiledAction {
  if (typeof action === 'function') return { kind: 'closure', handler: action }
  const [controller, method] = action
  return { kind: 'controller', controller, method }
}

function compileOne(route: Omit<CompiledRoute, 'parameters' | 'pattern'>): CompiledRoute {
  const parameters = parseParameters(route.uri)
  return { ...route, parameters, pattern: toPattern(route.uri) }
}

/**
 * Join path pieces with single slashes, no trailing slash (except the root).
 *
 * @example
 * joinPath('/api', 'admin/', '/posts') // '/api/admin/posts'
 */
export function joinPath(...parts: string[]): string {
  const joined = parts
    .flatMap((part) => part.split('/'))
    .filter((segment) => segment.length > 0)
    .join('/')
  return `/${joined}`
}

/**
 * Read the `{name}` / `{name:field}` placeholders of a path, refusing malformed ones.
 *
 * @example
 * parseParameters('/posts/{post:slug}') // [{ name: 'post', field: 'slug' }]
 */
export function parseParameters(uri: string): RouteParameter[] {
  const withoutPlaceholders = uri.replace(PLACEHOLDER, '')
  if (withoutPlaceholders.includes('{') || withoutPlaceholders.includes('}')) {
    throw new StrutvaneError('INVALID_ROUTE_PATH', `The route path "${uri}" has an unmatched brace.`, 'Write parameters as {post} or {post:slug}.')
  }
  const parameters: RouteParameter[] = []
  for (const match of uri.matchAll(PLACEHOLDER)) {
    const [name = '', field] = (match[1] ?? '').split(':')
    if (!PARAM_NAME.test(name) || (field !== undefined && !PARAM_NAME.test(field))) {
      throw new StrutvaneError('INVALID_ROUTE_PARAMETER', `"{${match[1] ?? ''}}" in "${uri}" is not a valid route parameter.`, 'Use letters, digits and underscores: {post} or {post:slug}.')
    }
    if (parameters.some((parameter) => parameter.name === name)) {
      throw new StrutvaneError('DUPLICATE_ROUTE_PARAMETER', `The route path "${uri}" uses {${name}} twice.`, 'Give each parameter its own name, for example {author}/posts/{post}.')
    }
    parameters.push({ name, field })
  }
  return parameters
}

function toPattern(uri: string): RegExp {
  const source = uri
    .split(PLACEHOLDER)
    // `split` with a capturing regex alternates literal text (even indexes) and placeholders (odd).
    .map((piece, index) => (index % 2 === 0 ? escapeRegExp(piece) : '([^/]+)'))
    .join('')
  return new RegExp(`^${source}/?$`)
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The Hono path for a route: `{post:slug}` → `:post`.
 *
 * @example
 * toHonoPath('/api/posts/{post:slug}') // '/api/posts/:post'
 */
export function toHonoPath(uri: string): string {
  return uri.replace(PLACEHOLDER, (_whole, inner: string) => `:${inner.split(':')[0] ?? inner}`)
}

/**
 * Methods registered for a concrete path (for 405 responses and the `Allow` header).
 *
 * @example
 * allowedMethods(table, '/api/posts') // ['GET', 'POST']
 */
export function allowedMethods(table: readonly CompiledRoute[], path: string): HttpMethod[] {
  const methods = new Set<HttpMethod>()
  for (const route of table) if (route.pattern.test(path)) for (const method of route.methods) methods.add(method)
  return [...methods]
}

/**
 * `PostController@show` or `Closure`, for `route:list` and error pages.
 *
 * @example
 * actionLabel({ kind: 'controller', controller: PostController, method: 'show' }) // 'PostController@show'
 */
export function actionLabel(action: CompiledAction): string {
  return action.kind === 'closure' ? 'Closure' : `${action.controller.name}@${action.method}`
}

function assertUnique(table: readonly CompiledRoute[]): void {
  const names = new Map<string, CompiledRoute>()
  const endpoints = new Set<string>()
  for (const route of table) {
    if (route.name !== undefined) {
      const other = names.get(route.name)
      if (other !== undefined) {
        throw new StrutvaneError('DUPLICATE_ROUTE_NAME', `Two routes are named "${route.name}": ${other.uri} and ${route.uri}.`, 'Route names must be unique, because route() would not know which URL to build. Rename one of them.')
      }
      names.set(route.name, route)
    }
    for (const method of route.methods) {
      // Placeholders are normalised so /posts/{post} and /posts/{id} count as the same endpoint.
      const key = `${method} ${route.uri.replace(PLACEHOLDER, '{}')}`
      if (endpoints.has(key)) {
        throw new StrutvaneError('DUPLICATE_ROUTE', `${method} ${route.uri} is registered twice.`, 'The second one could never run. Remove it, or change its path or method.')
      }
      endpoints.add(key)
    }
  }
}
