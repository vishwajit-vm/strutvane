/**
 * DESIGN-C.md rule, enforced: components use theme tokens, never literal colours. Every colour
 * lives once, as a CSS variable in `src/styles/tokens.css`, so dark mode and a different accent
 * change everything from one place and the contrast test covers every colour actually used.
 *
 * Fails on: hex colours, colour functions in any case (rgb, hsl, hwb, oklch, oklab, lab, lch,
 * color, color-mix, device-cmyk), any utility ending in a Tailwind palette colour or black/white,
 * arbitrary colour values (`bg-[#fff]`, `bg-[red]`) and the 148 CSS named colours used as values
 * (`backgroundColor: 'red'`, `fill="white"`, `color: red;` in CSS). Allowed: token utilities
 * (`bg-accent`), `var(--token)`, `currentColor`, `transparent`.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src')
/** The one file allowed to define colours. */
const TOKENS = join(SRC, 'styles', 'tokens.css')

const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|mauve|olive|mist|taupe'

/** Every CSS named colour (CSS Color 4), except `transparent` and `currentColor`, which are fine. */
const NAMED = [
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown',
  'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan',
  'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred',
  'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue',
  'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod',
  'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush',
  'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey',
  'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime',
  'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen',
  'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin',
  'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise',
  'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown',
  'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray',
  'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke',
  'yellow', 'yellowgreen',
].join('|')

/** Every hard-coded colour form, each with a friendly name for the failure message. */
const RULES: readonly (readonly [name: string, pattern: RegExp])[] = [
  ['hex colour', /#[0-9a-fA-F]{3,8}\b(?![\w-])/g],
  // Case-insensitive: CSS function names are (`RGB(` is valid CSS).
  ['colour function', /\b(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color|color-mix|device-cmyk)\(/gi],
  // ANY utility ending in a palette colour (`bg-`, `inset-shadow-`, `border-s-`, `drop-shadow-` …):
  // a fixed list of utility names always misses the next one Tailwind adds.
  ['Tailwind palette class', new RegExp(String.raw`(?<![\w-])(?:[\w-]+:)*[a-z][\w-]*-(?:${PALETTE})-\d{2,3}\b`, 'g')],
  ['black/white class', new RegExp(String.raw`(?<![\w-])(?:[\w-]+:)*[a-z][\w-]*-(?:black|white)\b(?!-)`, 'g')],
  ['arbitrary colour value', /-\[(?:color:)?(?:#|rgba?\(|hsla?\(|hwb\(|oklch\(|oklab\(|lab\(|lch\(|color\()/gi],
  ['arbitrary named colour', new RegExp(String.raw`-\[(?:color:)?(?:${NAMED})\]`, 'gi')],
  // A named colour as a whole string value (`color: 'red'`, `fill="white"`), in a border-like
  // shorthand (`1px solid crimson`), or as a CSS declaration value (`color: red;`).
  ['named colour', new RegExp(String.raw`(['"\x60])\s*(?:${NAMED})\s*\1`, 'gi')],
  ['named colour', new RegExp(String.raw`\b(?:solid|dashed|dotted|double|groove|ridge|inset|outset)\s+(?:${NAMED})\b`, 'gi')],
  ['named colour', new RegExp(String.raw`[\w-]:\s*(?:${NAMED})\s*[;}!]`, 'gi')],
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

  it('catches the forms that used to slip past (regression corpus for the rule)', () => {
    const sneaky = [
      `style={{ color: 'red' }}`,
      `style={{ backgroundColor: 'Tomato' }}`,
      `<path fill="white" />`,
      `<circle stroke='rebeccapurple' />`,
      `style={{ border: '1px solid crimson' }}`,
      `className="bg-[red]"`,
      `className="text-[color:tomato]"`,
      `className="bg-[hwb(0_0%_0%)]"`,
      `style={{ background: 'RGB(0 0 0)' }}`,
      `style={{ color: 'hwb(0 0% 0%)' }}`,
      `style={{ color: 'color-mix(in srgb, red 40%, white)' }}`,
      `className="inset-shadow-red-500"`,
      `className="drop-shadow-red-500"`,
      `className="text-shadow-red-500"`,
      `className="border-s-red-500"`,
      `className="inset-ring-red-500"`,
      `className="md:hover:border-e-black"`,
      `.badge { color: red; }`,
      `.badge { border: 1px solid Navy; }`,
    ]
    for (const source of sneaky) expect(findHardCodedColours('x.tsx', source), source).not.toEqual([])
    // Still allowed: tokens, currentColor, transparent, and words that merely contain a colour name.
    expect(findHardCodedColours('ok.tsx', `<div className="border-transparent bg-transparent whitespace-nowrap text-primary" style={{ fill: 'currentColor', color: 'var(--danger)' }} aria-label="Redo" data-tone="danger" />`)).toEqual([])
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
      'arbitrary colour value "-[#"',
      `named colour "'white'"`,
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
