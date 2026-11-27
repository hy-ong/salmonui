---
title: Remote JSON data source
description: 50,000 orders from a Salmon UI JSON protocol endpoint (the reference handler, behind a Next.js route handler or in the browser on the static site), loaded in infinite blocks, sorted on the server with an initial sort.
---

The `/api/orders` endpoint is `docs/site/lib/demo-api.ts`, served by a Next.js route handler on a server and run in the browser tab on the static site; it adds 150 ms of latency.
The request log comes from the source's `onRequest` and `onResponse` hooks.
