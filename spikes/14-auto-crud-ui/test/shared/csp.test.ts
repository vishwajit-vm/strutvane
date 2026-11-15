/**
 * CONSISTENCY #119: the inline theme script is allowed by a CSP hash computed at build time, and
 * nothing injects a `<style>` element without a nonce.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contentSecurityPolicy, inlineScriptHashes, withCspMeta } from '../../scripts/csp.ts'

const ROOT = process.cwd()
const INDEX = readFileSync(join(ROOT, 'index.html'), 'utf8')

/** The inline script body, found independently of the plugin's own pattern. */
function themeScriptBody(html: string): string {
  const open = html.indexOf('<script>')
  return html.slice(open + '<script>'.length, html.indexOf('</script>', open))
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(tsx?|jsx?)$/.test(entry.name) ? [path] : []
  })
}

describe('CSP for the inline theme script', () => {
  it('hashes exactly the script the browser will run, and only inline ones', () => {
    const expected = `'sha256-${createHash('sha256').update(themeScriptBody(INDEX), 'utf8').digest('base64')}'`
    expect(inlineScriptHashes(INDEX)).toEqual([expected])
    // A module script with src is covered by 'self', never hashed.
    expect(inlineScriptHashes('<script type="module" src="/x.js"></script>')).toEqual([])
  })

  it('the policy allows self and the hash, never unsafe-inline, and leads the <head>', () => {
    const html = withCspMeta(INDEX)
    const policy = contentSecurityPolicy(INDEX)
    expect(policy).toContain("script-src 'self' 'sha256-")
    expect(policy).toContain("object-src 'none'")
    expect(policy).not.toContain('unsafe-inline')
    const head = html.slice(html.indexOf('<head>'))
    expect(head.indexOf('Content-Security-Policy')).toBeLessThan(head.indexOf('<script'))
  })

  it('editing the script changes the hash in the same build (no stale, hand-copied hash)', () => {
    const edited = INDEX.replace('<script>', '<script>/* edited */')
    expect(inlineScriptHashes(edited)).not.toEqual(inlineScriptHashes(INDEX))
  })

  it('the build registers the plugin', () => {
    expect(readFileSync(join(ROOT, 'vite.config.ts'), 'utf8')).toMatch(/plugins:\s*\[[^\]]*cspPlugin\(\)/)
  })

  it('nothing injects a <style> element without a nonce prop', () => {
    const offenders = sourceFiles(join(ROOT, 'src')).filter((file) => {
      const text = readFileSync(file, 'utf8')
      const injects = /<style[\s>]|createElement\(\s*['"]style['"]\s*\)/.test(text)
      return injects && !/\bnonce\b/.test(text)
    })
    expect(offenders).toEqual([])
  })
})
