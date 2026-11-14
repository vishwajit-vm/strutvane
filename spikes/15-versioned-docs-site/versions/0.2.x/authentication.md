---
title: "Authentication"
description: "Signing people in with email and password, sessions, and the routes that come built in."
---

Auth is part of the default install. `config/auth.ts` has a `features` list (registration, email verification, password reset, 2FA, passkeys, password confirmation, teams), and the standard `/login`, `/register` and `/forgot-password` routes accept JSON and form posts. The auth tables are ordinary migrations in your app, and a real `users` model is generated.

:::note[Being written]
This page is being written for 0.2. The summary above is accurate; the step-by-step guide with examples is on its way. Until then, [Your First CRUD](../first-crud/) shows the whole flow end to end.
:::
