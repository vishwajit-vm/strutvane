/**
 * Turning failures into RFC 9457 problem responses with RFC-0003 structured issues.
 *
 * One function per concern: {@link fromZodIssues} maps validator output to stable codes and params,
 * {@link validationProblem} / {@link notFoundProblem} / {@link problem} build the response body,
 * and {@link ProblemSchema} is the Zod schema registered in OpenAPI so every error response is
 * documented with the same shape.
 *
 * @module
 */
import { z } from 'zod'
import type { Problem, ValidationIssue } from './contracts.ts'
import { renderMessage } from './messages.ts'

/** Zod schema of one issue, as published in OpenAPI (component `ValidationIssue`). */
export const ValidationIssueSchema = z
  .object({
    path: z.array(z.union([z.string(), z.int()])),
    code: z.string(),
    params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    message: z.string(),
  })
  .meta({ id: 'ValidationIssue' })

/** Zod schema of a problem body, as published in OpenAPI (component `Problem`). */
export const ProblemSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.int(),
    code: z.string(),
    detail: z.string().optional(),
    traceId: z.string().optional(),
    issues: z.array(ValidationIssueSchema).optional(),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  })
  .meta({ id: 'Problem' })

/** Minimal structural view of a Zod issue (avoids depending on Zod's internal issue union). */
interface ZodIssueLike {
  readonly code: string
  readonly path: readonly PropertyKey[]
  readonly input?: unknown
  readonly origin?: string
  readonly minimum?: number | bigint
  readonly maximum?: number | bigint
  readonly expected?: string
  readonly values?: readonly unknown[]
  readonly format?: string
  readonly keys?: readonly string[]
}

/**
 * Map Zod issues to Strutvane issues. `labelFor` resolves a path to a human label for
 * `{attribute}` (falls back to the last path segment).
 */
export function fromZodIssues(
  issues: readonly ZodIssueLike[],
  labelFor: (path: readonly (string | number)[]) => string,
  prefix: readonly (string | number)[] = [],
): ValidationIssue[] {
  const out: ValidationIssue[] = []
  for (const issue of issues) {
    const path = [...prefix, ...issue.path.map((p) => (typeof p === 'number' ? p : String(p)))]
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys ?? []) out.push(build([...path, key], 'unknown_field', {}, labelFor))
      continue
    }
    const { code, params } = classify(issue)
    out.push(build(path, code, params, labelFor))
  }
  return out
}

function classify(issue: ZodIssueLike): { code: string; params: Record<string, string | number | boolean> } {
  const textual = issue.origin === 'string'
  switch (issue.code) {
    case 'invalid_type':
      return issue.input === undefined
        ? { code: 'required', params: {} }
        : { code: 'invalid_type', params: { expected: issue.expected ?? 'value' } }
    case 'too_small':
      return { code: textual ? 'too_short' : 'too_small', params: { min: Number(issue.minimum ?? 0) } }
    case 'too_big':
      return { code: textual ? 'too_long' : 'too_big', params: { max: Number(issue.maximum ?? 0) } }
    case 'invalid_value':
      return { code: 'invalid_value', params: { values: (issue.values ?? []).map(String).join(', ') } }
    case 'invalid_format':
      return { code: 'invalid_format', params: { format: issue.format ?? 'value' } }
    default:
      return { code: 'invalid', params: {} }
  }
}

function build(
  path: (string | number)[],
  code: string,
  params: Record<string, string | number | boolean>,
  labelFor: (path: readonly (string | number)[]) => string,
): ValidationIssue {
  const message = renderMessage(code, params, labelFor(path))
  return Object.keys(params).length > 0 ? { path, code, params, message } : { path, code, message }
}

/** Build the convenience `fieldErrors` map (`"lines.2.amount": [...]`) from issues. */
export function toFieldErrors(issues: readonly ValidationIssue[]): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const issue of issues) {
    const key = issue.path.join('.')
    ;(map[key] ??= []).push(issue.message)
  }
  return map
}

/** A generic problem body. */
export function problem(status: number, code: string, title: string, extra: Partial<Problem> = {}): Problem {
  return { type: `https://strutvane.dev/errors/${code.toLowerCase().replaceAll('_', '-')}`, title, status, code, ...extra }
}

/** 422 with structured issues and the derived `fieldErrors` map. */
export function validationProblem(issues: readonly ValidationIssue[]): Problem {
  return problem(422, 'VALIDATION_FAILED', 'Validation failed', { issues, fieldErrors: toFieldErrors(issues) })
}

/** 404 for a missing record (never reveals whether it exists for another tenant). */
export function notFoundProblem(resourceLabel: string): Problem {
  return problem(404, 'NOT_FOUND', 'Not found', { detail: `${resourceLabel} not found.` })
}
