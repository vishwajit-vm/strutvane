---
title: "Soft Deletes"
description: "Hide deleted rows instead of erasing them, so they can be restored, and erase them for good when you really mean it."
---

A **soft delete** marks a row as deleted instead of removing it. The row stays in the table with a date in its `deleted_at` column, every normal query leaves it out, and you can bring it back with `restore()`. A **force delete** removes the row for good.

Use soft deletes for anything a user might delete by mistake (posts, customers, invoices), or anything you must keep for a while for legal or audit reasons.

:::tip[Coming from Laravel?]
Same idea as the `SoftDeletes` trait, but you don't add anything to the model: a table with `t.softDeletes()` in its migration *is* soft-deleting. `delete()`, `restore()`, `forceDelete()`, `trashed()`, `withTrashed()` and `onlyTrashed()` work as in Eloquent. Scheduled pruning is coming in 0.2.
:::

## Turning it on

Add `t.softDeletes()` to the table's migration. That creates a nullable `deleted_at` timestamp column:

```ts title="database/migrations/2026_11_14_093000_create_posts_table.ts"
import { migration } from '@strutvane/framework/schema'

export default migration({
  up(schema) {
    schema.create('posts', (t) => {
      t.id()
      t.string('title', 200)
      t.timestamps()
      t.softDeletes()
    })
  },
  down(schema) {
    schema.dropIfExists('posts')
  },
})
```

Run `node strut migrate`. The model needs no change.

For an existing table, add it in a new migration:

```ts title="database/migrations/2026_11_15_080000_add_soft_deletes_to_posts_table.ts"
import { migration } from '@strutvane/framework/schema'

export default migration({
  up(schema) {
    schema.table('posts', (t) => t.softDeletes())
  },
  down(schema) {
    schema.table('posts', (t) => t.dropSoftDeletes())
  },
})
```

## Deleting, checking and restoring

```ts
const post = await Post.findOrFail(1)

await post.delete()                  // sets deleted_at; the row stays
console.log(post.trashed())          // → true
console.log(await Post.find(1))      // → undefined: hidden from normal queries

await post.restore()                 // clears deleted_at
console.log(await Post.find(1))      // → the post again
```

## Seeing deleted rows

| Query | Returns |
|---|---|
| `Post.query()…` | only rows that aren't deleted (the default) |
| `Post.withTrashed()…` | deleted and not-deleted rows |
| `Post.onlyTrashed()…` | only deleted rows (a "bin" view) |

```ts
await Post.withTrashed().find(1)                     // finds it even when deleted
const bin = await Post.onlyTrashed().latest('deleted_at').get()
console.log(bin.map((post) => post.title))
// → [ 'Ephemeral' ]
```

They work on `Post.query()` too: `Post.query().withTrashed().where('title', 'Ephemeral').first()`.

## Deleting for good

```ts
const post = await Post.withTrashed().findOrFail(1)
await post.forceDelete()             // DELETE FROM posts WHERE id = ?
console.log(await Post.withTrashed().find(1)) // → undefined
```

:::danger[forceDelete() can't be undone]
A force-deleted row is gone, along with anything your migrations delete with it (`cascadeOnDelete()` foreign keys). Restore from a backup is the only way back.
:::

On a table **without** `deleted_at`, `delete()` already removes the row for good.

## Relationships respect soft deletes

Deleted rows are left out everywhere a query reaches them: lists, `find()`, counts, eager-loaded relationships and `whereHas()`.

```ts
const ada = await User.query().where('name', 'Ada').firstOrFail()
for (const post of await ada.posts().get()) await post.delete()

const users = await User.query().withCount('posts').orderBy('name').get()
console.log(users.map((user) => [user.name, user.posts_count]))
// → [ [ 'Ada', 0 ], [ 'Grace', 2 ], [ 'Linus', 2 ] ]

await User.query().whereHas('posts').count() // Ada no longer counts as "has posts"
```

## Soft-deleted rows keep their slug

A deleted post still owns its slug (the unique index covers it), so restoring it can never clash with a newer post. A new post with the same title gets a suffix, like `ephemeral-k3f9`. See [Slugs](../orm-slugs/).

## In the generated screens

The admin list hides deleted rows by default and offers a "Trashed" filter (without / with / only), a **Restore** action and, when allowed, **Delete permanently**. See [Resources](../crud/).

:::caution[Coming in 0.2]
Scheduled pruning (removing rows deleted more than N days ago) and the `restored` and `forceDeleted` model events are designed but not built yet.
:::

## Common mistakes

### Restoring a row on a table without soft deletes

```text
OrmUsageError: "tags" has no deleted_at column, so there is nothing to restore. Add t.softDeletes() in a migration to enable it.
```

**Fix:** add `t.softDeletes()` in a new migration and run `node strut migrate`. Rows deleted before that are already gone.

### "No row … may be soft-deleted" when you know the row exists

```text
ModelNotFoundError: No row in "posts" with key 1. It may not exist, may be soft-deleted, or may belong to another tenant.
```

**Why:** normal queries skip deleted rows, so `findOrFail(1)` can't see it.

**Fix:** to work with a deleted row (to restore it, for example), start with `withTrashed()`:

```ts
const post = await Post.withTrashed().findOrFail(1)
await post.restore()
```

### Deleting a model that was never saved

```text
OrmUsageError: Can't delete() a "posts" row that was never saved. Call save() first.
```

**Fix:** there's nothing to delete yet: drop the object, or `save()` it first.

### A unique value is "taken" by a deleted row

**Why:** deleted rows still count for unique indexes, so restoring them stays safe. A new row can't reuse a deleted row's unique value (an email, for example).

**Fix:** restore the old row instead of creating a new one, or force-delete it first if it should really go.

## Next steps

- [Scopes](../orm-scopes/): soft deletes are one of the conditions added automatically.
- [Slugs](../orm-slugs/): why deleted rows keep their slug.
- [Transactions](../orm-transactions/): delete several related rows all or nothing.
