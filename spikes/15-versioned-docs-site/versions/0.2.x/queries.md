---
title: "Query Builder"
description: "Building queries in TypeScript, fully typed from your migrations."
---

The query builder is fluent and typed: `Post.query().where('status', 'published').orderBy('createdAt', 'desc').paginate(25)`. A wrong column name or value type is a compile error. The final API comes from the ORM spike, still in progress.

:::note[Being written]
This page is being written for 0.2. The summary above is accurate; the step-by-step guide with examples is on its way. Until then, [Your First CRUD](../first-crud/) shows the whole flow end to end.
:::
