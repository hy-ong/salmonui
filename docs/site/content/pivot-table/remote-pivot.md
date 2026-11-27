---
title: Remote pivot
description: Aggregate on the server with the pivot request kind of the Salmon UI JSON protocol, a window-based remote engine on the client, auth headers and request hooks, and a Node reference handler running the same engine.
category: Pivot Table
order: 80
demos: [pivot-table-remote]
---

A pivot over millions of raw rows does not have to ship them to the
browser. The `pivot` request kind of the Salmon UI JSON protocol sends the
report model (plain JSON) and a window of leaf positions; the server runs
the pivot engine and answers that window's header nodes and value cells.
A scroll asks for the cells of the next window, a drill sends a new
`expanded` list, and raw rows travel only for drill through.

```txt
client                                        server
createJsonPivotSource()  ── pivot { model, window } ──▶  createPivotQueryHandler(rows, { engine })
  .createEngine()        ◀─ { rowCount, columnCount,     runs createPivotEngine()
                              rowHeaders, columnHeaders,  from @salmonui/pivot-table/engine
                              cells }
```

## The server

`createPivotQueryHandler()` in `@salmonui/data/server` is the reference
handler. It runs the engine you pass in over an in-memory array, so the
numbers are exactly the ones the local engine computes. It is zero
dependency and DOM free: Node, a Worker or an edge runtime.

```ts
// app/api/pivot/route.ts (Next.js App Router)
import { createPivotEngine } from '@salmonui/pivot-table/engine';
import { createPivotQueryHandler } from '@salmonui/data/server';
import { loadSales } from './sales';

const handler = createPivotQueryHandler(await loadSales(), { engine: createPivotEngine, key: 'id' });

export async function POST(request: Request) {
  return Response.json(handler.handle(await request.json()));
}
```

The handler answers `pivot` requests (result windows and drill-through
pages) and passes `read`, `facet` and `write` requests to a
`createJsonQueryHandler` over the same rows, so member lists, raw rows and
drill-through edits use the same endpoint. It keeps one engine per
distinct pre-aggregation filter (`cacheSize`, default 4); `setRows()`
replaces the data and changes the result version, and `compute(model)`
returns the whole result (see [Export](/docs/pivot-table/export)).

| Option | Default | |
| --- | --- | --- |
| `engine` | required | `createPivotEngine` from `@salmonui/pivot-table/engine` |
| `fields` | inferred | Field definitions passed to the engine; `valueGetter` is allowed on the server |
| `key` | first field | Key field of drill-through `write` requests |
| `types`, `dict` | inferred, none | Wire types and dictionary encoding of drill-through rows |
| `maxCells` | 250,000 | Largest window one request may ask for (`pivot/window-too-large`) |
| `facetLimit` | 1,000 | Member list cap |

A database backend answers the same messages with its own queries; the
handler and the engine are the specification of the expected numbers.

## The client

`createJsonPivotSource()` in `@salmonui/data/json` sends the requests,
with the same transports, cache, dedupe and retry policy as
`createJsonDataSource`. `source.createEngine()` returns the remote engine:
a store with `subscribe()` and `getSnapshot()` whose snapshot reads like a
`PivotResult` over the windows loaded so far.

```ts
import { createJsonPivotSource } from '@salmonui/data/json';

const source = createJsonPivotSource({ url: '/api/pivot' });
const engine = source.createEngine({
  model: {
    rows: [{ field: 'Region' }, { field: 'Country' }],
    columns: [{ field: 'Year' }],
    values: [{ field: 'Amount', aggregate: 'sum' }],
    formats: { Amount: { number: { style: 'currency', currency: 'USD' } } },
  },
  window: { rows: [0, 60], columns: [0, 20] },
});

engine.subscribe(() => render(engine.getSnapshot()));
await engine.refresh();
await engine.setWindow({ rows: [60, 120], columns: [0, 20] }); // scroll
await engine.expand(['rows', 'Asia']); // drill: a new model.expanded
const page = await engine.drillThrough(3, 2, { page: { offset: 0, limit: 100 } });
const members = await engine.getMembers('Country', { search: 'ja' });
```

- `setWindow()` adds `overscan` (default 40 rows, 10 columns) and asks only
  for cells (`headers: false`) while the window stays inside the header
  nodes already held; a window that is already loaded sends nothing. When
  the server's result version changed in the meantime, the headers are
  reloaded.
