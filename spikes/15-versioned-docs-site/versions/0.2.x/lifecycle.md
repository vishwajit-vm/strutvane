---
title: "Request Lifecycle"
description: "What happens between a request arriving and your controller running, step by step."
---

Like Laravel, a request goes through `bootstrap/app.ts`, the service providers, the middleware stack, the router and finally your controller or the generated resource. Knowing this order makes middleware and providers easy to reason about.

:::note[Being written]
This page is being written for 0.2. The summary above is accurate; the step-by-step guide with examples is on its way. Until then, [Your First CRUD](../first-crud/) shows the whole flow end to end.
:::
