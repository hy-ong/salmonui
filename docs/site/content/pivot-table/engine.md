---
title: Pivot engine
description: The framework-agnostic pivot engine at @salmonui/pivot-table/engine — report model, local and CSV data, field definitions, the result accessors, incremental data updates, time slicing and the Worker host.
category: Engine
order: 100
demos: [pivot-table-data-binding]
---

`PivotTable` is rendered from a `PivotResult` computed by the pivot engine,
`@salmonui/pivot-table/engine`. The engine has no React and no DOM code and
no dependencies, so the same code runs on the main thread, in a Worker, during
SSR and on a server. No Data Grid entry imports it, so a `DataGrid` bundle
contains no pivot code.

```ts
import { createPivotEngine } from '@salmonui/pivot-table/engine';

const pivot = createPivotEngine({
  data: sales, // raw rows, read in place (never copied)
  model: {
    rows: [{ field: 'region' }, { field: 'country' }],
    columns: [{ field: 'year' }],
    values: [{ field: 'amount', aggregate: 'sum' }],
  },
});
const result = pivot.getSnapshot();
result.valueAt(0, 0); // Grand totals, members and subtotals are all positions
```

## Report model

`pivotModel` is plain JSON without the data: `rows`, `columns`, `values` and `filters` hold the placed
fields, and `filterBy`, `sort`, `valueSort`, `groups`, `calculatedFields`,
`formats`, `conditionalFormats`, `expanded`, `totals`, `valuesPlacement`,
`showEmptyMembers` and `showValueHeader` hold the rest. You can pass a partial
model; `normalizePivotModel()` fills in every default and returns a deeply
frozen model, and normalizing a normalized model returns an equal one.
`stableStringifyModel()` returns key-sorted JSON with the default-valued
fields left out, which works as a cache key or a URL parameter.

A `filterBy` entry applies only when its field is placed on the rows, columns
or filters axis. If you remove a field from
the filters axis, its filter stops applying.

## Data

`data` is an array of row objects, read by reference: `getRawRows()` and
`drillThrough()` return the same objects you passed in. Missing values (`null`,
`undefined`, `''`) are grouped under one `(Blank)` member.

CSV text becomes rows with `parseCsv(text, { delimiter, header, types })`. The
parser follows RFC 4180: quoted fields, `""` escapes, CRLF line endings and a
byte order mark are handled. A column whose values are all numeric becomes
`number` unless `types` names another type (`'string'`, `'number'`, `'date'`,
`'boolean'`). There is no CSV prop.

```ts
import { parseCsv } from '@salmonui/pivot-table'; // re-exported from @salmonui/pivot-table/engine

const rows = parseCsv(await (await fetch('/sales.csv')).text(), { types: { year: 'string' } });
```

