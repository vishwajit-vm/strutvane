/**
 * Security review findings F-01, F-03 and F-15, as tests:
 * - internal tables never get an owned file, typed names, a registry entry or a screen;
 * - secret columns (`secret: true`, `hidden`, or a sensitive name) never appear in columns,
 *   forms, filters, typed names, responses, filters, sorts or search;
 * - export and bulk are off unless an owned file opts in.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { runUiSync } from '../../src/generator/sync.ts'
import { buildRegistry } from '../../src/app/registry.tsx'
import { createMockApi } from '../../src/mock-api/mock-api.ts'
import { auto } from '../../src/shared/define-ui.ts'
import { isExposedField, isInternalResource, isSensitiveColumnName } from '../../src/shared/exposure.ts'
import type { AppMetadata, ResourceMetadata } from '../../src/shared/metadata.ts'
import { resolveResourceUi } from '../../src/shared/resolve-ui.ts'
import { commentsResource, stringField, withField, withResource } from '../fixtures.ts'
import { blogToday, cleanupApps, makeApp, readAppFile } from '../generator/helpers.ts'

afterEach(cleanupApps)

/** Real secret column names from Laravel, Sanctum, Passport, Cashier, Fortify, Rails and Django tables. */
const SECRET_NAMES = [
  'password', 'password_hash', 'hashed_password', 'encrypted_password', 'remember_token', 'token', 'access_token', 'refresh_token',
  'api_key', 'apikey', 'api_token', 'secret', 'client_secret', 'webhook_secret', 'two_factor_secret', 'two_factor_recovery_codes',
  'otp', 'otp_code', 'pin', 'ssn', 'salt', 'private_key', 'signing_key', 'encryption_key', 'credential', 'credentials',
  'payload', 'session_id', 'csrf_token', 'card_number', 'cvv', 'cvc', 'iban', 'totp_secret', 'mfa_secret', 'recovery_code',
  'backup_codes', 'jwt', 'bearer_token', 'authorization', 'signature', 'stripe_secret', 'paypal_token', 'reset_token',
  'verification_token', 'confirmation_token', 'unlock_token', 'invitation_token', 'oauth_token', 'oauth_token_secret',
  'personal_access_token', 'app_key', 'access_key', 'secret_access_key', 'passphrase', 'pwd', 'passwd', 'cookie', 'sid', 'pan_number',
] as const

const SAFE_NAMES = ['title', 'name', 'email', 'shipping_address', 'spinner_color', 'position', 'opinion', 'company', 'design', 'panel_count', 'status', 'subtitle', 'published_on', 'created_at', 'tokenizer_version'] as const

describe('sensitive column names (the shared redaction matcher)', () => {
  it(`hides all ${SECRET_NAMES.length} known secret column names`, () => {
    expect(SECRET_NAMES.length).toBeGreaterThanOrEqual(60)
    expect(SECRET_NAMES.filter((name) => !isSensitiveColumnName(name))).toEqual([])
  })

  it('keeps ordinary names visible (short words like "pin" only match as whole words)', () => {
    // `tokenizer_version` IS hidden: fragments over-match on purpose; a false positive costs a
    // rename, a false negative leaks data (F-03: heuristics may only hide).
    expect(SAFE_NAMES.filter((name) => isSensitiveColumnName(name))).toEqual(['tokenizer_version'])
  })
})

function postsWithSecrets(): AppMetadata {
  const apiKey = { ...stringField('api_key', 'Api key') }
  const flagged = { ...stringField('internal_note', 'Internal note'), secret: true }
  return withField(withField(blogToday(), 'posts', apiKey), 'posts', flagged)
}

function resource(metadata: AppMetadata, table: string): ResourceMetadata {
  const found = metadata.resources.find((candidate) => candidate.table === table)
  if (found === undefined) throw new Error(`test setup: no ${table}`)
  return found
}

