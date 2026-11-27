---
title: Data sources
description: Local arrays, the Salmon UI JSON protocol, offline, live and application-controlled data sources.
category: Data Binding
order: 100
demos: [remote-json, odata-bridge, remote-editing, offline-data, live-data, cell-updates, controlled-data, empty-state, loading-indicator]
---

The grid reads rows through one structural data-source contract. A local
array is the simplest source; every other source implements the
same contract, including user-written ones. The current query
(sorting, filters, search, grouping, aggregates, paging and expansion) is a
serializable descriptor, and a grid can start from an initial
query (see [Initial query](#initial-query)).

```tsx
import { DataGrid } from '@salmonui/data-grid';
import { createJsonDataSource } from '@salmonui/data';

const orders = createJsonDataSource<Order>({ url: '/api/orders', key: 'id', fields: ['id', 'customer', 'total'] });

<DataGrid data={orders} columns={columns} sorting paging aria-label="Orders" />;
```

`data` takes either an array (reactive: a new array replaces the rows) or a
`DataSource`, which is read once on mount.

## Remote: the Salmon UI JSON protocol

Remote sources speak one JSON protocol over a pluggable transport.
The protocol does not send one object per row: a `{ result, count }`
shape costs payload and per-row decode
work, while tuples with dictionary encoding measure about a third of its
payload and decode time. To use an existing endpoint, expose one that
speaks the protocol, or give `createJsonDataSource` a `transport` that calls
the existing endpoint and maps its rows to tuple `rows` and `total`.
Rows travel as tuples with optional dictionaries; sorting, filtering and
grouping run on the server; results can include server-side
aggregates. Every request carries an abort signal and a version
stamp, so a stale response never overwrites a newer one. With
infinite paging the source loads blocks on demand and keeps a bounded block
cache.

The demo endpoint runs the reference handler from `@salmonui/data/server`
(`createJsonQueryHandler`) over an in-memory table. Salmon UI ships no
Entity Framework, Dapper or SQL server samples: the contract is the wire protocol, not a server stack, so a
real backend ports the handler's query semantics to its ORM or SQL, or the
client supplies a custom `transport`.

<!-- demo: remote-json -->

### Request and response hooks

`createJsonDataSource` takes three hooks, each called with the request
`kind` (`read`, `prefetch`, `group`, `tree`, `facet` or `write`) and the
protocol `request`:

- `onRequest(event)` runs before a request is sent. Returning `false`
  cancels it: the read rejects with `RequestCanceledError` and nothing is
  sent.
- `onResponse(event)` runs with every successful `response` (and its
  `durationMs`) before the source decodes it into rows. It can observe or
  transform: returning a
  response object replaces the response for that request, so it can
  rewrite rows, dictionaries, `total` or aggregates; returning nothing (or
  any non-object) keeps the server response. Return a new object instead of
  mutating `event.response`: the cache keeps the server response, and a
  cache hit runs the hook again.
- `onError(event)` runs when a request fails (not when it is aborted).

```ts
const source = createJsonDataSource<Order>({
  url: '/api/orders',
  key: 'id',
  onRequest: (e) => e.kind !== 'prefetch' || navigator.onLine,
  onResponse: (e) =>
    e.kind === 'read' && 'rows' in e.response
      ? { ...e.response, rows: e.response.rows.filter((row) => row[0] !== null) }
      : undefined,
});
```

The grid-level `onViewChange` fires after the new
rows are rendered, for every source, with a `reason` of `data`, `sort`,
`filter`, `search`, `group`, `page` or `refresh`. The hooks above belong to
the JSON source only; the other sources need none: a controlled source
already returns the rows from `onQueryChange`, a local array is the data,
and a custom `transport` can rewrite responses for any protocol. The demo
logs every request and response.

## Other protocols: a custom transport

`@salmonui/data` has no built-in Web API, OData or GraphQL client:
.NET request shapes, an OData encoder, parser and
`$batch` writer, or a schema-specific GraphQL query builder would ship in
every bundle that imports `@salmonui/data`, against its 25 KB budget.
`createJsonDataSource` takes a `transport`
function instead of a `url`: it receives each protocol request (`query`
with `sort`, `where`, `search`, `page`, `select`) and resolves with a
protocol response (`fields`, tuple `rows`, `total`). A transport that maps
the query to `$orderby` / `$skip` / `$top` / `$count` and the OData
`value` back to tuples is an OData bridge; the same function can post the
request as a GraphQL variable or call a Web API action (for OData v2/v3,
read `total` from `$inlinecount`; an OData `$batch` submit becomes one
`write` request). Paging, caching, abort and stale-response handling stay in
the data source.

<!-- demo: odata-bridge -->

## Initial query

There is no separate query object prop: each feature owns its
state as a reactive options prop with before and after events, and a second
query builder would duplicate that state, conflict with it and add a query
DSL to the core bundle. The initial `sorting.sortBy`, `filtering.filters`,
`search.text`, `grouping.groupBy` and `paging.page` / `pageSize` form the
initial query, which is sent to remote sources on the first read. Remote
column selection is the source's `fields`; extra request parameters
(`addParams`) go through its `headers` or a custom `transport`.

```tsx
<DataGrid
  data={orders}
  columns={columns}
  filtering={{ filters: [{ field: 'Status', operator: 'equal', value: 'Open' }] }}
  sorting={{ sortBy: [{ field: 'OrderDate', direction: 'desc' }] }}
  paging={{ pageSize: 20 }}
/>
```

## Remote editing

With `editing`, saves go to `dataSource.write`: a JSON source sends one
`{ v: 1, write }` request per save with the added rows, the changed cells
of each row and the removed keys. Batch mode collects every
pending change into that single request. A rejected write keeps the
pending changes as drafts with the error message as their row error, so
the user can retry the save; row and cell errors returned by the server
mark only the affected rows and cells.

<!-- demo: remote-editing -->

## Offline

An offline source loads a full array once, then queries it locally.

<!-- demo: offline-data -->

## Live streams

A live source combines a snapshot with a stream of patches (upserts,
removals, appends) applied by row id, so updates do not refresh the whole
grid.

<!-- demo: live-data -->

## Silent updates through the API

`api.setCellValue(rowId, field, value)` and `api.setRowData(rowId, row)`
change one cell or one row in place, without the edit lifecycle (no
`onBeforeCellValueChange`, no validation, no dirty mark) and without
refreshing the grid: only the touched row re-renders. Both
return a `DataGridActionResult`. They need no `editing` prop: they replace
the row of a local source, and the demo grid has no editing at all.

<!-- demo: cell-updates -->

## Application-controlled

A controlled source hands each query to the application, which returns the
rows. Saves go to `onDataChange` with the same `WriteRequest`
a remote source receives; the application persists
them and returns a `WriteResult`. Both are options of
`createControlledDataSource`, not `DataGrid` props. When the write settles,
the grid shows the rows the application applied (the rows echoed in the
`WriteResult`, else the request rows) without a re-read; rows the result
reports as failed keep their previous values.

The controlled source is also the integration point for state libraries:
Salmon UI ships no Redux sample (state library samples are not
library features); keep the rows in the store and answer `onQueryChange` and `onDataChange` from it, or
pass the store's rows to `data` and the query to the controlled feature
props (`sorting.sortBy`, `filtering.filters`, `paging.page`).

<!-- demo: controlled-data -->

## Empty state

With no rows the body shows one empty row. `renderEmpty({ reason })`
replaces its content; `reason` is `'noData'` when the source has no rows
and `'noMatch'` when the query filters every row out. Without it the grid
shows `localeText.noRows`.

<!-- demo: empty-state -->

## Loading indicator and refresh

While the source loads, an overlay covers the body: a spinner by default,
or skeleton rows with `loadingIndicator: 'skeleton'`. The overlay
element is `.salmon-data-grid-loading` (the `loading` part of `classNames` and
`styles`) and is `aria-hidden`; the grid root carries `aria-busy`, and the
polite live region announces "Loading" after 400 ms and "Loaded {n} rows"
once the rows arrive. The empty-state row stays hidden while the source
loads. `renderLoading({ phase })` replaces the overlay content; `phase` is
`'initial'` before the first result, `'page'` while a page change loads and
`'refresh'` otherwise. `api.setLoading(true)` / `api.setLoading(false)`
show and hide the indicator by hand; a data load in progress shows it
regardless.

`api.refresh()` re-reads the data
with the current query and keeps sorting, filters, grouping, the page, the
selection and the scroll position. A local array mutated in place renders
its new values; a remote source is re-read past its cache. `onViewChange`
reports the result with `reason: 'refresh'`, and while an asynchronous read
is in flight the indicator shows with phase `'refresh'`. There is no
`refreshColumns()`: columns are a prop.

<!-- demo: loading-indicator -->

## API reference

The sources are [`createJsonDataSource`](/docs/reference/data/json/createJsonDataSource),
[`createOfflineDataSource`](/docs/reference/data/local/createOfflineDataSource),
[`createLiveDataSource`](/docs/reference/data/stream/createLiveDataSource) and
[`createControlledDataSource`](/docs/reference/data/createControlledDataSource)
from `@salmonui/data`; the reference handler is
[`createJsonQueryHandler`](/docs/reference/data/server/createJsonQueryHandler)
from `@salmonui/data/server`. A custom source implements
[`DataSource`](/docs/reference/data-grid/engine/DataSource).