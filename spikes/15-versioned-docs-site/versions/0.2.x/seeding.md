---
title: Seeding
description: Fill your database with starting data (roles, the first admin, lists of countries) and with realistic fake data while you build. Create seeders, run them in order, run one on its own, and know exactly when Strutvane runs them for you.
---

**Seeding** means putting data into your database with code instead of by hand: the roles your app needs, the first admin user, a list of countries, or a few hundred fake customers so the screens look real while you build. A **seeder** is a small class with a `run()` method that creates those rows. Seeders live in `database/seeders/`, one file per table, named like `post.seeder.ts`.

:::tip[Coming from Laravel?]
Same idea, same names: `DatabaseSeeder` calls the others, `php artisan db:seed` becomes `node strut db:seed`, `--class` runs one seeder, and `migrate:fresh --seed` works the same. The differences:

- in development, `node strut migrate` runs each **new** seeder once by itself and remembers it, so you never get duplicates;
- `make:migration … --seeder` registers the new seeder in `database.seeder.ts` for you, after the seeders of the tables it points at;
- in production nothing is seeded unless you pass `--seed --force`, and the admin seeder refuses to run there at all.
:::

## The commands at a glance

| You want to | Run | Status |
|---|---|---|
| Create a table with a seeder and a factory | `node strut make:migration create_posts_table --seeder` | Prototype |
| Create a seeder for an existing table | `node strut make:seeder PostSeeder` | Coming in 0.2 |
| Create a model with a seeder | `node strut make:model Post -s` | Coming in 0.2 |
| Run every seeder (through `database.seeder.ts`) | `node strut db:seed` | Prototype |
| Run one seeder | `node strut db:seed --class=PostSeeder` | Coming in 0.2 |
| Migrate, then run the seeders | `node strut migrate --seed` | Prototype |
| Start over: drop everything, migrate, seed | `node strut migrate:fresh --seed` | Coming in 0.2 |
| Seed in production, on purpose | `node strut migrate --seed --force` | Coming in 0.2 |

## The smallest seeder, step by step

1. **Ask for a seeder when you create the table:**

   ```bash
   node strut make:migration create_posts_table --seeder
   ```

   **What you'll see** (something like this; the exact wording isn't final):

   ```text
     Created database/migrations/2026_11_15_093000_create_posts_table.ts
     Created app/models/post.ts
     Created database/seeders/post.seeder.ts
     Created database/factories/post.factory.ts

     Next: add your columns to the migration, then run `node strut migrate`.
   ```

   `--seeder` also creates the [factory](../orm-factories/), because seeders usually use one, and adds the seeder to `database/seeders/database.seeder.ts`.

2. **Open the seeder.** It's an empty class:

   ```ts title="database/seeders/post.seeder.ts"
   import { Post } from '../../app/models/post.ts'

   /** Seeds the `posts` table. */
   export class PostSeeder {
     async run(): Promise<void> {
       // Create a few rows, for example:
       // await Post.create({ … })
       void Post
     }
   }
   ```

3. **Fill in `run()`:**

   ```ts title="database/seeders/post.seeder.ts"
   import { Post } from '../../app/models/post.ts'
   import { User } from '../../app/models/user.ts'

   /** Seeds the `posts` table. */
   export class PostSeeder {
     async run(): Promise<void> {
       const author = await User.query().orderBy('id').firstOrFail()
       await Post.forceCreate({ title: 'Hello World', body: 'The first post.', status: 'published', author_id: author.id })
       await Post.forceCreate({ title: 'A draft', status: 'draft', author_id: author.id })
     }
   }
   ```

4. **Run your migrations.** In development, `migrate` runs new seeders for you:

   ```bash
   node strut migrate
   ```

   **What you'll see** (something like this):

   ```text
     ran  2026_11_15_093000_create_posts_table
   Migrations run (1 new, 5 total)
     ✔ Seeded PostSeeder
   Database seeded
   ```

