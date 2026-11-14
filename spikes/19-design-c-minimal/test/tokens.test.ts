/**
 * DESIGN-C.md rule, enforced: components use theme tokens, never literal colours. Every colour
 * lives once, as a CSS variable in `src/styles/tokens.css`, so dark mode and a different accent
 * change everything from one place and the contrast test covers every colour actually used.
 *
 * Fails on: hex colours, colour functions (rgb/hsl/oklch/…), Tailwind palette classes
 * (`bg-blue-500`, `text-white`), arbitrary colour values (`bg-[#fff]`) and CSS named colours in
 * style props. Allowed: token utilities (`bg-accent`), `var(--token)`, `currentColor`.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src')
/** The one file allowed to define colours. */
const TOKENS = join(SRC, 'styles', 'tokens.css')

const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const UTILITIES = 'bg|text|border|border-[xytrbl]|fill|stroke|ring|ring-offset|outline|from|via|to|decoration|accent|caret|divide|shadow|placeholder'

const RULES: readonly (readonly [name: string, pattern: RegExp])[] = [
  ['hex colour', /#[0-9a-fA-F]{3,8}\b(?![\w-])/g],
  ['colour function', /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\(/g],
  ['Tailwind palette class', new RegExp(String.raw`(?<![\w-])(?:[\w-]+:)*(?:${UTILITIES})-(?:${PALETTE})-\d{2,3}\b`, 'g')],
  ['black/white class', new RegExp(String.raw`(?<![\w-])(?:[\w-]+:)*(?:${UTILITIES})-(?:black|white)\b`, 'g')],
  ['arbitrary colour value', /(?:bg|text|border|fill|stroke|ring|shadow)-\[(?:#|rgb|hsl|oklch)/g],
  ['named colour in a style', /\b(?:color|background|fill|stroke|stopColor|borderColor):\s*['"](?:white|black|red|blue|green|gray|grey)['"]/g],
]

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(tsx?|css)$/.test(entry.name) && path !== TOKENS ? [path] : []
  })
}

/** Every hard-coded colour in one source text, as `file:line: rule "match"` lines. */
export function findHardCodedColours(file: string, source: string): string[] {
  const found: string[] = []
  for (const [name, pattern] of RULES) {
    for (const match of source.matchAll(pattern)) {
      const line = source.slice(0, match.index).split('\n').length
      found.push(`${file}:${line}: ${name} "${match[0]}"`)
    }
  }
  return found
}

describe('no hard-coded colours outside tokens.css', () => {
  it('every colour in src/ comes from a theme token', () => {
    const files = sourceFiles(SRC)
    expect(files.length).toBeGreaterThan(50)
    const violations = files.flatMap((file) => findHardCodedColours(relative(process.cwd(), file), readFileSync(file, 'utf8')))
    expect(violations).toEqual([])
  })

  it('the rule itself catches every kind of literal colour', () => {
    const bad = `<div className="bg-blue-500 hover:text-white dark:bg-black/50 bg-[#fff]" style={{ color: '#3366ff', background: 'rgb(0 0 0)', fill: 'oklch(0.5 0.1 200)', stopColor: 'white' }} />`
    expect(findHardCodedColours('x.tsx', bad).map((line) => line.slice(line.indexOf(': ') + 2))).toEqual([
      'hex colour "#fff"',
      'hex colour "#3366ff"',
      'colour function "rgb("',
      'colour function "oklch("',
      'Tailwind palette class "bg-blue-500"',
      'black/white class "hover:text-white"',
      'black/white class "dark:bg-black"',
      'arbitrary colour value "bg-[#"',
      `named colour in a style "stopColor: 'white'"`,
    ])
    expect(findHardCodedColours('ok.tsx', `<div className="bg-accent text-fg-muted border-border" style={{ color: 'var(--fg)', stroke: 'currentColor' }} />`)).toEqual([])
  })

  it('every scale in app.css (type, radius, fonts, density, shadows) points at a tokens.css variable', () => {
    const css = readFileSync(join(SRC, 'styles', 'app.css'), 'utf8')
    const literal = [...css.matchAll(/^\s*--(text|radius|font|spacing|shadow|ease)-[\w-]+:\s*([^;]+);/gm)]
      .filter((match) => match[2] !== 'initial' && !(match[2] ?? '').startsWith('var('))
      .map((match) => match[0].trim())
    expect(literal).toEqual([])
    const tokens = readFileSync(TOKENS, 'utf8')
    for (const name of ['--font-ui', '--size-sm', '--shape-md', '--control-md', '--row-default', '--sidebar-width', '--shadow-pop', '--chart-1']) expect(tokens).toContain(`${name}:`)
  })

  it('Tailwind’s default palette is switched off, so a stray palette class cannot even render', () => {
    const css = readFileSync(join(SRC, 'styles', 'app.css'), 'utf8')
    expect(css).toMatch(/--color-\*:\s*initial;/)
  })
})
