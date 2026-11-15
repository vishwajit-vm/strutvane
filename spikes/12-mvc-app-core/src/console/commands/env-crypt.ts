/**
 * `node strut env:encrypt` / `env:decrypt`: commit an encrypted `.env.production` and decrypt it
 * at deploy time, Laravel's commands of the same name.
 *
 * - AES-256-GCM with a 32-byte key from `--key` or `STRUT_ENV_KEY` (prefer the variable: a `--key`
 *   on the command line lands in shell history and process lists).
 * - Without a key, `env:encrypt` generates one and prints it once. **The key is never written to
 *   disk**: store it in your secrets manager or CI secrets.
 * - Tags are checked at their full 16 bytes (see `aead.ts`); a wrong key or a changed file writes
 *   nothing.
 */
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DecryptError, openSealed, packSealed, seal, unpackSealed } from '../../security/aead.ts'
import { writeFileAtomic } from '../../support/atomic-write.ts'
import { StrutvaneError } from '../../support/errors.ts'
import { defineCommand } from '../command.ts'

const HEADER = 'STRUTVANE-ENV-1'
const AAD = 'strutvane:env-file'

/**
 * Parse an env-encryption key: `base64:` and exactly 32 bytes.
 *
 * @example
 * parseEnvKey('base64:…') // Buffer(32)
 */
export function parseEnvKey(value: string): Buffer {
  const encoded = value.startsWith('base64:') ? value.slice('base64:'.length) : ''
  const bytes = /^[A-Za-z0-9+/]+={0,2}$/.test(encoded) ? Buffer.from(encoded, 'base64') : Buffer.alloc(0)
  if (bytes.length !== 32) throw new StrutvaneError('INVALID_ENV_KEY', 'The encryption key must be "base64:" followed by 32 bytes.', 'Run `node strut env:encrypt` without a key to generate one.')
  return bytes
}

/** `.env` or `.env.<name>`; the name is checked so it can't climb out of the app folder. */
function envFile(basePath: string, environment: string | undefined): { readonly path: string; readonly label: string } {
  if (environment !== undefined && !/^[a-z0-9][a-z0-9_-]{0,30}$/i.test(environment)) {
    throw new StrutvaneError('INVALID_ENVIRONMENT_NAME', `"${environment}" is not an environment name.`, 'Use letters, digits, "-" and "_", for example --env=production.')
  }
  const label = environment === undefined ? '.env' : `.env.${environment}`
  return { path: join(basePath, label), label }
}

function keyFrom(option: string | undefined): string | undefined {
  return option ?? process.env['STRUT_ENV_KEY']
}

/** `node strut env:encrypt`. */
export const envEncryptCommand = defineCommand({
  name: 'env:encrypt',
  description: 'Encrypt .env (or .env.<env>) into a file you can commit',
  needsBoot: false,
  options: {
    env: { type: 'string', description: 'Encrypt .env.<env> instead of .env' },
    key: { type: 'string', description: 'The key (base64:…); prefer the STRUT_ENV_KEY variable' },
    force: { type: 'boolean', description: 'Overwrite an existing encrypted file' },
  },
  help: ['Examples:', '  node strut env:encrypt --env=production', '  STRUT_ENV_KEY=base64:… node strut env:encrypt --env=production --force'],
  run({ app, options, output }) {
    const source = envFile(app.basePath, options.env)
    if (!existsSync(source.path)) throw new StrutvaneError('NO_ENV_FILE', `${source.label} does not exist.`, 'Create it first, then encrypt it.')
    const target = `${source.path}.encrypted`
    if (existsSync(target) && !options.force) throw new StrutvaneError('FILE_EXISTS', `${source.label}.encrypted already exists, so nothing was written.`, 'Add --force to replace it.')
    const given = keyFrom(options.key)
    const keyText = given ?? `base64:${randomBytes(32).toString('base64')}`
    const sealed = seal(parseEnvKey(keyText), readFileSync(source.path), AAD)
    writeFileAtomic(target, `${HEADER}\n${packSealed(sealed).toString('base64')}\n`)
    output.line(`  ✔ Encrypted ${source.label} into ${source.label}.encrypted.`)
    if (given === undefined) {
      output.line('')
      output.line('  Decryption key (shown once, never saved; keep it in your secrets manager or CI secrets):')
      output.line(`  ${keyText}`)
    }
  },
})

/** `node strut env:decrypt`. */
export const envDecryptCommand = defineCommand({
  name: 'env:decrypt',
  description: 'Decrypt .env.encrypted (or .env.<env>.encrypted)',
  needsBoot: false,
  options: {
    env: { type: 'string', description: 'Decrypt .env.<env>.encrypted' },
    key: { type: 'string', description: 'The key (base64:…); prefer the STRUT_ENV_KEY variable' },
    force: { type: 'boolean', description: 'Overwrite an existing decrypted file' },
  },
  run({ app, options, output }) {
    const target = envFile(app.basePath, options.env)
    const source = `${target.path}.encrypted`
    if (!existsSync(source)) throw new StrutvaneError('NO_ENCRYPTED_FILE', `${target.label}.encrypted does not exist.`, 'Encrypt it first with node strut env:encrypt.')
    const keyText = keyFrom(options.key)
    if (keyText === undefined) throw new StrutvaneError('NO_ENV_KEY', 'No decryption key was given.', 'Set STRUT_ENV_KEY (preferred) or pass --key=base64:….')
    if (existsSync(target.path) && !options.force) throw new StrutvaneError('FILE_EXISTS', `${target.label} already exists, so nothing was written.`, 'Add --force to replace it.')
    const [header, body = ''] = readFileSync(source, 'utf8').split('\n')
    let plaintext: Buffer
    try {
      if (header !== HEADER || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.trim())) throw new DecryptError()
      plaintext = openSealed(parseEnvKey(keyText), unpackSealed(Buffer.from(body.trim(), 'base64')), AAD)
    } catch (error) {
      if (error instanceof StrutvaneError) throw error
      throw new StrutvaneError('DECRYPT_FAILED', `${target.label}.encrypted could not be decrypted, so nothing was written.`, 'Check the key (STRUT_ENV_KEY or --key) and that the file was not changed.')
    }
    writeFileAtomic(target.path, plaintext, { mode: 0o600 })
    output.line(`  ✔ Decrypted ${target.label}.encrypted into ${target.label}.`)
  },
})
