---
title: "Controllers"
description: "How to group request handling into controller classes, and when you don't need one at all."
---

Generated resources work without a controller. When you want your own behaviour, `node strut make:controller PostController --resource` writes a controller in `app/http/controllers` with the standard actions, and it replaces the generated one for that model.

:::note[Being written]
This page is being written for 0.2. The summary above is accurate; the step-by-step guide with examples is on its way. Until then, [Your First CRUD](../first-crud/) shows the whole flow end to end.
:::
