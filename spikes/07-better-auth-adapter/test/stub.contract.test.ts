import { createStubEngine } from '../src/stub-adapter.ts'
import { runIdentityContract } from './contract.ts'

runIdentityContract('native stub (in memory)', async (options) => ({
  engine: createStubEngine({
    baseURL: options.baseURL,
    deliverPasswordReset: options.deliverPasswordReset,
    signInRateLimit: options.signInRateLimit,
  }),
  cleanup: async () => undefined,
}))
