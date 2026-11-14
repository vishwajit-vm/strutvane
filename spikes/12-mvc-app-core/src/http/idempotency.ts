/**
 * The `idempotent` middleware: a client sends `Idempotency-Key: <unique>` with a POST (a payment,
 * an import), and a retry with the same key gets the *first* response replayed instead of
 * running the action twice. Follows the IETF httpapi Idempotency-Key draft's behaviour:
 *
 * | Situation | Answer |
 * |---|---|
 * | no key (`idempotent`) | 400 `idempotency_key_required` (`idempotent:optional` lets it through) |
 * | first use | runs; a non-5xx response is stored for 24 h |
 * | same key, same request, finished | the stored response, with `Idempotent-Replayed: true` |
 * | same key, still running | 409 `idempotency_in_progress` |
 * | same key, different body or path | 422 `idempotency_key_reused` |
 *
 * Keys are scoped to the signed-in user (or the client's IP bucket for guests), so one user can
 * never be served another user's stored response by guessing or reusing their key. Only
 * `content-type` and `location` are replayed: never `set-cookie` or other per-request headers.
 */
import { createHash } from 'node:crypto'
import { token } from '../foundation/container.ts'
import { ClockToken } from '../foundation/tokens.ts'
import { readLimitedText, type HttpContext } from './context.ts'
import type { Middleware, Next } from './middleware.ts'
import { HttpError } from './problem.ts'
import { ipBucket } from './throttle.ts'

/**
 * A response kept for replay.
 *
 * @example
 * const stored: StoredResponse = { status: 201, headers: [['content-type', 'application/json']], body: '{"id":1}' }
 */
export interface StoredResponse {
  readonly status: number
  readonly headers: readonly (readonly [string, string])[]
  readonly body: string
}

/**
 * What a store says about a key when a request starts.
 *
 * @example
 * const outcome: BeginOutcome = { kind: 'new' }
 */
export type BeginOutcome = { readonly kind: 'new' } | { readonly kind: 'in_progress' } | { readonly kind: 'mismatch' } | { readonly kind: 'replay'; readonly response: StoredResponse }

/**
 * Where keys and responses live. The memory store suits one process; a cluster needs a shared
 * store (the cache table or Redis) behind this interface, with an atomic `begin`.
 *
 * @example
 * app.container.singleton(IdempotencyStoreToken, () => new MemoryIdempotencyStore())
 */
export interface IdempotencyStore {
  /** Atomically claim the key for this fingerprint, or report what already holds it. */
  begin(key: string, fingerprint: string, now: number): BeginOutcome
  complete(key: string, response: StoredResponse, now: number): void
  /** Forget an unfinished claim (the action failed), so a retry runs again. */
  release(key: string): void
}

/** How long a finished response is replayed. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000

interface Entry {
  readonly fingerprint: string
  response: StoredResponse | undefined
  expiresAt: number
}

/**
 * The in-memory store. Expired entries are dropped when touched and swept on each `begin`.
 *
 * @example
 * new MemoryIdempotencyStore()
 */
export class MemoryIdempotencyStore implements IdempotencyStore {
  readonly #entries = new Map<string, Entry>()

  begin(key: string, fingerprint: string, now: number): BeginOutcome {
    for (const [stored, entry] of this.#entries) if (entry.expiresAt <= now) this.#entries.delete(stored)
    const entry = this.#entries.get(key)
    if (entry === undefined) {
      // An in-flight claim expires too, so a crashed request can't block its key forever.
      this.#entries.set(key, { fingerprint, response: undefined, expiresAt: now + IDEMPOTENCY_TTL_MS })
      return { kind: 'new' }
    }
    if (entry.fingerprint !== fingerprint) return { kind: 'mismatch' }
    return entry.response === undefined ? { kind: 'in_progress' } : { kind: 'replay', response: entry.response }
  }

  complete(key: string, response: StoredResponse, now: number): void {
    const entry = this.#entries.get(key)
    if (entry === undefined) return
    entry.response = response
    entry.expiresAt = now + IDEMPOTENCY_TTL_MS
  }

  release(key: string): void {
    this.#entries.delete(key)
  }
}

/**
 * The container token for the idempotency store.
 *
 * @example
 * app.make(IdempotencyStoreToken)
 */
export const IdempotencyStoreToken = token<IdempotencyStore>('IdempotencyStore')

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS'])
/** Visible ASCII, 1 to 255 characters (UUIDs and ULIDs fit). */
const KEY = /^[\x21-\x7e]{1,255}$/
const REPLAYED_HEADERS = ['content-type', 'location']
/** Responses bigger than this aren't stored (the action still ran once; a retry runs again). */
const MAX_STORED_BYTES = 1024 * 1024

/**
 * The `idempotent` middleware class.
 *
 * @example
 * Route.post('/payments', [PaymentController, 'store']).middleware('auth', 'idempotent')
 */
export class EnsureIdempotency implements Middleware {
  static readonly inject = [IdempotencyStoreToken, ClockToken] as const
  readonly #store: IdempotencyStore
  readonly #clock: () => Date

