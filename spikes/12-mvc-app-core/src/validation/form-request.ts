/**
 * Form requests: Laravel's `StorePostRequest` with `rules()` and `authorize()`, validating with any
 * Standard Schema library (Zod 4 in the example app).
 *
 * One deliberate change from Laravel: **unknown fields are rejected by default** (Laravel's
 * `#[FailOnUnknownFields]` is opt-in). Sending `is_admin: true` to an endpoint that doesn't accept
 * it is a 422, not a silent no-op that hides a mass-assignment probe or a client typo.
 */
import type { HttpContext } from '../http/context.ts'
import { ForbiddenError, ValidationError } from '../http/problem.ts'
import type { Issue } from '../support/issue.ts'

/**
 * The Standard Schema v1 interface (https://standardschema.dev), inlined so the core depends on
 * no validation library. Zod, Valibot and ArkType all implement it.
 *
 * @example
 * const schema: StandardSchema<{ title: string }> = z.object({ title: z.string() })
 */
export interface StandardSchema<TOutput> {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (value: unknown) => StandardResult<TOutput> | Promise<StandardResult<TOutput>>
  }
}

/** A Standard Schema validation result. */
type StandardResult<TOutput> = { readonly value: TOutput; readonly issues?: undefined } | { readonly issues: readonly StandardIssue[] }

/** A Standard Schema issue. `code` is not in the standard, but Zod adds it and we keep it. */
interface StandardIssue {
  readonly message: string
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[] | undefined
}

/**
 * A form request. Subclass it, return a schema from `rules()`, and call `validate(ctx)` in the
 * controller (or let `ResourceController` call it).
 *
 * @example
 * export class StorePostRequest extends FormRequest<{ title: string }> {
 *   rules() { return z.object({ title: z.string().min(3) }) }
 * }
 * const input = await new StorePostRequest().validate(ctx) // { title: string }, or a 422
 */
export abstract class FormRequest<TOutput extends object> {
  /** The validation schema. */
  abstract rules(ctx: HttpContext): StandardSchema<TOutput>

  /**
   * Extra request-level permission, Laravel's `authorize()`. Defaults to "yes", because the
   * policy is the main gate; return `false` for a 403.
   *
   * @example
   * authorize(ctx) { return ctx.user !== null }
   */
  authorize(_ctx: HttpContext): boolean | Promise<boolean> {
    return true
  }

  /**
   * Normalise input before validation (trim strings, lower-case emails). Laravel's
   * `prepareForValidation()`.
   *
   * @example
   * prepareForValidation(input) { return { ...input, email: String(input.email).toLowerCase() } }
   */
  prepareForValidation(input: Readonly<Record<string, unknown>>, _ctx: HttpContext): Readonly<Record<string, unknown>> {
    return input
  }

  /**
   * Read the JSON body, authorize, normalise and validate it. Every issue is reported at once.
   *
   * @example
   * const input = await new UpdatePostRequest().validate(ctx)
   */
  async validate(ctx: HttpContext): Promise<TOutput> {
    if (!(await this.authorize(ctx))) throw new ForbiddenError('You are not allowed to send this request.', `${this.constructor.name}.authorize() returned false.`)
    const body = await ctx.body()
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new ValidationError([{ field: '', code: 'invalid_body', message: 'Send a JSON object, for example {"title": "Hello"}.' }])
    }
    const input = this.prepareForValidation(body as Record<string, unknown>, ctx)
    const result = await this.rules(ctx)['~standard'].validate(input)
    const issues = result.issues === undefined ? [] : result.issues.map(toIssue)
    const output = result.issues === undefined ? result.value : undefined
    issues.push(...unknownFields(input, output, issues))
    if (issues.length > 0 || output === undefined) throw new ValidationError(issues)
    return output
  }
}

/**
 * Turn a Standard Schema issue into our `{ field, code, message }` shape.
 *
 * @example
 * toIssue({ message: 'Too short', path: ['title'] }) // { field: 'title', code: 'invalid', message: 'Too short' }
 */
export function toIssue(issue: StandardIssue): Issue {
  const field = (issue.path ?? []).map((segment) => String(typeof segment === 'object' ? segment.key : segment)).join('.')
  const code = 'code' in issue && typeof issue.code === 'string' ? issue.code : 'invalid'
  return { field, code, message: issue.message }
}

/**
 * Keys the client sent that the schema doesn't produce. Works with any library: a non-strict
 * object schema strips unknown keys, so "sent but not in the output" means "not accepted".
 * When validation failed (no output), only keys the schema didn't already complain about count.
 */
function unknownFields(input: Readonly<Record<string, unknown>>, output: object | undefined, existing: readonly Issue[]): Issue[] {
  if (output === undefined) return []
  const accepted = new Set(Object.keys(output))
  const reported = new Set(existing.map((issue) => issue.field))
  return Object.keys(input)
    .filter((key) => !accepted.has(key) && !reported.has(key) && input[key] !== undefined)
    .map((key) => ({ field: key, code: 'unknown_field', message: `"${key}" is not a field you can send here. Remove it from the request body.` }))
}
