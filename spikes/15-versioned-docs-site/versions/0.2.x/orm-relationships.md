---
title: "Relationships"
description: "Connecting models: belongsTo, hasMany, belongsToMany and more, without N+1 queries."
---

Relationships are methods on the model: `author() { return this.belongsTo(User) }`. `with()` eager-loads them in one extra query, and `withCount` and `whereHas` work like in Laravel.

:::note[Being written]
This page is being written for 0.2. The summary above is accurate; the step-by-step guide with examples is on its way. Until then, [Your First CRUD](../first-crud/) shows the whole flow end to end.
:::
