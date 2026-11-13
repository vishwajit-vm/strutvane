/**
 * Turns API failures into UI state (RFC-0003 §4).
 *
 * - `ApiProblemError` carries the RFC 9457 Problem a request failed with.
 * - `issuePathToFieldName` converts issue paths (`['lines', 1, 'amount']`) into form field names
 *   (`lines[1].amount`, TanStack Form's deep-key syntax).
 * - `routeIssues` attaches every issue to the deepest field the form actually renders, falling back
 *   to parent fields and finally to form-level errors, so NO server message is ever dropped.
 */
import type { Problem, ValidationIssue } from './contracts.ts'

/** Thrown by the API client when a response is a problem+json error. */
export class ApiProblemError extends Error {
  readonly problem: Problem
  constructor(problem: Problem) {
    super(problem.detail ?? problem.title)
    this.name = 'ApiProblemError'
    this.problem = problem
  }
}

/** Structural check for an RFC 9457 problem body (we never trust a response shape blindly). */
export function isProblem(value: unknown): value is Problem {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.type === 'string' &&
    typeof v.title === 'string' &&
    typeof v.status === 'number' &&
    typeof v.code === 'string'
  )
}

/** `['lines', 1, 'amount']` → `'lines[1].amount'`; `[]` → `''` (form level). */
export function issuePathToFieldName(path: readonly (string | number)[]): string {
  let name = ''
  for (const segment of path) {
    if (typeof segment === 'number') name += `[${segment}]`
    else name += name === '' ? segment : `.${segment}`
  }
  return name
}

/** Every prefix of a path, deepest first: `a[1].b` → `a[1].b`, `a[1]`, `a`. */
function candidateNames(path: readonly (string | number)[]): string[] {
  const names: string[] = []
  for (let len = path.length; len > 0; len--) names.push(issuePathToFieldName(path.slice(0, len)))
  return names
}

export interface RoutedIssues {
  /** Messages per rendered field name, in issue order. */
  readonly fieldErrors: ReadonlyMap<string, readonly string[]>
  /** Messages that belong to the whole form (path `[]` or no rendered field matches). */
  readonly formErrors: readonly string[]
}

/**
 * Attach issues to rendered fields. `renderedFields` is the list of field names currently in the
 * form, in visual order (used later to focus the first invalid field).
 */
export function routeIssues(
  issues: readonly ValidationIssue[],
  renderedFields: ReadonlySet<string>,
): RoutedIssues {
  const fieldErrors = new Map<string, string[]>()
  const formErrors: string[] = []
  for (const issue of issues) {
    const target = candidateNames(issue.path).find((n) => renderedFields.has(n))
    if (target === undefined) {
      formErrors.push(issue.message)
      continue
    }
    const list = fieldErrors.get(target) ?? []
    list.push(issue.message)
    fieldErrors.set(target, list)
  }
  return { fieldErrors, formErrors }
}

/** The first field (in visual order) that has an error, or undefined. */
export function firstInvalidField(
  orderedFields: readonly string[],
  fieldErrors: ReadonlyMap<string, readonly string[]>,
): string | undefined {
  return orderedFields.find((name) => (fieldErrors.get(name)?.length ?? 0) > 0)
}

/** A stable DOM id for a field name (`lines[1].amount` → `sv-field-lines-1-amount`). */
export function fieldDomId(name: string): string {
  return `sv-field-${name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/-+$/g, '')}`
}

/** User-facing text for a non-validation problem (RFC-0003 §4 rows 3–16), never raw internals. */
export function problemBannerText(problem: Problem): string {
  if (problem.status >= 500) {
    const ref = problem.traceId ? ` Reference: ${problem.traceId}.` : ''
    return `Something went wrong on our side. Your changes are kept.${ref}`
  }
  return problem.detail ?? problem.title
}
