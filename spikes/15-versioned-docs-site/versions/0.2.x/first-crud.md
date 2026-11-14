---
title: Your First CRUD in 5 Minutes
description: Build a complete "Posts" feature, with a database table, a secured JSON API, admin screens and a sidebar entry, using one migration and two commands.
---

In this guide you'll add **blog posts** to a new app. You'll write about ten lines of code, and at the end you'll have:

- a `posts` table in your database;
- a JSON API to list, search, create, update and delete posts;
- admin screens: a list with search, filters and pages, create and edit forms, and a detail page;
- **Posts** in the sidebar, for everyone who's allowed to see it;
- fake posts to play with.

**Before you start:** create an app and start it, as shown in [Installation](../installation/):

```bash
npm create strutvane@latest my-app
cd my-app
npm run dev
```

Leave `npm run dev` running, and open a **second terminal** in the `my-app` folder for the commands below.

## Step 1: Make the migration

A **migration** is a small file that describes a change to your database, like "create a posts table". Ask Strutvane to write one:

```bash
node strut make:migration create_posts_table --seeder
```

Strutvane reads the name `create_posts_table` the way Laravel does: it means "create a table called `posts`". Because it creates a table, it **also writes the model**, and `--seeder` adds a factory and a seeder too. You get these files:

| File | What it is |
|---|---|
| `database/migrations/2026_11_14_093000_create_posts_table.ts` | The migration. You'll add columns here. |
| `app/models/post.ts` | The `Post` model. |
| `database/factories/post-factory.ts` | How to make a fake post. |
| `database/seeders/post-seeder.ts` | Creates fake posts, registered in `database/seeders/database-seeder.ts` for you. |

(The date at the start of the migration's name will be today's; it keeps migrations in order.)

:::caution[Coming in 0.2]
`node strut` arrives with 0.2. The file names of the factory and seeder may still change slightly.
:::

## Step 2: Describe your columns

Open the new migration. It already has an `id` and timestamps. Add the columns a post needs:

```ts
// database/migrations/2026_11_14_093000_create_posts_table.ts
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

- `t.id()`: an auto-increment primary key called `id`.
- `t.string('title', 200)`: required text, at most 200 characters. (Columns are required unless you add `.nullable()`.)
- `t.slug('slug').from('title')`: a URL-friendly version of the title, filled in for you: "Hello World" becomes `hello-world`.
- `t.text('body').nullable()`: long text that may be empty.
- `t.decimal('price', 12, 2).default(0)`: an exact number with 2 decimals, `0` when not given.
- `t.enum('status', ['draft', 'published']).default('draft')`: one of a fixed list. The form shows a select.
- `t.foreignId('author_id').constrained('users')`: links each post to a user. The form shows a user picker.
- `t.timestamps()`: `created_at` and `updated_at`, kept up to date automatically.
- `t.softDeletes()`: "delete" hides a post instead of erasing it, so it can be restored.

`down()` says how to undo `up()`, so `node strut migrate:rollback` can take the change back.

Then open `app/models/post.ts` and list the columns people may fill in through forms and the API. Anything not on this list (like `id`, `created_at` or a column you add later and forget) is refused, so nobody can set a field you didn't mean to expose:

```ts
// app/models/post.ts
export class Post extends Model('posts', { fillable: ['title', 'body', 'price', 'status', 'author_id'] }) {}
```

:::tip[Columns live only in migrations]
You never list columns on the command line or in the model. The migration is the single source of truth, and Strutvane works out everything else from it.
:::

## Step 3: Migrate

```bash
node strut migrate
```

This one command does five things, in order:

1. **Creates the `posts` table.** If anything fails, nothing is left half-done (on databases that support it).
2. **Regenerates your TypeScript types.** `Post`, `NewPost`, `PostPatch` and `PostJson` now exist, with every column typed, so `post.title` is a `string` and `post.status` is `'draft' | 'published'`.
3. **Seeds** the new `PostSeeder` once, so you get some fake posts to play with. (It remembers that it ran, so it won't add more next time.)
4. **Generates the API** for posts.
5. **Generates the UI** for posts and adds **Posts** to the sidebar.

## Step 4: Look at what you built

Go back to the browser (your app is at [http://localhost:3000](http://localhost:3000)). **Posts** is in the sidebar. You're signed in as the admin, who may do everything; other users only see Posts once a policy or their role allows it (see [Authorization](../authorization/)). Click it and try:

- **Search** for a word: it looks in the title and other text columns.
- **Sort** by clicking a column header.
- **Filter** by status.
- **Create** a post: the form has a text field for the title, a select for the status and a user picker for the author. Leave the title empty and you'll see a friendly validation message.
- **Open** a post: the URL uses its slug, like `/posts/hello-world`.
- **Delete** a post, then show deleted posts and **restore** it.

The same data is available as JSON for other apps. While signed in, try:

```text
GET /api/posts?search=hello&sort=-created_at&page=1
GET /api/posts?filter[status]=published
```

Errors come back in one standard shape (RFC 9457 "problem details") with a stable `code`, and validation errors list every problem field at once.

## Step 5: Make it yours

The first `migrate` also wrote a small file you own:

```ts
// resources/ui/posts.ui.ts
// columns: auto() and form: auto() pick up every column, including ones you add later.
```

It starts with `columns: auto()` and `form: auto()`, so the screens follow your migrations automatically. Change it whenever you want, for example to choose which columns the list shows. Strutvane never overwrites this file. See [Customising Screens](../crud-customising/).

:::caution[Coming in 0.2]
The exact options of `*.ui.ts` files are being finalised in the auto CRUD UI prototype (spike 14).
:::

## Step 6: Change your mind later

Need a subtitle? Never edit an old migration that has already run. Add a new one:

```bash
node strut make:migration add_subtitle_to_posts_table
```

The name means "change the `posts` table", so the new file starts with `schema.table('posts', …)`. Add the column:

```ts
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

The new column appears in the list, the forms and the API. If you had *removed* a column instead, every line of TypeScript that still used it would now be a compile error, so nothing breaks silently.

## What you learned

- `node strut make:migration create_x_table --seeder` writes the migration, model, factory and seeder.
- Columns go in the migration, and only there.
- `node strut migrate` updates the database, the types, the API and the screens in one go.
- Files you own (`resources/ui/*.ui.ts`, models, migrations) are never overwritten.

## Next steps

- [Migrations](../migrations/): every column type and how to change tables safely.
- [Seeding](../seeding/): starting data and fake data.
- [Authorization](../authorization/): decide who may see and change posts.
