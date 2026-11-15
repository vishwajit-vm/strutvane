/**
 * Build-time Content-Security-Policy for the inline theme script (CONSISTENCY #119).
 *
 * `index.html` has one small inline script that applies the saved theme before the first paint (so
 * dark mode never flashes white). A strict CSP (blueprint §5.2) forbids inline scripts unless each
 * one is allowed by its hash, so the build computes the SHA-256 of every inline script in the final
 * HTML and writes the policy into it. Computed, never hand-copied: editing the script changes the
 * hash in the same build, and a stale hash cannot ship.
 *
 * The server can send the same policy as a header; `inlineScriptHashes` is what it needs.
 *
 * @module
 */
import { createHash } from 'node:crypto'
import type { Plugin } from 'vite'

/** Inline `<script>` bodies (no `src`), exactly as the browser hashes them. */
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi

/**
 * The CSP source expressions (`'sha256-…'`) for every inline script in `html`.
 *
 * @example
 * inlineScriptHashes('<script>alert(1)</script>') // ["'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI='"]
 */
export function inlineScriptHashes(html: string): string[] {
  return [...html.matchAll(INLINE_SCRIPT)].map((match) => `'sha256-${createHash('sha256').update(match[1] ?? '', 'utf8').digest('base64')}'`)
}

/** The policy for `html`: scripts only from this origin or the hashed inline ones. */
export function contentSecurityPolicy(html: string): string {
  return [`script-src 'self' ${inlineScriptHashes(html).join(' ')}`.trim(), "object-src 'none'", "base-uri 'self'"].join('; ')
}

/** `html` with the policy as the first element of `<head>` (it must precede every script). */
export function withCspMeta(html: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(html)}" />`
  return html.replace(/<head>/i, `<head>\n    ${meta}`)
}

/**
 * The Vite plugin: on `build` only (the dev server injects its own inline scripts for hot reload),
 * after every other HTML transform, so the hashes cover the final file.
 */
export function cspPlugin(): Plugin {
  return {
    name: 'strutvane-csp-hash',
    apply: 'build',
    transformIndexHtml: { order: 'post', handler: withCspMeta },
  }
}
