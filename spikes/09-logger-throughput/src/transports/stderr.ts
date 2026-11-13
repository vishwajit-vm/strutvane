/**
 * The fallback transport. Writes to stderr (or an injected stream in tests). It must be the most
 * boring code in the package: it never rejects and never throws, whatever the stream does.
 */
import type { Batch, Transport } from './types.ts'

export interface WritableLike {
  write(chunk: string): unknown
}

export function stderrTransport(stream: WritableLike = process.stderr): Transport {
  return {
    name: 'stderr',
    write(batch: Batch): Promise<void> {
      try {
        stream.write(batch.text)
      } catch {
        // Nowhere left to report to. Swallowing is the only safe option for a fallback.
      }
      return Promise.resolve()
    },
    close(): Promise<void> {
      return Promise.resolve()
    },
  }
}
