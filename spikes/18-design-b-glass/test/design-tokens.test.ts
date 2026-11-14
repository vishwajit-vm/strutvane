/**
 * DESIGN-B.md rules, enforced:
 *   1. No hard-coded colours in components: every colour is a token from src/styles/tokens.css.
 *   2. Tailwind's built-in palette is removed, so palette classes cannot even compile to CSS.
 *   3. The glass fallbacks exist: reduced transparency, the in-app toggle and missing
 *      backdrop-filter support all swap glass for solid twins and drop the blur; reduced motion
 *      zeroes every duration.
 *   4. Blur layers stay few: only the chrome and overlay utilities blur; cards do not.
 *   5. Every token has a value in both themes (light/dark parity).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { declarations, TOKENS_CSS } from './color-math.ts'

const SRC = join(process.cwd(), 'src')
const APP_CSS = readFileSync(join(SRC, 'styles', 'app.css'), 'utf8')

const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const UTILITIES = 'bg|text|border|border-[xytrbl]|fill|stroke|ring|ring-offset|outline|from|via|to|decoration|accent|caret|divide|shadow|placeholder'

const RULES: readonly (readonly [name: string, pattern: RegExp])[] = [
  ['hex colour', /#[0-9a-fA-F]{3,8}\b(?![\w-])/g],
  ['colour function', /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(/g],
  ['Tailwind palette class', new RegExp(String.raw`(?<![\w-])(?:[\w-]+:)*(?:${UTILITIES})-(?:${PALETTE})-\d{2,3}\b`, 'g')],
  ['black/white class', new RegExp(String.raw`(?<![\w-])(?:[\w-]+:)*(?:${UTILITIES})-(?:black|white)\b`, 'g')],
  ['arbitrary colour value', /(?:bg|text|border|fill|stroke|ring)-\[(?:#|rgb|hsl|oklch)/g],
  ['named colour in style/attribute', /(?:fill|stroke|stopColor|color|background)[=:]\s*\{?['"](?:white|black|red|blue|green|gray|grey)['"]/g],
]

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(tsx?|jsx?)$/.test(entry.name) ? [path] : []
  })
}

/** Every hard-coded colour in one source text, as `file:line: rule "match"`. */
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

describe('no hard-coded colours', () => {
  it('every colour in src/**/*.tsx comes from a token', () => {
    const files = sourceFiles(SRC)
    expect(files.length).toBeGreaterThan(40)
    expect(files.flatMap((file) => findHardCodedColours(relative(process.cwd(), file), readFileSync(file, 'utf8')))).toEqual([])
  })

  it('the rule itself catches every kind of literal (it can fail)', () => {
    const bad = `<div className="bg-red-500 hover:text-white dark:bg-black/50 bg-[#fff]" style={{ color: '#3366ff', background: 'rgb(0 0 0)' }}><stop stopColor="white" /></div>`
    expect(findHardCodedColours('x.tsx', bad).map((line) => line.split(': ')[1])).toEqual([
      'hex colour "#fff"',
      'hex colour "#3366ff"',
      'colour function "rgb("',
      'Tailwind palette class "bg-red-500"',
      'black/white class "hover:text-white"',
      'black/white class "dark:bg-black"',
      'arbitrary colour value "bg-[#"',
      'named colour in style/attribute "stopColor="white""',
    ])
    expect(findHardCodedColours('ok.tsx', `<div className="bg-primary text-fg-muted" style={{ color: 'var(--foreground)' }} />`)).toEqual([])
  })

  it("Tailwind's default palette is removed (`--color-*: initial`)", () => {
    expect(APP_CSS).toMatch(/@theme inline \{\s*--color-\*: initial;/)
  })
})

describe('glass fallbacks and performance', () => {
  const block = (marker: string): string => {
    const start = TOKENS_CSS.indexOf(marker)
    expect(start, `missing ${marker}`).toBeGreaterThan(-1)
    return TOKENS_CSS.slice(start, TOKENS_CSS.indexOf('\n}', start))
  }
  const SOLID_SWAP = ['--glass-chrome: var(--glass-chrome-solid)', '--glass-card: var(--glass-card-solid)', '--glass-overlay: var(--glass-overlay-solid)']

  it('prefers-reduced-transparency swaps glass for solid and drops the blur', () => {
    const css = block('@media (prefers-reduced-transparency: reduce)')
    for (const line of [...SOLID_SWAP, '--blur-chrome: 0px', '--blur-overlay: 0px']) expect(css).toContain(line)
  })

  it('the in-app "Solid surfaces" toggle does the same', () => {
    const css = block("html[data-transparency='reduced']")
    for (const line of [...SOLID_SWAP, '--blur-chrome: 0px']) expect(css).toContain(line)
  })

  it('browsers without backdrop-filter get solid surfaces', () => {
    const css = block('@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))')
    for (const line of SOLID_SWAP) expect(css).toContain(line)
  })

  it('reduced motion zeroes every duration token', () => {
    const css = block('@media (prefers-reduced-motion: reduce)')
    for (const token of ['--duration-fast', '--duration-base', '--duration-slow']) expect(css).toContain(`${token}: 0ms`)
  })

  it('only chrome and overlays blur; cards and reading surfaces never do', () => {
    const utility = (name: string): string => {
      const start = APP_CSS.indexOf(`@utility ${name} {`)
      return APP_CSS.slice(start, APP_CSS.indexOf('}', start))
    }
    expect(utility('glass-chrome')).toContain('backdrop-filter')
    expect(utility('glass-overlay')).toContain('backdrop-filter')
    expect(utility('glass-card')).not.toContain('backdrop-filter')
    expect(utility('surface')).not.toContain('backdrop-filter')
    // And components do not sneak blur in themselves.
    const sneaky = sourceFiles(SRC).filter((file) => /backdrop-blur-(?!none)/.test(readFileSync(file, 'utf8')))
    expect(sneaky).toEqual([])
  })
})

describe('light/dark parity', () => {
  it('every colour token the light theme defines is redefined for dark', () => {
    const light = declarations(TOKENS_CSS, ':root')
    const dark = declarations(TOKENS_CSS, '.dark')
    const colours = [...light.entries()].filter(([name, value]) => value.startsWith('oklch(') && !name.endsWith('-solid') && !['primary', 'primary-2', 'primary-foreground', 'danger-foreground'].includes(name))
    const missing = colours.map(([name]) => name).filter((name) => !dark.has(name))
    expect(missing).toEqual([])
  })
})
