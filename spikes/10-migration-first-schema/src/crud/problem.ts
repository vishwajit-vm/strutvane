/**
 * RFC 9457 problem responses with a stable `code` and per-field `issues`, the error shape every
 * Strutvane API uses (RFC-0003). Real messages would come from catalogs; the spike inlines them.
 */

/**
 * One thing wrong with one field.
 *
 * @example
 * const issue: Issue = { field: 'status', code: 'not_allowed', message: 'Pick one of: draft, published.' }
 */
export interface Issue {
  /** The field name, or `''` for the request as a whole. */
  readonly field: string
  /** A stable code clients can match on, for example `required` or `too_long`. */
  readonly code: string
  /** A friendly sentence for a person. */
  readonly message: string
}

/**
 * A problem+json body.
 *
 * @example
 * const body: Problem = { type: 'https://strutvane.dev/problems/not_found', title: 'Not found', status: 404, code: 'not_found', detail: 'No post has id 7.' }
 */
export interface Problem {
  readonly type: string
  readonly title: string
  readonly status: number
  readonly code: string
  readonly detail: string
  readonly issues?: readonly Issue[]
}

/**
 * Build a problem+json `Response`.
 *
 * @example
 * return problemResponse(404, 'not_found', 'Not found', 'No post has id 7.')
 */
export function problemResponse(status: number, code: string, title: string, detail: string, issues?: readonly Issue[]): Response {
  const body: Problem = {
    type: `https://strutvane.dev/problems/${code}`,
    title,
    status,
    code,
    detail,
    ...(issues === undefined ? {} : { issues }),
  }
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/problem+json' } })
}

/**
 * The 422 every validation failure returns.
 *
 * @example
 * return validationProblem([{ field: 'title', code: 'required', message: 'Title is required.' }])
 */
export function validationProblem(issues: readonly Issue[]): Response {
  return problemResponse(422, 'validation_failed', 'Some fields need attention', 'Fix the fields listed in `issues` and try again.', issues)
}
