/**
 * View helpers for server-rendered pages: Laravel's `@csrf` / `csrf_field()` and the
 * `<meta name="csrf-token">` tag that JavaScript reads to send `X-CSRF-TOKEN`.
 *
 * The React UI and the generated API client send `X-XSRF-TOKEN` themselves; these are for plain
 * HTML forms and server pages.
 */
import { escapeHtml } from '../exceptions/debug-page.ts'
import type { HttpContext } from './context.ts'
import { csrfTokenFor } from './csrf.ts'

/**
 * A hidden `_token` input for a plain HTML form.
 *
 * @example
 * ctx.html(`<form method="post" action="/posts">${csrf_field(ctx)}<button>Save</button></form>`)
 */
export function csrf_field(ctx: HttpContext): string {
  return `<input type="hidden" name="_token" value="${escapeHtml(csrfTokenFor(ctx))}">`
}

/**
 * The `<meta name="csrf-token">` tag for a page's `<head>`.
 *
 * @example
 * ctx.html(`<head>${csrf_meta(ctx)}</head>`)
 */
export function csrf_meta(ctx: HttpContext): string {
  return `<meta name="csrf-token" content="${escapeHtml(csrfTokenFor(ctx))}">`
}
