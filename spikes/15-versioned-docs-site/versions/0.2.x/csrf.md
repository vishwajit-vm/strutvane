---
title: "CSRF Protection"
description: "How Strutvane protects form posts and cookie-based requests from cross-site forgery."
---

Cookie-session requests from the first-party UI are checked for a CSRF token and a trusted origin. API calls that use personal access tokens don't need one. This page will explain both and how to exclude a route safely.

:::note[Being written]
This page is being written for 0.2. The summary above is accurate; the step-by-step guide with examples is on its way. Until then, [Your First CRUD](../first-crud/) shows the whole flow end to end.
:::
