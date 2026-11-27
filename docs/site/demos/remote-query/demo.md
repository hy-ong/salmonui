---
title: Server-side filtering and search
description: A remote JSON source receiving the filter row (with an initial nested AND/OR group), the toolbar search and the page in one request, and an Excel filter whose values come from paged, searchable facet requests (with a skeleton or spinner while they load); the request log shows the wire query.
---

The `/api/orders` endpoint is `docs/site/lib/demo-api.ts`, served by a Next.js route handler on a server and run in the browser tab on the static site; it adds 120 ms of latency.
