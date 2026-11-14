---
title: "ORM: Getting Started"
description: "Models are classes in `app/models`. Their columns come from your migrations, so a whole model can be one line."
---

The Strutvane ORM is Eloquent for TypeScript: `class Post extends Model('posts') {}` is a complete model, typed from your migrations. This page will cover reading, creating, updating and deleting records, scopes, soft deletes and mass-assignment protection.

:::note[Being written]
This page is being written for 0.2. The summary above is accurate; the step-by-step guide with examples is on its way. Until then, [Your First CRUD](../first-crud/) shows the whole flow end to end.
:::
