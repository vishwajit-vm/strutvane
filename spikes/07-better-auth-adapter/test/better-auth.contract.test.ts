import { randomBytes } from 'node:crypto'
import { createBetterAuthEngine } from '../src/better-auth-adapter.ts'
import { runIdentityContract } from './contract.ts'
import { createDatabase } from './helpers.ts'

runIdentityContract('Better Auth 1.7.23 (PostgreSQL 18)', async (options) => {
  const db = await createDatabase()
  const engine = createBetterAuthEngine({
    pool: db.pool,
    baseURL: options.baseURL,
    secret: randomBytes(32).toString('base64'),
    deliverPasswordReset: options.deliverPasswordReset,
    signInRateLimit: options.signInRateLimit,
    onUnexpectedError: (context, error) => {
      throw new Error(`unexpected engine error in ${context}: ${String(error)}`)
    },
  })
  await engine.migrate()
  return { engine, cleanup: db.drop }
})
