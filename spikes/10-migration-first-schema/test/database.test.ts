/**
 * The generated SQL, run for real on SQLite (node:sqlite) and PostgreSQL (PGlite): migrate,
 * roll back step by step, and prove at every step that the live database matches what the
 * recorder predicted offline.
 */
import { afterEach, describe, expect, test } from 'vitest'
import type { Database } from '../src/db/database.ts'
import { introspect, schemaDrift } from '../src/db/introspect.ts'
import { migrate, MIGRATIONS_TABLE, ranMigrations, rollback } from '../src/db/migrator.ts'
import { migration } from '../src/schema/migration.ts'
import { replayMigrations, type Replay } from '../src/schema/replay.ts'
import { createSchemaSql } from '../src/sql/ddl.ts'
import { SqlParams } from '../src/sql/dialect.ts'
import { BLOG_ROOT, ENGINES, replayApp } from './helpers.ts'

/** A replay containing only the first `count` migrations, as if the rest didn't exist yet. */
function firstMigrations(replay: Replay, count: number): Replay {
  const migrations = replay.migrations.slice(0, count)
  return { migrations, state: migrations.at(-1)?.after ?? { tables: [] } }
}

describe.each(ENGINES)('$name', ({ open }) => {
  let db: Database | undefined
  afterEach(async () => {
    await db?.close()
    db = undefined
  })

  async function freshDb(): Promise<Database> {
    db = await open()
    return db
  }

  test('migrate runs every migration as one batch, and the live schema matches the recorder exactly', async () => {
    const replay = await replayApp(BLOG_ROOT)
    const database = await freshDb()
    const { ran, batch } = await migrate(database, replay)
    expect(ran).toHaveLength(7)
    expect(batch).toBe(1)
    expect(schemaDrift(replay.state, await introspect(database), database.dialect)).toEqual([])
    // Running again is a no-op: nothing pending.
    expect((await migrate(database, replay)).ran).toEqual([])
  })

  test('one migration per batch, then roll back batch by batch: no drift at any step', async () => {
    const replay = await replayApp(BLOG_ROOT)
    const database = await freshDb()
    for (let count = 1; count <= replay.migrations.length; count++) {
      const partial = firstMigrations(replay, count)
      expect((await migrate(database, partial)).batch).toBe(count)
      expect(schemaDrift(partial.state, await introspect(database), database.dialect)).toEqual([])
    }
    for (const step of [...replay.migrations].reverse()) {
      expect(await rollback(database, replay)).toEqual([step.name])
      expect(schemaDrift(step.before, await introspect(database), database.dialect)).toEqual([])
    }
    expect(await introspect(database)).toEqual([])
    expect(await ranMigrations(database)).toEqual([])
  })

  test('rows survive renames and the SQLite table rebuild on the way down', async () => {
    const replay = await replayApp(BLOG_ROOT)
    const database = await freshDb()
    // One batch per migration, so each rollback undoes exactly one.
    for (let count = 1; count <= replay.migrations.length; count++) await migrate(database, firstMigrations(replay, count))
    await database.query(`INSERT INTO "users" ("name", "email") VALUES ('Ada', 'ada@example.com')`)
    await database.query(`INSERT INTO "categories" ("name", "slug") VALUES ('News', 'news')`)
    await database.query(`INSERT INTO "posts" ("title", "slug", "content", "author_id", "category_id") VALUES ('Hello', 'hello', 'Body text', 1, 1)`)
    // Undo rename_labels, create_labels and add_category (the one that rebuilds posts on SQLite).
    for (let undo = 0; undo < 3; undo++) await rollback(database, replay)
    expect(schemaDrift(firstMigrations(replay, 4).state, await introspect(database), database.dialect)).toEqual([])
    expect(await database.query(`SELECT "title", "slug", "content", "author_id" FROM "posts"`)).toEqual([{ title: 'Hello', slug: 'hello', content: 'Body text', author_id: 1 }])
  })

  test('the database enforces what the migrations declared: enum values, cascade and set-null', async () => {
    const replay = await replayApp(BLOG_ROOT)
    const database = await freshDb()
    await migrate(database, replay)
    await database.query(`INSERT INTO "users" ("name", "email") VALUES ('Ada', 'ada@example.com')`)
    await database.query(`INSERT INTO "categories" ("name", "slug") VALUES ('News', 'news')`)
    await expect(database.query(`INSERT INTO "posts" ("title", "slug", "author_id", "status") VALUES ('x', 'x', 1, 'archived')`)).rejects.toThrow(/check/i)
    await database.query(`INSERT INTO "posts" ("title", "slug", "author_id", "category_id") VALUES ('x', 'x', 1, 1)`)
    await database.query(`DELETE FROM "categories"`)
    expect(await database.query(`SELECT "category_id" FROM "posts"`)).toEqual([{ category_id: null }])
    await database.query(`DELETE FROM "users"`)
    expect(await database.query(`SELECT COUNT(*) AS "n" FROM "posts"`)).toEqual([{ n: 0 }])
  })

  test('the schema dump builds the same database as running every migration', async () => {
    const replay = await replayApp(BLOG_ROOT)
    const database = await freshDb()
    for (const sql of createSchemaSql(replay.state, database.dialect)) await database.execute(sql)
    expect(schemaDrift(replay.state, await introspect(database), database.dialect)).toEqual([])
  })

  test('a migration that fails half-way leaves nothing behind (fail closed)', async () => {
    const replay = await replayApp(BLOG_ROOT)
    const database = await freshDb()
    await migrate(database, replay)
    await database.query(`INSERT INTO "users" ("name", "email") VALUES ('Ada', 'ada@example.com')`)
    await database.query(`INSERT INTO "posts" ("title", "slug", "author_id", "subtitle") VALUES ('a', 'a', 1, 'same'), ('b', 'b', 1, 'same')`)
    // Statement 1 (add column) works; statement 2 (unique index over duplicates) fails.
    const failing = replayMigrations(
      [
        ...replay.migrations.map(({ name, migration: m }) => ({ name, migration: m })),
        {
          name: '2026_01_08_000000_make_subtitles_unique',
          migration: migration({
            up: (schema) => schema.table('posts', (t) => { t.string('code').nullable(); t.unique('subtitle') }),
            down: (schema) => schema.table('posts', (t) => { t.dropUnique('posts_subtitle_unique'); t.dropColumn('code') }),
          }),
        },
      ],
    )
    await expect(migrate(database, failing)).rejects.toThrow(/unique|duplicate/i)
    expect(schemaDrift(replay.state, await introspect(database), database.dialect)).toEqual([])
    expect((await ranMigrations(database)).map((row) => row.name)).not.toContain('2026_01_08_000000_make_subtitles_unique')
  })

  test('drift check: a hand-made change is reported in plain words', async () => {
    const replay = await replayApp(BLOG_ROOT)
    const database = await freshDb()
    await migrate(database, replay)
    await database.execute('ALTER TABLE "posts" ADD COLUMN "sneaky" INTEGER NULL')
    await database.execute('CREATE INDEX "posts_title_index" ON "posts" ("title")')
    expect(schemaDrift(replay.state, await introspect(database), database.dialect)).toEqual([
      'Column "posts.sneaky" is in the database but not in the migrations.',
      'Index "posts_title_index" on "posts" is in the database but not in the migrations.',
    ])
  })

  test('placeholders bind correctly even when SQL is assembled out of order or reuses one (regression)', async () => {
    // This exact pattern (a WHERE clause built tail-first, a value used twice) bound the wrong
    // values on SQLite with anonymous `?` while passing on PostgreSQL. Numbered placeholders fix the class.
    const database = await freshDb()
    const params = new SqlParams(database.dialect)
    const tail = `${params.add('second')} AS "second"`
    const head = params.add('first')
    const rows = await database.query(`SELECT ${head} AS "first", ${tail}, ${head} AS "again"`, params.values)
    expect(rows).toEqual([{ first: 'first', second: 'second', again: 'first' }])
  })

  test('a ran migration whose file is gone stops migrate with a clear explanation', async () => {
    const replay = await replayApp(BLOG_ROOT)
    const database = await freshDb()
    await migrate(database, replay)
    await expect(migrate(database, firstMigrations(replay, 3))).rejects.toThrow(/says "2026_01_04_000000_create_categories_table" ran, but there is no such migration file/)
    expect(await database.query(`SELECT COUNT(*) AS "n" FROM "${MIGRATIONS_TABLE}"`)).toEqual([{ n: 7 }])
  })
})

