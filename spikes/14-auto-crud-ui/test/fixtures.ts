/**
 * Pure metadata fixtures (no file system, so they also work in jsdom tests): copies of the blog
 * metadata with columns or tables added or removed, the way a migration would change them.
 */
import type { AppMetadata, FieldMetadata, ResourceMetadata } from '../src/shared/metadata.ts'

/** A copy of the metadata with some fields of one table removed. */
export function withoutFields(metadata: AppMetadata, table: string, names: readonly string[]): AppMetadata {
  return mapResource(metadata, table, (resource) => ({ ...resource, fields: resource.fields.filter((field) => !names.includes(field.name)) }))
}

/** A copy of the metadata with one extra field appended to a table, as a migration would. */
export function withField(metadata: AppMetadata, table: string, field: FieldMetadata): AppMetadata {
  return mapResource(metadata, table, (resource) => ({ ...resource, fields: [...resource.fields, field] }))
}

/** A copy of the metadata with an extra table. */
export function withResource(metadata: AppMetadata, resource: ResourceMetadata): AppMetadata {
  return { ...metadata, resources: [...metadata.resources, resource] }
}

/** A copy of the metadata without one table. */
export function withoutResource(metadata: AppMetadata, table: string): AppMetadata {
  return { ...metadata, resources: metadata.resources.filter((resource) => resource.table !== table) }
}

/** A short string column, shaped like spike 10's output for `t.string('color', 20).nullable()`. */
export function stringField(name: string, label: string): FieldMetadata {
  return {
    name,
    label,
    kind: 'string',
    cast: 'string',
    nullable: true,
    required: false,
    fillable: true,
    unique: false,
    hidden: false,
    searchable: 'text',
    sortable: true,
    listed: true,
    input: 'text',
    filterOperators: ['eq', 'ne', 'in', 'contains', 'startsWith', 'null'],
    maxLength: 20,
  }
}

/** A minimal new table (`comments`), as spike 10 would describe it. */
export function commentsResource(): ResourceMetadata {
  return {
    table: 'comments',
    model: 'Comment',
    route: 'comments',
    label: { singular: 'Comment', plural: 'Comments' },
    primaryKey: 'id',
    titleField: 'id',
    timestamps: false,
    softDeletes: false,
    defaultSort: '-id',
    perPage: 15,
    fields: [
      { name: 'id', label: 'Id', kind: 'id', cast: 'integer', nullable: false, required: false, fillable: false, unique: false, hidden: false, searchable: 'exact', sortable: true, listed: true, input: 'none', filterOperators: ['eq', 'ne', 'in', 'gt', 'gte', 'lt', 'lte'] },
      { ...stringField('body', 'Body'), maxLength: 500 },
    ],
    relations: [],
    sidebar: { order: 5, hidden: false },
  }
}

function mapResource(metadata: AppMetadata, table: string, change: (resource: ResourceMetadata) => ResourceMetadata): AppMetadata {
  return { ...metadata, resources: metadata.resources.map((resource) => (resource.table === table ? change(resource) : resource)) }
}

