/**
 * Fuzz tests for the parsers that face hostile input: the JSON limit parser (and its pre-scan)
 * and, below, the signed-URL verifier. A seeded generator keeps every run reproducible; the seed
 * is in the test name, so a failure can be replayed.
 */
import { describe, expect, it } from 'vitest'
import { JsonLimitError, measureJson, parseJsonSafely } from '../src/security/safe-json.ts'

/** mulberry32: a tiny, fast, seeded PRNG (good enough for fuzzing, never for secrets). */
export function prng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

const ALPHABET = ['a', 'Z', '0', ' ', '"', '\\', '{', '}', '[', ']', ':', ',', 'é', ' ', '\n', '_', 'p', 'r', 'o', 't']

function randomString(random: () => number, max: number): string {
  return Array.from({ length: Math.floor(random() * max) }, () => ALPHABET[Math.floor(random() * ALPHABET.length)] ?? 'a').join('')
}

/** A random JSON value and its true depth and key count. */
function randomValue(random: () => number, depth: number): { value: unknown; depth: number; keys: number } {
  const roll = random()
  if (depth > 6 || roll < 0.35) {
    const leaves = [null, true, false, Math.floor(random() * 1e6) - 5e5, random(), randomString(random, 8)]
    return { value: leaves[Math.floor(random() * leaves.length)], depth: 0, keys: 0 }
  }
  const children = Array.from({ length: Math.floor(random() * 4) }, () => randomValue(random, depth + 1))
  const childDepth = Math.max(0, ...children.map((child) => child.depth))
  const childKeys = children.reduce((total, child) => total + child.keys, 0)
  if (roll < 0.65) return { value: children.map((child) => child.value), depth: childDepth + 1, keys: childKeys }
  const object: Record<string, unknown> = {}
  children.forEach((child, index) => {
    object[`${randomString(random, 5)}#${index}`] = child.value
  })
  return { value: object, depth: childDepth + 1, keys: childKeys + children.length }
}

describe('fuzz: the JSON limit parser', () => {
  it.each([1, 2, 3])('agrees with JSON.parse and measures depth and keys exactly (seed %i, 2,000 values)', (seed) => {
    const random = prng(seed)
    for (let round = 0; round < 2000; round++) {
      const { value, depth, keys } = randomValue(random, 0)
      const text = JSON.stringify(value, null, random() < 0.5 ? 0 : 2)
      expect(measureJson(text)).toEqual({ depth, keys })
      expect(parseJsonSafely(text, { maxDepth: 64, maxKeys: 100_000 })).toEqual(JSON.parse(text))
      if (depth > 0) expect(() => parseJsonSafely(text, { maxDepth: depth - 1, maxKeys: 100_000 })).toThrow(JsonLimitError)
      if (keys > 0) expect(() => parseJsonSafely(text, { maxDepth: 64, maxKeys: keys - 1 })).toThrow(JsonLimitError)
    }
  })

  it.each([4, 5])('only ever throws JsonLimitError on mutated or random input (seed %i, 5,000 inputs)', (seed) => {
    const random = prng(seed)
    for (let round = 0; round < 5000; round++) {
      const base = JSON.stringify(randomValue(random, 0).value) ?? 'null'
      const position = Math.floor(random() * (base.length + 1))
      const text = random() < 0.3 ? randomString(random, 40) : `${base.slice(0, position)}${randomString(random, 4)}${base.slice(position + Math.floor(random() * 3))}`
      try {
        parseJsonSafely(text, { maxDepth: 8, maxKeys: 50 })
      } catch (error) {
        expect(error).toBeInstanceOf(JsonLimitError)
      }
    }
  })

  it('never returns an object carrying a __proto__ key, however it is spelled', () => {
    const random = prng(6)
    const spellings = ['__proto__', '\\u005f\\u005fproto\\u005f\\u005f', '__pro\\u0074o__']
    for (let round = 0; round < 500; round++) {
      const nested = JSON.stringify(randomValue(random, 3).value) ?? 'null'
      const key = spellings[round % spellings.length] ?? '__proto__'
      expect(() => parseJsonSafely(`{"a":[${nested},{"${key}":{"polluted":true}}]}`)).toThrow(/__proto__/)
    }
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
  })
})
