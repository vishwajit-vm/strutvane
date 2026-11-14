---
title: Introduction
description: What Strutvane is, who it's for, and how a whole feature (database table, secured API and admin screens) comes from one migration and two commands.
---

Strutvane is a **framework** for building business web apps in TypeScript. A framework is a ready-made structure for an app: it decides where files go, gives you tools for the common jobs (database, sign-in, forms, permissions), and lets you spend your time on what makes your app different.

Strutvane is for apps with sign-in, users and permissions, many tables, and screens to list, search, create and edit records: CRMs, back offices, customer portals, internal tools.

:::tip[Coming from Laravel?]
Strutvane copies Laravel's flow on purpose: the same folders (`app/models`, `database/migrations`, `routes/`), the same commands (`node strut migrate` is `php artisan migrate`) and the same habits. The differences: everything is **TypeScript**, it runs on **Node.js**, you only ever need **npm**, and the admin screens Laravel gets from Filament or Nova are **built in**.
:::

## The whole idea in one example

Here is everything it takes to go from nothing to a working "Posts" feature. Don't worry about the details yet: each step has its own page.

```bash
npm create strutvane@latest my-app      # asks a few questions, then sets everything up
cd my-app
npm run dev                             # starts your app at http://localhost:3000
```

In a second terminal, ask for a new table:

```bash
node strut make:migration create_posts_table --seeder --factory
```

Open the new migration file and list the columns a post has:

```ts title="database/migrations/2026_11_14_093000_create_posts_table.ts"
import { migration } from '@strutvane/framework/schema'

export default migration({
  up(schema) {
    schema.create('posts', (t) => {
      t.id()
      t.string('title', 200)
      t.slug('slug').from('title')
      t.text('body').nullable()
      t.enum('status', ['draft', 'published']).default('draft')
      t.timestamps()
    })
  },
  down(schema) {
    schema.drop('posts')
  },
})
```

Then run one command:

```bash
node strut migrate
```

**What you'll see:** refresh the browser and **Posts** is in the sidebar. It has a list with search, sorting, filters and pages; forms to create and edit posts; a detail page; and readable addresses like `/posts/hello-world`. All of it sits behind sign-in and permissions, and the same data is available as a JSON API for other apps. [Your First CRUD](../first-crud/) walks through exactly this, step by step.

## What Strutvane does for you

### It writes the boring parts

Most business apps spend their first weeks on the same plumbing: tables, an API per table, checking input, sign-in, "who may see what", and admin screens. In Strutvane:

- your **migrations** (small files that describe your tables) are the single source of truth;
- `node strut migrate` turns them into **TypeScript types**, a **CRUD API** (create, read, update, delete) and **UI pages**;
- you write only the parts that make your app different.

### You own every line

Nothing is hidden. Models are ordinary classes in `app/models`, routes are in `routes/`, and the UI files you might want to change are written into your project. Strutvane **never overwrites a file you own**. When you add a column later, the generated screens pick it up, and anything you customised stays exactly as you left it.

### It's safe by default

- **Deny by default:** nobody can see or change a record until a **policy** (a small class with the rules for one model) allows it.
- **No SQL injection by construction:** every value goes to the database as a bound parameter, never pasted into SQL text.
- **Secrets stay secret:** they're generated into `.env`, never into `.env.example`, and hidden fields like `password` are never sent to the browser.
- **Teams:** with teams switched on, each customer company sees only its own data.

### It's typed from end to end

Your columns live in migrations, and Strutvane generates the TypeScript types from them. Rename or drop a column and every line of code that still uses the old name becomes a compile error, so you find it in your editor instead of in production:

```text
error TS2339: Property 'body' does not exist on type 'Post'.
```

## Strutvane and Laravel, side by side

| You want to… | Laravel | Strutvane |
|---|---|---|
| Create a project | `laravel new my-app` | `npm create strutvane@latest my-app` |
| Run the app | `composer run dev` | `npm run dev` |
| Run a command | `php artisan migrate` | `node strut migrate` |
| Make a table | `php artisan make:migration create_posts_table` | `node strut make:migration create_posts_table` |
| Describe a column | `$table->string('title')` | `t.string('title')` |
| Write a model | `class Post extends Model {}` | `class Post extends Model('posts', { fillable: [...] }) {}` |
| Admin screens | Filament or Nova (add-ons) | Built in, generated on `migrate` |
| Package manager | Composer + npm | npm only |

## Who is it for?

- **Small teams building internal tools and B2B products** with many tables and roles.
- **Laravel developers moving to TypeScript** who want the same productivity.
- **TypeScript developers** who are tired of gluing ten libraries together before the first feature.
- **Beginners:** these docs explain every new word, and every example can be copied as it is.

## What Strutvane is not (yet)

:::caution[Coming in 0.2]
Strutvane 0.2 is being built right now. These docs describe how it will work, and every feature that doesn't exist yet is marked like this box. If you try a command from these docs and it isn't there, that's why.
:::

- It isn't a website builder or a CMS: you write code.
- It doesn't render pages on the server with templates (Laravel's Blade). The UI is a React app in the same project.

## Common mistakes

### "npm create strutvane" says the package doesn't exist

```text
npm error 404 Not Found - GET https://registry.npmjs.org/create-strutvane - Not found
```

**Why:** 0.2 hasn't been published to npm yet (see the banner at the top of this page).
**Fix:** for now, read along and try the flow in the prototypes; this command will work once 0.2 is released.

### "node strut" says it can't find the module

```text
Error: Cannot find module 'C:\Users\you\strut'
```

**Why:** `strut.js` lives in your project's root folder, so `node strut` only works from inside it.
**Fix:**

```bash
cd my-app
node strut list
```

### I typed `sv migrate` from an old tutorial

**Why:** `sv` was the 0.1 command. In 0.2 the command line is `node strut` (or `npx strutvane`).
**Fix:** `node strut migrate`. The [Upgrade Guide](../upgrade/) lists every rename.

## Next steps

1. [Install Strutvane](../installation/) and create your first project.
2. Build something in [Your First CRUD](../first-crud/) (five minutes).
3. Learn where things live in [Directory Structure](../structure/).
