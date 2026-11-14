/**
 * `#strutvane/database`: the connection, dialects, metadata and the list-query engine.
 * (The ORM proper is spike 11.)
 */
export { ConnectionToken, openConnection, openSqlite, type Connection, type ConnectionSettings } from './database/connection.ts'
export { mysqlDialect, postgresDialect, sqliteDialect, type Dialect, type SqlValue } from './database/dialect.ts'
export { buildListSql, type Constraint } from './database/list-sql.ts'
export { parseListQuery, type ListRequest } from './database/list-query.ts'
export { AppMetadata, INTERNAL_TABLES, isInternalResource, loadMetadata, MetadataToken, type FieldMetadata, type ResourceMetadata } from './database/metadata.ts'
export type { Paginated } from './database/model.ts'
