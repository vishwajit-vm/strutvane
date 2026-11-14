/**
 * Generate resource metadata: the JSON a CRUD API and a UI read to do their jobs without any
 * per-model code. Labels, search, sorting, filters, relations, slugs, form inputs and sidebar
 * order are all derived from column types and names.
 *
 * Migrations stay purely about the database. Anything presentational that the derivation gets
 * wrong (a label, the sidebar order) is overridden in {@link ResourceOverrides}, which is the
 * spike's stand-in for an app's resource config file (level L1 "configure").
 */
import { camelCase, humanize, modelNameForTable, pascalCase, singularize } from '../naming.ts'
import { isSensitiveColumn, MANAGED_TIMESTAMPS, type ColumnDef, type ColumnKind, type SchemaState, type TableState } from '../schema/columns.ts'
import { isFillable, isRequiredOnCreate, isReturnedByApi } from './semantics.ts'

/**
 * How a value is converted between the database, JSON and forms.
 *
 * @example
 * const cast: FieldCast = 'decimal'
 */
export type FieldCast = 'integer' | 'number' | 'decimal' | 'string' | 'boolean' | 'date' | 'datetime' | 'json'

/**
 * How free-text `?search=` treats a field: `text` means "contains, case-insensitive", `exact`
 * means "equals, when the search term is a number".
 *
 * @example
 * const mode: SearchMode = 'text'
 */
export type SearchMode = 'text' | 'exact'

/**
 * Filter operators, used as `?filter[price][gte]=10`.
 *
 * @example
 * const op: FilterOperator = 'gte'
 */
export type FilterOperator = 'eq' | 'ne' | 'in' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startsWith' | 'null'

/**
 * The UI widget for a field.
 *
 * @example
 * const input: FieldInput = 'select'
 */
export type FieldInput = 'text' | 'textarea' | 'number' | 'decimal' | 'switch' | 'select' | 'relation' | 'date' | 'datetime' | 'json' | 'none'

/**
 * Everything a CRUD API or UI needs to know about one field.
 *
 * @example
 * resource.fields.find((field) => field.name === 'status')?.options // ['draft', 'published']
 */
export interface FieldMetadata {
  readonly name: string
  readonly label: string
  readonly kind: ColumnKind
  readonly cast: FieldCast
  readonly nullable: boolean
  /** Must be sent on create. */
  readonly required: boolean
  /** May be sent on create/update. */
  readonly fillable: boolean
  /** Covered by a single-column unique index, so the API checks for duplicates before writing. */
  readonly unique: boolean
  /** Never returned by the API or shown in the UI. */
  readonly hidden: boolean
  readonly searchable: SearchMode | false
  readonly sortable: boolean
  /** Shown as a column in the list view. */
  readonly listed: boolean
  readonly input: FieldInput
  /** Operators accepted by `?filter[name][op]=…`; empty when the field can't be filtered. */
  readonly filterOperators: readonly FilterOperator[]
  readonly maxLength?: number
  readonly precision?: number
  readonly scale?: number
  readonly options?: readonly string[]
  readonly default?: string | number | boolean | null
  /** For foreign keys: the resource the value points to. */
  readonly references?: string
}

/**
 * A relation between two resources, for eager loading and relation pickers.
 *
 * @example
 * const author: RelationMetadata = { name: 'author', kind: 'belongsTo', resource: 'users', foreignKey: 'author_id', ownerKey: 'id' }
 */
export interface RelationMetadata {
  readonly name: string
  readonly kind: 'belongsTo' | 'hasMany'
  readonly resource: string
  /** The column holding the id: on this table for `belongsTo`, on the other table for `hasMany`. */
  readonly foreignKey: string
  readonly ownerKey: string
}

/**
 * One resource: a table plus everything needed to serve and show it.
 *
 * @example
 * metadata.resources.find((resource) => resource.table === 'posts')?.label.plural // 'Posts'
 */
export interface ResourceMetadata {
  readonly table: string
  readonly model: string
  /** URL segment: `/api/posts`. */
  readonly route: string
  readonly label: { readonly singular: string; readonly plural: string }
  readonly primaryKey: string
  /** The field that names a row in pickers and breadcrumbs (`name`, `title`, …). */
  readonly titleField: string
  readonly slug?: { readonly field: string; readonly from: string }
  readonly timestamps: boolean
  readonly softDeletes: boolean
  /** For example `-created_at` (newest first). */
  readonly defaultSort: string
  readonly perPage: number
  readonly fields: readonly FieldMetadata[]
  readonly relations: readonly RelationMetadata[]
  readonly sidebar: { readonly order: number; readonly hidden: boolean }
}

/**
 * The whole metadata document, written to `.strutvane/resources.json`.
 *
 * @example
 * const metadata: AppMetadata = JSON.parse(readFileSync('.strutvane/resources.json', 'utf8'))
 */
