---
title: Introduction
description: What Strutvane is, who it is for, and the four commands that take you from nothing to a working app with a secured API and admin screens.
---

## Meet Strutvane

Strutvane is a **TypeScript framework for building business web apps**: the kind with sign-in, users and permissions, lots of tables, and screens to list, search, create and edit records.

If you know Laravel, you already know how Strutvane feels. It copies Laravel's flow on purpose: the same folders, the same kind of commands, the same habits. The difference is that everything is TypeScript, it runs on Node.js, and you only ever need **npm**.

Here is the whole idea in four commands:

```bash
npm create strutvane@latest my-app          # asks a few questions, then sets everything up
cd my-app
npm run dev                                 # your app at http://localhost:3000

node strut make:migration create_posts_table --seeder
```

You open the new migration file, list your columns, and run one more command:

```bash
node strut migrate
```

Refresh the browser and **Posts** is in the sidebar: a list with search, sorting, filters and pages, forms to create and edit posts, a detail page and readable URLs like `/posts/hello-world`. All of it sits behind sign-in and permissions, and there is a matching JSON API for other apps. You can try exactly this in [Your First CRUD](../first-crud/).

## Why Strutvane?

### It does the boring parts for you

Most business apps spend their first weeks on the same plumbing: database tables, an API for each table, validation, sign-in, "who may see what", and admin screens. In Strutvane, your **migrations** describe your tables, and `node strut migrate` turns them into TypeScript types, a CRUD API and UI pages. You write the parts that make your app different.

### You own every line

Nothing is hidden behind magic. Models are ordinary classes in `app/models`, routes are in `routes/`, and the UI files you might want to change are written into your project. Strutvane never overwrites a file you own: when you add a column, generated screens pick it up, and anything you have customised stays exactly as you left it.

### It is safe by default

- **Deny by default:** nobody can see or change a record unless a policy allows it.
- **No SQL injection by construction:** every query uses bound parameters.
- **Secrets stay secret:** they are generated into `.env`, never into `.env.example`, and hidden fields like `password` are never sent to the browser, searched or sorted.
- **Teams (multi-tenancy):** each customer company sees only its own data, enforced by the ORM's tenant scope, and on PostgreSQL also by the database itself.

### It is fully typed

Your columns live in migrations, and Strutvane generates the TypeScript types from them. If you rename or drop a column, every line of code that still uses the old name becomes a compile error, before your users find it.

## Strutvane and Laravel, side by side

| You want to… | Laravel | Strutvane |
|---|---|---|
| Create a project | `laravel new my-app` | `npm create strutvane@latest my-app` |
| Run the app | `composer run dev` | `npm run dev` |
| Run a command | `php artisan migrate` | `node strut migrate` |
| Make a table | `php artisan make:migration create_posts_table` | `node strut make:migration create_posts_table` |
| Describe columns | `$table->string('title')` | `t.string('title')` |
| Write a model | `class Post extends Model {}` | `class Post extends Model('posts') {}` |
| Admin screens | Filament or Nova (add-ons) | Built in: generated on `migrate` |

## Who is it for?

- **Teams building internal tools and B2B products**: CRMs, back offices, portals, anything with many tables and roles.
- **Laravel developers moving to TypeScript** who want the same productivity.
- **TypeScript developers** who are tired of gluing ten libraries together before writing the first feature.

## Where to next?

1. [Install Strutvane](../installation/) and create your first project.
2. Build something in [Your First CRUD](../first-crud/) (five minutes).
3. Learn where things live in [Directory Structure](../structure/).
