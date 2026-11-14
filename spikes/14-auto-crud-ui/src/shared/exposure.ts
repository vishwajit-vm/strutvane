/**
 * What the auto UI may never show: internal tables and secret columns (security design review
 * 2026-11-14, F-01 and F-03).
 *
 * - **Internal tables** (sessions, tokens, role and membership pivots, audit, jobs, migrations)
 *   get no owned file, no entry in `ui.gen.ts`, no sidebar entry and no screen. The schema flag
 *   `internal: true` is the real rule; the name list below is defence in depth for metadata that
 *   predates the flag (spike 10's `resources.json` has no such flag yet).
 * - **Secret columns** (`.secret()` / `.hidden()` in migrations, or a name the shared redaction
 *   matcher flags) never appear in tables, forms, filters, sort, search or the typed registry.
 *
 * Heuristics can only *hide* things, never expose them: a false positive costs a column the
 * developer can rename; a false negative leaks data one `startsWith` filter at a time (F-03).
 *
 * @module
 */
import type { FieldMetadata, ResourceMetadata } from './metadata.ts'

/**
 * Key fragments from `@strutvane/core`'s logger redaction (`DEFAULT_SENSITIVE_KEYS`), copied
 * because spikes are standalone. Matched against the column name with `_`, `-` and spaces removed,
 * so `api_key` and `apiKey` both become `apikey`. Productised code imports core's list instead.
 */
const SENSITIVE_FRAGMENTS: readonly string[] = [
  'password', 'passwd', 'pwd', 'passphrase', 'secret', 'salt', 'credential',
  'token', 'jwt', 'bearer', 'authorization', 'apikey', 'appkey', 'accesskey', 'privatekey', 'signingkey', 'encryptionkey', 'signature', 'csrf', 'xsrf',
  'cookie', 'session',
  'totp', 'mfa', 'recoverycode', 'backupcode',
  'cardnumber', 'cvv', 'cvc', 'iban',
]

/**
 * Short words that are only sensitive as whole words (`pin` is inside `shipping`), from core's
 * `DEFAULT_SENSITIVE_WORDS`, plus `payload` (queued jobs carry reset links, F-01).
 */
const SENSITIVE_WORDS: readonly string[] = ['pin', 'ssn', 'sid', 'sig', 'otp', 'pan', 'payload']

/**
 * Tables that are never auto resources (F-01's list). Prefix entries end with `*`.
 */
const INTERNAL_TABLES: readonly string[] = [
  'migrations', 'strutvane_migrations', 'seeders', 'sessions', 'cache*', 'jobs', 'failed_jobs', 'job_batches',
  'password_reset_tokens', 'personal_access_tokens', 'passkeys', 'user_roles', 'role_user', 'team_members', 'team_user', 'team_invitations',
  'audit_events', 'audit_logs', 'notifications_outbox',
]

/**
 * Does this column name look like a secret? Same rules as the logs pipeline's redaction matcher.
 *
 * @example
 * isSensitiveColumnName('api_key') // true
 * isSensitiveColumnName('shipping_address') // false ('pin' only matches as a whole word)
 * isSensitiveColumnName('pin') // true
 */
export function isSensitiveColumnName(name: string): boolean {
  const normalized = name.toLowerCase().replace(/[-_\s]/g, '')
  if (SENSITIVE_FRAGMENTS.some((fragment) => normalized.includes(fragment))) return true
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
  return words.some((word) => SENSITIVE_WORDS.includes(word))
}

/**
 * May the UI show this field anywhere (column, form, filter, sort, typed name)?
 *
 * @example
 * isExposedField(titleField) // true
 * isExposedField({ ...field, name: 'remember_token' }) // false
 */
export function isExposedField(field: FieldMetadata): boolean {
  return !field.hidden && field.secret !== true && !isSensitiveColumnName(field.name)
}

/**
 * Is this table internal (no auto screen, ever)?
 *
 * @example
 * isInternalResource(sessionsResource) // true
 * isInternalResource(postsResource) // false
 */
export function isInternalResource(resource: ResourceMetadata): boolean {
  if (resource.internal === true) return true
  return INTERNAL_TABLES.some((entry) => (entry.endsWith('*') ? resource.table.startsWith(entry.slice(0, -1)) : resource.table === entry))
}
