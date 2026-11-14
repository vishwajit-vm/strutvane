/**
 * `#strutvane/testing`: Laravel's feature-test helpers, small. Requests go straight into
 * `app.handle()` (no port, no network), so a test is fast and deterministic.
 *
 * ```ts
 * const app = createApp({ ...testEnv })
 * await refreshDatabase(app)
 * const response = await client(app).actingAs(token).postJson('/api/posts', { title: 'Hello' })
 * response.assertStatus(201)
 * ```
 *
 * (A transaction per test and a per-worker database on the app's real engine come with the ORM.)
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Application } from './foundation/application.ts'
import { ConnectionToken } from './database/connection.ts'

/**
 * Load the schema dump spike 10 generated (`.strutvane/sql/schema.<engine>.sql`) into the app's
 * connection: a fresh, migrated database in milliseconds. Laravel's `RefreshDatabase`.
 *
 * @example
 * await refreshDatabase(app)
 */
export async function refreshDatabase(app: Application): Promise<void> {
  await app.boot()
  const db = app.make(ConnectionToken)
  await db.script(readFileSync(join(app.basePath, '.strutvane', 'sql', `schema.${db.dialect.name}.sql`), 'utf8'))
}

/**
 * A request builder for one app.
 *
 * @example
 * await client(app).getJson('/api/posts')
 */
export function client(app: Application): TestClient {
  return new TestClient(app, {}, { withoutCsrf: false })
}

/** Switches that change how the test client talks to the app (not headers a browser could send). */
interface ClientOptions {
  readonly withoutCsrf: boolean
}

/**
 * Builds and sends requests. Immutable: `actingAs()` and `withHeaders()` return a new client.
 *
 * @example
 * const asAlice = client(app).actingAs('alice-token')
 */
export class TestClient {
  readonly #app: Application
  readonly #headers: Readonly<Record<string, string>>
  readonly #options: ClientOptions

  constructor(app: Application, headers: Readonly<Record<string, string>>, options: ClientOptions) {
    this.#app = app
    this.#headers = headers
    this.#options = options
  }

  /**
   * Skip the CSRF check for this client's requests, Laravel's `withoutMiddleware(VerifyCsrfToken)`.
   * It only works when APP_ENV=testing: the app refuses the request otherwise. It is not a header,
   * so nothing a real client sends can switch CSRF off.
   *
   * @example
   * await client(app).withHeaders({ cookie: 'strutvane_session=abc' }).withoutCsrf().postJson('/api/posts', body)
   */
  withoutCsrf(): TestClient {
    return new TestClient(this.#app, this.#headers, { ...this.#options, withoutCsrf: true })
  }

  /**
   * Send requests as the owner of this bearer token, Laravel's `actingAs($user)`.
   *
   * @example
   * client(app).actingAs('alice-token').getJson('/api/me')
   */
  actingAs(token: string): TestClient {
    return this.withHeaders({ authorization: `Bearer ${token}` })
  }

  /**
   * Add headers to every request.
   *
   * @example
   * client(app).withHeaders({ origin: 'https://evil.example' })
   */
  withHeaders(headers: Readonly<Record<string, string>>): TestClient {
    return new TestClient(this.#app, { ...this.#headers, ...headers }, this.#options)
  }

  /** `GET` with `Accept: application/json`. */
  getJson(path: string): Promise<TestResponse> {
    return this.send('GET', path, undefined)
  }

  /** `POST` a JSON body. */
  postJson(path: string, body: unknown): Promise<TestResponse> {
    return this.send('POST', path, body)
  }

  /** `PATCH` a JSON body. */
  patchJson(path: string, body: unknown): Promise<TestResponse> {
    return this.send('PATCH', path, body)
  }

  /** `PUT` a JSON body. */
  putJson(path: string, body: unknown): Promise<TestResponse> {
    return this.send('PUT', path, body)
  }

  /** `DELETE`. */
  deleteJson(path: string): Promise<TestResponse> {
    return this.send('DELETE', path, undefined)
  }

  /** `GET` as a browser would (HTML accepted). */
  get(path: string): Promise<TestResponse> {
    return this.#dispatch(new Request(`http://localhost${path}`, { headers: { accept: 'text/html', ...this.#headers } }))
  }

  /**
   * Any method and body.
   *
   * @example
   * await client(app).send('POST', '/api/posts', { title: 'Hi' })
   */
  send(method: string, path: string, body: unknown): Promise<TestResponse> {
    const headers: Record<string, string> = { accept: 'application/json', ...this.#headers }
    if (body !== undefined) headers['content-type'] ??= 'application/json'
    const init: RequestInit = body === undefined ? { method, headers } : { method, headers, body: typeof body === 'string' ? body : JSON.stringify(body) }
    return this.#dispatch(new Request(`http://localhost${path}`, init))
  }

  async #dispatch(request: Request): Promise<TestResponse> {
    const response = await this.#app.handle(request, { ip: '203.0.113.10', ...(this.#options.withoutCsrf ? { testing: { withoutCsrf: true } } : {}) })
    return new TestResponse(response.status, response.headers, await response.text())
  }
}

/**
 * A received response with Laravel-style assertions. Each failure message shows the body, so a
 * failing test explains itself.
 *
 * @example
 * response.assertStatus(200).assertJsonPath('data.title', 'Hello')
 */
export class TestResponse {
  readonly status: number
  readonly headers: Headers
  readonly text: string

  constructor(status: number, headers: Headers, text: string) {
    this.status = status
    this.headers = headers
    this.text = text
  }

  /** The body parsed as JSON. */
  get json(): unknown {
    return JSON.parse(this.text)
  }

  /**
   * Fail unless the status matches.
   *
   * @example
   * response.assertStatus(201)
   */
  assertStatus(expected: number): this {
    if (this.status !== expected) throw new Error(`Expected status ${expected}, got ${this.status}. Body: ${this.text.slice(0, 2000)}`)
    return this
  }

  /**
   * Fail unless the value at a dot path equals `expected` (deep equality via JSON).
   *
   * @example
   * response.assertJsonPath('meta.total', 3)
   */
  assertJsonPath(path: string, expected: unknown): this {
    const actual = valueAt(this.json, path)
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${path} to be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}. Body: ${this.text.slice(0, 2000)}`)
    return this
  }

  /**
   * Fail unless this is a problem+json with the given status and code.
   *
   * @example
   * response.assertProblem(422, 'validation_failed')
   */
  assertProblem(status: number, code: string): this {
    this.assertStatus(status)
    if (!(this.headers.get('content-type') ?? '').includes('application/problem+json')) throw new Error(`Expected problem+json, got ${this.headers.get('content-type') ?? 'no content type'}.`)
    return this.assertJsonPath('code', code)
  }

  /**
   * The value at a dot path (`data.0.title`), for custom assertions.
   *
   * @example
   * const titles = response.path('data')
   */
  path(path: string): unknown {
    return valueAt(this.json, path)
  }
}

function valueAt(value: unknown, path: string): unknown {
  let current = value
  for (const segment of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}
