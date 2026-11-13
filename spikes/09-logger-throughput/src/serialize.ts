/**
 * Record → exactly ONE line of NDJSON. Never throws.
 *
 * - JSON.stringify escapes CR, LF and every control character (incl. ESC for ANSI codes and NUL),
 *   so a message can never forge extra log lines or colour a terminal (log-injection safe).
 * - U+2028/U+2029 are not escaped by JSON.stringify; some viewers treat them as line breaks, so we
 *   escape them explicitly.
 * - Records larger than `maxBytes` are replaced by a small, well-formed marker record, so one huge
 *   log call can never blow up memory, the disk or the viewer.
 */

/** U+2028 / U+2029, built from char codes so the source never contains a literal line separator. */
export const LINE_SEPARATOR: string = String.fromCharCode(0x2028)
export const PARAGRAPH_SEPARATOR: string = String.fromCharCode(0x2029)
const BACKSLASH = String.fromCharCode(0x5c)

export function serializeRecord(record: Record<string, unknown>, maxBytes: number): string {
  let json: string
  try {
    json = JSON.stringify(record)
  } catch (error) {
    json = JSON.stringify({
      time: record.time,
      level: record.level,
      msg: safeSlice(record.msg),
      serializationError: error instanceof Error ? error.message : 'unknown',
    })
  }
  if (json.includes(LINE_SEPARATOR) || json.includes(PARAGRAPH_SEPARATOR)) {
    // Replace the raw characters with the 6-character JSON escapes (backslash, 'u', 4 hex digits).
    json = json.split(LINE_SEPARATOR).join(`${BACKSLASH}u2028`).split(PARAGRAPH_SEPARATOR).join(`${BACKSLASH}u2029`)
  }
  // Byte length only matters near the limit; JSON is ≤ 3 bytes per UTF-16 unit.
  if (json.length * 3 > maxBytes) {
    const bytes = Buffer.byteLength(json)
    if (bytes > maxBytes) {
      json = JSON.stringify({
        time: record.time,
        level: record.level,
        msg: safeSlice(record.msg),
        truncated: true,
        originalBytes: bytes,
      })
    }
  }
  return `${json}\n`
}

function safeSlice(msg: unknown): string {
  return typeof msg === 'string' ? msg.slice(0, 1024) : '[non-string message]'
}

/**
 * Fast path used when redaction is off: try a plain JSON.stringify (fast, native) and only fall back
 * to the full sanitizer when it throws (circular, BigInt) — the common case pays nothing extra.
 */
export function tryFastStringify(record: Record<string, unknown>): string | undefined {
  try {
    return JSON.stringify(record)
  } catch {
    return undefined
  }
}
