/**
 * A seeded pseudo-random generator (mulberry32), so the mock data is varied but identical on
 * every load: screenshots, tests and the project lead's comparison all see the same records.
 *
 * @example
 * const random = seeded(42)
 * random.int(1, 6) // same sequence every run
 */
export interface Random {
  /** A float in [0, 1). */
  next: () => number
  /** An integer in [min, max], both inclusive. */
  int: (min: number, max: number) => number
  /** One element of a non-empty list. */
  pick: <T>(items: readonly [T, ...T[]]) => T
  /** `true` with the given probability (0..1). */
  chance: (probability: number) => boolean
}

export function seeded(seed: number): Random {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)] ?? items[0],
    chance: (probability) => next() < probability,
  }
}