export interface AppMetadata {
  readonly version: 1
  readonly resources: readonly ResourceMetadata[]
}

/**
 * App-level tweaks to the derived metadata. Kept out of migrations on purpose: migrations describe
 * the database, not the UI.
 *
 * @example
 * const overrides: ResourceOverrides = { users: { label: { singular: 'Member', plural: 'Members' }, sidebarOrder: 1 } }
 */
export type ResourceOverrides = Readonly<
  Record<string, { readonly label?: { readonly singular: string; readonly plural: string }; readonly sidebarOrder?: number; readonly hidden?: boolean }>
>

/** Laravel's default page size. */
const DEFAULT_PER_PAGE = 15

/** Preferred title columns, in order. The first one that exists names the row. */
const TITLE_CANDIDATES = ['name', 'title', 'label', 'email'] as const

/**
 * Derive metadata for every table.
 *
 * @example
 * const metadata = generateMetadata(replay.state)
 * writeFileSync('.strutvane/resources.json', `${JSON.stringify(metadata, null, 2)}\n`)
 */
export function generateMetadata(state: SchemaState, overrides: ResourceOverrides = {}): AppMetadata {
  const resources = state.tables.map((table) => resourceFor(state, table))
  return { version: 1, resources: withSidebarOrder(resources, overrides) }
}

function resourceFor(state: SchemaState, table: TableState): ResourceMetadata {
  const model = modelNameForTable(table.name)
  const slugColumn = table.columns.find((column) => column.kind === 'slug' && column.slugFrom !== undefined)
  const has = (name: string): boolean => table.columns.some((column) => column.name === name)
  return {
    table: table.name,
    model,
    route: table.name.replace(/_/g, '-'),
    label: { singular: humanize(singularize(table.name)), plural: humanize(table.name) },
    primaryKey: 'id',
    titleField: titleFieldOf(table),
    ...(slugColumn?.slugFrom === undefined ? {} : { slug: { field: slugColumn.name, from: slugColumn.slugFrom } }),
    timestamps: has('created_at') && has('updated_at'),
    softDeletes: has('deleted_at'),
    defaultSort: has('created_at') ? '-created_at' : '-id',
    perPage: DEFAULT_PER_PAGE,
    fields: table.columns.map((column) => fieldFor(table, column)),
    relations: relationsOf(state, table),
    sidebar: { order: 0, hidden: false },
  }
}

function fieldFor(table: TableState, column: ColumnDef): FieldMetadata {
  const hidden = !isReturnedByApi(column)
  const unique = table.indexes.some((index) => index.unique && index.columns.length === 1 && index.columns[0] === column.name)
  return {
    name: column.name,
    label: humanize(column.name),
    kind: column.kind,
    cast: CAST[column.kind],
    nullable: column.nullable,
    required: isFillable(column) && isRequiredOnCreate(column),
    fillable: isFillable(column),
    unique,
    hidden,
    searchable: hidden ? false : SEARCH[column.kind],
    sortable: !hidden && column.kind !== 'text' && column.kind !== 'json',
    listed: isListed(column),
    input: hidden || !isFillable(column) ? 'none' : inputFor(column),
    filterOperators: hidden ? [] : filterOperatorsFor(column),
    ...(column.length === undefined ? {} : { maxLength: column.length }),
    ...(column.precision === undefined ? {} : { precision: column.precision }),
    ...(column.scale === undefined ? {} : { scale: column.scale }),
    ...(column.values === undefined ? {} : { options: column.values }),
    ...('default' in column && column.default !== undefined ? { default: column.default } : {}),
    ...(column.references === undefined ? {} : { references: column.references.table }),
  }
}

const CAST: Readonly<Record<ColumnKind, FieldCast>> = {
  id: 'integer',
  integer: 'integer',
  bigInteger: 'integer',
  foreignId: 'integer',
  double: 'number',
  decimal: 'decimal',
  string: 'string',
  text: 'string',
  slug: 'string',
  uuid: 'string',
  enum: 'string',
  boolean: 'boolean',
  date: 'date',
  timestamp: 'datetime',
  json: 'json',
}

/**
 * Free-text search. Booleans, dates and JSON are left out on purpose: "search for `true`" or
 * "search for 2026" are better served by filters, and matching them as text gives surprising hits.
 */
const SEARCH: Readonly<Record<ColumnKind, SearchMode | false>> = {
  id: 'exact',
  integer: 'exact',
  bigInteger: 'exact',
  foreignId: 'exact',
  double: 'exact',
  decimal: 'exact',
  string: 'text',
  text: 'text',
  slug: 'text',
  uuid: 'text',
  enum: 'text',
  boolean: false,
  date: false,
  timestamp: false,
  json: false,
}

