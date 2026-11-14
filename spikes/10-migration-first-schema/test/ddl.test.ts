/**
 * SQL generation details that differ per engine, checked as text. Running the SQL for real is in
 * `database.test.ts`; MySQL can only be checked here (no engine in the spike, so *(unverified)*).
 */
import { describe, expect, test } from 'vitest'
import { applyOperations } from '../src/schema/apply.ts'
import { EMPTY_SCHEMA, type SchemaState } from '../src/schema/columns.ts'
import { SchemaError } from '../src/schema/errors.ts'
import { recordOperations, type SchemaBuilder } from '../src/schema/migration.ts'
import { columnSql, compileOperations, createSchemaSql } from '../src/sql/ddl.ts'
import { sqlLiteral, SqlParams, type Dialect } from '../src/sql/dialect.ts'

function state(up: (schema: SchemaBuilder) => void, from: SchemaState = EMPTY_SCHEMA): SchemaState {
  return applyOperations(from, recordOperations(up, from))
}

function compile(from: SchemaState, up: (schema: SchemaBuilder) => void, dialect: Dialect): string[] {
  return compileOperations(from, recordOperations(up, from), dialect)
}

const base = state((schema) => {
  schema.create('users', (t) => t.id())
  schema.create('posts', (t) => {
    t.id()
    t.string('title')
    t.string('code').nullable().index()
    t.foreignId('author_id').nullable().constrained('users').nullOnDelete()
  })
})

describe('column types per engine', () => {
  test.each([
    ['sqlite', '"price" NUMERIC NOT NULL DEFAULT 0'],
    ['postgres', '"price" NUMERIC(12, 2) NOT NULL DEFAULT 0'],
    ['mysql', '`price` DECIMAL(12, 2) NOT NULL DEFAULT 0'],
  ] as const)('decimal on %s', (dialect, sql) => {
    expect(columnSql({ name: 'price', kind: 'decimal', nullable: false, precision: 12, scale: 2, default: 0 }, dialect)).toBe(sql)
  })

  test.each([
    ['sqlite', '"status" VARCHAR(255) NOT NULL DEFAULT \'draft\' CHECK ("status" IN (\'draft\', \'published\'))'],
    ['postgres', '"status" VARCHAR(255) NOT NULL DEFAULT \'draft\' CHECK ("status" IN (\'draft\', \'published\'))'],
    ['mysql', "`status` ENUM('draft', 'published') NOT NULL DEFAULT 'draft'"],
  ] as const)('enum on %s', (dialect, sql) => {
    expect(columnSql({ name: 'status', kind: 'enum', nullable: false, values: ['draft', 'published'], default: 'draft' }, dialect)).toBe(sql)
  })

  test('booleans: native in PostgreSQL, 0/1 elsewhere', () => {
    const column = { name: 'featured', kind: 'boolean', nullable: false, default: false } as const
    expect(columnSql(column, 'postgres')).toBe('"featured" BOOLEAN NOT NULL DEFAULT FALSE')
    expect(columnSql(column, 'sqlite')).toBe('"featured" INTEGER NOT NULL DEFAULT 0')
    expect(columnSql(column, 'mysql')).toBe('`featured` TINYINT(1) NOT NULL DEFAULT 0')
  })

  test('literals are escaped for each engine', () => {
    expect(sqlLiteral("it's", 'postgres')).toBe("'it''s'")
    expect(sqlLiteral('a\\b', 'postgres')).toBe("'a\\b'")
    expect(sqlLiteral('a\\b', 'mysql')).toBe("'a\\\\b'")
    expect(() => sqlLiteral(Number.NaN, 'sqlite')).toThrow(/finite/)
  })

  test('placeholders: $n for PostgreSQL, ?n for SQLite, ? for MySQL', () => {
    const pg = new SqlParams('postgres')
    expect([pg.add(1), pg.add('a')]).toEqual(['$1', '$2'])
    const lite = new SqlParams('sqlite')
    expect([lite.add(1), lite.add('a')]).toEqual(['?1', '?2'])
    expect(lite.values).toEqual([1, 'a'])
    const mysql = new SqlParams('mysql')
    expect([mysql.add(1), mysql.add('a')]).toEqual(['?', '?'])
  })

  test('comments: PostgreSQL uses COMMENT ON, MySQL inline, SQLite drops them', () => {
    const commented = state((schema) => schema.create('notes', (t) => { t.id(); t.text('body').comment("Owner's notes") }))
    expect(createSchemaSql(commented, 'postgres')).toContain(`COMMENT ON COLUMN "notes"."body" IS 'Owner''s notes'`)
    expect(createSchemaSql(commented, 'mysql').join('\n')).toContain("`body` TEXT NOT NULL COMMENT 'Owner''s notes'")
    expect(createSchemaSql(commented, 'sqlite').join('\n')).not.toContain('Owner')
  })
})

