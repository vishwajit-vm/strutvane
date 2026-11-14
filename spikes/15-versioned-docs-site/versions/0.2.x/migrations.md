---
title: Migrations
description: Migrations are the source of truth for your database. How to create tables, add and change columns, roll back, and why Strutvane can generate types and screens from them without a database.
---

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

The new file lands in `database/migrations/`, with the date and time at the start of its name (`2026_11_14_093000_create_posts_table.ts`) so migrations always run in order.

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

## Next steps

- [Seeding](../seeding/): fill your new tables with data.
- [Your First CRUD](../first-crud/): from migration to screens in five minutes.
