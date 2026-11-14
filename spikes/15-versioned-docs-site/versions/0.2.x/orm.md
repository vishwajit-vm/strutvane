---
title: "ORM: Getting Started"
description: "Read, create, update and delete database rows with model classes whose columns come straight from your migrations."
---

The **ORM** (object-relational mapper) is the part of Strutvane that turns database rows into TypeScript objects and back. Each table gets a **model**: a small class in `app/models` that knows how to find, create, update and delete rows of that table. You never write SQL for everyday work, and you never repeat your columns: the model reads them from your [migrations](../migrations/).

Use the ORM whenever your own code (a controller, a seeder, a job) needs to read or change data. The generated CRUD API uses exactly the same models.

:::tip[Coming from Laravel?]
This is Eloquent. `class Post extends Model` becomes `class Post extends Model('posts', { fillable: [...] })`, and `$fillable`, `$hidden` and `$casts` move into that options object (like Laravel 13's `#[Fillable]` and `#[Hidden]` attributes). Two differences: columns keep their migration names (`created_at`), and there's no implicit lazy loading, because JavaScript can't wait inside a property read. You load relations with `with()` instead.
:::

## Your first model

Say a migration created a `posts` table with `title`, `slug`, `body`, `status`, `published_on`, `meta`, `author_id`, timestamps and soft deletes (see [Your First CRUD](../first-crud/)). This is a complete model for it:

```ts title="app/models/post.ts"
import { Model } from '@strutvane/framework'

export class Post extends Model('posts', {
  fillable: ['title', 'body', 'status'],
}) {}
```

That's all. The name `'posts'` tells Strutvane which table this is, and from the generated types it knows every column, its type and whether it can be empty. `fillable` lists the columns people may set when creating or filling a post (see [Mass Assignment](../orm-mass-assignment/)).

Now use it:

```ts title="app/http/controllers/post.controller.ts (excerpt)"
import { Post } from '../../models/post.ts'

const post = await Post.create({ title: 'Hello world', status: 'draft' })

console.log(post.id)          // a number: the new row's key
console.log(post.slug)        // filled in from the title
console.log(post.created_at)  // a Date, set for you
```

**What you'll see:**

```text
1
hello-world
2026-11-14T09:30:00.000Z
```

The row is in the database, the slug was generated, and both timestamps were set.

:::note[Why a function call, `Model('posts', …)`?]
TypeScript can only give `post.title` the type `string` if the class is created by a function that knows the table. That's also why options that change types (`fillable`, `hidden`, `casts`) go in the call, and behaviour (relations, scopes, getters) goes in the class body. No decorators are needed.
:::

## Reading rows

| You want | Write | You get |
|---|---|---|
| Every row | `await Post.all()` | `Post[]` |
| One row by its key | `await Post.find(1)` | `Post` or `undefined` |
| One row, or a 404 | `await Post.findOrFail(1)` | `Post`, or throws `ModelNotFoundError` |
| Rows that match | `await Post.where('status', 'published').get()` | `Post[]` |
| The first match | `await Post.query().where('status', 'draft').first()` | `Post` or `undefined` |
| How many | `await Post.query().count()` | `number` |
| Whether any exist | `await Post.query().where('status', 'draft').exists()` | `boolean` |

```ts title="app/http/controllers/post.controller.ts (excerpt)"
const post = await Post.findOrFail(1)
console.log(post.title, post.status)
// → Hello world draft

const drafts = await Post.where('status', 'draft').orderBy('created_at', 'desc').get()
console.log(drafts.map((p) => p.title))
// → [ 'Hello world' ]
```

Every column is a typed property: `post.status` is `'draft' | 'published'`, so `if (post.status === 'archived')` doesn't compile. All the ways to filter, order and limit are in [Querying](../orm-querying/).

## Creating rows

There are two ways, and both run the same checks.

**In one step**, with `create()`:

```ts
const post = await Post.create({ title: 'Second post', body: 'More words.', status: 'draft' })
```

**In steps**, with `make()`, then `fill()` or plain assignment, then `save()`:

```ts
const post = Post.make()          // a new, unsaved post
post.fill({ title: 'Third post' }) // only fillable columns
post.body = 'Set directly.'        // your own code may set any column directly
await post.save()                  // INSERT
console.log(post.isPersisted())    // → true
```

When a row is inserted, Strutvane:

- generates the key (an auto-increment number for `t.id()`, or a time-ordered UUIDv7 for `t.uuid('id')`);
- sets `created_at` and `updated_at` when the table has them;
- fills slug columns from their source (see [Slugs](../orm-slugs/));
- reads back any database defaults, so `post.status` is `'draft'` even when you didn't send it.

:::note[MySQL, PostgreSQL and SQLite]
PostgreSQL and SQLite return the new row in the same statement (`RETURNING`). MySQL 8.4 doesn't support that, so on MySQL the ORM reads the row again by its key right after the insert: one extra, fast query per write. You don't need to do anything about it.
:::

## Updating rows

Change properties, then `save()`. Only the columns you changed are written, plus `updated_at`:

```ts
const post = await Post.findOrFail(1)
post.title = 'Hello again'

console.log(post.getDirty())  // → { title: 'Hello again' }
console.log(post.isDirty())   // → true

await post.save()             // UPDATE posts SET title = ?, updated_at = ? WHERE id = ?
console.log(post.isDirty())   // → false
```

`fill()` works for updates too, with the same `fillable` rules as `create()`:

```ts
post.fill({ status: 'published' })
await post.save()
```

To throw away changes and reload the row from the database, use `await post.refresh()`.

## Deleting rows

```ts
const post = await Post.findOrFail(1)
await post.delete()
```

If the table has a `deleted_at` column (`t.softDeletes()` in the migration), `delete()` only hides the row so it can be restored; `forceDelete()` removes it for good. See [Soft Deletes](../orm-soft-deletes/).

## Turning models into JSON

`toJSON()` gives you a plain object, ready to send. `JSON.stringify(post)` and `ctx.json(post)` call it for you.

```ts
const post = await Post.findOrFail(1)
console.log(post.toJSON())
```

**What you'll see:**

```text
{
  id: 1,
  title: 'Hello again',
  slug: 'hello-world',
  body: null,
  status: 'published',
  published_on: null,
  meta: null,
  author_id: 3,
  created_at: '2026-11-14T09:30:00.000Z',
  updated_at: '2026-11-14T09:41:12.000Z',
  deleted_at: null
}
```

Dates become ISO strings. Columns you list in `hidden` never appear, and their keys are missing from the TypeScript type too:

```ts title="app/models/user.ts"
import { Model } from '@strutvane/framework'

export class User extends Model('users', {
  fillable: ['name', 'email', 'password'],
  hidden: ['password'],
}) {}
```

```ts
const json = (await User.findOrFail(1)).toJSON()
json.password // compile error: Property 'password' does not exist
```

## Adding behaviour to a model

The class body is yours. Add methods, getters (computed values), [relations](../orm-relationships/) and [scopes](../orm-scopes/):

```ts title="app/models/post.ts"
import { Model, type Scopes } from '@strutvane/framework'
import { User } from './user.ts'

export class Post extends Model('posts', {
  fillable: ['title', 'body', 'status', 'published_on'],
}) {
  static readonly scopes = {
    published: (query) => query.where('status', 'published'),
  } satisfies Scopes<'posts'>

  author() {
    return this.belongsTo(User, 'author_id')
  }

  get isPublished(): boolean {
    return this.status === 'published'
  }
}
```

```ts
const posts = await Post.query().published().with('author').get()
console.log(posts[0]?.author?.name, posts[0]?.isPublished)
// → Ada true
```

## Which database?

The ORM behaves the same on **MySQL 8.4+** (the default), **PostgreSQL** and **SQLite**: the spike behind it runs every test on all three. Where the engines differ, the ORM smooths it over:

- **Booleans:** MySQL and SQLite store `0`/`1`; you always get `true`/`false`.
- **Decimals:** SQLite stores them as floats; you always get an exact string like `'10.50'`.
- **Text length:** SQLite ignores `VARCHAR(200)`; the ORM enforces the length everywhere.
- **Dates:** stored and read in UTC on every engine.

## Common mistakes

### "No row in posts with key 99"

```text
ModelNotFoundError: No row in "posts" with key 99. It may not exist, may be soft-deleted, or may belong to another tenant.
```

**Why:** `findOrFail()` (and `firstOrFail()`) throw when nothing matches. In a controller this becomes a 404 response, which is usually what you want.

**Fix:** when "not found" is a normal case, use `find()` and check for `undefined`:

```ts
const post = await Post.find(99)
if (post === undefined) {
  // show a friendly message instead
}
```

### "Did you mean …?" when creating a row

```text
MassAssignmentError: "posts" has no column "titel". Did you mean "title"? Columns come from your migrations: add one with a new migration, then run `node strut migrate`.
```

**Why:** the column doesn't exist (here, a typo). Strutvane refuses unknown fields instead of silently dropping them.

**Fix:** use the real column name. If the column is new, add it in a migration and run `node strut migrate`, which regenerates the types.

### Deleting a model you never saved

```text
OrmUsageError: Can't delete() a "posts" row that was never saved. Call save() first.
```

**Why:** `Post.make()` builds an object that isn't in the database yet.

**Fix:** call `await post.save()` first, or use `Post.create(...)`, which saves in one step.

### Changing a row's key

```text
OrmUsageError: The primary key of a saved "posts" row can't change. Create a new row instead.
```

**Why:** the key is how every other table points at this row. Changing it would break those links.

**Fix:** create a new row with `Post.create(...)` and delete the old one if you need to.

## Next steps

- [Querying](../orm-querying/): every way to filter, order and limit.
- [Relationships](../orm-relationships/): authors, posts and tags, without N+1 queries.
- [Mass Assignment](../orm-mass-assignment/): what `fillable` protects you from.
