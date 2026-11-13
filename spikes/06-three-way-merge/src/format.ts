/**
 * Optional formatter step that reduces merge noise.
 *
 * Generated templates are emitted in Strutvane's style; users usually run their own formatter
 * (Biome, Prettier) on ejected files, which reflows lines. Reflow makes *every* reformatted line
 * look changed and turns harmless template updates into conflicts. Formatting `base` and
 * `theirs` with the USER's formatter (and the user's config) before merging puts all three
 * inputs in the same style.
 *
 * Formatting is purely a noise reducer, never a correctness requirement, so every failure
 * (formatter missing, syntax error, timeout) falls back to the unformatted text with a note.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

/** A pluggable formatter. Implementations must be deterministic and idempotent. */
export interface Formatter {
  readonly name: string
  /** Format `text` as if it lived at `filePath` (relative to the project root). */
  format(text: string, filePath: string): Promise<string>
}

/** Result of a fail-soft formatting attempt. */
export interface FormatOutcome {
  readonly text: string
  readonly formatted: boolean
  readonly note?: string
}

/** Run a formatter, falling back to the original text on any failure. */
export async function tryFormat(formatter: Formatter, text: string, filePath: string): Promise<FormatOutcome> {
  try {
    return { text: await formatter.format(text, filePath), formatted: true }
  } catch (error) {
    const reason = error instanceof Error ? error.message.split('\n')[0] : String(error)
    return { text, formatted: false, note: `${formatter.name} could not format ${filePath}: ${reason}` }
  }
}

/**
 * Biome via its CLI (`biome format --stdin-file-path`), run in the user's project directory.
 *
 * Why the CLI and not `@biomejs/js-api`: the CLI discovers and applies the user's own
 * `biome.json` (including `extends`, overrides and ignore rules) exactly as their editor and CI
 * do. The JS API needs the configuration passed in manually, which risks formatting with
 * different settings than the user's, which is precisely the noise we are trying to remove.
 * The cost is a process spawn per file; acceptable for an upgrade command.
 */
export function createBiomeCliFormatter(options: { readonly cwd: string; readonly timeoutMs?: number; readonly biomeBin?: string }): Formatter {
  const bin = options.biomeBin ?? resolveBiomeBin(options.cwd)
  const timeoutMs = options.timeoutMs ?? 15_000
  return {
    name: 'biome',
    format: (text, filePath) =>
      new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [bin, 'format', `--stdin-file-path=${filePath}`], {
          cwd: options.cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        })
        const stdout: Buffer[] = []
        const stderr: Buffer[] = []
        const timer = setTimeout(() => {
          child.kill()
          reject(new Error(`timed out after ${timeoutMs} ms`))
        }, timeoutMs)
        child.stdout.on('data', (c: Buffer) => stdout.push(c))
        child.stderr.on('data', (c: Buffer) => stderr.push(c))
        child.on('error', (e) => {
          clearTimeout(timer)
          reject(e)
        })
        child.on('close', (code) => {
          clearTimeout(timer)
          if (code === 0) resolve(Buffer.concat(stdout).toString('utf8'))
          else reject(new Error(Buffer.concat(stderr).toString('utf8').trim() || `exit code ${code}`))
        })
        child.stdin.end(text, 'utf8')
      }),
  }
}

/** Find the Biome CLI entry point installed in the project (never a global install). */
function resolveBiomeBin(cwd: string): string {
  const require = createRequire(`${cwd.replace(/[\\/]$/, '')}/package.json`)
  return require.resolve('@biomejs/biome/bin/biome')
}
