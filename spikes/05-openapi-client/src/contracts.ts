/**
 * Minimal mirror of `@strutvane/contracts` v0 (packages/contracts/src), plus the `ValidationIssue`
 * shape proposed in RFC-0003. Copied, not imported, so this spike stays standalone. Only the parts
 * the spike needs are mirrored; names and shapes are identical to the contracts package.
 *
 * @module
 */

/** Every field operator (mirrors `FilterOperator`). */
export type FilterOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'nin'
  | 'isNull'
  | 'isNotNull'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'between'

/** Comparable literal (null excluded; use isNull). */
export type FilterScalar = string | number | boolean

/** The subset of `QueryFilter` a parsed REST list query can produce (no actor refs). */
export type QueryFilter =
  | { readonly op: 'and'; readonly filters: readonly QueryFilter[] }
  | { readonly op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'; readonly field: string; readonly value: FilterScalar }
  | { readonly op: 'in' | 'nin'; readonly field: string; readonly values: readonly FilterScalar[] }
  | { readonly op: 'isNull' | 'isNotNull'; readonly field: string }
  | { readonly op: 'contains' | 'startsWith' | 'endsWith'; readonly field: string; readonly value: string }
  | { readonly op: 'between'; readonly field: string; readonly from: FilterScalar; readonly to: FilterScalar }

/** Sort order for one field. */
export interface SortDirective {
  readonly field: string
  readonly direction: 'asc' | 'desc'
}

/** Which page to return. */
export type PageRequest =
  | { readonly kind: 'cursor'; readonly size: number; readonly cursor?: string }
  | { readonly kind: 'offset'; readonly size: number; readonly number: number }

/** A parsed list request (mirrors `ListQuery`, minus include/fields which this spike skips). */
export interface ListQuery {
  readonly filter?: QueryFilter
  readonly search?: string
  readonly sort?: readonly SortDirective[]
  readonly page?: PageRequest
}

/** Pagination limits (mirrors `LIST_QUERY_LIMITS`). */
export const LIST_QUERY_LIMITS: { readonly defaultPageSize: number; readonly maxPageSize: number } =
  Object.freeze({ defaultPageSize: 25, maxPageSize: 100 })

/** One validation problem (RFC-0003 §1). */
export interface ValidationIssue {
  readonly path: readonly (string | number)[]
  readonly code: string
  readonly params?: Readonly<Record<string, string | number | boolean>>
  readonly message: string
}

/** RFC 9457 problem details + Strutvane extensions (mirrors `Problem` + RFC-0003 `issues`). */
export interface Problem {
  readonly type: string
  readonly title: string
  readonly status: number
  readonly code: string
  readonly detail?: string
  readonly traceId?: string
  readonly issues?: readonly ValidationIssue[]
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>
}

/** Media type of problem responses. */
export const PROBLEM_CONTENT_TYPE: 'application/problem+json' = 'application/problem+json'

/** Field metadata published as `x-strutvane-field` (subset of `FieldDescriptor`). */
export interface FieldMeta {
  readonly label: string
  readonly filterOperators?: readonly FilterOperator[]
  readonly sortable?: boolean
  readonly searchable?: boolean
  readonly widget?: string
  readonly help?: string
}

/** Resource metadata published as `x-strutvane-resource` (subset of `ResourceDescriptor`). */
export interface ResourceMeta {
  readonly name: string
  readonly path: string
  readonly label: string
  readonly pluralLabel: string
  readonly titleField: string
}
