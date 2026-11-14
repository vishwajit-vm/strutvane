/**
 * WCAG AA contrast for every text/background pair the design uses, in both themes, computed from
 * `src/styles.css` itself (so the test can never drift from the real palette).
 *
 * Why not axe: jsdom has no layout or computed colours, so axe cannot measure contrast there. The
 * palette is plain OKLCH, so the maths is exact: OKLCH → OKLab → linear sRGB → WCAG luminance.
 * The accent hue is configurable (`--brand-hue`), so accent pairs are also checked for every hue
 * in 15° steps: any brand colour a team picks stays readable.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const CSS = readFileSync(join(process.cwd(), 'src', 'styles.css'), 'utf8')

type Oklch = readonly [l: number, c: number, h: number]

/** The custom properties declared in one top-level block (`:root {` or `.dark {`). */
function tokens(selector: ':root' | '.dark'): Map<string, string> {
  const start = CSS.indexOf(`\n${selector} {`)
  const block = CSS.slice(start, CSS.indexOf('\n}', start))
  return new Map([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [match[1] ?? '', (match[2] ?? '').trim()]))
}

/** Resolve a token to OKLCH numbers, following `var(--x)` aliases and substituting the hue. */
function resolve(name: string, theme: Map<string, string>, base: Map<string, string>, hue: number): Oklch {
  const raw = theme.get(name) ?? base.get(name)
  if (raw === undefined) throw new Error(`no token --${name}`)
  const alias = /^var\(--([\w-]+)\)$/.exec(raw)
  if (alias?.[1] !== undefined) return resolve(alias[1], theme, base, hue)
  const match = /^oklch\(([\d.]+) ([\d.]+) (.+)\)$/.exec(raw)
  if (match === null) throw new Error(`--${name} is not an opaque oklch(): ${raw}`)
  const hueText = (match[3] ?? '0').replaceAll('var(--brand-hue)', String(hue))
  const offset = /calc\((\d+) \+ (\d+)\)/.exec(hueText)
  const h = offset === null ? Number(hueText) : Number(offset[1]) + Number(offset[2])
  return [Number(match[1]), Number(match[2]), h]
}

/** WCAG relative luminance of an OKLCH colour, clamped into the sRGB gamut. */
export function luminance([l, c, h]: Oklch): number {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const lp = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const mp = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const sp = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const clamp = (value: number): number => Math.min(1, Math.max(0, value))
  const red = clamp(4.0767416621 * lp - 3.3077115913 * mp + 0.2309699292 * sp)
  const green = clamp(-1.2684380046 * lp + 2.6097574011 * mp - 0.3413193965 * sp)
  const blue = clamp(-0.0041960863 * lp - 0.7034186147 * mp + 1.707614701 * sp)
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrast(one: Oklch, two: Oklch): number {
  const [light, dark] = [luminance(one), luminance(two)].sort((x, y) => y - x)
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05)
}

/** Foreground/background pairs actually used in the UI. 4.5:1 for text, 3:1 for UI parts. */
const PAIRS: readonly (readonly [text: string, background: string, minimum: number])[] = [
  ['foreground', 'background', 4.5],
  ['foreground', 'card', 4.5],
  ['foreground', 'muted', 4.5],
  ['foreground', 'subtle', 4.5],
  ['foreground', 'popover', 4.5],
  ['muted-foreground', 'background', 4.5],
  ['muted-foreground', 'card', 4.5],
  ['muted-foreground', 'muted', 4.5],
  ['muted-foreground', 'popover', 4.5],
  ['primary-foreground', 'primary', 4.5],
  ['primary-foreground', 'primary-2', 4.5],
  ['primary-soft-foreground', 'primary-soft', 4.5],
  ['primary-soft-foreground', 'card', 4.5],
  ['primary-soft-foreground', 'background', 4.5],
  ['primary-soft-foreground', 'popover', 4.5],
  ['secondary-foreground', 'secondary', 4.5],
  ['success', 'success-soft', 4.5],
  ['success', 'card', 4.5],
  ['warning', 'warning-soft', 4.5],
  ['warning', 'card', 4.5],
  ['danger', 'danger-soft', 4.5],
  ['danger', 'card', 4.5],
  ['danger-solid-foreground', 'danger-solid', 4.5],
  ['info', 'info-soft', 4.5],
  ['info', 'card', 4.5],
  ['sidebar-foreground', 'sidebar', 4.5],
  ['sidebar-muted', 'sidebar', 4.5],
  ['ring', 'card', 3],
  ['ring', 'background', 3],
  ['input', 'card', 3],
  ['chart-1', 'card', 3],
]

const ROOT = tokens(':root')
const DARK = tokens('.dark')
const CONFIGURED_HUE = Number(ROOT.get('brand-hue'))

describe.each([
  ['light', ROOT],
  ['dark', DARK],
] as const)('%s theme', (_name, theme) => {
  it(`meets WCAG AA for every pair with the configured accent (hue ${CONFIGURED_HUE})`, () => {
    const failures = PAIRS.flatMap(([text, background, minimum]) => {
      const ratio = contrast(resolve(text, theme, ROOT, CONFIGURED_HUE), resolve(background, theme, ROOT, CONFIGURED_HUE))
      return ratio >= minimum ? [] : [`${text} on ${background}: ${ratio.toFixed(2)} < ${minimum}`]
    })
    expect(failures).toEqual([])
  })

  it('stays AA for any accent hue a team configures (0–345°, 15° steps)', () => {
    const failures: string[] = []
    for (let hue = 0; hue < 360; hue += 15) {
      for (const [text, background, minimum] of PAIRS) {
        const ratio = contrast(resolve(text, theme, ROOT, hue), resolve(background, theme, ROOT, hue))
        if (ratio < minimum) failures.push(`hue ${hue}: ${text} on ${background} ${ratio.toFixed(2)}`)
      }
    }
    expect(failures).toEqual([])
  })
})
