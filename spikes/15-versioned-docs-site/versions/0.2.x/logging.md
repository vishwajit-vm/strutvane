---
title: "Logging"
description: "Writing logs, where they go, and how secrets are kept out of them."
---

The framework's logging pipeline redacts secrets and does not log request bodies by default. The optional `@strutvane/log-viewer` package adds a live log viewer at `/_strutvane/logs`.

:::note[Being written]
This page is being written for 0.2. The summary above is accurate; the step-by-step guide with examples is on its way. Until then, [Your First CRUD](../first-crud/) shows the whole flow end to end.
:::
