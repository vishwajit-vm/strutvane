/**
 * Optional search index for the log viewer (RFC-0004 open question 3), using Node's built-in
 * `node:sqlite` (no native dependency to install). NDJSON files stay the source of truth; the index
 * stores the fields the viewer filters on plus the file/offset of each line, and can be rebuilt.
 */
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

export interface IndexQuery {
  readonly level?: string
  readonly fromMs?: number
  readonly toMs?: number
  readonly traceId?: string
  readonly text?: string
  readonly limit?: number
}

export interface IndexedLine {
  time: number
  level: string
  msg: string
  traceId: string | null
  line: string
}

export class LogIndex {
  private readonly db: DatabaseSync

  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS logs (
        time INTEGER NOT NULL, level TEXT NOT NULL, trace_id TEXT, msg TEXT NOT NULL,
        line TEXT NOT NULL, file TEXT NOT NULL, offset INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS logs_time ON logs(time);
      CREATE INDEX IF NOT EXISTS logs_level_time ON logs(level, time);
      CREATE INDEX IF NOT EXISTS logs_trace ON logs(trace_id);
    `)
  }

  /** Index every complete line of an NDJSON file. Returns the number of lines indexed. */
  ingestFile(path: string): number {
    const text = readFileSync(path, 'utf8')
    const insert = this.db.prepare('INSERT INTO logs (time, level, trace_id, msg, line, file, offset) VALUES (?, ?, ?, ?, ?, ?, ?)')
    let offset = 0
    let n = 0
    this.db.exec('BEGIN')
    try {
      for (const line of text.split('\n')) {
        const lineOffset = offset
        offset += Buffer.byteLength(line) + 1
        if (!line) continue
        try {
          const r = JSON.parse(line) as { time?: number; level?: string; msg?: string; traceId?: string }
          insert.run(r.time ?? 0, r.level ?? 'info', r.traceId ?? null, r.msg ?? '', line, path, lineOffset)
          n++
        } catch {
          // A torn/foreign line is skipped, never fatal.
        }
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return n
  }

  query(q: IndexQuery): IndexedLine[] {
    const where: string[] = []
    const params: Array<string | number> = []
    if (q.level) {
      where.push('level = ?')
      params.push(q.level)
    }
    if (q.fromMs !== undefined) {
      where.push('time >= ?')
      params.push(q.fromMs)
    }
    if (q.toMs !== undefined) {
      where.push('time < ?')
      params.push(q.toMs)
    }
    if (q.traceId) {
      where.push('trace_id = ?')
      params.push(q.traceId)
    }
    if (q.text) {
      where.push("instr(lower(msg), lower(?)) > 0") // literal substring, no LIKE wildcards
      params.push(q.text)
    }
    const sql = `SELECT time, level, msg, trace_id AS traceId, line FROM logs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY time DESC LIMIT ?`
    params.push(q.limit ?? 100)
    return this.db.prepare(sql).all(...params) as unknown as IndexedLine[]
  }

  close(): void {
    this.db.close()
  }
}
