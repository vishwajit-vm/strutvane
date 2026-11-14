---
title: "Search, Filters & Sorting"
description: "How `?search=`, `filter[...]` and `sort=` work in the generated API and screens."
---

The generated API supports `?search=` across text fields (case-insensitive, AND between words), `filter[field]=value` and `filter[field][op]=value`, `sort=-createdAt,title`, `include=author` and `fields[posts]=title,slug`. Only fields the viewer may see are searched.

:::note[Being written]
This page is being written for 0.2. The summary above is accurate; the step-by-step guide with examples is on its way. Until then, [Your First CRUD](../first-crud/) shows the whole flow end to end.
:::
