/**
 * The HTTP kernel's global stages: what runs for *every* request before routing (Laravel's global
 * middleware), and what is added to *every* response afterwards, including 404s, 405s and errors.
 *
 * ```
 * request → [trusted hosts] → [maintenance] → [CORS preflight] → router → response
 *                                                         response ← [CORS headers] ← [security headers]
 * ```
 *
 * The response decorators run outside the error handler on purpose: an error page needs its CSP
 * and `nosniff` as much as any other page.
 */
import { applySecurityHeaders } from '../security/secure-headers.ts'
import { corsHeaders, corsPreflight } from '../security/cors.ts'
import type { ResolvedSecurity } from '../security/settings.ts'
import { isTrustedHost } from '../security/trusted-hosts.ts'
import type { HttpContext } from './context.ts'
import { HttpError } from './problem.ts'

/**
 * One global stage: answer by itself, or call `next()`.
 *
 * @example
 * const stage: KernelStage = async (ctx, next) => next()
 */
export type KernelStage = (ctx: HttpContext, next: () => Promise<Response>) => Promise<Response>

/**
 * Run the stages in order, then `final` (the router).
 *
 * @example
 * await runStages([trustedHostStage(security)], ctx, () => router(request))
 */
export async function runStages(stages: readonly KernelStage[], ctx: HttpContext, final: () => Promise<Response>): Promise<Response> {
  const run = async (index: number): Promise<Response> => {
    const stage = stages[index]
    return stage === undefined ? final() : stage(ctx, () => run(index + 1))
  }
  return run(0)
}

/**
 * Refuse requests for hosts that aren't on the allowlist (400 `untrusted_host`).
 *
 * @example
 * trustedHostStage(security)
 */
export function trustedHostStage(security: ResolvedSecurity): KernelStage {
  return async (ctx, next) => {
    if (isTrustedHost(ctx.state.host, security.hosts)) return next()
    // The host is not echoed back: it is attacker-controlled text.
    throw new HttpError(400, 'untrusted_host', 'Untrusted host', 'This server does not answer for the requested host name.', {
      hint: 'Add the host to withMiddleware((m) => m.trustHosts({ at: [...] })) or fix APP_URL.',
    })
  }
}

/**
 * Answer CORS preflights for CORS paths (only when CORS is on).
 *
 * @example
 * corsPreflightStage(security)
 */
export function corsPreflightStage(security: ResolvedSecurity): KernelStage {
  return async (ctx, next) => corsPreflight(ctx.request, security.cors) ?? next()
}

/**
 * Add CORS and security headers to a response. The response is copied first, because responses
 * built by `Response.json()`, `Response.redirect()` or `fetch()` have immutable headers.
 *
 * @example
 * return decorateResponse(response, ctx, security, 'production')
 */
export function decorateResponse(response: Response, ctx: HttpContext, security: ResolvedSecurity, environment: string): Response {
  const copy = new Response(response.body, response)
  corsHeaders(ctx.request, security.cors, copy.headers)
  applySecurityHeaders(copy.headers, security.headers, { nonce: ctx.nonce, secure: ctx.state.secure, environment })
  return copy
}
