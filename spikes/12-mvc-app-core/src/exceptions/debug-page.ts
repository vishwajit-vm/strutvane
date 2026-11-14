/**
 * The developer error page (Ignition-like) and its "Copy as Markdown for AI" twin.
 *
 * Shown only when `APP_DEBUG=true` *and* `APP_ENV` is `local` or `testing`. Even then it is
 * redacted: credentials in headers and query strings are masked, the request body is never
 * shown, and only the app's own source files are quoted (security review F-19).
 */
import { randomBytes } from 'node:crypto'
import { appFrame, codeFrame, parseStack, type CodeFrame, type StackFrame } from './code-frame.ts'

/**
 * Everything the page shows, gathered once so HTML and Markdown can't disagree.
 *
 * @example
 * const report = buildReport(error, request, { basePath, route: 'posts.show', environment: 'local' })
 */
export interface ErrorReport {
  readonly exception: string
  readonly message: string
  readonly frame: CodeFrame | undefined
  readonly frames: readonly StackFrame[]
  readonly request: { readonly method: string; readonly url: string; readonly headers: readonly (readonly [string, string])[] }
  readonly route: string | undefined
  readonly environment: string
  readonly node: string
}

const SECRET_HEADERS: ReadonlySet<string> = new Set(['authorization', 'proxy-authorization', 'cookie', 'set-cookie', 'x-csrf-token', 'x-xsrf-token', 'x-api-key'])
const SECRET_QUERY = /token|password|secret|key|signature|code/i
const REDACTED = '[redacted]'

/**
 * Gather the report for an error.
 *
 * @example
 * buildReport(new Error('boom'), request, { basePath: '/srv/blog', route: undefined, environment: 'local' })
 */
export function buildReport(error: unknown, request: Request, context: { basePath: string; route: string | undefined; environment: string }): ErrorReport {
  const exception = error instanceof Error ? error.name : typeof error
  const message = error instanceof Error ? error.message : String(error)
  const frames = parseStack(error instanceof Error ? (error.stack ?? '') : '')
  const first = appFrame(frames, context.basePath)
  return {
    exception,
    message,
    frame: first === undefined ? undefined : codeFrame(first, context.basePath),
    frames: frames.slice(0, 15),
    request: { method: request.method, url: redactUrl(request.url), headers: redactHeaders(request.headers) },
    route: context.route,
    environment: context.environment,
    node: process.version,
  }
}

/**
 * Mask secret query parameters.
 *
 * @example
 * redactUrl('http://x/reset?token=abc&page=2') // 'http://x/reset?token=%5Bredacted%5D&page=2'
 */
export function redactUrl(raw: string): string {
  const url = new URL(raw)
  for (const key of [...url.searchParams.keys()]) if (SECRET_QUERY.test(key)) url.searchParams.set(key, REDACTED)
  return url.toString()
}

/**
 * Headers with credentials masked.
 *
 * @example
 * redactHeaders(new Headers({ authorization: 'Bearer abc' })) // [['authorization', '[redacted]']]
 */
export function redactHeaders(headers: Headers): [string, string][] {
  return [...headers.entries()].map(([name, value]) => [name, SECRET_HEADERS.has(name.toLowerCase()) ? REDACTED : value])
}

/**
 * The report as Markdown, ready to paste into an AI assistant or an issue.
 *
 * @example
 * renderMarkdown(report).startsWith('# TypeError') // true
 */
export function renderMarkdown(report: ErrorReport): string {
  const lines = [`# ${report.exception}: ${report.message}`, '', `- **Request:** ${report.request.method} ${report.request.url}`, `- **Route:** ${report.route ?? '(none)'}`, `- **Environment:** ${report.environment}, Node ${report.node}`, '']
  if (report.frame !== undefined) {
    lines.push(`## Where: \`${report.frame.file}:${report.frame.highlight}\``, '', '```ts')
    for (const line of report.frame.lines) lines.push(`${line.number === report.frame.highlight ? '>' : ' '} ${String(line.number).padStart(4)} | ${line.text}`)
    lines.push('```', '')
  }
  lines.push('## Stack', '')
  for (const frame of report.frames) lines.push(`- ${frame.functionName} (${frame.file}:${frame.line}:${frame.column})`)
  lines.push('', '## Request headers (credentials redacted)', '')
  for (const [name, value] of report.request.headers) lines.push(`- ${name}: ${value}`)
  return `${lines.join('\n')}\n`
}

