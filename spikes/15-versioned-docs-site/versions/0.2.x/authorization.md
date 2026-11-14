---
title: "Authorization"
description: "Deciding who may do what, with policies that also filter lists in SQL."
---

Policies live in `app/policies`, one class per model, found automatically by name, and everything is denied unless a policy allows it. A policy method can return `true`/`false` or a row condition, so one rule checks a single record and also filters lists in SQL.

:::note[Being written]
This page is being written for 0.2. The summary above is accurate; the step-by-step guide with examples is on its way. Until then, [Your First CRUD](../first-crud/) shows the whole flow end to end.
:::