`forceCreate()` is for **trusted code** like seeders: it may set any real column, including ones that aren't in the model's `fillable` list (like `author_id`), but never Strutvane's own columns such as `id` or `created_at`. Forms and the API use `create()`, which only accepts `fillable` columns. See [Mass Assignment](../orm-mass-assignment/).

:::caution[Coming in 0.2]
In the prototype, `--seeder` writes only the seeder (add `--factory` for the factory) and prints `Then call PostSeeder from database/seeders/database.seeder.ts.` instead of registering it. Automatic registration, `migrate` running new seeders, and the `✔ Seeded …` lines arrive with 0.2.
:::

## Creating a seeder for an existing table

For a table that already exists, or a seeder that isn't about one table (for example "demo data"), use `make:seeder`:

```bash
node strut make:seeder PostSeeder     # database/seeders/post.seeder.ts
node strut make:seeder DemoSeeder     # database/seeders/demo.seeder.ts
```

The class name ends in `Seeder`; the file name is the rest, in lower case with dashes, plus `.seeder.ts` (`BlogPostSeeder` → `blog-post.seeder.ts`). The new seeder is registered in `database.seeder.ts` like one from `make:migration --seeder`.

:::caution[Coming in 0.2]
`make:seeder` is designed (blueprint §2.2) but not built yet. Until then, create the file by hand with the class shape above and add it to `database.seeder.ts`.
:::

## Running seeders in order

`database/seeders/database.seeder.ts` is the **main seeder**: the one `db:seed` runs. It calls the others, parents before children, so users exist before the posts that point at them:

```ts title="database/seeders/database.seeder.ts"
import { CategorySeeder } from './category.seeder.ts'
import { PostSeeder } from './post.seeder.ts'
import { RoleSeeder } from './role.seeder.ts'
import { UserSeeder } from './user.seeder.ts'

/** Runs every seeder, in order: parents before children. */
export class DatabaseSeeder {
  async run(): Promise<void> {
    await new RoleSeeder().run()
    await new UserSeeder().run()
    await new CategorySeeder().run()
    await new PostSeeder().run()
  }
}
```

When Strutvane adds a seeder for you, it puts it **after** the seeders of every table its table points at (from the foreign keys in your migrations). `PostSeeder` lands after `UserSeeder` because `posts.author_id` points at `users`. You can always move lines by hand; Strutvane only adds, it never reorders.

:::note[Designed: seeders that say what they need]
The ORM design also sketches a shorter seeder shape that states its dependencies itself: `export default defineSeeder({ after: ['users'], async run() { … } })`. It isn't decided for 0.2; the class shape above is what's generated.
:::

## When seeders run

You rarely run seeders by hand, because `node strut migrate` does it for you:

