/**
 * The exception handler: the Ignition-like debug page (local/testing only), its Markdown twin,
 * redaction, and the plain production responses.
 */
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { client } from '#strutvane/testing'
import { appFrame, parseStack } from '../src/exceptions/code-frame.ts'
import { buildReport, redactUrl, renderDebugPage, renderMarkdown } from '../src/exceptions/debug-page.ts'
import { exampleApp } from './helpers.ts'

const EXAMPLE = join(import.meta.dirname, '..', 'fixtures', 'example-app')

describe('debug mode (APP_DEBUG=true, APP_ENV=testing)', () => {
  it('renders the error page with the throwing line of app code, redacted headers and a copy button', async () => {
    const { app, logger } = await exampleApp()
    const page = await client(app).withHeaders({ authorization: 'Bearer super-secret', cookie: 'strutvane_session=abc' }).get('/_diagnostics/boom?token=xyz&page=2')
    page.assertStatus(500)
    expect(page.headers.get('content-type')).toContain('text/html')
    expect(page.text).toContain('<h1>TypeError</h1>')
    expect(page.text).toContain('Cannot read properties of undefined (reading &quot;title&quot;)')
    expect(page.text).toContain('app/http/controllers/diagnostics.controller.ts:7')
    expect(page.text).toContain('<span class="hl">   7 |     throw new TypeError(')
    expect(page.text).toContain('Copy as Markdown for AI')
    expect(page.text).not.toContain('super-secret')
    expect(page.text).not.toContain('xyz')
    expect(page.text).toContain('token=%5Bredacted%5D&amp;page=2')
    const csp = page.headers.get('content-security-policy') ?? ''
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1]
    expect(nonce).toBeDefined()
    expect(page.text).toContain(`<script nonce="${nonce ?? ''}">`)
    expect(logger.entries).toHaveLength(1)
    expect(logger.entries[0]?.context).toMatchObject({ exception: 'TypeError', method: 'GET', route: '/_diagnostics/boom' })
  })

  it('answers JSON clients with problem+json plus a debug member', async () => {
    const { app } = await exampleApp()
    const response = await client(app).getJson('/_diagnostics/boom')
    response.assertProblem(500, 'server_error').assertJsonPath('debug.exception', 'TypeError').assertJsonPath('debug.at', 'app/http/controllers/diagnostics.controller.ts:7')
  })
})

describe('production (APP_ENV=production): plain errors whatever APP_DEBUG says', () => {
  it('shows only a reference id, logs the details under that id, and warns that APP_DEBUG is ignored', async () => {
    const { app, logger } = await exampleApp({ APP_ENV: 'production', APP_DEBUG: 'true' })
    const page = await client(app).get('/_diagnostics/boom')
    page.assertStatus(500)
    expect(page.text).not.toContain('TypeError')
    expect(page.text).not.toContain('diagnostics.controller')
    const reference = /reference: ([0-9a-f-]{36})/.exec(page.text)?.[1]
    const reported = logger.entries.find((entry) => entry.level === 'error')
    expect(reported?.context['errorId']).toBe(reference)
    expect(logger.entries.some((entry) => entry.level === 'warn' && entry.message.includes('APP_DEBUG=true is ignored'))).toBe(true)
    const json = await client(app).getJson('/_diagnostics/boom')
    json.assertProblem(500, 'server_error')
    expect(json.path('debug')).toBeUndefined()
  })

  it('does not log expected HTTP errors (404, 422…)', async () => {
    const { app, logger } = await exampleApp()
    await client(app).getJson('/api/posts/nope')
    expect(logger.entries).toEqual([])
  })
})

describe('the page builders', () => {
  const request = new Request('http://localhost/x?password=hunter2&q=ok', { headers: { cookie: 'a=b', 'x-api-key': 'k', accept: 'text/html' } })

  it('escape every dynamic value, so an error message cannot inject script', () => {
    const report = buildReport(new Error('<script>alert(1)</script>'), request, { basePath: EXAMPLE, route: '<b>route</b>', environment: 'local' })
    const { html } = renderDebugPage(report)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<b>route</b>')
  })

  it('produce Markdown for an AI assistant, redacted the same way', () => {
    const markdown = renderMarkdown(buildReport(new RangeError('Out of range'), request, { basePath: EXAMPLE, route: 'posts.index', environment: 'local' }))
    expect(markdown.startsWith('# RangeError: Out of range\n')).toBe(true)
    expect(markdown).toContain('- **Route:** posts.index')
    expect(markdown).toContain('- cookie: [redacted]')
    expect(markdown).toContain('- x-api-key: [redacted]')
    expect(markdown).not.toContain('hunter2')
    expect(redactUrl('http://x/reset?signature=s&code=c&name=n')).toBe('http://x/reset?signature=%5Bredacted%5D&code=%5Bredacted%5D&name=n')
  })

  it('only quote files inside the app, never node_modules or other folders', () => {
    const stack = ['Error: x', '    at helper (node:internal/x:1:1)', `    at dep (${join(EXAMPLE, 'node_modules', 'lib', 'a.js')}:3:4)`, '    at elsewhere (C:\\Windows\\system32\\evil.js:1:1)', `    at PostController.show (${join(EXAMPLE, 'app', 'x.ts')}:12:5)`].join('\n')
    const frames = parseStack(stack)
    expect(frames).toHaveLength(3)
    expect(appFrame(frames, EXAMPLE)?.functionName).toBe('PostController.show')
  })
})
