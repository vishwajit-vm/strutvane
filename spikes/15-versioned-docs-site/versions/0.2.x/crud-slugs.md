---
title: "Slugs"
description: "Readable URLs like `/posts/hello-world`, generated from a title."
---

Add `t.slug('slug').from('title')` to a migration. Slugs are filled in on create and stay stable afterwards, and they're unique per table (or per team). When a slug is already taken, the new one gets a short random suffix such as `launch-k3f9`, never `-2`, `-3`: a counter would reveal how many hidden rows share the title. How the ORM builds them is explained in [ORM: Slugs](../orm-slugs/).

:::note[Being written]
This page will cover slugs in the generated API and screens (slug URLs, editing a slug in the form, reserved words). Until then, [ORM: Slugs](../orm-slugs/) documents how slugs are generated.
:::