function filterOperatorsFor(column: ColumnDef): FilterOperator[] {
  const base = FILTER_OPERATORS[column.kind]
  // `?filter[subtitle][null]=true` only makes sense on columns that can be null.
  return column.nullable && base.length > 0 ? [...base, 'null'] : [...base]
}

const NUMERIC_OPERATORS: readonly FilterOperator[] = ['eq', 'ne', 'in', 'gt', 'gte', 'lt', 'lte']
const RANGE_OPERATORS: readonly FilterOperator[] = ['eq', 'gt', 'gte', 'lt', 'lte']
const STRING_OPERATORS: readonly FilterOperator[] = ['eq', 'ne', 'in', 'contains', 'startsWith']

const FILTER_OPERATORS: Readonly<Record<ColumnKind, readonly FilterOperator[]>> = {
  id: NUMERIC_OPERATORS,
  integer: NUMERIC_OPERATORS,
  bigInteger: NUMERIC_OPERATORS,
  double: NUMERIC_OPERATORS,
  decimal: NUMERIC_OPERATORS,
  foreignId: ['eq', 'ne', 'in'],
  string: STRING_OPERATORS,
  slug: STRING_OPERATORS,
  uuid: ['eq', 'ne', 'in'],
  text: ['contains'],
  enum: ['eq', 'ne', 'in'],
  boolean: ['eq'],
  date: RANGE_OPERATORS,
  timestamp: RANGE_OPERATORS,
  json: [],
}

function inputFor(column: ColumnDef): FieldInput {
  switch (column.kind) {
    case 'text':
      return 'textarea'
    case 'integer':
    case 'bigInteger':
    case 'double':
      return 'number'
    case 'decimal':
      return 'decimal'
    case 'boolean':
      return 'switch'
    case 'enum':
      return 'select'
    case 'foreignId':
      return column.references === undefined ? 'number' : 'relation'
    case 'date':
      return 'date'
    case 'timestamp':
      return 'datetime'
    case 'json':
      return 'json'
    case 'id':
      return 'none'
    case 'string':
    case 'slug':
    case 'uuid':
      return 'text'
  }
}

/** List views show short, scannable columns: no long text, JSON, secrets or bookkeeping timestamps. */
function isListed(column: ColumnDef): boolean {
  if (isSensitiveColumn(column.name)) return false
  if (column.kind === 'text' || column.kind === 'json') return false
  return !(MANAGED_TIMESTAMPS.has(column.name) && column.name !== 'created_at')
}

function titleFieldOf(table: TableState): string {
  for (const candidate of TITLE_CANDIDATES) {
    if (table.columns.some((column) => column.name === candidate && column.kind === 'string')) return candidate
  }
  return table.columns.find((column) => column.kind === 'slug')?.name ?? 'id'
}

function relationsOf(state: SchemaState, table: TableState): RelationMetadata[] {
  const belongsTo: RelationMetadata[] = table.columns.flatMap((column) =>
    column.references === undefined
      ? []
      : [{ name: camelCase(column.name.replace(/_id$/, '')), kind: 'belongsTo' as const, resource: column.references.table, foreignKey: column.name, ownerKey: column.references.column }],
  )
  const children = state.tables.flatMap((child) =>
    child.columns.filter((column) => column.references?.table === table.name).map((column) => ({ child, column })),
  )
  const hasMany: RelationMetadata[] = children.map(({ child, column }) => {
    // Two keys from the same child table (author_id, editor_id) would both be "posts": disambiguate.
    const ambiguous = children.filter((other) => other.child.name === child.name).length > 1
    const base = camelCase(child.name)
    const name = ambiguous ? `${base}As${pascalCase(column.name.replace(/_id$/, ''))}` : base
    return { name, kind: 'hasMany' as const, resource: child.name, foreignKey: column.name, ownerKey: column.references?.column ?? 'id' }
  })
  return [...belongsTo, ...hasMany]
}

/**
 * Sidebar order: explicit overrides first (by their number), then everything else alphabetically
 * by label. Alphabetical, not migration order, so adding a table never reshuffles the menu.
 */
function withSidebarOrder(resources: readonly ResourceMetadata[], overrides: ResourceOverrides): ResourceMetadata[] {
  const configured = resources.map((resource) => {
    const override = overrides[resource.table]
    return {
      ...resource,
      ...(override?.label === undefined ? {} : { label: override.label }),
      sidebar: { order: override?.sidebarOrder ?? Number.POSITIVE_INFINITY, hidden: override?.hidden ?? false },
    }
  })
  const ranked = [...configured].sort((a, b) => a.sidebar.order - b.sidebar.order || compareText(a.label.plural, b.label.plural))
  return configured.map((resource) => ({ ...resource, sidebar: { ...resource.sidebar, order: ranked.indexOf(resource) + 1 } }))
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
