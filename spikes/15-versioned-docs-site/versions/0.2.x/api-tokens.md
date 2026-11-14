---
title: "API Tokens"
description: "Personal access tokens with abilities, for scripts, mobile apps and other services."
---

Besides cookie sessions for your own UI, Strutvane issues personal access tokens with abilities, like Laravel Sanctum (the `tokens` switch in `config/auth.ts`; the installer's default for question 9). A token looks like `svp_` plus 46 characters, is shown once, and is sent as `Authorization: Bearer …`. Only a keyed digest (HMAC-SHA-256 with a key derived from `APP_KEY`) is stored, so a database leak doesn't leak usable tokens. Abilities such as `post.view` or `post.*` must fit the app's allowed list, and the request must pass your policies too. Tokens expire after a year by default and can be revoked one by one; a password reset revokes them all.

The [Authentication](../authentication/) page already covers creating, using and revoking tokens. It is proven in the auth prototype (spike 20) and not released yet.

:::note[Being written]
This page is being written for 0.2. The summary above is accurate; the step-by-step guide with examples is on its way. Until then, the [Authentication](../authentication/) page has the full flow.
:::
