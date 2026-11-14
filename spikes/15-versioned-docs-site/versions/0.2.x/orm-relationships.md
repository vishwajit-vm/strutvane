---
title: "Relationships"
description: "Connect models (a post's author, a user's posts, a post's tags) and load them in a few queries instead of hundreds."
---

Tables point at each other: a post has an `author_id` that points at a user, and posts and tags are linked through a `post_tag` table. A **relationship** is a method on the model that describes one of those links, so you can write `post.author` instead of looking the user up by hand.

Strutvane loads relationships **eagerly**: you say up front which ones you need with `with()`, and it fetches them for the whole list in one extra query per relationship. That avoids the **N+1 problem**: one query for the list, then one more query for every row in it.

:::tip[Coming from Laravel?]
`belongsTo`, `hasMany`, `belongsToMany`, `with()`, `withCount()`, `whereHas()`, `load()`, `attach()`, `detach()` and `sync()` all work like Eloquent's. The difference: there's no lazy loading through a property. In PHP, `$post->author` quietly runs a query; in JavaScript a property can't wait for the database, so `post.author` is the relation *method* until you load it with `with('author')`. Strutvane also refuses loading one row at a time inside a loop (Laravel's `preventLazyLoading`, on by default outside production).
:::

## Defining relationships

Relationships are plain methods in the model class that return `this.belongsTo(...)`, `this.hasMany(...)` or `this.belongsToMany(...)`:

```ts title="app/models/post.ts"
import { Model } from '@strutvane/framework'
import { Tag } from './tag.ts'
import { User } from './user.ts'

export class Post extends Model('posts', { fillable: ['title', 'body', 'status'] }) {
  /** The user who wrote the post: posts.author_id → users.id */
  author() {
    return this.belongsTo(User, 'author_id')
  }

  /** Tags, through the post_tag table. */
  tags() {
    return this.belongsToMany(Tag, 'post_tag')
  }
}
```

```ts title="app/models/user.ts"
import { Model } from '@strutvane/framework'
import { Post } from './post.ts'

export class User extends Model('users', { fillable: ['name', 'email', 'password'], hidden: ['password'] }) {
  /** Posts this user wrote: users.id ← posts.author_id */
  posts() {
    return this.hasMany(Post, 'author_id')
  }
}
```

```ts title="app/models/tag.ts"
import { Model } from '@strutvane/framework'
import { Post } from './post.ts'

export class Tag extends Model('tags', { fillable: ['name'] }) {
  posts() {
    return this.belongsToMany(Post, 'post_tag')
  }
}
```

| Relationship | Means | Example |
|---|---|---|
| `belongsTo(User, 'author_id')` | this row has a column pointing at one other row | a post's author |
| `hasMany(Post, 'author_id')` | many other rows point at this one | a user's posts |
| `belongsToMany(Tag, 'post_tag')` | rows are linked through a third table (a **pivot** table) | a post's tags |

For `belongsToMany`, the pivot's key columns are guessed from the model names (`post_id`, `tag_id`). When they're named differently, pass them: `this.belongsToMany(Label, 'project_label', 'project_id', 'label_id')`.

## Loading relationships with `with()`

```ts
const posts = await Post.query().with('author').orderBy('id').get()
for (const post of posts) {
  console.log(post.title, 'by', post.author?.name)
}
```

**What you'll see:**

```text
Ada one by Ada
Ada two by Ada
Grace one by Grace
```

However many posts there are, that's **2 queries**: one for the posts, one for all their authors (`WHERE id IN (…)`). Loading the authors one by one would have been 1 + one per post. After `with('author')`, `post.author` is typed `User | null`, and `user.posts` would be `Post[]`.

### Several and nested

```ts
await Post.query().with('author', 'tags').get()     // two relationships
await User.query().with('posts.tags').get()          // users → their posts → each post's tags
```

`users → posts → tags` takes 3 queries, one per level, whatever the number of rows.

### Only some related rows

Pass an object whose value narrows the related query:

```ts
const users = await User.query()
  .with({ posts: (query) => query.where('status', 'published') })
  .orderBy('name')
  .get()
console.log(users.map((user) => user.posts.map((post) => post.title)))
// → [ [ 'Ada one' ], [ 'Grace one' ], [ 'Linus one' ] ]
```

## Counting without loading: `withCount()`

```ts
const users = await User.query().withCount('posts').orderBy('id').get()
console.log(users.map((user) => [user.name, user.posts_count]))
// → [ [ 'Ada', 2 ], [ 'Grace', 2 ], [ 'Linus', 2 ], [ 'Zed', 0 ] ]
```

