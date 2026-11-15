import type { AnyCommand } from '../command.ts'
import { aboutCommand } from './about.ts'
import { cacheClearCommand, cacheForgetCommand } from './cache-store.ts'
import { configCacheCommand, configClearCommand, eventCacheCommand, eventClearCommand, eventListCommand, optimizeClearCommand, optimizeCommand, routeCacheCommand, routeClearCommand } from './caches.ts'
import { envDecryptCommand, envEncryptCommand } from './env-crypt.ts'
import { keyGenerateCommand, keyRotateCommand } from './keys.ts'
import { makeControllerCommand } from './make-controller.ts'
import { makeMigrationCommand } from './make-migration.ts'
import { downCommand, upCommand } from './maintenance.ts'
import { modelShowCommand } from './model-show.ts'
import { routeListCommand } from './route-list.ts'
import { securityCheckCommand } from './security-check.ts'
import { serveCommand } from './serve.ts'
import { sessionFlushCommand } from './session-flush.ts'

/**
 * The commands every app has. Apps add theirs with `withCommands([...])`, and packages with
 * `app.addCommand(...)` in their provider.
 *
 * @example
 * coreCommands.map((command) => command.name) // ['about', 'make:controller', …]
 */
export const coreCommands: readonly AnyCommand[] = [
  aboutCommand,
  makeControllerCommand,
  makeMigrationCommand,
  modelShowCommand,
  routeListCommand,
  serveCommand,
  optimizeCommand,
  optimizeClearCommand,
  configCacheCommand,
  configClearCommand,
  routeCacheCommand,
  routeClearCommand,
  eventCacheCommand,
  eventClearCommand,
  eventListCommand,
  cacheClearCommand,
  cacheForgetCommand,
  keyGenerateCommand,
  keyRotateCommand,
  envEncryptCommand,
  envDecryptCommand,
  downCommand,
  upCommand,
  sessionFlushCommand,
  securityCheckCommand,
]
