---
title: "Pagination"
description: "Splitting results into pages, with totals or with cursors."
---

Offset pagination with totals (`paginate(perPage, page)`) and cursor pagination (`cursorPaginate(perPage, cursor)`) are both built into the ORM. Page sizes are capped at 100 by default, cursors are tied to their sort order, and every page has a deterministic order. The generated API uses the same rules; the UI shows 25 rows per page by default (10, 25, 50 or 100). The full guide is in [ORM: Pagination](../orm-pagination/).

:::note[Being written]
This page will cover pagination in the generated API and UI (query parameters, response `meta`). Until then, [ORM: Pagination](../orm-pagination/) documents the ORM side with examples.
:::
