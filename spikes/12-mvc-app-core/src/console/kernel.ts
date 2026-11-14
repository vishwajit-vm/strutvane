/**
 * The console kernel behind `node strut <command>`: Laravel's artisan.
 *
 * - `node strut` / `node strut list` lists every command, grouped by namespace.
 * - `node strut help <command>` (or `<command> --help`) prints usage, arguments, options, examples.
 * - Unknown commands and options get a "Did you mean …?" instead of a stack trace.
 * - Developer mistakes (`StrutvaneError`) print the message and the fix, and exit 1.
 */
import { parseArgs } from 'node:util'
import type { Application } from '../foundation/application.ts'
import { runInApplication } from '../foundation/context.ts'
import { StrutvaneError } from '../support/errors.ts'
import { closestMatch } from '../support/str.ts'
import type { AnyCommand, OptionSpec, Output } from './command.ts'
import { coreCommands } from './commands/index.ts'

/**
 * Options for {@link runConsole}; tests pass a buffer and a fixed clock.
 *
 * @example
 * await runConsole(app, ['route:list'], { output: buffer, now: () => new Date('2026-11-14T10:00:00Z') })
 */
export interface ConsoleOptions {
  readonly output?: Output
  readonly now?: () => Date
}

/** Writes to the real stdout and stderr. */
const processOutput: Output = {
  line: (text = '') => process.stdout.write(`${text}\n`),
  error: (text) => process.stderr.write(`${text}\n`),
}

/**
 * Run one command line. Returns the exit code instead of exiting, so it is testable.
 *
 * @example
 * process.exitCode = await runConsole(app, process.argv.slice(2))
 */
export async function runConsole(app: Application, argv: readonly string[], options: ConsoleOptions = {}): Promise<number> {
  const output = options.output ?? processOutput
  const commands = allCommands(app)
  // --force-debug is global (any command that boots), so it's taken out before parsing.
  if (argv.includes('--force-debug')) app.forceDebug()
  const [name, ...rest] = argv.filter((argument) => argument !== '--force-debug')
  try {
    if (name === undefined || name === 'list') return listCommands(commands, output)
    if (name === 'help' || name === '--help' || name === '-h') return helpFor(rest[0], commands, output)
    const command = commands.get(name)
    if (command === undefined) return unknownCommand(name, commands, output)
    if (rest.includes('--help') || rest.includes('-h')) return helpFor(name, commands, output)
    const parsed = parseCommandLine(command, rest)
    if (command.needsBoot !== false) await app.boot()
    const code = await runInApplication(app, () => command.run({ app, args: parsed.args, options: parsed.options, output, now: options.now ?? (() => new Date()) }))
    return typeof code === 'number' ? code : 0
  } catch (error) {
    if (error instanceof StrutvaneError) {
      output.error(`\n  ✖ ${error.message}\n  → ${error.hint}\n`)
      return 1
    }
    throw error
  }
}

function allCommands(app: Application): Map<string, AnyCommand> {
  const commands = new Map<string, AnyCommand>()
  for (const command of coreCommands) commands.set(command.name, command)
  // App and package commands may replace a core command on purpose (same name).
  for (const command of app.commands) commands.set(command.name, command)
  return commands
}

