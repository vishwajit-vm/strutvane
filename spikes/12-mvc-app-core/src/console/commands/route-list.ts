import { actionLabel } from '../../routing/router.ts'
import { defineCommand } from '../command.ts'
import { renderTable } from '../table.ts'

/**
 * `node strut route:list`: every route with its method, URI, name, action and middleware,
 * Laravel's `php artisan route:list`. Booting the app first means a broken route (unknown
 * middleware, missing binding, no policy) fails here, before any request.
 *
 * @example
 * node strut route:list --path=posts
 * node strut route:list --json
 */
export const routeListCommand = defineCommand({
  name: 'route:list',
  description: 'List every registered route',
  options: {
    path: { type: 'string', description: 'Only routes whose URI contains this text' },
    name: { type: 'string', description: 'Only routes whose name contains this text' },
    json: { type: 'boolean', description: 'Print JSON for scripts and agents' },
  },
  help: ['Examples:', '  node strut route:list --path=posts', '  node strut route:list --json'],
  run({ app, options, output }) {
    const rows = app.routes
      .filter((route) => options.path === undefined || route.uri.includes(options.path))
      .filter((route) => options.name === undefined || (route.name ?? '').includes(options.name))
      .map((route) => ({ method: route.methods.join('|'), uri: route.uri, name: route.name ?? '', action: actionLabel(route.action), middleware: route.middleware.join(', ') }))
    if (options.json) {
      output.line(JSON.stringify(rows, null, 2))
      return
    }
    output.line(renderTable(['Method', 'URI', 'Name', 'Action', 'Middleware'], rows.map((row) => [row.method, row.uri, row.name, row.action, row.middleware])))
    output.line(`\n  Showing ${rows.length} of ${app.routes.length} routes.`)
  },
})
