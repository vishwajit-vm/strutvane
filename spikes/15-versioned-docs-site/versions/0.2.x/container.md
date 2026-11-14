---
title: "Service Container"
description: "How Strutvane creates and shares services, and how to swap one for your own."
---

The container is the place where the framework's services (database, cache, mail, logger…) are registered and created. You will rarely touch it directly, but it is how packages plug in and how tests replace a service with a fake.

:::note[Being written]
This page is being written for 0.2. The summary above is accurate; the step-by-step guide with examples is on its way. Until then, [Your First CRUD](../first-crud/) shows the whole flow end to end.
:::
