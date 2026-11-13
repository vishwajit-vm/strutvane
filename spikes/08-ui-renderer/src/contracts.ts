/**
 * Mirrors @strutvane/contracts v0 (packages/contracts/src: manifest.ts, problem.ts, list-query.ts,
 * query-filter.ts) plus `ValidationIssue` from RFC-0003. Copied, not imported, because spikes are
 * standalone. Keep in sync by hand; the real @strutvane/ui will import the published package.
 */

// ── query-filter.ts (subset used by the UI) ────────────────────────────────────────────────────
export type FieldPath = string
export type FilterScalar = string | number | boolean
export interface ActorRef {
  readonly $actor: 'id' | 'tenantId' | `attrs.${string}`
}
export type FilterOperand = FilterScalar | ActorRef
export type ComparisonOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'
export type SetOperator = 'in' | 'nin'
export type NullOperator = 'isNull' | 'isNotNull'
export type TextOperator = 'contains' | 'startsWith' | 'endsWith'
export type FilterOperator =
  | ComparisonOperator
  | SetOperator
  | NullOperator
  | TextOperator
  | 'between'

export type QueryFilter =
  | { readonly op: 'and'; readonly filters: readonly QueryFilter[] }
  | { readonly op: 'or'; readonly filters: readonly QueryFilter[] }
  | { readonly op: 'not'; readonly filter: QueryFilter }
  | { readonly op: ComparisonOperator; readonly field: FieldPath; readonly value: FilterOperand }
  | { readonly op: SetOperator; readonly field: FieldPath; readonly values: readonly FilterOperand[] }
  | { readonly op: NullOperator; readonly field: FieldPath }
  | {
      readonly op: TextOperator
      readonly field: FieldPath
      readonly value: string
      readonly caseSensitive?: boolean
    }
  | {
      readonly op: 'between'
      readonly field: FieldPath
      readonly from: FilterOperand
      readonly to: FilterOperand
    }
  | { readonly op: 'true' | 'false' }

// ── list-query.ts ───────────────────────────────────────────────────────────────────────────────
export interface SortDirective {
  readonly field: FieldPath
  readonly direction: 'asc' | 'desc'
}
export type PageRequest =
  | { readonly kind: 'cursor'; readonly size: number; readonly cursor?: string }
  | { readonly kind: 'offset'; readonly size: number; readonly number: number }
export interface ListQuery {
  readonly filter?: QueryFilter
  readonly search?: string
  readonly sort?: readonly SortDirective[]
  readonly page?: PageRequest
  readonly include?: readonly string[]
  readonly fields?: Readonly<Record<string, readonly string[]>>
}
export interface PageInfo {
  readonly size: number
  readonly hasMore: boolean
  readonly nextCursor?: string
  readonly number?: number
  readonly total?: number
}
export interface ListResult<TRecord> {
  readonly data: readonly TRecord[]
  readonly meta: { readonly page: PageInfo }
}
export const LIST_QUERY_LIMITS = Object.freeze({ defaultPageSize: 25, maxPageSize: 100 })

// ── problem.ts + RFC-0003 ───────────────────────────────────────────────────────────────────────
/** RFC-0003: one structured validation problem. `path: []` means the whole form. */
export interface ValidationIssue {
  readonly path: readonly (string | number)[]
  readonly code: string
  readonly params?: Readonly<Record<string, string | number | boolean>>
  readonly message: string
}
export interface Problem {
  readonly type: string
  readonly title: string
  readonly status: number
  readonly detail?: string
  readonly code: string
  readonly traceId?: string
  readonly issues?: readonly ValidationIssue[]
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>
  readonly [extension: string]: unknown
}

// ── manifest.ts ─────────────────────────────────────────────────────────────────────────────────
export type JsonSchema = Readonly<Record<string, unknown>>
export type FieldTypeName =
  | 'id'
  | 'string'
  | 'text'
  | 'email'
  | 'integer'
  | 'decimal'
  | 'money'
  | 'boolean'
  | 'enum'
  | 'date'
  | 'datetime'
  | 'array'
  | 'belongsTo'
  | (string & {})

export interface RelationDescriptor {
  readonly kind: 'belongsTo' | 'hasOne' | 'hasMany' | 'manyToMany'
  readonly target: string
  readonly foreignKey?: string
}
export interface FieldDescriptor {
  readonly name: string
  readonly type: FieldTypeName
  readonly label: string
  readonly help?: string
  readonly required: boolean
  readonly nullable: boolean
  readonly unique: boolean
  readonly readOnly: boolean
  readonly writeOnce: boolean
  readonly filterOperators: readonly FilterOperator[]
  readonly sortable: boolean
  readonly searchable: boolean
  readonly enumValues?: readonly string[]
  readonly relation?: RelationDescriptor
  readonly widget?: string
  readonly schema?: JsonSchema
}
export interface ResourceCapabilities {
  readonly list: boolean
  readonly view: boolean
  readonly create: boolean
  readonly update: boolean
  readonly delete: boolean
  readonly restore: boolean
  readonly export: boolean
}
export interface ResourceDescriptor {
  readonly name: string
  readonly path: string
  readonly label: string
  readonly pluralLabel: string
  readonly titleField: string
  readonly fields: readonly FieldDescriptor[]
  readonly capabilities: ResourceCapabilities
  readonly ui?: { readonly listColumns?: readonly string[] }
}
export interface ResourceManifest {
  readonly manifestVersion: 1
  readonly app: { readonly name: string; readonly apiVersion: string }
  readonly generatedAt: string
  readonly resources: readonly ResourceDescriptor[]
}

/** A record as returned by the API. Every resource has a string `id`. */
export type ApiRecord = Readonly<Record<string, unknown>> & { readonly id: string }
