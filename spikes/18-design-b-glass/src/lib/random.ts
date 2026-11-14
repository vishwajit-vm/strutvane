/**
 * A tiny seeded pseudo-random generator (mulberry32) for mock data.
 *
 * Why seeded: the mock must look varied but render identically on every load, so screenshots,
 * tests and the lead's side-by-side comparison all see the same rows.
 *
 * @example
 *   const random = seeded(42)
 *   random.pick(['a', 'b'])     // always the same choice for seed 42
 *   random.between(10, 20)      // integer in [10, 20]
 */
export interface Random {
  /** A float in [0, 1). */
  next(): number
  /** An integer in [min, max]. */
  between(min: number, max: number): number
  /** One element of a non-empty list. */
  pick<T>(items: readonly [T, ...T[]]): T
  /** True with the given probability. */
  chance(probability: number): boolean
}

export function seeded(seed: number): Random {
  let state = seed >>> 0
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
  return {
    next,
    between: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)] ?? items[0],
    chance: (probability) => next() < probability,
  }
}

/** A stable small hash of a string, so each name gets the same avatar tone every time. */
export function hashString(text: string): number {
  let hash = 0
  for (const char of text) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0
  return hash
}
