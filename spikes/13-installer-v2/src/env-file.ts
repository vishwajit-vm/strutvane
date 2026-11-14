/**
 * Small, line-based edits to `.env` text that keep comments and order intact, with every value
 * escaped so it reads back exactly as written.
 *
 * Why escaping matters (security review F-17): a value with a newline could inject a second
 * setting (`x\nAPP_DEBUG=true`), and an unquoted `#` silently cuts the value short. Reading uses
 * Node's own `util.parseEnv` (the same parser as `node --env-file`), and the writer is tested to
 * round-trip through it.
 *
 * @module
 */
import { randomBytes } from 'node:crypto'
import { parseEnv as nodeParseEnv } from 'node:util'

/** Keys the installer writes: uppercase letters, digits and underscores. */
const KEY = /^[A-Z][A-Z0-9_]*$/

/** Values that need no quotes at all (and so read back unchanged in every dotenv dialect). */
const PLAIN = /^[A-Za-z0-9_./:@,+-]*$/

/** A value or key cannot be written safely. The message says which and why. */
export class UnsafeEnvValueError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeEnvValueError'
  }
}

/**
 * Read every setting into a map, with Node's own parser (quotes, comments, later lines win).
 *
 * @example
 * parseEnv('# app\nAPP_PORT=3000\n').get('APP_PORT') // '3000'
 */
export function parseEnv(text: string): Map<string, string> {
  const values = new Map<string, string>()
  for (const [key, value] of Object.entries(nodeParseEnv(text))) {
    if (value !== undefined) values.set(key, value)
  }
  return values
}

/**
 * Format one value for an env file, or throw {@link UnsafeEnvValueError}.
 *
 * - plain characters stay unquoted: `3000`, `http://localhost:3000`;
 * - anything else is single-quoted (taken literally: no `#` comments, no `$` expansion);
 * - a value containing `'` is double-quoted instead, if it has no `"` or `\`;
 * - CR, LF and NUL are always refused: they would start a new line (a new setting).
 *
 * @example
 * formatEnvValue('a b#c') // "'a b#c'"
 * formatEnvValue('x\nAPP_DEBUG=true') // throws
 */
export function formatEnvValue(value: string): string {
  if (/[\r\n\0]/.test(value)) {
    throw new UnsafeEnvValueError('A value for .env may not contain line breaks or NUL characters.')
  }
  if (PLAIN.test(value)) return value
  if (!value.includes("'")) return `'${value}'`
  if (!value.includes('"') && !value.includes('\\')) return `"${value}"`
  throw new UnsafeEnvValueError(`This value mixes ' and " (or \\), which .env files cannot hold safely: ${value}`)
}

/**
 * Set one key: replace its line if present, else append it at the end. The value is escaped with
 * {@link formatEnvValue}; a bad key or value throws {@link UnsafeEnvValueError}.
 *
 * @example
 * setEnvValue('APP_PORT=3000\n', 'APP_PORT', '3001') // 'APP_PORT=3001\n'
 */
export function setEnvValue(text: string, key: string, value: string): string {
  if (!KEY.test(key)) throw new UnsafeEnvValueError(`"${key}" is not a valid .env key (use A-Z, 0-9 and _).`)
  const line = `${key}=${formatEnvValue(value)}`
  const lines = text.split('\n')
  const index = lines.findIndex((existing) => existing.replace(/\r$/, '').startsWith(`${key}=`))
  if (index === -1) {
    const base = text.length === 0 || text.endsWith('\n') ? text : `${text}\n`
    return `${base}${line}\n`
  }
  lines[index] = line
  return lines.join('\n')
}

/**
 * Turn `KEY=value` into `# KEY=value` (Laravel does this to DB_HOST and friends for SQLite).
 * Keys that are not present are ignored.
 *
 * @example
 * commentOutEnvKey('DB_HOST=127.0.0.1\n', 'DB_HOST') // '# DB_HOST=127.0.0.1\n'
 */
export function commentOutEnvKey(text: string, key: string): string {
  return text
    .split('\n')
    .map((line) => (line.startsWith(`${key}=`) ? `# ${line}` : line))
    .join('\n')
}

/**
 * A random secret: `bytes` random bytes as base64url (URL-, shell- and YAML-safe, no quoting).
 *
 * @example
 * generateSecret() // 'q0V8...' (43 characters for 32 bytes)
 */
export function generateSecret(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/** Letters and digits that cannot be confused when read aloud or copied by hand (no 0/O, 1/l/I). */
const READABLE = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/**
 * A password a person can type: four groups of four readable characters, e.g. `q7Vd-3kPz-Xm2c-8RtL`
 * (about 92 bits of entropy).
 *
 * Why readable: this is the first admin's password, shown once on screen and typed into the
 * sign-in page.
 *
 * @example
 * generateReadablePassword() // 'q7Vd-3kPz-Xm2c-8RtL'
 */
export function generateReadablePassword(): string {
  const groups: string[] = []
  for (let group = 0; group < 4; group += 1) {
    let text = ''
    // Rejection sampling: 256 is not a multiple of the alphabet size, so bytes past the last full
    // multiple are thrown away to keep every character equally likely.
    const limit = 256 - (256 % READABLE.length)
    while (text.length < 4) {
      const byte = randomBytes(1)[0] ?? 255
      if (byte < limit) text += READABLE[byte % READABLE.length] ?? ''
    }
    groups.push(text)
  }
  return groups.join('-')
}
