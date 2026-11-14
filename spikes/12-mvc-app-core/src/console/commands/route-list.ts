import { describeOptOut, securityProfile } from '../../http/security-profile.ts'
import { actionLabel } from '../../routing/router.ts'
import { SecurityToken } from '../../security/settings.ts'
import { defineCommand } from '../command.ts'
import { renderTable } from '../table.ts'

/**
 * `node strut route:list`: every route with its method, URI, name, action and middleware,
 * Laravel's `php artisan route:list`. Booting the app first means a broken route (unknown
 * middleware, missing binding, no policy) fails here, before any request.
 *
 * `--security` swaps the middleware column for the protections that really apply (after groups,
 * the route, the controller and wrappers) and flags every opt-out and every unsafe route without
 * a CSRF check, so a reviewer sees the security surface in one table.
 *
 * @example
 * node strut route:list --path=posts
 * node strut route:list --security
 * node strut route:list --json
 */
export const routeListCommand = defineCommand({
  name: 'route:list',
  description: 'List every registered route',
  options: {
    path: { type: 'string', description: 'Only routes whose URI contains this text' },
    name: { type: 'string', description: 'Only routes whose name contains this text' },
    security: { type: 'boolean', description: 'Show the protections, opt-outs and warnings of each route' },
    json: { type: 'boolean', description: 'Print JSON for scripts and agents' },
  },
  help: ['Examples:', '  node strut route:list --path=posts', '  node strut route:list --security', '  node strut route:list --json'],
  run({ app, options, output }) {
    const routes = app.routes
      .filter((route) => options.path === undefined || route.uri.includes(options.path))
      .filter((route) => options.name === undefined || (route.name ?? '').includes(options.name))
    if (options.security) {
      const security = app.make(SecurityToken)
      const rows = routes.map((route) => ({ method: route.methods.join('|'), uri: route.uri, name: route.name ?? '', ...securityProfile(route, app.routeMiddleware(route), security) }))
      if (options.json) {
        output.line(JSON.stringify(rows, null, 2))
        return
      }
      output.line(renderTable(['Method', 'URI', 'Name', 'Protections', 'Opt-outs', 'Warnings'], rows.map((row) => [row.method, row.uri, row.name, row.protections.join(', ') || '(none)', row.optOuts.map(describeOptOut).map((text) => `! ${text}`).join(', '), row.warnings.map((text) => `! ${text}`).join(', ')])))
      const optOuts = rows.reduce((total, row) => total + row.optOuts.length, 0)
      const warnings = rows.reduce((total, row) => total + row.warnings.length, 0)
      output.line(`\n  ${rows.length} routes, ${optOuts} opt-out${optOuts === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}.`)
      return
    }
    const rows = routes.map((route) => ({ method: route.methods.join('|'), uri: route.uri, name: route.name ?? '', action: actionLabel(route.action), middleware: route.middleware.join(', ') }))
    if (options.json) {
      output.line(JSON.stringify(rows, null, 2))
      return
    }
    output.line(renderTable(['Method', 'URI', 'Name', 'Action', 'Middleware'], rows.map((row) => [row.method, row.uri, row.name, row.action, row.middleware])))
    output.line(`\n  Showing ${rows.length} of ${app.routes.length} routes.`)
  },
})
