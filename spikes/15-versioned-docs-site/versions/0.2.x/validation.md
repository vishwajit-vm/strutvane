---
title: "Validation"
description: "Checking input before it reaches your database, with every problem reported at once."
---

Generated resources validate input from your column types automatically and reject unknown fields. For your own routes, form requests (`node strut make:request`) hold the rules. Failed validation returns a 422 with a list of field `issues`.

:::note[Being written]
This page is being written for 0.2. The summary above is accurate; the step-by-step guide with examples is on its way. Until then, [Your First CRUD](../first-crud/) shows the whole flow end to end.
:::