function listCommands(commands: ReadonlyMap<string, AnyCommand>, output: Output): number {
  output.line('Strutvane console. Usage: node strut <command> [arguments] [options]')
  output.line('')
  const width = Math.max(...[...commands.keys()].map((name) => name.length)) + 2
  const groups = new Map<string, AnyCommand[]>()
  for (const command of [...commands.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    const group = command.name.includes(':') ? (command.name.split(':')[0] ?? '') : ''
    groups.set(group, [...(groups.get(group) ?? []), command])
  }
  for (const [group, members] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    output.line(group === '' ? 'Available commands:' : ` ${group}`)
    for (const command of members) output.line(`  ${command.name.padEnd(width)}${command.description}`)
  }
  output.line('')
  output.line('Run `node strut help <command>` for details.')
  return 0
}

function helpFor(name: string | undefined, commands: ReadonlyMap<string, AnyCommand>, output: Output): number {
  if (name === undefined) return listCommands(commands, output)
  const command = commands.get(name)
  if (command === undefined) return unknownCommand(name, commands, output)
  const args = (command.arguments ?? []).map((arg) => (arg.required === true ? `<${arg.name}>` : `[${arg.name}]`)).join(' ')
  output.line(command.description)
  output.line('')
  output.line(`Usage: node strut ${command.name}${args === '' ? '' : ` ${args}`}${Object.keys(command.options ?? {}).length > 0 ? ' [options]' : ''}`)
  if ((command.arguments ?? []).length > 0) {
    output.line('')
    output.line('Arguments:')
    for (const arg of command.arguments ?? []) output.line(`  ${arg.name.padEnd(20)}${arg.description}${arg.required === true ? ' (required)' : ''}`)
  }
  const entries = Object.entries(command.options ?? {})
  if (entries.length > 0) {
    output.line('')
    output.line('Options:')
    for (const [option, spec] of entries) output.line(`  ${optionLabel(option, spec).padEnd(20)}${spec.description}`)
  }
  if ((command.help ?? []).length > 0) {
    output.line('')
    for (const line of command.help ?? []) output.line(line)
  }
  return 0
}

function optionLabel(name: string, spec: OptionSpec): string {
  const short = spec.short === undefined ? '' : `-${spec.short}, `
  return `${short}--${name}${spec.type === 'string' ? '=<value>' : ''}`
}

function unknownCommand(name: string, commands: ReadonlyMap<string, AnyCommand>, output: Output): number {
  const suggestion = closestMatch(name, [...commands.keys()])
  output.error(`\n  ✖ There is no "${name}" command.`)
  output.error(suggestion === undefined ? '  → Run `node strut list` to see every command.\n' : `  → Did you mean \`node strut ${suggestion}\`?\n`)
  return 1
}

/**
 * Parse arguments and options against the command's declaration, with friendly errors.
 */
function parseCommandLine(command: AnyCommand, argv: readonly string[]): { args: string[]; options: Record<string, string | boolean | undefined> } {
  const specs = command.options ?? {}
  const parseOptions: Record<string, { type: 'boolean' | 'string'; short?: string }> = {}
  for (const [name, spec] of Object.entries(specs)) parseOptions[name] = spec.short === undefined ? { type: spec.type } : { type: spec.type, short: spec.short }
  let parsed: ReturnType<typeof parseArgs>
  try {
    parsed = parseArgs({ args: [...argv], options: parseOptions, allowPositionals: true, strict: true })
  } catch (error) {
    throw friendlyParseError(command, error)
  }
  const options: Record<string, string | boolean | undefined> = {}
  for (const [name, spec] of Object.entries(specs)) {
    const value = parsed.values[name]
    options[name] = spec.type === 'boolean' ? value === true : typeof value === 'string' ? value : undefined
  }
  const missing = (command.arguments ?? []).filter((arg, index) => arg.required === true && parsed.positionals[index] === undefined)
  if (missing.length > 0) {
    throw new StrutvaneError('MISSING_ARGUMENT', `${command.name} needs ${missing.map((arg) => `<${arg.name}>`).join(' ')}.`, `Example: node strut ${command.name} ${(command.arguments ?? []).map((arg) => `<${arg.name}>`).join(' ')}  (more: node strut help ${command.name})`)
  }
  return { args: parsed.positionals, options }
}

function friendlyParseError(command: AnyCommand, error: unknown): StrutvaneError {
  const message = error instanceof Error ? error.message : String(error)
  const unknown = /Unknown option '(-{1,2})([^']+)'/.exec(message)
  if (unknown !== null) {
    const suggestion = closestMatch(unknown[2] ?? '', Object.keys(command.options ?? {}))
    return new StrutvaneError('UNKNOWN_OPTION', `${command.name} has no ${unknown[1] ?? '--'}${unknown[2] ?? ''} option.`, suggestion === undefined ? `See the options with: node strut help ${command.name}` : `Did you mean --${suggestion}?`)
  }
  return new StrutvaneError('INVALID_ARGUMENTS', `${command.name}: ${message}`, `See the usage with: node strut help ${command.name}`)
}
