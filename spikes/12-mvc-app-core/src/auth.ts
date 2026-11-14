/**
 * `#strutvane/auth`: policies, the gate and the token guard stub.
 */
export { allows, authorize, hasAdminRole, type Ability, type Policy } from './auth/gate.ts'
export { Authenticate } from './auth/authenticate.ts'
export { hashToken, UserProviderToken, type UserProvider } from './auth/user-provider.ts'
export type { AuthUser } from './registry.ts'
