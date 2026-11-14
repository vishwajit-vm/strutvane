---
title: Seeding
description: Fill your database with starting data (roles, the first admin, lists of countries) and with realistic fake data while you build. Seeders run once in development, never twice, and never in production unless you ask.
---

**Seeding** means putting data into your database with code instead of by hand: the roles your app needs, the first admin user, a list of countries, or a few hundred fake customers so the screens look real while you build. A **seeder** is a small class with a `run()` method that creates those rows. Seeders live in `database/seeders/`.

:::tip[Coming from Laravel?]
Same idea, same names: `DatabaseSeeder` calls the others, `php artisan db:seed` becomes `node strut db:seed`, and `migrate:fresh --seed` works the same. The differences: in development, `node strut migrate` runs each **new** seeder once by itself and remembers it (so you never get duplicates), and in production nothing is seeded unless you pass `--seed --force`.
:::

## The smallest seeder

Ask for a seeder when you create a table:

```bash
node strut make:migration create_posts_table --seeder
```

**What you'll see:**

```text
  Created database/migrations/2026_11_14_093000_create_posts_table.ts
  Created app/models/post.ts
  Created database/seeders/post.seeder.ts

  Next: add your columns to the migration, then run `node strut migrate`.
  Then call PostSeeder from database/seeders/database.seeder.ts.
```

The new seeder is an empty class. Fill in `run()`:

```ts title="database/seeders/post.seeder.ts"
import { Post } from '../../app/models/post.ts'

/** Seeds the `posts` table. Call it from database/seeders/database.seeder.ts. */
export class PostSeeder {
  async run(): Promise<void> {
    await Post.forceCreate({ title: 'Hello World', body: 'The first post.', status: 'published', author_id: 1 })
    await Post.forceCreate({ title: 'A draft', status: 'draft', author_id: 1 })
  }
}
```

`forceCreate()` is for **trusted code** like seeders: it may set any real column, including ones that aren't in the model's `fillable` list (like `author_id`), but never system columns such as `id` or `created_at`. Forms and the API use `create()`, which only accepts `fillable` columns. See [Mass Assignment](../orm-mass-assignment/).

## Running seeders in order

`database/seeders/database.seeder.ts` is the main seeder. It calls the others, parents before children, so users exist before the posts that point at them:

```ts title="database/seeders/database.seeder.ts"
import { PostSeeder } from './post.seeder.ts'
import { UserSeeder } from './user.seeder.ts'

/** Runs every seeder, in order. */
export class DatabaseSeeder {
  async run(): Promise<void> {
    await new UserSeeder().run()
    await new PostSeeder().run()
  }
}
```

:::caution[Coming in 0.2]
`make:migration --seeder` will add the new seeder to `database.seeder.ts` for you, after the seeders of the tables it depends on. In the prototype it prints a reminder instead.
:::

## When seeders run

You rarely run seeders by hand, because `node strut migrate` does it for you:

| Situation | What happens |
|---|---|
| **Development**, a seeder that hasn't run yet | It runs **once**, as part of `node strut migrate`. |
| **Development**, a seeder that already ran | It's skipped. Strutvane remembers it in a `seeders` table, so you never get duplicates. |
| You want it again, on purpose | `node strut migrate --seed` or `node strut db:seed`. |
| **Production** | Nothing is seeded, unless you pass `--seed --force`. |

```bash
node strut migrate                 # migrate, then run seeders that haven't run yet
node strut db:seed                 # run the seeders again
node strut migrate:fresh --seed    # start over: drop everything, migrate, seed (development only)
```

**What you'll see** (something like this):

```text
  ✔ Seeded UserSeeder
  ✔ Seeded PostSeeder
```

:::caution[Coming in 0.2]
`migrate`, `db:seed`, `migrate:fresh` and the `seeders` tracking table are designed (v2 blueprint) and arrive with 0.2.
:::

## Three seeders, from small to advanced

**Small: fixed starting data.** A list your app needs to work, the same everywhere.

