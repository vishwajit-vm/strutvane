---
title: "Password Reset"
description: "Letting people reset a forgotten password safely."
---

Password reset is part of password sign-in (`passwordLogin`), with Laravel's `/forgot-password` and `/reset-password` routes. Asking for a link always answers the same, so it never reveals which emails have accounts. The reset token lasts 60 minutes, works once and is stored only as a keyed digest. A successful reset signs the user out everywhere (sessions, API tokens, remembered devices, email links) and lifts a lockout. Requests are limited to 5 per IP and 3 per account every 15 minutes.

The [Authentication](../authentication/) page already covers the flow. It is proven in the auth prototype (spike 20) and not released yet.

:::note[Being written]
This page is being written for 0.2. The summary above is accurate; the step-by-step guide with examples is on its way. Until then, the [Authentication](../authentication/) page has the full flow.
:::
