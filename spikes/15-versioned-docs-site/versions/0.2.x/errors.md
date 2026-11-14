---
title: "Error Handling"
description: "How errors are reported, logged and shown, in development and in production."
---

Every error response uses RFC 9457 problem+json with a stable `code`. In development you get a friendly error page with a "Copy as Markdown for AI" button; in production the details stay in the logs.

:::note[Being written]
This page is being written for 0.2. The summary above is accurate; the step-by-step guide with examples is on its way. Until then, [Your First CRUD](../first-crud/) shows the whole flow end to end.
:::
