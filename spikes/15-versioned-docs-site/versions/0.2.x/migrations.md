---
title: Migrations
description: Migrations are the source of truth for your database. How to create tables, add and change columns, roll back, and why Strutvane can generate types and screens from them without a database.
---

:::tip[Coming from Laravel?]
Almost everything carries over: `Schema::create('posts', function (Blueprint $table) { … })` becomes `schema.create('posts', (t) => { … })`, `$table->string('title')` becomes `t.string('title')`, and `php artisan migrate` becomes `node strut migrate`. Two differences: `schema` is passed **into** `up()` and `down()` (there's no global `Schema`), and the migrations are the **source of truth** for your TypeScript types, so you never repeat columns in the model.
:::

## What is a migration?

A **migration** is a small TypeScript file that describes one change to your database: "create a `posts` table", "add a `subtitle` column", "rename `body` to `content`". Your migrations, run in order, build your whole database.

Think of them as version control for your database: every teammate and every server runs the same files in the same order and ends up with the same tables.

In Strutvane, migrations are also **the single source of truth**. Your columns are written here, and only here. From your migrations, `node strut migrate` generates:

- your **TypeScript types** (`Post`, `NewPost`, `PostPatch`, `PostJson`);
- the **metadata** the API and UI run on (labels, which fields are searchable, sortable and filterable, relations, slugs);
- the **SQL** for MySQL, PostgreSQL or SQLite.

Because all three come from the same file, they can't drift apart.

## Creating a migration

```bash
node strut make:migration create_posts_table
```

**What you'll see:**

```text
  Created database/migrations/2026_11_14_093000_create_posts_table.ts
  Created app/models/post.ts

  Next: add your columns to the migration, then run `node strut migrate`.
```

The new file lands in `database/migrations/`, with the date and time (in UTC, so every machine agrees) at the start of its name, so migrations always run in order. The model is only written when it doesn't exist yet.

Strutvane reads the **name** to give you a head start, just like Laravel:

| Name | What you get |
|---|---|
| `create_posts_table` | A migration that creates `posts` (with `id` and timestamps), **plus the model** `app/models/post.ts`. |
| `add_subtitle_to_posts_table`, `remove_excerpt_from_posts_table` | A migration that changes the existing `posts` table. |
| Anything else (`backfill_slugs`) | An empty migration. |

Add `--seeder` to also get a factory and a seeder for the new table (see [Seeding](../seeding/)).

## The structure of a migration

Every migration exports two functions: `up()` makes the change, and `down()` undoes it.

```ts
import { migration } from '@strutvane/framework/schema'

export default migration({
  up(schema) {
    schema.create('posts', (t) => {
      t.id()
      t.string('title', 200)
      t.text('body').nullable()
      t.timestamps()
    })
  },
  down(schema) {
    schema.dropIfExists('posts')
  },
})
```

`schema` is handed to your functions as a parameter (there's no global database object). That small detail is what lets Strutvane run your migrations **in memory, without a database**, to work out your types.

## Tables

| Call | What it does |
|---|---|
| `schema.create('posts', (t) => { … })` | Create a table. |
| `schema.table('posts', (t) => { … })` | Change an existing table. |
| `schema.rename('labels', 'tags')` | Rename a table. |
| `schema.drop('posts')` / `schema.dropIfExists('posts')` | Delete a table. |
| `schema.hasTable('posts')`, `schema.hasColumn('posts', 'slug')` | Check before changing (works offline too). |

## Columns

| Column | Example | Notes |
|---|---|---|
| `t.id()` | `id` | Auto-increment primary key. |
| `t.string(name, length?)` | `t.string('title', 200)` | Short text; length defaults to 255. |
| `t.text(name)` | `t.text('body')` | Long text. |
| `t.slug(name?).from(column)` | `t.slug('slug').from('title')` | URL-friendly text filled in from another column. See [Slugs](../crud-slugs/). |
| `t.integer(name)`, `t.bigInteger(name)` | `t.integer('stock')` | Whole numbers. |
| `t.decimal(name, precision?, scale?)` | `t.decimal('price', 12, 2)` | Exact numbers, for money. Read back as a string, so no cents get lost. |
| `t.double(name)` | `t.double('rating')` | Approximate numbers. |
| `t.boolean(name)` | `t.boolean('featured')` | Yes/no. |
| `t.enum(name, values)` | `t.enum('status', ['draft', 'published'])` | One of a fixed list. Typed as `'draft' \| 'published'`. |
| `t.date(name)`, `t.timestamp(name)` | `t.date('due_on')` | Dates and date-times. |
| `t.uuid(name)` | `t.uuid('public_id')` | A UUID. |
| `t.json(name)` | `t.json('meta')` | JSON data. |
| `t.foreignId(name)` | `t.foreignId('author_id').constrained('users')` | A link to another table. |
| `t.timestamps()` | | `created_at` and `updated_at`, kept up to date for you. |
| `t.softDeletes()` | | `deleted_at`: deleting hides a row so it can be restored. |

### Column modifiers

Chain these after a column:

```ts
t.string('email').unique()               // no two rows may share a value
t.string('subtitle').nullable()          // may be empty (columns are required by default)
t.enum('status', ['draft', 'published']).default('draft')
t.string('sku').index()                  // faster lookups and sorting
t.string('code').comment('Shown on invoices')
```

### Foreign keys

```ts
t.foreignId('author_id').constrained('users')                     // author_id → users.id
t.foreignId('category_id').nullable().constrained().nullOnDelete() // guesses `categories` from the name
t.foreignId('post_id').constrained().cascadeOnDelete()             // deleting a post deletes its comments
```

`constrained()` without a table name guesses it the Laravel way: `category_id` points to `categories`.

### Type safety while you write

Mistakes in a migration are caught by TypeScript before anything runs. These don't compile:

```ts
t.enum('status', ['draft', 'published']).default('archived') // 'archived' isn't in the list
t.boolean('featured').default('yes')                          // a boolean needs true or false
t.string('title').from('name')                                 // only slugs have .from()
```

## Changing a table

Never edit a migration that has already run (on your machine, a teammate's or a server). Write a new one:

```bash
node strut make:migration add_subtitle_to_posts_table
```

```ts
import { migration } from '@strutvane/framework/schema'

export default migration({
  up(schema) {
    schema.table('posts', (t) => {
      t.string('subtitle').nullable()
      t.renameColumn('body', 'content')
      t.index('status')
    })
  },
  down(schema) {
    // Undo in reverse order, so each step sees the table the way up() left it.
    schema.table('posts', (t) => {
      t.dropIndex('posts_status_index')
      t.renameColumn('content', 'body')
      t.dropColumn('subtitle')
    })
  },
})
```

Other changes: `t.dropColumn('a', 'b')`, `t.dropConstrainedForeignId('category_id')`, `t.unique(['team_id', 'code'])`, `t.dropUnique(name)`, `t.dropTimestamps()`, `t.dropSoftDeletes()`.

:::tip[Adding a required column to a table with data]
A new column that isn't `.nullable()` needs a `.default(…)`, because existing rows need a value. Strutvane tells you this before running anything, with a hint, instead of failing halfway.
:::

## Running migrations

| Command | What it does |
|---|---|
| `node strut migrate` | Run every migration that hasn't run yet, then regenerate types, the API and the UI, and seed in development. |
| `node strut migrate:status` | Show which migrations have run. |
| `node strut migrate:rollback` | Undo the last batch of migrations (runs their `down()`). |
| `node strut migrate:fresh --seed` | Drop everything, run all migrations again and seed. **Development only.** |

A **batch** is everything one `migrate` ran together, so a rollback undoes exactly what you last applied.

### When a migration fails

On **PostgreSQL** and **SQLite**, each migration runs in a transaction: if any step fails, nothing from that migration is left behind, and the error names the file.

On **MySQL**, the database itself can't undo table changes (it commits them one at a time). A migration that fails halfway can leave some of its steps applied. Strutvane will report exactly how far it got, so you know what to fix *(coming in 0.2)*. Keeping each migration small makes this easy. Laravel has the same MySQL limit.

## Types stay in sync

`node strut migrate` regenerates `.strutvane/types/models.d.ts` every time. So if a migration renames `body` to `content`, every line of code that still says `post.body` becomes a compile error:

```text
error TS2339: Property 'body' does not exist on type 'Post'.
```

You find the problem in your editor, not in production.

:::note[How it works]
Strutvane runs the `up()` functions of all your migrations in memory, against a recorder instead of a database. For 100 tables that takes about 50 milliseconds, and it needs no database. The same recorded steps produce the SQL that `migrate` runs, so the types and the database always match. (Proven in spike 10, with 248 tests on SQLite and PostgreSQL.)
:::

## Three migrations, from small to advanced

**Small:** add one optional column.

```ts title="database/migrations/2026_11_14_101500_add_subtitle_to_posts_table.ts"
import { migration } from '@strutvane/framework/schema'

export default migration({
  up(schema) {
    schema.table('posts', (t) => {
      t.string('subtitle').nullable()
    })
  },
  down(schema) {
    schema.table('posts', (t) => {
      t.dropColumn('subtitle')
    })
  },
})
```

**Typical:** a new table that links to another one.

```ts title="database/migrations/2026_11_14_102000_create_categories_table.ts"
import { migration } from '@strutvane/framework/schema'

export default migration({
  up(schema) {
    schema.create('categories', (t) => {
      t.id()
      t.string('name', 120).unique()
      t.timestamps()
    })
    schema.table('posts', (t) => {
      t.foreignId('category_id').nullable().constrained().nullOnDelete()
    })
  },
  down(schema) {
    // Reverse order: remove the link before the table it points to.
    schema.table('posts', (t) => {
      t.dropConstrainedForeignId('category_id')
    })
    schema.drop('categories')
  },
})
```

**Advanced:** a defensive migration that uses a constant and checks before changing. It's ordinary TypeScript, so loops, helpers and `if` work, and `hasColumn` answers correctly even when Strutvane replays the migration without a database.

```ts title="database/migrations/2026_11_14_103000_add_sku_to_products_table.ts"
import { migration } from '@strutvane/framework/schema'

const SKU_LENGTH = 40

export default migration({
  up(schema) {
    if (!schema.hasColumn('products', 'sku')) {
      schema.table('products', (t) => {
        t.string('sku', SKU_LENGTH).nullable().unique()
      })
    }
  },
  down(schema) {
    if (schema.hasColumn('products', 'sku')) {
      schema.table('products', (t) => {
        t.dropUnique('products_sku_unique')
        t.dropColumn('sku')
      })
    }
  },
})
```

**What you'll see** after `node strut migrate`: one line per migration that ran, and the types updated (`product.sku` is now `string | null`).

## Which database you use

Your migrations are written once and run on all three databases. The differences you might notice:

| | MySQL (default) | PostgreSQL | SQLite |
|---|---|---|---|
| A failing migration | Earlier steps of that migration may stay applied (MySQL commits table changes one at a time) | Rolled back completely | Rolled back completely |
| `t.decimal` | Exact | Exact | Stored as a float; Strutvane re-formats it on the way out |
| `t.enum` | Native `ENUM` | A `CHECK` constraint | A `CHECK` constraint |
| Dropping an indexed or foreign-key column | Direct | Direct | Strutvane drops the index first, or rebuilds the table |

With Docker or without, the commands are the same; with Docker, `node strut migrate` runs inside the app container against the database container.

## Common mistakes

Strutvane checks your migrations before touching the database, and prints a code, the file, what's wrong and a hint.

### "is required but has no default"

```text
[INVALID_COLUMN] in 2026_11_14_101500_add_subtitle_to_posts_table.ts: The new column "posts.subtitle" is required but has no default, so existing rows would have no value. Hint: Make it .nullable(), or give it a .default(…).
```

**Why:** the table may already have rows, and they need a value.
**Fix:** `t.string('subtitle').nullable()` or `.default('')`.

### "There is no table … at this point in the migrations"

```text
[UNKNOWN_TABLE] in 2026_11_14_101500_add_subtitle_to_posts_table.ts: There is no table "post" at this point in the migrations. Hint: Known tables: users, posts. Check the spelling and the migration order.
```

**Why:** a typo (`post` instead of `posts`), or the migration that creates the table runs later (its file name sorts after this one).
**Fix:** correct the name, or rename the file so its date comes after the `create_…` migration.

### "points to the table …, which doesn't exist yet"

```text
[INVALID_FOREIGN_KEY] in 2026_11_14_093000_create_posts_table.ts: "posts.author_id" points to the table "users", which doesn't exist yet. Hint: Create "users" in an earlier migration, or fix the name in .constrained('…').
```

**Why:** a foreign key needs its parent table first.
**Fix:** create the parent table in an earlier migration, or check the name in `.constrained('…')`.

### "Can't drop …: the slug … is built from it"

```text
[INVALID_SLUG_SOURCE] in 2026_11_20_090000_remove_title_from_posts_table.ts: Can't drop "posts.title": the slug "slug" is built from it. Hint: Change the slug's source first, or drop "slug" in the same migration before "title".
```

**Why:** the slug would have nothing to be made from.
**Fix:** drop or change the slug first, in the same migration.

### I edited an old migration and nothing changed

**Why:** a migration that has already run never runs again; the `migrations` table remembers it.
**Fix:** write a new migration for the change. On your own machine only, you can start over with `node strut migrate:fresh --seed` (this **deletes all data**).

## Next steps

- [Seeding](../seeding/): fill your new tables with data.
- [Your First CRUD](../first-crud/): from migration to screens in five minutes.
