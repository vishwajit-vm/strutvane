/** A batch of complete NDJSON lines that all belong to one UTC day. */
export interface Batch {
  readonly text: string
  readonly bytes: number
  readonly records: number
  readonly dayKey: string
}

/**
 * Where log lines go. `write` resolves once the batch is handed to the OS (or rejects); the logger
 * never calls `write` again before the previous call settled, so implementations need no locking.
 */
export interface Transport {
  readonly name: string
  write(batch: Batch): Promise<void>
  /** Flush OS-level buffers if the transport has any; idempotent. */
  flush?(): Promise<void>
  close(): Promise<void>
}

/** Low-level append-only file writer (one open file). */
export interface FileWriter {
  append(text: string, bytes: number): Promise<void>
  close(): Promise<void>
}

export type FileWriterFactory = (path: string) => Promise<FileWriter>
