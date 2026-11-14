/**
 * What the HTTP kernel works out about a request *before* routing: the real client address and
 * scheme (after the trusted-proxy rules), the host, the CSP nonce for this response, the body
 * limits, and whether a test asked to skip CSRF. Every `HttpContext` of the request shares it.
 *
 * Why a separate object: global middleware (hosts, maintenance, CORS, headers) run before the
 * router builds the route's context, and the nonce they create must be the same one a view puts
 * in its `<script nonce>`.
 */
import { randomBytes } from 'node:crypto'

/**
 * Body limits applied by `ctx.body()`: bytes, JSON nesting depth and the total number of keys.
 *
 * @example
 * const limits: BodyLimits = { maxBytes: 1024 * 1024, maxDepth: 32, maxKeys: 1000 }
 */
export interface BodyLimits {
  readonly maxBytes: number
  readonly maxDepth: number
  readonly maxKeys: number
}

/**
 * The defaults: 1 MiB, 32 levels, 1,000 keys. Generous for forms and APIs, small enough that a
 * hostile body can't pin a CPU or exhaust memory.
 */
export const DEFAULT_BODY_LIMITS: BodyLimits = Object.freeze({ maxBytes: 1024 * 1024, maxDepth: 32, maxKeys: 1000 })

/**
 * The per-request facts shared by the kernel, middleware and views.
 *
 * @example
 * ctx.state.nonce // 'r4nd0m…', for <script nonce="…">
 */
export interface RequestState {
  /** The client address: the socket peer, or the forwarded client when the peer is a trusted proxy. */
  readonly ip: string
  /** `true` over HTTPS (directly, or `X-Forwarded-Proto: https` from a trusted proxy). */
  readonly secure: boolean
  /** The requested host name, lower case, without the port. */
  readonly host: string
  /** A fresh CSP nonce for this response. */
  readonly nonce: string
  readonly limits: BodyLimits
  /** Set only by `client(app).withoutCsrf()`, and only honoured when APP_ENV=testing. */
  readonly skipCsrf: boolean
}

/**
 * A request state straight from the request, trusting no proxy headers. The kernel replaces it
 * with one built from the app's settings; tests and helpers that build a context by hand use this.
 *
 * @example
 * const state = plainRequestState(new Request('https://blog.test/'), '203.0.113.7')
 */
export function plainRequestState(request: Request, ip = 'unknown'): RequestState {
  const url = new URL(request.url)
  return { ip, secure: url.protocol === 'https:', host: url.hostname.toLowerCase(), nonce: newNonce(), limits: DEFAULT_BODY_LIMITS, skipCsrf: false }
}

/**
 * A CSP nonce: 128 random bits, base64. New for every response, so a nonce leaked from one page
 * can't authorise a script on the next.
 *
 * @example
 * newNonce() // 'q2v3…=='
 */
export function newNonce(): string {
  return randomBytes(16).toString('base64')
}
