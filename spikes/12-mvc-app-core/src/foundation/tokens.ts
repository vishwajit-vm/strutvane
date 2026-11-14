/**
 * The container tokens the core binds at boot. Apps and packages resolve these instead of
 * importing globals, and tests rebind them (a fixed clock, a memory logger).
 */
import type { Logger } from '../support/log.ts'
import { token } from './container.ts'
import type { ConfigRepository } from './config.ts'

/**
 * The current time. Rebind it in tests to make throttling and timestamps deterministic.
 *
 * @example
 * app.container.instance(ClockToken, () => new Date('2026-11-14T10:00:00Z'))
 */
export const ClockToken = token<() => Date>('Clock')

/**
 * Where the core reports exceptions and lifecycle events.
 *
 * @example
 * app.make(LoggerToken).info('Hello')
 */
export const LoggerToken = token<Logger>('Logger')

/**
 * The loaded config repository.
 *
 * @example
 * app.make(ConfigToken).get('app.name')
 */
export const ConfigToken = token<ConfigRepository>('Config')
