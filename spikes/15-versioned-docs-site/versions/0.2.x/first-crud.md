---
title: Your First CRUD in 5 Minutes
description: Build a complete "Posts" feature (a database table, a secured JSON API, admin screens and a sidebar entry) from one migration and two commands, step by step.
---

**CRUD** stands for create, read, update and delete: the four things you do with records in any business app. In this guide you'll add **blog posts** to a new app. You'll write about fifteen lines of code, and at the end you'll have:

- a `posts` table in your database;
- a JSON API to list, search, create, update and delete posts;
- admin screens: a list with search, filters and pages, create and edit forms, and a detail page;
- **Posts** in the sidebar, for everyone who's allowed to see it;
- fake posts to play with.

:::tip[Coming from Laravel?]
This is `php artisan make:model Post -mfs` plus a Filament resource, in one flow. The differences: you start from `make:migration` (it writes the model for you), columns are only written in the migration (there's no `$fillable` guesswork: you list `fillable` once in the model), and the API and admin screens appear on `migrate` without a separate generator.
:::

**Before you start:** create an app and start it, as shown in [Installation](../installation/):

```bash
npm create strutvane@latest my-app
cd my-app
npm run dev
```

Leave `npm run dev` running, and open a **second terminal** in the `my-app` folder for the commands below. (With Docker, type the commands exactly the same way: `node strut` forwards them into the app container.)

## Step 1: Make the migration

A **migration** is a small file that describes one change to your database, like "create a posts table". Ask Strutvane to write one:

```bash
node strut make:migration create_posts_table --seeder --factory
```

**What you'll see:**

```text
  Created database/migrations/2026_11_14_093000_create_posts_table.ts
  Created app/models/post.ts
  Created database/seeders/post.seeder.ts
  Created database/factories/post.factory.ts

  Next: add your columns to the migration, then run `node strut migrate`.
  Then call PostSeeder from database/seeders/database.seeder.ts.
```

Strutvane reads the name `create_posts_table` the way Laravel does: it means "create a table called `posts`". Because it creates a table, it **also writes the model**. `--seeder` and `--factory` add a seeder (code that fills the table) and a factory (a recipe for one fake post). The date at the start of the file name is the current time in UTC; it keeps migrations in order.

:::caution[Coming in 0.2]
Registering the new seeder in `database/seeders/database.seeder.ts` will happen for you. In the prototype, the command prints the reminder above instead.
:::

## Step 2: Describe your columns

Open the new migration. It already has an `id` and timestamps. Add the columns a post needs:

```ts title="database/migrations/2026_11_14_093000_create_posts_table.ts"
import { migration } from '@strutvane/framework/schema'

export default migration({
  up(schema) {
    schema.create('posts', (t) => {
      t.id()
      t.string('title', 200)
      t.slug('slug').from('title')
      t.text('body').nullable()
      t.decimal('price', 12, 2).default(0)
      t.enum('status', ['draft', 'published']).default('draft')
      t.foreignId('author_id').constrained('users')
      t.timestamps()
      t.softDeletes()
    })
  },
  down(schema) {
    schema.drop('posts')
  },
})
```

Line by line:

| Line | What it makes |
|---|---|
| `t.id()` | An auto-increment primary key called `id`. |
| `t.string('title', 200)` | Required text, at most 200 characters. Columns are required unless you add `.nullable()`. |
| `t.slug('slug').from('title')` | A URL-friendly copy of the title, filled in for you: "Hello World" becomes `hello-world`. |
| `t.text('body').nullable()` | Long text that may be empty. |
| `t.decimal('price', 12, 2).default(0)` | An exact number with 2 decimals, `0` when not given. |
| `t.enum('status', ['draft', 'published']).default('draft')` | One value from a fixed list. The form shows a select. |
| `t.foreignId('author_id').constrained('users')` | A link to a user. The form shows a user picker. |
| `t.timestamps()` | `created_at` and `updated_at`, kept up to date automatically. |
| `t.softDeletes()` | `deleted_at`: "delete" hides a post instead of erasing it, so it can be restored. |

`down()` says how to undo `up()`, so `node strut migrate:rollback` can take the change back.

Now open `app/models/post.ts` and list the columns people may fill in through forms and the API. Anything not on this list (like `id`, `created_at`, or a column you add later and forget) is refused, so nobody can set a field you didn't mean to expose:

```ts title="app/models/post.ts"
import { Model } from '@strutvane/framework'

export class Post extends Model('posts', { fillable: ['title', 'body', 'price', 'status', 'author_id'] }) {}
```

:::tip[Columns live only in migrations]
You never list columns on the command line or repeat them in the model. The migration is the single source of truth, and Strutvane works out everything else from it.
:::

## Step 3: Migrate

```bash
node strut migrate
```

This one command does five things, in order:

1. **Creates the `posts` table.** On PostgreSQL and SQLite, a failing migration leaves nothing half-done.
2. **Regenerates your TypeScript types.** `Post`, `NewPost`, `PostPatch` and `PostJson` now exist, with every column typed: `post.title` is a `string` and `post.status` is `'draft' | 'published'`.
3. **Seeds** the new `PostSeeder` once, so you get fake posts. It remembers that it ran, so it won't add more next time.
4. **Generates the API** for posts.
5. **Generates the UI** for posts and adds **Posts** to the sidebar.

**What you'll see** (something like this):

```text
  ✔ 2026_11_14_093000_create_posts_table   14ms
  ✔ Types and metadata regenerated (3 tables)
  ✔ Seeded PostSeeder
  ✔ API: /api/posts  ·  UI: Posts (sidebar)
```

:::caution[Coming in 0.2]
`node strut migrate` combines spike 10 (migrations, types, SQL) with spikes 11, 12 and 14. The prototypes prove each part; the single command arrives with 0.2.
:::

## Step 4: Look at what you built

Go back to the browser at [http://localhost:3000](http://localhost:3000). **Posts** is in the sidebar. You're signed in as the admin, who may do everything; other users see Posts only once a policy or their role allows it (see [Authorization](../authorization/)). Click it and try:

- **Search** for a word: it looks in the title and other text columns.
- **Sort** by clicking a column header.
- **Filter** by status.
- **Create** a post. Leave the title empty and you'll see a friendly validation message.
- **Open** a post: the address uses its slug, like `/posts/hello-world`.
- **Delete** a post, then show deleted posts and **restore** it.

The same data is available as JSON. While signed in:

```bash
curl "http://localhost:3000/api/posts?search=hello&sort=-created_at&page=1"
```

**What you'll see:**

```json
{
  "data": [
    { "id": 1, "title": "Hello World", "slug": "hello-world", "status": "draft", "price": "0.00", "author_id": 1,
      "created_at": "2026-11-14T09:31:02.000Z", "updated_at": "2026-11-14T09:31:02.000Z", "deleted_at": null }
  ],
  "meta": { "page": 1, "perPage": 25, "total": 1, "lastPage": 1, "from": 1, "to": 1 }
}
```

Errors come back in one standard shape (RFC 9457 "problem details") with a stable `code`, and validation errors list every problem field at once. See [Validation](../validation/).

## Step 5: Make it yours

The first `migrate` also wrote a small file you own, `resources/ui/posts.ui.ts`. It starts with `columns: auto()` and `form: auto()`, so the screens follow your migrations automatically: a column you add later shows up by itself. Change it whenever you want, for example to choose which columns the list shows. Strutvane never overwrites this file. See [Customising Screens](../crud-customising/).

:::caution[Coming in 0.2]
The exact options of `*.ui.ts` files are being finalised in the auto CRUD UI prototype (spike 14).
:::

## Step 6: Change your mind later

Need a subtitle? Never edit an old migration that has already run. Add a new one:

```bash
node strut make:migration add_subtitle_to_posts_table
```

The name means "change the `posts` table", so the new file starts with `schema.table('posts', …)`. Add the column:

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

```bash
node strut migrate
```

**What you'll see:** the new column in the detail page and the API. To let people *edit* it, add `'subtitle'` to `fillable` in `app/models/post.ts`; until then it's read-only, on purpose. If you had *removed* a column instead, every line of TypeScript that still used it would now be a compile error, so nothing breaks silently.

## Common mistakes

### "is not a valid migration name"

```text
  ✖ "CreatePosts" is not a valid migration name.
  → Use snake_case letters, digits and underscores, for example: node strut make:migration create_posts
```

**Why:** migration names are snake_case, so Strutvane can read what you mean (`create_posts_table` → create `posts`).
**Fix:**

```bash
node strut make:migration create_posts_table
```

### "is required but has no default"

```text
[INVALID_COLUMN] in 2026_11_14_101500_add_subtitle_to_posts_table.ts: The new column "posts.subtitle" is required but has no default, so existing rows would have no value. Hint: Make it .nullable(), or give it a .default(…).
```

**Why:** the table already has rows, and they need a value for the new column.
**Fix:** `t.string('subtitle').nullable()` or `t.string('subtitle').default('')`.

### Saving the form fails with MASS_ASSIGNMENT

```text
"subtitle" can't be mass-assigned on "posts". If users may set it, add it to `fillable` in Model('posts', { fillable: [...] }). If your own code sets it, assign it directly (model.subtitle = value) or use forceCreate().
```

**Why:** columns are read-only through forms and the API until you list them in `fillable`.
**Fix:** add the column to `fillable` in `app/models/post.ts`. See [Mass Assignment](../orm-mass-assignment/).

### Posts doesn't appear in the sidebar

**Why:** the sidebar only shows resources you may `viewAny`. If you're not the admin, the generated policy denies everything until you edit it.
**Fix:** sign in as the admin from the installer's summary, or open `app/policies/post.policy.ts` and allow `viewAny`. See [Authorization](../authorization/).

## What you learned

- `node strut make:migration create_x_table --seeder --factory` writes the migration, model, seeder and factory.
- Columns go in the migration, and only there; `fillable` in the model says which ones people may set.
- `node strut migrate` updates the database, the types, the API and the screens in one go.
- Files you own (`resources/ui/*.ui.ts`, models, migrations) are never overwritten.

## Next steps

- [Migrations](../migrations/): every column type and how to change tables safely.
- [Seeding](../seeding/): starting data and fake data.
- [ORM: Getting Started](../orm/): reading and writing posts in your own code.
- [Authorization](../authorization/): decide who may see and change posts.
