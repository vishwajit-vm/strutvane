/**
 * `HttpContext`: everything a controller action, middleware or policy check needs about the
 * current request, in one typed object. Laravel spreads this over `$request`, `$request->user()`,
 * route parameters and injected models; here it is one explicit argument.
 */
import type { AuthUser } from '../registry.ts'
import { JsonLimitError, parseJsonSafely } from '../security/safe-json.ts'
import { HttpError } from './problem.ts'
import { plainRequestState, type BodyLimits, type RequestState } from './request-state.ts'

/** The largest JSON body accepted by default (1 MiB). Bigger bodies are a 413. */
export const DEFAULT_BODY_LIMIT = 1024 * 1024

/** The session cookie name (owned by the session layer of the auth package). */
export const SESSION_COOKIE = 'strutvane_session'

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
  /**
   * The client address: the socket peer, or the forwarded client when the peer is a configured
   * trusted proxy. `X-Forwarded-For` from anyone else is ignored.
   */
  readonly ip: string
  /** What the kernel worked out before routing: real IP and scheme, host, CSP nonce, limits. */
  readonly state: RequestState
  /** The signed-in user; set by the `auth` middleware, `null` for guests. */
  user: AuthUser | null = null
  readonly #models = new Map<string, object>()
  readonly #applied = new Set<string>()
  #body: Promise<unknown> | undefined

  constructor(init: { request: Request; params?: Record<string, string>; route?: MatchedRoute; ip?: string; state?: RequestState }) {
    this.request = init.request
    this.url = new URL(init.request.url)
    this.params = Object.freeze({ ...(init.params ?? {}) })
    this.route = init.route
    this.state = init.state ?? plainRequestState(init.request, init.ip)
    this.ip = this.state.ip
  }

  /**
   * The CSP nonce for this response. Put it on every inline `<script>` and `<style>`; scripts
   * without it are blocked by the default Content-Security-Policy.
   *
   * @example
   * ctx.html(`<script nonce="${ctx.nonce}">boot()</script>`)
   */
  get nonce(): string {
    return this.state.nonce
  }

  /**
   * One cookie from the request, or `undefined`.
   *
   * @example
   * ctx.cookie('theme') // 'dark'
   */
  cookie(name: string): string | undefined {
    return readCookie(this.request.headers.get('cookie') ?? '', name)
  }

  /**
   * The session id from the session cookie, or `undefined` when there is none **or when the
   * request carries a Bearer token**. A bearer request is never also a cookie session (security
   * review F-07): otherwise a forged cross-site request could add a junk bearer header to skip
   * CSRF and still be authenticated by the cookie.
   *
   * @example
   * const sessionId = ctx.sessionId()
   */
  sessionId(): string | undefined {
    if (hasBearer(this.request)) return undefined
    return this.cookie(SESSION_COOKIE)
  }

  /**
   * Record that a protection ran for this request, so a `withCsrf()`-style wrapper doesn't run it
   * twice when the router already did.
   *
   * @example
   * ctx.markApplied('csrf')
   */
  markApplied(alias: string): void {
    this.#applied.add(alias)
  }

  /**
   * `true` when the middleware with this alias already ran for this request.
   *
   * @example
   * if (!ctx.hasApplied('csrf')) await csrf.verify(ctx)
   */
  hasApplied(alias: string): boolean {
    return this.#applied.has(alias)
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
  body(limit = this.state.limits.maxBytes): Promise<unknown> {
    this.#body ??= readJsonBody(this.request, { ...this.state.limits, maxBytes: limit })
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
 * missing (chunked uploads), by counting bytes while streaming. The JSON is parsed with depth,
 * key-count and prototype-pollution checks.
 */
async function readJsonBody(request: Request, limits: BodyLimits): Promise<unknown> {
  if (!isJsonMediaType(request.headers.get('content-type'))) {
    throw new HttpError(415, 'unsupported_media_type', 'Unsupported media type', 'Send the body as JSON with "Content-Type: application/json".')
  }
  const text = await readLimitedText(request, limits.maxBytes)
  try {
    return parseJsonSafely(text, limits)
  } catch (error) {
    if (error instanceof JsonLimitError) throw error.toHttpError()
    throw error
  }
}

/**
 * `true` only when the media type *essence* is `application/json` or `application/*+json`.
 * A substring test would accept `text/plain; x=application/json`, which a cross-site form can
 * send without a CORS preflight.
 *
 * @example
 * isJsonMediaType('application/json; charset=utf-8') // true
 * isJsonMediaType('text/plain; a=application/json')  // false
 */
export function isJsonMediaType(header: string | null): boolean {
  const essence = (header ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
  return essence === 'application/json' || /^application\/[a-z0-9.+-]+\+json$/.test(essence)
}

/**
 * `true` when the request carries `Authorization: Bearer …`.
 *
 * @example
 * hasBearer(new Request('http://x', { headers: { authorization: 'Bearer abc' } })) // true
 */
export function hasBearer(request: Request): boolean {
  return /^Bearer\s/i.test(request.headers.get('authorization') ?? '')
}

/**
 * One cookie's value from a `Cookie` header. A value that isn't valid percent-encoding is
 * returned raw instead of throwing (a malformed cookie must not become a 500).
 *
 * @example
 * readCookie('a=1; strutvane_session=abc', 'strutvane_session') // 'abc'
 */
export function readCookie(header: string, name: string): string | undefined {
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key !== name) continue
    const raw = rest.join('=')
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }
  return undefined
}

/**
 * Read a body as text, at most `limit` bytes, refusing early when `Content-Length` already says
 * it's too big. Exported for middleware that must read a form body (the CSRF `_token`).
 *
 * @example
 * const text = await readLimitedText(request.clone(), 64 * 1024)
 */
export async function readLimitedText(request: Request, limit: number): Promise<string> {
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
