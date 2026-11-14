/**
 * The app's keys: `APP_KEY` plus the retired keys in `APP_PREVIOUS_KEYS`, so `key:rotate` never
 * breaks existing encrypted values or signed links. New values are always produced with the
 * current key; old ones are still *accepted* with a previous key until it is removed.
 *
 * Each use gets its own subkey (HKDF-SHA256 with a purpose label), so a value signed for one
 * purpose (a URL) can never be replayed as another (a cookie), and no raw key is ever used twice.
 */
import { createHmac, hkdfSync } from 'node:crypto'
import { token } from '../foundation/container.ts'
import { StrutvaneError } from '../support/errors.ts'

/** The least key material accepted: 256 bits, the AES-256 key size. */
export const MIN_KEY_BYTES = 32

/**
 * One key: its bytes and a short public id (an HMAC of the key, which reveals nothing about it).
 *
 * @example
 * const key: AppKey = parseAppKey('base64:…')
 */
export interface AppKey {
  readonly material: Buffer
  /** 16 hex characters; stored next to ciphertexts and caches to pick the right key. */
  readonly id: string
}

/**
 * Why a key value is unusable, or `undefined` when it's fine. Used by the boot guard,
 * `security:check` and `key:rotate`.
 *
 * @example
 * keyProblem('short') // 'is too short: 5 bytes, at least 32 are needed'
 */
export function keyProblem(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === '') return 'is missing'
  const material = keyMaterial(value)
  if (material === undefined) return 'starts with "base64:" but the rest is not valid base64'
  if (material.length < MIN_KEY_BYTES) return `is too short: ${material.length} bytes, at least ${MIN_KEY_BYTES} are needed`
  return undefined
}

/**
 * The bytes of a key value: `base64:<…>` is decoded (Laravel's format); anything else is used as
 * UTF-8 text. `undefined` for broken base64.
 */
function keyMaterial(value: string): Buffer | undefined {
  if (!value.startsWith('base64:')) return Buffer.from(value, 'utf8')
  const encoded = value.slice('base64:'.length)
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return undefined
  const bytes = Buffer.from(encoded, 'base64')
  // Round-trip check: Node's decoder silently skips junk, which would shorten the key unnoticed.
  return bytes.toString('base64').replace(/=+$/, '') === encoded.replace(/=+$/, '') ? bytes : undefined
}

/**
 * Parse a key value, or throw a friendly error naming the variable.
 *
 * @example
 * parseAppKey(process.env.APP_KEY, 'APP_KEY')
 */
export function parseAppKey(value: string | undefined, variable = 'APP_KEY'): AppKey {
  const problem = keyProblem(value)
  const material = value === undefined ? undefined : keyMaterial(value)
  if (problem !== undefined || material === undefined) {
    throw new StrutvaneError('INVALID_APP_KEY', `${variable} ${problem ?? 'is invalid'}.`, 'Run `node strut key:generate` to create a strong key (32 random bytes, base64).')
  }
  return { material, id: createHmac('sha256', material).update('strutvane:key-id').digest('hex').slice(0, 16) }
}

/**
 * The current key and the previous ones.
 *
 * @example
 * const keyring = Keyring.from(env.APP_KEY, env.APP_PREVIOUS_KEYS)
 * keyring.subkey('signed-url') // 32 bytes for URL signatures
 */
export class Keyring {
  readonly current: AppKey
  readonly previous: readonly AppKey[]

  constructor(current: AppKey, previous: readonly AppKey[] = []) {
    this.current = current
    this.previous = previous
  }

  /**
   * Build from `APP_KEY` and a comma-separated `APP_PREVIOUS_KEYS`.
   *
   * @example
   * Keyring.from('base64:…', 'base64:old1,base64:old2')
   */
  static from(appKey: string | undefined, previousKeys = ''): Keyring {
    const previous = previousKeys
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value !== '')
      .map((value, index) => parseAppKey(value, `APP_PREVIOUS_KEYS[${index}]`))
    return new Keyring(parseAppKey(appKey), previous)
  }

  /** Every key, current first. */
  get all(): readonly AppKey[] {
    return [this.current, ...this.previous]
  }

  /**
   * A 32-byte subkey for one purpose, derived from a key (the current one by default).
   *
   * @example
   * keyring.subkey('encrypt')
   */
  subkey(purpose: string, key: AppKey = this.current): Buffer {
    return Buffer.from(hkdfSync('sha256', key.material, 'strutvane', `strutvane:${purpose}`, 32))
  }

  /**
   * The key with this id, if the keyring still has it.
   *
   * @example
   * keyring.byId('3f2a…')
   */
  byId(id: string): AppKey | undefined {
    return this.all.find((key) => key.id === id)
  }
}

/**
 * The container token for the app's keyring, bound at boot.
 *
 * @example
 * app.make(KeyringToken).current.id
 */
export const KeyringToken = token<Keyring>('Keyring')