describe('engine-specific ALTER handling', () => {
  test('MySQL foreign keys are separate constraints (inline REFERENCES is silently ignored there)', () => {
    const sql = createSchemaSql(base, 'mysql').join('\n')
    expect(sql).toContain('CONSTRAINT `posts_author_id_foreign` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`) ON DELETE SET NULL')
    expect(sql).not.toMatch(/`author_id` BIGINT UNSIGNED NULL REFERENCES/)
  })

  test('dropping an indexed column: SQLite drops the index first, PostgreSQL lets the engine do it', () => {
    const drop = (schema: SchemaBuilder): void => schema.table('posts', (t) => t.dropColumn('code'))
    expect(compile(base, drop, 'sqlite')).toEqual(['DROP INDEX "posts_code_index"', 'ALTER TABLE "posts" DROP COLUMN "code"'])
    expect(compile(base, drop, 'postgres')).toEqual(['ALTER TABLE "posts" DROP COLUMN "code"'])
  })

  test('dropping a foreign key column: MySQL drops the constraint first, SQLite rebuilds the table', () => {
    const drop = (schema: SchemaBuilder): void => schema.table('posts', (t) => t.dropConstrainedForeignId('author_id'))
    expect(compile(base, drop, 'mysql')).toEqual(['ALTER TABLE `posts` DROP FOREIGN KEY `posts_author_id_foreign`', 'ALTER TABLE `posts` DROP COLUMN `author_id`'])
    const sqlite = compile(base, drop, 'sqlite')
    expect(sqlite[0]).toMatch(/^CREATE TABLE "__strutvane_rebuild_posts"/)
    expect(sqlite.slice(1)).toEqual([
      'INSERT INTO "__strutvane_rebuild_posts" ("id", "title", "code") SELECT "id", "title", "code" FROM "posts"',
      'DROP TABLE "posts"',
      'ALTER TABLE "__strutvane_rebuild_posts" RENAME TO "posts"',
      'CREATE INDEX "posts_code_index" ON "posts" ("code")',
    ])
  })

  test('SQLite refuses a rebuild that could cascade into child tables (fail closed)', () => {
    const withChildren = state((schema) => {
      schema.create('comments', (t) => {
        t.id()
        t.foreignId('post_id').constrained('posts').cascadeOnDelete()
      })
    }, base)
    const drop = (schema: SchemaBuilder): void => schema.table('posts', (t) => t.dropConstrainedForeignId('author_id'))
    expect(() => compile(withChildren, drop, 'sqlite')).toThrow(SchemaError)
    expect(() => compile(withChildren, drop, 'sqlite')).toThrow(/"comments" points at it/)
    // PostgreSQL drops the column in place, so there is nothing to refuse.
    expect(compile(withChildren, drop, 'postgres')).toEqual(['ALTER TABLE "posts" DROP COLUMN "author_id"'])
  })

  test('table renames: ALTER … RENAME TO, except MySQL\'s RENAME TABLE', () => {
    const rename = (schema: SchemaBuilder): void => schema.rename('posts', 'articles')
    expect(compile(base, rename, 'postgres')).toEqual(['ALTER TABLE "posts" RENAME TO "articles"'])
    expect(compile(base, rename, 'mysql')).toEqual(['RENAME TABLE `posts` TO `articles`'])
  })

  test('schema dumps put parents first, even when the key was added by a later migration', () => {
    const later = state((schema) => {
      schema.create('categories', (t) => t.id())
      schema.table('posts', (t) => t.foreignId('category_id').nullable().constrained())
    }, base)
    // categories was created *after* posts, but posts now points at it.
    const order = createSchemaSql(later, 'postgres').filter((sql) => sql.startsWith('CREATE TABLE')).map((sql) => sql.split('"')[1])
    expect(order).toEqual(['users', 'categories', 'posts'])
  })

  test('a dump with a foreign key cycle explains how to break it', () => {
    const cycle = state((schema) => {
      schema.create('teams', (t) => t.id())
      schema.create('people', (t) => { t.id(); t.foreignId('team_id').constrained() })
      schema.table('teams', (t) => t.foreignId('owner_id').nullable().constrained('people'))
    })
    expect(() => createSchemaSql(cycle, 'postgres')).toThrow(/point at each other in a circle/)
  })
})
