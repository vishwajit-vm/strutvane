/**
 * The minimal file-system surface the upgrade engine needs. Injected (rather than importing
 * `node:fs` directly) so tests can simulate failures, such as a rename that fails halfway
 * through a commit, and prove the transaction rolls back.
 *
 * All paths are absolute.
 */
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'

export interface Fs {
  /** Read a UTF-8 file, or `undefined` if it does not exist. */
  readText(path: string): Promise<string | undefined>
  /** Write a UTF-8 file, creating parent directories. */
  writeText(path: string, content: string): Promise<void>
  /** Atomically move a file over another (same volume). */
  rename(from: string, to: string): Promise<void>
  /** Remove a file or directory (recursive); no error if missing. */
  remove(path: string): Promise<void>
  exists(path: string): Promise<boolean>
  /** List files under `dir` recursively as POSIX paths relative to `dir`, skipping `ignore` dirs. */
  listFiles(dir: string, ignore: readonly string[]): Promise<string[]>
}

export const nodeFs: Fs = {
  async readText(path) {
    try {
      return await readFile(path, 'utf8')
    } catch (error) {
      if (isNotFound(error)) return undefined
      throw error
    }
  },
  async writeText(path, content) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content, 'utf8')
  },
  async rename(from, to) {
    await mkdir(dirname(to), { recursive: true })
    await rename(from, to)
  },
  async remove(path) {
    await rm(path, { recursive: true, force: true })
  },
  async exists(path) {
    try {
      await stat(path)
      return true
    } catch (error) {
      if (isNotFound(error)) return false
      throw error
    }
  },
  async listFiles(dir, ignore) {
    const results: string[] = []
    const walk = async (current: string): Promise<void> => {
      for (const entry of await readdir(current, { withFileTypes: true })) {
        const full = join(current, entry.name)
        if (entry.isDirectory()) {
          if (!ignore.includes(entry.name)) await walk(full)
        } else if (entry.isFile()) {
          results.push(relative(dir, full).split(sep).join('/'))
        }
      }
    }
    await walk(dir)
    return results.sort()
  },
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT'
}
