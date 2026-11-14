---
title: "Casts & Accessors"
description: "How column values become TypeScript values, and how to add computed attributes."
---

Most casts come from the column type in your migration (a decimal is a string, a timestamp a `Date`), so you rarely declare them. Accessors are plain getters on the model: `get isPublished() { return this.status === 'published' }`.

:::note[Being written]
This page is being written for 0.2. The summary above is accurate; the step-by-step guide with examples is on its way. Until then, [Your First CRUD](../first-crud/) shows the whole flow end to end.
:::
