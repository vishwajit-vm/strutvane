---
title: "Teams & Tenancy"
description: "Letting each customer company see only its own data."
---

Choose "Teams" in the installer and every query is scoped to the current team by the ORM's tenant scope. On PostgreSQL, row-level security adds database-enforced isolation on top. On MySQL and SQLite, the tenant scope plus attack-style isolation tests are the guarantee.

:::note[Being written]
This page is being written for 0.2. The summary above is accurate; the step-by-step guide with examples is on its way. Until then, [Your First CRUD](../first-crud/) shows the whole flow end to end.
:::
