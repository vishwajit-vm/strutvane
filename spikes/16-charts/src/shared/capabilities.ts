/**
 * Which fields of a resource *can* be charted, derived from `resources.json` alone.
 *
 * This is the ceiling: an owned `charts.ts` file may narrow it (explicit lists) but never widen it,
 * and the server's allow-list is computed from the same function, so the browser and the API can't
 * disagree about what is allowed.
 *
 * Rules (each one has a test in `test/shared/capabilities.test.ts`):
 * - only **exposed** fields: never hidden, `secret: true`, or a name the redaction matcher flags
 *   (`api_key`, `password_hash`, ...), the same rule the CRUD UI uses (F-03);
 * - never the **tenant column**: tenancy is the scope of every query, not something to group by
 *   (grouping by it would at best show one bar, at worst reveal other tenants' ids);
 * - never the **primary key** or **soft-delete marker** (`deleted_at`): summing ids is meaningless,
 *   and charting deletion times would reveal deleted rows;
 * - never a column flagged `aggregatable: false` or `personal: true` (forward-compatible flags
 *   requested from spike 10);
 * - **internal tables** have no capabilities at all (F-01).
 *
 * @module
 */
import { isExposedField, isInternalResource } from './exposure.ts'
import type { AppMetadata, ColumnKind, FieldMetadata, ResourceMetadata } from './metadata.ts'

/** The tenant column when the app does not configure another one (spike 11's default). */
export const DEFAULT_TENANT_COLUMN = 'tenant_id'

/** Enums with more options than this are treated like free text: too many slices to read. */
const MAX_ENUM_OPTIONS = 50

const NUMERIC_KINDS: ReadonlySet<ColumnKind> = new Set(['integer', 'bigInteger', 'double', 'decimal'])
const DATE_KINDS: ReadonlySet<ColumnKind> = new Set(['date', 'timestamp'])

/**
 * A belongsTo field that can be grouped by, with the resource its ids point at (for labels).
 *
 * @example
 * const relation: RelationCapability = { field: 'customer_id', resource: 'customers', relation: 'customer' }
 */
export interface RelationCapability {
  readonly field: string
  readonly resource: string
  readonly relation: string
}

/**
 * What one resource offers to charts and to the aggregate endpoint.
 *
 * @example
 * capabilitiesOf(metadata, invoices).numeric // ['total', 'tax']
 */
export interface ResourceCapabilities {
  /** Fields that can be summed or averaged. */
  readonly numeric: readonly string[]
  /** Fields that can be bucketed by day, week or month. */
  readonly date: readonly string[]
  /** Enum and boolean fields: a small, known set of groups. */
  readonly category: readonly string[]
  /** belongsTo fields: grouped by id, top N. */
  readonly relation: readonly RelationCapability[]
}

/** No capabilities: what an internal table gets. */
const NONE: ResourceCapabilities = { numeric: [], date: [], category: [], relation: [] }

/**
 * Work out what a resource can be charted by.
 *
 * @example
 * const caps = capabilitiesOf(metadata, invoices)
 * caps.category // ['status', 'paid']
 * caps.relation // [{ field: 'customer_id', resource: 'customers', relation: 'customer' }]
 */
export function capabilitiesOf(metadata: AppMetadata, resource: ResourceMetadata, tenantColumn: string | false = DEFAULT_TENANT_COLUMN): ResourceCapabilities {
  if (isInternalResource(resource)) return NONE
  const usable = resource.fields.filter((field) => isUsableField(resource, field, tenantColumn))
  return {
    numeric: usable.filter((field) => NUMERIC_KINDS.has(field.kind)).map((field) => field.name),
    date: usable.filter((field) => DATE_KINDS.has(field.kind) && field.name !== 'deleted_at').map((field) => field.name),
    category: usable.filter(isCategoryField).map((field) => field.name),
    relation: usable.flatMap((field) => relationCapability(metadata, resource, field)),
  }
}

/**
 * Every field name that may appear in a `groupBy` (dates, categories and relations together).
 *
 * @example
 * groupableFields(caps) // ['issued_on', 'created_at', 'status', 'paid', 'customer_id']
 */
export function groupableFields(capabilities: ResourceCapabilities): string[] {
  return [...capabilities.date, ...capabilities.category, ...capabilities.relation.map((relation) => relation.field)]
}

/** Exposed, not the tenant column, not the primary key, not opted out, not personal data. */
function isUsableField(resource: ResourceMetadata, field: FieldMetadata, tenantColumn: string | false): boolean {
  if (field.aggregatable === false || field.personal === true) return false
  return isExposedField(field) && field.name !== tenantColumn && field.name !== resource.primaryKey && field.kind !== 'id'
}

function isCategoryField(field: FieldMetadata): boolean {
  if (field.kind === 'boolean') return true
  return field.kind === 'enum' && field.options !== undefined && field.options.length > 0 && field.options.length <= MAX_ENUM_OPTIONS
}

/** A foreign key qualifies only when its belongsTo target is a known, non-internal resource. */
function relationCapability(metadata: AppMetadata, resource: ResourceMetadata, field: FieldMetadata): RelationCapability[] {
  if (field.kind !== 'foreignId') return []
  const relation = resource.relations.find((candidate) => candidate.kind === 'belongsTo' && candidate.foreignKey === field.name)
  const target = metadata.resources.find((candidate) => candidate.table === relation?.resource)
  // Why skip internal targets: their rows have no screen, so ids could never be labelled, and
  // "posts per session" style charts are a side channel into internal tables.
  if (relation === undefined || target === undefined || isInternalResource(target)) return []
  return [{ field: field.name, resource: target.route, relation: relation.name }]
}