```ts title="database/seeders/category.seeder.ts"
import { Category } from '../../app/models/category.ts'

export class CategorySeeder {
  async run(): Promise<void> {
    for (const name of ['News', 'Guides', 'Releases']) {
      await Category.forceCreate({ name })
    }
  }
}
```

**Typical: data that depends on other rows.** Look the parent up instead of guessing its id.

```ts title="database/seeders/post.seeder.ts"
import { Post } from '../../app/models/post.ts'
import { User } from '../../app/models/user.ts'

export class PostSeeder {
  async run(): Promise<void> {
    const author = await User.query().where('email', 'admin@my-app.test').firstOrFail()
    await Post.forceCreate({ title: 'Welcome', body: 'Hello from the seeder.', status: 'published', author_id: author.id })
  }
}
```

**Advanced: safe to run twice.** Production seeders (run with `--force`) should never create duplicates. Check first:

```ts title="database/seeders/role.seeder.ts"
import { Role } from '../../app/models/role.ts'

export class RoleSeeder {
  async run(): Promise<void> {
    for (const name of ['admin', 'member', 'viewer']) {
      const exists = await Role.query().where('name', name).exists()
      if (!exists) await Role.forceCreate({ name })
    }
  }
}
```

**What you'll see:** running it a second time changes nothing.

## Fake data with factories

A **factory** is a recipe for one realistic fake record. Seeders and tests use it to make many records quickly.

```ts title="database/factories/post.factory.ts"
import { defineFactory } from '@strutvane/framework'
import { Post } from '../../app/models/post.ts'

export default defineFactory(Post, ({ faker }) => ({
  title: faker.lorem.sentence(),
  body: faker.lorem.paragraph(),
  status: 'draft',
}))
```

```ts
await Post.factory().count(10).create()                                // 10 saved posts
await Post.factory().count(3).state({ status: 'published' }).create()  // override some values
await Post.factory().count(5).for(user, 'author').create()             // 5 posts by one user
const draft = await Post.factory().make()                             // built, but not saved
```

:::caution[Coming in 0.2]
Factories are designed (ORM design, §7) but not built yet; the names above may still change. Until then, the generated `post.factory.ts` exports a plain function that returns one row's columns.
:::

## The first admin user

New apps come with a seeder that creates your roles and the first admin user. The installer runs it for you, and the admin's password is in `.env` as `SEED_ADMIN_PASSWORD`. With Docker or without, it's the same seeder; with Docker it runs inside the app container.

## Common mistakes

### MASS_ASSIGNMENT in a seeder

```text
"author_id" can't be mass-assigned on "posts". If users may set it, add it to `fillable` in Model('posts', { fillable: [...] }). If your own code sets it, assign it directly (model.author_id = value) or use forceCreate().
```

**Why:** `create()` only accepts `fillable` columns, even in a seeder.
**Fix:** seeders are trusted code, so use `forceCreate()`:

```ts
await Post.forceCreate({ title: 'Hello', author_id: author.id })
```

### "Can't tell which table … is about, so no seeder or factory was written"

```text
  ✖ Can't tell which table "backfill_slugs" is about, so no seeder or factory was written.
  → Name it create_<table>_table or add_<column>_to_<table>_table, or run make:migration again without --seeder/--factory.
```

**Why:** `--seeder` needs to know the table, and only names like `create_posts_table` say which.
**Fix:** use a `create_…_table` or `add_…_to_…_table` name, or drop `--seeder`.

### My seeder created the same rows twice

**Why:** you ran it on purpose (`db:seed` or `--seed`) and it doesn't check what's already there.
**Fix:** make it safe to run twice (see the advanced example), or start over on your machine with `node strut migrate:fresh --seed`.

### My new seeder never ran

**Why:** it isn't called from `database.seeder.ts`.
**Fix:** add `await new PostSeeder().run()` to `DatabaseSeeder.run()`, after the seeders it depends on.

## Next steps

- [Factories](../orm-factories/): more about factory states and relations.
- [Mass Assignment](../orm-mass-assignment/): `create()` versus `forceCreate()`.
- [Database Testing](../database-testing/): use seeders and factories to set up each test.
