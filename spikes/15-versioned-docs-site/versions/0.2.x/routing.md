---
title: "Routing"
description: "How to map URLs to controllers in `routes/web.ts` and `routes/api.ts`, including resource routes."
---

Routes live in `routes/web.ts` and `routes/api.ts`. `Route.resource()` gives you the seven REST actions in one line and `Route.apiResource()` the five API ones, with route model binding by id or slug. Generated resources are registered in `routes/resources.gen.ts`, which you never edit.

:::note[Being written]
This page is being written for 0.2. The summary above is accurate; the step-by-step guide with examples is on its way. Until then, [Your First CRUD](../first-crud/) shows the whole flow end to end.
:::
