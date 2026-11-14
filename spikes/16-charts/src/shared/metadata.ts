/**
 * The resource metadata format that spike 10 writes to `.strutvane/resources.json` after every
 * migrate. This spike only *reads* it, exactly like spike 14 does.
 *
 * Why a copy and not an import: spikes are standalone (spikes/README.md). The types mirror spike
 * 14's `src/shared/metadata.ts` (which mirrors spike 10 field for field), plus one
 * forward-compatible flag the charts need: `global` (a table shared by all tenants, spike 11's
 * `schema.create(name, fn, { global: true })`).
 *
 * @module
 */
import { isExposedField } from './exposure.ts'

/**
 * The column type a field was declared with in its migration (`t.string`, `t.decimal`, ...).
 *
 * @example
 * const kind: ColumnKind = 'decimal'
 */
export type ColumnKind =
  | 'id'
  | 'integer'
  | 'bigInteger'
  | 'foreignId'
  | 'double'
  | 'decimal'
  | 'string'
  | 'text'
  | 'slug'
  | 'uuid'
  | 'enum'
  | 'boolean'
  | 'date'
  | 'timestamp'
  | 'json'

/**
 * How a value travels between the database and JSON.
 *
 * @example
 * const cast: FieldCast = 'decimal' // sent and received as a string such as "12.50"
 */
export type FieldCast = 'integer' | 'number' | 'decimal' | 'string' | 'boolean' | 'date' | 'datetime' | 'json'

/**
 * A filter operator, sent as `?filter[price][gte]=10` (spike 10's list contract).
 *
 * @example
 * const op: FilterOperator = 'gte'
 */
export type FilterOperator = 'eq' | 'ne' | 'in' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startsWith' | 'null'

/**
 * Everything the charts need to know about one field. Spike 10 writes more keys (input, listed,
 * ...); they are simply not read here.
 *
 * @example
 * const status = resource.fields.find((field) => field.name === 'status')
 * status?.options // ['draft', 'published']
 */
export interface FieldMetadata {
  readonly name: string
  readonly label: string
  readonly kind: ColumnKind
  readonly cast: FieldCast
  readonly nullable: boolean
  /** Never returned by the API (passwords, tokens). Never aggregated either. */
  readonly hidden: boolean
  /** Operators `filter[name][op]` accepts; empty when the field cannot be filtered. */
  readonly filterOperators: readonly FilterOperator[]
  readonly precision?: number
  readonly scale?: number
  readonly options?: readonly string[]
  /** For foreign keys: the table the value points at. */
  readonly references?: string
  /** Forward-compatible: `t.string('api_key').secret()` (security review F-03). */
  readonly secret?: boolean
  /**
   * Forward-compatible (catalogue v2 request to spike 10): `false` keeps a column out of every
   * chart and aggregate even when its type would allow it.
   */
  readonly aggregatable?: boolean
  /** Forward-compatible (catalogue v2, F10): personal data (`.personal()`); never aggregated by default. */
  readonly personal?: boolean
}

/**
 * A relation between two resources.
 *
 * @example
 * const author: RelationMetadata = { name: 'author', kind: 'belongsTo', resource: 'users', foreignKey: 'author_id', ownerKey: 'id' }
 */
export interface RelationMetadata {
  readonly name: string
  readonly kind: 'belongsTo' | 'hasMany'
  readonly resource: string
  readonly foreignKey: string
  readonly ownerKey: string
}

/**
 * One table plus everything needed to aggregate and label it.
 *
 * @example
 * metadata.resources.find((resource) => resource.table === 'invoices')?.label.plural // 'Invoices'
 */
export interface ResourceMetadata {
  readonly table: string
  readonly model: string
  /** URL segment: `/api/v1/<route>/aggregate`. */
  readonly route: string
  readonly label: { readonly singular: string; readonly plural: string }
  readonly primaryKey: string
  readonly titleField: string
  readonly timestamps: boolean
  readonly softDeletes: boolean
  readonly fields: readonly FieldMetadata[]
  readonly relations: readonly RelationMetadata[]
  readonly sidebar: { readonly order: number; readonly hidden: boolean }
  /** Forward-compatible (F-01): internal tables never get charts or an aggregate endpoint. */
  readonly internal?: boolean
  /** Forward-compatible (spike 11): shared by all tenants, so no tenant condition is added. */
  readonly global?: boolean
}

/**
 * The whole `resources.json` document.
 *
 * @example
 * const metadata = parseAppMetadata(JSON.parse(readFileSync('.strutvane/resources.json', 'utf8')))
 */
export interface AppMetadata {
  readonly version: 1
  readonly resources: readonly ResourceMetadata[]
}

/**
 * Thrown when `resources.json` is not in the expected shape. The message says what to do.
 *
 * @example
 * try { parseAppMetadata({}) } catch (error) { if (error instanceof MetadataError) console.error(error.message) }
 */
export class MetadataError extends Error {
  override readonly name = 'MetadataError'
}

/**
 * Check the outer shape of a parsed `resources.json` and return it typed.
 *
 * Why only the outer shape: the file is machine-written by `migrate` (trusted, versioned). The
 * check exists to give a friendly message for a wrong or outdated file, not to re-validate it.
 *
 * @example
 * const metadata = parseAppMetadata(JSON.parse(text)) // throws MetadataError on a wrong file
 */
export function parseAppMetadata(value: unknown): AppMetadata {
  if (!isRecord(value) || value['version'] !== 1 || !Array.isArray(value['resources'])) {
    throw new MetadataError('This is not a Strutvane resources.json (version 1). Run `node strut migrate` to write it.')
  }
  for (const resource of value['resources']) {
    if (!isRecord(resource) || typeof resource['table'] !== 'string' || !Array.isArray(resource['fields'])) {
      throw new MetadataError('A resource in resources.json has no "table" or "fields". Regenerate the file with `node strut migrate`.')
    }
  }
  // The checks above cover what the charts rely on; the rest is trusted generator output.
  return value as unknown as AppMetadata
}

/**
 * Find a field by name, but only if the UI and API may expose it (not hidden, not secret).
 *
 * Why "exposed only": every caller in this spike is about to aggregate, group or filter on the
 * field, and none of those may touch a secret column (security review F-03).
 *
 * @example
 * findExposedField(users, 'password') // undefined
 */
export function findExposedField(resource: ResourceMetadata, name: string): FieldMetadata | undefined {
  return resource.fields.find((field) => field.name === name && isExposedField(field))
}

/**
 * Find a resource by its table name or API route.
 *
 * @example
 * findResource(metadata, 'invoices')?.label.singular // 'Invoice'
 */
export function findResource(metadata: AppMetadata, name: string): ResourceMetadata | undefined {
  return metadata.resources.find((resource) => resource.table === name || resource.route === name)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
