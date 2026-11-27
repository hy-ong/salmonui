---
title: Remote pivot engine
description: A PivotTable over createJsonPivotSource; the reference handler aggregates 100,000 raw rows on the server, the source sends a bearer token and logs every request, a custom loading template shows while the server works, and the export loads every window of the server result.
category: pivot-table
---

`usePivot({ createEngine })` swaps the local engine for
`source.createEngine()` of `createJsonPivotSource()`. The demo endpoint
`/api/pivot` runs `createPivotQueryHandler()` from
`@salmonui/data/server` with the same pivot engine over 100,000 sales
rows that never reach the browser; only result windows, member lists and
drill-through pages do. On this static site the endpoint runs in your
browser tab (the demo backend), with a 400 ms delay.

The source's `headers` option is read per request: it sends
`authorization: Bearer <token>`, and the endpoint answers 401 to any other
token. Change the token and press Refresh to see `onError`; the log
also shows `onRequest` and `onResponse` with their request kind (`pivot`
for windows and drill through, `facet` for member lists).

`renderLoading` replaces the spinner while a request is pending
(`aria-busy` is set on the root). Drill down, filter from the axis bar,
or double-click a value cell to load its raw rows from the server.

"Export … from the server result" passes the remote engine to
`exportPivot()` of `@salmonui/export/pivot`, which loads every
window of the server result through `loadWindow()` and writes the file.
