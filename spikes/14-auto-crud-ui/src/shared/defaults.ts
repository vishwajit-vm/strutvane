/**
 * The inference rules behind `auto()`: which fields become list columns, form fields and filters
 * when the developer has not said otherwise.
 *
 * Shared by the Node generator (it writes "what auto() resolves to today" as a comment into new
 * owned files and reports new columns) and the React app (it renders the result). One copy of the
 * rules means the comment in the owned file always matches the screen.
 *
 * @module
 */
import { isExposedField } from './exposure.ts'
import type { FieldMetadata, ResourceMetadata } from './metadata.ts'

/** Column kinds that never make good filters: long text and JSON are better found by search. */
const NOT_FILTERABLE_KINDS: ReadonlySet<string> = new Set(['text', 'json'])

/**
 * Default list columns: the title field first, then every field spike 10 marked `listed`, in
 * schema order, with the primary key left out (it is noise to people; the row links to it).
 *
 * Why no cap on the number of columns: a cap would hide exactly the new column the developer just
 * migrated, which defeats "new columns appear automatically". The table scrolls sideways instead.
 *
 * @example
 * defaultColumns(posts).map((field) => field.name) // ['title', 'slug', 'price', 'status', ...]
 */
export function defaultColumns(resource: ResourceMetadata): FieldMetadata[] {
  const listed = resource.fields.filter((field) => field.listed && isExposedField(field) && field.name !== resource.primaryKey)
  const title = listed.find((field) => field.name === resource.titleField)
  const rest = listed.filter((field) => field !== title)
  return title === undefined ? rest : [title, ...rest]
}

/**
 * Default form fields: everything the API lets you write, in schema order.
 *
 * @example
 * defaultFormFields(posts).map((field) => field.name) // ['title', 'slug', 'content', 'price', ...]
 */
export function defaultFormFields(resource: ResourceMetadata): FieldMetadata[] {
  return resource.fields.filter((field) => field.fillable && isExposedField(field) && field.input !== 'none')
}

/**
 * Default filters: every field with filter operators, except long text, JSON, the primary key,
 * `updated_at` (rarely what anyone filters by) and `deleted_at` (soft deletes get their own
 * "Deleted" control).
 *
 * @example
 * defaultFilterFields(posts).map((field) => field.name) // ['title', 'slug', 'price', 'status', ...]
 */
export function defaultFilterFields(resource: ResourceMetadata): FieldMetadata[] {
  return resource.fields.filter(
    (field) =>
      isExposedField(field) &&
      field.filterOperators.length > 0 &&
      !NOT_FILTERABLE_KINDS.has(field.kind) &&
      field.name !== resource.primaryKey &&
      field.name !== 'updated_at' &&
      field.name !== 'deleted_at',
  )
}

/**
 * The field used in URLs: the slug when the table has one (`/posts/my-first-post`), else the id.
 *
 * @example
 * routeKeyOf(posts) // 'slug'
 * routeKeyOf(tags) // 'id'
 */
export function routeKeyOf(resource: ResourceMetadata): string {
  return resource.slug?.field ?? resource.primaryKey
}
