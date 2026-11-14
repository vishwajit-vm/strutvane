---
title: "Deployment"
description: "How to build your app for production and run it on a server or a container platform."
---

`node strut build` bundles the server and the UI into `build/`, and `npm start` (`node build/server.js`) runs it, with a `/up` health route for load balancers. When the installer asks "Where will you deploy?" (question 35), it writes a deploy recipe in `deploy/README.md`. Choosing **Docker image** (or running `node strut docker:prod` later) also writes a committed, secure multi-stage `Dockerfile` and `.dockerignore`: non-root, no secrets in the image, and a health check on `/up`. See [Docker](../docker/). This page will cover environment variables in production, running migrations on deploy, and recipes for common hosts.

:::note[Being written]
This page is being written for 0.2. The summary above is accurate; the step-by-step guide with examples is on its way. Until then, [Your First CRUD](../first-crud/) shows the whole flow end to end.
:::
