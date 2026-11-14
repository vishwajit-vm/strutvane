/**
 * DESIGN.md §2 rule, enforced: components use theme tokens, never literal colours. Every colour
 * lives once, as a CSS variable in `src/app/styles.css`, so the accent hue and dark mode can
 * change everything from one place and the contrast test covers every colour actually used.
 *
 * Fails on: hex colours, rgb/rgba/hsl/hsla/oklch/oklab/lab/lch/color() functions, Tailwind's
 * built-in palette classes (`bg-red-500`, `text-white`, `bg-black/50`), and arbitrary colour
 * values (`bg-[#fff]`). Allowed: token utilities (`bg-primary`), `var(--token)`, `currentColor`.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const APP = join(process.cwd(), 'src', 'app')

const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const UTILITIES = 'bg|text|border|border-[xytrbl]|fill|stroke|ring|ring-offset|outline|from|via|to|decoration|accent|caret|divide|shadow|placeholder'

/** What counts as a hard-coded colour, each with a friendly name for the failure message. */
const RULES: readonly (readonly [name: string, pattern: RegExp])[] = [
  ['hex colour', /#[0-9a-fA-F]{3,8}\b(?![\w-])/g],
  ['colour function', /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(/g],
  // String.raw keeps the regex backslashes (`\w`, `\b`) intact inside the template.
  ['Tailwind palette class', new RegExp(String.raw`(?<![\w-])(?:[\w-]+:)*(?:${UTILITIES})-(?:${PALETTE})-\d{2,3}\b`, 'g')],
  ['black/white class', new RegExp(String.raw`(?<![\w-])(?:[\w-]+:)*(?:${UTILITIES})-(?:black|white)\b`, 'g')],
  ['arbitrary colour value', /(?:bg|text|border|fill|stroke|ring)-\[(?:#|rgb|hsl|oklch)/g],
]

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(tsx?|jsx?)$/.test(entry.name) ? [path] : []
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

describe('no hard-coded colours in components', () => {
  it('every colour in src/app comes from a theme token', () => {
    const files = sourceFiles(APP)
    expect(files.length).toBeGreaterThan(30)
    const violations = files.flatMap((file) => findHardCodedColours(relative(process.cwd(), file), readFileSync(file, 'utf8')))
    expect(violations).toEqual([])
  })

  it('catches every kind of literal colour (the rule itself is tested)', () => {
    const bad = `<div className="bg-red-500 hover:text-white dark:bg-black/50 bg-[#fff]" style={{ color: '#3366ff', background: 'rgb(0 0 0)', fill: 'oklch(0.5 0.1 200)' }} />`
    expect(findHardCodedColours('x.tsx', bad).map((line) => line.split(': ')[1])).toEqual([
      'hex colour "#fff"',
      'hex colour "#3366ff"',
      'colour function "rgb("',
      'colour function "oklch("',
      'Tailwind palette class "bg-red-500"',
      'black/white class "hover:text-white"',
      'black/white class "dark:bg-black"',
      'arbitrary colour value "bg-[#"',
    ])
    expect(findHardCodedColours('ok.tsx', `<div className="bg-primary text-muted-foreground fill-chart-1" style={{ color: 'var(--foreground)', stroke: 'currentColor' }} />`)).toEqual([])
  })
})
