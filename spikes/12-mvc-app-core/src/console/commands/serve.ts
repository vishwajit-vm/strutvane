import { serve } from '@hono/node-server'
import { defineCommand } from '../command.ts'

/**
 * `node strut serve`: run the app on Node's HTTP server, Laravel's `php artisan serve`.
 *
 * It listens on 127.0.0.1 by default (security review F-19): a development server should not be
 * reachable from the network unless you ask with `--host=0.0.0.0`.
 *
 * @example
 * node strut serve --port=8000
 */
export const serveCommand = defineCommand({
  name: 'serve',
  description: 'Serve the application on the local HTTP server',
  options: {
    host: { type: 'string', description: 'The address to listen on (default 127.0.0.1)' },
    port: { type: 'string', description: 'The port (default 3000)' },
  },
  async run({ app, options, output }) {
    const port = Number(options.port ?? '3000')
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      output.error(`  ✖ "${options.port ?? ''}" is not a port number. Use a whole number from 1 to 65535, for example --port=8000.`)
      return 1
    }
    const hostname = options.host ?? '127.0.0.1'
    await new Promise<void>((resolve) => {
      const server = serve({ fetch: (request, env) => app.handle(request, peer(env.incoming.socket.remoteAddress)), port, hostname }, (info) => {
        output.line(`  Server running on http://${hostname}:${info.port}  (Ctrl+C to stop)`)
      })
      // Close the listener and the database on Ctrl+C, then let the command finish.
      process.once('SIGINT', () => {
        server.close(() => {
          void app.shutdown().then(resolve)
        })
      })
    })
    return 0
  },
})

/** The socket's peer address. Proxy headers are not trusted until `trustedProxies` exists. */
function peer(ip: string | undefined): { ip?: string } {
  return ip === undefined ? {} : { ip }
}
