---
title: "API Tokens"
description: "Personal access tokens with abilities, for scripts, mobile apps and other services."
---

Besides cookie sessions for the first-party UI, Strutvane issues personal access tokens with abilities (like Laravel Sanctum). Tokens are stored hashed with SHA-256, so a database leak doesn't leak usable tokens.

:::note[Being written]
This page is being written for 0.2. The summary above is accurate; the step-by-step guide with examples is on its way. Until then, [Your First CRUD](../first-crud/) shows the whole flow end to end.
:::
