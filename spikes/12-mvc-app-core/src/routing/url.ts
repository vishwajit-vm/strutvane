/**
 * URL generation: `route('posts.show', { post })`, Laravel's `route()` helper, fully typed.
 *
 * The {@link UrlGenerator} does the work for one app. The `route()` function finds the current
 * app through the request context (see `foundation/context.ts`), so controllers can call it
 * without passing the app around, and two apps in one test process never see each other's routes.
 */
import { currentApplication } from '../foundation/context.ts'
import type { RouteRegistry } from '../registry.ts'
import { StrutvaneError } from '../support/errors.ts'
import { closestMatch } from '../support/str.ts'
import type { CompiledRoute } from './router.ts'
import type { RouteParam } from './types.ts'

/**
 * Options for building a URL.
 *
 * @example
 * route('posts.index', {}, { query: { page: 2 }, absolute: true })
 */
export interface UrlOptions {
  /** Prefix with `APP_URL` (`https://blog.test/api/posts`). Default: a path only. */
  readonly absolute?: boolean
  /** Extra query string values. */
  readonly query?: Readonly<Record<string, string | number | boolean>>
}

/**
 * Builds URLs for one app's named routes.
 *
 * @example
 * const urls = new UrlGenerator(table, 'http://localhost:3000')
 * urls.route('posts.show', { post: 'hello-world' }) // '/api/posts/hello-world'
 */
export class UrlGenerator {
  readonly #byName: ReadonlyMap<string, CompiledRoute>
  readonly #baseUrl: string

  constructor(table: readonly CompiledRoute[], baseUrl: string) {
    this.#byName = new Map(table.flatMap((route) => (route.name === undefined ? [] : [[route.name, route] as const])))
    this.#baseUrl = baseUrl.replace(/\/+$/, '')
  }

  /**
   * `true` if a route has this name.
   *
   * @example
   * urls.has('posts.show') // true
   */
  has(name: string): boolean {
    return this.#byName.has(name)
  }

  /**
   * Build the URL of a named route. Parameters the path doesn't use become the query string,
   * as in Laravel.
   *
   * @example
   * urls.route('posts.show', { post }) // uses post.routeKey('slug') when the path says {post:slug}
   */
  route(name: string, params: Readonly<Record<string, RouteParam>> = {}, options: UrlOptions = {}): string {
    const target = this.#byName.get(name)
    if (target === undefined) throw this.#unknownName(name)
    const used = new Set<string>()
    let path = target.uri
    for (const parameter of target.parameters) {
      const value = params[parameter.name]
      if (value === undefined) {
        const needed = target.parameters.map((entry) => entry.name).join(', ')
        throw new StrutvaneError('MISSING_ROUTE_PARAMETER', `route('${name}') needs a value for {${parameter.name}}.`, `Pass every parameter of ${target.uri}: { ${needed} }.`)
      }
      used.add(parameter.name)
      const placeholder = parameter.field === undefined ? `{${parameter.name}}` : `{${parameter.name}:${parameter.field}}`
      path = path.replace(placeholder, encodeURIComponent(String(routeValue(value, parameter.field))))
    }
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) if (!used.has(key)) query.set(key, String(routeValue(value, undefined)))
    for (const [key, value] of Object.entries(options.query ?? {})) query.set(key, String(value))
    const search = query.size === 0 ? '' : `?${query.toString()}`
    return `${options.absolute === true ? this.#baseUrl : ''}${path}${search}`
  }

  #unknownName(name: string): StrutvaneError {
    const suggestion = closestMatch(name, [...this.#byName.keys()])
    return new StrutvaneError(
      'UNKNOWN_ROUTE_NAME',
      `No route is named "${name}".`,
      suggestion === undefined ? 'Name the route with .name(\'…\') in routes/web.ts or routes/api.ts, then run `node strut route:list` to check.' : `Did you mean "${suggestion}"?`,
    )
  }
}

function routeValue(value: RouteParam, field: string | undefined): string | number {
  return typeof value === 'object' ? value.routeKey(field) : value
}

/** The params argument `route()` takes for a given name: optional when the route has none. */
type RouteArguments<TName extends keyof RouteRegistry> = keyof RouteRegistry[TName] extends never
  ? [params?: Readonly<Record<string, RouteParam>>, options?: UrlOptions]
  : [params: RouteRegistry[TName] & Readonly<Record<string, RouteParam>>, options?: UrlOptions]

/**
 * Build the URL of a named route of the current app. The name and the parameters are checked by
 * the compiler against the app's routes files.
 *
 * @example
 * route('posts.show', { post })              // '/api/posts/hello-world'
 * route('posts.index', {}, { query: { page: 2 } })
 * route('posts.shwo', { post })              // compile error: no such route
 */
export function route<TName extends keyof RouteRegistry & string>(name: TName, ...args: RouteArguments<TName>): string {
  const [params, options] = args
  return currentApplication('route()').url.route(name, params, options)
}
