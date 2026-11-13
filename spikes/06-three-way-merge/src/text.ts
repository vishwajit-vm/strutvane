/**
 * Text normalisation helpers shared by the merge engine.
 *
 * All merging happens on LF-only, BOM-free text split into lines. The *user's* conventions
 * (line ending, BOM, final newline) are recorded first and restored on output, so normalising
 * never changes how the user's file looks on disk.
 */

/** A line ending style. */
export type Eol = '\n' | '\r\n'

/** What we learned about a text before normalising it. */
export interface TextShape {
  /** Dominant line ending (majority vote; LF when there are no line breaks). */
  readonly eol: Eol
  /** True when the text contained both CRLF and lone LF line breaks. */
  readonly mixedEol: boolean
  /** True when the text started with a UTF-8 byte-order mark. */
  readonly bom: boolean
  /** True when the text ended with a line break. */
  readonly finalNewline: boolean
}

const BOM = '﻿'

/** Inspect a text's line endings, BOM and final newline. */
export function shapeOf(text: string): TextShape {
  const crlf = (text.match(/\r\n/g) ?? []).length
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length
  return {
    eol: crlf > lf ? '\r\n' : '\n',
    mixedEol: crlf > 0 && lf > 0,
    bom: text.startsWith(BOM),
    finalNewline: /\r?\n$/.test(text),
  }
}

/**
 * Split text into lines after removing the BOM and normalising all line endings (CRLF, lone CR)
 * to LF. A trailing line break does not produce an empty last line.
 */
export function toLines(text: string): string[] {
  const body = (text.startsWith(BOM) ? text.slice(1) : text).replace(/\r\n?/g, '\n')
  if (body === '') return []
  const lines = body.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

/**
 * Three-way merge of file conventions, exactly like lines: if the user did not change a
 * convention relative to the base, the new template's choice wins; if the user changed it, the
 * user's choice is kept. (Example: Git checked the file out with CRLF on Windows while templates
 * are LF; the user "changed" the line ending, so CRLF is kept.)
 */
export function mergeShapes(base: TextShape, ours: TextShape, theirs: TextShape): TextShape {
  const pick = <K extends keyof TextShape>(k: K): TextShape[K] => (ours[k] === base[k] ? theirs[k] : ours[k])
  const userChangedEol = ours.eol !== base.eol || ours.mixedEol
  return {
    eol: userChangedEol ? ours.eol : theirs.eol,
    mixedEol: ours.mixedEol,
    bom: pick('bom'),
    finalNewline: pick('finalNewline'),
  }
}

/** Join lines back into text using the given shape (line ending, BOM, final newline). */
export function fromLines(lines: readonly string[], shape: Pick<TextShape, 'eol' | 'bom' | 'finalNewline'>): string {
  if (lines.length === 0) return shape.bom ? BOM : ''
  const body = lines.join(shape.eol) + (shape.finalNewline ? shape.eol : '')
  return shape.bom ? BOM + body : body
}

/**
 * The comparison key of a line. With `ignoreTrailingWhitespace`, lines that differ only by
 * trailing spaces/tabs compare equal (editors and formatters add/remove them constantly).
 * Keys are only used to decide *what changed*; output is always built from original lines.
 */
export function lineKey(line: string, ignoreTrailingWhitespace: boolean): string {
  return ignoreTrailingWhitespace ? line.replace(/[ \t]+$/, '') : line
}
