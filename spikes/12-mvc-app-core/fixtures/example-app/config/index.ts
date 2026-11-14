import app from './app.ts'
import database from './database.ts'

/**
 * Every config file, keyed by name: `config('app.name')` reads `app.ts`. Laravel finds config
 * files by scanning the folder; listing them here keeps the types (and `node strut about`) exact.
 */
export const config = { app, database }
