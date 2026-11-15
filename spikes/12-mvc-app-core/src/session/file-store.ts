/**
 * The session store seam `node strut session:flush` works on. Sessions themselves belong to the
 * auth package (database sessions with hashed ids, review F-09); this spike provides the file
 * driver's folder (`storage/framework/sessions`) and the `flush()` that signs everyone out.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { token } from '../foundation/container.ts'
import { removeFile } from '../support/atomic-write.ts'

/**
 * A session store that can be flushed.
 *
 * @example
 * const removed = await store.flush()
 */
export interface SessionStore {
  /** Delete every session; returns how many were removed. */
  flush(): Promise<number>
}

/** The file driver's folder, relative to the app. */
export const SESSION_FOLDER = join('storage', 'framework', 'sessions')

/**
 * The file driver: one file per session.
 *
 * @example
 * await new FileSessionStore('/srv/blog').flush()
 */
export class FileSessionStore implements SessionStore {
  readonly #folder: string

  constructor(basePath: string) {
    this.#folder = join(basePath, SESSION_FOLDER)
  }

  async flush(): Promise<number> {
    if (!existsSync(this.#folder)) return 0
    return readdirSync(this.#folder)
      .filter((name) => !name.startsWith('.'))
      .filter((name) => removeFile(join(this.#folder, name))).length
  }
}

/**
 * The container token for the session store (the auth package rebinds it to its database store).
 *
 * @example
 * await app.make(SessionStoreToken).flush()
 */
export const SessionStoreToken = token<SessionStore>('SessionStore')
