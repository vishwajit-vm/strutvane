/**
 * The resource metadata format that spike 10 writes to `.strutvane/resources.json` after every
 * migrate. This spike only *reads* it: the types below mirror spike 10's
 * `src/generate/metadata.ts` field for field, so the generator and the UI run on exactly what the
 * migration-first pipeline produces.
 *
 * Why a copy and not an import: spikes are standalone (spikes/README.md). The contract test
 * (`test/contract/spike10-contract.test.ts`) proves the copy still matches the real thing.
 *
 * Nothing here assumes a database engine. Search, sort and NULL ordering are decided by the server
 * (spike 10 runs SQLite and PostgreSQL; MySQL is now the default app database), and the UI only
 * sends the documented query parameters.
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
 * How a value travels between the database, JSON and forms.
 *
 * @example
 * const cast: FieldCast = 'decimal' // sent and received as a string such as "12.50"
 */
export type FieldCast = 'integer' | 'number' | 'decimal' | 'string' | 'boolean' | 'date' | 'datetime' | 'json'

/**
 * How `?search=` treats a field: `text` = case-insensitive "contains", `exact` = "equals when the
 * term is a number", `false` = not searched.
 *
 * @example
 * const mode: SearchMode = 'text'
 */
export type SearchMode = 'text' | 'exact'

/**
 * A filter operator, sent as `?filter[price][gte]=10`.
 *
 * @example
 * const op: FilterOperator = 'gte'
 */
export type FilterOperator = 'eq' | 'ne' | 'in' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startsWith' | 'null'

/**
 * The form widget the metadata suggests for a field. `none` means "not on the form".
 *
 * @example
 * const input: FieldInput = 'relation' // an async select over the related resource
 */
export type FieldInput = 'text' | 'textarea' | 'number' | 'decimal' | 'switch' | 'select' | 'relation' | 'date' | 'datetime' | 'json' | 'none'

/**
 * Everything the UI needs to know about one field.
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
  /** Must be sent on create. */
  readonly required: boolean
  /** May be sent on create or update. */
  readonly fillable: boolean
  readonly unique: boolean
  /** Never returned by the API (passwords, tokens). The UI never shows or types it. */
  readonly hidden: boolean
  readonly searchable: SearchMode | false
  readonly sortable: boolean
  /** Shown as a list column by default. */
  readonly listed: boolean
  readonly input: FieldInput
  /** Operators `filter[name][op]` accepts; empty when the field cannot be filtered. */
  readonly filterOperators: readonly FilterOperator[]
  readonly maxLength?: number
  readonly precision?: number
  readonly scale?: number
  readonly options?: readonly string[]
  readonly default?: string | number | boolean | null
  /** For foreign keys: the table the value points at. */
  readonly references?: string
  /**
   * Forward-compatible: `t.string('api_key').secret()` in a migration (security review F-03).
   * Spike 10 does not emit it yet; when present, the UI never shows the field.
   */
  readonly secret?: boolean
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
  /** The related table. */
  readonly resource: string
  /** On this table for `belongsTo`, on the other table for `hasMany`. */
  readonly foreignKey: string
  readonly ownerKey: string
}

/**
 * One table plus everything needed to serve and show it.
 *
 * @example
 * metadata.resources.find((resource) => resource.table === 'posts')?.label.plural // 'Posts'
 */
export interface ResourceMetadata {
  readonly table: string
  readonly model: string
  /** URL segment, for the API (`/api/posts`) and the UI (`/posts`). */
  readonly route: string
  readonly label: { readonly singular: string; readonly plural: string }
  readonly primaryKey: string
  /** The field that names a row in selects, breadcrumbs and global search. */
  readonly titleField: string
  readonly slug?: { readonly field: string; readonly from: string }
  readonly timestamps: boolean
  readonly softDeletes: boolean
  readonly defaultSort: string
  readonly perPage: number
  readonly fields: readonly FieldMetadata[]
  readonly relations: readonly RelationMetadata[]
  readonly sidebar: { readonly order: number; readonly hidden: boolean }
  /**
   * Forward-compatible: `schema.create('sessions', fn, { internal: true })` (security review F-01).
   * Internal tables never get a screen. Spike 10 does not emit it yet.
   */
  readonly internal?: boolean
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

/** A SQL identifier as spike 10 validates it: also a safe property key and string. */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/
/** A URL segment and file-name stem: lowercase words joined by `-` (no `/`, `.`, `..`). */
const ROUTE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Check the outer shape of a parsed `resources.json` and return it typed.
 *
 * Why mostly the outer shape: the file is machine-written by `migrate` (trusted, versioned). The
 * check exists to give a friendly message when someone points `ui:sync` at the wrong file or an
 * older format. The one deep check is on NAMES, because they become file paths and generated
 * code: a route of `../../src/x` would write outside `resources/ui/`.
 *
 * @example
 * const metadata = parseAppMetadata(JSON.parse(text)) // throws MetadataError on a wrong file
 */
export function parseAppMetadata(value: unknown): AppMetadata {
  if (!isRecord(value) || value['version'] !== 1 || !Array.isArray(value['resources'])) {
    throw new MetadataError('This is not a Strutvane resources.json (version 1). Run `sv migrate` (or `npm run generate` in spike 10) to write it.')
  }
  for (const resource of value['resources']) {
    if (!isRecord(resource) || typeof resource['table'] !== 'string' || !Array.isArray(resource['fields'])) {
      throw new MetadataError('A resource in resources.json has no "table" or "fields". Regenerate the file with `sv migrate`.')
    }
    // Names become file paths (`route` → resources/ui/<route>.ui.ts) and code (table and field
    // names): refuse anything that could leave the folder (`../`) or break the generated source.
    if (!IDENTIFIER.test(resource['table']) || typeof resource['route'] !== 'string' || !ROUTE.test(resource['route'])) {
      throw new MetadataError(`Resource ${JSON.stringify(resource['table'])} has an invalid table or route name. Regenerate the file with \`sv migrate\`.`)
    }
    for (const field of resource['fields']) {
      if (!isRecord(field) || typeof field['name'] !== 'string' || !IDENTIFIER.test(field['name'])) {
        throw new MetadataError(`A field of ${JSON.stringify(resource['table'])} has an invalid name. Regenerate the file with \`sv migrate\`.`)
      }
    }
  }
  // The checks above cover what the generator relies on; the rest is trusted generator output.
  return value as unknown as AppMetadata
}

/**
 * Find a field by name.
 *
 * @example
 * findField(posts, 'title')?.label // 'Title'
 */
export function findField(resource: ResourceMetadata, name: string): FieldMetadata | undefined {
  return resource.fields.find((field) => field.name === name)
}

/**
 * The fields the UI may know about: everything except hidden and secret columns
 * (see `exposure.ts`).
 *
 * @example
 * visibleFields(users).map((field) => field.name) // no 'password'
 */
export function visibleFields(resource: ResourceMetadata): FieldMetadata[] {
  return resource.fields.filter(isExposedField)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
