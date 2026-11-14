---
title: "Query Builder"
description: "Building database queries in TypeScript, fully typed from your migrations."
---

The query builder is fluent and typed: `Post.query().where('status', 'published').orderBy('created_at', 'desc').paginate(25)`. Columns keep their migration names (`created_at`, not `createdAt`), and a wrong column name or value type is a compile error. The full guide, with every condition, ordering and raw-SQL example, is in [ORM: Querying](../orm-querying/).

:::note[Being written]
This page will cover the query builder on its own (without models): joins, grouping and aggregates, which are coming in 0.2. Until then, [ORM: Querying](../orm-querying/) documents everything that is already built.
:::