- A new model or window aborts the previous `pivot` request; drill-through
  requests are never aborted by scrolling.
- Formats and conditional formats are applied on the client to the
  returned numbers (`formatValue` replaces the default `Intl.NumberFormat`).
- Members come from the existing `facet` request, filtered by the other
  fields' member filters; keys are typed by the field's wire type.

### In the pivot table

Pass the remote engine to `usePivot()` (or `PivotTable`) through
`createEngine`. The table loads the windows it renders, the axis bar and
the member editor read members through `facet`, drill through loads a page
of raw rows, and the export writers page through the server result. Give
`fields` definitions: the field list and the axis bar read captions and
types from them, since the rows stay on the server.

```tsx
import { createJsonPivotSource } from '@salmonui/data/json';
import type { WirePivotModel } from '@salmonui/data';
import { PivotTable, usePivot } from '@salmonui/pivot-table';

const [source] = useState(() => createJsonPivotSource({ url: '/api/pivot', headers: () => ({ authorization: `Bearer ${token()}` }) }));
const pivot = usePivot({ fields, defaultPivotModel: model, createEngine: (o) => source.createEngine({ model: o.model as WirePivotModel }) });

<PivotTable pivot={pivot} axisBar drillThrough renderLoading={() => 'Aggregating on the server…'} />
```

`createEngine` is read when the store is created. The server renders the
loading state and the first request starts after hydration. Drill-through
editing writes nothing remotely (`editing` needs local `data`).

### What the snapshot does not have

Raw rows stay on the server, so a remote snapshot differs from a local
`PivotResult` in a few documented ways: `rowsAt()` is empty and
`cell.rowCount` is 0 (use `engine.drillThrough()`), `rawValue` equals
`value`, the header trees hold the nodes of the loaded windows only, and
`memberAt()` or `valueAt()` outside them return a placeholder header and
`null` (`snapshot.isLoaded(row, column)` tells). Members of grouped fields
(`groups`) are the raw field values.

### Custom aggregators stay local

A value field with `aggregate: 'custom'` uses a function that cannot run on
the server. The source rejects such a model with a `ProtocolError` whose
`code` is `pivot/unsupported-aggregate` before anything is sent. Use a
built-in aggregate or a calculated field (formulas run on the server).

## Auth and request hooks

Authentication and request hooks are the source's options:

```ts
const source = createJsonPivotSource({
  url: '/api/pivot',
  headers: () => ({ authorization: `Bearer ${session.token}` }), // read per request
  onRequest: ({ kind, request }) => {
    if (kind === 'pivot') audit(request); // return false to cancel
  },
  onResponse: ({ response }) => undefined, // return an object to replace the response
  onError: ({ error }) => report(error),
});
```

For request signing, token refresh or a non-HTTP channel, pass a
`transport` (`(request, { signal }) => Promise<response>`); it sees and may
rewrite every payload. `kind` is `pivot` for windows and drill through and
`facet` for member lists.

## Backends

Every Salmon UI source speaks one JSON protocol, so the pivot,
the Data Grid and the other data components share one transport, cache and
retry policy for every backend. Database access is server
code, written as the reference handler shows.

For a small table, load the raw rows with any `@salmonui/data`
source (or your own `fetch`) and pass them as `data`; for an OData or Web
API backend, write a `transport` that maps the request, as the
[OData bridge demo](/demos/data-grid/odata-bridge) does for the Data Grid. For large data, implement the `pivot` request kind
on the server (or run the reference handler) and use
`createJsonPivotSource()` as above.

## Cubes and OLAP sources

Salmon UI has no OLAP mode. OLAP needs an XMLA SOAP
client, MDX generation, SSAS authentication and roles, and cube metadata.
That is a separate product line for a narrow audience that cannot be
verified without an SSAS server. Relational data of any size
is covered by the client engine and the `pivot` request kind, which a
server can implement over a cube or a warehouse:

- Serve the cube's data through a `pivot` endpoint, or as flattened raw
  rows.
- Measures, dimensions, hierarchies and levels become `fields`, with
  `folder` for grouping in the field list and date `groups` for levels.
- Calculated members become `calculatedFields` formulas over aggregated
  measures.
- Authentication and roles are enforced in your `pivot` endpoint.
- Large results use the built-in virtualization, and
  `drillThrough={{ maxRows }}` limits the drill-through rows.
- To inspect the query, read the serializable `pivotModel`.
