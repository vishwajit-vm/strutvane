import { ConnectionToken } from '../../database/connection.ts'
import { MetadataToken } from '../../database/metadata.ts'
import { defineCommand } from '../command.ts'

/**
 * `node strut about`: a one-screen summary of the app, Laravel's `php artisan about`. Useful in
 * bug reports: it never prints secrets (no keys, no passwords, no full database URLs).
 *
 * @example
 * node strut about
 * node strut about --json
 */
export const aboutCommand = defineCommand({
  name: 'about',
  description: 'Show the app name, environment, database, routes and providers',
  options: { json: { type: 'boolean', description: 'Print JSON for scripts and agents' } },
  run({ app, options, output }) {
    const database = String(app.config.get('database.default'))
    const metadata = app.container.has(MetadataToken) ? safely(() => app.make(MetadataToken).resources.map((resource) => resource.table)) : []
    const summary = {
      application: { name: String(app.config.get('app.name')), environment: app.environment, debug: app.showsDebugDetails, url: String(app.config.get('app.url')) },
      runtime: { node: process.version, platform: process.platform },
      database: { connection: database, driverLoaded: app.container.has(ConnectionToken), tables: metadata },
      http: { routes: app.routes.length, namedRoutes: app.routes.filter((route) => route.name !== undefined).length },
      console: { commands: app.commands.length },
      navigation: app.navigation.items.map((item) => item.label),
    }
    if (options.json) {
      output.line(JSON.stringify(summary, null, 2))
      return
    }
    for (const [section, values] of Object.entries(summary)) {
      output.line(`\n  ${section[0]?.toUpperCase() ?? ''}${section.slice(1)}`)
      if (Array.isArray(values)) output.line(`    ${values.join(', ') || '(none)'}`)
      else for (const [key, value] of Object.entries(values)) output.line(`    ${key.padEnd(14)}${Array.isArray(value) ? value.join(', ') : String(value)}`)
    }
    output.line('')
  },
})

/** Metadata may not be generated yet; `about` should still print everything else. */
function safely(read: () => string[]): string[] {
  try {
    return read()
  } catch {
    return ['(run migrations to generate .strutvane/resources.json)']
  }
}
