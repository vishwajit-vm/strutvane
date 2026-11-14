---
title: "Teams & Tenancy"
description: "Letting each customer company see only its own data."
---

Choose "Teams" in the installer and every query on a tenant table is limited to the active tenant by the ORM, and checked once more just before the SQL is sent. On PostgreSQL, row-level security adds database-enforced isolation on top. On MySQL and SQLite, the ORM's check plus attack-style isolation tests are the guarantee. The ORM side, with examples, is in [ORM: Tenancy](../orm-tenancy/).

:::note[Being written]
This page will cover teams from the user's side: creating a team, inviting people, switching teams and team roles. Until then, [ORM: Tenancy](../orm-tenancy/) explains how the data is kept apart.
:::
