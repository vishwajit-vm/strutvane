import type { AnyCommand } from '../command.ts'
import { aboutCommand } from './about.ts'
import { makeControllerCommand } from './make-controller.ts'
import { makeMigrationCommand } from './make-migration.ts'
import { modelShowCommand } from './model-show.ts'
import { routeListCommand } from './route-list.ts'
import { serveCommand } from './serve.ts'

/**
 * The commands every app has. Apps add theirs with `withCommands([...])`, and packages with
 * `app.addCommand(...)` in their provider.
 *
 * @example
 * coreCommands.map((command) => command.name) // ['about', 'make:controller', …]
 */
export const coreCommands: readonly AnyCommand[] = [aboutCommand, makeControllerCommand, makeMigrationCommand, modelShowCommand, routeListCommand, serveCommand]
