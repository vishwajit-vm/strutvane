/**
 * Step "ports": make sure the app port (and the Docker database port) are free, moving to the next
 * free port when one is taken, and writing the result into `.env`.
 *
 * Why before Docker starts: `docker compose up` with a busy port fails late and with a cryptic
 * message. Checking first turns that into "port 3306 is in use; using 3307".
 *
 * @module
 */
import { parseEnv, setEnvValue } from '../env-file.ts'
import { NoFreePortError, pickFreePort } from '../ports.ts'
import { DEFAULT_PORTS } from '../templates/env.ts'
import { readEnvFile, writeEnvFile } from './env-io.ts'
import { failed, type Step, type StepContext } from './types.ts'

/** One port setting to check. */
interface PortSetting {
  readonly key: 'APP_PORT' | 'FORWARD_DB_PORT' | 'FORWARD_MAILPIT_PORT'
  readonly fallback: number
}

/**
 * The host ports these options publish: the app always; in Docker mode also the database (for
 * GUI clients) and the Mailpit inbox. Ports inside containers never clash, so they are not checked.
 */
function portSettings(context: StepContext): PortSetting[] {
  const settings: PortSetting[] = [{ key: 'APP_PORT', fallback: DEFAULT_PORTS.app }]
  const { database, docker } = context.options
  if (!docker) return settings
  if (database !== 'sqlite') settings.push({ key: 'FORWARD_DB_PORT', fallback: DEFAULT_PORTS[database] })
  settings.push({ key: 'FORWARD_MAILPIT_PORT', fallback: DEFAULT_PORTS.mailpit })
  return settings
}

/**
 * The ports step.
 *
 * @example
 * await portsStep.run(context) // { status: 'done', message: 'Ports checked (3000 free; 3306 in use, using 3307)' }
 */
export const portsStep: Step = {
  id: 'ports',
  title: 'Checking ports',
  needs: () => ['files'],
  applies: () => true,
  run: async (context) => {
    let text = readEnvFile(context.directory)
    const env = parseEnv(text)
    const notes: string[] = []
    try {
      for (const setting of portSettings(context)) {
        const wanted = Number(env.get(setting.key) ?? setting.fallback) || setting.fallback
        const port = await pickFreePort(wanted, context.isPortFree)
        if (port === wanted) {
          notes.push(`${port} free`)
          continue
        }
        notes.push(`${wanted} in use, using ${port}`)
        text = setEnvValue(text, setting.key, String(port))
        // The app URL carries the port too; keep them in step.
        if (setting.key === 'APP_PORT') text = setEnvValue(text, 'APP_URL', `http://localhost:${port}`)
      }
    } catch (error) {
      if (error instanceof NoFreePortError) return failed('command-failed', error.message, 'Free a port, then choose Retry.')
      throw error
    }
    writeEnvFile(context.directory, '.env', text)
    return { status: 'done', message: `Ports checked (${notes.join('; ')})` }
  },
}
