/**
 * What an app's migration files import: `import { migration } from '#strutvane/schema'`.
 *
 * In the product this would be `@strutvane/framework/schema`. The spike maps it through the
 * package.json `imports` field so the fixture migrations read like real app code.
 */
export { migration, type Migration, type SchemaBuilder } from './schema/migration.ts'
export type { Blueprint, ColumnBuilder, ForeignIdColumnBuilder, SlugColumnBuilder } from './schema/blueprint.ts'
