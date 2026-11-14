/**
 * Read an error's stack and show the code around where it was thrown, like Ignition. Only files
 * inside the app's base path are shown, so the page never prints framework or dependency
 * internals (and never reads arbitrary files named in a crafted stack).
 */
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * One stack frame.
 *
 * @example
 * const frame: StackFrame = { file: '/app/app/http/controllers/post.controller.ts', line: 12, column: 5, functionName: 'PostController.show' }
 */
export interface StackFrame {
  readonly file: string
  readonly line: number
  readonly column: number
  readonly functionName: string
}

/**
 * A few lines of source around a frame. `highlight` is the line that threw.
 *
 * @example
 * frame.lines.find((line) => line.number === frame.highlight)?.text // 'throw new Error(…)'
 */
export interface CodeFrame {
  /** Path relative to the app root, with forward slashes. */
  readonly file: string
  readonly highlight: number
  readonly lines: readonly { readonly number: number; readonly text: string }[]
}

const FRAME = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/

/**
 * Parse a V8 stack trace into frames, skipping `node:` internals.
 *
 * @example
 * parseStack(new Error('x').stack ?? '')[0]?.file
 */
export function parseStack(stack: string): StackFrame[] {
  const frames: StackFrame[] = []
  for (const line of stack.split('\n')) {
    const match = FRAME.exec(line)
    if (match === null) continue
    const [, functionName = '<anonymous>', location = '', lineNumber = '0', column = '0'] = match
    if (location.startsWith('node:')) continue
    frames.push({ file: toPath(location), line: Number(lineNumber), column: Number(column), functionName })
  }
  return frames
}

function toPath(location: string): string {
  if (!location.startsWith('file://')) return location
  // Vitest and Node may add a query string (`?v=123`) to module URLs; it is not part of the path.
  return fileURLToPath(location.replace(/\?.*$/, ''))
}

/**
 * The first frame that points into the app's own code (not `node_modules`, not the framework).
 *
 * @example
 * appFrame(frames, '/srv/blog')?.file // '/srv/blog/app/http/controllers/post.controller.ts'
 */
export function appFrame(frames: readonly StackFrame[], basePath: string): StackFrame | undefined {
  return frames.find((frame) => isInside(frame.file, basePath) && !frame.file.includes('node_modules'))
}

/**
 * Lines around a frame, read from disk. `undefined` when the file is outside the app or gone.
 *
 * @example
 * codeFrame(frame, '/srv/blog', 5)
 */
export function codeFrame(frame: StackFrame, basePath: string, context = 5): CodeFrame | undefined {
  if (!isInside(frame.file, basePath) || !existsSync(frame.file)) return undefined
  const source = readFileSync(frame.file, 'utf8').split(/\r?\n/)
  const first = Math.max(1, frame.line - context)
  const last = Math.min(source.length, frame.line + context)
  const lines: { number: number; text: string }[] = []
  for (let number = first; number <= last; number += 1) lines.push({ number, text: source[number - 1] ?? '' })
  return { file: relative(basePath, frame.file).replace(/\\/g, '/'), highlight: frame.line, lines }
}

function isInside(file: string, basePath: string): boolean {
  if (!isAbsolute(file)) return false
  const path = relative(resolve(basePath), resolve(file))
  return path !== '' && !path.startsWith('..') && !isAbsolute(path)
}
