/**
 * RFC 9457 problem+json responses with a stable `code` and per-field `issues`: the exact body
 * shape spike 10's API returns (`src/crud/problem.ts`), which the UI's error handling reads.
 *
 * @module
 */

/**
 * One thing wrong with one field (spike 10's issue shape).
 *
 * @example
 * const issue: Issue = { field: 'title', code: 'required', message: 'Title is required.' }
 */
export interface Issue {
  /** The field name, or `''` for the request as a whole. */
  readonly field: string
  readonly code: string
  readonly message: string
}

/**
 * Build a problem+json `Response`.
 *
 * @example
 * return problemResponse(404, 'not_found', 'Not found', 'No post has id 7.')
 */
export function problemResponse(status: number, code: string, title: string, detail: string, issues?: readonly Issue[]): Response {
  const body = { type: `https://strutvane.dev/problems/${code}`, title, status, code, detail, ...(issues === undefined ? {} : { issues }) }
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

/**
 * A JSON success response.
 *
 * @example
 * return jsonResponse({ data: row }, 201)
 */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
