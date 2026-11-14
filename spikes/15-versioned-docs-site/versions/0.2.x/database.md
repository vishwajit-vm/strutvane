---
title: "Database: Getting Started"
description: "Connecting to MySQL, PostgreSQL or SQLite, and how Strutvane talks to your database."
---

Strutvane supports MySQL 8.4+ (the default), PostgreSQL and SQLite. The connection comes from the `DB_*` keys in `.env`. Every query uses bound parameters, so SQL injection is impossible by construction. See [Configuration](../configuration/) for the settings and [Migrations](../migrations/) for creating tables.

:::note[Being written]
This page is being written for 0.2. The summary above is accurate; the step-by-step guide with examples is on its way. Until then, [Your First CRUD](../first-crud/) shows the whole flow end to end.
:::