  constructor(store: IdempotencyStore, clock: () => Date) {
    this.#store = store
    this.#clock = clock
  }

  async handle(ctx: HttpContext, next: Next, mode?: string): Promise<Response> {
    if (SAFE_METHODS.has(ctx.method)) return next()
    const key = ctx.request.headers.get('idempotency-key')
    if (key === null) {
      if (mode === 'optional') return next()
      throw new HttpError(400, 'idempotency_key_required', 'Idempotency key required', 'Send an "Idempotency-Key" header with a unique value (a UUID) so a retry can\'t repeat this action.')
    }
    if (!KEY.test(key)) throw new HttpError(400, 'idempotency_key_invalid', 'Invalid idempotency key', 'The Idempotency-Key must be 1 to 255 visible ASCII characters.')
    const scope = ctx.user === null ? `ip:${ipBucket(ctx.ip)}` : `user:${String(ctx.user.id)}`
    const storeKey = sha256(`${scope}\n${ctx.route?.uri ?? ctx.url.pathname}\n${key}`)
    const fingerprint = sha256(`${ctx.method}\n${ctx.url.pathname}${ctx.url.search}\n${await bodyText(ctx)}`)
    const now = this.#clock().getTime()
    const outcome = this.#store.begin(storeKey, fingerprint, now)
    if (outcome.kind === 'in_progress') throw new HttpError(409, 'idempotency_in_progress', 'Request in progress', 'A request with this Idempotency-Key is still being processed. Retry shortly.', { headers: { 'retry-after': '1' } })
    if (outcome.kind === 'mismatch') throw new HttpError(422, 'idempotency_key_reused', 'Idempotency key reused', 'This Idempotency-Key was already used for a different request. Use a new key for a new request.')
    if (outcome.kind === 'replay') return replay(outcome.response)
    let response: Response
    try {
      response = await next()
    } catch (error) {
      this.#store.release(storeKey)
      throw error
    }
    await this.#remember(storeKey, response, now)
    return response
  }

  async #remember(storeKey: string, response: Response, now: number): Promise<void> {
    // 5xx means "it may not have happened": let the client retry for real.
    if (response.status >= 500) {
      this.#store.release(storeKey)
      return
    }
    const body = await response.clone().text()
    if (Buffer.byteLength(body) > MAX_STORED_BYTES) {
      this.#store.release(storeKey)
      return
    }
    const headers = REPLAYED_HEADERS.flatMap((name) => {
      const value = response.headers.get(name)
      return value === null ? [] : [[name, value] as const]
    })
    this.#store.complete(storeKey, { status: response.status, headers, body }, now)
  }
}

function replay(stored: StoredResponse): Response {
  const headers = new Headers(stored.headers.map(([name, value]) => [name, value]))
  headers.set('idempotent-replayed', 'true')
  return new Response(stored.status === 204 ? null : stored.body, { status: stored.status, headers })
}

/** The body read from a clone (the controller still gets it), capped like any body. */
async function bodyText(ctx: HttpContext): Promise<string> {
  return ctx.request.body === null ? '' : readLimitedText(ctx.request.clone(), ctx.state.limits.maxBytes)
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}
