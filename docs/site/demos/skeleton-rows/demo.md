---
title: Skeleton rows
description: 50,000 remote orders read in blocks with 800 ms of latency. With virtualization.skeletonRows the unloaded rows render shimmering skeleton bars until their block lands; turned off they show the loading text. The jump buttons scroll by offset with api.scrollTo.
---

The `/api/orders` endpoint is `docs/site/lib/demo-api.ts`, served by a Next.js route handler on a server and run in the browser tab on the static site. The shimmer stops
under `prefers-reduced-motion: reduce`.
