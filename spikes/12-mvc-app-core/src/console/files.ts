/**
 * Safe file writing for generators: never overwrite without `--force`, create folders lazily
 * (Laravel creates `app/Policies` only when the first policy is made), always LF line endings.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { StrutvaneError } from '../support/errors.ts'

/**
 * Write a new file under the app. Returns the relative path, for the "Created …" message.
 *
 * @example
 * writeNewFile('/srv/blog', 'app/policies/post.policy.ts', source, false)
 */
export function writeNewFile(basePath: string, relativePath: string, content: string, force: boolean): string {
  const target = join(basePath, relativePath)
  if (existsSync(target) && !force) {
    throw new StrutvaneError('FILE_EXISTS', `${relativePath} already exists, so nothing was written.`, 'Pick another name, or add --force to overwrite it (your changes in that file would be lost).')
  }
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content.replace(/\r\n/g, '\n'), 'utf8')
  return relativePath
}

/**
 * Write a file only if it doesn't exist yet. Returns the path when written, `undefined` when it
 * was already there (used for companions like the policy of a new controller).
 *
 * @example
 * writeIfMissing('/srv/blog', 'app/policies/post.policy.ts', source)
 */
export function writeIfMissing(basePath: string, relativePath: string, content: string): string | undefined {
  if (existsSync(join(basePath, relativePath))) return undefined
  return writeNewFile(basePath, relativePath, content, false)
}
