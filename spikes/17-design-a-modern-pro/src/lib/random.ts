/**
 * A seeded pseudo-random generator (mulberry32) for mock data. Seeded, so every reload, every
 * screenshot and every test sees exactly the same invoices and charts.
 *
 * @example
 * const random = seeded(42)
 * random.int(1, 6) // same sequence every run
 */
export interface Random {
  /** A float in [0, 1). */
  next(): number
  /** An integer in [min, max], inclusive. */
  int(min: number, max: number): number
  /** One element of a non-empty list. */
  pick<T>(items: readonly [T, ...T[]]): T
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
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1))
  const pick = <T,>(items: readonly [T, ...T[]]): T => items[int(0, items.length - 1)] ?? items[0]
  return { next, int, pick }
}