/**
 * The HTML page. Every dynamic value is escaped; the only script is the copy button, allowed by
 * a per-response CSP nonce, so an error message containing `<script>` is inert.
 *
 * @example
 * const { html, nonce } = renderDebugPage(report)
 */
export function renderDebugPage(report: ErrorReport): { readonly html: string; readonly csp: string } {
  const nonce = randomBytes(16).toString('base64')
  const frame = report.frame === undefined ? '<p class="muted">No source from your app is in this stack.</p>' : renderFrame(report.frame)
  const headers = report.request.headers.map(([name, value]) => `<tr><th>${escapeHtml(name)}</th><td>${escapeHtml(value)}</td></tr>`).join('')
  const stack = report.frames.map((entry) => `<li><code>${escapeHtml(entry.functionName)}</code> <span class="muted">${escapeHtml(entry.file)}:${entry.line}</span></li>`).join('')
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(report.exception)}: ${escapeHtml(report.message)}</title>
<style>
body{font:15px/1.5 system-ui,sans-serif;margin:0;background:#f6f7f9;color:#1d2433}
header{background:#b42318;color:#fff;padding:24px 32px}
header h1{margin:0;font-size:22px} header p{margin:6px 0 0;opacity:.9}
main{padding:24px 32px;max-width:1100px}
section{background:#fff;border:1px solid #e3e6ec;border-radius:8px;margin:0 0 20px;padding:16px 20px}
h2{font-size:15px;margin:0 0 12px}
pre{margin:0;overflow:auto;font:13px/1.6 ui-monospace,monospace}
.hl{background:#fde8e8;display:block}
.muted{color:#667085}
table{border-collapse:collapse;width:100%} th,td{text-align:left;padding:4px 8px;border-top:1px solid #eef0f3;font:13px ui-monospace,monospace;vertical-align:top} th{width:30%}
button{font:inherit;padding:8px 14px;border-radius:6px;border:1px solid #1d2433;background:#1d2433;color:#fff;cursor:pointer}
</style></head><body>
<header><h1>${escapeHtml(report.exception)}</h1><p>${escapeHtml(report.message)}</p></header>
<main>
<section><button id="copy" type="button">Copy as Markdown for AI</button> <span id="copied" class="muted"></span></section>
<section><h2>Where it happened</h2>${frame}</section>
<section><h2>Request</h2><p><code>${escapeHtml(report.request.method)} ${escapeHtml(report.request.url)}</code> → route <code>${escapeHtml(report.route ?? '(none)')}</code></p><table>${headers}</table></section>
<section><h2>Stack</h2><ol>${stack}</ol></section>
<section class="muted">${escapeHtml(report.environment)} · Node ${escapeHtml(report.node)} · This page is shown because APP_DEBUG=true in a local environment. Production shows a plain error.</section>
</main>
<script type="text/plain" id="markdown">${escapeHtml(renderMarkdown(report))}</script>
<script nonce="${nonce}">
document.getElementById('copy').addEventListener('click', function () {
  var text = document.getElementById('markdown').textContent;
  navigator.clipboard.writeText(text).then(function () { document.getElementById('copied').textContent = 'Copied.'; });
});
</script>
</body></html>`
  return { html, csp: `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` }
}

function renderFrame(frame: CodeFrame): string {
  const lines = frame.lines.map((line) => {
    const text = `${String(line.number).padStart(4)} | ${escapeHtml(line.text)}`
    return line.number === frame.highlight ? `<span class="hl">${text}</span>` : `${text}\n`
  })
  return `<p><code>${escapeHtml(frame.file)}:${frame.highlight}</code></p><pre>${lines.join('')}</pre>`
}

/**
 * Escape text for HTML element and attribute content.
 *
 * @example
 * escapeHtml('<script>') // '&lt;script&gt;'
 */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
