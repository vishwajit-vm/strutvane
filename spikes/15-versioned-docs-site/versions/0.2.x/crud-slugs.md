---
title: "Slugs"
description: "Readable URLs like `/posts/hello-world`, generated from a title."
---

Add `t.slug('slug').from('title')` to a migration. Slugs are set on create and stay stable afterwards, are unique per table (or per team), get `-2`, `-3` suffixes on collisions, and refuse reserved words and id-like values.

:::note[Being written]
This page is being written for 0.2. The summary above is accurate; the step-by-step guide with examples is on its way. Until then, [Your First CRUD](../first-crud/) shows the whole flow end to end.
:::
