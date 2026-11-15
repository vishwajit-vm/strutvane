/**
 * Safe `.env` editing for `key:generate` and `key:rotate`: change some keys, keep every other
 * line (comments, order, blank lines) exactly as it was.
 *
 * Why so careful (security review F-17): a value containing a newline would inject a second
 * variable (`APP_DEBUG=true`), and an unquoted `#` silently truncates a value. Values are
 * refused if they hold CR, LF or NUL, and quoted when they contain anything beyond a safe set.
 */
import { parseEnv } from 'node:util'
import { StrutvaneError } from './errors.ts'

const UNQUOTED = /^[A-Za-z0-9_+/=:.,@-]*$/
const KEY = /^[A-Z][A-Z0-9_]*$/

/**
 * Format one value for a `.env` line.
 *
 * @example
 * formatEnvValue('base64:abc=') // 'base64:abc='
 * formatEnvValue('two words')   // "'two words'"
 */
export function formatEnvValue(value: string): string {
  if (/[\r\n\0]/.test(value)) throw new StrutvaneError('UNSAFE_ENV_VALUE', 'A .env value may not contain line breaks or NUL characters.', 'Line breaks would let one value inject another variable.')
  if (UNQUOTED.test(value)) return value
  // Single quotes are literal in Node's parser (no escapes, no expansion), so prefer them.
  if (!value.includes("'")) return `'${value}'`
  if (!value.includes('"') && !value.includes('\\')) return `"${value}"`
  throw new StrutvaneError('UNSAFE_ENV_VALUE', 'This .env value mixes quote characters and cannot be written safely.', 'Remove either the single or the double quotes from the value.')
}

/**
 * Set keys in `.env` text: replace the existing `KEY=` line in place, or append it.
 *
 * @example
 * setEnvValues('APP_NAME=Blog\nAPP_KEY=\n', { APP_KEY: 'base64:…' }) // 'APP_NAME=Blog\nAPP_KEY=base64:…\n'
 */
export function setEnvValues(text: string, values: Readonly<Record<string, string>>): string {
  const lines = text.split(/\r?\n/)
  if (lines.at(-1) === '') lines.pop()
  for (const [key, value] of Object.entries(values)) {
    if (!KEY.test(key)) throw new StrutvaneError('UNSAFE_ENV_KEY', `"${key}" is not a valid .env variable name.`, 'Use upper-case letters, digits and underscores.')
    const line = `${key}=${formatEnvValue(value)}`
    const index = lines.findIndex((existing) => new RegExp(`^\\s*(export\\s+)?${key}\\s*=`).test(existing))
    if (index === -1) lines.push(line)
    else lines[index] = line
  }
  return `${lines.join('\n')}\n`
}

/**
 * Read one key from `.env` text with Node's own parser (the one the app uses at runtime).
 *
 * @example
 * readEnvValue('APP_KEY=abc\n', 'APP_KEY') // 'abc'
 */
export function readEnvValue(text: string, key: string): string | undefined {
  const value = parseEnv(text)[key]
  return value === undefined || value === '' ? undefined : value
}
