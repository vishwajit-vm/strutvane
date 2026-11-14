import { config } from '#strutvane/foundation'
import { Controller, type HttpContext } from '#strutvane/http'

/**
 * The web side is a React app (resources/ui), so web routes return its HTML shell and React takes
 * over in the browser. Server-side view templates (Laravel's Blade) are out of scope by design.
 */
export class SpaController extends Controller {
  /** Any page of the React app. */
  show(ctx: HttpContext): Response {
    // The app name goes into HTML, so strip the characters that could break out of the title.
    const title = config('app.name').replace(/[<>&"]/g, '')
    return ctx.html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><script type="module" src="/build/app.js"></script></head><body><div id="root"></div></body></html>`)
  }
}
