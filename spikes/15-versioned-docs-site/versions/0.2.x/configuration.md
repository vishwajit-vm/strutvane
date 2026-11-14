---
title: Configuration
description: How settings work in a Strutvane app. Secrets and per-machine values go in .env, everything else in typed config/*.ts files, and mistakes are reported all at once when the app starts.
---

## Two places for settings

A Strutvane app keeps its settings in two places, exactly like Laravel:

| Where | What goes there | Committed to git? |
|---|---|---|
| **`.env`** | Values that change from machine to machine: passwords, keys, ports, the database name. | **Never** |
| **`config/*.ts`** | Everything else, plus *which* `.env` values to read, with their types and defaults. | Yes |

So `config/database.ts` says "the database port is a number, read from `DB_PORT`, default `3306`", and `.env` on your laptop says `DB_PORT=3307`.

## The `.env` file

`.env` sits in your project's root folder. Each line is a `KEY=value` pair:

```ini
APP_NAME="My App"
APP_ENV=local
APP_DEBUG=true
APP_URL=http://localhost:3000
APP_KEY=…generated for you…

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=my_app
DB_USERNAME=root
DB_PASSWORD=…generated for you…
```

You don't write this file by hand. `npm create strutvane@latest` writes it, **generates the secrets** (like `APP_KEY` and `DB_PASSWORD`) and picks free ports.

### `.env.example`: the list of every setting

Next to `.env` is **`.env.example`**. It has the same keys, **without the secret values**, and it *is* committed. It's how a teammate (or a server) knows which settings exist. After `git clone`, a teammate runs `npm run setup`, which copies `.env.example` to `.env` and fills in fresh secrets.

:::danger[Never commit `.env`]
`.env` holds passwords and keys. New projects already list it in `.gitignore`. If a secret ever lands in git, treat it as leaked: change it, don't just delete the commit.
:::

### Real environment variables win

On servers you often set variables in the environment instead of a file (in your hosting dashboard, Docker or CI). When a key is set both in the environment and in `.env`, **the environment wins**. That's Laravel's rule too, and it means one build works everywhere.

## Config files

Each file in `config/` returns one group of settings: `config/app.ts`, `config/database.ts`, `config/auth.ts` and so on. A config file reads `.env` through a small, typed helper, so every value has the right type:

```ts
// config/app.ts
export default defineConfig((env) => ({
  name: env.string('APP_NAME', 'My App'),
  env: env.oneOf('APP_ENV', ['local', 'testing', 'production'], 'production'),
  debug: env.boolean('APP_DEBUG', false),
  url: env.url('APP_URL', 'http://localhost:3000'),
  key: env.string('APP_KEY'), // no default: the app refuses to start without it
}))
```

What each reader does:

| Reader | Returns | Example |
|---|---|---|
| `env.string(key, default?)` | text; required when there's no default | `env.string('APP_NAME', 'My App')` |
| `env.optional(key)` | text or `undefined` | `env.optional('DB_PASSWORD')` |
| `env.integer(key, default?)` | a whole number | `env.integer('DB_PORT', 3306)` |
| `env.boolean(key, default?)` | `true`/`false` (also accepts `1`/`0`) | `env.boolean('APP_DEBUG', false)` |
| `env.oneOf(key, list, default?)` | one value from the list, typed as that list | `env.oneOf('APP_ENV', ['local', 'production'])` |
| `env.url(key, default?)` | an absolute http(s) URL | `env.url('APP_URL')` |

Then read any setting anywhere in your app with `config()`, and TypeScript knows its type:

```ts
if (config('app.debug')) {
  // config('app.debug') is a boolean, config('app.name') is a string
}
```

A typo like `config('app.debg')` is a compile error, not a silent `undefined`.

:::caution[Coming in 0.2]
`defineConfig`, the `env` readers and `config()` come from the MVC core prototype (spike 12) and may still be renamed before 0.2 ships. The idea (typed config files that read a validated `.env`) is settled.
:::

## Every mistake, reported at once

When the app starts, Strutvane checks **every** setting before doing anything else. If something is wrong, it stops and lists all the problems together, with what it expected. Something like this (the exact wording may differ):

```text
✘ The app can't start: 2 settings in .env need fixing
  APP_KEY     is required but empty
  APP_DEBUG   must be true or false (got "yes")
```

Why all at once? Fixing a new server one setting at a time ("restart, next error, restart…") is the most frustrating loop in operations.

## Common settings

| Key | What it's for |
|---|---|
| `APP_NAME` | Your app's name, shown in the UI and in emails. |
| `APP_ENV` | `local`, `testing` or `production`. Seeders don't run automatically in production. |
| `APP_DEBUG` | `true` shows detailed error pages. **Always `false` in production.** |
| `APP_URL` | The address people use to reach the app. |
| `APP_KEY` | The key used to sign and encrypt data. Generated for you; keep it secret. |
| `DB_CONNECTION` | `mysql`, `pgsql` or `sqlite`. |
| `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` | How to reach the database. |
| `SEED_ADMIN_PASSWORD` | The first admin user's password, created by the default seeder. |

## Switching database

To move from SQLite to MySQL later (or the other way around), change the `DB_*` keys in `.env` and run your migrations against the new database:

```ini
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=my_app
DB_USERNAME=root
DB_PASSWORD=secret
```

```bash
node strut migrate
```

Your migrations are written once and work on MySQL, PostgreSQL and SQLite. See [Migrations](../migrations/).

## Next steps

- [Directory Structure](../structure/): where `config/` and everything else lives.
- [Database: Getting Started](../database/): the database settings in more depth.
