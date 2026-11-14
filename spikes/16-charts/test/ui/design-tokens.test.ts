/**
 * Charts must be re-skinnable by tokens alone (DESIGN.md §2: "Tokens, never literals"). No source
 * file outside `styles.css` may contain a colour literal or a Tailwind palette class, so whichever
 * visual direction is chosen re-themes every chart by changing CSS variables only.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOTS = ['src/ui', 'src/demo']
const LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\(|\b(?:bg|text|fill|stroke|border|ring|outline)-(?:red|green|blue|gray|slate|zinc|neutral|stone|amber|yellow|lime|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|orange|white|black)\b/

function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

describe('design tokens only', () => {
  it('no colour literals or palette classes in chart and demo code', () => {
    const offenders = ROOTS.flatMap((root) => sources(join(process.cwd(), root))).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, index) => (LITERAL.test(line) ? [`${file}:${index + 1}: ${line.trim()}`] : [])),
    )
    expect(offenders).toEqual([])
  })

  it('every series colour is a CSS variable defined for light and dark', () => {
    const css = readFileSync(join(process.cwd(), 'src/ui/styles.css'), 'utf8')
    for (const token of ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--chart-6', '--chart-other']) {
      expect(css.split(`${token}:`).length - 1, token).toBe(2)
    }
  })
})
