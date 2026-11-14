/**
 * Running external programs (node, npm, docker, git) safely on every OS, Windows included.
 *
 * The rules, and why:
 * - **Never a shell.** With `shell: true`, cmd.exe interprets `&`, `|`, `^` and `%` in arguments
 *   (verified: `a&b` ran `b`). Node also deprecates passing args with `shell: true` (DEP0190).
 * - **Never a `.cmd`/`.bat`/`.ps1` shim.** Node refuses to spawn `.cmd`/`.bat` without a shell
 *   (CVE-2024-27980 fix), and `.ps1` needs PowerShell's execution policy. npm is run as
 *   `node <npm-cli.js>` instead (see npm-cli.ts); docker and git are real `.exe` files.
 * - **Output is captured and logged,** so a failure can show its last lines and the log path.
 *
 * @module
 */
import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync, statSync } from 'node:fs'
import { dirname, extname, posix, win32 } from 'node:path'

/**
 * One command to run.
 *
 * @example
 * const spec: CommandSpec = { command: process.execPath, args: [npmCli, 'install'], cwd: dir }
 */
export interface CommandSpec {
  /** An executable path or name (`node.exe`, `docker`, `git`). Never a shell script. */
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: string
  /** Extra environment variables, merged over the current environment. */
  readonly env?: Readonly<Record<string, string>>
  /** Text sent to the program's stdin (then stdin is closed). */
  readonly input?: string
  /** Append the command line and all of its output to this file. */
  readonly logFile?: string
  /** Show the output live in this terminal instead of capturing it (for `npm run dev`). */
  readonly inherit?: boolean
  /** Values replaced by `[redacted]` in the log file (passwords handed to the program). */
  readonly redact?: readonly string[]
}

/**
 * What happened. `code` is the exit code, or `-1` when the program could not start at all.
 *
 * @example
 * if (result.notFound) reporter.error('Docker is not installed')
 */
export interface CommandResult {
  readonly code: number
  /** stdout and stderr together, in arrival order (empty with `inherit`). */
  readonly output: string
  /** `true` when the executable does not exist (ENOENT): "not installed", not "failed". */
  readonly notFound: boolean
}

/** Runs one command. Injectable, so tests can fake every external program. */
export type Spawner = (spec: CommandSpec) => Promise<CommandResult>

/** Extensions that would need a shell on Windows. */
const SHELL_ONLY = new Set(['.cmd', '.bat', '.ps1'])

/** A command that can only run through a shell was requested; the message says what to do. */
export class UnsafeCommandError extends Error {
  constructor(command: string) {
    super(
      `Refusing to run "${command}": .cmd, .bat and .ps1 files need a shell, which would let ` +
        'characters like & and % in arguments run other commands. Run the underlying program ' +
        'instead (for npm: node <path to npm-cli.js>).',
    )
    this.name = 'UnsafeCommandError'
  }
}

/**
 * Throw {@link UnsafeCommandError} for shell-only scripts. Called before every spawn.
 *
 * @example
 * assertNoShellNeeded('npm.cmd') // throws
 * assertNoShellNeeded('C:\\Program Files\\nodejs\\node.exe') // ok
 */
export function assertNoShellNeeded(command: string): void {
  if (SHELL_ONLY.has(extname(command).toLowerCase())) throw new UnsafeCommandError(command)
}

/**
 * Turn a bare program name (`git`, `docker`) into an absolute path by walking PATH.
 *
 * Why (security review F-25): for a bare name, Windows process creation may look in the current
 * folder first, so a `git.exe` planted in a downloaded project could run instead of the real git.
 * We only accept absolute PATH entries, and on Windows only `.exe`/`.com` (never `.cmd`/`.bat`).
 * Paths (anything with a slash) are returned unchanged.
 *
 * @param exists - file check (tests inject one)
 *
 * @example
 * resolveExecutable('git', process.env.PATH ?? '', process.platform) // 'C:\\Program Files\\Git\\cmd\\git.exe'
 */
