/**
 * Upgrade state: the smallest amount of information needed to three-way merge ejected files.
 *
 *   .strutvane/lock.json          which files were ejected from which template version
 *   .strutvane/base/<path>        the pristine template output at that version (the merge base)
 *
 * Design rules:
 *   - The lock is validated with a schema on every read; anything invalid is treated as
 *     "corrupt" (backed up, never silently trusted).
 *   - Every base copy is verified against the sha256 recorded in the lock. A missing or altered
 *     base downgrades that file to a two-way merge instead of producing a wrong three-way merge.
 *   - Writes are atomic (temp file + rename), so a crash never leaves a half-written lock.
 */
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { z } from 'zod'
import type { Fs } from './fs.ts'
import { sha256 } from './hash.ts'

/** A project-relative POSIX path without traversal: what we accept as a lock key. */
const RelativePath = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith('/') && !/^[a-zA-Z]:/.test(p) && !p.split('/').includes('..') && !p.includes('\\'), {
    message: 'must be a relative POSIX path inside the project',
  })

export const LockEntrySchema = z.object({
  /** Template id, e.g. `framework/controller`. */
  template: z.string().min(1),
  /** Template version that produced the base, e.g. `1.2.0`. */
  templateVersion: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
  /** sha256 (hex) of `.strutvane/base/<path>`. */
  baseSha256: z.string().regex(/^[a-f0-9]{64}$/),
  /** `active` normally; `deleted-by-user` once the user deleted the file (never recreated). */
  status: z.enum(['active', 'deleted-by-user']).default('active'),
  /** True after an upgrade left conflict markers that the user has not resolved yet. */
  conflicted: z.boolean().default(false),
})

export const LockFileSchema = z.object({
  lockfileVersion: z.literal(1),
  files: z.record(RelativePath, LockEntrySchema),
})

export type LockEntry = z.infer<typeof LockEntrySchema>
export type LockFile = z.infer<typeof LockFileSchema>

export const STATE_DIR = '.strutvane'

export function lockPath(root: string): string {
  return join(root, STATE_DIR, 'lock.json')
}

export function basePath(root: string, file: string): string {
  return join(root, STATE_DIR, 'base', ...file.split('/'))
}

export type LockReadResult =
  | { readonly status: 'ok'; readonly lock: LockFile }
  | { readonly status: 'missing' }
  | { readonly status: 'corrupt'; readonly reason: string; readonly backupPath: string }

/** Read and validate the lock. A corrupt lock is copied aside (never deleted) and reported. */
export async function readLock(fs: Fs, root: string): Promise<LockReadResult> {
  const path = lockPath(root)
  const raw = await fs.readText(path)
  if (raw === undefined) return { status: 'missing' }
  let reason: string
  try {
    const parsed = LockFileSchema.safeParse(JSON.parse(raw))
    if (parsed.success) return { status: 'ok', lock: parsed.data }
    reason = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
  } catch (error) {
    reason = `invalid JSON: ${error instanceof Error ? error.message : String(error)}`
  }
  const backupPath = `${path}.corrupt-${Date.now()}`
  await fs.writeText(backupPath, raw)
  return { status: 'corrupt', reason, backupPath }
}

/** Serialise a lock deterministically (sorted keys) so diffs in version control stay small. */
export function serializeLock(lock: LockFile): string {
  const files = Object.fromEntries(Object.entries(lock.files).sort(([x], [y]) => x.localeCompare(y)))
  return `${JSON.stringify({ lockfileVersion: lock.lockfileVersion, files }, null, 2)}\n`
}

/** Write a file atomically: write a sibling temp file, then rename it over the target. */
export async function writeAtomic(fs: Fs, path: string, content: string): Promise<void> {
  const tmp = `${path}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`
  await fs.writeText(tmp, content)
  try {
    await fs.rename(tmp, path)
  } catch (error) {
    await fs.remove(tmp)
    throw error
  }
}

export type BaseReadResult =
  | { readonly status: 'ok'; readonly content: string }
  | { readonly status: 'missing' }
  | { readonly status: 'mismatch'; readonly expected: string; readonly actual: string }

/** Read a base copy and verify it against the lock's hash. */
export async function readBase(fs: Fs, root: string, file: string, entry: LockEntry): Promise<BaseReadResult> {
  const content = await fs.readText(basePath(root, file))
  if (content === undefined) return { status: 'missing' }
  const actual = sha256(content)
  return actual === entry.baseSha256 ? { status: 'ok', content } : { status: 'mismatch', expected: entry.baseSha256, actual }
}
