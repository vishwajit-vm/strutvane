/**
 * Colour maths for the contrast tests: read the OKLCH tokens from `src/styles/tokens.css`,
 * convert them to sRGB, composite translucent layers the way a browser does, and compute WCAG
 * contrast ratios.
 *
 * Why not axe? jsdom has no layout or painting, so axe cannot measure contrast, and even a real
 * browser screenshot only tests ONE spot of the backdrop. The maths here tests every spot that
 * can exist: the tokens are exact numbers, so the worst case can be enumerated.
 *
 * @example
 *   const theme = loadTheme('dark')
 *   contrast(theme.color('foreground'), composite(theme.color('glass-card'), theme.color('backdrop')))
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** A colour in gamma-encoded sRGB, channels and alpha in 0..1. */
export interface Rgba {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly a: number
}

/** The stylesheet the tests read: the same file the app ships. */
export const TOKENS_CSS = readFileSync(join(process.cwd(), 'src', 'styles', 'tokens.css'), 'utf8')

/** The custom properties declared in the first block that starts with `selector {`. */
export function declarations(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(`\n${selector} {`)
  if (start < 0) throw new Error(`No "${selector} {" block in tokens.css`)
  const block = css.slice(start, css.indexOf('}', start))
  return new Map([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [match[1] ?? '', (match[2] ?? '').trim()]))
}

/** Parse `oklch(L C H)` / `oklch(L C H / A)`, with H a number, `var(--brand-hue)` or `calc(var(--brand-hue) ± N)`. */
export function parseOklch(raw: string, hue: number): [l: number, c: number, h: number, a: number] {
  const match = /^oklch\(([\d.]+) ([\d.]+) (.+?)(?: \/ ([\d.]+))?\)$/.exec(raw)
  if (match === null) throw new Error(`Not an oklch() colour: ${raw}`)
  const hueText = (match[3] ?? '0').trim()
  let h: number
  if (hueText === 'var(--brand-hue)') h = hue
  else {
    const offset = /^calc\(var\(--brand-hue\) ([+-]) (\d+)\)$/.exec(hueText)
    h = offset === null ? Number(hueText) : hue + (offset[1] === '+' ? 1 : -1) * Number(offset[2])
  }
  return [Number(match[1]), Number(match[2]), h, match[4] === undefined ? 1 : Number(match[4])]
}

/** OKLCH → gamma-encoded sRGB, clamped into the gamut (what a browser paints). */
export function oklchToRgba([l, c, h, a]: [number, number, number, number]): Rgba {
  const A = c * Math.cos((h * Math.PI) / 180)
  const B = c * Math.sin((h * Math.PI) / 180)
  const lp = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const mp = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const sp = (l - 0.0894841775 * A - 1.291485548 * B) ** 3
  const linear = [
    4.0767416621 * lp - 3.3077115913 * mp + 0.2309699292 * sp,
    -1.2684380046 * lp + 2.6097574011 * mp - 0.3413193965 * sp,
    -0.0041960863 * lp - 0.7034186147 * mp + 1.707614701 * sp,
  ].map((value) => Math.min(1, Math.max(0, value)))
  const encode = (value: number): number => (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055)
  return { r: encode(linear[0] ?? 0), g: encode(linear[1] ?? 0), b: encode(linear[2] ?? 0), a }
}

/** Paint `top` over an opaque `bottom` (source-over in sRGB, the browser default). */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const mix = (front: number, back: number): number => front * top.a + back * (1 - top.a)
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 }
}

/** The CSS `saturate(amount)` filter matrix (Filter Effects spec), as used by backdrop-filter. */
export function saturate(color: Rgba, amount: number): Rgba {
  const s = amount
  const clamp = (value: number): number => Math.min(1, Math.max(0, value))
  const { r, g, b } = color
  return {
    r: clamp((0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b),
    g: clamp((0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b),
    b: clamp((0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b),
    a: color.a,
  }
}

function relativeLuminance({ r, g, b }: Rgba): number {
  const linear = (value: number): number => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/** WCAG 2 contrast ratio between two opaque colours (1..21). */
export function contrast(one: Rgba, two: Rgba): number {
  const [light, dark] = [relativeLuminance(one), relativeLuminance(two)].sort((x, y) => y - x)
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05)
}

/** One resolved theme: look up any token as a colour. */
export interface Theme {
  readonly name: 'light' | 'dark'
  color(token: string): Rgba
  raw(token: string): string
}

/**
 * Load a theme from tokens.css. `overrides` replaces tokens (e.g. the solid fallback maps
 * `glass-card` to `glass-card-solid`), and `hue` re-evaluates every colour for another accent.
 */
export function loadTheme(name: 'light' | 'dark', options: { hue?: number; overrides?: Record<string, string> } = {}): Theme {
  const base = declarations(TOKENS_CSS, ':root')
  const dark = name === 'dark' ? declarations(TOKENS_CSS, '.dark') : new Map<string, string>()
  const hue = options.hue ?? Number(base.get('brand-hue'))
  const raw = (token: string): string => {
    const aliased = options.overrides?.[token]
    if (aliased !== undefined) return raw(aliased)
    const value = dark.get(token) ?? base.get(token)
    if (value === undefined) throw new Error(`No token --${token}`)
    const alias = /^var\(--([\w-]+)\)$/.exec(value)
    return alias?.[1] === undefined ? value : raw(alias[1])
  }
  return { name, raw, color: (token) => oklchToRgba(parseOklch(raw(token), hue)) }
}

/**
 * Every colour the backdrop can show at one point: the base, plus every combination of mesh
 * blobs at full strength painted over it (blobs fade out, so full strength is their extreme).
 * With `saturation`, the backdrop-filter's saturate() is applied too, as the browser does.
 */
export function backdropSamples(theme: Theme, saturation = 1): Rgba[] {
  const meshes = ['mesh-1', 'mesh-2', 'mesh-3', 'mesh-4'].map((token) => theme.color(token))
  const samples: Rgba[] = []
  for (let mask = 0; mask < 1 << meshes.length; mask++) {
    let color = theme.color('backdrop')
    // CSS paints the LAST background layer first, so composite from mesh-4 up to mesh-1.
    for (let index = meshes.length - 1; index >= 0; index--) {
      const mesh = meshes[index]
      if (mesh !== undefined && (mask & (1 << index)) !== 0) color = composite(mesh, color)
    }
    samples.push(saturation === 1 ? color : saturate(color, saturation))
  }
  return samples
}

/**
 * The worst (lowest) contrast of `text` over a stack of surfaces (top first), across every
 * backdrop sample. A translucent stack is composited from the backdrop up.
 */
export function worstContrast(theme: Theme, text: string, stack: readonly string[], saturation = 1): number {
  let worst = Number.POSITIVE_INFINITY
  for (const sample of backdropSamples(theme, saturation)) {
    let background = sample
    for (const layer of [...stack].reverse()) background = composite(theme.color(layer), background)
    const foreground = composite(theme.color(text), background)
    worst = Math.min(worst, contrast(foreground, background))
  }
  return worst
}
