---
title: Infinite scrolling
description: 50,000 remote orders read in blocks of 100 as the viewport approaches unloaded rows. The first 300 rows are seeded with initialResult and render on the server; unloaded rows show loading rows; with cache and maxBlocks 6 the farthest blocks are evicted; sorting resets to the top; a button loads the next block; another adds an order at the bottom, which lands after the last row.
---

The `/api/orders` endpoint is `docs/site/lib/demo-api.ts`, served by a Next.js route handler on a server and run in the browser tab on the static site; it adds 150 ms of latency.
The status line reads the typed `api.engine.infiniteScroll` façade (`getStatus()`, `getStats()`); the button calls `loadNext()`.
"Add order at the bottom" scrolls to the last row and calls `addRow()` with `editing.newRowPosition: 'bottom'`: the new row opens in the band at the bottom edge, and Enter writes it. The endpoint is read-only, so the demo's source keeps added orders in the page and serves them after row 50,000; the write's echo makes the grid re-read the blocks around the viewport, and the row count grows by one.
