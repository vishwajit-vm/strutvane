/**
 * RFC 9457 problem details, the one error shape every Strutvane API returns (RFC-0003), plus the
 * HTTP errors controllers, middleware and binding throw to produce them.
 *
 * Throwing (instead of returning a response) is what lets a policy check deep in a helper stop
 * the request with a 403, exactly like Laravel's `abort(403)` / `$this->authorize()`.
 */

import type { Issue } from '../support/issue.ts'

export type { Issue }

/**
 * A problem+json body.
 *
 * @example
 * const body: Problem = { type: 'https://strutvane.dev/problems/not_found', title: 'Not found', status: 404, code: 'not_found', detail: 'No post matches "hello".' }
 */
export interface Problem {
  readonly type: string
  readonly title: string
  readonly status: number
  readonly code: string
  readonly detail: string
  readonly issues?: readonly Issue[]
  /** Only in debug mode: how a developer can fix this. Never sent in production. */
  readonly hint?: string
}

/**
 * An error that maps to an HTTP status and a problem body. The exception handler renders it.
 *
 * @example
 * throw new HttpError(409, 'conflict', 'Conflict', 'That slug is taken.')
 */
export class HttpError extends Error {
  readonly status: number
  readonly code: string
  readonly title: string
  readonly issues: readonly Issue[] | undefined
  /** Developer-only advice; shown in debug mode, never in production. */
  readonly hint: string | undefined
  /** Extra response headers, such as `Retry-After` or `Allow`. */
  readonly headers: Readonly<Record<string, string>>

  constructor(status: number, code: string, title: string, detail: string, extras: { issues?: readonly Issue[]; hint?: string; headers?: Record<string, string> } = {}) {
    super(detail)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.title = title
    this.issues = extras.issues
    this.hint = extras.hint
    this.headers = extras.headers ?? {}
  }

  /**
   * The problem body. `debug` decides whether the developer hint is included.
   *
   * @example
   * new NotFoundError('No post 7.').toProblem(false) // { status: 404, code: 'not_found', … }
   */
  toProblem(debug: boolean): Problem {
    return {
      type: `https://strutvane.dev/problems/${this.code}`,
      title: this.title,
      status: this.status,
      code: this.code,
      detail: this.message,
      ...(this.issues === undefined ? {} : { issues: this.issues }),
      ...(debug && this.hint !== undefined ? { hint: this.hint } : {}),
    }
  }
}

/**
 * 404: the route or the record doesn't exist.
 *
 * @example
 * throw new NotFoundError('No post matches "hello-world".')
 */
export class NotFoundError extends HttpError {
  constructor(detail: string, hint?: string) {
    super(404, 'not_found', 'Not found', detail, hint === undefined ? {} : { hint })
    this.name = 'NotFoundError'
  }
}

/**
 * 401: the request needs a signed-in user.
 *
 * @example
 * throw new UnauthenticatedError()
 */
export class UnauthenticatedError extends HttpError {
  constructor(detail = 'Sign in first: send an "Authorization: Bearer <token>" header.') {
    super(401, 'unauthenticated', 'Unauthenticated', detail, { headers: { 'www-authenticate': 'Bearer' } })
    this.name = 'UnauthenticatedError'
  }
}

/**
 * 403: signed in (or not), but not allowed.
 *
 * @example
 * throw new ForbiddenError('You may not delete this post.', 'PostPolicy has no delete() method.')
 */
export class ForbiddenError extends HttpError {
  constructor(detail: string, hint?: string) {
    super(403, 'forbidden', 'Forbidden', detail, hint === undefined ? {} : { hint })
    this.name = 'ForbiddenError'
  }
}

/**
 * 422: the input failed validation. Every issue is reported at once.
 *
 * @example
 * throw new ValidationError([{ field: 'title', code: 'required', message: 'Title is required.' }])
 */
export class ValidationError extends HttpError {
  constructor(issues: readonly Issue[]) {
    super(422, 'validation_failed', 'Some fields need attention', 'Fix the fields listed in `issues` and try again.', { issues })
    this.name = 'ValidationError'
  }
}

/**
 * 429: too many requests; `Retry-After` says when to try again.
 *
 * @example
 * throw new TooManyRequestsError(30)
 */
export class TooManyRequestsError extends HttpError {
  constructor(retryAfterSeconds: number, headers: Record<string, string> = {}) {
    super(429, 'too_many_requests', 'Too many requests', `Slow down: try again in ${retryAfterSeconds} seconds.`, { headers: { ...headers, 'retry-after': String(retryAfterSeconds) } })
    this.name = 'TooManyRequestsError'
  }
}

/**
 * Stop the request with a status, like Laravel's `abort(404)`.
 *
 * @example
 * if (post.status !== 'published') abort(404, 'No such post.')
 */
export function abort(status: 401 | 403 | 404, detail?: string): never {
  if (status === 401) throw new UnauthenticatedError(detail)
  if (status === 403) throw new ForbiddenError(detail ?? 'You are not allowed to do this.')
  throw new NotFoundError(detail ?? 'Nothing was found here.')
}

/**
 * Build a problem+json response.
 *
 * @example
 * return problemResponse(new NotFoundError('No post 7.').toProblem(false))
 */
export function problemResponse(problem: Problem, headers: Readonly<Record<string, string>> = {}): Response {
  return new Response(JSON.stringify(problem), { status: problem.status, headers: { ...headers, 'content-type': 'application/problem+json' } })
}

/**
 * Carries a ready response out of deep code, for imperative checks such as `csrf.verify(ctx)`
 * whose middleware answered with a response (a redirect, a replay) instead of throwing. The
 * exception handler sends `response` unchanged.
 *
 * @example
 * throw new ResponseError(new Response(null, { status: 302, headers: { location: '/login' } }))
 */
export class ResponseError extends Error {
  readonly response: Response

  constructor(response: Response) {
    super(`Responded early with status ${response.status}.`)
    this.name = 'ResponseError'
    this.response = response
  }
}
