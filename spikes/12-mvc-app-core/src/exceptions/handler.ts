/**
 * The exception handler: Laravel's `withExceptions(...)`. It decides, for any error thrown while
 * handling a request, what to log and what to send.
 *
 * | Error | Logged | Sent |
 * |---|---|---|
 * | `HttpError` (401, 403, 404, 422, 429…) | no | problem+json, or a small HTML page for browsers |
 * | anything else, debug on (local/testing) | yes | the debug page, or problem+json with a `debug` member |
 * | anything else, production | yes, with an error id | a plain 500 naming only the error id |
 */
import { randomUUID } from 'node:crypto'
import type { HttpContext } from '../http/context.ts'
import { HttpError, problemResponse, ResponseError, type Problem } from '../http/problem.ts'
import type { Logger } from '../support/log.ts'
import { buildReport, escapeHtml, renderDebugPage } from './debug-page.ts'

/** A custom renderer; returning `undefined` falls back to the default rendering. */
type Renderer<TError> = (error: TError, ctx: HttpContext) => Response | undefined | Promise<Response | undefined>

/** An error class, for `render()` and `dontReport()`. */
type ErrorClass<TError extends Error> = abstract new (...args: never[]) => TError

/**
 * The object handed to `withExceptions((exceptions) => …)` in `bootstrap/app.ts`.
 *
 * @example
 * .withExceptions((exceptions) => {
 *   exceptions.dontReport(PaymentDeclined)
 *   exceptions.render(PaymentDeclined, (error, ctx) => ctx.json({ declined: true }, 402))
 * })
 */
export class ExceptionsConfig {
  readonly renderers: { readonly type: ErrorClass<Error>; readonly render: Renderer<Error> }[] = []
  readonly quiet: ErrorClass<Error>[] = []
  jsonWhen: (ctx: HttpContext) => boolean = (ctx) => ctx.wantsJson()

  /**
   * Render one error type your own way.
   *
   * @example
   * exceptions.render(PaymentDeclined, (error, ctx) => ctx.json({ declined: error.message }, 402))
   */
  render<TError extends Error>(type: ErrorClass<TError>, render: Renderer<TError>): this {
    // Stored as Renderer<Error>: it is only ever called with an instance of `type` (checked below).
    this.renderers.push({ type, render: render as Renderer<Error> })
    return this
  }

  /**
   * Don't log these errors (they are expected, like a declined payment).
   *
   * @example
   * exceptions.dontReport(PaymentDeclined)
   */
  dontReport(...types: ErrorClass<Error>[]): this {
    this.quiet.push(...types)
    return this
  }

  /**
   * Decide when errors are JSON. Default: `/api/*` paths and requests that accept JSON.
   *
   * @example
   * exceptions.shouldRenderJsonWhen((ctx) => ctx.url.pathname.startsWith('/api/'))
   */
  shouldRenderJsonWhen(predicate: (ctx: HttpContext) => boolean): this {
    this.jsonWhen = predicate
    return this
  }
}

/**
 * How the handler should behave in this environment.
 *
 * @example
 * const options: HandlerOptions = { showDetails: true, basePath: '/srv/blog', environment: 'local', logger }
 */
export interface HandlerOptions {
  /** Debug page, developer hints on 403s, `debug` member on 500s. Only for local/testing + APP_DEBUG. */
  readonly showDetails: boolean
  readonly basePath: string
  readonly environment: string
  readonly logger: Logger
}

/**
 * Renders any error into a response.
 *
 * @example
 * const response = await handler.render(error, ctx)
 */
export class ExceptionHandler {
  readonly #config: ExceptionsConfig
  readonly #options: HandlerOptions

  constructor(config: ExceptionsConfig, options: HandlerOptions) {
    this.#config = config
    this.#options = options
  }

  /**
   * Turn an error into a response, logging it when it is unexpected.
   *
   * @example
   * return await handler.render(new NotFoundError('No post 7.'), ctx)
   */
  async render(error: unknown, ctx: HttpContext): Promise<Response> {
    const custom = await this.#custom(error, ctx)
    if (custom !== undefined) return custom
    if (error instanceof ResponseError) return error.response
    if (error instanceof HttpError) return this.#renderHttpError(error, ctx)
    const errorId = randomUUID()
    this.#report(error, ctx, errorId)
    return this.#options.showDetails ? this.#renderDebug(error, ctx) : this.#renderServerError(ctx, errorId)
  }

  async #custom(error: unknown, ctx: HttpContext): Promise<Response | undefined> {
    for (const { type, render } of this.#config.renderers) {
      if (error instanceof type) return render(error, ctx)
    }
    return undefined
  }

  #renderHttpError(error: HttpError, ctx: HttpContext): Response {
    const problem = error.toProblem(this.#options.showDetails)
    if (this.#config.jsonWhen(ctx)) return problemResponse(problem, error.headers)
    return new Response(simplePage(problem), { status: problem.status, headers: { ...error.headers, 'content-type': 'text/html; charset=utf-8' } })
  }

  #report(error: unknown, ctx: HttpContext, errorId: string): void {
    if (this.#config.quiet.some((type) => error instanceof type)) return
    this.#options.logger.error(error instanceof Error ? error.message : String(error), {
      errorId,
      exception: error instanceof Error ? error.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined,
      method: ctx.method,
      // The route template, not the concrete URL: URLs can carry slugs and tokens.
      route: ctx.route?.uri ?? ctx.url.pathname,
    })
  }

  #renderDebug(error: unknown, ctx: HttpContext): Response {
    const report = buildReport(error, ctx.request, { basePath: this.#options.basePath, route: ctx.route?.name ?? ctx.route?.uri, environment: this.#options.environment })
    if (this.#config.jsonWhen(ctx)) {
      const body = {
        ...serverProblem('See `debug` for the exception (shown because APP_DEBUG=true in a local environment).'),
        debug: { exception: report.exception, message: report.message, at: report.frame === undefined ? undefined : `${report.frame.file}:${report.frame.highlight}`, route: report.route },
      }
      return new Response(JSON.stringify(body), { status: 500, headers: { 'content-type': 'application/problem+json' } })
    }
    const page = renderDebugPage(report)
    return new Response(page.html, { status: 500, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': page.csp } })
  }

  #renderServerError(ctx: HttpContext, errorId: string): Response {
    const problem = serverProblem(`Something went wrong on our side. If it keeps happening, quote this reference: ${errorId}.`)
    if (this.#config.jsonWhen(ctx)) return problemResponse(problem)
    return new Response(simplePage(problem), { status: 500, headers: { 'content-type': 'text/html; charset=utf-8' } })
  }
}

function serverProblem(detail: string): Problem {
  return { type: 'https://strutvane.dev/problems/server_error', title: 'Server error', status: 500, code: 'server_error', detail }
}

/** A minimal, dependency-free HTML error page for browsers (the React app has its own). */
function simplePage(problem: Problem): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${problem.status} ${escapeHtml(problem.title)}</title></head><body style="font:16px system-ui;margin:15vh auto;max-width:36rem"><h1>${problem.status} · ${escapeHtml(problem.title)}</h1><p>${escapeHtml(problem.detail)}</p></body></html>`
}
