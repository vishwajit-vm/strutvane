/**
 * WCAG AA, proven from the token file itself: every text colour on every surface it is used on,
 * in both themes. Text needs 4.5:1; the focus ring and status dots (non-text UI) need 3:1 against
 * the surfaces they sit on. If someone tweaks a token and breaks contrast, this fails with the pair.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(process.cwd(), 'src', 'styles', 'tokens.css'), 'utf8')

/** The `--name: #hex;` declarations of one block (`:root` = light, `.dark` = dark). */
function tokens(selector: ':root' | '.dark'): Map<string, string> {
  const start = css.indexOf(`${selector} {`)
  const block = css.slice(start, css.indexOf('\n}', start))
  return new Map([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/gi)].map((match) => [match[1] ?? '', (match[2] ?? '').toLowerCase()]))
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
  const [r, g, b] = channels.map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.x contrast ratio between two hex colours. */
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

const SURFACES = ['bg', 'surface', 'surface-subtle'] as const

/** [foreground, background, minimum ratio] pairs that occur in the UI. */
const PAIRS: readonly (readonly [string, string, number])[] = [
  ...['fg', 'fg-muted', 'fg-subtle', 'accent-text'].flatMap((fg) => SURFACES.map((bg) => [fg, bg, 4.5] as const)),
  ['fg', 'surface-muted', 4.5],
  ['fg-muted', 'surface-muted', 4.5],
  ['accent-fg', 'accent', 4.5],
  ['accent-fg', 'accent-hover', 4.5],
  ['accent-text', 'accent-subtle', 4.5],
  ['fg', 'accent-subtle', 4.5],
  ['danger-fg', 'danger', 4.5],
  ['danger-fg', 'danger-hover', 4.5],
  ['inverse-fg', 'inverse', 4.5],
  ['success-text', 'success-subtle', 4.5],
  ['warning-text', 'warning-subtle', 4.5],
  ['danger-text', 'danger-subtle', 4.5],
  ['success-text', 'surface', 4.5],
  ['warning-text', 'surface', 4.5],
  ['danger-text', 'surface', 4.5],
  ['avatar-fg', 'avatar-1', 4.5],
  ['avatar-fg', 'avatar-2', 4.5],
  ['avatar-fg', 'avatar-3', 4.5],
  ['avatar-fg', 'avatar-4', 4.5],
  ['avatar-fg', 'avatar-5', 4.5],
  ['ring', 'surface', 3],
  ['ring', 'bg', 3],
  ['accent', 'surface', 3],
  ['success', 'surface', 3],
  ['danger', 'surface', 3],
]

describe.each([
  ['light', ':root'],
  ['dark', '.dark'],
] as const)('AA contrast in the %s theme', (_theme, selector) => {
  const palette = tokens(selector)

  it('defines every token the pairs need, as a hex value', () => {
    const missing = [...new Set(PAIRS.flatMap(([fg, bg]) => [fg, bg]))].filter((name) => !palette.has(name))
    expect(missing).toEqual([])
  })

  it.each(PAIRS.map(([fg, bg, min]) => [`${fg} on ${bg}`, fg, bg, min] as const))('%s', (_name, fg, bg, min) => {
    const ratio = contrast(palette.get(fg) ?? '#000000', palette.get(bg) ?? '#000000')
    expect(ratio, `${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs ${min}:1`).toBeGreaterThanOrEqual(min)
  })
})

describe('the contrast maths', () => {
  it('matches the WCAG reference values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2)
  })
})