| Situation | What happens |
|---|---|
| **Development**, a seeder that hasn't run yet and isn't empty | It runs **once**, as part of `node strut migrate`. |
| **Development**, a seeder that already ran | It's skipped. Strutvane remembers it in a `seeders` table, so you never get duplicates. |
| You want it again, on purpose | `node strut migrate --seed` or `node strut db:seed`. |
| **Production** (`APP_ENV=production`) | Nothing is seeded, unless you pass `--seed --force`. |
| `APP_ENV` is `production` or `staging` and the seeder creates accounts | Refused, always (see [the first admin user](#the-first-admin-user)). |

The `seeders` table is internal, like `migrations`: it never gets an API or a screen.

```bash
node strut migrate                 # migrate, then run seeders that haven't run yet (development)
node strut db:seed                 # run database.seeder.ts again
node strut migrate --seed          # migrate, then run the seeders again
node strut migrate:fresh --seed    # start over: drop everything, migrate, seed (development only)
```

**What you'll see** for `db:seed` (something like this):

```text
  ✔ Seeded RoleSeeder
  ✔ Seeded UserSeeder
  ✔ Seeded PostSeeder
Database seeded
```

:::caution[Coming in 0.2]
`migrate --seed` and `db:seed` run in the installer prototype (spike 13, on real MySQL 8.4, PostgreSQL and SQLite); it prints `Database seeded` at the end. Running new seeders automatically during `migrate`, the `seeders` tracking table and `--force` are designed (v2 blueprint §2.4) and arrive with 0.2.
:::

### Running one seeder: `--class`

While you work on one seeder, run only that one:

```bash
node strut db:seed --class=PostSeeder
```

It runs `PostSeeder` and nothing else, even if it already ran. The seeders it depends on aren't run for you, so their rows must already exist.

:::caution[Coming in 0.2]
The blueprint names `db:seed` but not its options yet. `--class`, Laravel's name, is the expected shape; the final option name may differ.
:::

### With Docker or without

The commands are the same. With Docker, `node strut db:seed` runs **inside the app container**, against the database container; you type it on your computer as usual. Without Docker, it runs on your computer against the database in `.env`. On Windows, macOS and Linux the commands are identical.

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

**What you'll see:** three rows in `categories`, with ids, slugs (if the table has one) and timestamps filled in.

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

**What you'll see:** one post by the admin. If the admin doesn't exist, `firstOrFail()` stops the seeder with `No row in "users" matching your query.`, which tells you `UserSeeder` must run first.

**Advanced: safe to run twice, all or nothing.** Production seeders (run with `--force`) should never create duplicates, and should never stop halfway:

```ts title="database/seeders/role.seeder.ts"
import { transaction } from '@strutvane/framework'
import { Role } from '../../app/models/role.ts'

export class RoleSeeder {
  async run(): Promise<void> {
    // A transaction: if one insert fails, none of them stay.
    await transaction(async () => {
      for (const name of ['admin', 'member', 'viewer']) {
        const exists = await Role.query().where('name', name).exists()
        if (!exists) await Role.forceCreate({ name })
      }
    })
  }
}
```

**What you'll see:** the first run creates three roles; a second run changes nothing. See [Transactions](../orm-transactions/).

## Seeding tables that belong to a team

If your app has teams (see [Multi-tenancy](../tenancy/)), a team's tables can only be written **inside** that team. Wrap the work in `runWithTenant`:

```ts title="database/seeders/project.seeder.ts"
import { runWithTenant } from '@strutvane/framework'
import { Project } from '../../app/models/project.ts'
import { Team } from '../../app/models/team.ts'

export class ProjectSeeder {
  async run(): Promise<void> {
    for (const team of await Team.all()) {
      await runWithTenant(team.id, async () => {
        await Project.forceCreate({ name: 'Getting started' })
      })
    }
  }
}
```

**What you'll see:** one "Getting started" project per team, each with its team's `tenant_id` filled in for you. Without `runWithTenant`, the ORM stops with `TENANT_REQUIRED` instead of guessing a team.

## Fake data with factories

A **factory** is a recipe for one realistic fake record. Seeders and tests use it to make many records quickly. `--seeder` creates one next to your seeder; today it's a plain function:

```ts title="database/factories/post.factory.ts"
/**
 * Fake `posts` rows for tests and seeders. `sequence` makes each row unique.
 */
export function postDefinition(sequence: number): Record<string, unknown> {
  // Return one row's columns, for example: return { title: `Post ${sequence}` }
  void sequence
  return {}
}
```

You give it a precise return type, fill it in, and call it in a loop from your seeder with `forceCreate()`. [Factories](../orm-factories/#using-it-step-by-step) walks through it step by step, with the finished seeder.

### The factory API (coming in 0.2)

The designed API is Laravel's, in TypeScript:

```ts title="database/seeders/post.seeder.ts (with the 0.2 factory API)"
await Post.factory().count(10).create()                                // 10 saved posts
await Post.factory().count(3).state({ status: 'published' }).create()  // a state: override some values
await Post.factory().count(5).for(user, 'author').create()             // 5 posts by one user
await User.factory().has(Post.factory().count(3), 'posts').create()    // a user with 3 posts
await Post.factory().count(20).recycle(users).create()                 // reuse existing users as authors
const draft = await Post.factory().make()                             // built, but not saved
```

- A **state** overrides some values (`{ status: 'published' }`).
- A **sequence** makes each record different; the definition receives a counter.
- `for()` attaches the records to an existing parent; `has()` creates children for each record.
- `recycle()` picks parents from a list you pass, instead of creating a new user for every post (a common reason demo databases fill up with thousands of users).

Factories write through `forceCreate()` (trusted code) and run inside the active team on tenant tables. Details, including every option, are on [Factories](../orm-factories/).

:::caution[Coming in 0.2]
The fluent factory API is designed (ORM design §7) but not built yet; the names above may still change. Until then, use the plain definition function.
:::

## The first admin user

New apps come with a seeder that creates your roles and the first admin user. The installer runs it for you. With Docker or without, it's the same seeder; with Docker it runs inside the app container.

- The admin's **email** is in `.env` as `SEED_ADMIN_EMAIL` (by default `admin@<your-app>.test`).
- The admin's **password is never written to any file**: not to `.env`, not to `.env.example`, not to `strutvane.json`. The installer either generates one and shows it **once** in the terminal, or lets you type one (masked, at least 12 characters). It reaches the seeder only through an environment variable for that one run, and the account is marked "must change password at first sign-in".
- In CI, or when you missed the one-time password, set a new one:

```bash
node strut user:password admin@my-app.test
```

The admin seeder refuses to run when `APP_ENV` is `production` or `staging`, so it can never create a known account on a live server.

:::caution[Coming in 0.2]
The admin seeder, the one-time password and the "never in a file" rule are proven in the installer prototype (spike 13), which scans every file it writes for the password. `node strut user:password` is named by the installer but not built yet.
:::

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
**Fix:** use a `create_…_table` or `add_…_to_…_table` name, or drop `--seeder` and use `make:seeder` instead.

### "Refusing to seed with APP_ENV=production"

```text
Refusing to seed with APP_ENV=production: seeded accounts are for development only. Create a production admin with: node strut user:create --password-env
```

**Why:** seeding with known or demo accounts on a live server is a security hole.
**Fix:** create real users with `node strut user:create --password-env`. For non-account data in production (a list of countries), use `node strut migrate --seed --force` with a seeder that is safe to run twice.

### A database error about a missing foreign key

```text
No row in "users" matching your query. It may not exist, may be soft-deleted, or may belong to another tenant.
```

**Why:** the seeder runs before the seeder of the table it depends on, so the parent row isn't there yet.
**Fix:** in `database.seeder.ts`, move the parent's seeder (`UserSeeder`) above the child's (`PostSeeder`).

### My seeder created the same rows twice

**Why:** you ran it on purpose (`db:seed` or `--seed`) and it doesn't check what's already there.
**Fix:** make it safe to run twice (see the advanced example), or start over on your machine with `node strut migrate:fresh --seed`.

### My new seeder never ran

**Why:** it isn't called from `database.seeder.ts` (for example, you created the file by hand), or it already ran once in development and is remembered in the `seeders` table.
**Fix:** add `await new PostSeeder().run()` to `DatabaseSeeder.run()`, after the seeders it depends on; to run it again, use `node strut db:seed --class=PostSeeder` or `node strut db:seed`.

### TENANT_REQUIRED in a seeder

```text
"projects" is tenant-scoped, but no tenant is active. Wrap the work in runWithTenant(tenantId, () => …) (the HTTP layer does this for you per request). Deliberate cross-tenant jobs use .unsafeWithoutTenancy(reason), which is audited.
```

**Why:** a seeder runs outside any request, so no team is active.
**Fix:** wrap the writes in `runWithTenant(team.id, …)`, as in [Seeding tables that belong to a team](#seeding-tables-that-belong-to-a-team).

## Next steps

- [Factories](../orm-factories/): states, sequences, relations and `recycle()`.
- [Mass Assignment](../orm-mass-assignment/): `create()` versus `forceCreate()`.
- [Migrations](../migrations/): `migrate --seed`, `migrate:fresh --seed` and the other commands.
- [Database Testing](../database-testing/): use seeders and factories to set up each test.
