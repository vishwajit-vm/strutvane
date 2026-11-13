/**
 * Daily files + size cap + retention (RFC-0004 §4).
 *
 * File names (UTC days; a `tag` separates writers when several processes log — see spike Q6):
 *   2026-11-14.ndjson, 2026-11-14-1.ndjson, 2026-11-14-2.ndjson          (single writer)
 *   2026-11-14.w1234.ndjson, 2026-11-14.w1234-1.ndjson                    (tagged writer)
 *
 * Rotation never renames or truncates a file: a new day or a new part is a NEW file. A reader that
 * is tailing the old file therefore never sees it change underneath it, and never reads a torn line
 * as long as it only consumes up to the last '\n' (see `test/rotation.test.ts`).
 */
import { mkdir, readdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type { Batch, FileWriter, FileWriterFactory, Transport } from './transports/types.ts'

export interface RotatingOptions {
  readonly dir: string
  /** Size cap per file in bytes (default 30 MB). */
  readonly maxFileBytes?: number
  /** Delete files older than this many days (default 60). 0 disables retention. */
  readonly retentionDays?: number
  readonly writer: FileWriterFactory
  /** Writer tag for multi-process setups, e.g. `w${process.pid}`. */
  readonly tag?: string
  /** Injectable clock (ms) for tests. */
  readonly now?: () => number
}

const FILE_RE = /^(\d{4}-\d{2}-\d{2})(?:\.([A-Za-z0-9_]+))?(?:-(\d+))?\.ndjson$/

export function fileName(dayKey: string, part: number, tag?: string): string {
  return `${dayKey}${tag ? `.${tag}` : ''}${part > 0 ? `-${part}` : ''}.ndjson`
}

export function rotatingFileTransport(options: RotatingOptions): Transport & { readonly currentFile: () => string | undefined } {
  const maxFileBytes = options.maxFileBytes ?? 30 * 1024 * 1024
  const retentionDays = options.retentionDays ?? 60
  const now = options.now ?? Date.now
  let dayKey: string | undefined
  let part = 0
  let size = 0
  let writer: FileWriter | undefined
  let path: string | undefined

  const openPart = async (day: string): Promise<void> => {
    await mkdir(options.dir, { recursive: true })
    // Resume after a restart: continue the newest part of today that still has room.
    for (;;) {
      const candidate = join(options.dir, fileName(day, part, options.tag))
      const existing = await stat(candidate).catch(() => undefined)
      if (!existing || existing.size < maxFileBytes) {
        size = existing?.size ?? 0
        path = candidate
        writer = await options.writer(candidate)
        return
      }
      part++
    }
  }

  const close = async (): Promise<void> => {
    const w = writer
    writer = undefined
    if (w) await w.close()
  }

  return {
    name: 'file',
    currentFile: () => path,
    async write(batch: Batch): Promise<void> {
      if (batch.dayKey !== dayKey || !writer) {
        if (batch.dayKey !== dayKey) {
          await close()
          dayKey = batch.dayKey
          part = 0
          if (retentionDays > 0) await applyRetention(options.dir, retentionDays, now()).catch(() => undefined)
        }
        await openPart(batch.dayKey)
      } else if (size > 0 && size + batch.bytes > maxFileBytes) {
        await close()
        part++
        await openPart(batch.dayKey)
      }
      const w = writer
      if (!w) throw new Error('log file is not open')
      try {
        await w.append(batch.text, batch.bytes)
      } catch (error) {
        // Force a reopen on the next write (the directory may come back).
        await close().catch(() => undefined)
        throw error
      }
      size += batch.bytes
    },
    close,
  }
}

/** Delete log files whose day is older than `days` before `nowMs`. Never touches other files. */
export async function applyRetention(dir: string, days: number, nowMs: number): Promise<string[]> {
  const cutoff = dayKeyOf(nowMs - days * 86_400_000)
  const deleted: string[] = []
  for (const name of await readdir(dir)) {
    const m = FILE_RE.exec(name)
    if (!m || !m[1] || m[1] >= cutoff) continue
    try {
      await unlink(join(dir, name))
      deleted.push(name)
    } catch {
      // In use or already gone: try again at the next rotation.
    }
  }
  return deleted
}

/**
 * Order log files chronologically: by day, then writer tag, then part NUMBER.
 *
 * Plain string sorting is wrong: '.' (0x2E) sorts after '-' (0x2D), so `2026-11-14.ndjson` (part 0)
 * would come AFTER `2026-11-14-17.ndjson`, and `-10` before `-2`. The viewer and any tooling must
 * use this comparator (found by this spike).
 */
export function compareLogFiles(a: string, b: string): number {
  const pa = FILE_RE.exec(a)
  const pb = FILE_RE.exec(b)
  if (!pa || !pb) return a < b ? -1 : a > b ? 1 : 0
  const [, dayA = '', tagA = '', partA = '0'] = pa
  const [, dayB = '', tagB = '', partB = '0'] = pb
  if (dayA !== dayB) return dayA < dayB ? -1 : 1
  if (tagA !== tagB) return tagA < tagB ? -1 : 1
  return Number(partA) - Number(partB)
}

/** UTC day key `YYYY-MM-DD` of a timestamp. */
export function dayKeyOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}
