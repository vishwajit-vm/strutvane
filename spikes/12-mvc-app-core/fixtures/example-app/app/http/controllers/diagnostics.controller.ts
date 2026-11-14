import { Controller, type HttpContext } from '#strutvane/http'

/** Exists so the tests can show the developer error page for a real exception from app code. */
export class DiagnosticsController extends Controller {
  /** Always throws, like a typical bug. */
  boom(_ctx: HttpContext): Response {
    throw new TypeError('Cannot read properties of undefined (reading "title")')
  }
}
