/**
 * `#strutvane/console`: the `node strut` kernel and the command API.
 */
export { defineCommand, type AnyCommand, type Command, type CommandContext, type OptionSpec, type Output } from './console/command.ts'
export { runConsole, type ConsoleOptions } from './console/kernel.ts'
export { coreCommands } from './console/commands/index.ts'
export { renderTable } from './console/table.ts'
