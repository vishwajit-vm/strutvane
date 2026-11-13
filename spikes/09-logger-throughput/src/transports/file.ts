/**
 * Two interchangeable append-only file writers, so the benchmark can compare them:
 *
 * - `ownFileWriter`: Node's FileHandle opened with flag 'a' (O_APPEND / FILE_APPEND_DATA). Each
 *   batch is ONE `write` of whole lines; partial writes are completed in a loop, so a line is never
 *   left half-written by us.
 * - `sonicBoomWriter`: pino's MIT `sonic-boom` (async mode) — the fastest known Node file writer.
 */
import { open } from 'node:fs/promises'
import { createRequire } from 'node:module'
import type { FileWriter, FileWriterFactory } from './types.ts'

// sonic-boom is CommonJS: its runtime export is the class itself, while its types describe a named
// export. createRequire gives the real runtime value with the correct type.
const SonicBoom = createRequire(import.meta.url)('sonic-boom') as typeof import('sonic-boom').SonicBoom

export const ownFileWriter: FileWriterFactory = async (path) => {
  const handle = await open(path, 'a')
  return {
    async append(text: string, bytes: number): Promise<void> {
      const buf = Buffer.from(text, 'utf8')
      let offset = 0
      while (offset < bytes) {
        const { bytesWritten } = await handle.write(buf, offset, bytes - offset, null)
        if (bytesWritten <= 0) throw new Error('write returned 0 bytes')
        offset += bytesWritten
      }
    },
    async close(): Promise<void> {
      await handle.close()
    },
  }
}

export const sonicBoomWriter: FileWriterFactory = (path) =>
  new Promise<FileWriter>((resolve, reject) => {
    const sonic = new SonicBoom({ dest: path, append: true, sync: false, mkdir: false })
    let failure: Error | undefined
    const onOpenError = (err: Error): void => reject(err)
    sonic.once('error', onOpenError)
    sonic.once('ready', () => {
      sonic.off('error', onOpenError)
      sonic.on('error', (err: Error) => {
        failure = err
      })
      resolve({
        append(text: string): Promise<void> {
          if (failure) return Promise.reject(failure)
          // `write` buffers; resolve immediately unless sonic-boom asks us to back off.
          const ok = sonic.write(text)
          if (ok) return Promise.resolve()
          return new Promise<void>((res, rej) => {
            const onDrain = (): void => {
              sonic.off('error', onErr)
              res()
            }
            const onErr = (err: Error): void => {
              sonic.off('drain', onDrain)
              rej(err)
            }
            sonic.once('drain', onDrain)
            sonic.once('error', onErr)
          })
        },
        close(): Promise<void> {
          return new Promise<void>((res) => {
            try {
              sonic.flush((flushErr?: Error | null) => {
                void flushErr
                sonic.end()
                res()
              })
            } catch {
              res()
            }
          })
        },
      })
    })
  })
