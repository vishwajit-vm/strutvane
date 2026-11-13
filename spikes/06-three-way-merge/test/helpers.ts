/** Test helpers: temp projects, initial ejection, fault-injecting file systems. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Fs } from '../src/fs.ts'
import { nodeFs } from '../src/fs.ts'
import { sha256 } from '../src/hash.ts'
import { basePath, type LockFile, lockPath, serializeLock } from '../src/lock.ts'
import type { TemplateOutput } from '../src/upgrade.ts'

export async function tempProject(): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), 'sv-upgrade-'))
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) }
}

/** Simulate `sv eject` at an older template version: write files, base copies and the lock. */
export async function eject(root: string, outputs: readonly TemplateOutput[]): Promise<void> {
  const files: LockFile['files'] = {}
  for (const o of outputs) {
    await nodeFs.writeText(join(root, o.path), o.content)
    await nodeFs.writeText(basePath(root, o.path), o.content)
    files[o.path] = { template: o.template, templateVersion: o.version, baseSha256: sha256(o.content), status: 'active', conflicted: false }
  }
  await nodeFs.writeText(lockPath(root), serializeLock({ lockfileVersion: 1, files }))
}

/** Snapshot every file under root (path → content), for "nothing changed" assertions. */
export async function snapshot(root: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const f of await nodeFs.listFiles(root, [])) out[f] = (await nodeFs.readText(join(root, f))) ?? ''
  return out
}

/**
 * A file system whose `rename` fails on the Nth call. With `dieAfterFailure`, every later
 * operation also fails, which simulates the process dying mid-commit (no rollback possible).
 */
export function faultyFs(failOnRename: number, options: { dieAfterFailure?: boolean } = {}): Fs {
  let renames = 0
  let dead = false
  const guard = <A extends unknown[], R>(fn: (...args: A) => Promise<R>) => async (...args: A): Promise<R> => {
    if (dead) throw new Error('simulated crash: process is gone')
    return fn(...args)
  }
  return {
    readText: guard(nodeFs.readText),
    writeText: guard(nodeFs.writeText),
    remove: guard(nodeFs.remove),
    exists: guard(nodeFs.exists),
    listFiles: guard(nodeFs.listFiles),
    rename: guard(async (from: string, to: string) => {
      renames++
      if (renames === failOnRename) {
        if (options.dieAfterFailure) dead = true
        throw new Error(`simulated rename failure #${renames}`)
      }
      return nodeFs.rename(from, to)
    }),
  }
}
