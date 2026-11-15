/**
 * `node strut key:generate` and `key:rotate`.
 *
 * - `key:generate` writes a fresh `APP_KEY` (32 random bytes, `base64:`) into `.env`. It refuses
 *   to replace an existing key without `--force`, because every encrypted value and signed link
 *   made with the old key would stop working: `key:rotate` is the safe way to change it.
 * - `key:rotate` writes a new key and moves the old one to the front of `APP_PREVIOUS_KEYS`, so
 *   existing encrypted values and signed links keep working while new ones use the new key.
 *
 * Neither prints the key (it would land in terminal scrollback and CI logs) unless you ask with
 * `key:generate --show`, which prints it *instead of* writing it.
 */
import { randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { clearCache } from '../../foundation/bootstrap-cache.ts'
import { keyProblem } from '../../security/keyring.ts'
import { writeFileAtomic } from '../../support/atomic-write.ts'
import { readEnvValue, setEnvValues } from '../../support/env-file.ts'
import { StrutvaneError } from '../../support/errors.ts'
import { defineCommand } from '../command.ts'

/**
 * A new application key: 32 random bytes in Laravel's `base64:` format.
 *
 * @example
 * newAppKey() // 'base64:Qm9…='
 */
export function newAppKey(): string {
  return `base64:${randomBytes(32).toString('base64')}`
}

/** `.env`, created from `.env.example` when missing (as a fresh clone needs). */
function envText(basePath: string): { readonly path: string; readonly text: string } {
  const path = join(basePath, '.env')
  if (!existsSync(path)) {
    const example = join(basePath, '.env.example')
    if (!existsSync(example)) throw new StrutvaneError('NO_ENV_FILE', 'There is no .env file (and no .env.example to copy).', 'Create .env first; see the docs for the variables it needs.')
    copyFileSync(example, path)
  }
  return { path, text: readFileSync(path, 'utf8') }
}

/** `node strut key:generate`. */
export const keyGenerateCommand = defineCommand({
  name: 'key:generate',
  description: 'Set a new APP_KEY in .env',
  needsBoot: false,
  options: {
    show: { type: 'boolean', description: 'Print a key instead of writing it' },
    force: { type: 'boolean', description: 'Replace an existing key (encrypted values and signed links made with it stop working)' },
  },
  help: ['To change a key without breaking existing data, use: node strut key:rotate'],
  run({ app, options, output }) {
    const key = newAppKey()
    if (options.show) {
      output.line(key)
      return
    }
    const { path, text } = envText(app.basePath)
    if (readEnvValue(text, 'APP_KEY') !== undefined && !options.force) {
      throw new StrutvaneError('APP_KEY_EXISTS', 'APP_KEY is already set, so nothing was changed.', 'Use `node strut key:rotate` to change it safely (old data stays readable), or --force to replace it outright.')
    }
    if (readEnvValue(text, 'APP_ENV') === 'production' && !options.force) {
      throw new StrutvaneError('PRODUCTION', 'This .env says APP_ENV=production, so nothing was changed.', 'Add --force if you really mean to set a new key in production.')
    }
    writeFileAtomic(path, setEnvValues(text, { APP_KEY: key }), { mode: 0o600 })
    output.line('  ✔ Application key set in .env.')
  },
})

/** `node strut key:rotate`. */
export const keyRotateCommand = defineCommand({
  name: 'key:rotate',
  description: 'Replace APP_KEY and keep the old one in APP_PREVIOUS_KEYS',
  needsBoot: false,
  help: ['Afterwards: deploy the new .env to every server, then drop the old key from APP_PREVIOUS_KEYS once old links and values have expired or been re-encrypted.', 'CSRF tokens change too: open forms need one reload.'],
  run({ app, output }) {
    const { path, text } = envText(app.basePath)
    const current = readEnvValue(text, 'APP_KEY')
    const problem = keyProblem(current)
    if (current === undefined || problem !== undefined) {
      throw new StrutvaneError('NO_KEY_TO_ROTATE', `APP_KEY in .env ${problem ?? 'is missing'}, so there is nothing to rotate.`, 'Run `node strut key:generate` to set a first key.')
    }
    const previous = (readEnvValue(text, 'APP_PREVIOUS_KEYS') ?? '').split(',').map((value) => value.trim()).filter((value) => value !== '' && value !== current)
    writeFileAtomic(path, setEnvValues(text, { APP_KEY: newAppKey(), APP_PREVIOUS_KEYS: [current, ...previous].join(',') }), { mode: 0o600 })
    // The config cache holds the old key's values; it would be ignored anyway, so remove it now.
    clearCache(app.basePath, 'config')
    output.line('  ✔ New APP_KEY set; the old key is first in APP_PREVIOUS_KEYS.')
    output.line(`  · ${previous.length + 1} previous key${previous.length === 0 ? '' : 's'} still accepted for decryption and signed links.`)
    output.line('  · Deploy the new .env everywhere, and run `node strut optimize` again if you cache config.')
  },
})
