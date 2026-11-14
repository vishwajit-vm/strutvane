import { ForbiddenError, type HttpContext, type Middleware, type Next } from '#strutvane/http'

/** The `admin` middleware: only admins pass. Registered as an alias in bootstrap/app.ts. */
export class EnsureAdmin implements Middleware {
  async handle(ctx: HttpContext, next: Next): Promise<Response> {
    if (ctx.requireUser().is_admin) return next()
    throw new ForbiddenError('This area is for administrators.')
  }
}
