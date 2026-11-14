---
title: Configuration
description: How settings work in a Strutvane app. Secrets and per-machine values go in .env, everything else in typed config/*.ts files, and mistakes are reported all at once when the app starts.
---

**Settings** are the values your app needs that aren't code: its name, its address, how to reach the database, secret keys. This page shows where they live, how to read them from your code, and what happens when one is wrong.

:::tip[Coming from Laravel?]
It's the same model: `.env` plus `config/*.php` becomes `.env` plus `config/*.ts`, and `config('app.name')` works the same way. Two differences: `env('APP_DEBUG', false)` becomes a **typed reader** (`env.boolean('APP_DEBUG', false)`), so `config('app.debug')` is a real `boolean`; and the app checks **every** setting at start-up and lists all the problems at once.
:::

## Two places for settings

A Strutvane app keeps its settings in two places:

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

Each file in `config/` returns one group of settings: `config/app.ts`, `config/database.ts`, `config/auth.ts` and so on. A config file reads `.env` through a small, typed **reader** (`env`), so every value comes out with the right type.

### The smallest config file

```ts title="config/app.ts"
import { defineConfig } from '@strutvane/framework'

export default defineConfig((env) => ({
  name: env.string('APP_NAME', 'My App'),
}))
```

**What you'll see:** `config('app.name')` returns `'My App'`, or whatever `APP_NAME` says in `.env`.

### A typical config file

```ts title="config/app.ts"
import { defineConfig } from '@strutvane/framework'

export default defineConfig((env) => ({
  name: env.string('APP_NAME', 'My App'),
  env: env.oneOf('APP_ENV', ['local', 'testing', 'production'], 'production'),
  debug: env.boolean('APP_DEBUG', false),
  url: env.url('APP_URL', 'http://localhost:3000'),
  key: env.string('APP_KEY'), // no default: the app refuses to start without it
}))
```

Every config file is listed in `config/index.ts`, so the types (and `node strut about`) know about it:

```ts title="config/index.ts"
import app from './app.ts'
import database from './database.ts'

export const config = { app, database }
```

### Every reader

| Reader | Returns | Without a default… | Example |
|---|---|---|---|
| `env.string(key, default?)` | text | the key is required | `env.string('APP_NAME', 'My App')` |
| `env.optional(key)` | text or `undefined` | it's simply `undefined` | `env.optional('DB_PASSWORD')` |
| `env.integer(key, default?)` | a whole number | required | `env.integer('DB_PORT', 3306)` |
| `env.boolean(key, default?)` | `true`/`false` (also accepts `1`/`0`) | required | `env.boolean('APP_DEBUG', false)` |
| `env.oneOf(key, list, default?)` | one value from the list, typed as that list | required | `env.oneOf('APP_ENV', ['local', 'production'])` |
| `env.url(key, default?)` | an absolute `http(s)` URL | required | `env.url('APP_URL')` |

An empty value (`APP_NAME=`) counts as "not set", as in Laravel.

### Reading a setting anywhere

```ts title="app/http/controllers/home.controller.ts"
import { config } from '@strutvane/framework'

const title = config('app.name')   // string
const debug = config('app.debug')  // boolean
```

**What you'll see:** the values from your config files, already typed. A typo like `config('app.debg')` is a **compile error**, not a silent `undefined`. See [Helpers, Not Facades](../helpers/) for how `config()` finds the current app.

### An advanced config file: one setting, several connections

```ts title="config/database.ts"
import { defineConfig } from '@strutvane/framework'

export default defineConfig((env) => ({
  default: env.oneOf('DB_CONNECTION', ['mysql', 'pgsql', 'sqlite'], 'mysql'),
  connections: {
    mysql: {
      driver: 'mysql',
      host: env.string('DB_HOST', '127.0.0.1'),
      port: env.integer('DB_PORT', 3306),
      database: env.string('DB_DATABASE', 'my_app'),
      username: env.string('DB_USERNAME', 'root'),
      password: env.optional('DB_PASSWORD'),
    },
    sqlite: {
      driver: 'sqlite',
      database: env.string('DB_DATABASE', 'storage/database.sqlite'),
    },
  },
}))
```

**What you'll see:** `config('database.default')` is typed as `'mysql' | 'pgsql' | 'sqlite'`, and `config('database.connections.mysql.port')` is a `number`.

:::caution[Coming in 0.2]
`defineConfig`, the `env` readers and `config()` are proven in the application-core prototype (spike 12). The exact import path inside `@strutvane/framework` may still change.
:::

## Every mistake, reported at once

When the app starts (and when any `node strut` command runs), Strutvane checks **every** setting before doing anything else. If something is wrong, it stops and lists all the problems together:

```text
  ✖ The app can't start: 2 environment variables need attention.
  - APP_KEY is required (a text value); add it to .env (read in config/app.ts)
  - APP_DEBUG must be true or false (got "yes") (read in config/app.ts)
  → Fix the values in .env (see .env.example for every key) and start again.
```

Why all at once? Fixing a new server one setting at a time ("restart, next error, restart…") is the most frustrating loop in operations.

## Common settings

| Key | What it's for |
|---|---|
| `APP_NAME` | Your app's name, shown in the UI and in emails. |
| `APP_ENV` | `local`, `testing` or `production`. Seeders don't run automatically in production, and the debug error page only appears in `local` and `testing`. |
| `APP_DEBUG` | `true` shows detailed error pages (in `local`/`testing` only). **Always `false` in production.** |
| `APP_URL` | The address people use to reach the app. Also used for CSRF origin checks. |
| `APP_KEY` | The key used to sign and encrypt data. Generated for you; keep it secret. |
| `DB_CONNECTION` | `mysql`, `pgsql` or `sqlite`. |
| `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` | How to reach the database. |
| `SEED_ADMIN_PASSWORD` | The first admin user's password, created by the default seeder. |

## With Docker or without Docker

- **With Docker**, the installer writes the database settings that match the containers it starts, and `node strut` runs inside the app container, so the values in `.env` are the ones the containers use. You don't change them by hand.
- **Without Docker**, `.env` points at the database on your own machine (`DB_HOST=127.0.0.1`), or at a file with SQLite.

## Setting a variable for one command

Sometimes you want a different value just once, for example to see what production would do. The environment beats `.env`:

<!-- The same command in three shells. -->

```bash
# macOS / Linux (bash, zsh)
APP_ENV=production node strut about
```

```powershell
# Windows PowerShell
$env:APP_ENV='production'; node strut about; Remove-Item Env:APP_ENV
```

```bat
:: Windows cmd
set APP_ENV=production && node strut about
```

## Switching database

To move from SQLite to MySQL later (or the other way around), change the `DB_*` keys in `.env` and run your migrations against the new database:

```ini title=".env"
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

## Common mistakes

### The app won't start: "environment variables need attention"

```text
  ✖ The app can't start: 1 environment variable needs attention.
  - APP_KEY is required (a text value); add it to .env (read in config/app.ts)
```

**Why:** `.env` is missing, or a required key is empty. This happens after `git clone`, because `.env` is never committed.
**Fix:** let setup create it with fresh secrets:

```bash
npm run setup
```

### "must be true or false (got "yes")"

```text
  - APP_DEBUG must be true or false (got "yes") (read in config/app.ts)
```

**Why:** boolean settings accept only `true`, `false`, `1` or `0`.
**Fix:** `APP_DEBUG=true` in `.env`.

### My change to `.env` didn't do anything

**Why:** the same key is also set in your shell or by your host, and the real environment wins over `.env`.
**Fix:** check where it's set (`echo $APP_ENV` in bash, `$env:APP_ENV` in PowerShell) and remove it there, or change it there.

### `config('app.nmae')` doesn't compile

```text
error TS2345: Argument of type '"app.nmae"' is not assignable to parameter of type …
```

**Why:** config keys are typed from your config files, so typos are caught before the code runs.
**Fix:** use the right key (`config('app.name')`). If it's a new setting, add it to the config file first.

## Next steps

- [Directory Structure](../structure/): where `config/` and everything else lives.
- [Helpers, Not Facades](../helpers/): `config()`, `route()` and friends.
- [Database: Getting Started](../database/): the database settings in more depth.
