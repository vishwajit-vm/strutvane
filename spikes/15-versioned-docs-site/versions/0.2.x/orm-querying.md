---
title: "Querying"
description: "Find exactly the rows you need with typed conditions, grouping, ordering, limits, request-driven search and safe raw SQL."
---

A **query** is a question you ask the database: "which posts are published, newest first?". In Strutvane you build it with the **query builder**: a chain of methods that starts with `Post.query()` (or a shortcut like `Post.where(...)`) and ends with a method that runs it, such as `get()` or `first()`.

Every column name and value is checked by TypeScript against your migrations, and every value is sent to the database separately from the SQL (a **bound parameter**), so user input can never become SQL.

:::tip[Coming from Laravel?]
`Post::where('status', 'published')->orderBy('created_at', 'desc')->get()` becomes `Post.where('status', 'published').orderBy('created_at', 'desc').get()`, with `await`. Columns keep their migration names. Two deliberate differences: `!=` matches rows where the column is `NULL` (like JavaScript's `!==`), and raw SQL is only accepted through the `` sql`…` `` tag, never as a string.
:::

## The smallest query

```ts title="app/http/controllers/post.controller.ts (excerpt)"
import { Post } from '../../models/post.ts'

const posts = await Post.where('status', 'published').orderBy('title').get()
console.log(posts.map((post) => post.title))
```

**What you'll see:**

```text
[ 'Alpha', 'Gamma' ]
```

## Running a query: the "terminal" methods

Nothing is sent to the database until you call one of these:

| Method | Returns | Use it when |
|---|---|---|
| `get()` | `Post[]` (may be empty) | you want a list |
| `first()` | `Post` or `undefined` | you want one row, if any |
| `firstOrFail()` | `Post`, or throws `ModelNotFoundError` | the row must exist (becomes a 404) |
| `find(key)` / `findOrFail(key)` | one row by its key | you know the id |
| `count()` | `number` | you only need how many |
| `exists()` | `boolean` | you only need "any at all?" |
| `paginate()` / `cursorPaginate()` | a page | see [Pagination](../orm-pagination/) |

## Conditions

### Equal to a value

```ts
await Post.query().where('status', 'published').get()
```

The value is typed by the column: `where('status', 'archived')` doesn't compile when the column only allows `draft` and `published`.

### Comparisons

Pass an operator in the middle. The allowed operators are `=`, `!=`, `<>`, `<`, `<=`, `>` and `>=`:

```ts
await Post.query().where('view_count', '>=', 10).where('id', '>', 100).get()
```

Several `where()` calls are joined with AND.

### OR

```ts
const rows = await Post.query().where('title', 'Alpha').orWhere('title', 'Beta').orderBy('title', 'desc').get()
// → titles: [ 'Beta', 'Alpha' ]
```

### Grouping with parentheses

Pass a function to `where()` to group conditions, like brackets in maths:

```ts
const rows = await Post.query()
  .where('status', 'published')
  .where((query) => query.where('title', 'Alpha').orWhere('title', 'Beta'))
  .get()
// SQL: WHERE status = ? AND (title = ? OR title = ?)
// → titles: [ 'Alpha' ]
```

### In a list, or not

```ts
await Post.query().whereIn('title', ['Gamma', 'Alpha', 'Nope']).get() // → Alpha, Gamma
await Post.query().whereIn('title', []).get()                         // → [] (an empty list matches nothing)
await Post.query().whereNotIn('status', ['draft']).get()
```

### Empty values (NULL)

```ts
await Post.query().whereNull('body').count()     // posts with no body
await Post.query().whereNotNull('body').get()    // posts with a body
await Post.query().where('body', null).count()   // same as whereNull
```

### `!=` includes empty values

In plain SQL, `body <> 'x'` silently skips rows where `body` is `NULL`. Strutvane's `!=` and `whereNotIn` include them, the way `!==` works in JavaScript:

```ts
// body is NULL for Beta, Gamma and Delta, and 'has a body' for Alpha.
await Post.query().where('body', '!=', 'has a body').count() // → 3, not 0
await Post.query().where('body', '!=', null).count()         // → 1 (only rows with a body)
```

## Ordering and limiting

```ts
await Post.query().orderBy('title').get()                 // A → Z ('asc' is the default)
await Post.query().orderBy('created_at', 'desc').get()    // newest first
await Post.query().latest().get()                         // the same: newest by created_at
await Post.query().orderBy('title').limit(2).offset(1).get()
// → [ 'Beta', 'Delta 100%' ] (skip 1, take 2)
```

`latest()` sorts by `created_at`, newest first. On a table without timestamps, pass a column: `latest('id')`.

## Shortcuts on the model

These start a query for you, so you can skip `.query()`:

```ts
await Post.where('status', 'draft').get()
await Post.with('author').get()          // see Relationships
await Post.withTrashed().find(1)         // see Soft Deletes
```

## Branching a query with `clone()`

The builder changes in place (like Laravel's). To build two queries from a common start, `clone()` it:

```ts
const base = Post.query().where('status', 'published')
const total = await base.clone().count()
const newest = await base.clone().latest().limit(5).get()
```

## Search, filter and sort from a request

Your own conditions use typed column names. When names come from a **request** (a URL like `?search=hello&sort=-title`), they're just strings, so the builder has three methods that check every name at runtime against the table and refuse anything unknown:

```ts
await Post.query().search('100%', ['title', 'body']).get()   // → [ 'Delta 100%' ]
await Post.query().filter('status', 'in', ['draft']).sort('-title').get()
await Post.query().filter('title', 'startsWith', 'ga').get() // → [ 'Gamma' ]
await Post.query().filter('body', 'null', true).count()      // posts with no body
```

- **`search(term, columns)`**: case-insensitive, and `%` and `_` are ordinary characters, not wildcards.
- **`filter(column, operator, value)`**: operators are `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `contains`, `startsWith` and `null`.
- **`sort('-created_at,title')`**: a minus sign means descending.

The generated CRUD API is built on these (see [Search, Filters & Sorting](../crud-search/)). Hostile input stays data:

```ts
await Post.query().where('title', "x' OR '1'='1").count() // → 0, it's just a strange title
Post.query().sort('title; DROP TABLE posts')              // throws OrmUsageError: no such column
```

## Raw SQL, safely

When you need SQL the builder can't express, use `whereRaw` with the `sql` tag. Values inside `${…}` are always bound, and `sql.id()` quotes a column name for the current database:

```ts
import { sql } from '@strutvane/framework'

const minimum = 5
const rows = await Post.query()
  .whereRaw(sql`length(${sql.id('title')}) >= ${minimum}`)
  .orderBy('title')
  .get()
// → [ 'Alpha', 'Delta 100%', 'Gamma' ]
```

## Seeing the SQL

`toSql()` shows the statement and its values without running it:

```ts
const { sql: text, params } = Post.query().where('status', 'published').orderBy('title').toSql()
console.log(text)
console.log(params)
```

**What you'll see** (something like this; quoting depends on your database, MySQL uses backticks):

```text
SELECT `posts`.* FROM `posts` WHERE `posts`.`status` = ? AND `posts`.`deleted_at` IS NULL ORDER BY `posts`.`title` ASC
[ 'published' ]
```

Notice the `deleted_at IS NULL`: soft-deleted rows are left out automatically.

:::caution[Coming in 0.2]
These are designed but not built yet: `join`/`leftJoin`, `select`, `groupBy`/`having`, `distinct`, `when(condition, fn)`, `lockForUpdate`, `increment`/`decrement`, bulk `update`/`delete`, aggregates (`sum`, `avg`, `min`, `max`), `pluck`/`value`, and streaming large tables with `cursor()`/`chunkById()`.
:::

## Common mistakes

### "is not a supported operator"

```text
OrmUsageError: "LIKE" is not a supported operator. Use one of: = != <> < <= > >=. For text search use whereRaw with the sql tag.
```

**Why:** `where()` only accepts comparison operators, so a typo can never turn into SQL.

**Fix:** for "contains" searches, use `search()` or `filter(column, 'contains', text)`:

```ts
await Post.query().filter('title', 'contains', 'hello').get()
```

### "whereRaw() needs a sql fragment, not a string"

```text
OrmUsageError: whereRaw() needs a sql`…` fragment, not a string. Strings would let user input become SQL; put values in ${…} inside the sql tag.
```

**Why:** a plain string could contain user input, which is how SQL injection happens.

**Fix:** write `` whereRaw(sql`length(${sql.id('title')}) > ${10}`) `` instead of `whereRaw('length(title) > 10')`.

### A typo in a column name from a request

```text
OrmUsageError: "posts" has no column "titel". Did you mean "title"? Columns come from your migrations.
```

**Why:** `sort()`, `filter()` and `search()` check names at runtime. (In your own code, a typo in `where()` is already a compile error.)

**Fix:** use the real column name; check them with `node strut model:show Post`.

### Sort direction from user input

```text
OrmUsageError: Sort direction must be "asc" or "desc", not "asc; DROP TABLE posts".
```

**Fix:** map user input to `'asc'` or `'desc'` yourself, or use `sort('-title')`, which parses the minus sign safely.

## Next steps

- [Relationships](../orm-relationships/): load authors and tags with your posts.
- [Scopes](../orm-scopes/): give common conditions a name.
- [Pagination](../orm-pagination/): split results into pages.
