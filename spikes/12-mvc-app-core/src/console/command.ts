/**
 * Console commands: what `node strut <command>` runs. Laravel's artisan commands, as plain typed
 * objects (no `$signature` mini-language to parse): arguments and options are declared as data,
 * so `help` output, validation and the option types all come from one place.
 */
import type { Application } from '../foundation/application.ts'

/**
 * Where commands write. The kernel passes stdout/stderr; tests pass a buffer.
 *
 * @example
 * output.line('Created app/http/controllers/post.controller.ts')
 */
export interface Output {
  /** A normal line on stdout. */
  line(text?: string): void
  /** A line on stderr. */
  error(text: string): void
}

/**
 * One option: `--resource` (boolean) or `--model=Post` (string).
 *
 * @example
 * const resource: OptionSpec = { type: 'boolean', description: 'Generate the 7 resource actions' }
 */
export interface OptionSpec {
  readonly type: 'boolean' | 'string'
  readonly description: string
  /** One-letter alias: `-r`. */
  readonly short?: string
}

/**
 * The parsed option values, typed from the specs: booleans are `boolean`, strings `string | undefined`.
 *
 * @example
 * type V = OptionValues<{ resource: { type: 'boolean'; description: '' } }> // { resource: boolean }
 */
export type OptionValues<TOptions extends Readonly<Record<string, OptionSpec>>> = {
  readonly [Name in keyof TOptions]: TOptions[Name]['type'] extends 'boolean' ? boolean : string | undefined
}

/**
 * A positional argument.
 *
 * @example
 * const name: ArgumentSpec = { name: 'name', description: 'The controller class name', required: true }
 */
export interface ArgumentSpec {
  readonly name: string
  readonly description: string
  readonly required?: boolean
}

/**
 * What a command's `run` receives.
 *
 * @example
 * run({ args, options, output }) { output.line(`Hello ${args[0] ?? 'world'}`) }
 */
export interface CommandContext<TValues> {
  /** The booted application. */
  readonly app: Application
  readonly args: readonly string[]
  readonly options: TValues
  readonly output: Output
  /** The current time (fixed in tests, so generated file names are deterministic). */
  readonly now: () => Date
}

/**
 * A command definition.
 *
 * @example
 * export const hello = defineCommand({
 *   name: 'hello',
 *   description: 'Say hello',
 *   options: { loud: { type: 'boolean', description: 'Shout' } },
 *   run({ options, output }) { output.line(options.loud ? 'HELLO' : 'hello') },
 * })
 */
export interface Command<TOptions extends Readonly<Record<string, OptionSpec>> = Readonly<Record<string, OptionSpec>>> {
  /** `make:controller`, `route:list`… Namespaced with a colon, like artisan. */
  readonly name: string
  readonly description: string
  readonly arguments?: readonly ArgumentSpec[]
  readonly options?: TOptions
  /** Extra lines for `node strut help <command>`, such as examples. */
  readonly help?: readonly string[]
  /** `false` for commands that only write files (`make:*`): they run even when .env is incomplete. */
  readonly needsBoot?: boolean
  /** Return an exit code (0 = success); nothing means 0. */
  run(context: CommandContext<OptionValues<TOptions>>): void | number | Promise<void | number>
}

/**
 * A command with its option types erased, as stored in the registry.
 *
 * @example
 * const commands: AnyCommand[] = [routeList, about]
 */
export interface AnyCommand {
  readonly name: string
  readonly description: string
  readonly arguments?: readonly ArgumentSpec[]
  readonly options?: Readonly<Record<string, OptionSpec>>
  readonly help?: readonly string[]
  readonly needsBoot?: boolean
  run(context: CommandContext<Readonly<Record<string, string | boolean | undefined>>>): void | number | Promise<void | number>
}

/**
 * Declare a command. The `const` type parameter keeps the option names and types literal, so
 * `options.resource` is a `boolean` and `options.model` a `string | undefined` inside `run`.
 *
 * @example
 * export default defineCommand({ name: 'inspire', description: 'Print a quote', run: ({ output }) => output.line('Simplicity is the soul of efficiency.') })
 */
export function defineCommand<const TOptions extends Readonly<Record<string, OptionSpec>> = Record<never, OptionSpec>>(command: Command<TOptions>): AnyCommand {
  // The kernel builds `options` from `command.options`, so the erased type is safe at runtime.
  return command as unknown as AnyCommand
}
