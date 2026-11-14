/**
 * Docker Compose helpers shared by the Docker-mode steps.
 *
 * Every call passes `-p <project>` (from `.env`), `--env-file .env` and `-f docker/compose.yaml`,
 * and runs in the project folder, so the installer can only ever touch this project's containers
 * and volumes, never another app's.
 *
 * @module
 */
import { composeProjectName } from '../names.ts'
import type { CommandResult } from '../spawn.ts'
import { envValue } from './env-io.ts'
import type { StepContext } from './types.ts'

/**
 * The `docker compose` arguments for this project.
 *
 * @example
 * composeArgs(context, 'up', '-d') // ['compose', '-p', 'my-app', '--env-file', '.env', '-f', 'docker/compose.yaml', 'up', '-d']
 */
export function composeArgs(context: StepContext, ...rest: string[]): string[] {
  const project = envValue(context.directory, 'COMPOSE_PROJECT_NAME') ?? composeProjectName(context.options.name)
  return ['compose', '-p', project, '--env-file', '.env', '-f', 'docker/compose.yaml', ...rest]
}

/** Extra settings for {@link compose}. */
export interface ComposeSettings {
  /** Environment variables for the docker CLI (forwarded into the container with `-e NAME`). */
  readonly env?: Readonly<Record<string, string>>
  /** Values hidden in the log. */
  readonly redact?: readonly string[]
}

/**
 * Run `docker compose <args>` for this project, logged.
 *
 * @example
 * await compose(context, ['up', '-d', '--wait'])
 */
export function compose(context: StepContext, args: readonly string[], settings: ComposeSettings = {}): Promise<CommandResult> {
  return context.spawn({
    command: context.dockerCommand,
    args: composeArgs(context, ...args),
    cwd: context.directory,
    logFile: context.logFile,
    ...(settings.env === undefined ? {} : { env: settings.env }),
    ...(settings.redact === undefined ? {} : { redact: settings.redact }),
  })
}

/**
 * Run a command inside the running app container: `docker compose exec -T app <command...>`.
 * `-T`: no terminal, because the output is captured into the setup log.
 *
 * @example
 * await execInApp(context, ['npm', 'ci', '--ignore-scripts'])
 */
export function execInApp(context: StepContext, command: readonly string[], settings: ComposeSettings & { readonly user?: string } = {}): Promise<CommandResult> {
  const forwarded = Object.keys(settings.env ?? {}).flatMap((name) => ['-e', name]) // values stay off argv
  const user = settings.user === undefined ? [] : ['-u', settings.user]
  return compose(context, ['exec', '-T', ...user, ...forwarded, 'app', ...command], settings)
}
