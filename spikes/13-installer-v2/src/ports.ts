/**
 * Free-port checks, so a second app (or a database already running) never blocks setup.
 *
 * Why two checks: on Windows, binding `127.0.0.1:3306` can succeed even when another program
 * listens on `0.0.0.0:3306` (no exclusive address use by default), so "can I listen?" alone can say
 * "free" for a busy port. A quick connect attempt catches that case.
 *
 * @module
 */
import { createConnection, createServer } from 'node:net'

/** Answers "is this TCP port free on 127.0.0.1?". Injectable so tests choose busy ports. */
export type PortProbe = (port: number) => Promise<boolean>

/** Does something accept connections on 127.0.0.1:port? Gives up after 300 ms. */
function somethingListens(port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    const finish = (listening: boolean) => {
      socket.destroy()
      resolvePromise(listening)
    }
    socket.setTimeout(300, () => finish(false))
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
  })
}

/** Can we listen on 127.0.0.1:port ourselves? The test server is closed right away. */
function canListen(port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const server = createServer()
    server.once('error', () => resolvePromise(false))
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      server.close(() => resolvePromise(true))
    })
  })
}

/**
 * The real {@link PortProbe}: free when nothing answers a connect AND we can listen.
 *
 * @example
 * await isPortFree(3000) // true when no dev server runs
 */
export const isPortFree: PortProbe = async (port) => !(await somethingListens(port)) && (await canListen(port))

/** No free port was found in the searched range. */
export class NoFreePortError extends Error {
  constructor(first: number, last: number) {
    super(
      `Ports ${first} to ${last} are all in use. Stop another app or database that uses them, ` +
        'or set a different port in .env, then run: npm run setup',
    )
    this.name = 'NoFreePortError'
  }
}

/**
 * The first free port from `preferred` upwards (at most `tries` ports are checked).
 *
 * @example
 * await pickFreePort(3306, isPortFree) // 3306, or 3307 when MySQL already runs locally
 */
export async function pickFreePort(preferred: number, probe: PortProbe, tries = 20): Promise<number> {
  for (let port = preferred; port < preferred + tries; port += 1) {
    if (await probe(port)) return port
  }
  throw new NoFreePortError(preferred, preferred + tries - 1)
}
