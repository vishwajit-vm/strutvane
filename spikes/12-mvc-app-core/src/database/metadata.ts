/**
 * Read `.strutvane/resources.json`, the metadata spike 10 generates from the migrations (labels,
 * search, sort, filters, relations, slug source, inputs, sidebar order). `ResourceController`
 * runs on it, so a list endpoint gets search, sorting, filters and pagination with no per-model code.
 *
 * The types below mirror spike 10's `generate/metadata.ts` (format `version: 1`). Only the fields
 * this core reads are listed; extra fields are ignored, so the generator can grow freely.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { token } from '../foundation/container.ts'
import { StrutvaneError } from '../support/errors.ts'

/**
 * How a value converts between the database, JSON and forms.
 *
 * @example
 * const cast: FieldCast = 'datetime'
 */
export type FieldCast = 'integer' | 'number' | 'decimal' | 'string' | 'boolean' | 'date' | 'datetime' | 'json'

/**
 * Filter operators for `?filter[field][op]=value`.
 *
 * @example
 * const op: FilterOperator = 'in'
 */
export type FilterOperator = 'eq' | 'ne' | 'in' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startsWith' | 'null'

/**
 * One field of a resource.
 *
 * @example
 * resource.fields.find((field) => field.name === 'status')?.options // ['draft', 'published']
 */
export interface FieldMetadata {
  readonly name: string
  readonly label: string
  readonly kind: string
  readonly cast: FieldCast
  readonly nullable: boolean
  readonly required: boolean
  readonly fillable: boolean
  readonly unique: boolean
  readonly hidden: boolean
  readonly searchable: 'text' | 'exact' | false
  readonly sortable: boolean
  readonly filterOperators: readonly FilterOperator[]
  readonly maxLength?: number
  readonly options?: readonly string[]
  readonly references?: string
}

/**
 * One resource (one table).
 *
 * @example
 * metadata.resource('posts').label.plural // 'Posts'
 */
export interface ResourceMetadata {
  readonly table: string
  readonly model: string
  readonly route: string
  readonly label: { readonly singular: string; readonly plural: string }
  readonly primaryKey: string
  readonly titleField: string
  readonly slug?: { readonly field: string; readonly from: string }
  readonly timestamps: boolean
  readonly softDeletes: boolean
  readonly defaultSort: string
  readonly perPage: number
  readonly fields: readonly FieldMetadata[]
  readonly sidebar: { readonly order: number; readonly hidden: boolean }
  /** Set by the schema's `{ internal: true }` flag (security review F-01); never served by the auto API. */
  readonly internal?: boolean
}

/**
 * Framework and identity tables the auto API must never serve (security review F-01), even when
 * the schema flag is missing. The flag is the primary rule; this list is the safety net for
 * tables whose names every Laravel-style app shares.
 *
 * @example
 * INTERNAL_TABLES.has('sessions') // true
 */
export const INTERNAL_TABLES: ReadonlySet<string> = new Set([
  'migrations', 'seeders', 'users', 'sessions', 'cache', 'cache_locks', 'jobs', 'job_batches', 'failed_jobs',
  'password_reset_tokens', 'personal_access_tokens', 'passkeys', 'roles', 'permissions', 'user_roles',
  'role_permissions', 'team_members', 'team_invitations', 'teams', 'audit_events',
])

/**
 * `true` when a table must never get an auto API resource: flagged internal, on the list, or a
 * `team_*` membership table.
 *
 * @example
 * isInternalResource(metadata.resource('sessions')) // true
 */
export function isInternalResource(resource: ResourceMetadata): boolean {
  return resource.internal === true || INTERNAL_TABLES.has(resource.table) || resource.table.startsWith('team_')
}

/**
 * The loaded metadata with lookups.
 *
 * @example
 * const metadata = loadMetadata('/srv/blog')
 * metadata.resource('posts').primaryKey // 'id'
 */
export class AppMetadata {
  readonly resources: readonly ResourceMetadata[]

  constructor(resources: readonly ResourceMetadata[]) {
    this.resources = resources
  }

  /**
   * The resource for a table, or a friendly error.
   *
   * @example
   * metadata.resource('posts')
   */
  resource(table: string): ResourceMetadata {
    const found = this.resources.find((resource) => resource.table === table)
    if (found !== undefined) return found
    throw new StrutvaneError(
      'UNKNOWN_RESOURCE',
      `.strutvane/resources.json has no "${table}" table.`,
      `Create it with a migration (node strut make:migration create_${table}_table), then regenerate the metadata.`,
    )
  }

  /**
   * One field, or a friendly error naming the fields that do exist.
   *
   * @example
   * metadata.field('posts', 'slug').unique // true
   */
  field(table: string, name: string): FieldMetadata {
    const resource = this.resource(table)
    const found = resource.fields.find((field) => field.name === name)
    if (found !== undefined) return found
    throw new StrutvaneError('UNKNOWN_FIELD', `The "${table}" table has no "${name}" column.`, `Columns: ${resource.fields.map((field) => field.name).join(', ')}.`)
  }
}

/**
 * The container token for the app's metadata.
 *
 * @example
 * app.make(MetadataToken).resource('posts')
 */
export const MetadataToken = token<AppMetadata>('AppMetadata')

/**
 * Load and sanity-check `<basePath>/.strutvane/resources.json`.
 *
 * @example
 * const metadata = loadMetadata(app.basePath)
 */
export function loadMetadata(basePath: string): AppMetadata {
  const file = join(basePath, '.strutvane', 'resources.json')
  if (!existsSync(file)) {
    throw new StrutvaneError('METADATA_MISSING', `${file} doesn't exist yet.`, 'Generate it from your migrations (spike 10: `sv types`; the framework will run it as part of `node strut migrate`).')
  }
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
  if (!isMetadataDocument(parsed)) {
    throw new StrutvaneError('METADATA_INVALID', `${file} is not a version 1 resources.json.`, 'Regenerate it instead of editing it by hand; it is overwritten on every migrate.')
  }
  return new AppMetadata(parsed.resources)
}

function isMetadataDocument(value: unknown): value is { version: 1; resources: ResourceMetadata[] } {
  if (typeof value !== 'object' || value === null) return false
  if (!('version' in value) || value.version !== 1) return false
  if (!('resources' in value) || !Array.isArray(value.resources)) return false
  // A light structural check: every resource has a table and a fields array. Deeper checks
  // belong to the generator, which is the only writer of this file.
  return value.resources.every((resource: unknown) => typeof resource === 'object' && resource !== null && 'table' in resource && 'fields' in resource && Array.isArray(resource.fields))
}
