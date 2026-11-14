---
title: "Customising Screens"
description: "Changing generated screens without losing future updates."
---

The first `migrate` for a table writes `resources/ui/posts.ui.ts` with `columns: auto()` and `form: auto()`. You own that file and it is never overwritten: `auto()` keeps picking up new columns, and an explicit list is reported on, not rewritten.

:::note[Being written]
This page is being written for 0.2. The summary above is accurate; the step-by-step guide with examples is on its way. Until then, [Your First CRUD](../first-crud/) shows the whole flow end to end.
:::