describe('secret columns never reach the UI', () => {
  it('are left out of columns, form, filters and typed names, even when listed explicitly', () => {
    const metadata = postsWithSecrets()
    const posts = resource(metadata, 'posts')
    const ui = resolveResourceUi(posts, { columns: ['title', 'api_key'], form: auto(), filters: auto() })
    const everything = [...ui.columns, ...ui.formFields, ...ui.filterFields].map((field) => field.name)
    expect(everything).not.toContain('api_key')
    expect(everything).not.toContain('internal_note')
    expect(ui.unknownFields).toEqual(['api_key'])

    const root = makeApp(metadata)
    runUiSync(root)
    const gen = readAppFile(root, '.strutvane/ui.gen.ts')
    expect(gen).not.toMatch(/posts: [^\n]*'api_key'/)
    expect(gen).not.toMatch(/posts: [^\n]*'internal_note'/)
  })

  it('are never returned, filtered, sorted or searched by the API', async () => {
    const metadata = postsWithSecrets()
    const api = createMockApi(metadata)
    api.table('users')?.insertRaw({ name: 'Asha', email: 'a@example.com' })
    api.table('posts')?.insertRaw({ title: 'Hello', slug: 'hello', author_id: 1, api_key: 'sk_live_abc', internal_note: 'raise prices' })
    const get = async (query: string) => api.handle(new Request(`http://local/api/posts${query}`))

    const list = (await (await get('')).json()) as { data: Record<string, unknown>[] }
    expect(Object.keys(list.data[0] ?? {})).not.toContain('api_key')
    expect(Object.keys(list.data[0] ?? {})).not.toContain('internal_note')
    expect((await get('?filter[api_key][startsWith]=sk')).status).toBe(422)
    expect((await get('?sort=api_key')).status).toBe(422)
    const searched = (await (await get('?search=sk_live')).json()) as { data: unknown[] }
    expect(searched.data).toEqual([])
    const filterError = (await (await get('?filter[api_key][eq]=x')).json()) as { issues: { message: string }[] }
    // The hint echoes the caller's own input, then lists filterable fields: the secret is not
    // among them (F-13 field oracle).
    const listed = filterError.issues[0]?.message.split('Filterable fields:')[1] ?? ''
    expect(listed).toContain('title')
    expect(listed).not.toContain('api_key')
    expect(isExposedField({ ...stringField('notes', 'Notes'), hidden: true })).toBe(false)
  })

  it('cannot be written through the auto API', async () => {
    const api = createMockApi(postsWithSecrets())
    api.table('users')?.insertRaw({ name: 'Asha', email: 'a@example.com' })
    const response = await api.handle(new Request('http://local/api/posts', { method: 'POST', body: JSON.stringify({ title: 'X', author_id: 1, api_key: 'sk' }) }))
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ issues: [{ field: 'api_key', code: 'unknown_field' }] })
  })
})

describe('internal tables never get a screen (F-01)', () => {
  const internal = (table: string, flagged = false): ResourceMetadata => ({ ...commentsResource(), table, route: table.replace(/_/g, '-'), ...(flagged ? { internal: true } : {}) })

  it('are skipped by ui:sync: no owned file, no typed names, no registry entry', () => {
    const tables = ['sessions', 'personal_access_tokens', 'user_roles', 'team_members', 'jobs', 'failed_jobs', 'migrations', 'audit_events', 'cache_locks']
    let metadata = blogToday()
    for (const table of tables) metadata = withResource(metadata, internal(table))
    metadata = withResource(metadata, internal('billing_secrets_vault', true))
    const root = makeApp(metadata)
    const { report } = runUiSync(root)

    expect(report.skippedInternal).toEqual([...tables, 'billing_secrets_vault'])
    expect(report.scaffolded).toHaveLength(4) // only the four blog tables
    const gen = readAppFile(root, '.strutvane/ui.gen.ts')
    for (const table of [...tables, 'billing_secrets_vault']) expect(gen).not.toContain(`"table": "${table}"`)
  })

  it('are dropped at runtime too, even from a hand-edited registry', () => {
    const metadata = withResource(blogToday(), internal('sessions'))
    const registry = buildRegistry(metadata, {})
    expect(registry.byName.has('sessions')).toBe(false)
    expect(isInternalResource(internal('anything', true))).toBe(true)
    expect(isInternalResource(resource(blogToday(), 'posts'))).toBe(false)
  })
})

describe('export and bulk are opt-in (F-15)', () => {
  it('are off by default and on only when the owned file says so', () => {
    const posts = resource(blogToday(), 'posts')
    expect(resolveResourceUi(posts, undefined).actions).toEqual({ export: false, bulk: false })
    expect(resolveResourceUi(posts, { actions: { export: true } }).actions).toEqual({ export: true, bulk: false })
  })
})
