---
title: Seeding
description: Fill your database with starting data and realistic fake data. Seeders run once in development, never twice, and never in production unless you ask.
---

## What is seeding?

**Seeding** means putting data into your database with code: the roles your app needs, the first admin user, a list of countries, or a few hundred fake customers so the screens look real while you build.

Seeders live in `database/seeders/`. They usually use **factories** (in `database/factories/`), which describe how to make one realistic fake record.

## The quick way

When you create a table, ask for a seeder and a factory at the same time:

```bash
node strut make:migration create_posts_table --seeder
```

You get the migration, the model, `database/factories/post-factory.ts` and `database/seeders/post-seeder.ts`. The new seeder is **registered for you** in `database/seeders/database-seeder.ts`, after the seeders of any tables it depends on (so users exist before their posts).

Need a seeder on its own? `node strut make:seeder` and `node strut make:factory` ask you which model it's for.

## Writing a factory

A factory returns the values for one fake record. `faker` makes realistic text, names and numbers:

```ts
// database/factories/post-factory.ts
export default defineFactory(Post, ({ faker }) => ({
  title: faker.sentence(),
  body: faker.paragraph(),
  status: 'draft',
}))
```

The keys are typed from your migration: a typo, or `status: 'archived'` when the column only allows `draft` and `published`, is a compile error.

Then make records anywhere (seeders, tests):

```ts
await Post.factory().count(10).create()                              // 10 saved posts
await Post.factory().count(3).state({ status: 'published' }).create() // override some values
await Post.factory().count(5).for(user, 'author').create()            // 5 posts by one user
const draft = await Post.factory().make()                            // built, but not saved
```

## Writing a seeder

A seeder is a small file with a `run()` function:

```ts
// database/seeders/post-seeder.ts
export default defineSeeder({
  after: ['users'],          // run after the users seeder
  async run() {
    await Post.factory().count(20).create()
  },
})
```

`after` puts seeders in the right order, so you never seed posts before the users they belong to.

:::caution[Coming in 0.2]
`defineFactory`, `defineSeeder` and the factory methods are designed (ORM spike 11) but not built yet. Names may still change slightly.
:::

## Running seeders

You rarely run seeders by hand, because `node strut migrate` does it for you:

| Situation | What happens |
|---|---|
| **Development**, a seeder that hasn't run yet | It runs **once**, as part of `node strut migrate`. |
| **Development**, a seeder that already ran | It's skipped. Strutvane remembers it in a `seeders` table, so you never get duplicates. |
| You want it again | `node strut migrate --seed` or `node strut db:seed` runs seeders again, on purpose. |
| **Production** | Nothing is seeded, unless you pass `--seed --force`. |

```bash
node strut migrate                 # migrate, then run seeders that haven't run yet
node strut db:seed                 # run the seeders again
node strut migrate:fresh --seed    # start over: drop everything, migrate, seed (development only)
```

:::tip[The first admin user]
New apps come with a seeder that creates your roles and the first admin user. The installer runs it for you, and the admin's password is in `.env` as `SEED_ADMIN_PASSWORD`.
:::

:::danger[Seeding production on purpose]
`--force` exists for real starting data, like a list of countries. Never seed fake data into production, and make production seeders safe to run twice (update a row when it already exists instead of adding another).
:::

## Next steps

- [Factories](../orm-factories/): more about factory states and relations.
- [Database Testing](../database-testing/): use factories to set up each test.
