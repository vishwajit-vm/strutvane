/**
 * WCAG AA contrast for text over glass, proven from `src/styles/tokens.css`.
 *
 * Glass is translucent, so "the background" of a label is not one colour: it is the surface
 * composited over whatever part of the mesh backdrop sits behind it. Every check below takes the
 * WORST case over all backdrop samples (the base plus every combination of mesh blobs at full
 * strength), with and without the backdrop-filter's saturate(), for:
 *   - both themes;
 *   - the solid fallback (reduced transparency / no backdrop-filter support);
 *   - the configured brand hue AND every hue in 30° steps (a developer may change the accent).
 *
 * Text needs 4.5:1; focus rings, input borders, checked controls and chart marks need 3:1.
 */
import { describe, expect, it } from 'vitest'
import { contrast, declarations, loadTheme, TOKENS_CSS, worstContrast, type Theme } from './color-math.ts'

/** [text token, surface stack (top first), minimum ratio]. */
type Pair = readonly [text: string, stack: readonly string[], minimum: number]

const READING_SURFACES = ['glass-chrome', 'glass-card', 'glass-overlay', 'surface', 'surface-muted', 'surface-input'] as const

const PAIRS: readonly Pair[] = [
  // Body and secondary text on every surface.
  ...READING_SURFACES.flatMap((surface): Pair[] => [
    ['foreground', [surface], 4.5],
    ['foreground-muted', [surface], 4.5],
  ]),
  // Links and the active navigation item.
  ['primary-text', ['glass-card'], 4.5],
  ['primary-text', ['glass-chrome'], 4.5],
  ['primary-text', ['glass-overlay'], 4.5],
  ['primary-text', ['surface'], 4.5],
  ['primary-soft-foreground', ['primary-soft', 'glass-chrome'], 4.5],
  ['primary-soft-foreground', ['primary-soft', 'glass-card'], 4.5],
  ['primary-soft-foreground', ['primary-soft', 'surface'], 4.5],
  // Hover and selected rows keep body text readable.
  ['foreground', ['glass-hover', 'glass-chrome'], 4.5],
  ['foreground', ['surface-hover', 'surface'], 4.5],
  ['foreground', ['surface-selected', 'surface'], 4.5],
  ['foreground-muted', ['surface-selected', 'surface'], 4.5],
  // Filled buttons (gradient ends) and destructive buttons.
  ['primary-foreground', ['primary'], 4.5],
  ['primary-foreground', ['primary-2'], 4.5],
  ['danger-foreground', ['danger-solid'], 4.5],
  // Status badges, on tables (surface) and on KPI cards (glass).
  ...(['success', 'warning', 'danger', 'info'] as const).flatMap((tone): Pair[] => [
    [tone, [`${tone}-soft`, 'surface'], 4.5],
    [tone, [`${tone}-soft`, 'glass-card'], 4.5],
  ]),
  ['foreground-muted', ['neutral-soft', 'surface'], 4.5],
  ['foreground-muted', ['neutral-soft', 'glass-card'], 4.5],
  ['danger', ['surface'], 4.5],
  ['danger', ['glass-overlay'], 4.5],
  ['success', ['glass-card'], 4.5],
  // Avatars and tags.
  ...[1, 2, 3, 4, 5, 6].map((tone): Pair => [`tone-${tone}`, [`tone-${tone}-soft`], 4.5]),
  // Non-text (WCAG 1.4.11): focus ring, input borders, checked controls, chart marks.
  ['ring', ['glass-card'], 3],
  ['ring', ['glass-chrome'], 3],
  ['ring', ['surface'], 3],
  ['input-border', ['surface'], 3],
  ['input-border', ['glass-card'], 3],
  ['control', ['surface'], 3],
  ['control-foreground', ['control'], 4.5],
  ['control', ['glass-card'], 3],
  ...[1, 2, 3, 4].map((chart): Pair => [`chart-${chart}`, ['glass-card'], 3]),
]

/** The solid fallback maps each glass token to its solid twin (tokens.css "Fallback 1/2"). */
const SOLID = { 'glass-chrome': 'glass-chrome-solid', 'glass-card': 'glass-card-solid', 'glass-overlay': 'glass-overlay-solid' }

/** Blurred layers also saturate the backdrop (`--glass-saturate`), which can shift contrast. */
const SATURATION = Number.parseFloat(declarations(TOKENS_CSS, ':root').get('glass-saturate') ?? '100') / 100

function failures(theme: Theme, pairs: readonly Pair[]): string[] {
  return pairs.flatMap(([text, stack, minimum]) => {
    const worst = Math.min(worstContrast(theme, text, stack), worstContrast(theme, text, stack, SATURATION))
    return worst >= minimum ? [] : [`${theme.name}: ${text} on ${stack.join(' over ')} = ${worst.toFixed(2)} (needs ${minimum})`]
  })
}

describe.each(['light', 'dark'] as const)('%s theme', (name) => {
  it('every text/surface pair meets WCAG AA over the worst-case backdrop', () => {
    expect(failures(loadTheme(name), PAIRS)).toEqual([])
  })

  it('the solid fallback (reduced transparency, no backdrop-filter) meets WCAG AA too', () => {
    expect(failures(loadTheme(name, { overrides: SOLID }), PAIRS)).toEqual([])
  })

  it('stays AA for any accent hue a developer configures (30° steps)', () => {
    const all: string[] = []
    for (let hue = 0; hue < 360; hue += 30) all.push(...failures(loadTheme(name, { hue }), PAIRS).map((line) => `hue ${hue} ${line}`))
    expect(all).toEqual([])
  })

  it('glass really is glass: chrome and cards are translucent, reading surfaces near-opaque', () => {
    const theme = loadTheme(name)
    expect(theme.color('glass-chrome').a).toBeLessThanOrEqual(0.7)
    expect(theme.color('glass-card').a).toBeLessThanOrEqual(0.7)
    expect(theme.color('surface').a).toBeGreaterThanOrEqual(0.94)
    expect(theme.color('surface-muted').a).toBeGreaterThanOrEqual(0.94)
  })
})

describe('the maths itself', () => {
  it('matches known WCAG reference values', () => {
    const white = { r: 1, g: 1, b: 1, a: 1 }
    const black = { r: 0, g: 0, b: 0, a: 1 }
    expect(contrast(white, black)).toBeCloseTo(21, 5)
    // #767676 on white is the classic "just passes AA" grey: 4.54:1.
    const grey = { r: 0x76 / 255, g: 0x76 / 255, b: 0x76 / 255, a: 1 }
    expect(contrast(grey, white)).toBeCloseTo(4.54, 2)
  })

  it('catches a planted bad pair (the test can fail)', () => {
    const theme = loadTheme('light', { overrides: { 'foreground-muted': 'glass-border' } })
    expect(failures(theme, [['foreground-muted', ['glass-card'], 4.5]])).toHaveLength(1)
  })
})
