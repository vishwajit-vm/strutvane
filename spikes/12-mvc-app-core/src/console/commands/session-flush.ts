import { SessionStoreToken } from '../../session/file-store.ts'
import { defineCommand } from '../command.ts'

/**
 * `node strut session:flush`: delete every session, which signs everyone out. For incidents (a
 * leaked session store, a compromised admin). Bearer tokens are separate: the auth package's
 * `token:revoke --all` handles those.
 *
 * @example
 * node strut session:flush
 */
export const sessionFlushCommand = defineCommand({
  name: 'session:flush',
  description: 'Delete every session (signs everyone out)',
  async run({ app, output }) {
    const removed = await app.make(SessionStoreToken).flush()
    output.line(`  ✔ ${removed} session${removed === 1 ? '' : 's'} deleted. Everyone signed in with a session must sign in again.`)
    output.line('  · API tokens are not affected; revoke them with the auth package (token:revoke --all).')
  },
})
