/**
 * `HttpContext`: everything a controller action, middleware or policy check needs about the
 * current request, in one typed object. Laravel spreads this over `$request`, `$request->user()`,
 * route parameters and injected models; here it is one explicit argument.
 */
import type { AuthUser } from '../registry.ts'
import { HttpError } from './problem.ts'

/** The largest JSON body accepted by default (1 MiB). Bigger bodies are a 413. */
export const DEFAULT_BODY_LIMIT = 1024 * 1024

/**
 * What the router knows about the matched route, for logging, `route:list` and error pages.
 *
 * @example
 * ctx.route?.name // 'posts.show'
 */
export interface MatchedRoute {
  readonly name: string | undefined
  readonly method: string
  readonly uri: string
  /** `PostController@show`, or `Closure`. */
  readonly action: string
}

/**
 * A model class as far as the context cares: something whose instances can be looked up by class.
 * Kept structural so `http` doesn't import the database layer.
 */
export type ModelConstructor<TInstance> = abstract new (...args: never[]) => TInstance

/**
 * The per-request context.
 *
 * @example
 * async show(ctx: HttpContext): Promise<Response> {
 *   const post = ctx.model(Post)
 *   return ctx.json({ data: post })
 * }
 */
export class HttpContext {
  /** The raw Web-standard request. */
  readonly request: Request
  /** The parsed URL. */
  readonly url: URL
  /** Path parameters as strings, before model binding: `{ post: 'hello-world' }`. */
  readonly params: Readonly<Record<string, string>>
  /** The matched route, or `undefined` for a 404/405. */
  readonly route: MatchedRoute | undefined
  /** The client address as the server saw it. Proxy headers are deliberately *not* trusted. */
  readonly ip: string
  /** The signed-in user; set by the `auth` middleware, `null` for guests. */
  user: AuthUser | null = null
  readonly #models = new Map<string, object>()
  #body: Promise<unknown> | undefined

  constructor(init: { request: Request; params?: Record<string, string>; route?: MatchedRoute; ip?: string }) {
    this.request = init.request
    this.url = new URL(init.request.url)
    this.params = Object.freeze({ ...(init.params ?? {}) })
    this.route = init.route
    this.ip = init.ip ?? 'unknown'
  }

  /** The HTTP method, upper case. */
  get method(): string {
    return this.request.method.toUpperCase()
  }

  /** The query string. */
  get query(): URLSearchParams {
    return this.url.searchParams
  }

  /**
   * A path parameter as a string. Throws if the route has no such parameter, because that is a
   * route/controller mismatch to fix, not a client error.
   *
   * @example
   * ctx.param('post') // 'hello-world'
   */
  param(name: string): string {
    const value = this.params[name]
    if (value !== undefined) return value
    throw new Error(`The route "${this.route?.uri ?? this.url.pathname}" has no {${name}} parameter. Parameters here: ${Object.keys(this.params).join(', ') || 'none'}.`)
  }

  /**
   * The signed-in user, or a 401. Use it in actions that only make sense with a user.
   *
   * @example
   * const author = ctx.requireUser()
   */
  requireUser(): AuthUser {
    if (this.user !== null) return this.user
    throw new HttpError(401, 'unauthenticated', 'Unauthenticated', 'Sign in first: send an "Authorization: Bearer <token>" header.', {
      headers: { 'www-authenticate': 'Bearer' },
      hint: 'Add the "auth" middleware to this route so guests get a 401 before the controller runs.',
    })
  }

  /**
   * Record a model bound from a route parameter. Called by route model binding.
   *
   * @example
   * ctx.bindModel('post', post)
   */
  bindModel(parameter: string, model: object): void {
    this.#models.set(parameter, model)
  }

  /**
   * The model bound from the route, looked up by its class: Laravel's `show(Post $post)`.
   * Typed by the class you pass, so `ctx.model(Post)` is a `Post`.
   *
   * @example
   * const post = ctx.model(Post) // 404 already happened in binding if it didn't exist
   */
  model<TClass extends ModelConstructor<object>>(modelClass: TClass, parameter?: string): InstanceType<TClass> {
    for (const [name, instance] of this.#models) {
      if ((parameter === undefined || parameter === name) && instance instanceof modelClass) return instance as InstanceType<TClass>
    }
    const bound = [...this.#models.keys()].join(', ') || 'none'
    throw new Error(`No ${modelClass.name} is bound on route "${this.route?.uri ?? this.url.pathname}" (bound parameters: ${bound}). Add {${modelClass.name.toLowerCase()}} to the route path and register the model in withRouting({ bindings }).`)
  }

  /**
   * The JSON body, parsed once and cached. 415 for other content types, 413 when too big, 400
   * for malformed JSON.
   *
   * @example
   * const body = await ctx.json()
   */
  body(limit = DEFAULT_BODY_LIMIT): Promise<unknown> {
    this.#body ??= readJsonBody(this.request, limit)
    return this.#body
  }

  /**
   * `true` when the client wants JSON: an `/api` path, or an `Accept` header naming JSON.
   * Used by the exception handler to choose problem+json or an HTML page.
   *
   * @example
   * if (ctx.wantsJson()) { … }
   */
  wantsJson(): boolean {
    const accept = this.request.headers.get('accept') ?? ''
    return this.url.pathname === '/api' || this.url.pathname.startsWith('/api/') || accept.includes('json')
  }

  /**
   * A JSON response.
   *
   * @example
   * return ctx.json({ data: post }, 201, { location: route('posts.show', { post }) })
   */
  json(data: unknown, status = 200, headers: Readonly<Record<string, string>> = {}): Response {
    return new Response(JSON.stringify(data), { status, headers: { ...headers, 'content-type': 'application/json' } })
  }

  /**
   * An empty 204 response, for deletes.
   *
   * @example
   * return ctx.noContent()
   */
  noContent(): Response {
    return new Response(null, { status: 204 })
  }

  /**
   * An HTML response.
   *
   * @example
   * return ctx.html('<!doctype html><div id="root"></div>')
   */
  html(markup: string, status = 200): Response {
    return new Response(markup, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
  }
}

/**
 * Read and parse a JSON body with a size limit that holds even when `Content-Length` lies or is
 * missing (chunked uploads), by counting bytes while streaming.
 */
async function readJsonBody(request: Request, limit: number): Promise<unknown> {
  const type = request.headers.get('content-type') ?? ''
  if (!type.toLowerCase().includes('application/json')) {
    throw new HttpError(415, 'unsupported_media_type', 'Unsupported media type', 'Send the body as JSON with "Content-Type: application/json".')
  }
  const text = await readLimitedText(request, limit)
  try {
    return JSON.parse(text)
  } catch {
    throw new HttpError(400, 'invalid_json', 'Invalid JSON', 'The request body is not valid JSON. Check for trailing commas and unquoted keys.')
  }
}

async function readLimitedText(request: Request, limit: number): Promise<string> {
  const tooLarge = new HttpError(413, 'payload_too_large', 'Payload too large', `The body is larger than ${limit} bytes.`)
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > limit) throw tooLarge
  if (request.body === null) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      // Stop reading at once: the rest of an oversized body is never buffered.
      await reader.cancel()
      throw tooLarge
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}