In React, pass the rows as `data` to `usePivot()` or `PivotTable`. A new
array re-aggregates (see [Data updates](#data-updates)); mutating the
array in place does not, so call `api.refresh()` (or `pivot.refresh()`)
after an in-place change.

## Field definitions

`fields` describes the source fields. Each definition
can set `caption`, `type` (inferred from the first non-empty value when
omitted), `folder` (a field list folder), `hidden` (left out of the field
list), the per-field `sortable`, `filterable`, `removable` and
`draggable` flags, and a `valueGetter(row)` for computed fields. When you omit
`fields`, the engine infers them from the keys of the first rows.
The definitions are read when the store is created. `getFields()` returns the resolved definitions with their `memberCount`, and
`getMembers(field, { search, limit })` lists the members in display order with
their row counts. The member editor uses both.

## The result

`getSnapshot()` returns an immutable `PivotResult`, and its identity changes
only when the result changes, so it works as a `useSyncExternalStore`
snapshot. `subscribe()` notifies listeners on every change.

| Accessor | Returns |
| --- | --- |
| `rowCount`, `columnCount` | Visible row and column positions (members, subtotals, grand totals, value rows) |
| `rowTree`, `columnTree`, `rowDepth`, `columnDepth` | Header trees. Each `PivotHeaderNode` has `key`, `kind`, `path`, `field`, `measure`, `label`, `depth`, `position` / `span` over the leaf positions, `expandable` and `expanded` |
| `memberAt(axis, i)` | The header node of a position |
| `valueAt(r, c)` | The value shown: aggregate, then calculated field, then show values as, then `getCellValue` |
| `cellAt(r, c)` | `PivotCell`: keys, measure, `value`, `rawValue`, `formattedValue`, `kind`, `rowCount` |
| `rowsAt(r, c)` | Indexes of the raw rows behind a cell (drill through) |

Header nodes and cells are created only when you read them, so a result with
50,000 × 500 cells never allocates 25 million objects.

Header keys are the JSON array of the member path: `'["Asia","Japan"]'`. The
grand total is `''`. A leaf on the axis that carries the values gets
`|<measure id>` appended (`'["Asia"]|amount'`, `'|amount'` for the grand
total column). A value header that has members under it is
`<path>||<measure id>`. A subtotal header that has value children, and a
subtotal row in `subPosition: 'end'`, is `<path>|total`. Cell selection keys
are `rowKey|columnKey`. The measure id is the value field's `field`, or
`field#aggregate` when two value fields share a field (see
[Aggregation](/docs/pivot-table/aggregation)).

## Commands

`setModel(input | (model) => input)`, `expand(path)` / `collapse(path)` with
paths such as `['rows', 'Asia']`, `expandAll(axis?)` / `collapseAll(axis?)`,
`setData(rows)`, `refresh()` and `destroy()`. Each command returns the new
result. A model equal to the current one does nothing.

- Expanding a member aggregates only that member's rows. Collapsing it changes
  only the view.
- A member filter on a row field recomputes only the members it changes.
- Values do not depend on the order of earlier commands: the same model and
  data give bit-identical numbers whether you reach them by drilling,
  filtering or computing from scratch.

## Data updates

`setData(next)` compares `next` with the previous array by row reference. If
only a few rows were replaced (up to 1/64 of the rows), or rows were only
appended, the engine re-encodes just those rows and recomputes only the
members whose rows changed. Any other change, and any change while a value
filter is active, recomputes everything. `refresh()` always recomputes from
scratch.

## Time slicing, SSR and Workers

- `computePivot(options)` is a one-shot, synchronous compute for SSR and
  servers.
- `createPivotJob(options).run(budgetMs)` works in slices of about
  `budgetMs` milliseconds and returns `{ done, progress }`. Call `result()`
  once it is done.
- `createPivotWorkerEngine(worker, options)` runs the engine in a Worker. The
  application creates the Worker, because bundlers differ:

```ts
const worker = new Worker(new URL('@salmonui/pivot-table/engine/worker', import.meta.url), { type: 'module' });
const pivot = createPivotWorkerEngine(worker, { data, model });
await pivot.ready;
const view = await pivot.getWindow({ rowStart: 0, rowEnd: 40, columnStart: 0, columnEnd: 20 });
```

The raw rows are sent once, in chunks of `chunkSize` rows (20,000 by default),
and the worker acknowledges each chunk. After that only summaries, windows,
member lists and drill-through rows cross the boundary. A window holds the
leaf headers, the header nodes overlapping the window (without children) and
the cells. Calls run in order, so a functional `setModel` sees the model left
by the calls before it. `getStatus()` returns `idle`, `computing`, `ready` or
`error`. To use another host, such as `node:worker_threads`, call
`attachPivotWorker(scope)` (from `@salmonui/pivot-table/engine/worker`)
in the worker entry with an adapter over `parentPort`.

In React, pass the Worker as `worker` to `usePivot()` or `PivotTable`
(read when the store is created); the table then loads only the windows it
renders. A Worker exists only in the browser, so create it in the
component that calls `usePivot()` and render that component on the client
only (after a mounted flag, or a client-only dynamic import): the server
HTML and the first client render then agree.

## Performance

On the 1,000,000-row `pivot` fixture (3 row fields, 2 column fields, 2 value
fields), the engine computes the initial result in about 0.3 s in-process and
about 1 s through a Worker, transfer included. Drilling takes under 10 ms, a
member filter under 100 ms and a sort under 5 ms. These are release gates.