export function resolveExecutable(
  name: string,
  pathVariable: string,
  platform: NodeJS.Platform,
  exists: (path: string) => boolean = isFile,
): string | undefined {
  if (/[/\\]/.test(name)) return name
  const windows = platform === 'win32'
  const pathApi = windows ? win32 : posix
  const extensions = windows && extname(name) === '' ? ['.exe', '.com'] : ['']
  const folders = pathVariable
    .split(windows ? ';' : ':')
    .map((folder) => folder.replace(/^"|"$/g, '')) // Windows PATH entries may be quoted
    .filter((folder) => folder.length > 0 && pathApi.isAbsolute(folder)) // never ".", never relative
  for (const folder of folders) {
    for (const extension of extensions) {
      const candidate = pathApi.join(folder, name + extension)
      if (exists(candidate)) return candidate
    }
  }
  return undefined
}

/** Is there a regular file at this path? */
function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/**
 * Quote an argument for the log only (never for execution: we never use a shell).
 *
 * @example
 * displayArg('my app') // '"my app"'
 */
export function displayArg(arg: string): string {
  return /[\s"&|^%<>]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg
}

/**
 * The real {@link Spawner}: `child_process.spawn` with `shell: false`, hidden console windows on
 * Windows, and output captured to memory and the log file.
 *
 * @example
 * const result = await nodeSpawner({ command: 'git', args: ['--version'], cwd: process.cwd() })
 */
export const nodeSpawner: Spawner = (spec) =>
  new Promise((resolvePromise) => {
    assertNoShellNeeded(spec.command)
    const executable = resolveExecutable(spec.command, process.env['PATH'] ?? '', process.platform)
    if (executable === undefined) {
      resolvePromise({ code: -1, output: `${spec.command} was not found on PATH`, notFound: true })
      return
    }
    const log = createLog(spec)
    let output = ''
    const child = spawn(executable, [...spec.args], {
      cwd: spec.cwd,
      env: { ...process.env, ...spec.env },
      shell: false, // explicit: see the module comment
      windowsHide: true, // no console window flashing up for each git/docker call on Windows
      stdio: spec.inherit === true ? 'inherit' : ['pipe', 'pipe', 'pipe'],
    })
    const collect = (chunk: Buffer) => {
      const text = chunk.toString()
      output += text
      log(text)
    }
    child.stdout?.on('data', collect)
    child.stderr?.on('data', collect)
    if (child.stdin !== null) child.stdin.end(spec.input ?? '')
    child.on('error', (error: NodeJS.ErrnoException) => {
      log(`\n[could not start: ${error.message}]\n`)
      resolvePromise({ code: -1, output: error.message, notFound: error.code === 'ENOENT' })
    })
    child.on('close', (code) => {
      log(`\n[exit code ${code ?? -1}]\n`)
      resolvePromise({ code: code ?? -1, output, notFound: false })
    })
  })

/** A function that appends to the spec's log file, or does nothing when there is none. */
function createLog(spec: CommandSpec): (text: string) => void {
  const file = spec.logFile
  if (file === undefined) return () => {}
  mkdirSync(dirname(file), { recursive: true })
  const commandLine = [spec.command, ...spec.args].map(displayArg).join(' ')
  const hide = (text: string) => redactValues(text, spec.redact ?? [])
  appendFileSync(file, `\n$ ${hide(commandLine)}\n`)
  return (text) => appendFileSync(file, hide(text))
}

/**
 * Replace every occurrence of each secret with `[redacted]`. Values shorter than 6 characters are
 * ignored: replacing "a" everywhere would wreck the log without protecting anything.
 *
 * @example
 * redactValues('password is hunter2-hunter2', ['hunter2-hunter2']) // 'password is [redacted]'
 */
export function redactValues(text: string, secrets: readonly string[]): string {
  let result = text
  for (const secret of secrets) {
    if (secret.length >= 6) result = result.split(secret).join('[redacted]')
  }
  return result
}

/**
 * The last `count` non-empty lines of some output, for "here is what went wrong" messages.
 *
 * @example
 * lastLines('a\nb\n\nc\n', 2) // ['b', 'c']
 */
export function lastLines(output: string, count: number): string[] {
  return output
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(-count)
}
