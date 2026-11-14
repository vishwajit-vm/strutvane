/**
 * The prototype's public surface: what `@strutvane/framework/orm` would export.
 */
export { Connection, type QueryEvent } from './db/connection.ts'
export type { Driver } from './db/driver.ts'
export { defaultConnection, transaction, useConnection } from './db/manager.ts'
export { pgliteDriver } from './db/pglite-driver.ts'
export { mysqlDriver } from './db/mysql-driver.ts'
export { sqliteDriver } from './db/sqlite-driver.ts'
export { type ColumnOf, type JsonValue, registerSchema, type RowOf, type TableName, type TableRegistry } from './schema/registry.ts'
export type { SchemaSnapshot } from './schema/snapshot.ts'
export { SqlFragment, sql } from './sql/fragment.ts'
export { Builder, type FilterOperator } from './orm/builder.ts'
export { type Cast, cast, json } from './orm/casts.ts'
export { configureOrm } from './orm/config.ts'
export {
  CastError,
  LazyLoadingError,
  MassAssignmentError,
  ModelNotFoundError,
  OrmError,
  OrmUsageError,
  TenantMismatchError,
  TenantRequiredError,
} from './orm/errors.ts'
export { loadMany, Model, ModelBase, type ModelClass, type ModelInstance } from './orm/model.ts'
export type { CursorPage, Page } from './orm/pagination.ts'
export type { BelongsTo, BelongsToMany, HasMany } from './orm/relations.ts'
export { currentTenant, runWithTenant } from './orm/tenancy.ts'
export type { JsonOf, QueryBuilder, RelationPath, Scopes, ScopeQuery, WithCounts, WithRelations } from './orm/types.ts'
