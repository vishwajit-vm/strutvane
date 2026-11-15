---
title: "Slugs"
description: "Readable, unique URL names like hello-world, generated from a title when a row is created, safe with accents, races and teams."
---

A **slug** is the readable part of a URL: in `/posts/creme-brulee`, the slug is `creme-brulee`. It's made from another column (usually the title): lower case, accents removed, words joined with dashes.

In Strutvane you declare the slug once in the migration, and the ORM fills it in every time a row is created and keeps it unique.

:::tip[Coming from Laravel?]
This is the popular spatie/laravel-sluggable package, built in and declared in the migration: `t.slug('slug').from('title')`. Two differences: a taken slug gets a short **random** suffix (`launch-k3f9`), not `-2`, `-3` (a counter would reveal how many hidden rows share the title), and slugs don't change when the title changes, so shared links keep working.
:::

## Declaring a slug

```ts title="database/migrations/2026_11_14_093000_create_posts_table.ts"
import { migration } from '@strutvane/framework/schema'

export default migration({
  up(schema) {
    schema.create('posts', (t) => {
      t.id()
      t.string('title', 200)
      t.slug('slug').from('title')
      t.timestamps()
    })
  },
  down(schema) {
    schema.dropIfExists('posts')
  },
})
```

`t.slug('slug')` creates a unique text column called `slug` (255 characters unless you pass a length: `t.slug('slug', 120)`), and `.from('title')` says where its value comes from. Then:

1. Run `node strut migrate`. The slug column and its unique index (`posts_slug_unique`) are created.
2. Leave the model as it is: it needs nothing extra.
3. Create rows without a slug; the ORM fills it in.

## The smallest example

```ts
const post = await Post.create({ title: 'Crème Brûlée: 100% Better!' })
console.log(post.slug)
```

**What you'll see:**

```text
creme-brulee-100-better
```

## How a slug is made

1. Accents are removed (`é` → `e`) and everything is lower-cased.
2. Every run of characters that isn't a letter or digit becomes one `-`.
3. Dashes at the start and end are trimmed.
4. It's shortened to fit the column, leaving room for a suffix.
5. If nothing is left (a title made only of symbols, or in a script without Latin letters), the slug is `item`.

| Title | Slug |
|---|---|
| `Hello world` | `hello-world` |
| `Crème Brûlée — 100% better` | `creme-brulee-100-better` |
| `a_b` | `a-b` |
| `!!!` | `item` |

## When the slug is taken

```ts
const first = await Post.create({ title: 'Launch' })
const second = await Post.create({ title: 'Launch' })
console.log(first.slug, second.slug)
```

**What you'll see** (the suffix is random):

```text
launch launch-k3f9
```

The suffix is four characters from an alphabet without look-alikes (no `0`/`o`, no `1`/`l`), so it reads aloud and types without mix-ups.

Behind the scenes:

- **Characters like `%` and `_` in titles are plain characters**: looking for taken slugs never treats them as wildcards, so `a_b` and `axb` don't block each other.
- **Two requests at the same moment** may pick the same slug. The database's unique index refuses the second one, and Strutvane retries it with a fresh suffix. Inside a [transaction](../orm-transactions/), the retry uses a savepoint, so your surrounding transaction survives.
- **Soft-deleted rows keep their slug**, so restoring them never clashes.

## Unique per team

On a tenant table (one with a `tenant_id` column, see [Tenancy](../orm-tenancy/)), slugs are unique **within each tenant**. Another team's slugs are invisible and never change yours:

```ts
const a = await runWithTenant(teamA, () => Project.create({ name: 'Launch' }))
const b = await runWithTenant(teamB, () => Project.create({ name: 'Launch' }))
console.log(a.slug, b.slug)
// → launch launch   (each team gets its own "launch")
```

This needs the slug's unique index to include the tenant column (`UNIQUE (tenant_id, slug)`), so the database agrees that two teams may both have `launch`. The ORM looks for taken slugs only inside the active tenant, whatever the index says.

:::caution[Coming in 0.2]
Today `t.slug('slug')` always adds a unique index on the slug alone, so on a tenant table two teams can't share a slug yet. The `t.tenant()` helper (see [Tenancy](../orm-tenancy/)) is designed to make slug and other unique indexes tenant-prefixed automatically.
:::

## Choosing a slug yourself

If you set a slug, it's kept as you wrote it; only empty slugs are generated:

```ts
const post = Post.make()
post.fill({ title: 'Our 2027 roadmap' })
post.slug = 'roadmap'     // your own code: kept as is
await post.save()
console.log(post.slug)    // → 'roadmap'
```

To let users type a slug in a form, list `slug` in `fillable` and validate its format in your form request (lower-case letters, digits and single dashes).

## Slugs stay stable

The slug is set when the row is created and doesn't follow later title changes:

```ts
post.title = 'Our 2028 roadmap'
await post.save()
console.log(post.slug) // → still 'roadmap'
```

Shared links, bookmarks and search results keep working. Change the slug on purpose by assigning a new value.

## Finding a row by its slug

```ts
const post = await Post.query().where('slug', 'creme-brulee-100-better').firstOrFail()
```

In routes, `{post:slug}` does this for you and answers 404 when nothing matches (see [Routing](../routing/)).

:::caution[Coming in 0.2]
Designed but not built yet: refusing reserved words (`new`, `edit`, `create`…) and id-like values as slugs, slugs from several columns (`from(['first_name', 'last_name'])`), opting in to regenerate on update, and redirects from old slugs.
:::

## Common mistakes

### `.from()` on a column that isn't a slug

```ts
t.string('title').from('name') // compile error: only slugs have .from()
```

**Fix:** declare the column with `t.slug('slug').from('title')`.

### Expecting `-2`, `-3` suffixes

**Why:** counters reveal hidden rows (a `-4` tells a user that three other rows with this title exist, even ones they may not see). Strutvane uses a random suffix instead.

**Fix:** don't parse or predict suffixes. If you need a stable, readable name, set the slug yourself.

### The slug didn't change when I edited the title

**Why:** slugs are stable on purpose, so links keep working.

**Fix:** assign the new slug yourself (`post.slug = 'new-name'`), and expect old links to break.

### A user-chosen slug collides

```text
409 Conflict
```

**Why:** a slug you set yourself is kept as is, so if it's already taken the unique index refuses it, and the generated API answers 409.

**Fix:** check first with `Post.query().where('slug', value).exists()`, or let Strutvane generate the slug.

## Next steps

- [Search, Filters & Sorting](../crud-search/): slugs in the generated API.
- [Soft Deletes](../orm-soft-deletes/): why deleted rows keep their slug.
- [Tenancy](../orm-tenancy/): slugs unique per team.
