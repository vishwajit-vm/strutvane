---
title: "Email Verification"
description: "Making sure people own the email address they signed up with."
---

Email verification is the `emailVerification` switch in `config/auth.ts` (on by default in the installer's question 6). New users get a signed link in Laravel's shape, `/email/verify/{id}/{hash}?expires=…&signature=…`, valid for 60 minutes and tied to their current address. Resending waits 60 seconds between mails and allows 6 per hour. The `verified` middleware (designed, not built yet) will refuse unverified users with `403 EMAIL_NOT_VERIFIED`.

The [Authentication](../authentication/) page already covers the flow. It is proven in the auth prototype (spike 20) and not released yet.

:::note[Being written]
This page is being written for 0.2. The summary above is accurate; the step-by-step guide with examples is on its way. Until then, the [Authentication](../authentication/) page has the full flow.
:::