The count is a `<relation>_count` property, computed in the **same** query. Soft-deleted posts don't count.

## Filtering by a relationship: `whereHas()`

"Users who have at least one draft post":

```ts
const users = await User.query()
  .whereHas('posts', (query) => query.where('status', 'draft'))
  .orderBy('name')
  .get()
// SQL: … WHERE EXISTS (SELECT … FROM posts WHERE posts.author_id = users.id AND posts.status = ?)
```

Without the second argument it means "has any": `User.query().whereHas('posts')`. Nothing is loaded; it only filters.

## Querying through a relationship

Calling the method (with brackets) gives you a query limited to related rows:

```ts
const ada = await User.query().where('name', 'Ada').firstOrFail()

await ada.posts().count()                 // → 2
await ada.posts().published().get()       // scopes work too (see Scopes)
const first = await ada.posts().firstOrFail()
const author = await first.author().first() // → the User row for Ada
```

### Creating related rows

`create()` on a `hasMany` sets the foreign key for you, so the owner never comes from user input:

```ts
const post = await ada.posts().create({ title: 'Ada three' })
console.log(post.author_id === ada.id) // → true
```

## Loading for a model you already have

For **one** model, `load()` fetches a relationship afterwards:

```ts
const post = await Post.query().where('title', 'Ada one').firstOrFail()
await post.load('author')
console.log(post.author?.name) // → Ada
```

For a **list**, use `loadMany()`: one query for the whole list.

```ts
import { loadMany } from '@strutvane/framework'

const posts = await Post.query().get()
await loadMany(posts, 'author')
```

## Linking rows in a pivot table

```ts
const post = await Post.findOrFail(1)

await post.tags().attach([news.id, tech.id])     // add links (safe to repeat)
await post.tags().detach([tech.id])              // remove some links; returns how many
await post.tags().detach()                       // remove all links
const result = await post.tags().sync([tech.id, ideas.id]) // make the links exactly this set
console.log(result)                              // → { attached: 1, detached: 1 }
```

`attach()` is safe to retry: linking twice doesn't create a duplicate.

## In JSON

Loaded relationships appear nested in `toJSON()`, with each model's hidden fields removed at every level:

```ts
const post = await Post.query().with('author').where('title', 'Ada one').firstOrFail()
console.log(JSON.stringify(post))
// → {"id":1,"title":"Ada one",…,"author":{"id":1,"name":"Ada","email":"ada@example.test",…}}  (no password)
```

:::caution[Coming in 0.2]
These are designed but not built yet: `hasOne`, `hasManyThrough`, polymorphic relationships (`morphTo`, `morphMany`, with a required morph map), extra pivot columns (`withPivot`), `withSum`/`withExists`, `ofMany`, and a development warning that spots the same query repeated more than 5 times in one request.
:::

## Common mistakes

### Loading a relationship inside a loop

```text
LazyLoadingError: You're loading "author" one "posts" row at a time (an N+1 query). Load it for the whole list instead: Model.query().with('author'), or await loadMany(models, 'author').
```

**Why:** calling `post.load('author')` for each post of a list sends one query per post. Strutvane stops this outside production.

**Fix:** load it for the whole list:

```ts
const posts = await Post.query().with('author').get()
// or, if you already have the list:
await loadMany(posts, 'author')
```

### `post.author.name` doesn't compile

**Why:** until you load it, `post.author` is the relation method, not the user.

**Fix:** add `with('author')` to the query, or `await post.load('author')` for a single post.

### "Post has no relation …"

```text
OrmUsageError: Post has no relation "autor". Did you mean "author"? Relations are methods on the model that return this.belongsTo(…), this.hasMany(…) or this.belongsToMany(…).
```

**Why:** the name in `with()` must match a relation method exactly. Strutvane never calls other methods (so `?include=delete` can't delete anything).

**Fix:** use the method's name, `with('author')`.

### Creating a related row before saving the parent

```text
OrmUsageError: Save the User first: it has no id yet, so the new row has nothing to point at.
```

**Fix:** `await user.save()` (or create the user with `User.create(...)`) before `user.posts().create(...)`.

### The pivot table uses different column names

```text
OrmUsageError: The pivot table "project_label" has no column "project_id". Pass the key names: belongsToMany(Label, 'project_label', 'parent_key', 'related_key').
```

**Fix:** pass both key names: `this.belongsToMany(Label, 'project_label', 'project_id', 'label_id')`.

## Next steps

- [Scopes](../orm-scopes/): reusable conditions, which also work through relationships.
- [Pagination](../orm-pagination/): page through posts with their authors.
- [Tenancy](../orm-tenancy/): how relationships stay inside one team's data.
