/**
 * Prototype-pollution-safe JSON parsing with depth and key-count limits.
 *
 * `JSON.parse` itself never pollutes `Object.prototype`, but it does create an *own* property
 * called `__proto__`, and the first deep merge, `Object.assign` into a class instance or lodash
 * `set` turns that into pollution. The safe rule is to refuse such bodies outright: a real
 * client never needs a `__proto__` key or a `constructor.prototype` object.
 *
 * The limits are checked by a linear pre-scan **before** `JSON.parse` runs, so a hostile body
 * (`[[[[…` a million levels deep, or a million tiny keys) costs one pass over the bytes and never
 * reaches the parser.
 */
import { HttpError } from '../http/problem.ts'
import { DEFAULT_BODY_LIMITS, type BodyLimits } from '../http/request-state.ts'
import { failIfAny } from './setting-error.ts'

/**
 * Why a body was refused.
 *
 * @example
 * const code: JsonLimitCode = 'json_too_deep'
 */
export type JsonLimitCode = 'invalid_json' | 'json_too_deep' | 'json_too_many_keys' | 'forbidden_json_key'

/**
 * Thrown by {@link parseJsonSafely}. `toHttpError()` gives the problem response.
 *
 * @example
 * try { parseJsonSafely(text, limits) } catch (error) { if (error instanceof JsonLimitError) error.code }
 */
export class JsonLimitError extends Error {
  readonly code: JsonLimitCode

  constructor(code: JsonLimitCode, message: string) {
    super(message)
    this.name = 'JsonLimitError'
    this.code = code
  }

  /**
   * The HTTP error for this refusal: 400 for malformed or forbidden content, 413 for bodies that
   * are too deep or have too many keys.
   *
   * @example
   * throw error.toHttpError()
   */
  toHttpError(): HttpError {
    if (this.code === 'json_too_deep' || this.code === 'json_too_many_keys') return new HttpError(413, this.code, 'JSON too complex', this.message)
    return new HttpError(400, this.code, this.code === 'invalid_json' ? 'Invalid JSON' : 'Forbidden JSON key', this.message)
  }
}

/** The limits {@link parseJsonSafely} enforces (bytes are enforced while reading the body). */
export type JsonLimits = Pick<BodyLimits, 'maxDepth' | 'maxKeys'>

/**
 * Parse JSON text, refusing bodies nested deeper than `maxDepth`, with more than `maxKeys` object
 * keys in total, or containing `__proto__` keys or `constructor.prototype` objects.
 *
 * @example
 * parseJsonSafely('{"title":"Hi"}', { maxDepth: 32, maxKeys: 1000 }) // { title: 'Hi' }
 * parseJsonSafely('{"__proto__":{"admin":true}}', limits)             // throws forbidden_json_key
 */
export function parseJsonSafely(text: string, limits: JsonLimits = DEFAULT_BODY_LIMITS): unknown {
  const { depth, keys } = measureJson(text)
  if (depth > limits.maxDepth) throw new JsonLimitError('json_too_deep', `The JSON is nested ${depth} levels deep; the limit is ${limits.maxDepth}.`)
  if (keys > limits.maxKeys) throw new JsonLimitError('json_too_many_keys', `The JSON has ${keys} keys; the limit is ${limits.maxKeys}.`)
  try {
    return JSON.parse(text, refuseDangerousKeys)
  } catch (error) {
    if (error instanceof JsonLimitError) throw error
    throw new JsonLimitError('invalid_json', 'The request body is not valid JSON. Check for trailing commas and unquoted keys.')
  }
}

/** The reviver: runs bottom-up, so `constructor`'s value is complete when it is checked. */
function refuseDangerousKeys(key: string, value: unknown): unknown {
  if (key === '__proto__') throw new JsonLimitError('forbidden_json_key', 'The JSON contains a "__proto__" key, which is never accepted.')
  if (key === 'constructor' && typeof value === 'object' && value !== null && Object.hasOwn(value, 'prototype')) {
    throw new JsonLimitError('forbidden_json_key', 'The JSON contains a "constructor.prototype" object, which is never accepted.')
  }
  return value
}

/**
 * The maximum nesting depth and the number of object keys in JSON text, from one pass that
 * skips string contents. On invalid JSON the numbers are approximate, and the parse that follows
 * reports the syntax error.
 *
 * Keys are counted as `:` outside strings, because every object member has exactly one.
 *
 * @example
 * measureJson('{"a":[1,{"b":2}]}') // { depth: 3, keys: 2 }
 */
export function measureJson(text: string): { depth: number; keys: number } {
  let depth = 0
  let deepest = 0
  let keys = 0
  let inString = false
  let escaped = false
  for (let index = 0; index < text.length; index++) {
    const char = text.charCodeAt(index)
    if (inString) {
      if (escaped) escaped = false
      else if (char === 0x5c) escaped = true // backslash
      else if (char === 0x22) inString = false // quote
      continue
    }
    if (char === 0x22) inString = true
    else if (char === 0x7b || char === 0x5b) deepest = Math.max(deepest, ++depth) // { [
    else if (char === 0x7d || char === 0x5d) depth-- // } ]
    else if (char === 0x3a) keys++ // :
  }
  return { depth: deepest, keys }
}

/**
 * Options for `withMiddleware((m) => m.limits({ … }))`.
 *
 * @example
 * const options: BodyLimitOptions = { maxBytes: 5 * 1024 * 1024 }
 */
export interface BodyLimitOptions {
  readonly maxBytes?: number
  readonly maxDepth?: number
  readonly maxKeys?: number
}

/** Upper bounds a setting may not exceed: past these the limit no longer protects anything. */
const CEILINGS: BodyLimits = { maxBytes: 100 * 1024 * 1024, maxDepth: 512, maxKeys: 1_000_000 }

/**
 * Validate body limit options and fill in the defaults.
 *
 * @example
 * resolveLimits({ maxDepth: 64 }) // { maxBytes: 1048576, maxDepth: 64, maxKeys: 1000 }
 */
export function resolveLimits(options: BodyLimitOptions): BodyLimits {
  const resolved: BodyLimits = { ...DEFAULT_BODY_LIMITS, ...options }
  const problems: string[] = []
  for (const name of ['maxBytes', 'maxDepth', 'maxKeys'] as const) {
    const value = resolved[name]
    if (!Number.isInteger(value) || value < 1 || value > CEILINGS[name]) problems.push(`limits.${name}: must be a whole number from 1 to ${CEILINGS[name]} (got ${String(value)}).`)
  }
  failIfAny(problems)
  return resolved
}
