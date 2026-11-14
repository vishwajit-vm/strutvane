/**
 * Run the example adapter locally: `npm run serve:example` → http://127.0.0.1:3000.
 *
 * An in-memory SQLite database, every feature on, and a mailer that prints the mail KIND and the
 * recipient only (links are secrets; read them from the store in a debugger if you need one).
 * Development only: the APP_KEY is random per run, so every restart signs everyone out.
 */
import { randomBytes } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { createAuth, createAuthServer, defineAuthConfig, sqliteAuthStore, sqliteCounterStore } from '../src/index.ts'

const db = new DatabaseSync(':memory:')
const auth = createAuth({
  config: defineAuthConfig({
    appUrl: 'http://localhost:3000',
    features: { registration: true, emailVerification: true, emailLink: true, twoFactor: true, tokens: true, teams: true },
  }),
  store: sqliteAuthStore(db),
  counters: sqliteCounterStore(db),
  appKey: `base64:${randomBytes(32).toString('base64')}`,
  mailer: { send: async (mail) => void process.stdout.write(`mail: ${mail.kind} → ${mail.to}\n`) },
  events: { emit: (event) => void process.stdout.write(`event: ${event.type}\n`) },
})
createAuthServer(auth).listen(3000, '127.0.0.1', () => process.stdout.write('auth example on http://127.0.0.1:3000\n'))
